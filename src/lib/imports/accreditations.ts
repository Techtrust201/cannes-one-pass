/**
 * Profil d'import "Accreditations" (Phase 4B-1) : parsing + mapping PUR.
 *
 * Transforme une `ParsedTable` (produite par `parseImportFile`, CSV ou XLSX —
 * on ne recree JAMAIS un second parseur) en lignes canoniques en memoire.
 * AUCUNE ecriture DB, AUCUNE resolution referentiel ici (cf.
 * `accreditations-referential-resolver.ts`) et AUCUNE validation Zod complete :
 * ce module prepare les donnees, `previewAccreditation` fera la validation
 * metier finale via le moteur unique (Phase 4B-2).
 *
 * Le mapping depend du template de l'organisation (Palais / RX) mais reste un
 * SEUL profil generique :
 *  - Palais : company/stand utilisables directement, exposant/emplacement
 *    facultatifs, aucune extension RX construite ;
 *  - RX : 1 ligne = 1 accreditation = 1 vehicule = 1 categorie ; la ligne
 *    porte montage ET demontage ; le contact (5 champs) vient du FICHIER
 *    (jamais du referentiel Exhibitor qui ne stocke aucun contact).
 *
 * Securite : les colonnes sensibles (organizationId, eventId, status,
 * actorSource, exhibitorId, exhibitorLocationId, locationSnapshot) sont
 * INTERDITES et produisent une erreur `FORBIDDEN_COLUMN` — jamais ignorees
 * silencieusement. L'organisation/l'evenement proviennent exclusivement du
 * contexte serveur (jamais du contenu du fichier).
 */

import { resolveHeader, type ImportRowIssue, type ParsedTable } from "./csv";
import type { LocationTypeCode } from "./referential";

export type AccreditationTemplate = "palais" | "rx";

// ── Types canoniques de sortie ──────────────────────────────────────────

export interface ParsedAccreditationReferentialRef {
  /** Reference externe eventuelle (prioritaire pour la resolution). */
  exhibitorExternalReference: string | null;
  /** Nom exposant (fallback de resolution si pas de reference externe). */
  exhibitorName: string | null;
  /** Libelle d'emplacement a resoudre dans les locations de l'exposant. */
  locationCode: string | null;
  /** Type d'emplacement optionnel (filtre de resolution). */
  locationType: LocationTypeCode | null;
}

export interface ParsedAccreditationCore {
  company: string | null;
  stand: string | null;
  email: string | null;
  language: string | null;
  message: string | null;
  /** Chaine libre (ex: "bateau_flot") ; l'enum est resolu par le moteur. */
  category: string | null;
  /** Tokens de deballage (ex: ["lat","rear"]) ; jamais valides ici. */
  unloading: string[];
}

export interface ParsedAccreditationVehicle {
  plate: string | null;
  trailerPlate: string | null;
  vehicleType: string | null;
  size: string | null;
  phoneCode: string | null;
  phoneNumber: string | null;
  date: string | null;
  time: string | null;
  city: string | null;
  unloading: string[];
  country: string | null;
  kms: string | null;
  estimatedKms: number | null;
  arrivalDate: string | null;
  departureDate: string | null;
  emptyWeight: number | null;
  maxWeight: number | null;
  currentWeight: number | null;
}

export interface ParsedRxContact {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneCode: string | null;
  phoneNumber: string | null;
}

export interface ParsedRxCategoryDraft {
  categoryId: string | null;
  livDate: string | null;
  livTime: string | null;
  repDate: string | null;
  repTime: string | null;
}

export interface ParsedRxRepDraft {
  repSameAsDelivery: boolean | null;
  repVehicleType: string | null;
  repPlate: string | null;
  repPhoneCode: string | null;
  repPhoneNumber: string | null;
  repInterveningCompany: string | null;
  repCity: string | null;
  repCountry: string | null;
  repEstimatedKms: number | null;
}

/**
 * Brouillon structure de l'extension RX (jamais un JSON brut du fichier).
 * La partie `exhibitor` de l'extension n'est PAS ici : elle est reconstruite
 * apres resolution referentiel serveur (Phase 4B-2/3).
 */
export interface ParsedRxDraft {
  contact: ParsedRxContact;
  space: string | null;
  category: ParsedRxCategoryDraft;
  rep: ParsedRxRepDraft;
  interveningCompany: string | null;
  scalesAssigned: boolean | null;
  manutentionProvider: string | null;
  manutentionProviderOther: string | null;
  skipMontage: boolean | null;
  skipDemontage: boolean | null;
}

export interface ParsedAccreditationRow {
  /** Ligne du fichier, 1-indexee (entete = ligne 1). */
  line: number;
  referential: ParsedAccreditationReferentialRef;
  accreditation: ParsedAccreditationCore;
  vehicle: ParsedAccreditationVehicle;
  /** Brouillon RX (null pour le template Palais). */
  rx: ParsedRxDraft | null;
}

export interface AccreditationParseOptions {
  template: AccreditationTemplate;
}

export interface AccreditationParseResult {
  template: AccreditationTemplate;
  rows: ParsedAccreditationRow[];
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  totalRows: number;
}

// ── Alias d'entetes (deja normalises MAJUSCULES par normalizeHeaderKey) ──

const ALIASES = {
  exhibitorExternalReference: [
    "EXHIBITOR EXTERNAL REFERENCE", "EXTERNAL REFERENCE", "REFERENCE EXTERNE",
    "REF EXTERNE", "REFERENCE EXPOSANT", "EXHIBITOREXTERNALREFERENCE",
  ],
  exhibitorName: [
    "EXHIBITOR NAME", "EXHIBITOR", "EXPOSANT", "NOM EXPOSANT", "SOCIETE EXPOSANT",
    "EXHIBITORNAME",
  ],
  locationCode: [
    "LOCATION CODE", "LOCATION", "EMPLACEMENT", "CODE EMPLACEMENT", "CODE LOCATION",
    "LOCATIONCODE",
  ],
  locationType: [
    "LOCATION TYPE", "TYPE EMPLACEMENT", "TYPE LOCATION", "LOCATIONTYPE", "TYPE",
  ],
  company: ["COMPANY", "SOCIETE", "ENTREPRISE", "RAISON SOCIALE"],
  stand: ["STAND", "NO STAND", "NUM STAND", "NUMERO STAND", "NUM-STAND"],
  email: ["EMAIL", "E-MAIL", "MAIL", "COURRIEL"],
  language: ["LANGUAGE", "LANGUE", "LANG"],
  message: ["MESSAGE", "COMMENTAIRE", "NOTE", "NOTES"],
  category: ["CATEGORY", "CATEGORIE"],
  unloading: ["UNLOADING", "DECHARGEMENT", "MODE DECHARGEMENT"],
  plate: ["PLATE", "PLAQUE", "IMMATRICULATION", "VEHICLE PLATE", "PLAQUE VEHICULE"],
  trailerPlate: ["TRAILER PLATE", "PLAQUE REMORQUE", "REMORQUE", "TRAILERPLATE"],
  vehicleType: ["VEHICLE TYPE", "TYPE VEHICULE", "GABARIT", "TYPE DE VEHICULE", "VEHICLETYPE"],
  size: ["SIZE", "TAILLE", "VEHICLE SIZE", "TAILLE VEHICULE"],
  phoneCode: ["PHONE CODE", "INDICATIF", "CODE TEL", "PHONECODE", "INDICATIF TELEPHONIQUE"],
  phoneNumber: ["PHONE NUMBER", "TELEPHONE", "TEL", "NUMERO TEL", "PHONENUMBER", "NUMERO TELEPHONE"],
  date: ["DATE", "VEHICLE DATE", "DATE VEHICULE"],
  time: ["TIME", "HEURE", "CRENEAU", "HORAIRE"],
  city: ["CITY", "VILLE"],
  country: ["COUNTRY", "PAYS"],
  kms: ["KMS", "KM"],
  estimatedKms: ["ESTIMATED KMS", "KMS ESTIMES", "KM ESTIMES", "ESTIMATEDKMS"],
  arrivalDate: ["ARRIVAL DATE", "DATE ARRIVEE", "ARRIVALDATE"],
  departureDate: ["DEPARTURE DATE", "DATE DEPART", "DEPARTUREDATE"],
  emptyWeight: ["EMPTY WEIGHT", "POIDS VIDE", "EMPTYWEIGHT"],
  maxWeight: ["MAX WEIGHT", "POIDS MAX", "PTAC", "MAXWEIGHT"],
  currentWeight: ["CURRENT WEIGHT", "POIDS ACTUEL", "POIDS CHARGE", "CURRENTWEIGHT"],
  contactFirstName: ["CONTACT FIRST NAME", "PRENOM CONTACT", "CONTACT PRENOM", "CONTACTFIRSTNAME"],
  contactLastName: ["CONTACT LAST NAME", "NOM CONTACT", "CONTACT NOM", "CONTACTLASTNAME"],
  contactEmail: ["CONTACT EMAIL", "EMAIL CONTACT", "CONTACTEMAIL"],
  contactPhoneCode: ["CONTACT PHONE CODE", "INDICATIF CONTACT", "CONTACTPHONECODE"],
  contactPhoneNumber: ["CONTACT PHONE NUMBER", "TELEPHONE CONTACT", "TEL CONTACT", "CONTACTPHONENUMBER"],
  categoryId: ["CATEGORY ID", "CATEGORIE ID", "ID CATEGORIE", "CATEGORYID"],
  livDate: ["LIV DATE", "DATE LIVRAISON", "DATE MONTAGE", "LIVDATE", "DATE LIV"],
  livTime: ["LIV TIME", "HEURE LIVRAISON", "CRENEAU MONTAGE", "LIVTIME", "HORAIRE LIVRAISON"],
  repDate: ["REP DATE", "DATE REPRISE", "DATE DEMONTAGE", "REPDATE"],
  repTime: ["REP TIME", "HEURE REPRISE", "CRENEAU DEMONTAGE", "REPTIME"],
  skipMontage: ["SKIP MONTAGE", "SANS MONTAGE", "SKIPMONTAGE"],
  skipDemontage: ["SKIP DEMONTAGE", "SANS DEMONTAGE", "SKIPDEMONTAGE"],
  repSameAsDelivery: ["REP SAME AS DELIVERY", "REPRISE IDENTIQUE", "REPSAMEASDELIVERY"],
  repVehicleType: ["REP VEHICLE TYPE", "TYPE VEHICULE REPRISE", "REPVEHICLETYPE"],
  repPlate: ["REP PLATE", "PLAQUE REPRISE", "REPPLATE"],
  repPhoneCode: ["REP PHONE CODE", "INDICATIF REPRISE", "REPPHONECODE"],
  repPhoneNumber: ["REP PHONE NUMBER", "TELEPHONE REPRISE", "REPPHONENUMBER"],
  repInterveningCompany: ["REP INTERVENING COMPANY", "ENTREPRISE REPRISE", "REPINTERVENINGCOMPANY"],
  repCity: ["REP CITY", "VILLE REPRISE", "REPCITY"],
  repCountry: ["REP COUNTRY", "PAYS REPRISE", "REPCOUNTRY"],
  repEstimatedKms: ["REP ESTIMATED KMS", "KMS REPRISE", "REPESTIMATEDKMS"],
  interveningCompany: ["INTERVENING COMPANY", "ENTREPRISE INTERVENANTE", "PRESTATAIRE", "INTERVENINGCOMPANY"],
  scalesAssigned: ["SCALES ASSIGNED", "BALANCES", "SCALESASSIGNED"],
  manutentionProvider: ["MANUTENTION PROVIDER", "PRESTATAIRE MANUTENTION", "MANUTENTIONPROVIDER"],
  manutentionProviderOther: ["MANUTENTION PROVIDER OTHER", "AUTRE PRESTATAIRE", "MANUTENTIONPROVIDEROTHER"],
  space: ["SPACE", "ESPACE", "ESPACE LOGISTIQUE", "LOGISTIC SPACE"],
} as const;

/**
 * Colonnes INTERDITES : identifiants internes / champs de securite que le
 * fichier ne doit jamais fournir. Detectees a l'entete -> `FORBIDDEN_COLUMN`.
 * Les colonnes textuelles `ORGANIZATION` / `EVENT` (sans "ID") restent
 * autorisees a titre informatif mais ne sont jamais mappees vers la commande.
 */
export const ACCREDITATION_FORBIDDEN_COLUMNS: { code: string; headers: string[] }[] = [
  { code: "organizationId", headers: ["ORGANIZATIONID", "ORGANIZATION ID", "ORGANIZATION_ID", "ORG ID", "ORGID"] },
  { code: "eventId", headers: ["EVENTID", "EVENT ID", "EVENT_ID"] },
  { code: "status", headers: ["STATUS", "STATUT"] },
  { code: "actorSource", headers: ["ACTORSOURCE", "ACTOR SOURCE", "ACTOR_SOURCE"] },
  { code: "exhibitorId", headers: ["EXHIBITORID", "EXHIBITOR ID", "EXHIBITOR_ID"] },
  {
    code: "exhibitorLocationId",
    headers: [
      "EXHIBITORLOCATIONID", "EXHIBITOR LOCATION ID", "EXHIBITOR_LOCATION_ID",
      "LOCATIONID", "LOCATION ID", "LOCATION_ID",
    ],
  },
  { code: "locationSnapshot", headers: ["LOCATIONSNAPSHOT", "LOCATION SNAPSHOT", "LOCATION_SNAPSHOT", "SNAPSHOT"] },
];

const LOCATION_TYPE_BY_TOKEN: Record<string, LocationTypeCode> = {
  TERRE: "TERRE",
  FLOT: "FLOT",
  STAND: "STAND",
};

// ── Helpers de lecture de cellule ───────────────────────────────────────

function str(record: Record<string, string>, header: string | null): string | null {
  if (!header) return null;
  const value = (record[header] ?? "").trim();
  return value === "" ? null : value;
}

function num(value: string | null): number | null {
  if (value == null) return null;
  // Tolere la virgule decimale FR.
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const TRUE_TOKENS = new Set(["TRUE", "1", "OUI", "YES", "VRAI", "X"]);
const FALSE_TOKENS = new Set(["FALSE", "0", "NON", "NO", "FAUX"]);

function bool(value: string | null): boolean | null {
  if (value == null) return null;
  const token = value.toUpperCase();
  if (TRUE_TOKENS.has(token)) return true;
  if (FALSE_TOKENS.has(token)) return false;
  return null;
}

/** Split des tokens de deballage sur `+`, `/`, `,` ; trim ; sans vides. */
function unloadingTokens(value: string | null): string[] {
  if (value == null) return [];
  return value
    .split(/[+/,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

// ── Parsing principal ───────────────────────────────────────────────────

/**
 * Parse une `ParsedTable` (CSV/XLSX deja normalisee) en lignes canoniques
 * d'accreditations. N'ecrit rien, ne resout pas le referentiel, ne valide pas
 * le metier (Zod delegue a `previewAccreditation`).
 */
export function parseAccreditationsTable(
  table: ParsedTable,
  options: AccreditationParseOptions
): AccreditationParseResult {
  const { template } = options;
  const { headers, records } = table;
  const errors: ImportRowIssue[] = [];
  const warnings: ImportRowIssue[] = [];

  // 1. Colonnes interdites (bloquantes, jamais ignorees silencieusement).
  const present = new Set(headers);
  for (const forbidden of ACCREDITATION_FORBIDDEN_COLUMNS) {
    const hit = forbidden.headers.find((h) => present.has(h));
    if (hit) {
      errors.push({
        line: 1,
        column: hit,
        reason: `FORBIDDEN_COLUMN: la colonne "${hit}" (${forbidden.code}) est interdite. L'organisation, l'evenement et les identifiants internes proviennent du contexte serveur, jamais du fichier.`,
      });
    }
  }

  // 2. Resolution des entetes reelles par alias logique.
  const h = Object.fromEntries(
    Object.entries(ALIASES).map(([key, aliases]) => [key, resolveHeader(headers, [...aliases])])
  ) as Record<keyof typeof ALIASES, string | null>;

  const rows: ParsedAccreditationRow[] = [];
  const seenSignatures = new Map<string, number>();

  records.forEach((record, index) => {
    const line = index + 2; // entete = ligne 1

    // Detection de doublon exact (ligne strictement identique) : warning,
    // jamais de suppression automatique (2 vehicules RX sans plaque peuvent
    // legitimement porter les memes donnees).
    const signature = headers.map((header) => record[header] ?? "").join("\u0001");
    const firstSeen = seenSignatures.get(signature);
    if (firstSeen !== undefined) {
      warnings.push({
        line,
        column: "_row",
        reason: `DUPLICATE_ROWS: ligne strictement identique a la ligne ${firstSeen}. Aucune deduplication automatique ; le commit exigera confirmDuplicates=true.`,
      });
    } else {
      seenSignatures.set(signature, line);
    }

    const locationTypeRaw = str(record, h.locationType);
    let locationType: LocationTypeCode | null = null;
    if (locationTypeRaw) {
      const resolved = LOCATION_TYPE_BY_TOKEN[locationTypeRaw.toUpperCase()];
      if (resolved) {
        locationType = resolved;
      } else {
        warnings.push({
          line,
          column: h.locationType ?? "LOCATION TYPE",
          value: locationTypeRaw,
          reason: `INVALID_LOCATION_TYPE: type d'emplacement non reconnu (attendu TERRE / FLOT / STAND).`,
        });
      }
    }

    const vehicle: ParsedAccreditationVehicle = {
      plate: str(record, h.plate),
      trailerPlate: str(record, h.trailerPlate),
      vehicleType: str(record, h.vehicleType),
      size: str(record, h.size),
      phoneCode: str(record, h.phoneCode),
      phoneNumber: str(record, h.phoneNumber),
      date: str(record, h.date) ?? str(record, h.livDate),
      time: str(record, h.time) ?? str(record, h.livTime),
      city: str(record, h.city),
      unloading: unloadingTokens(str(record, h.unloading)),
      country: str(record, h.country),
      kms: str(record, h.kms),
      estimatedKms: num(str(record, h.estimatedKms)),
      arrivalDate: str(record, h.arrivalDate),
      departureDate: str(record, h.departureDate),
      emptyWeight: num(str(record, h.emptyWeight)),
      maxWeight: num(str(record, h.maxWeight)),
      currentWeight: num(str(record, h.currentWeight)),
    };

    const row: ParsedAccreditationRow = {
      line,
      referential: {
        exhibitorExternalReference: str(record, h.exhibitorExternalReference),
        exhibitorName: str(record, h.exhibitorName),
        locationCode: str(record, h.locationCode),
        locationType,
      },
      accreditation: {
        company: str(record, h.company),
        stand: str(record, h.stand),
        email: str(record, h.email),
        language: str(record, h.language),
        message: str(record, h.message),
        category: str(record, h.category),
        unloading: unloadingTokens(str(record, h.unloading)),
      },
      vehicle,
      rx: template === "rx" ? buildRxDraft(record, h) : null,
    };

    // RX : `vehicleType` est structurellement obligatoire (schema RX). On le
    // signale ici de maniere structuree ; la validation metier complete reste
    // au preview (Phase 4B-2).
    if (template === "rx" && !vehicle.vehicleType) {
      errors.push({
        line,
        column: h.vehicleType ?? "VEHICLE TYPE",
        reason: "RX_VEHICLE_TYPE_REQUIRED: le type de vehicule est obligatoire pour RX.",
      });
    }

    rows.push(row);
  });

  return { template, rows, errors, warnings, totalRows: records.length };
}

function buildRxDraft(
  record: Record<string, string>,
  h: Record<keyof typeof ALIASES, string | null>
): ParsedRxDraft {
  return {
    contact: {
      firstName: str(record, h.contactFirstName),
      lastName: str(record, h.contactLastName),
      email: str(record, h.contactEmail),
      phoneCode: str(record, h.contactPhoneCode),
      phoneNumber: str(record, h.contactPhoneNumber),
    },
    space: str(record, h.space),
    category: {
      categoryId: str(record, h.categoryId),
      livDate: str(record, h.livDate),
      livTime: str(record, h.livTime),
      repDate: str(record, h.repDate),
      repTime: str(record, h.repTime),
    },
    rep: {
      repSameAsDelivery: bool(str(record, h.repSameAsDelivery)),
      repVehicleType: str(record, h.repVehicleType),
      repPlate: str(record, h.repPlate),
      repPhoneCode: str(record, h.repPhoneCode),
      repPhoneNumber: str(record, h.repPhoneNumber),
      repInterveningCompany: str(record, h.repInterveningCompany),
      repCity: str(record, h.repCity),
      repCountry: str(record, h.repCountry),
      repEstimatedKms: num(str(record, h.repEstimatedKms)),
    },
    interveningCompany: str(record, h.interveningCompany),
    scalesAssigned: bool(str(record, h.scalesAssigned)),
    manutentionProvider: str(record, h.manutentionProvider),
    manutentionProviderOther: str(record, h.manutentionProviderOther),
    skipMontage: bool(str(record, h.skipMontage)),
    skipDemontage: bool(str(record, h.skipDemontage)),
  };
}
