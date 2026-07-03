import fs from 'fs/promises';
import path from 'path';

interface ProfileSpec {
  name: string;
  bandwidth: number;
  resolution: string;
  codecs: string;
}

// Ported from 3SpeakEncoderNew/src/services/VideoProcessor.ts createMasterPlaylist().
// videofixer's baseline pipeline always guarantees an audio track (real or
// injected silence), so CODECS can unconditionally include mp4a.40.2 without
// risking the "manifest declares audio that isn't in the stream" bug class.
const PROFILE_SPECS: ProfileSpec[] = [
  { name: '1080p', bandwidth: 6500000, resolution: '1920x1080', codecs: 'avc1.640028,mp4a.40.2' },
  { name: '720p', bandwidth: 3500000, resolution: '1280x720', codecs: 'avc1.64001F,mp4a.40.2' },
  { name: '480p', bandwidth: 1800000, resolution: '854x480', codecs: 'avc1.4D401F,mp4a.40.2' },
];

export class ManifestBuilder {
  async buildMasterManifest(profilesEncoded: string[], outputDir: string): Promise<void> {
    let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n';

    for (const spec of PROFILE_SPECS) {
      if (!profilesEncoded.includes(spec.name)) continue;
      manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${spec.bandwidth},RESOLUTION=${spec.resolution},CODECS="${spec.codecs}"\n`;
      manifest += `${spec.name}/index.m3u8\n`;
    }

    await fs.writeFile(path.join(outputDir, 'manifest.m3u8'), manifest);
  }
}
