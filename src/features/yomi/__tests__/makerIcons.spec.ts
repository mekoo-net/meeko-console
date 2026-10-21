import { describe, expect, it } from 'vitest';

import { KNOWN_MAKERS } from '@yomi/common';

import { hasMakerIcon, makerIconSrc } from '../model/makerIcons';

describe('makerIcons', () => {
  it('every known maker has a brand SVG, not the generic fallback', () => {
    const fallback = makerIconSrc('other');
    for (const m of KNOWN_MAKERS) {
      expect(hasMakerIcon(m.key), m.key).toBe(true);
      expect(makerIconSrc(m.key), m.key).not.toBe(fallback);
    }
  });

  it('maps product-name aliases used by upstream catalogs', () => {
    expect(makerIconSrc('claude')).toBe(makerIconSrc('anthropic'));
    expect(makerIconSrc('gemini')).toBe(makerIconSrc('google'));
    expect(makerIconSrc('kimi')).toBe(makerIconSrc('moonshot'));
  });

  it('unknown makers use the generic mark, not letter initials', () => {
    expect(hasMakerIcon('totally-unknown-lab')).toBe(false);
    expect(makerIconSrc('totally-unknown-lab')).toBe(makerIconSrc('other'));
  });
});
