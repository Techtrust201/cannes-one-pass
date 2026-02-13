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

export interface Vehicle {
  id: number;
  plate: string;
  size: string;
  phoneCode: string;
  phoneNumber: string;
  date: string;
  time: string;
  city: string;
  unloading: ("lat" | "rear")[];
  kms?: string;
  vehicleType?: VehicleType;
  trailerPlate?: string;
  emptyWeight?: number;
  maxWeight?: number;
  currentWeight?: number;
}

export type AccreditationStatus =
  | "ATTENTE"
  | "ENTREE"
  | "SORTIE"
  | "NOUVEAU"
  | "REFUS"
  | "ABSENT";

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
