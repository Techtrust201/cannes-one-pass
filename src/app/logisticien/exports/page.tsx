"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, Leaf, Mail } from "lucide-react";

interface EventOption {
  slug: string;
  name: string;
}

/**
 * Hub « Exports » : centralise les exports de données (accréditations,
 * exposants) + le lien vers le bilan carbone. Répond à la demande RX §12
 * (« je n'ai pas trouvé la fonction d'export »).
 *
 * Tous les exports sont scopés à l'espace courant (`?espace=`).
 */
export default function ExportsPage() {
  const searchParams = useSearchParams();
  const espace = searchParams?.get("espace") ?? null;
  const espaceQs = espace ? `?espace=${encodeURIComponent(espace)}` : "";

  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventSlug, setEventSlug] = useState("");

  useEffect(() => {
    if (!espace) return;
    fetch(`/api/events?espace=${encodeURIComponent(espace)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return;
        setEvents(
          data
            .map((e: { slug?: string; name?: string }) => ({
              slug: e.slug ?? "",
              name: e.name ?? e.slug ?? "",
            }))
            .filter((e: EventOption) => e.slug)
        );
      })
      .catch(() => {});
  }, [espace]);

  const sep = espaceQs ? "&" : "?";
  const accBase = `/api/exports/accreditations${espaceQs}${
    eventSlug ? `${sep}event=${encodeURIComponent(eventSlug)}` : ""
  }`;
  const accExportUrl = accBase;
  const accXlsxUrl = `${accBase}${accBase.includes("?") ? "&" : "?"}format=xlsx`;
  const exhibitorsExportUrl = `/api/exports/exhibitors${espaceQs}`;
  const exhibitorsXlsxUrl = `/api/exports/exhibitors${espaceQs}${espaceQs ? "&" : "?"}format=xlsx`;
  const ticketsExportUrl = `/api/exports/tickets${espaceQs}`;
  const zonesExportUrl = `/api/exports/zones${espaceQs}`;
  const providersExportUrl = `/api/exports/providers${espaceQs}`;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 mb-1">
        <Download size={20} /> Exports
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Téléchargez vos données au format CSV (compatible Excel).
        {espace ? ` Espace : ${espace}.` : ""}
      </p>

      <div className="space-y-4">
        {/* Accréditations */}
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
            <FileSpreadsheet size={18} /> Accréditations
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Demandes d&apos;accréditation avec véhicules, créneaux montage /
            démontage, transporteur, zone et statut.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={eventSlug}
              onChange={(e) => setEventSlug(e.target.value)}
              className="border rounded-md px-2 py-1.5 text-sm"
            >
              <option value="">Tous les événements</option>
              {events.map((ev) => (
                <option key={ev.slug} value={ev.slug}>
                  {ev.name}
                </option>
              ))}
            </select>
            <a
              href={accExportUrl}
              className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-primary-dark"
            >
              <Download size={16} /> CSV
            </a>
            <a
              href={accXlsxUrl}
              className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <Download size={16} /> Excel
            </a>
          </div>
        </section>

        {/* Exposants */}
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
            <FileSpreadsheet size={18} /> Exposants
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Liste des exposants (société, stand, secteur, zone, événement).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={exhibitorsExportUrl}
              className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-primary-dark"
            >
              <Download size={16} /> CSV
            </a>
            <a
              href={exhibitorsXlsxUrl}
              className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <Download size={16} /> Excel
            </a>
          </div>
        </section>

        {/* Tickets / Zones / Prestataires */}
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
            <FileSpreadsheet size={18} /> Autres données
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Tickets de support, zones de déchargement, prestataires de manutention.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={ticketsExportUrl}
              className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <Download size={16} /> Tickets (CSV)
            </a>
            <a
              href={zonesExportUrl}
              className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <Download size={16} /> Zones (CSV)
            </a>
            <a
              href={providersExportUrl}
              className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <Download size={16} /> Prestataires (CSV)
            </a>
          </div>
        </section>

        {/* Bilan carbone */}
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
            <Leaf size={18} /> Bilan carbone
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Exports PDF / CSV détaillés du bilan carbone (trajets, émissions).
          </p>
          <Link
            href={`/logisticien/carbon${espaceQs}`}
            className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Ouvrir le bilan carbone →
          </Link>
        </section>

        {/* Envoi d'emails — clarification RX §11 */}
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
            <Mail size={18} /> Contact exposants & e-mails
          </h2>
          <p className="text-sm text-gray-500">
            Le contact avec les exposants se fait via <strong>mailto</strong>{" "}
            (ouverture de votre messagerie depuis la fiche d&apos;accréditation
            ou du ticket). Conseil : centralisez via une boîte e-mail dédiée au
            salon pour conserver l&apos;historique des échanges.
          </p>
        </section>
      </div>
    </div>
  );
}
