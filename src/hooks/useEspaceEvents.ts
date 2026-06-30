"use client";

import { useEffect, useState } from "react";

export interface EspaceEventOption {
  slug: string;
  name: string;
}

/**
 * Charge la liste des événements accessibles pour un espace donné
 * (`/api/events?espace=<slug>`), normalisée en `{ slug, name }`.
 *
 * Mutualise le chargement utilisé par le bilan carbone et l'onglet Comptage,
 * pour éviter de dupliquer la logique de fetch + normalisation.
 */
export function useEspaceEvents(espace: string | null): EspaceEventOption[] {
  const [events, setEvents] = useState<EspaceEventOption[]>([]);

  useEffect(() => {
    if (!espace) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/events?espace=${encodeURIComponent(espace)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { slug?: string; name?: string }[]) => {
        if (cancelled || !Array.isArray(data)) return;
        setEvents(
          data
            .map((e) => ({ slug: e.slug ?? "", name: e.name ?? e.slug ?? "" }))
            .filter((e) => e.slug)
        );
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [espace]);

  return events;
}
