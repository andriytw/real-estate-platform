/** Deterministic international phone rules for offer WhatsApp + storage. */

export const MIN_INTERNATIONAL_DIGITS = 8;
export const MAX_INTERNATIONAL_DIGITS = 15;

const WA_ERROR = 'Customer phone number is missing or invalid.';

/** Allow only optional leading "+" then digits (strip everything else). */
export function sanitizeInternationalPhoneInput(raw: string): string {
  const s = raw ?? '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '+' && out.length === 0) {
      out += '+';
    } else if (c >= '0' && c <= '9') {
      out += c;
    }
  }
  return out;
}

/** Digits only (no "+"). */
export function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/** Canonical stored form: "+" + digits, or "" if no digits. */
export function toCanonicalStoredPhone(sanitized: string): string {
  const d = digitsOnly(sanitized);
  if (!d) return '';
  return `+${d}`;
}

/** Normalize messy legacy strings (spaces, dashes) to canonical +digits. */
export function canonicalizeFromLegacy(legacy: string): string {
  return toCanonicalStoredPhone(legacy);
}

export function countDigits(value: string): number {
  return digitsOnly(value).length;
}

export function isValidInternationalPhoneForWhatsApp(canonicalOrLegacy: string): boolean {
  const n = countDigits(canonicalOrLegacy);
  return n >= MIN_INTERNATIONAL_DIGITS && n <= MAX_INTERNATIONAL_DIGITS;
}

/** WhatsApp click-to-chat: digits only, no "+". Null if length invalid. */
export function toWhatsAppDigits(canonicalOrLegacy: string): string | null {
  const d = digitsOnly(canonicalOrLegacy);
  if (d.length < MIN_INTERNATIONAL_DIGITS || d.length > MAX_INTERNATIONAL_DIGITS) return null;
  return d;
}

export const whatsappPhoneValidationMessage = WA_ERROR;
