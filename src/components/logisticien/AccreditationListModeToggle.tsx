"use client";

import { LayoutList, MousePointerClick } from "lucide-react";
import type { AccreditationListMode } from "@/hooks/useAccreditationListMode";

interface Props {
  mode: AccreditationListMode;
  onChange: (mode: AccreditationListMode) => void;
  /** Variante compacte (icônes seules) pour les petits écrans. */
  compact?: boolean;
}

const OPTIONS: {
  value: AccreditationListMode;
  label: string;
  icon: typeof LayoutList;
}[] = [
  { value: "paginated", label: "Pagination", icon: LayoutList },
  { value: "infinite", label: "Défilement continu", icon: MousePointerClick },
];

/**
 * Sélecteur de mode d'affichage (segmented control) : pagination classique vs
 * défilement continu. Intégré dans le header de la liste.
 */
export default function AccreditationListModeToggle({
  mode,
  onChange,
  compact = false,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Mode d'affichage de la liste"
      className="inline-flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
              active
                ? "bg-white text-[#3F4660] shadow-sm"
                : "text-white/80 hover:text-white hover:bg-white/10"
            }`}
          >
            <Icon size={13} />
            {!compact && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
