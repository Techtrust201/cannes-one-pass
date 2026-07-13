"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  History,
  Loader2,
  XCircle,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

// ── Types ─────────────────────────────────────────────────────────────────

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

type ProfileKey =
  | "referential"
  | "planning"
  | "accreditations"
  | "zones"
  | "vehicle-types"
  | "capacities";

interface ProfileConfig {
  key: ProfileKey;
  label: string;
  description: string;
  api: string;
  templateProfile: string;
  requiresEvent: boolean;
  supportsFormat?: boolean; // referential/planning : format=canonical|rx
  supportsImportMode?: boolean; // accreditations : importMode=PENDING|VALIDATED
}

const PROFILES: ProfileConfig[] = [
  {
    key: "referential",
    label: "Référentiel exposants/emplacements",
    description: "Catalogue des exposants et de leurs emplacements (Terre/Flot/Stand).",
    api: "/api/admin/import/referential",
    templateProfile: "referential",
    requiresEvent: true,
    supportsFormat: true,
  },
  {
    key: "planning",
    label: "Planning",
    description: "Créneaux de montage/démontage par port, secteur ou zone.",
    api: "/api/admin/import/planning",
    templateProfile: "planning",
    requiresEvent: true,
    supportsFormat: true,
  },
  {
    key: "accreditations",
    label: "Accréditations",
    description: "Accréditations pré-remplies, créées via le même moteur que le formulaire public.",
    api: "/api/admin/import/accreditations",
    templateProfile: "accreditations",
    requiresEvent: true,
    supportsImportMode: true,
  },
  {
    key: "zones",
    label: "Zones",
    description: "Zones logistiques (ZoneConfig) : géolocalisation, couleur, lecteur de plaque.",
    api: "/api/admin/import/zones",
    templateProfile: "zones",
    requiresEvent: false,
  },
  {
    key: "vehicle-types",
    label: "Types de véhicules / Gabarits",
    description: "Gabarits véhicules (VehicleTypeConfig) : tonnages, CO2, famille LIGHT/HEAVY.",
    api: "/api/admin/import/vehicle-types",
    templateProfile: "vehicle-types",
    requiresEvent: false,
  },
  {
    key: "capacities",
    label: "Capacités",
    description: "Quotas de créneaux par zone/date/famille/phase (RxCapacity).",
    api: "/api/admin/import/capacities",
    templateProfile: "capacities",
    requiresEvent: true,
  },
];

interface RowIssue {
  line: number;
  column?: string;
  value?: string;
  reason: string;
}

interface ImportApiResponse {
  ok: boolean;
  code?: string;
  error?: string;
  errors?: RowIssue[];
  warnings?: RowIssue[] | { fileWarnings: RowIssue[]; lineWarnings: unknown[] };
  totalRows?: number;
  mode?: "dry-run" | "commit";
  commit?: boolean;
  preview?: Record<string, unknown> & { sample?: unknown[] };
  imported?: { created: number; updated: number; unchanged: number };
  batchId?: string;
  created?: number | { accreditationId: string }[];
  accreditationIds?: string[];
  emailSummary?: {
    total: number;
    sent: number;
    failed: number;
    skippedNoRecipient: number;
    skippedDisabled: number;
    allSucceeded: boolean;
  };
  batchCapacityErrors?: unknown[];
  previousBatchId?: string | null;
  duplicateRowsDetected?: boolean;
  fileHashSha256?: string;
}

interface ImportBatchRow {
  id: string;
  organization: { name: string } | null;
  event: { name: string } | null;
  sourceProfile: string;
  fileName: string;
  status: string;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  errorCount: number;
  startedAt: string;
}

const PROFILE_LABELS: Record<string, string> = Object.fromEntries(
  PROFILES.map((p) => [p.key.toUpperCase().replace("-", "_"), p.label])
);

// ── Composant ─────────────────────────────────────────────────────────────

export default function AdminImportCenterPage() {
  const { user } = usePermissions();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const inputRef = useRef<HTMLInputElement>(null);

  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [eventId, setEventId] = useState("");
  const [profileKey, setProfileKey] = useState<ProfileKey>("referential");
  const [format, setFormat] = useState<"canonical" | "rx">("canonical");
  const [importMode, setImportMode] = useState<"PENDING" | "VALIDATED">("PENDING");
  const [confirmReimport, setConfirmReimport] = useState(false);
  const [confirmDuplicates, setConfirmDuplicates] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState<ImportApiResponse | null>(null);
  const [commitResult, setCommitResult] = useState<ImportApiResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [history, setHistory] = useState<ImportBatchRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const profile = PROFILES.find((p) => p.key === profileKey)!;

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    if (!orgSlug) {
      setEvents([]);
      setEventId("");
      return;
    }
    fetch(`/api/events?espace=${encodeURIComponent(orgSlug)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]));
  }, [orgSlug]);

  const loadHistory = useCallback(async () => {
    if (!orgId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/admin/import/batches?organizationId=${encodeURIComponent(orgId)}&limit=20`
      );
      const data = res.ok ? await res.json() : { batches: [] };
      setHistory(Array.isArray(data.batches) ? data.batches : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function resetImportState() {
    setFile(null);
    setDryRun(null);
    setCommitResult(null);
    setConfirmReimport(false);
    setConfirmDuplicates(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function buildQuery(commit: boolean): string {
    const params = new URLSearchParams();
    if (commit) params.set("commit", "true");
    if (profile.supportsFormat) params.set("format", format);
    if (profile.supportsImportMode) params.set("importMode", importMode);
    if (confirmReimport) params.set("confirmReimport", "true");
    if (confirmDuplicates) params.set("confirmDuplicates", "true");
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  const upload = useCallback(
    async (f: File, commit: boolean): Promise<{ ok: boolean; data: ImportApiResponse }> => {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("organizationId", orgId);
      if (profile.requiresEvent || eventId) formData.append("eventId", eventId);
      const res = await fetch(`${profile.api}${buildQuery(commit)}`, {
        method: "POST",
        body: formData,
      });
      const data: ImportApiResponse = await res.json().catch(() => ({ ok: false, error: "Réponse invalide" }));
      return { ok: res.ok, data };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, eventId, profile, format, importMode, confirmReimport, confirmDuplicates]
  );

  async function handleFileSelected(f: File) {
    setFile(f);
    setCommitResult(null);
    setUploading(true);
    setDryRun(null);
    try {
      const { data } = await upload(f, false);
      setDryRun(data);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setCommitting(true);
    try {
      const { data } = await upload(file, true);
      if (data.ok) {
        setCommitResult(data);
        setDryRun(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        loadHistory();
      } else {
        setDryRun(data);
      }
    } finally {
      setCommitting(false);
    }
  }

  const ready = orgId && (!profile.requiresEvent || eventId);

  const dryRunErrors: RowIssue[] = Array.isArray(dryRun?.errors) ? dryRun.errors : [];
  const dryRunWarnings: RowIssue[] = Array.isArray(dryRun?.warnings)
    ? (dryRun!.warnings as RowIssue[])
    : [];
  const isAccreditations = profileKey === "accreditations";
  const blockingCode = dryRun?.code;
  const canConfirm =
    !!dryRun &&
    dryRunErrors.length === 0 &&
    !(isAccreditations && dryRun.preview && (dryRun.preview as { ok?: boolean }).ok === false) &&
    blockingCode !== "PREVIEW_INVALID" &&
    blockingCode !== "BATCH_CAPACITY_EXCEEDED" &&
    blockingCode !== "VALIDATED_IMPORT_FORBIDDEN";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={16} /> Retour
      </Link>
      <div>
        <h1 className="text-2xl font-bold mb-1">Centre d&apos;import</h1>
        <p className="text-sm text-gray-600">
          Import unifié : référentiel, planning, accréditations, zones, gabarits et capacités.
          Toute création passe par les mêmes moteurs métier que les back-offices existants.
          Aucun import n&apos;est appliqué sans aperçu préalable.
        </p>
      </div>

      {/* Étape 1-3 : organisation / événement / profil */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">1. Organisation</label>
            <select
              value={orgId}
              onChange={(e) => {
                const id = e.target.value;
                setOrgId(id);
                setOrgSlug(orgs.find((o) => o.id === id)?.slug ?? "");
                setEventId("");
                resetImportState();
              }}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">— Choisir —</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              2. Événement {profile.requiresEvent ? "" : "(non requis pour ce profil)"}
            </label>
            <select
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                resetImportState();
              }}
              disabled={!orgId || !profile.requiresEvent}
              className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-gray-100"
            >
              <option value="">— Choisir —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">3. Profil d&apos;import</label>
            <select
              value={profileKey}
              onChange={(e) => {
                setProfileKey(e.target.value as ProfileKey);
                resetImportState();
              }}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {PROFILES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500">{profile.description}</p>

        {profile.supportsFormat && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-xs font-semibold text-gray-700">Format du fichier :</span>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                checked={format === "canonical"}
                onChange={() => setFormat("canonical")}
              />
              Canonique (plat)
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={format === "rx"} onChange={() => setFormat("rx")} />
              Classeur RX officiel
            </label>
          </div>
        )}

        {profile.supportsImportMode && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-xs font-semibold text-gray-700">Statut de création :</span>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                checked={importMode === "PENDING"}
                onChange={() => setImportMode("PENDING")}
              />
              En attente de validation (NOUVEAU)
            </label>
            <label className={`inline-flex items-center gap-1 ${!isSuperAdmin ? "opacity-50" : ""}`}>
              <input
                type="radio"
                checked={importMode === "VALIDATED"}
                disabled={!isSuperAdmin}
                onChange={() => setImportMode("VALIDATED")}
              />
              Créer directement validées (ATTENTE) — SUPER_ADMIN uniquement
            </label>
          </div>
        )}

        {/* Étape 4 : fichier */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t min-w-0">
          <a
            href={`/api/admin/import/template?profile=${profile.templateProfile}&kind=empty`}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline shrink-0"
          >
            <Download size={16} /> Modèle vide
          </a>
          <a
            href={`/api/admin/import/template?profile=${profile.templateProfile}&kind=example`}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline shrink-0"
          >
            <Download size={16} /> Exemple rempli
          </a>
          <div className="min-w-0 w-full sm:flex-1 overflow-hidden">
            <input
              type="file"
              accept=".csv,.xlsx,.xlsm,.xls"
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
        {!ready && (
          <p className="text-xs text-orange-600">
            Choisissez une organisation{profile.requiresEvent ? " et un événement" : ""} avant de déposer un fichier.
          </p>
        )}
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 size={18} className="animate-spin" /> Analyse du fichier (dry-run, aucune écriture)…
        </div>
      )}

      {/* Étape 5-6 : aperçu + confirmation */}
      {dryRun && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <FileUp size={18} /> Aperçu — {profile.label}
            {typeof dryRun.totalRows === "number" && <span className="text-gray-500 font-normal">({dryRun.totalRows} ligne(s))</span>}
          </div>

          {dryRun.error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <XCircle size={16} className="shrink-0 mt-0.5" /> {dryRun.error}
            </div>
          )}

          {dryRunErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 font-semibold mb-2 text-sm">
                <XCircle size={16} /> {dryRunErrors.length} erreur(s) bloquante(s)
              </div>
              <ul className="text-sm text-red-700 list-disc pl-5 space-y-1 max-h-64 overflow-y-auto">
                {dryRunErrors.slice(0, 50).map((err, i) => (
                  <li key={i}>
                    Ligne {err.line}
                    {err.column ? ` (${err.column})` : ""} — {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dryRunWarnings.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-orange-700 font-semibold mb-2 text-sm">
                <AlertTriangle size={16} /> {dryRunWarnings.length} avertissement(s) (non bloquant)
              </div>
              <ul className="text-sm text-orange-700 list-disc pl-5 space-y-1 max-h-48 overflow-y-auto">
                {dryRunWarnings.slice(0, 30).map((w, i) => (
                  <li key={i}>
                    Ligne {w.line} — {w.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dryRun.previousBatchId && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 rounded-lg text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                Ce fichier (empreinte identique) a déjà été importé (lot {dryRun.previousBatchId}).
                {isSuperAdmin ? (
                  <label className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={confirmReimport}
                      onChange={(e) => setConfirmReimport(e.target.checked)}
                    />
                    Confirmer le réimport malgré tout (SUPER_ADMIN)
                  </label>
                ) : (
                  " Réimport réservé aux SUPER_ADMIN."
                )}
              </div>
            </div>
          )}

          {dryRun.duplicateRowsDetected && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 rounded-lg text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                Des lignes strictement identiques existent dans ce fichier.
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={confirmDuplicates}
                    onChange={(e) => setConfirmDuplicates(e.target.checked)}
                  />
                  Confirmer l&apos;import de toutes les lignes (aucune déduplication automatique)
                </label>
              </div>
            </div>
          )}

          {dryRun.preview && (
            <details className="text-sm" open={dryRunErrors.length === 0}>
              <summary className="cursor-pointer font-medium text-gray-700">Détail de l&apos;aperçu</summary>
              <pre className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto max-h-96">
                {JSON.stringify(dryRun.preview, null, 2)}
              </pre>
            </details>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t">
            <button onClick={resetImportState} className="px-4 py-2 text-sm border rounded-md">
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || committing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-white disabled:opacity-50"
            >
              {committing ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
              Confirmer l&apos;import
            </button>
          </div>
        </div>
      )}

      {/* Étape 7 : rapport final */}
      {commitResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-green-800 font-semibold">
            <CheckCircle2 size={18} /> Import confirmé — lot {commitResult.batchId}
          </div>
          {commitResult.imported && (
            <p className="text-sm text-green-800">
              {commitResult.imported.created} créé(s), {commitResult.imported.updated} mis à jour,{" "}
              {commitResult.imported.unchanged} inchangé(s).
            </p>
          )}
          {typeof commitResult.created === "number" && (
            <p className="text-sm text-green-800">{commitResult.created} accréditation(s) créée(s).</p>
          )}
          {commitResult.emailSummary && (
            <p className="text-sm text-green-800">
              E-mails : {commitResult.emailSummary.sent}/{commitResult.emailSummary.total} envoyé(s)
              {commitResult.emailSummary.failed > 0 && (
                <span className="text-orange-700"> — {commitResult.emailSummary.failed} échec(s)</span>
              )}
              .
            </p>
          )}
        </div>
      )}

      {/* Historique ImportBatch */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 font-semibold text-gray-800 mb-3">
          <History size={18} /> Historique des imports
          {historyLoading && <Loader2 size={14} className="animate-spin text-gray-400" />}
        </div>
        {!orgId ? (
          <p className="text-sm text-gray-500">Choisissez une organisation pour voir son historique.</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun import pour cette organisation.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead className="text-xs text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1 pr-3">Date</th>
                  <th className="text-left py-1 pr-3">Profil</th>
                  <th className="text-left py-1 pr-3">Événement</th>
                  <th className="text-left py-1 pr-3">Fichier</th>
                  <th className="text-left py-1 pr-3">Statut</th>
                  <th className="text-right py-1 pr-3">Créés</th>
                  <th className="text-right py-1 pr-3">MàJ</th>
                  <th className="text-right py-1 pr-3">Inch.</th>
                  <th className="text-right py-1 pr-3">Désact.</th>
                  <th className="text-right py-1 pr-3">Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="py-1 pr-3 whitespace-nowrap">{new Date(b.startedAt).toLocaleString("fr-FR")}</td>
                    <td className="py-1 pr-3">{PROFILE_LABELS[b.sourceProfile] ?? b.sourceProfile}</td>
                    <td className="py-1 pr-3">{b.event?.name ?? "—"}</td>
                    <td className="py-1 pr-3 truncate max-w-[160px]" title={b.fileName}>{b.fileName}</td>
                    <td className="py-1 pr-3">
                      <span
                        className={
                          b.status === "COMPLETED"
                            ? "text-green-700"
                            : b.status === "FAILED"
                              ? "text-red-700"
                              : "text-gray-500"
                        }
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-1 pr-3 text-right">{b.created}</td>
                    <td className="py-1 pr-3 text-right">{b.updated}</td>
                    <td className="py-1 pr-3 text-right">{b.unchanged}</td>
                    <td className="py-1 pr-3 text-right">{b.deactivated}</td>
                    <td className="py-1 pr-3 text-right">{b.errorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
