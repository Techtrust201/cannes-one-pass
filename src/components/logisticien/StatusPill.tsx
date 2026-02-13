import { getZoneLabel, getZoneColors } from "@/lib/zone-utils";

const STATUS_CFG: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  NOUVEAU: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    label: "Nouveau",
  },
  ATTENTE: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    label: "Attente",
  },
  ENTREE: {
    bg: "bg-green-100",
    text: "text-green-700",
    label: "Entrée",
  },
  SORTIE: {
    bg: "bg-red-100",
    text: "text-red-700",
    label: "Sortie",
  },
  REFUS: {
    bg: "bg-red-100",
    text: "text-red-700",
    label: "Refusé",
  },
  ABSENT: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    label: "Absent",
  },
};

interface Props {
  status: string;
  zone?: string | null;
  /** compact = table mode (single line, small). full = detail mode (with zone badge). */
  compact?: boolean;
}

export default function StatusPill({ status, zone, compact = false }: Props) {
  const cfg = STATUS_CFG[status] ?? {
    bg: "bg-gray-200",
    text: "text-gray-700",
    label: status,
  };

  const zoneColor = zone ? getZoneColors(zone) : null;

  if (compact) {
    // --- Compact mode for table rows: single-line pill with zone dot ---
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold leading-none whitespace-nowrap ${cfg.bg} ${cfg.text}`}
        title={zone ? `${cfg.label} – ${getZoneLabel(zone)}` : cfg.label}
      >
        {zone && zoneColor ? (
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${zoneColor.dot}`}
          />
        ) : (
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
        )}
        {cfg.label}
      </span>
    );
  }

  // --- Full mode for detail views ---
  const zoneLabel = zone ? getZoneLabel(zone) : null;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${cfg.bg} ${cfg.text}`}
      >
        {zone && zoneColor && (
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${zoneColor.dot}`}
          />
        )}
        {cfg.label}
      </span>
      {zone && zoneColor && (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${zoneColor.bg} ${zoneColor.text}`}
        >
          {zoneLabel}
        </span>
      )}
    </span>
  );
}
