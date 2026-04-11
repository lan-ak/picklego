import * as Crypto from 'expo-crypto';

export const PHONE_REGEX = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;

/**
 * Normalize a phone number to digits-only with country code.
 *
 * With `dialCode`: strips non-digits, prepends dial code if not already present.
 * Without `dialCode`: legacy US-assumption logic (backward compatible).
 */
export function normalizePhone(phone: string, dialCode?: string): string {
  const digits = phone.replace(/\D/g, '');

  if (dialCode) {
    const dialDigits = dialCode.replace(/\D/g, '');
    if (digits.startsWith(dialDigits)) return digits;
    return dialDigits + digits;
  }

  // Legacy US-assumption path (no dialCode provided)
  if (digits.length === 10) return '1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
}

export async function hashPhone(normalizedPhone: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    normalizedPhone,
  );
}

/**
 * Format a normalized phone (digits-only) for display.
 * US (11 digits starting with 1): "+1 (555) 123-4567"
 * Others: "+XX XXXX XXXX" grouped in blocks of 4.
 */
export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // International: best-effort grouping
  if (digits.length > 4) {
    // Try to show as +{code} {rest in groups of 4}
    const rest = digits;
    const groups: string[] = [];
    for (let i = 0; i < rest.length; i += 4) {
      groups.push(rest.slice(i, i + 4));
    }
    return `+${groups.join(' ')}`;
  }
  return phone;
}

/**
 * Format phone input as the user types.
 *
 * US (dialCode "1" or omitted): "(555) 123-4567"
 * Others: digits grouped generically, capped at 15 digits (E.164 max).
 */
export function formatPhoneInput(text: string, dialCode?: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 0) return '';

  const isUS = !dialCode || dialCode === '1';

  if (isUS) {
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  // International: just allow digits, capped at 15
  return digits.slice(0, 15);
}

/**
 * Validate a phone number.
 *
 * US (dialCode "1" or omitted): existing regex.
 * Others: digit count between 4 and 15.
 */
export function isValidPhone(phone: string, dialCode?: string): boolean {
  const isUS = !dialCode || dialCode === '1';

  if (isUS) {
    return PHONE_REGEX.test(phone.trim());
  }

  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 && digits.length <= 15;
}
