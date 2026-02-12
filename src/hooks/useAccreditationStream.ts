"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Zone } from "@/types";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

export interface StreamEvent {
  type: "connected" | "status_change" | "zone_change" | "zone_transfer" | "created" | "update" | "deleted" | "vehicle_removed" | "vehicle_added" | "vehicle_updated" | "info_updated";
  accreditationId?: string;
  data?: {
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
    description?: string;
    zone?: string;
    company?: string;
    status?: string;
  };
  timestamp?: string;
}

interface UseAccreditationStreamOptions {
  zone?: Zone;
  onEvent?: (event: StreamEvent) => void;
  onRefresh?: () => void;
  enabled?: boolean;
  /** Intervalle de polling en ms (défaut: 5000) */
  interval?: number;
}

/**
 * Hook de polling client qui remplace le SSE.
 * Interroge /api/accreditations/changes toutes les N secondes.
 * Compatible Vercel Hobby (pas de connexion longue).
 */
export function useAccreditationStream({
  zone,
  onEvent,
  onRefresh,
  enabled = true,
  interval = 5000,
}: UseAccreditationStreamOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<string>(new Date().toISOString());
  const onEventRef = useRef(onEvent);
  const onRefreshRef = useRef(onRefresh);

  // Garder les refs à jour sans recréer l'effet
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const poll = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        since: lastCheckRef.current,
      });
      if (zone) params.set("zone", zone);

      const res = await fetchWithRetry(`/api/accreditations/changes?${params}`, {
        cache: "no-store",
        maxRetries: 3,
        silent: true, // Pas de log pour le polling (trop fréquent)
      });

      if (!res.ok) {
        setIsConnected(false);
        return;
      }

      setIsConnected(true);

      const { events, serverTime } = await res.json();

      // Mettre à jour le timestamp pour le prochain poll
      if (serverTime) {
        lastCheckRef.current = serverTime;
      }

      if (!events || events.length === 0) return;

      // Traiter chaque événement
      for (const event of events as StreamEvent[]) {
        setLastEvent(event);
        onEventRef.current?.(event);
      }

      // Tout événement signifie qu'il y a eu un changement → refresh
      // Couvre : status_change, zone_change, zone_transfer, created, update,
      //          deleted, vehicle_removed, vehicle_added, vehicle_updated, info_updated
      onRefreshRef.current?.();
    } catch {
      setIsConnected(false);
    }
  }, [zone]);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }

    // Premier poll immédiat
    poll();

    // Polling régulier
    intervalRef.current = setInterval(poll, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, interval, poll]);

  return { isConnected, lastEvent };
}
