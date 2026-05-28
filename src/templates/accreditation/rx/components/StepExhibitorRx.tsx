"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { deriveSpaceFromSector, RX_SPACES } from "../config";
import type { StepProps } from "../../types";
import type { RxFormData, RxSpaceId } from "../types";

interface ExhibitorOption {
  id: string;
  name: string;
  stand: string;
  sector: string | null;
  zone: string | null;
}

/**
 * Step 1 RX — Sélection de l'exposant.
 *
 * Aligné sur la card 1 de la maquette validée :
 * - Combobox unique (recherche par nom/stand/secteur, groupes par secteur)
 * - À la sélection : auto-déduction de l'espace logistique depuis le secteur
 * - Si l'espace = PALAIS_CHOICE (PALAIS — PALAIS) : choix Int/Ext requis
 *
 * Résout en parallèle l'event RX actif (premier event actif de l'org RX)
 * pour éviter d'avoir un step "Event" séparé : la maquette suppose un
 * unique event implicite (Yachting 2026).
 */
export function StepExhibitorRx({
  data,
  update,
  onValidityChange,
  orgSlug,
}: StepProps<RxFormData>) {
  const { exhibitor } = data;
  const [exhibitors, setExhibitors] = useState<ExhibitorOption[]>([]);
  const [loadingExhibitors, setLoadingExhibitors] = useState(false);
  const [exhibitorQuery, setExhibitorQuery] = useState(
    exhibitor.name && exhibitor.stand ? `${exhibitor.name} — ${exhibitor.stand}` : ""
  );
  const [eventError, setEventError] = useState<string | null>(null);
  const [resolvingEvent, setResolvingEvent] = useState(false);

  // 1) Résoud l'event RX actif au mount (Yachting 2026 implicite).
  useEffect(() => {
    if (exhibitor.eventSlug) return;
    let cancelled = false;
    setResolvingEvent(true);
    fetch(`/api/events?active=true&espace=${encodeURIComponent(orgSlug)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((events) => {
        if (cancelled) return;
        const first = Array.isArray(events) ? events[0] : null;
        if (first?.slug) {
          update({
            exhibitor: { ...exhibitor, eventSlug: first.slug },
          } as Partial<RxFormData>);
        } else {
          setEventError(
            "Aucun événement RX actif. Contactez l'organisateur pour activer la session."
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEventError("Impossible de charger l'événement. Réessayez plus tard.");
        }
      })
      .finally(() => {
        if (!cancelled) setResolvingEvent(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  // 2) Charge la liste d'exposants une fois l'event résolu.
  useEffect(() => {
    if (!exhibitor.eventSlug) {
      setExhibitors([]);
      return;
    }
    let cancelled = false;
    setLoadingExhibitors(true);
    fetch(
      `/api/exhibitors?orgSlug=${encodeURIComponent(orgSlug)}&eventSlug=${encodeURIComponent(exhibitor.eventSlug)}`
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (cancelled) return;
        setExhibitors(Array.isArray(list) ? list : []);
      })
      .catch(() => !cancelled && setExhibitors([]))
      .finally(() => !cancelled && setLoadingExhibitors(false));
    return () => {
      cancelled = true;
    };
  }, [orgSlug, exhibitor.eventSlug]);

  const selectExhibitor = (ex: ExhibitorOption | null) => {
    if (!ex) {
      update({
        exhibitor: {
          ...exhibitor,
          id: "",
          name: "",
          stand: "",
          sector: "",
          zone: "",
          space: "" as RxSpaceId,
          requiresPalaisChoice: false,
        },
      } as Partial<RxFormData>);
      return;
    }
    const derived = deriveSpaceFromSector(ex.sector ?? "");
    const isPalaisChoice = derived.requiresUserChoice;
    update({
      exhibitor: {
        ...exhibitor,
        id: ex.id,
        name: ex.name,
        stand: ex.stand,
        sector: ex.sector ?? "",
        zone: ex.zone ?? "",
        space: isPalaisChoice
          ? ("" as RxSpaceId)
          : ((derived.space ?? "") as RxSpaceId),
        requiresPalaisChoice: isPalaisChoice,
      },
    } as Partial<RxFormData>);
    setExhibitorQuery(`${ex.name} — ${ex.stand}`);
  };

  const setPalaisLoc = (loc: "INTERIEUR_PALAIS" | "EXTERIEUR_PALAIS") => {
    update({
      exhibitor: { ...exhibitor, space: loc, requiresPalaisChoice: false },
    } as Partial<RxFormData>);
  };

  const filteredExhibitors = useMemo(() => {
    const q = exhibitorQuery.trim().toLowerCase();
    if (!q) return exhibitors.slice(0, 20);
    return exhibitors
      .filter((ex) => {
        const hay = `${ex.name} ${ex.stand} ${ex.sector ?? ""} ${ex.zone ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [exhibitors, exhibitorQuery]);

  // Groupes par secteur pour le dropdown (alignement maquette).
  const grouped = useMemo(() => {
    const groups = new Map<string, ExhibitorOption[]>();
    for (const ex of filteredExhibitors) {
      const key = ex.sector || "Autre";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ex);
    }
    return Array.from(groups.entries());
  }, [filteredExhibitors]);

  const spaceLabel = exhibitor.space
    ? RX_SPACES[exhibitor.space]?.label ?? exhibitor.space
    : null;

  const isValid =
    !!exhibitor.eventSlug &&
    !!exhibitor.id &&
    !!exhibitor.space &&
    !exhibitor.requiresPalaisChoice;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  if (eventError) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800">
        <strong>Erreur :</strong> {eventError}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Sélection de l&apos;exposant
        </h2>
        <p className="text-sm text-gray-500">
          Choisissez votre société dans la liste officielle des exposants Yachting.
        </p>
      </div>

      <div className="space-y-1 relative">
        <label htmlFor="exhibitor-search" className="text-sm font-semibold text-gray-700">
          Exposant <span className="text-red-500">*</span>
        </label>
        <input
          id="exhibitor-search"
          autoComplete="off"
          placeholder={
            resolvingEvent
              ? "Chargement…"
              : loadingExhibitors
                ? "Chargement des exposants…"
                : "Rechercher par nom ou n° de stand…"
          }
          value={exhibitorQuery}
          onChange={(e) => {
            setExhibitorQuery(e.target.value);
            if (exhibitor.id) selectExhibitor(null);
          }}
          disabled={resolvingEvent || loadingExhibitors || !exhibitor.eventSlug}
          className={cn(
            "w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
            !exhibitor.id ? "border-red-300" : "border-gray-300"
          )}
        />
        {!exhibitor.id && exhibitorQuery.length > 0 && grouped.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {grouped.map(([sector, options]) => (
              <li key={sector}>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-100">
                  {sector}
                </div>
                {options.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => selectExhibitor(ex)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5 border-b border-gray-100 last:border-b-0 flex items-center justify-between gap-2"
                  >
                    <span className="font-medium text-gray-800 truncate">{ex.name}</span>
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                      {ex.stand}
                    </span>
                  </button>
                ))}
              </li>
            ))}
          </ul>
        )}
        {!exhibitor.id && exhibitorQuery.length > 0 && grouped.length === 0 && !loadingExhibitors && (
          <p className="text-xs text-gray-500 mt-1">Aucun exposant trouvé.</p>
        )}
      </div>

      {exhibitor.id && (
        <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Stand sélectionné
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-gray-800">{exhibitor.name}</div>
              <div className="text-xs text-gray-600 mt-0.5">
                {exhibitor.sector || "Secteur non précisé"}
              </div>
            </div>
            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
              {exhibitor.stand}
            </span>
          </div>
        </div>
      )}

      {exhibitor.id && exhibitor.requiresPalaisChoice && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
          <p className="text-amber-900 mb-3">
            🏛️ Votre stand est dans le <strong>Palais des Festivals</strong>. Précisez son
            emplacement pour afficher les bonnes catégories de livraison.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPalaisLoc("INTERIEUR_PALAIS")}
              className="border-2 border-amber-300 hover:border-primary rounded-xl p-3 text-left transition bg-white"
            >
              <div className="text-xl mb-1">🏛️</div>
              <div className="font-semibold text-gray-800">Intérieur Palais</div>
              <div className="text-xs text-gray-500">À l&apos;intérieur du Palais des Festivals</div>
            </button>
            <button
              type="button"
              onClick={() => setPalaisLoc("EXTERIEUR_PALAIS")}
              className="border-2 border-amber-300 hover:border-primary rounded-xl p-3 text-left transition bg-white"
            >
              <div className="text-xl mb-1">⛺</div>
              <div className="font-semibold text-gray-800">Extérieur Palais</div>
              <div className="text-xs text-gray-500">Esplanade extérieure (Macé, etc.)</div>
            </button>
          </div>
        </div>
      )}

      {exhibitor.id && !exhibitor.requiresPalaisChoice && spaceLabel && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
          📍 <strong>Espace de votre stand :</strong> {spaceLabel}
        </div>
      )}
    </div>
  );
}
