/** Message lisible pour les échecs Resend courants (domaine non autorisé, etc.). */
export function formatResendFailureTrace(errorMessage: string): string {
  const detail = errorMessage.trim() || "erreur Resend";
  if (/not authorized to send emails from/i.test(detail)) {
    return (
      "L’adresse d’expédition n’est pas autorisée par le fournisseur e-mail. " +
      "Vérifiez le domaine Resend. " +
      `(détail : ${detail})`
    );
  }
  return `Échec de l’envoi de l’e-mail de création : ${detail}.`;
}
