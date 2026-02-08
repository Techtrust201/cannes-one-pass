/** Formate un numéro de téléphone (code + numéro) en format international */
export function formatPhoneNumber(phoneCode: string, phoneNumber: string): string {
  // Nettoyer le code (retirer +)
  const cleanCode = phoneCode.replace(/[^0-9]/g, "");
  // Nettoyer le numéro (retirer 0 initial si code international)
  let cleanNumber = phoneNumber.replace(/[^0-9]/g, "");
  if (cleanNumber.startsWith("0") && cleanCode) {
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
  // wa.me attend le numéro sans le + 
  const number = formatPhoneNumber(phoneCode, phoneNumber).replace("+", "");
  return `https://wa.me/${number}`;
}
