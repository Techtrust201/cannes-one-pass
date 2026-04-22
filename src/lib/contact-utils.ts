/**
 * Formate un numéro de téléphone (indicatif + numéro local) en E.164.
 *
 * Règles :
 * - On retire tout caractère non numérique de l'indicatif et du numéro.
 * - Si le numéro commence par un `0` (trunk prefix national) ET que
 *   l'indicatif est un dial code E.164 valide (1 à 3 chiffres), on retire
 *   le `0`. Sinon on garde le numéro tel quel : cela évite de corrompre
 *   silencieusement des données si le couple (phoneCode, phoneNumber) a été
 *   mal découpé en amont (ex: phoneCode="+3376", phoneNumber="0640775").
 */
export function formatPhoneNumber(phoneCode: string, phoneNumber: string): string {
  const cleanCode = phoneCode.replace(/[^0-9]/g, "");
  let cleanNumber = phoneNumber.replace(/[^0-9]/g, "");
  const isStandardDialCode = cleanCode.length >= 1 && cleanCode.length <= 3;
  if (isStandardDialCode && cleanNumber.startsWith("0")) {
    cleanNumber = cleanNumber.slice(1);
  }
  return `+${cleanCode}${cleanNumber}`;
}

/** Retourne un lien tel: pour appeler le chauffeur */
export function getTelLink(phoneCode: string, phoneNumber: string): string {
  return `tel:${formatPhoneNumber(phoneCode, phoneNumber)}`;
}

/** Retourne un lien WhatsApp pour contacter le chauffeur */
export function getWhatsAppLink(phoneCode: string, phoneNumber: string): string {
  const number = formatPhoneNumber(phoneCode, phoneNumber).replace("+", "");
  return `https://wa.me/${number}`;
}
