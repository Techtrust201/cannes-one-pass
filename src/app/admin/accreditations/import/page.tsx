"use client";

import { useCallback, useRef, useState } from "react";
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

interface ImportError {
  line: number;
  column?: string;
  value?: string;
  reason: string;
}

interface DryRunResponse {
  ok: boolean;
  mode?: "dry-run" | "commit";
  totalLines: number;
  errors: ImportError[];
  preview?: { line: number; company: string; stand: string; vehiclePlate: string; eventSlug: string }[];
  imported?: number;
}

export default function ImportAccreditationsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const upload = useCallback(async (f: File, commit: boolean) => {
    const formData = new FormData();
    formData.append("file", f);
    const res = await fetch(`/api/admin/accreditations/import${commit ? "?commit=true" : ""}`, {
      method: "POST",
      body: formData,
    });
    const data: DryRunResponse = await res.json();
    return { ok: res.ok, data };
  }, []);

  async function handleFileSelected(f: File) {
    setFile(f);
    setSuccessMessage(null);
    setUploading(true);
    setDryRun(null);
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
        setSuccessMessage(`${data.imported} accréditation(s) importée(s) avec succès.`);
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

  const hasErrors = (dryRun?.errors?.length ?? 0) > 0;
  const canCommit = dryRun?.ok && !hasErrors && dryRun.totalLines > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Retour"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import CSV d&apos;accréditations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Validation stricte, sensible à la casse. Rejet total si une seule erreur.
          </p>
        </div>
      </div>

      {/* Template */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Template CSV</h2>
            <p className="text-xs text-gray-500 mt-1">
              Téléchargez ce fichier, remplissez-le, et déposez-le ci-dessous. UTF-8 avec BOM.
            </p>
          </div>
          <a
            href="/api/admin/accreditations/import/template"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-800 font-semibold text-sm hover:bg-gray-50 transition min-h-[44px] shrink-0"
          >
            <Download size={16} /> Télécharger le template
          </a>
        </div>
      </div>

      {/* Dropzone */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <label
          htmlFor="csv-input"
          className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#4F587E] hover:bg-gray-50 transition"
        >
          <FileUp size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="font-semibold text-sm text-gray-700">
            {file ? file.name : "Cliquez ou déposez un fichier CSV"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {uploading ? "Validation en cours..." : "Le fichier sera analysé sans être importé tant que vous ne cliquez pas sur 'Confirmer'."}
          </p>
        </label>
        <input
          id="csv-input"
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelected(f);
          }}
        />
      </div>

      {successMessage && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-4 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-green-800">Import réussi</p>
            <p className="text-xs text-green-700 mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 size={16} className="animate-spin" /> Validation en cours...
        </div>
      )}

      {/* Rapport d'erreurs */}
      {hasErrors && dryRun && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-red-50 border-b border-red-200 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-red-800 text-sm">
                Import refusé — {dryRun.errors.length} erreur{dryRun.errors.length > 1 ? "s" : ""} détectée{dryRun.errors.length > 1 ? "s" : ""}
              </h2>
              <p className="text-xs text-red-700 mt-0.5">
                Le moindre défaut bloque TOUT l&apos;import. Corrigez puis ré-uploadez le fichier.
              </p>
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {dryRun.errors.map((err, idx) => (
              <div
                key={idx}
                className="px-5 py-3 text-sm flex flex-col sm:flex-row sm:items-start gap-2"
              >
                <span className="inline-flex items-center gap-2 shrink-0">
                  <XCircle size={14} className="text-red-500" />
                  <span className="font-mono text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded">
                    L{err.line}
                    {err.column && err.column !== "_row" && ` · ${err.column}`}
                  </span>
                </span>
                <span className="flex-1 text-gray-800">
                  {err.reason}
                  {err.value !== undefined && err.value !== "" && (
                    <span className="text-gray-500 ml-2">
                      (valeur reçue : <code className="bg-gray-100 px-1 py-0.5 rounded text-[11px]">{err.value}</code>)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview dry-run */}
      {!hasErrors && dryRun?.ok && (dryRun.totalLines ?? 0) > 0 && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-green-50 border-b border-green-200 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-bold text-green-800 text-sm">
                Fichier valide — {dryRun.totalLines} ligne{dryRun.totalLines > 1 ? "s" : ""} prête{dryRun.totalLines > 1 ? "s" : ""} à importer
              </h2>
              <p className="text-xs text-green-700 mt-0.5">
                Vérifiez les 10 premières lignes puis cliquez sur Confirmer l&apos;import.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Ligne</th>
                  <th className="px-4 py-2 text-left font-semibold">Event</th>
                  <th className="px-4 py-2 text-left font-semibold">Company</th>
                  <th className="px-4 py-2 text-left font-semibold">Stand</th>
                  <th className="px-4 py-2 text-left font-semibold">Plaque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dryRun.preview?.map((row) => (
                  <tr key={row.line}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">L{row.line}</td>
                    <td className="px-4 py-2 text-gray-700">{row.eventSlug}</td>
                    <td className="px-4 py-2 text-gray-900 font-medium">{row.company}</td>
                    <td className="px-4 py-2 text-gray-700">{row.stand}</td>
                    <td className="px-4 py-2 font-mono text-gray-700">{row.vehiclePlate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleCommit}
              disabled={committing || !canCommit}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#4F587E] text-white font-semibold text-sm hover:bg-[#3B4252] transition disabled:opacity-50 min-h-[44px]"
            >
              {committing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Import en cours...
                </>
              ) : (
                <>Confirmer l&apos;import ({dryRun.totalLines})</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
