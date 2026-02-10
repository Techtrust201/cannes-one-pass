import type { HistoryAction } from "@prisma/client";

export interface HistoryEntryData {
  accreditationId: string;
  action: HistoryAction;
  field?: string;
  oldValue?: string;
  newValue?: string;
  description: string;
  userId?: string;
  userAgent?: string;
}

// ─── Traductions lisibles ────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ATTENTE: "En attente",
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  NOUVEAU: "Nouveau",
  REFUS: "Refusé",
  ABSENT: "Absent",
};

const ZONE_LABELS: Record<string, string> = {
  LA_BOCCA: "La Bocca",
  PALAIS_DES_FESTIVALS: "Palais des Festivals",
  PANTIERO: "Pantiero",
  MACE: "Macé",
};

const FIELD_LABELS: Record<string, string> = {
  company: "Entreprise",
  stand: "Stand",
  unloading: "Déchargement",
  event: "Événement",
  message: "Message",
  currentZone: "Zone",
  vehicles: "Véhicules",
  status: "Statut",
  email: "E-mail",
};

function translateStatus(status: string): string {
  return STATUS_LABELS[status] || status;
}

function translateZone(zone: string): string {
  if (!zone) return "Aucune";
  return ZONE_LABELS[zone] || zone;
}

function translateField(field: string): string {
  return FIELD_LABELS[field] || field;
}

/** Traduit une valeur en fonction du champ concerné */
function translateValue(field: string, value: string): string {
  if (!value) return "Aucune";
  if (field === "status") return translateStatus(value);
  if (field === "currentZone") return translateZone(value);
  return value;
}

// ─── Appel API (côté client ET serveur via fetch) ────────────────────

export async function addHistoryEntry(data: HistoryEntryData) {
  try {
    // Côté serveur → écriture directe via le module serveur
    if (typeof window === "undefined") {
      const { writeHistoryDirect } = await import("@/lib/history-server");
      await writeHistoryDirect(data);
      return true;
    }
    // Côté client → fetch API
    const response = await fetch(
      `/api/accreditations/${data.accreditationId}/history`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      console.error("Erreur lors de l'ajout de l'entrée d'historique");
    }

    return response.ok;
  } catch (error) {
    console.error("Erreur lors de l'ajout de l'entrée d'historique:", error);
    return false;
  }
}

export async function getAccreditationHistory(accreditationId: string) {
  try {
    const response = await fetch(
      `/api/accreditations/${accreditationId}/history`
    );

    if (!response.ok) {
      throw new Error("Erreur lors de la récupération de l'historique");
    }

    return await response.json();
  } catch (error) {
    console.error("Erreur lors de la récupération de l'historique:", error);
    return [];
  }
}

// ─── Fonctions utilitaires pour créer des entrées d'historique ───────

export function createStatusChangeEntry(
  accreditationId: string,
  oldStatus: string,
  newStatus: string,
  userId?: string
): HistoryEntryData {
  return {
    accreditationId,
    action: "STATUS_CHANGED",
    field: "status",
    oldValue: oldStatus,
    newValue: newStatus,
    description: `Statut modifié : ${translateStatus(oldStatus)} → ${translateStatus(newStatus)}`,
    userId,
    userAgent:
      typeof window !== "undefined" ? window.navigator.userAgent : undefined,
  };
}

export function createEmailSentEntry(
  accreditationId: string,
  email: string,
  userId?: string
): HistoryEntryData {
  return {
    accreditationId,
    action: "EMAIL_SENT",
    field: "email",
    newValue: email,
    description: `E-mail envoyé à ${email}`,
    userId,
    userAgent:
      typeof window !== "undefined" ? window.navigator.userAgent : undefined,
  };
}

export function createVehicleAddedEntry(
  accreditationId: string,
  vehiclePlate: string,
  userId?: string
): HistoryEntryData {
  return {
    accreditationId,
    action: "VEHICLE_ADDED",
    field: "vehicles",
    newValue: vehiclePlate,
    description: `Véhicule ${vehiclePlate} ajouté`,
    userId,
    userAgent:
      typeof window !== "undefined" ? window.navigator.userAgent : undefined,
  };
}

export function createVehicleRemovedEntry(
  accreditationId: string,
  vehiclePlate: string,
  userId?: string
): HistoryEntryData {
  return {
    accreditationId,
    action: "VEHICLE_REMOVED",
    field: "vehicles",
    oldValue: vehiclePlate,
    description: `Véhicule ${vehiclePlate} supprimé`,
    userId,
    userAgent:
      typeof window !== "undefined" ? window.navigator.userAgent : undefined,
  };
}

export function createInfoUpdatedEntry(
  accreditationId: string,
  field: string,
  oldValue: string,
  newValue: string,
  userId?: string
): HistoryEntryData {
  const label = translateField(field);
  const oldDisplay = translateValue(field, oldValue);
  const newDisplay = translateValue(field, newValue);

  // Cas spécial pour les véhicules : message simplifié
  if (field === "vehicles") {
    return {
      accreditationId,
      action: "INFO_UPDATED",
      field,
      oldValue,
      newValue,
      description: "Véhicules mis à jour",
      userId,
      userAgent:
        typeof window !== "undefined" ? window.navigator.userAgent : undefined,
    };
  }

  return {
    accreditationId,
    action: "INFO_UPDATED",
    field,
    oldValue,
    newValue,
    description: `${label} modifié : ${oldDisplay} → ${newDisplay}`,
    userId,
    userAgent:
      typeof window !== "undefined" ? window.navigator.userAgent : undefined,
  };
}

export function createCreatedEntry(
  accreditationId: string,
  userId?: string
): HistoryEntryData {
  return {
    accreditationId,
    action: "CREATED",
    description: "Accréditation créée",
    userId,
    userAgent:
      typeof window !== "undefined" ? window.navigator.userAgent : undefined,
  };
}
