/**
 * Déduction automatique de la catégorie d'emplacement à partir des
 * informations de l'accréditation (numéro de stand, zone).
 *
 * Règle "dernière modification overrides" : cette fonction ne produit que la
 * *proposition* auto. Si un humain ou un import CSV a déjà fixé une valeur,
 * celle-ci l'emporte (voir colonne Accreditation.categorySource).
 *
 * Pur — pas d'accès DB. Testable.
 */
import type { EmplacementCategory } from "@prisma/client";

export const CATEGORY_LABELS: Record<EmplacementCategory, string> = {
  STAND_NU: "Stand nu",
  STAND_CLE_EN_MAIN: "Stand clé en main",
  BATEAU_TERRE: "Bateau à terre",
  BATEAU_FLOT: "Bateau à flot",
  TENTE_STRUCTURE: "Tente / structure",
};

export const CSV_TO_ENUM: Record<string, EmplacementCategory> = {
  stand_nu: "STAND_NU",
  stand_cle_en_main: "STAND_CLE_EN_MAIN",
  bateau_terre: "BATEAU_TERRE",
  bateau_flot: "BATEAU_FLOT",
  tente_structure: "TENTE_STRUCTURE",
};

export const ENUM_TO_CSV: Record<EmplacementCategory, string> = {
  STAND_NU: "stand_nu",
  STAND_CLE_EN_MAIN: "stand_cle_en_main",
  BATEAU_TERRE: "bateau_terre",
  BATEAU_FLOT: "bateau_flot",
  TENTE_STRUCTURE: "tente_structure",
};

export interface CategoryHints {
  stand?: string | null;
  zone?: string | null;
  unloading?: string | null;
}

/**
 * Retourne la catégorie déduite automatiquement, ou null si aucune règle
 * ne match avec suffisamment de confiance.
 *
 * Règles (ordre de priorité) :
 *   1. Préfixe du stand (JETEE, PALAIS, TENTE, ...) → catégorie
 *   2. Zone (si contient BATEAU_FLOT, TERRE, etc.) → catégorie
 *   3. Sinon → null (la catégorie sera à saisir manuellement)
 */
export function deriveCategory(hints: CategoryHints): EmplacementCategory | null {
  const stand = (hints.stand ?? "").toUpperCase().trim();
  const zone = (hints.zone ?? "").toUpperCase().trim();

  if (!stand && !zone) return null;

  // 0. Mentions explicites "clé en main" / "turnkey" sur le stand
  //    Ex : "PALAIS-CLE A12", "STAND CLE EN MAIN 5", "TURNKEY-B3"
  if (stand) {
    const collapsed = stand.replace(/[-_\s]+/g, " ");
    if (
      collapsed.includes("CLE EN MAIN") ||
      collapsed.includes("CLEENMAIN") ||
      /\bCLE\b/.test(collapsed) ||
      collapsed.includes("TURNKEY") ||
      collapsed.startsWith("CLEM")
    ) {
      return "STAND_CLE_EN_MAIN";
    }
  }

  // 1. Préfixe de stand
  if (stand) {
    if (stand.startsWith("JETEE")) return "BATEAU_FLOT";
    if (stand.startsWith("QUAI")) return "BATEAU_FLOT";
    if (stand.startsWith("PANTIERO")) return "BATEAU_FLOT";
    if (stand.startsWith("PORT")) return "BATEAU_FLOT";
    if (stand.startsWith("SYE") || stand.startsWith("SUPER")) return "BATEAU_FLOT";
    if (stand.startsWith("TENTE")) return "TENTE_STRUCTURE";
    if (stand.startsWith("STRUC")) return "TENTE_STRUCTURE";
    if (stand.startsWith("PALAIS-EXT") || stand.startsWith("EXTERIEUR")) return "BATEAU_TERRE";
    if (stand.startsWith("PALAIS") || stand.startsWith("INTERIEUR")) return "STAND_NU";
  }

  // 2. Indices sur la zone (fallback)
  if (zone.includes("PANTIERO") || zone.includes("JETEE") || zone.includes("PORT")) {
    return "BATEAU_FLOT";
  }
  if (zone.includes("EXTERIEUR") || zone.includes("EXT")) {
    return "BATEAU_TERRE";
  }
  if (zone.includes("PALAIS")) {
    return "STAND_NU";
  }

  return null;
}
