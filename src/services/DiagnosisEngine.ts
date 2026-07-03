import { Diagnosis, DiagnosisFlag, DiagnosisResult, ProbeResult } from '../types';

/**
 * Pure function: normalized ffprobe facts -> flags/diagnosis/fixable.
 * Known failure signatures are documented in
 * 3SpeakEncoderNew/internal-docs/internal-doc-encoder-audio-and-color-range-issue.md
 * and internal-doc-encoder-resolution-issue.md.
 */
export function diagnose(probe: ProbeResult): DiagnosisResult {
  if (probe.corrupt || !probe.resolution) {
    return {
      probe,
      flags: [],
      diagnosis: 'corrupt-input',
      fixable: false,
    };
  }

  const flags: DiagnosisFlag[] = [];

  if (!probe.has_audio) {
    flags.push('missing-audio');
  }

  const isFullRange = probe.color_range === 'pc' || (probe.pix_fmt ?? '').startsWith('yuvj');
  if (isFullRange) {
    flags.push('full-range-color');
  }

  if (!probe.alignment_ok) {
    flags.push('misaligned-resolution');
  }

  let diagnosis: Diagnosis;
  if (flags.length === 0) {
    diagnosis = 'no-issues-detected';
  } else if (flags.length === 1) {
    diagnosis = flags[0];
  } else {
    diagnosis = 'multiple-issues';
  }

  return { probe, flags, diagnosis, fixable: true };
}
