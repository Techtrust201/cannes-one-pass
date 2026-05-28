"use client";

import { useSearchParams } from "next/navigation";

/** Slug de l'organisation active depuis `?espace=<slug>` dans l'URL logisticien. */
export function useEspaceSlug(): string | null {
  return useSearchParams()?.get("espace")?.trim() || null;
}
