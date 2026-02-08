import type { Zone } from "@/types";
import { getZoneLabel, ZONE_COLORS } from "@/lib/zone-utils";

/** Dot color per zone for compact display */
const ZONE_DOT: Record<Zone, string> = {
  LA_BOCCA: "bg-orange-500",
  PALAIS_DES_FESTIVALS: "bg-green-500",
  PANTIERO: "bg-blue-500",
  MACE: "bg-purple-500",
};

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
    bg: "bg-sky-100",
    text: "text-sky-700",
    label: "Attente",
  },
  ENTREE: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    label: "Entrée",
  },
  SORTIE: {
    bg: "bg-slate-200",
    text: "text-slate-700",
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
  zone?: Zone | null;
  /** compact = table mode (single line, small). full = detail mode (with zone badge). */
  compact?: boolean;
}

export default function StatusPill({ status, zone, compact = false }: Props) {
  const cfg = STATUS_CFG[status] ?? {
    bg: "bg-gray-200",
    text: "text-gray-700",
    label: status,
  };

  if (compact) {
    // --- Compact mode for table rows: single-line pill with zone dot ---
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold leading-none whitespace-nowrap ${cfg.bg} ${cfg.text}`}
        title={zone ? `${cfg.label} – ${getZoneLabel(zone)}` : cfg.label}
      >
        {zone && (
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${ZONE_DOT[zone] ?? "bg-gray-400"}`}
          />
        )}
        {!zone && (
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
        {zone && (
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${ZONE_DOT[zone] ?? "bg-gray-400"}`}
          />
        )}
        {cfg.label}
      </span>
      {zone && (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${ZONE_COLORS[zone].bg} ${ZONE_COLORS[zone].text}`}
        >
          {zoneLabel}
        </span>
      )}
    </span>
  );
}
