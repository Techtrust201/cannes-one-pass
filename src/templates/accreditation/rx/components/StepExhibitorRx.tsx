"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formInputClass, formLabelClass } from "@/lib/form-styles";
import { AnchoredDropdown } from "@/components/ui/AnchoredDropdown";
import EventCarouselSelector from "@/components/accreditation/EventCarouselSelector";
import type { EventOption } from "@/components/accreditation/EventCarouselSelector";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
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

interface LocationOption {
  id: string;
  type: "TERRE" | "FLOT" | "STAND";
  code: string;
  portCode: string | null;
  sectorCode: string | null;
  logisticSpace: string | null;
}

const LOCATION_TYPE_LABEL_KEY: Record<LocationOption["type"], "typeTerre" | "typeFlot" | "typeStand"> = {
  TERRE: "typeTerre",
  FLOT: "typeFlot",
  STAND: "typeStand",
};

/**
 * Step 1 RX — Sélection de l'événement puis de l'exposant.
 *
 * - Événement choisi via le carrousel visuel partagé avec le Palais
 *   (`EventCarouselSelector`), scopé strictement à l'organisation RX.
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
  mode = "public",
}: StepProps<RxFormData>) {
  const { t } = useTranslation();
  const { stepOne } = data;
  const [exhibitors, setExhibitors] = useState<ExhibitorOption[]>([]);
  const [loadingExhibitors, setLoadingExhibitors] = useState(false);
  const [noEvents, setNoEvents] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationsFetchedForId, setLocationsFetchedForId] = useState<string | null>(null);
  const [query, setQuery] = useState(
    stepOne.exhibitorName
      ? `${stepOne.exhibitorName} · ${stepOne.exhibitorStand}`
      : ""
  );
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // Chargement des exposants de l'event courant.
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

  // Changer (ou effacer) l'exposant réinitialise systématiquement les
  // livraisons et la manutention : l'espace/les catégories diffèrent d'un
  // exposant à l'autre, et il ne faut jamais reporter les véhicules d'une
  // demande précédente (sinon double-comptage à la soumission).
  const RESET_DOWNSTREAM: Partial<RxFormData> = {
    stepTwo: { categories: [] },
    stepThree: { manutentionProvider: "", scalesAcknowledged: false, consent: false },
  };

  // Champs référentiel vides — utilisés à chaque changement d'exposant, pour
  // ne jamais reporter l'emplacement d'un exposant précédent.
  const EMPTY_LOCATION_FIELDS = {
    exhibitorLocationId: "",
    locationLabel: "",
    locationType: "" as const,
    portCode: "",
    sectorCode: "",
    logisticSpace: "",
  };

  // Phase 6 — Chargement des emplacements (`ExhibitorLocation`) de l'exposant
  // sélectionné. Purement additif : si aucun emplacement n'a encore été
  // importé pour cet exposant (fonctionnement legacy, avant cutover Phase 9),
  // la liste reste vide et le formulaire continue de fonctionner exactement
  // comme aujourd'hui (aucun blocage, aucun stand inventé).
  useEffect(() => {
    if (!stepOne.exhibitorId || !stepOne.event) {
      setLocations([]);
      setLocationsFetchedForId(null);
      return;
    }
    let cancelled = false;
    setLoadingLocations(true);
    fetch(
      `/api/exhibitors/${encodeURIComponent(stepOne.exhibitorId)}/locations?orgSlug=${encodeURIComponent(orgSlug)}&eventSlug=${encodeURIComponent(stepOne.event)}`
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((d: LocationOption[]) => {
        if (cancelled) return;
        const list = Array.isArray(d) ? d : [];
        setLocations(list);
        setLocationsFetchedForId(stepOne.exhibitorId);
        // Auto-sélection si un seul emplacement actif référencé.
        if (list.length === 1 && !stepOne.exhibitorLocationId) {
          const loc = list[0];
          update({
            stepOne: {
              ...stepOne,
              exhibitorLocationId: loc.id,
              locationLabel: loc.code,
              locationType: loc.type,
              portCode: loc.portCode ?? "",
              sectorCode: loc.sectorCode ?? "",
              logisticSpace: loc.logisticSpace ?? "",
            },
          });
        }
      })
      .catch(() => !cancelled && setLocations([]))
      .finally(() => !cancelled && setLoadingLocations(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, stepOne.event, stepOne.exhibitorId]);

  const selectLocation = (loc: LocationOption) => {
    update({
      stepOne: {
        ...stepOne,
        exhibitorLocationId: loc.id,
        locationLabel: loc.code,
        locationType: loc.type,
        portCode: loc.portCode ?? "",
        sectorCode: loc.sectorCode ?? "",
        logisticSpace: loc.logisticSpace ?? "",
      },
    });
  };

  // Changement d'événement via le carrousel : on réinitialise l'exposant
  // sélectionné (et l'aval) uniquement si un exposant était réellement choisi,
  // afin de ne pas perturber l'auto-sélection initiale ni la restauration d'un
  // brouillon. L'eventId est stocké en même temps que le slug pour permettre
  // aux étapes suivantes (Livraison/Reprise) d'appeler /api/rx/availability.
  const handleEventSelected = (ev: EventOption) => {
    if (ev.key === stepOne.event) return;
    if (stepOne.exhibitorId) {
      setQuery("");
      update({
        stepOne: {
          ...stepOne,
          event: ev.key,
          eventId: ev.id,
          exhibitorId: "",
          exhibitorName: "",
          exhibitorStand: "",
          exhibitorSector: "",
          space: "",
          ...EMPTY_LOCATION_FIELDS,
        },
        ...RESET_DOWNSTREAM,
      });
    } else {
      update({ stepOne: { ...stepOne, event: ev.key, eventId: ev.id } });
    }
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
          ...EMPTY_LOCATION_FIELDS,
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
        // Emplacement vidé : rechargé par l'effet ci-dessous pour ce nouvel
        // exposant (auto-sélection ou choix explicite).
        ...EMPTY_LOCATION_FIELDS,
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
      const key = ex.sector || t.rx.exhibitor.othersSector;
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
  }, [exhibitors, query, stepOne.exhibitorId, t.rx.exhibitor.othersSector]);

  // Si plusieurs emplacements existent réellement pour cet exposant (donnée
  // désambiguïsée requise), le choix devient obligatoire pour continuer. Si
  // aucun emplacement n'est référencé (0), on ne bloque jamais : c'est le
  // fonctionnement legacy actuel (avant import référentiel/cutover Phase 9).
  const locationChoicePending =
    locationsFetchedForId === stepOne.exhibitorId &&
    locations.length > 1 &&
    !stepOne.exhibitorLocationId;

  const isValid = !!stepOne.event && !!stepOne.exhibitorId && !locationChoicePending;
  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  return (
    <div className="flex flex-col w-full gap-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          {t.rx.exhibitor.title}
        </h2>
        <p className="text-sm text-gray-500">{t.rx.exhibitor.subtitle}</p>
      </div>

      {noEvents && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {t.rx.exhibitor.noEventsBanner}
        </div>
      )}

      {/* Sélecteur d'événement : carrousel visuel scopé à l'organisation RX */}
      <EventCarouselSelector
        orgSlug={orgSlug}
        value={stepOne.event}
        onEventSelected={handleEventSelected}
        onEventsResolved={(count) => setNoEvents(count === 0)}
      />

      {/* Combobox exposant recherchable */}
      <div className="space-y-1">
        <label htmlFor="rx-exhibitor" className={formLabelClass}>
          {t.rx.exhibitor.label} <span className="text-red-500">*</span>
        </label>
        <div className="relative" ref={anchorRef}>
          <input
            id="rx-exhibitor"
            autoComplete="off"
            spellCheck={false}
            placeholder={t.rx.exhibitor.searchPlaceholder}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (stepOne.exhibitorId) selectExhibitor(null);
            }}
            disabled={!stepOne.event || loadingExhibitors}
            className={cn(
              formInputClass(false, "pr-9"),
              stepOne.exhibitorId && "border-green-500 bg-green-50/40"
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
              aria-label={t.rx.exhibitor.clear}
            >
              ✕
            </button>
          )}
        </div>

        <AnchoredDropdown
          open={open && !!stepOne.event}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          bottomChrome={mode === "logisticien" ? "logisticien" : "public"}
        >
          {loadingExhibitors ? (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">
              {t.rx.exhibitor.loading}
            </div>
          ) : grouped.length === 0 ? (
            <div className="px-3 py-6 text-sm text-gray-500 text-center">
              {t.rx.exhibitor.notFound}
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
        </AnchoredDropdown>
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
              {t.rx.exhibitor.standNumber}
            </div>
            <div className="text-base font-bold text-gray-900">
              {stepOne.exhibitorStand}
            </div>
          </div>
        </div>
      )}

      {/* Phase 6 — Choix de l'emplacement référentiel (additif, jamais
          bloquant si aucune donnée n'existe encore). */}
      {stepOne.exhibitorId && !loadingLocations && locations.length > 1 && (
        <div className="space-y-2">
          <label className={formLabelClass}>
            {t.rx.exhibitor.location.title} <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500">{t.rx.exhibitor.location.chooseHint}</p>
          <div className="space-y-1.5">
            {locations.map((loc) => (
              <button
                type="button"
                key={loc.id}
                onClick={() => selectLocation(loc)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 rounded-lg border-2 p-3 text-left transition",
                  stepOne.exhibitorLocationId === loc.id
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                <span className="text-sm font-semibold text-gray-800">{loc.code}</span>
                <span className="shrink-0 flex items-center gap-2 text-[11px] font-semibold text-gray-600">
                  <span className="bg-gray-100 rounded-full px-2 py-0.5">
                    {t.rx.exhibitor.location[LOCATION_TYPE_LABEL_KEY[loc.type]]}
                  </span>
                  {loc.portCode && (
                    <span className="bg-gray-100 rounded-full px-2 py-0.5">{loc.portCode}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stepOne.exhibitorId &&
        !loadingLocations &&
        locationsFetchedForId === stepOne.exhibitorId &&
        locations.length === 0 && (
          <p className="text-xs text-gray-400 italic">{t.rx.exhibitor.location.noneHint}</p>
        )}

      {!isValid && stepOne.event && (
        <p className="text-gray-400 text-xs text-center">
          {t.rx.exhibitor.selectToContinue}
        </p>
      )}
    </div>
  );
}
