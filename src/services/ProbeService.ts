import ffmpeg from 'fluent-ffmpeg';
import { ProbeResult } from '../types';

export interface ProbeOutcome {
  probe: ProbeResult;
  raw: unknown;
}

/**
 * ffprobe wrapper ported from
 * 3SpeakEncoderNew/src/services/VideoProcessor.ts probeInputFile().
 * Never throws — a probe failure is a valid diagnostic result
 * (diagnosis="corrupt-input"), not a server error.
 */
export class ProbeService {
  async probeFile(filePath: string): Promise<ProbeOutcome> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve({
            probe: emptyProbeResult(err.message || String(err)),
            raw: null,
          });
          return;
        }

        try {
          const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
          const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

          if (!videoStream) {
            resolve({
              probe: emptyProbeResult('no decodable video stream found'),
              raw: metadata,
            });
            return;
          }

          const width = videoStream.width ?? 0;
          const height = videoStream.height ?? 0;
          const duration = parseFloat(String(metadata.format?.duration ?? '0'));
          const nbFrames = videoStream.nb_frames ? parseInt(String(videoStream.nb_frames), 10) : null;
          const zeroFrames = nbFrames !== null && nbFrames === 0;
          const noDuration = !duration || duration <= 0;

          const probe: ProbeResult = {
            codec: videoStream.codec_name ?? null,
            pix_fmt: videoStream.pix_fmt ?? null,
            color_range: (videoStream as { color_range?: string }).color_range ?? null,
            resolution: width && height ? { width, height } : null,
            alignment_ok: width % 16 === 0 && height % 16 === 0,
            has_audio: Boolean(audioStream),
            audio_codec: audioStream?.codec_name ?? null,
            duration_seconds: duration || null,
            corrupt: noDuration || zeroFrames,
            ffprobe_error: null,
          };

          resolve({ probe, raw: metadata });
        } catch (parseErr) {
          resolve({
            probe: emptyProbeResult((parseErr as Error).message),
            raw: metadata,
          });
        }
      });
    });
  }
}

function emptyProbeResult(error: string): ProbeResult {
  return {
    codec: null,
    pix_fmt: null,
    color_range: null,
    resolution: null,
    alignment_ok: false,
    has_audio: false,
    audio_codec: null,
    duration_seconds: null,
    corrupt: true,
    ffprobe_error: error,
  };
}
