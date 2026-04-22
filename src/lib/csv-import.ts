/**
 * Validation stricte d'imports CSV d'accréditations.
 *
 * Principes :
 * - Sensible à la casse pour les enums (PORTEUR ≠ porteur)
 * - Regex par champ pour les formats (plaque, téléphone, date, etc.)
 * - Pas de "fallback silencieux" : au moindre écart, on renvoie une erreur
 *   détaillée (ligne, colonne, valeur brute, raison) et on BLOQUE tout l'import.
 * - Détection de doublons intra-fichier.
 */

export const CSV_COLUMNS = [
  "company",
  "stand",
  "email",
  "eventSlug",
  "vehiclePlate",
  "vehicleSize",
  "phoneCode",
  "phoneNumber",
  "date",
  "time",
  "city",
  "unloading",
  "category",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface CsvRowError {
  line: number; // 1-indexé, ligne du CSV (header = ligne 1)
  column?: CsvColumn | "_row";
  value?: string;
  reason: string;
}

export interface CsvValidRow {
  line: number;
  company: string;
  stand: string;
  email: string;
  eventSlug: string;
  vehiclePlate: string;
  vehicleSize: "PORTEUR" | "PORTEUR_ARTICULE" | "SEMI_REMORQUE";
  phoneCode: string;
  phoneNumber: string;
  date: string; // ISO YYYY-MM-DD
  time: string; // HH:MM
  city: string;
  unloading: ("lat" | "rear")[];
  category: string | null;
}

export interface ValidationReport {
  errors: CsvRowError[];
  rows: CsvValidRow[];
  totalLines: number;
}

const VALID_VEHICLE_SIZES = new Set(["PORTEUR", "PORTEUR_ARTICULE", "SEMI_REMORQUE"]);
const VALID_UNLOADING_VALUES = new Set(["lat", "rear", "lat+rear"]);
const VALID_CATEGORIES = new Set([
  "stand_nu",
  "stand_cle_en_main",
  "bateau_terre",
  "bateau_flot",
  "tente_structure",
]);

// Regex strictes
const REGEX = {
  company:     /^[A-Za-z0-9À-ÿ .&'\-]{1,120}$/,
  stand:       /^[A-Za-z0-9_\-]{1,50}$/,
  email:       /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  eventSlug:   /^[a-z0-9\-]{1,80}$/,
  vehiclePlate:/^[A-Z0-9-]{4,12}$/,
  phoneCode:   /^\+\d{1,3}$/,
  phoneNumber: /^\d{6,14}$/,
  date:        /^\d{4}-\d{2}-\d{2}$/,
  time:        /^([01]\d|2[0-3]):[0-5]\d$/,
  city:        /^[A-Za-zÀ-ÿ0-9 .'\-]{1,80}$/,
};

function parseUnloading(raw: string): ("lat" | "rear")[] | null {
  if (!VALID_UNLOADING_VALUES.has(raw)) return null;
  if (raw === "lat+rear") return ["lat", "rear"];
  return [raw as "lat" | "rear"];
}

function validateDate(iso: string): boolean {
  if (!REGEX.date.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  // Vérifier que la date est cohérente (ex: pas 2026-02-31)
  return d.toISOString().startsWith(iso);
}

/**
 * Génère le contenu CSV squelette (UTF-8 avec BOM) avec une ligne d'exemple
 * en commentaire (préfixée par '#'). On ne met PAS d'accents dans le BOM pour
 * éviter la casse Excel.
 */
export function buildCsvTemplate(): string {
  const header = CSV_COLUMNS.join(",");
  const example = [
    "Decorateur Exemple",  // company
    "A12",                 // stand
    "contact@exemple.fr",  // email
    "yachting-2026",       // eventSlug
    "AB123CD",             // vehiclePlate
    "SEMI_REMORQUE",       // vehicleSize (CASSE STRICTE)
    "+33",                 // phoneCode
    "612345678",           // phoneNumber (sans le 0 initial)
    "2026-09-04",          // date ISO
    "08:30",               // time
    "Cannes",              // city
    "rear",                // unloading: lat | rear | lat+rear
    "bateau_flot",         // category (optionnel, laisser vide si auto)
  ].join(",");
  // BOM UTF-8 pour qu'Excel ouvre correctement les accents
  return "\uFEFF" + header + "\n" + example + "\n";
}

/**
 * Valide une liste de records CSV (déjà parsés) et produit un rapport strict.
 * Un seul enregistrement en erreur → rapport.errors.length > 0 → import bloqué.
 */
export function validateCsvRecords(
  records: Record<string, string>[],
  eventSlugs: Set<string>
): ValidationReport {
  const errors: CsvRowError[] = [];
  const validRows: CsvValidRow[] = [];

  // Vérifier que les colonnes attendues sont toutes là (si pas de records,
  // on laisse passer — l'appelant aura déjà validé au parsing)
  if (records.length === 0) {
    return { errors, rows: validRows, totalLines: 0 };
  }

  // Vérifier la présence des colonnes dans le premier record
  const firstKeys = Object.keys(records[0] ?? {});
  const missing = CSV_COLUMNS.filter(
    (c) => c !== "category" && !firstKeys.includes(c)
  );
  if (missing.length > 0) {
    errors.push({
      line: 1,
      column: "_row",
      reason: `Colonnes manquantes dans le header : ${missing.join(", ")}`,
    });
    return { errors, rows: validRows, totalLines: records.length };
  }

  // Pour la détection de doublons intra-fichier
  const seenKeys = new Map<string, number>();

  records.forEach((raw, idx) => {
    const line = idx + 2; // ligne 1 = header
    const rowErrors: CsvRowError[] = [];

    function check(col: CsvColumn, value: string, rule: RegExp, reason: string) {
      if (!rule.test(value)) {
        rowErrors.push({ line, column: col, value, reason });
      }
    }

    const company = raw.company?.trim() ?? "";
    const stand = raw.stand?.trim() ?? "";
    const email = raw.email?.trim() ?? "";
    const eventSlug = raw.eventSlug?.trim() ?? "";
    const vehiclePlate = raw.vehiclePlate?.trim() ?? "";
    const vehicleSize = raw.vehicleSize?.trim() ?? "";
    const phoneCode = raw.phoneCode?.trim() ?? "";
    const phoneNumber = raw.phoneNumber?.trim() ?? "";
    const date = raw.date?.trim() ?? "";
    const time = raw.time?.trim() ?? "";
    const city = raw.city?.trim() ?? "";
    const unloading = raw.unloading?.trim() ?? "";
    const category = raw.category?.trim() ?? "";

    // Champs obligatoires non vides
    const mandatory: [CsvColumn, string][] = [
      ["company", company], ["stand", stand], ["email", email],
      ["eventSlug", eventSlug], ["vehiclePlate", vehiclePlate],
      ["vehicleSize", vehicleSize], ["phoneCode", phoneCode],
      ["phoneNumber", phoneNumber], ["date", date], ["time", time],
      ["city", city], ["unloading", unloading],
    ];
    for (const [col, val] of mandatory) {
      if (!val) {
        rowErrors.push({ line, column: col, value: val, reason: "Champ obligatoire vide" });
      }
    }

    // Regex par champ (on n'ajoute une erreur regex que si le champ n'est pas déjà vide)
    if (company) check("company", company, REGEX.company, "Format invalide (caractères interdits ou longueur > 120)");
    if (stand) check("stand", stand, REGEX.stand, "Format invalide (alphanumérique + _ - , max 50)");
    if (email) check("email", email, REGEX.email, "Format email invalide");
    if (eventSlug) check("eventSlug", eventSlug, REGEX.eventSlug, "Slug invalide (minuscules, chiffres, tirets)");
    if (vehiclePlate) check("vehiclePlate", vehiclePlate, REGEX.vehiclePlate, "Plaque invalide (A-Z, 0-9, tiret, 4-12 caractères)");
    if (phoneCode) check("phoneCode", phoneCode, REGEX.phoneCode, "Format attendu : +33, +1, +221…");
    if (phoneNumber) check("phoneNumber", phoneNumber, REGEX.phoneNumber, "Chiffres uniquement, 6 à 14 chiffres, sans 0 initial");
    if (time) check("time", time, REGEX.time, "Format attendu : HH:MM (24h)");
    if (city) check("city", city, REGEX.city, "Format invalide (caractères interdits ou longueur > 80)");

    if (date && !validateDate(date)) {
      rowErrors.push({ line, column: "date", value: date, reason: "Date invalide (format attendu : YYYY-MM-DD)" });
    }

    if (vehicleSize && !VALID_VEHICLE_SIZES.has(vehicleSize)) {
      rowErrors.push({
        line,
        column: "vehicleSize",
        value: vehicleSize,
        reason: `Valeur non reconnue (attendu strictement : ${[...VALID_VEHICLE_SIZES].join(", ")})`,
      });
    }

    const parsedUnloading = unloading ? parseUnloading(unloading) : null;
    if (unloading && !parsedUnloading) {
      rowErrors.push({
        line,
        column: "unloading",
        value: unloading,
        reason: `Valeur non reconnue (attendu strictement : ${[...VALID_UNLOADING_VALUES].join(", ")})`,
      });
    }

    if (category && !VALID_CATEGORIES.has(category)) {
      rowErrors.push({
        line,
        column: "category",
        value: category,
        reason: `Catégorie non reconnue (attendu : ${[...VALID_CATEGORIES].join(", ")} ou vide)`,
      });
    }

    // eventSlug doit exister dans les events accessibles à l'utilisateur
    if (eventSlug && REGEX.eventSlug.test(eventSlug) && !eventSlugs.has(eventSlug)) {
      rowErrors.push({
        line,
        column: "eventSlug",
        value: eventSlug,
        reason: "Event inconnu ou inaccessible pour votre périmètre",
      });
    }

    // Doublon intra-fichier (même combinaison company+stand+plate+eventSlug)
    const dedupKey = `${eventSlug}|${company}|${stand}|${vehiclePlate}`;
    if (dedupKey !== "|||" && seenKeys.has(dedupKey)) {
      rowErrors.push({
        line,
        column: "_row",
        value: dedupKey,
        reason: `Doublon : même combinaison (eventSlug, company, stand, vehiclePlate) déjà vue à la ligne ${seenKeys.get(dedupKey)}`,
      });
    } else {
      seenKeys.set(dedupKey, line);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      validRows.push({
        line,
        company,
        stand,
        email,
        eventSlug,
        vehiclePlate,
        vehicleSize: vehicleSize as CsvValidRow["vehicleSize"],
        phoneCode,
        phoneNumber,
        date,
        time,
        city,
        unloading: parsedUnloading!,
        category: category || null,
      });
    }
  });

  return { errors, rows: validRows, totalLines: records.length };
}
