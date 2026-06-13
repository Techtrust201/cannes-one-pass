/**
 * Résolution de l'expéditeur des e-mails automatiques par organisation.
 *
 * Objectif : permettre à chaque organisation d'avoir son propre expéditeur
 * (nom + adresse) et son adresse de réponse, tout en gardant un fallback global
 * sécurisé (FROM_EMAIL).
 *
 * Sécurité :
 *  - emailFromAddress doit être une adresse e-mail valide ;
 *  - son domaine doit appartenir à une allowlist (domaines vérifiés côté
 *    plateforme), sinon on refuse à la sauvegarde et on retombe sur le fallback
 *    global à l'envoi ;
 *  - replyToEmail peut être n'importe quelle adresse valide (c'est juste une
 *    adresse de réponse, pas un expéditeur technique).
 *
 * Module isomorphe (pas d'import serveur) : réutilisable côté API et tests.
 */

/** Allowlist par défaut si EMAIL_ALLOWED_DOMAINS n'est pas défini. */
const DEFAULT_ALLOWED_DOMAINS = ["notifications.techtrust.fr"];

/** Validation e-mail simple et stricte (pas de protocole, pas d'espace). */
export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length > 254) return false;
  // Un seul @, partie locale et domaine non vides, domaine avec un point.
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v);
}

/** Extrait le domaine (en minuscules) d'une adresse e-mail, ou null. */
export function emailDomain(value: string | null | undefined): string | null {
  if (!isValidEmail(value)) return null;
  const at = value!.trim().toLowerCase().lastIndexOf("@");
  return at >= 0 ? value!.trim().toLowerCase().slice(at + 1) : null;
}

/** Liste des domaines autorisés pour l'adresse d'expédition. */
export function getAllowedSenderDomains(): string[] {
  const raw = process.env.EMAIL_ALLOWED_DOMAINS;
  const domains = (raw ? raw.split(",") : DEFAULT_ALLOWED_DOMAINS)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return domains.length > 0 ? domains : DEFAULT_ALLOWED_DOMAINS;
}

/** L'adresse d'expédition appartient-elle à un domaine autorisé ? */
export function isAllowedSenderAddress(value: string | null | undefined): boolean {
  const domain = emailDomain(value);
  if (!domain) return false;
  return getAllowedSenderDomains().includes(domain);
}

/** Nettoie un nom d'affichage pour qu'il ne casse pas l'en-tête From. */
function sanitizeDisplayName(name: string): string {
  return name.replace(/["<>\r\n]/g, " ").replace(/\s+/g, " ").trim();
}

export interface OrgEmailConfig {
  name: string;
  emailFromName: string | null;
  emailFromAddress: string | null;
  replyToEmail: string | null;
  emailSendingEnabled: boolean;
}

export interface ResolvedSender {
  /** En-tête "From" final, ou null si aucun expéditeur disponible. */
  from: string | null;
  /** Adresse de réponse à inclure, si configurée et valide. */
  replyTo?: string;
  /** true si l'expéditeur de l'org a été ignoré au profit du fallback global. */
  usedFallback: boolean;
  /** true si l'organisation a explicitement désactivé l'envoi automatique. */
  disabled: boolean;
  /** Note à tracer dans l'historique (cas fallback forcé). */
  note?: string;
}

/**
 * Construit l'expéditeur final à partir de la config d'organisation, avec
 * fallback sur le FROM_EMAIL global. Ne lève jamais.
 */
export function resolveAccreditationSender(
  org: OrgEmailConfig | null | undefined
): ResolvedSender {
  const globalFrom = process.env.FROM_EMAIL?.trim() || null;

  // L'organisation a coupé l'envoi automatique : on ne fournit pas d'expéditeur.
  if (org && org.emailSendingEnabled === false) {
    return { from: null, usedFallback: false, disabled: true };
  }

  const replyToRaw = org?.replyToEmail?.trim();
  const replyTo = replyToRaw && isValidEmail(replyToRaw) ? replyToRaw : undefined;

  const addr = org?.emailFromAddress?.trim();
  if (addr) {
    if (isValidEmail(addr) && isAllowedSenderAddress(addr)) {
      const display = sanitizeDisplayName(org?.emailFromName?.trim() || org?.name?.trim() || "");
      return {
        from: display ? `${display} <${addr}>` : addr,
        replyTo,
        usedFallback: false,
        disabled: false,
      };
    }
    // Adresse configurée mais invalide ou domaine non autorisé → fallback tracé.
    return {
      from: globalFrom,
      replyTo,
      usedFallback: true,
      disabled: false,
      note: `Expéditeur d'organisation refusé (adresse invalide ou domaine non autorisé : ${addr}). Fallback sur l'expéditeur global.`,
    };
  }

  // Pas de config d'expéditeur : fallback global silencieux (comportement normal).
  return { from: globalFrom, replyTo, usedFallback: false, disabled: false };
}
