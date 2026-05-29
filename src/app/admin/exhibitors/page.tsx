"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  XCircle,
} from "lucide-react";

interface OrgOption {
  id: string;
  slug: string;
  name: string;
}
interface EventOption {
  id: string;
  slug: string;
  name: string;
}

interface ImportResponse {
  ok: boolean;
  mode?: "dry-run" | "commit";
  totalLines?: number;
  preview?: { name: string; stand: string; sector?: string; zone?: string }[];
  errors?: { line: number; reason: string }[];
  created?: number;
  updated?: number;
  deactivated?: number;
  error?: string;
}

/**
 * Admin : gestion des exposants (catalogue par event + import CSV).
 *
 * Étapes :
 * 1. Choix de l'organisation (parmi celles accessibles à l'utilisateur).
 * 2. Choix de l'event (parmi ceux de l'organisation).
 * 3. Téléversement d'un CSV (dry-run automatique).
 * 4. Confirmation pour appliquer (création / mise à jour / désactivation
 *    des exposants absents).
 */
export default function AdminExhibitorsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [orgSlug, setOrgSlug] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState<ImportResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    if (!orgSlug) {
      setEvents([]);
      setEventSlug("");
      return;
    }
    fetch(`/api/events?espace=${encodeURIComponent(orgSlug)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]));
  }, [orgSlug]);

  const upload = useCallback(
    async (f: File, commit: boolean) => {
      const formData = new FormData();
      formData.append("file", f);
      const url = `/api/admin/exhibitors/import?orgSlug=${encodeURIComponent(
        orgSlug
      )}&eventSlug=${encodeURIComponent(eventSlug)}${commit ? "&commit=true" : ""}`;
      const res = await fetch(url, { method: "POST", body: formData });
      const data: ImportResponse = await res.json();
      return { ok: res.ok, data };
    },
    [orgSlug, eventSlug]
  );

  async function handleFileSelected(f: File) {
    setFile(f);
    setSuccessMessage(null);
    setDryRun(null);
    setUploading(true);
    try {
      const { data } = await upload(f, false);
      setDryRun(data);
    } finally {
      setUploading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setCommitting(true);
    setSuccessMessage(null);
    try {
      const { data } = await upload(file, true);
      if (data.ok) {
        setSuccessMessage(
          `Import réussi : ${data.created ?? 0} créés, ${data.updated ?? 0} mis à jour, ${
            data.deactivated ?? 0
          } désactivés.`
        );
        setFile(null);
        setDryRun(null);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        setDryRun(data);
      }
    } finally {
      setCommitting(false);
    }
  }

  const ready = orgSlug && eventSlug;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 overflow-x-hidden min-w-0">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={16} /> Retour
        </Link>
        <h1 className="text-2xl font-bold mb-2">Catalogue exposants</h1>
        <p className="text-sm text-gray-600 mb-6">
          Importez le CSV des exposants pour une organisation et un event donnés. Les exposants
          renseignés ici alimentent la combobox du formulaire d&apos;accréditation public
          (template <code>rx</code>).
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Organisation
              </label>
              <select
                value={orgSlug}
                onChange={(e) => {
                  setOrgSlug(e.target.value);
                  setEventSlug("");
                  setDryRun(null);
                }}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">— Choisir —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.slug}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Event</label>
              <select
                value={eventSlug}
                onChange={(e) => {
                  setEventSlug(e.target.value);
                  setDryRun(null);
                }}
                disabled={!orgSlug}
                className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-100"
              >
                <option value="">— Choisir —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.slug}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t min-w-0">
            <a
              href="/api/admin/exhibitors/template"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline min-w-0 shrink-0"
            >
              <Download size={16} /> Télécharger le template CSV
            </a>
            <div className="min-w-0 w-full sm:flex-1 overflow-hidden">
              <input
                type="file"
                accept=".csv"
                ref={inputRef}
                disabled={!ready || uploading || committing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                }}
                className="text-sm w-full max-w-full"
              />
            </div>
          </div>
        </div>

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 size={18} className="animate-spin" /> Analyse du CSV…
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm mb-4">
            <CheckCircle2 size={18} /> {successMessage}
          </div>
        )}

        {dryRun && !dryRun.ok && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
              <XCircle size={18} /> Erreurs détectées
            </div>
            {dryRun.error && <p className="text-sm text-red-700 mb-2">{dryRun.error}</p>}
            <ul className="text-sm text-red-700 list-disc pl-5 space-y-1">
              {(dryRun.errors ?? []).map((err, i) => (
                <li key={i}>
                  Ligne {err.line} — {err.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dryRun && dryRun.ok && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-gray-800 font-semibold mb-2">
              <FileUp size={18} /> Aperçu — {dryRun.totalLines} ligne(s) prêtes
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="text-sm w-full">
                <thead className="text-xs text-gray-500 border-b">
                  <tr>
                    <th className="text-left py-1 pr-3">Exposant</th>
                    <th className="text-left py-1 pr-3">Stand</th>
                    <th className="text-left py-1 pr-3">Secteur</th>
                    <th className="text-left py-1 pr-3">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {(dryRun.preview ?? []).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-3">{row.name}</td>
                      <td className="py-1 pr-3">{row.stand}</td>
                      <td className="py-1 pr-3 text-gray-500">{row.sector ?? "—"}</td>
                      <td className="py-1 pr-3 text-gray-500">{row.zone ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sm:hidden space-y-2">
              {(dryRun.preview ?? []).map((row, i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm space-y-1">
                  <div className="font-semibold text-gray-900 break-words">{row.name}</div>
                  <div className="text-gray-700">Stand : {row.stand}</div>
                  {row.sector && <div className="text-xs text-gray-500">Secteur : {row.sector}</div>}
                  {row.zone && <div className="text-xs text-gray-500">Zone : {row.zone}</div>}
                </div>
              ))}
            </div>
            {dryRun.totalLines && dryRun.totalLines > (dryRun.preview?.length ?? 0) && (
              <p className="text-xs text-gray-500 mt-2">
                + {dryRun.totalLines - (dryRun.preview?.length ?? 0)} autres lignes…
              </p>
            )}
            <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t">
              <button
                onClick={() => {
                  setFile(null);
                  setDryRun(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="px-4 py-2 text-sm border rounded-md"
              >
                Annuler
              </button>
              <button
                onClick={handleCommit}
                disabled={committing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-white disabled:opacity-60"
              >
                {committing ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                Appliquer l&apos;import
              </button>
            </div>
            <div className="flex items-start gap-2 text-xs text-orange-700 mt-3 bg-orange-50 border border-orange-200 rounded-md p-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                Les exposants non listés dans ce CSV seront <strong>désactivés</strong> (mais
                conservés en base pour préserver les accréditations historiques).
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
