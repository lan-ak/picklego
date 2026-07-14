/**
 * Phone normalization, shared by the callable functions and the Meta Conversions API.
 *
 * There were three copies of this before, and they disagreed. The one in meta/capi.ts
 * stripped to digits WITHOUT prepending a country code, so a US number stored as
 * "5551234567" hashed to something Meta could never match against "15551234567" — the
 * Advanced Matching signal was silently worthless for the default country.
 *
 * Mirrors src/utils/phone.ts on the client. Both must agree, because the client hashes
 * phone numbers for contact lookup and the server hashes them for Meta; a divergence is
 * invisible until match rates are inspected, which is to say: never.
 */

/**
 * Digits only, with a country code.
 *
 * The bare 10-digit case assumes +1. That is an assumption, but it is the same assumption
 * the client's legacy path makes, and it beats emitting a number with no country code at
 * all — which is what Meta rejects.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
}
