import type { Event, EventStatus } from "@/types";

/** Date de référence pour l'activation accréditation : montage si renseigné, sinon début event. */
export function getAccreditationReferenceDate(event: Event): Date {
  return new Date(event.setupStartDate ?? event.startDate);
}

export function getAccreditationActivationDate(event: Event): Date {
  const ref = getAccreditationReferenceDate(event);
  const activation = new Date(ref);
  activation.setDate(activation.getDate() - event.activationDays);
  return activation;
}

export function getAccreditationVisibilityEnd(event: Event): Date {
  return new Date(event.teardownEndDate ?? event.endDate);
}

export function isEventVisibleForAccreditation(
  event: Event,
  now = new Date()
): boolean {
  if (event.isArchived) return false;
  return (
    now >= getAccreditationActivationDate(event) &&
    now <= getAccreditationVisibilityEnd(event)
  );
}

export function getEventStatus(event: Event): EventStatus {
  if (event.isArchived) return "archived";

  const now = new Date();
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);

  if (now > end) return "finished";
  if (now >= start && now <= end) return "ongoing";

  const activationDate = getAccreditationActivationDate(event);

  if (now >= activationDate) return "active";
  return "upcoming";
}

export function getDaysUntilStart(event: Event): number {
  const now = new Date();
  const ref = getAccreditationReferenceDate(event);
  return Math.ceil((ref.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isEventVisibleInStep1(event: Event): boolean {
  return isEventVisibleForAccreditation(event);
}

export const STATUS_CONFIG: Record<
  EventStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Actif",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  upcoming: {
    label: "À venir",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  ongoing: {
    label: "En cours",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
  finished: {
    label: "Terminé",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
  archived: {
    label: "Archivé",
    className: "bg-gray-100 text-gray-400 border-gray-200",
  },
};
