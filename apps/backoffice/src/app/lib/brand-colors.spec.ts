import { normalizeHex, rgbToHex, suggestFromBrand, suggestFromImageData, uniqueSuggestions } from './brand-colors';

describe('brand-colors', () => {
  it('normalizes 6-digit hex and rejects invalid values', () => {
    expect(normalizeHex('#ff5733')).toBe('#FF5733');
    expect(normalizeHex('112233')).toBe('#112233');
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });

  it('converts rgb samples to hex', () => {
    expect(rgbToHex(255, 87, 51)).toBe('#FF5733');
  });

  it('suggests the tenant brand colors without inventing extras', () => {
    expect(suggestFromBrand('#112233', '#FFFFFF')).toEqual(['#112233', '#FFFFFF']);
    expect(suggestFromBrand('#112233', '#112233')).toEqual(['#112233']);
  });

  it('averages opaque non-white pixels from image data', () => {
    const data = new Uint8ClampedArray([
      10, 20, 30, 255,
      10, 20, 30, 255,
      255, 255, 255, 255,
      0, 0, 0, 0,
    ]);
    expect(suggestFromImageData(data)).toEqual(['#0A141E']);
  });

  it('dedupes suggestion groups', () => {
    expect(uniqueSuggestions(['#112233'], ['#112233', '#ABCDEF'])).toEqual(['#112233', '#ABCDEF']);
  });
});
