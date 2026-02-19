import type { Event, EventStatus } from "@/types";

export function getEventStatus(event: Event): EventStatus {
  if (event.isArchived) return "archived";

  const now = new Date();
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);

  if (now > end) return "finished";
  if (now >= start && now <= end) return "ongoing";

  const activationDate = new Date(start);
  activationDate.setDate(activationDate.getDate() - event.activationDays);

  if (now >= activationDate) return "active";
  return "upcoming";
}

export function getDaysUntilStart(event: Event): number {
  const now = new Date();
  const start = new Date(event.startDate);
  return Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isEventVisibleInStep1(event: Event): boolean {
  const status = getEventStatus(event);
  return status === "active" || status === "ongoing";
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
    className: "bg-red-100 text-red-600 border-red-200 line-through",
  },
};
