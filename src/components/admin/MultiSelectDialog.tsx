"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";

export interface MultiSelectItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  items: MultiSelectItem[];
  initialSelection: string[];
  onSave: (ids: string[]) => void | Promise<void>;
  saving?: boolean;
}

/**
 * Dialog modal de multi-sélection avec recherche live, adapté mobile/tablette.
 * Les changements ne sont commités qu'au clic sur "Valider" — l'utilisateur
 * peut cocher/décocher librement avant d'envoyer.
 */
export default function MultiSelectDialog({
  open,
  onClose,
  title,
  description,
  items,
  initialSelection,
  onSave,
  saving = false,
}: MultiSelectDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection));
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set(initialSelection));
      setQuery("");
    }
  }, [open, initialSelection]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.sublabel && i.sublabel.toLowerCase().includes(q))
    );
  }, [items, query]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-base truncate">{title}</h3>
              {description && (
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 -mt-1 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#4F587E] focus:border-[#4F587E] outline-none text-sm bg-gray-50"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            <span className="font-semibold text-gray-700">{selected.size}</span>{" "}
            sélectionné{selected.size > 1 ? "s" : ""} sur {items.length}
          </p>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              Aucun résultat
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((item) => {
                const checked = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition min-h-[52px] ${
                        checked ? "bg-[#4F587E]/5" : "hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${
                          checked
                            ? "bg-[#4F587E] border-[#4F587E]"
                            : "border-gray-300"
                        }`}
                      >
                        {checked && <Check size={12} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900 truncate">
                          {item.label}
                        </span>
                        {item.sublabel && (
                          <span className="block text-xs text-gray-500 truncate">
                            {item.sublabel}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 pt-3 pb-5 border-t border-gray-100 flex gap-3"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 disabled:opacity-50 min-h-[44px]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onSave(Array.from(selected))}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#4F587E] text-white font-semibold text-sm hover:bg-[#3B4252] disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
