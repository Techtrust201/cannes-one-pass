"use client";

import type { EmplacementCategory, ActorSource } from "@prisma/client";
import { Sparkles, User, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/category-rules";

const SOURCE_META: Record<
  ActorSource,
  { label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  PUBLIC_FORM: { label: "Saisie exposant", Icon: User },
  LOGISTICIEN: { label: "Agent logistique", Icon: User },
  CSV_IMPORT: { label: "Import CSV", Icon: FileSpreadsheet },
  AUTO_DEDUCTION: { label: "Déduit automatiquement", Icon: Sparkles },
  SUPER_ADMIN: { label: "Super-admin", Icon: ShieldCheck },
  MIGRATION: { label: "Migration", Icon: FileSpreadsheet },
  SYSTEM: { label: "Système", Icon: Sparkles },
};

interface Props {
  category: EmplacementCategory | null | undefined;
  source: ActorSource | null | undefined;
  compact?: boolean;
}

/**
 * Affiche la catégorie d'emplacement et indique visuellement sa provenance
 * (auto-déduction vs saisie manuelle vs CSV).
 */
export default function CategoryBadge({ category, source, compact = false }: Props) {
  if (!category) {
    return compact ? null : (
      <span className="text-xs text-gray-400 italic">Catégorie non définie</span>
    );
  }

  const meta = source ? SOURCE_META[source] : SOURCE_META.SYSTEM;
  const Icon = meta.Icon;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4F587E]/10 text-[#4F587E] text-xs font-semibold px-2.5 py-1">
      <span>{CATEGORY_LABELS[category]}</span>
      {!compact && (
        <span
          className="inline-flex items-center gap-1 text-[10px] text-[#4F587E]/70 pl-1.5 border-l border-[#4F587E]/20"
          title={`Source : ${meta.label}`}
        >
          <Icon size={10} />
          {meta.label}
        </span>
      )}
    </span>
  );
}
