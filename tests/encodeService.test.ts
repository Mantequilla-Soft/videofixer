import { describe, expect, it } from 'vitest';
import { selectProfiles } from '../src/services/EncodeService';

describe('selectProfiles', () => {
  it('always uses 480p only for short videos, even when premium', () => {
    expect(selectProfiles(true, true, 1080)).toEqual([{ name: '480p', height: 480 }]);
  });

  it('uses 480p only for free (non-premium), non-short videos', () => {
    expect(selectProfiles(false, false, 1080)).toEqual([{ name: '480p', height: 480 }]);
  });

  it('uses the full ladder for premium, non-short videos with a tall enough source', () => {
    expect(selectProfiles(false, true, 1080)).toEqual([
      { name: '1080p', height: 1080 },
      { name: '720p', height: 720 },
      { name: '480p', height: 480 },
    ]);
  });

  it('filters the ladder down to the source resolution for premium videos', () => {
    expect(selectProfiles(false, true, 720)).toEqual([
      { name: '720p', height: 720 },
      { name: '480p', height: 480 },
    ]);
  });

  it('falls back to 480p for premium videos whose source is smaller than every profile', () => {
    expect(selectProfiles(false, true, 240)).toEqual([{ name: '480p', height: 480 }]);
  });
});
