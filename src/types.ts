// --- Événements ---
export interface Event {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  description: string | null;
  location: string | null;
  color: string;
  startDate: string;
  endDate: string;
  setupStartDate: string | null;
  setupEndDate: string | null;
  teardownStartDate: string | null;
  teardownEndDate: string | null;
  accessStartTime: string | null;
  accessEndTime: string | null;
  notes: string | null;
  activationDays: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EventStatus = "active" | "upcoming" | "ongoing" | "finished" | "archived";

// --- Zones (dynamiques — identifiants String depuis ZoneConfig) ---
export type Zone = string;
export type ZoneAction = "ENTRY" | "EXIT" | "TRANSFER";

export interface ZoneMovement {
  id: number;
  accreditationId: string;
  fromZone?: Zone | null;
  toZone: Zone;
  action: ZoneAction;
  timestamp: Date;
  userId?: string | null;
  userAgent?: string | null;
}

// --- Types de véhicules ---
export type VehicleType = "PORTEUR" | "PORTEUR_ARTICULE" | "SEMI_REMORQUE";

export type CountryRegion =
  | "FRANCE" | "ESPAGNE" | "ITALIE" | "ALLEMAGNE" | "BELGIQUE"
  | "SUISSE" | "ROYAUME_UNI" | "PAYS_BAS" | "PORTUGAL" | "AUTRE";

export interface Vehicle {
  id: number;
  plate: string;
  size: string;
  phoneCode: string;
  phoneNumber: string;
  /** Date de dépose (legacy string "YYYY-MM-DD") — conservée pour compat */
  date: string;
  /** Heure de dépose (legacy string "HH:MM") — conservée pour compat */
  time: string;
  city: string;
  unloading: ("lat" | "rear")[];
  kms?: string;
  vehicleType?: VehicleType;
  country?: CountryRegion;
  estimatedKms?: number;
  trailerPlate?: string;
  emptyWeight?: number;
  maxWeight?: number;
  currentWeight?: number;
  /** Date + heure de dépose (ISO) — vision Killian, source de vérité */
  arrivalDate?: string | null;
  /** Date + heure de récupération (ISO) — vision Killian, source de vérité */
  departureDate?: string | null;
  /** Date de récupération (saisie form, legacy string "YYYY-MM-DD") */
  returnDate?: string;
  /** Heure de récupération (saisie form, legacy string "HH:MM") */
  returnTime?: string;
}

export type AccreditationStatus =
  | "ATTENTE"
  | "ENTREE"
  | "SORTIE"
  | "NOUVEAU"
  | "REFUS"
  | "ABSENT";

export type EmplacementCategory =
  | "STAND_NU"
  | "STAND_CLE_EN_MAIN"
  | "BATEAU_TERRE"
  | "BATEAU_FLOT"
  | "TENTE_STRUCTURE";

export type ActorSource =
  | "PUBLIC_FORM"
  | "LOGISTICIEN"
  | "CSV_IMPORT"
  | "AUTO_DEDUCTION"
  | "SUPER_ADMIN"
  | "MIGRATION"
  | "SYSTEM";

export interface Accreditation {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  company: string;
  stand: string;
  unloading: string;
  event: string;
  message?: string;
  consent: boolean;
  vehicles: Vehicle[];
  status: AccreditationStatus;
  entryAt?: Date;
  exitAt?: Date;
  email?: string;
  sentAt?: Date;
  currentZone?: Zone | null;
  isArchived?: boolean;
  /** Catégorie d'emplacement (stand, bateau, tente, etc.) */
  category?: EmplacementCategory | null;
  /** Source qui a fixé la catégorie (auto, saisie, import) */
  categorySource?: ActorSource | null;
  /** Heure d'entrée au Palais (time slot le plus récent) — legacy */
  palaisEntryAt?: Date | null;
  /** Heure de sortie du Palais (time slot le plus récent) — legacy */
  palaisExitAt?: Date | null;
  /** Heure d'entrée du dernier step (toutes zones confondues) */
  lastStepEntryAt?: Date;
  /** Heure de sortie du dernier step (toutes zones confondues) */
  lastStepExitAt?: Date;
  /** Zone du dernier step */
  lastStepZone?: string;
}

// --- Créneaux horaires (retour véhicule) ---
export interface VehicleTimeSlot {
  id: number;
  accreditationId: string;
  vehicleId: number;
  date: string;
  stepNumber: number;
  zone: Zone;
  entryAt: string;
  exitAt?: string | null;
}

// --- Chat inter-agents ---
export interface ChatMessage {
  id: number;
  accreditationId: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: string;
}

// --- Configuration des zones ---
export interface ZoneConfig {
  id: number;
  zone: Zone;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
}
