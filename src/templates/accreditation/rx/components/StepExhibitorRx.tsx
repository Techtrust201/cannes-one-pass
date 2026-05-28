"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { deriveSpaceFromSector } from "../config";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

interface ExhibitorOption {
  id: string;
  name: string;
  stand: string;
  sector: string | null;
  zone: string | null;
}

interface RxEventOption {
  id: string;
  slug: string;
  name: string;
}

/**
 * Step 1 RX — Sélection de l'exposant.
 *
 * - Événement RX résolu implicitement : s'il n'y a qu'un seul événement RX
 *   actif (cas Yachting 2026), il est auto-sélectionné sans UI. S'il y en a
 *   plusieurs, un sélecteur compact apparaît (RX peut piloter N événements).
 * - Combobox recherchable sur la liste fermée d'exposants pré-importés
 *   (recherche par nom / stand / secteur), groupée visuellement par secteur.
 * - À la sélection : l'espace logistique est auto-déduit du secteur figé de
 *   l'exposant (sauf "PALAIS — PALAIS" → choix Int/Ext fait à l'étape
 *   Livraison).
 *
 * Tram visuelle strictement identique au Palais (mêmes classes Tailwind).
 */
export function StepExhibitorRx({
  data,
  update,
  onValidityChange,
  orgSlug,
}: StepProps<RxFormData>) {
  const { stepOne } = data;
  const [events, setEvents] = useState<RxEventOption[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [exhibitors, setExhibitors] = useState<ExhibitorOption[]>([]);
  const [loadingExhibitors, setLoadingExhibitors] = useState(false);
  const [query, setQuery] = useState(
    stepOne.exhibitorName
      ? `${stepOne.exhibitorName} · ${stepOne.exhibitorStand}`
      : ""
  );
  const [open, setOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement | null>(null);

  // 1) Résolution des événements RX actifs.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events?active=true&espace=${encodeURIComponent(orgSlug)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: RxEventOption[]) => {
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setEvents(arr);
        setEventsLoaded(true);
        // Auto-sélection si un seul event actif et aucun déjà choisi.
        if (!stepOne.event && arr.length === 1) {
          update({ stepOne: { ...stepOne, event: arr[0].slug } });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setEventsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  // 2) Chargement des exposants de l'event courant.
  useEffect(() => {
    if (!stepOne.event) {
      setExhibitors([]);
      return;
    }
    let cancelled = false;
    setLoadingExhibitors(true);
    fetch(
      `/api/exhibitors?orgSlug=${encodeURIComponent(orgSlug)}&eventSlug=${encodeURIComponent(stepOne.event)}`
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => !cancelled && setExhibitors(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setExhibitors([]))
      .finally(() => !cancelled && setLoadingExhibitors(false));
    return () => {
      cancelled = true;
    };
  }, [orgSlug, stepOne.event]);

  // Fermeture du panneau au clic extérieur.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Changer (ou effacer) l'exposant réinitialise systématiquement les
  // livraisons et la manutention : l'espace/les catégories diffèrent d'un
  // exposant à l'autre, et il ne faut jamais reporter les véhicules d'une
  // demande précédente (sinon double-comptage à la soumission).
  const RESET_DOWNSTREAM: Partial<RxFormData> = {
    stepTwo: { categories: [] },
    stepThree: { manutentionProvider: "", scalesAcknowledged: false, consent: false },
  };

  const selectExhibitor = (ex: ExhibitorOption | null) => {
    if (!ex) {
      update({
        stepOne: {
          ...stepOne,
          exhibitorId: "",
          exhibitorName: "",
          exhibitorStand: "",
          exhibitorSector: "",
          space: "",
        },
        ...RESET_DOWNSTREAM,
      });
      return;
    }
    const derived = deriveSpaceFromSector(ex.sector ?? "");
    update({
      stepOne: {
        ...stepOne,
        exhibitorId: ex.id,
        exhibitorName: ex.name,
        exhibitorStand: ex.stand,
        exhibitorSector: ex.sector ?? "",
        space: derived.requiresUserChoice ? derived.space ?? "" : derived.space ?? "",
      },
      ...RESET_DOWNSTREAM,
    });
    setQuery(`${ex.name} · ${ex.stand}`);
    setOpen(false);
  };

  // Filtrage + regroupement par secteur (façon maquette).
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = exhibitors.filter((ex) => {
      if (stepOne.exhibitorId && `${ex.name} · ${ex.stand}` === query) return true;
      if (!q) return true;
      const hay = `${ex.name} ${ex.stand} ${ex.sector ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    const map = new Map<string, ExhibitorOption[]>();
    for (const ex of matching) {
      const key = ex.sector || "Autres";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ex);
    }
    // Limite d'affichage pour la perf (≈ 450 exposants).
    let count = 0;
    const out: Array<{ sector: string; items: ExhibitorOption[] }> = [];
    for (const [sector, items] of map) {
      if (count >= 60) break;
      const slice = items.slice(0, 60 - count);
      count += slice.length;
      out.push({ sector, items: slice });
    }
    return out;
  }, [exhibitors, query, stepOne.exhibitorId]);

  const isValid = !!stepOne.event && !!stepOne.exhibitorId;
  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const noEvents = eventsLoaded && events.length === 0;

  return (
    <div className="flex flex-col w-full gap-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          Sélection de l&apos;exposant
        </h2>
        <p className="text-sm text-gray-500">
          Choisissez votre société dans la liste officielle.
        </p>
      </div>

      {noEvents && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          Aucun événement actif n&apos;est ouvert aux accréditations pour le
          moment. Contactez l&apos;organisateur.
        </div>
      )}

      {/* Sélecteur d'événement : visible seulement si plusieurs events RX actifs */}
      {events.length > 1 && (
        <div className="space-y-1">
          <label className="text-sm font-semibold text-gray-700">
            Événement <span className="text-red-500">*</span>
          </label>
          <select
            value={stepOne.event}
            onChange={(e) =>
              update({
                stepOne: {
                  ...stepOne,
                  event: e.target.value,
                  exhibitorId: "",
                  exhibitorName: "",
                  exhibitorStand: "",
                  exhibitorSector: "",
                  space: "",
                },
              })
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— Choisir un événement —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.slug}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Combobox exposant recherchable */}
      <div className="space-y-1 relative" ref={comboRef}>
        <label htmlFor="rx-exhibitor" className="text-sm font-semibold text-gray-700">
          Exposant <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="rx-exhibitor"
            autoComplete="off"
            spellCheck={false}
            placeholder="Rechercher par nom ou n° de stand…"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (stepOne.exhibitorId) selectExhibitor(null);
            }}
            disabled={!stepOne.event || loadingExhibitors}
            className={cn(
              "w-full rounded-md px-3 py-2 pr-9 shadow-sm focus:ring-primary focus:border-primary text-base sm:text-sm",
              !stepOne.exhibitorId ? "border-gray-300" : "border-green-400 bg-green-50/40"
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                selectExhibitor(null);
                setOpen(true);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm"
              aria-label="Effacer"
            >
              ✕
            </button>
          )}
        </div>

        {open && stepOne.event && (
          <div className="absolute z-30 mt-1 w-full max-h-[55vh] overflow-y-auto rounded-md border border-gray-200 bg-white shadow-xl">
            {loadingExhibitors ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                Chargement des exposants…
              </div>
            ) : grouped.length === 0 ? (
              <div className="px-3 py-6 text-sm text-gray-500 text-center">
                Aucun exposant trouvé
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.sector}>
                  <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                    {group.sector}
                  </div>
                  {group.items.map((ex) => (
                    <button
                      type="button"
                      key={ex.id}
                      onClick={() => selectExhibitor(ex)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 border-b border-gray-50",
                        stepOne.exhibitorId === ex.id && "bg-primary/5 font-semibold"
                      )}
                    >
                      <span className="truncate">{ex.name}</span>
                      <span className="shrink-0 text-[11px] font-semibold text-gray-700 bg-gray-100 rounded-full px-2 py-0.5">
                        {ex.zone || ex.stand}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Panneau récap de l'exposant sélectionné */}
      {stepOne.exhibitorId && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {stepOne.exhibitorName}
            </div>
            {stepOne.exhibitorSector && (
              <div className="text-xs text-gray-500 truncate">
                {stepOne.exhibitorSector}
              </div>
            )}
          </div>
          <div className="shrink-0 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">
              N° de stand
            </div>
            <div className="text-base font-bold text-gray-900">
              {stepOne.exhibitorStand}
            </div>
          </div>
        </div>
      )}

      {!isValid && stepOne.event && (
        <p className="text-gray-400 text-xs text-center">
          Sélectionnez votre exposant pour continuer.
        </p>
      )}
    </div>
  );
}
