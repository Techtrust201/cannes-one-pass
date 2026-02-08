import type { Zone } from "@/types";
import { getZoneLabel, isFinalDestination, ZONE_COLORS } from "@/lib/zone-utils";
import { truncateText } from "@/lib/utils";

export default function StatusPill({
  status,
  zone,
}: {
  status: string;
  zone?: Zone | null;
}) {
  const map: Record<
    string,
    { bg: string; text: string; full: string; short: string }
  > = {
    NOUVEAU: {
      bg: "bg-[#FFF1CC]",
      text: "text-[#FFAA00]",
      full: "Nouveau",
      short: "Nouv",
    },
    ATTENTE: {
      bg: "bg-[#CCE4FF]",
      text: "text-[#0079FF]",
      full: "Attente",
      short: "Att",
    },
    ENTREE: {
      bg: "bg-[#E0F7F4] border border-[#B2DFDB] shadow-sm",
      text: "text-[#4F587E]",
      full: "Entrée",
      short: "Ent",
    },
    SORTIE: {
      bg: "bg-[#DCDEE5]",
      text: "text-[#4F587E]",
      full: "Sortie",
      short: "Sort",
    },
    REFUS: {
      bg: "bg-[#FCCCCC]",
      text: "text-[#EE0000]",
      full: "Refusé",
      short: "Ref",
    },
    ABSENT: {
      bg: "bg-[#EADAFF]",
      text: "text-[#9747FF]",
      full: "Absent",
      short: "Abs",
    },
  };
  const cfg = map[status] ?? {
    bg: "bg-gray-200",
    text: "text-gray-800",
    full: status,
    short: status.slice(0, 4),
  };

  const zoneLabel = zone ? getZoneLabel(zone) : null;
  const fullLabelRaw = zoneLabel ? `${cfg.full} – ${zoneLabel}` : cfg.full;
  const shortLabelRaw = zoneLabel ? `${cfg.short} – ${zoneLabel}` : cfg.short;
  
  // Tronquer les labels pour éviter les débordements
  const fullLabel = truncateText(fullLabelRaw, 20);
  const shortLabel = truncateText(shortLabelRaw, 15);
  const zoneLabelTruncated = zoneLabel ? truncateText(zoneLabel, 12) : undefined;

  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex justify-center items-center min-w-[90px] h-7 rounded-2xl text-xs font-medium px-4 py-1 ${cfg.bg} ${cfg.text}`}
        style={{ boxShadow: "0 1px 4px 0 rgba(79,88,126,0.07)" }}
        title={fullLabelRaw !== fullLabel ? fullLabelRaw : undefined}
      >
        <span className="hidden lg:inline">{fullLabel}</span>
        <span className="inline lg:hidden">{shortLabel}</span>
      </span>
      {zone && zoneLabel && zoneLabelTruncated && (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${ZONE_COLORS[zone].bg} ${ZONE_COLORS[zone].text}`}
          title={zoneLabel !== zoneLabelTruncated ? zoneLabel : undefined}
        >
          {isFinalDestination(zone) ? "✓ " : "→ "}
          {zoneLabelTruncated}
        </span>
      )}
    </span>
  );
}
