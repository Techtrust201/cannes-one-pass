/**
 * Fonctions pures de résolution des libellés de gabarits véhicules.
 * Sans dépendance Prisma ni cache global : utilisable côté client et serveur.
 */
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import type { LangCode } from "@/lib/translations";
import { resolveVehicleTypeDisplayLabel } from "@/lib/vehicle-type-i18n";

function findByCode(types: VehicleTypeData[], code: string) {
  return types.find((t) => t.code === code || t.code === code.toUpperCase());
}

function resolveFromMatch(
  types: VehicleTypeData[],
  code: string,
  lang?: LangCode
): string {
  const match = findByCode(types, code);
  if (lang) {
    return resolveVehicleTypeDisplayLabel({
      code,
      lang,
      dbTranslations: match?.displayLabels,
      dbLabel: match?.label,
      dbGabarit: match?.gabarit,
    });
  }
  if (match) return match.gabarit.trim() || match.label;
  return code.replace(/_/g, " ");
}

function heuristicCode(fallbackSize: string): string | null {
  const s = fallbackSize.toUpperCase();
  if (s.includes("SEMI")) return "SEMI_REMORQUE";
  if (s.includes("ARTICUL")) return "PORTEUR_ARTICULE";
  if (s.includes("GROS") || s.includes("20")) return "GROS_PORTEUR";
  if (s.includes("LEGER") || s.includes("10")) return "PORTEUR_LEGER";
  if (s.includes("VL") || s.includes("FOURGON")) return "VL";
  if (s.includes("PORTEUR")) return "PORTEUR";
  return null;
}

function legacyHeuristicGabarit(
  types: VehicleTypeData[],
  fallbackSize: string
): string {
  const byCode = (code: string) => findByCode(types, code);
  const s = fallbackSize.toUpperCase();
  if (s.includes("SEMI")) return byCode("SEMI_REMORQUE")?.gabarit ?? "~90 m³";
  if (s.includes("ARTICUL")) return byCode("PORTEUR_ARTICULE")?.gabarit ?? "~100 m³";
  if (s.includes("GROS") || s.includes("20")) return byCode("GROS_PORTEUR")?.gabarit ?? "20 m³";
  if (s.includes("LEGER") || s.includes("10")) return byCode("PORTEUR_LEGER")?.gabarit ?? "10 m³";
  if (s.includes("VL") || s.includes("FOURGON")) return byCode("VL")?.gabarit ?? "VL";
  if (s.includes("PORTEUR")) return byCode("PORTEUR")?.gabarit ?? "15 m³";
  return byCode("PORTEUR")?.gabarit ?? "15 m³";
}

export function resolveVehicleTypeLabelFromList(
  types: VehicleTypeData[],
  vehicleType: string | null | undefined,
  fallbackSize?: string | null,
  lang?: LangCode
): string {
  if (vehicleType) {
    return resolveFromMatch(types, vehicleType, lang);
  }

  if (fallbackSize) {
    const match = findByCode(types, fallbackSize);
    if (match) {
      return resolveFromMatch(types, fallbackSize, lang);
    }

    const code = heuristicCode(fallbackSize);
    if (lang && code) {
      return resolveFromMatch(types, code, lang);
    }

    return legacyHeuristicGabarit(types, fallbackSize);
  }

  if (lang) {
    return resolveFromMatch(types, "PORTEUR", lang);
  }
  return findByCode(types, "PORTEUR")?.gabarit ?? "15 m³";
}

export function resolveVehicleTypeShortLabelFromList(
  types: VehicleTypeData[],
  vehicleType: string | null | undefined,
  fallbackSize?: string | null,
  lang?: LangCode
): string {
  const byCode = (code: string) => findByCode(types, code);
  const type =
    (vehicleType ? byCode(vehicleType) : undefined) ??
    (fallbackSize ? byCode(fallbackSize) : undefined);

  if (lang) {
    const label = resolveVehicleTypeLabelFromList(
      types,
      vehicleType,
      fallbackSize,
      lang
    );
    if (label === "VL") return "VL";
    if (/^\d+\s*m³$/.test(label)) return label;
    return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label;
  }

  if (type) {
    const gabarit = (type.gabarit ?? "").trim();
    if (gabarit === "VL") return "VL";
    if (/^\d+\s*m³$/.test(gabarit)) return gabarit;
    const label = (type.label ?? "").trim();
    return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label || gabarit;
  }
  return resolveVehicleTypeLabelFromList(types, vehicleType, fallbackSize);
}

/**
 * Normalisation tolérante (casse / accents / espaces) pour comparer des
 * libellés de gabarit qui peuvent légèrement diverger ("Semi remorque" vs
 * "Semi-remorque" vs "semi remorque").
 */
function normalizeRawLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clé de « famille » de gabarit, robuste au divorce entre codes canoniques
 * (`SEMI_REMORQUE`, `GROS_PORTEUR`…) et codes-libellés prod RX (`"Semi remorque"`,
 * `"20 m³"`…). Permet de comparer un code de filtre et le `vehicleType`/`size`
 * d'un véhicule même lorsqu'ils proviennent de référentiels différents.
 *
 * Exemples : `"Semi remorque"` et `"SEMI_REMORQUE"` → `"SEMI_REMORQUE"` ;
 * `"20 m³"` et `"GROS_PORTEUR"` → `"GROS_PORTEUR"`.
 */
export function vehicleTypeFamilyKey(
  types: VehicleTypeData[],
  raw: string | null | undefined
): string {
  if (!raw) return "";
  const match = findByCode(types, raw);
  const base = match ? match.code : raw;
  return heuristicCode(base) ?? normalizeRawLabel(base);
}

export function resolveVehicleTypeCodeFromList(
  types: VehicleTypeData[],
  vehicleType: string | null | undefined,
  fallbackSize?: string | null
): string {
  const byCode = (code: string) => findByCode(types, code);

  if (vehicleType && byCode(vehicleType)) return vehicleType;
  if (fallbackSize && byCode(fallbackSize)) return fallbackSize;

  if (fallbackSize) {
    const code = heuristicCode(fallbackSize);
    if (code) return code;
  }

  return "PORTEUR";
}

/**
 * Poids moyen indicatif (tonnes) d'un gabarit, calculé sur une liste scopée.
 * Repli à 15 t si le code est introuvable dans la liste fournie.
 */
export function getAverageWeightFromList(
  types: VehicleTypeData[],
  code: string | null | undefined
): number {
  if (!code) return 15;
  const type = types.find(
    (t) => t.code === code || t.code === code.toUpperCase()
  );
  if (!type) return 15;
  return Math.round((type.tonnageMini + type.tonnageMaxi) / 2);
}
