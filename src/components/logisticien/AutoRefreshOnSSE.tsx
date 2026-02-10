"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAccreditationStream } from "@/hooks/useAccreditationStream";
import type { Zone } from "@/types";

interface AutoRefreshOnSSEProps {
  /** Zone à filtrer (optionnel) */
  zone?: Zone;
  /** Délai de debounce en ms avant de rafraîchir (défaut: 2000) */
  debounceMs?: number;
}

/**
 * Composant invisible qui écoute le polling des changements
 * et appelle router.refresh() pour mettre à jour les Server Components.
 * 
 * - Debounce de 2s pour éviter les rafraîchissements en cascade
 * - Skip si un input/textarea/select est focus (ne pas couper l'utilisateur)
 * - router.refresh() = partial refresh → l'état client (formulaires, scroll) est préservé
 */
export default function AutoRefreshOnSSE({
  zone,
  debounceMs = 2000,
}: AutoRefreshOnSSEProps) {
  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleRefresh = useCallback(() => {
    // Skip si l'utilisateur est en train de saisir dans un champ
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
      return;
    }

    // Debounce : si un refresh est déjà programmé, on l'annule et on reprogramme
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      router.refresh();
      debounceRef.current = null;
    }, debounceMs);
  }, [router, debounceMs]);

  useAccreditationStream({
    zone,
    onRefresh: handleRefresh,
    enabled: true,
  });

  // Composant invisible — pas de rendu
  return null;
}
