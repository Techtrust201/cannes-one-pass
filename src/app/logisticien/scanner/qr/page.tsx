"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { withEspaceQuery } from "@/lib/url";

/**
 * Ancienne page scanner QR — désormais fusionnée dans le module de scan unifié
 * (`/logisticien/scanner`). On redirige vers l'onglet QR en conservant l'espace.
 */
function RedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const espace = searchParams?.get("espace") ?? null;

  useEffect(() => {
    router.replace(withEspaceQuery("/logisticien/scanner?tab=qr", espace));
  }, [router, espace]);

  return (
    <div className="flex items-center justify-center h-full p-8 text-gray-400">
      Redirection vers le scan…
    </div>
  );
}

export default function QRScannerRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  );
}
