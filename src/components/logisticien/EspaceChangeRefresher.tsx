"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";

/**
 * Force le re-fetch des Server Components quand `?espace=` change
 * (switcher, navigation manuelle, retour arrière).
 */
export default function EspaceChangeRefresher() {
  const router = useRouter();
  const espace = useEspaceSlug();
  const prev = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (prev.current === undefined) {
      prev.current = espace;
      return;
    }
    if (prev.current !== espace) {
      prev.current = espace;
      router.refresh();
    }
  }, [espace, router]);

  return null;
}
