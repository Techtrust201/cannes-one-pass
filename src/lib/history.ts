import type { HistoryAction } from "@prisma/client";

interface HistoryEntryData {
  accreditationId: string;
  action: HistoryAction;
  field?: string;
  oldValue?: string;
  newValue?: string;
  description: string;
  userId?: string;
  userAgent?: string;
}

export async function addHistoryEntry(data: HistoryEntryData) {
  try {
    // Détecte si on est côté serveur (Node) ou client (browser)
    const isServer = typeof window === "undefined";
    let base = "";
    if (isServer) {
      // Import dynamique pour éviter le bundling côté client
      const { getBaseUrl } = await import("./base-url");
      base = getBaseUrl();
    }
    const response = await fetch(
      `${base}/api/accreditations/${data.accreditationId}/history`,
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

// Fonctions utilitaires pour créer des entrées d'historique
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
    description: `Statut changé de ${oldStatus} à ${newStatus}`,
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
  return {
    accreditationId,
    action: "INFO_UPDATED",
    field,
    oldValue,
    newValue,
    description: `${field} modifié de "${oldValue}" à "${newValue}"`,
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
