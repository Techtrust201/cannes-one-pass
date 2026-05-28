"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { EventCarousel } from "./EventCarousel";
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

/**
 * Step 1 RX — Identification :
 * 1. Sélection de l'event RX dans le carrousel (filtré `?espace=rx`).
 * 2. Combobox exposant : auto-déduction de l'espace depuis le secteur.
 * 3. Coordonnées du responsable du stand (nom, prénom, email, téléphone).
 *
 * Tram visuelle strictement identique au Palais : mêmes classes Tailwind,
 * même grid, même footer de validation, mêmes inputs.
 */
export function StepOneRx({ data, update, onValidityChange, orgSlug }: StepProps<RxFormData>) {
  const { stepOne } = data;
  const [exhibitors, setExhibitors] = useState<ExhibitorOption[]>([]);
  const [loadingExhibitors, setLoadingExhibitors] = useState(false);
  const [exhibitorQuery, setExhibitorQuery] = useState(
    stepOne.exhibitorName ? `${stepOne.exhibitorName} — ${stepOne.exhibitorStand}` : ""
  );

  // Charge les exposants à chaque changement d'event RX.
  useEffect(() => {
    if (!stepOne.event) {
      setExhibitors([]);
      return;
    }
    let cancelled = false;
    setLoadingExhibitors(true);
    fetch(`/api/exhibitors?orgSlug=${orgSlug}&eventSlug=${encodeURIComponent(stepOne.event)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        setExhibitors(Array.isArray(data) ? data : []);
      })
      .catch(() => !cancelled && setExhibitors([]))
      .finally(() => !cancelled && setLoadingExhibitors(false));
    return () => {
      cancelled = true;
    };
  }, [orgSlug, stepOne.event]);

  const setEvent = (slug: string) => {
    if (slug !== stepOne.event) {
      update({
        stepOne: {
          ...stepOne,
          event: slug,
          exhibitorId: "",
          exhibitorName: "",
          exhibitorStand: "",
          exhibitorSector: "",
          space: "",
        },
      });
      setExhibitorQuery("");
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
        },
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
        space: derived.requiresUserChoice ? "" : derived.space ?? "",
      },
    });
    setExhibitorQuery(`${ex.name} — ${ex.stand}`);
  };

  const contact = stepOne.contact;
  const setContact = (patch: Partial<typeof contact>) => {
    update({ stepOne: { ...stepOne, contact: { ...contact, ...patch } } });
  };

  const filteredExhibitors = useMemo(() => {
    const q = exhibitorQuery.trim().toLowerCase();
    if (!q) return exhibitors.slice(0, 15);
    return exhibitors
      .filter(
        (ex) =>
          ex.name.toLowerCase().includes(q) ||
          ex.stand.toLowerCase().includes(q) ||
          (ex.sector ?? "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [exhibitors, exhibitorQuery]);

  const isContactValid =
    contact.firstName.trim() &&
    contact.lastName.trim() &&
    /.+@.+\..+/.test(contact.email) &&
    contact.phoneNumber.trim();

  const isValid =
    !!stepOne.event && !!stepOne.exhibitorId && !!isContactValid;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Bloc 1 : carrousel d'events RX */}
      <div className="flex flex-col items-center justify-center w-full">
        <p className="text-sm font-medium mb-2 text-center">Choisissez votre événement</p>
        <EventCarousel
          orgSlug={orgSlug}
          selectedSlug={stepOne.event}
          onSelect={setEvent}
        />
      </div>

      {/* Bloc 2 : combobox exposant */}
      <div className="space-y-1 relative">
        <label htmlFor="exhibitor" className="text-sm font-semibold text-gray-700">
          Exposant <span className="text-red-500">*</span>
        </label>
        <input
          id="exhibitor"
          autoComplete="off"
          placeholder="Tapez le nom ou le stand…"
          value={exhibitorQuery}
          onChange={(e) => {
            setExhibitorQuery(e.target.value);
            if (stepOne.exhibitorId) selectExhibitor(null);
          }}
          disabled={!stepOne.event || loadingExhibitors}
          className={cn(
            "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
            !stepOne.exhibitorId ? "border-red-500" : "border-gray-300"
          )}
        />
        {!stepOne.exhibitorId && exhibitorQuery.length > 0 && filteredExhibitors.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {filteredExhibitors.map((ex) => (
              <li
                key={ex.id}
                onClick={() => selectExhibitor(ex)}
                className="cursor-pointer px-3 py-2 hover:bg-gray-100 text-sm"
              >
                <span className="font-medium">{ex.name}</span>
                <span className="text-gray-500 text-xs ml-2">
                  {ex.stand}
                  {ex.sector ? ` · ${ex.sector}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {stepOne.exhibitorId && (
          <p className="text-xs text-gray-500 mt-1">
            Stand sélectionné : <strong>{stepOne.exhibitorStand}</strong>{" "}
            {stepOne.exhibitorSector ? `(${stepOne.exhibitorSector})` : ""}
          </p>
        )}
      </div>

      {/* Bloc 3 : contact responsable */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">
          Responsable logistique du stand
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              value={contact.lastName}
              onChange={(e) => setContact({ lastName: e.target.value })}
              placeholder="Dupont"
              autoComplete="family-name"
              className={cn(
                "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                !contact.lastName.trim() ? "border-red-500" : "border-gray-300"
              )}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">
              Prénom <span className="text-red-500">*</span>
            </label>
            <input
              value={contact.firstName}
              onChange={(e) => setContact({ firstName: e.target.value })}
              placeholder="Jean"
              autoComplete="given-name"
              className={cn(
                "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                !contact.firstName.trim() ? "border-red-500" : "border-gray-300"
              )}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-semibold text-gray-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ email: e.target.value })}
              placeholder="jean.dupont@exemple.com"
              autoComplete="email"
              className={cn(
                "w-full rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                !/.+@.+\..+/.test(contact.email) ? "border-red-500" : "border-gray-300"
              )}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-semibold text-gray-700">
              Téléphone <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                value={contact.phoneCode}
                onChange={(e) => setContact({ phoneCode: e.target.value })}
                className="w-20 rounded-md px-3 py-2 border border-gray-300 shadow-sm"
                placeholder="+33"
              />
              <input
                value={contact.phoneNumber}
                onChange={(e) => setContact({ phoneNumber: e.target.value })}
                placeholder="612345678"
                autoComplete="tel"
                className={cn(
                  "flex-1 rounded-md px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                  !contact.phoneNumber.trim() ? "border-red-500" : "border-gray-300"
                )}
              />
            </div>
          </div>
        </div>
      </div>

      {!isValid && (
        <p className="text-red-500 text-sm text-center">
          Complétez tous les champs obligatoires pour passer à l&apos;étape suivante.
        </p>
      )}
    </div>
  );
}
