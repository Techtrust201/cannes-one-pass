// --- Zones ---
export type Zone = "LA_BOCCA" | "PALAIS_DES_FESTIVALS" | "PANTIERO" | "MACE";
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
}
