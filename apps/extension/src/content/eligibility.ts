/** Which editable fields Envoy may ever offer its toggle on. Pure and testable:
 *  the "never" list wins over everything else. */

export interface FieldLike {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
  autocomplete?: string;
  name?: string;
  id?: string;
  inputMode?: string;
  maxLength?: number;
  ownerIframes?: number;
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', '']);
const NEVER_AUTOCOMPLETE = /^(cc-|one-time-code)/i;
const NEVER_NAME =
  /(card|cvc|cvv|iban|account|otp|one[-_]?time|verification|security[-_]?code|pin)/i;

export function isEnvoyField(el: FieldLike): boolean {
  const ac = (el.autocomplete ?? '').trim().toLowerCase();
  if (NEVER_AUTOCOMPLETE.test(ac)) return false;
  if (ac.startsWith('cc-')) return false;
  const hint = `${el.name ?? ''} ${el.id ?? ''}`;
  if (NEVER_NAME.test(hint)) return false;
  if ((el.ownerIframes ?? 0) > 0) return false;

  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el.type ?? 'text').toLowerCase();
    if (type === 'password' || type === 'file' || type === 'hidden') return false;
    if (!TEXT_INPUT_TYPES.has(type)) return false;
    // Short numeric fields are usually OTP / PIN boxes even without autocomplete hints.
    if (el.inputMode === 'numeric' && (el.maxLength ?? 99) <= 8) return false;
    return true;
  }
  return !!el.isContentEditable;
}

export function fieldFromElement(el: Element): FieldLike {
  const input = el as HTMLInputElement;
  return {
    tagName: el.tagName,
    type: input.type,
    isContentEditable: (el as HTMLElement).isContentEditable,
    autocomplete: input.autocomplete,
    name: input.name,
    id: el.id,
    inputMode: input.inputMode,
    maxLength: input.maxLength,
    ownerIframes: el.querySelectorAll('iframe').length,
  };
}
