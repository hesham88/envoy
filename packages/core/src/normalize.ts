const ARABIC_INDIC = 0x0660; // ٠
const EASTERN_ARABIC_INDIC = 0x06f0; // ۰

/**
 * Converts Arabic-Indic and Eastern Arabic-Indic digits to ASCII for matching.
 * Each digit is one UTF-16 unit on both sides, so offsets are preserved; `toOriginal` is kept
 * as the contract in case a future normalisation changes lengths.
 */
export function normalizeDigits(text: string): { text: string; toOriginal: (i: number) => number } {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= ARABIC_INDIC && code <= ARABIC_INDIC + 9) out += String(code - ARABIC_INDIC);
    else if (code >= EASTERN_ARABIC_INDIC && code <= EASTERN_ARABIC_INDIC + 9)
      out += String(code - EASTERN_ARABIC_INDIC);
    else out += ch;
  }
  return { text: out, toOriginal: (i) => i };
}
