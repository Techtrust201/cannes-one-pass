"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AccreditationWizard } from "@/components/accreditation/AccreditationWizard";
import PageHelp from "@/components/logisticien/help/PageHelp";

interface EspaceOption {
  id: string;
  slug: string;
  name: string;
}

/**
 * Création d'accréditation RX côté logisticien.
 *
 * Réutilise strictement le même wizard que le formulaire public RX
 * (`AccreditationWizard` + template "rx") afin de garantir une expérience
 * identique. On résout uniquement l'`organizationId` de RX via l'endpoint
 * des espaces accessibles, sans dupliquer aucune logique métier.
 */
export default function RxNouveauWizard() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me/espaces")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: EspaceOption[]) => {
        if (cancelled) return;
        const rx = Array.isArray(list) ? list.find((o) => o.slug === "rx") : null;
        if (rx) {
          setOrgId(rx.id);
          setState("ready");
        } else {
          setState("error");
        }
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={24} />
          <span>Chargement…</span>
        </div>
      </div>
    );
  }

  if (state === "error" || !orgId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-gray-700">
          Vous n&apos;avez pas accès à l&apos;espace RX, ou celui-ci est
          introuvable.
        </p>
        <Link href="/logisticien" className="text-primary hover:underline text-sm">
          Retour au tableau de bord
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-3xl px-3 pt-3 sm:px-6">
        <PageHelp storageKey="logisticien-nouveau-rx">
          <p>
            Création d’une demande RX : choisissez l’exposant et l’emplacement, puis les créneaux
            de montage / démontage proposés par le planning.
          </p>
          <p>
            Les horaires viennent du planning ; les quotas n’apparaissent que s’ils ont été
            configurés (sinon : illimité).
          </p>
        </PageHelp>
      </div>
      <AccreditationWizard
        orgSlug="rx"
        formTemplate="rx"
        organizationId={orgId}
        storageKey="log_formData:rx"
        mode="logisticien"
      />
    </div>
  );
}
