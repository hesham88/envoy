import { describe, expect, it } from 'vitest';
import { normalizeDigits } from './normalize';

describe('normalizeDigits', () => {
  it('turns Arabic-Indic and Eastern Arabic-Indic digits into ASCII', () => {
    expect(normalizeDigits('٢٠٢٤').text).toBe('2024');
    expect(normalizeDigits('۱۲۳').text).toBe('123');
  });

  it('leaves ASCII text alone', () => {
    const out = normalizeDigits('Rent EGP 8,500');
    expect(out.text).toBe('Rent EGP 8,500');
    expect(out.toOriginal(5)).toBe(5);
  });

  it('maps offsets back to the original text', () => {
    const src = 'ID ٢٩٥٠ end';
    const out = normalizeDigits(src);
    const i = out.text.indexOf('2950');
    expect(src.slice(out.toOriginal(i), out.toOriginal(i + 4))).toBe('٢٩٥٠');
  });
});
