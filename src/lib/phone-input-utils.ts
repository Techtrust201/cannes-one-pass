/**
 * Nettoie le numéro local saisi dans le champ téléphone (sans indicatif).
 *
 * - Retire le '+' et tout caractère non numérique.
 * - Si le numéro commence par les chiffres de l'indicatif, les retire (évite le doublon +33…).
 * - Retire le préfixe national '0' si l'indicatif est un dial code E.164 standard (1–3 chiffres).
 */
export function sanitizeLocalPhoneNumber(phoneCode: string, raw: string): string {
  const cleanCode = phoneCode.replace(/[^0-9]/g, "");
  let digits = raw.replace(/[^0-9]/g, "");

  if (cleanCode && digits.startsWith(cleanCode)) {
    digits = digits.slice(cleanCode.length);
  }

  const isStandardDialCode = cleanCode.length >= 1 && cleanCode.length <= 3;
  if (isStandardDialCode && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits;
}
