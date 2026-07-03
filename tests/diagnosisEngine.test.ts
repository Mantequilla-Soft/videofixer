import { describe, expect, it } from 'vitest';
import { diagnose } from '../src/services/DiagnosisEngine';
import { ProbeResult } from '../src/types';

function cleanProbe(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    codec: 'h264',
    pix_fmt: 'yuv420p',
    color_range: 'tv',
    resolution: { width: 480, height: 480 },
    alignment_ok: true,
    has_audio: true,
    audio_codec: 'aac',
    duration_seconds: 30,
    corrupt: false,
    ffprobe_error: null,
    ...overrides,
  };
}

describe('diagnose', () => {
  it('flags nothing for a clean, fully compliant probe', () => {
    const result = diagnose(cleanProbe());
    expect(result.diagnosis).toBe('no-issues-detected');
    expect(result.flags).toEqual([]);
    expect(result.fixable).toBe(true);
  });

  it('flags missing-audio when there is no audio stream', () => {
    const result = diagnose(cleanProbe({ has_audio: false, audio_codec: null }));
    expect(result.diagnosis).toBe('missing-audio');
    expect(result.flags).toEqual(['missing-audio']);
    expect(result.fixable).toBe(true);
  });

  it('flags full-range-color via color_range="pc"', () => {
    const result = diagnose(cleanProbe({ color_range: 'pc' }));
    expect(result.flags).toContain('full-range-color');
  });

  it('flags full-range-color via a yuvj-prefixed pix_fmt even without color_range set', () => {
    const result = diagnose(cleanProbe({ color_range: null, pix_fmt: 'yuvj420p' }));
    expect(result.diagnosis).toBe('full-range-color');
    expect(result.flags).toEqual(['full-range-color']);
  });

  it('flags misaligned-resolution when alignment_ok is false', () => {
    const result = diagnose(cleanProbe({ alignment_ok: false, resolution: { width: 270, height: 480 } }));
    expect(result.diagnosis).toBe('misaligned-resolution');
    expect(result.flags).toEqual(['misaligned-resolution']);
  });

  it('reports multiple-issues when more than one flag applies', () => {
    const result = diagnose(cleanProbe({ has_audio: false, color_range: 'pc', alignment_ok: false }));
    expect(result.diagnosis).toBe('multiple-issues');
    expect(result.flags).toEqual(['missing-audio', 'full-range-color', 'misaligned-resolution']);
    expect(result.fixable).toBe(true);
  });

  it('reports corrupt-input and fixable=false when probe.corrupt is true, regardless of other fields', () => {
    const result = diagnose(cleanProbe({ corrupt: true, ffprobe_error: 'zero frames decoded' }));
    expect(result.diagnosis).toBe('corrupt-input');
    expect(result.flags).toEqual([]);
    expect(result.fixable).toBe(false);
  });

  it('reports corrupt-input when there is no video stream (resolution is null), even if corrupt=false', () => {
    const result = diagnose(cleanProbe({ corrupt: false, resolution: null }));
    expect(result.diagnosis).toBe('corrupt-input');
    expect(result.fixable).toBe(false);
  });
});
