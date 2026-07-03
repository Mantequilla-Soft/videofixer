import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { ActionTaken, EncodeProfile } from '../types';
import { ManifestBuilder } from './ManifestBuilder';

export class LockedError extends Error {}
export class EncodeFailedError extends Error {}

export interface EncodeOptions {
  short: boolean;
  premium: boolean;
  sourceHeight: number;
  hasAudio: boolean;
}

export interface EncodeOutcome {
  outputDir: string;
  actionTaken: ActionTaken;
}

const ALL_PROFILES: EncodeProfile[] = [
  { name: '1080p', height: 1080 },
  { name: '720p', height: 720 },
  { name: '480p', height: 480 },
];

/**
 * Exact port of 3SpeakEncoderNew/src/services/VideoProcessor.ts's profile
 * selection rule (~line 878-905) — short videos and free/non-short videos
 * both get 480p only; only premium & non-short gets the full ladder. Keeping
 * this identical to production means a re-encoded video doesn't silently
 * change tier economics.
 */
export function selectProfiles(short: boolean, premium: boolean, sourceHeight: number): EncodeProfile[] {
  if (short) return [{ name: '480p', height: 480 }];
  if (!premium) return [{ name: '480p', height: 480 }];

  const filtered = ALL_PROFILES.filter((p) => p.height <= sourceHeight);
  return filtered.length > 0 ? filtered : [{ name: '480p', height: 480 }];
}

export class EncodeService {
  private locks = new Set<string>();
  private manifestBuilder = new ManifestBuilder();

  acquireLock(key: string): void {
    if (this.locks.has(key)) {
      throw new LockedError(`A fix is already in progress for ${key}`);
    }
    this.locks.add(key);
  }

  releaseLock(key: string): void {
    this.locks.delete(key);
  }

  /**
   * Always applies the full corrected baseline pipeline (limited-range
   * color, guaranteed audio track, 16px-aligned resolution, zeroed start
   * PTS) regardless of which specific flags the diagnosis found — cheap
   * and idempotent when already-correct, and avoids a whole class of
   * "partial fix left the other bug in place" failures.
   */
  async encode(inputPath: string, workDir: string, opts: EncodeOptions): Promise<EncodeOutcome> {
    const outputDir = path.join(workDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const profiles = selectProfiles(opts.short, opts.premium, opts.sourceHeight);
    const ffmpegFlags: string[] = [];

    for (const profile of profiles) {
      const profileDir = path.join(outputDir, profile.name);
      await fs.mkdir(profileDir, { recursive: true });
      const { flags } = await this.encodeProfile(inputPath, opts.hasAudio, profile, profileDir);
      ffmpegFlags.push(`[${profile.name}] ${flags.join(' ')}`);
    }

    await this.manifestBuilder.buildMasterManifest(
      profiles.map((p) => p.name),
      outputDir
    );

    const description = [
      'Applied baseline correction: -pix_fmt yuv420p (limited range)',
      opts.hasAudio ? 'normalized existing audio to AAC 128k/48kHz/stereo' : 'injected silent AAC track (source had none)',
      '16px-aligned scale + zeroed start PTS',
    ].join('; ');

    return {
      outputDir,
      actionTaken: {
        description,
        ffmpeg_flags: ffmpegFlags,
        profiles_encoded: profiles.map((p) => p.name),
      },
    };
  }

  private encodeProfile(
    inputPath: string,
    hasAudio: boolean,
    profile: EncodeProfile,
    profileDir: string
  ): Promise<{ flags: string[] }> {
    const alignedHeight = Math.ceil(profile.height / 16) * 16;
    const vf = `setpts=PTS-STARTPTS,scale=-2:${alignedHeight},scale='trunc(iw/16)*16':${alignedHeight}`;
    const segmentPattern = path.join(profileDir, `${profile.name}_%03d.ts`);
    const playlistPath = path.join(profileDir, 'index.m3u8');

    const outputOptions = [
      '-map', '0:v:0',
      '-map', hasAudio ? '0:a:0' : '1:a:0',
      ...(hasAudio ? [] : ['-shortest']),
      '-vf', vf,
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-level', '4.0',
      '-preset', 'veryfast',
      '-crf', '21',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '48000',
      '-f', 'hls',
      '-hls_time', '6',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', segmentPattern,
    ];

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);

      if (!hasAudio) {
        command = command.input('anullsrc=channel_layout=stereo:sample_rate=48000').inputOptions(['-f', 'lavfi']);
      }

      let stderr = '';

      command
        .outputOptions(outputOptions)
        .output(playlistPath)
        .on('stderr', (line: string) => {
          stderr += line + '\n';
        })
        .on('end', () => resolve({ flags: outputOptions }))
        .on('error', (err: Error) => {
          reject(new EncodeFailedError(`ffmpeg failed for ${profile.name}: ${err.message}\n${stderr.slice(-2000)}`));
        })
        .run();
    });
  }
}
