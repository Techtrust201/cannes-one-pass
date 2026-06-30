"use client";

import { useCallback, useEffect, useState } from "react";
import { safeGetItem, safeSetItem } from "@/lib/safe-storage";

export type AccreditationListMode = "paginated" | "infinite";

export const LIST_MODE_STORAGE_KEY = "accreditation-list-view-mode";
const LIST_MODE_EVENT = "accreditation-list-view-mode-change";

function readMode(): AccreditationListMode {
  return safeGetItem(LIST_MODE_STORAGE_KEY) === "infinite"
    ? "infinite"
    : "paginated";
}

/**
 * Mode d'affichage de la liste d'accréditations (paginé vs défilement continu),
 * mémorisé dans le localStorage. Le défaut est `paginated` (comportement
 * historique). Synchronise les instances montées simultanément (desktop +
 * mobile) via un évènement custom.
 */
export function useAccreditationListMode(): [
  AccreditationListMode,
  (mode: AccreditationListMode) => void,
] {
  // SSR-safe : on démarre toujours sur "paginated" puis on hydrate côté client
  // pour éviter tout mismatch d'hydratation.
  const [mode, setModeState] = useState<AccreditationListMode>("paginated");

  useEffect(() => {
    setModeState(readMode());
    const onChange = () => setModeState(readMode());
    window.addEventListener(LIST_MODE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(LIST_MODE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setMode = useCallback((next: AccreditationListMode) => {
    safeSetItem(LIST_MODE_STORAGE_KEY, next);
    setModeState(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(LIST_MODE_EVENT));
    }
  }, []);

  return [mode, setMode];
}
