"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileUp,
  History,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import PageHelp from "@/components/logisticien/help/PageHelp";
import FieldHint from "@/components/logisticien/help/FieldHint";
import NumberedSteps from "@/components/logisticien/help/NumberedSteps";
import Glossary from "@/components/logisticien/help/Glossary";

type ProfileKey =
  | "referential"
  | "planning"
  | "access-rules"
  | "capacities"
  | "accreditations"
  | "zones"
  | "vehicle-types";

interface ProfileConfig {
  key: ProfileKey;
  label: string;
  question: string;
  shortDescription: string;
  example?: string;
  recommendation?: string;
  api: string;
  requiresEvent: boolean;
  supportsFormat?: boolean;
  supportsImportMode?: boolean;
  readFeatures: Feature[];
}

const PROFILES: ProfileConfig[] = [
  {
    key: "referential",
    label: "Exposants & emplacements",
    question: "Qui expose et où ?",
    shortDescription:
      "Liste les sociétés et leurs stands ou emplacements. Cet import ne crée aucune demande d’accréditation.",
    example: "HONDA MARINE → POWER 215",
    recommendation: "1. À importer en premier",
    api: "/api/admin/import/referential",
    requiresEvent: true,
    supportsFormat: true,
    readFeatures: ["GESTION_ESPACES"],
  },
  {
    key: "planning",
    label: "Planning général",
    question: "Quand les véhicules peuvent-ils venir ?",
    shortDescription:
      "Définit les jours et heures généraux de montage et de démontage par port, secteur ou espace.",
    recommendation: "2. Après le référentiel",
    api: "/api/admin/import/planning",
    requiresEvent: true,
    supportsFormat: true,
    readFeatures: ["GESTION_DATES"],
  },
  {
    key: "access-rules",
    label: "Règles par stand / emplacement",
    question: "Un stand possède-t-il une règle particulière ?",
    shortDescription:
      "Utilisez cette carte lorsqu’un exposant ou un emplacement possède ses propres horaires, sa propre zone, ses gabarits ou ses capacités.",
    recommendation: "3. Après le planning général",
    api: "/api/admin/import/access-rules",
    requiresEvent: true,
    readFeatures: ["GESTION_DATES"],
  },
  {
    key: "capacities",
    label: "Capacités et quotas",
    question: "Combien de véhicules sont autorisés ?",
    shortDescription: "Définit le nombre maximal de véhicules légers et lourds par créneau.",
    recommendation: "4. Après le planning",
    api: "/api/admin/import/capacities",
    requiresEvent: true,
    readFeatures: ["FLUX_VEHICULES"],
  },
  {
    key: "accreditations",
    label: "Accréditations",
    question: "Ai-je un fichier contenant de vraies demandes ?",
    shortDescription:
      "Crée des demandes réelles. Le fichier doit contenir au minimum les informations du chauffeur, du véhicule, de la plaque et du créneau.",
    recommendation: "5. Après le référentiel et les quotas",
    api: "/api/admin/import/accreditations",
    requiresEvent: true,
    supportsImportMode: true,
    readFeatures: ["LISTE", "GESTION_ESPACES"],
  },
  {
    key: "zones",
    label: "Zones",
    question: "Où les véhicules doivent-ils attendre ou être scannés ?",
    shortDescription: "Met à jour les zones logistiques, leurs couleurs et paramètres de contrôle.",
    api: "/api/admin/import/zones",
    requiresEvent: false,
    readFeatures: ["GESTION_ZONES"],
  },
  {
    key: "vehicle-types",
    label: "Types de véhicules",
    question: "Quels gabarits peut-on sélectionner ?",
    shortDescription: "Gère les gabarits, tonnages, familles et données environnementales.",
    api: "/api/admin/import/vehicle-types",
    requiresEvent: false,
    readFeatures: ["FLUX_VEHICULES"],
  },
];

const PROFILE_LABELS: Record<string, string> = Object.fromEntries(
  PROFILES.map((profile) => [profile.key.toUpperCase().replace("-", "_"), profile.label])
);

const STEPS = [
  "Choisir les données",
  "Choisir l’événement",
  "Vérifier le fichier",
  "Confirmer l’enregistrement",
];

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

interface RowIssue {
  line?: number;
  column?: string;
  value?: string;
  reason: string;
}

interface ImportApiResponse {
  ok: boolean;
  code?: string;
  error?: string;
  errors?: RowIssue[];
  warnings?: RowIssue[] | { fileWarnings?: RowIssue[]; lineWarnings?: unknown[] };
  totalRows?: number;
  mode?: "dry-run" | "commit";
  preview?: Record<string, unknown>;
  imported?: { created: number; updated: number; unchanged: number };
  batchId?: string;
  created?: number | { accreditationId: string }[];
  accreditationIds?: string[];
  emailSummary?: {
    total: number;
    sent: number;
    failed: number;
  };
  previousBatchId?: string | null;
  duplicateRowsDetected?: boolean;
}

interface ImportBatchRow {
  id: string;
  event: { id: string; name: string } | null;
  sourceProfile: string;
  fileName: string;
  status: string;
  created: number;
  updated: number;
  unchanged: number;
  errorCount: number;
  startedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function issueFrom(value: unknown, fallbackLine?: number): RowIssue | null {
  if (typeof value === "string") return { line: fallbackLine, reason: value };
  const issue = asRecord(value);
  if (!issue) return null;
  const reason = issue.reason ?? issue.message ?? issue.error;
  if (typeof reason !== "string") return null;
  return {
    line: typeof issue.line === "number" ? issue.line : fallbackLine,
    column: typeof issue.column === "string" ? issue.column : undefined,
    value: typeof issue.value === "string" ? issue.value : undefined,
    reason,
  };
}

function collectIssues(response: ImportApiResponse | null, kind: "errors" | "warnings"): RowIssue[] {
  if (!response) return [];
  const result: RowIssue[] = [];
  const add = (values: unknown, fallbackLine?: number) => {
    if (!Array.isArray(values)) return;
    values.forEach((value) => {
      const issue = issueFrom(value, fallbackLine);
      if (issue) result.push(issue);
    });
  };

  const root = response[kind];
  add(root);
  const rootRecord = asRecord(root);
  if (kind === "warnings" && rootRecord) {
    add(rootRecord.fileWarnings);
    add(rootRecord.lineWarnings);
  }

  const preview = response.preview;
  add(preview?.[kind === "errors" ? "fileErrors" : "fileWarnings"]);
  const lines = preview?.lines;
  if (Array.isArray(lines)) {
    lines.forEach((lineValue) => {
      const line = asRecord(lineValue);
      if (!line) return;
      const lineNumber = typeof line.line === "number" ? line.line : undefined;
      add(line[kind], lineNumber);
      if (kind === "errors" && line.valid === false && !Array.isArray(line.errors)) {
        result.push({ line: lineNumber, reason: "Cette ligne n’est pas valide." });
      }
    });
  }
  return result;
}

function findNumber(value: unknown, aliases: string[], depth = 0): number | null {
  if (depth > 3) return null;
  const record = asRecord(value);
  if (!record) return null;
  for (const alias of aliases) {
    if (typeof record[alias] === "number") return record[alias] as number;
  }
  for (const nested of Object.values(record)) {
    const found = findNumber(nested, aliases, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function previewRows(preview?: Record<string, unknown>): Record<string, unknown>[] {
  if (!preview) return [];
  const candidate = Array.isArray(preview.sample)
    ? preview.sample
    : Array.isArray(preview.lines)
      ? preview.lines
      : [];
  return candidate.map(asRecord).filter((row): row is Record<string, unknown> => !!row).slice(0, 10);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} élément(s)` : "Voir détails";
  return String(value);
}

function statusLabel(status: string): string {
  if (status === "COMPLETED") return "Terminé";
  if (status === "FAILED") return "Échec";
  if (status === "PROCESSING") return "En cours";
  return status;
}

function downloadErrorReport(issues: RowIssue[], baseName: string) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    "ligne,colonne,valeur,explication",
    ...issues.map(
      (issue) =>
        [
          issue.line ?? "",
          escape(issue.column ?? ""),
          escape(issue.value ?? ""),
          escape(issue.reason),
        ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${baseName.replace(/\.[^.]+$/, "")}-erreurs.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminImportCenterPage() {
  const { user, loading: permissionsLoading, hasPermission } = usePermissions();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const inputRef = useRef<HTMLInputElement>(null);
  const prefillApplied = useRef(false);

  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [eventId, setEventId] = useState("");
  const [profileKey, setProfileKey] = useState<ProfileKey | null>(null);
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

  const visibleProfiles = useMemo(
    () =>
      PROFILES.filter(
        (profile) =>
          isSuperAdmin || profile.readFeatures.some((feature) => hasPermission(feature, "read"))
      ),
    [hasPermission, isSuperAdmin]
  );
  const profile = PROFILES.find((item) => item.key === profileKey) ?? null;

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    if (prefillApplied.current || orgs.length === 0) return;
    prefillApplied.current = true;
    const params = new URLSearchParams(window.location.search);
    const requestedProfile = params.get("profile") as ProfileKey | null;
    if (requestedProfile && PROFILES.some((item) => item.key === requestedProfile)) {
      setProfileKey(requestedProfile);
    }
    const requestedOrg = params.get("org");
    const organization = orgs.find((item) => item.slug === requestedOrg);
    if (organization) {
      setOrgId(organization.id);
      setOrgSlug(organization.slug);
    }
    const requestedEvent = params.get("event");
    if (requestedEvent) setEventId(requestedEvent);
    const requestedFormat = params.get("format");
    if (requestedFormat === "rx" || requestedFormat === "canonical") {
      setFormat(requestedFormat);
    } else if (
      requestedOrg === "rx" &&
      (requestedProfile === "referential" || requestedProfile === "planning")
    ) {
      setFormat("rx");
    }
  }, [orgs]);

  useEffect(() => {
    if (!orgSlug) {
      setEvents([]);
      return;
    }
    fetch(`/api/events?espace=${encodeURIComponent(orgSlug)}`)
      .then((response) => (response.ok ? response.json() : []))
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
      const response = await fetch(
        `/api/admin/import/batches?organizationId=${encodeURIComponent(orgId)}&limit=50`
      );
      const data = response.ok ? await response.json() : { batches: [] };
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

  function resetAnalysis() {
    setFile(null);
    setDryRun(null);
    setCommitResult(null);
    setConfirmReimport(false);
    setConfirmDuplicates(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function chooseProfile(key: ProfileKey) {
    setProfileKey(key);
    resetAnalysis();
    const selected = PROFILES.find((item) => item.key === key);
    if (orgSlug === "rx" && selected?.supportsFormat) setFormat("rx");
    window.setTimeout(() => document.getElementById("import-wizard")?.scrollIntoView({ behavior: "smooth" }), 0);
  }

  const buildQuery = useCallback(
    (commit: boolean): string => {
      if (!profile) return "";
      const params = new URLSearchParams();
      if (commit) params.set("commit", "true");
      if (profile.supportsFormat) params.set("format", format);
      if (profile.supportsImportMode) params.set("importMode", importMode);
      if (confirmReimport) params.set("confirmReimport", "true");
      if (confirmDuplicates) params.set("confirmDuplicates", "true");
      const query = params.toString();
      return query ? `?${query}` : "";
    },
    [confirmDuplicates, confirmReimport, format, importMode, profile]
  );

  const upload = useCallback(
    async (selectedFile: File, commit: boolean): Promise<ImportApiResponse> => {
      if (!profile) return { ok: false, error: "Profil d’import manquant." };
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("organizationId", orgId);
      if (profile.requiresEvent || eventId) formData.append("eventId", eventId);
      const response = await fetch(`${profile.api}${buildQuery(commit)}`, {
        method: "POST",
        body: formData,
      });
      return response.json().catch(() => ({ ok: false, error: "Réponse serveur invalide." }));
    },
    [buildQuery, eventId, orgId, profile]
  );

  async function handleFileSelected(selectedFile: File) {
    setFile(selectedFile);
    setCommitResult(null);
    setDryRun(null);
    setUploading(true);
    try {
      setDryRun(await upload(selectedFile, false));
    } catch {
      setDryRun({ ok: false, error: "L’analyse du fichier a échoué." });
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setCommitting(true);
    try {
      const result = await upload(file, true);
      if (result.ok) {
        setCommitResult(result);
        setDryRun(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        loadHistory();
      } else {
        setDryRun(result);
      }
    } catch {
      setDryRun({ ok: false, error: "L’import n’a pas pu être confirmé." });
    } finally {
      setCommitting(false);
    }
  }

  const errors = collectIssues(dryRun, "errors");
  const warnings = collectIssues(dryRun, "warnings");
  const blockingCodes = ["PREVIEW_INVALID", "BATCH_CAPACITY_EXCEEDED", "VALIDATED_IMPORT_FORBIDDEN"];
  const canConfirm =
    dryRun?.ok === true &&
    errors.length === 0 &&
    !blockingCodes.includes(dryRun.code ?? "") &&
    !(dryRun.previousBatchId && !confirmReimport) &&
    !(dryRun.duplicateRowsDetected && !confirmDuplicates);
  const ready = !!profile && !!orgId && (!profile.requiresEvent || !!eventId);
  const selectedHistory = history.filter((batch) => !eventId || batch.event?.id === eventId);
  const hasCompletedProfile = (key: ProfileKey) =>
    selectedHistory.some(
      (batch) =>
        batch.status === "COMPLETED" &&
        batch.sourceProfile === key.toUpperCase().replace("-", "_")
    );
  const dependencyWarning =
    profileKey === "accreditations" && orgId && !hasCompletedProfile("referential")
      ? "Aucun import de référentiel terminé n’a été trouvé pour ce contexte. Les accréditations peuvent ne pas retrouver leurs exposants ou emplacements."
      : profileKey === "capacities" && orgId && !hasCompletedProfile("planning")
        ? "Aucun import de planning terminé n’a été trouvé pour ce contexte. Vérifiez que les dates et créneaux nécessaires existent."
        : null;

  const currentStep = commitResult
    ? 4
    : dryRun && canConfirm
      ? 4
      : profile && ready
        ? 3
        : profile
          ? 2
          : 1;

  const rows = previewRows(dryRun?.preview);
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    .filter((column) => !["errors", "warnings"].includes(column))
    .slice(0, 6);
  const previewCreated = findNumber(dryRun?.preview, ["created", "creations", "toCreate"]);
  const previewUpdated = findNumber(dryRun?.preview, ["updated", "modifications", "toUpdate"]);
  const previewUnchanged = findNumber(dryRun?.preview, ["unchanged", "unchangeds", "noChange"]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 sm:space-y-7 sm:px-0">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-600 hover:text-gray-900 sm:min-h-0">
        <ArrowLeft size={16} /> Retour à l’administration
      </Link>

      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Centre d’import</p>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Importez vos données étape par étape</h1>
        <p className="max-w-3xl text-sm text-gray-600">
          Choisissez ce que vous souhaitez mettre à jour. Chaque fichier est d’abord analysé sans
          aucune écriture : vous gardez la main avant la confirmation.
        </p>
      </header>

      <PageHelp storageKey="admin-import" glossaryId="lexique-import">
        <p>
          Ordre recommandé :{" "}
          <strong>Exposants → Planning → Règles stands → Capacités → Accréditations</strong>.
        </p>
        <p>
          Toujours lancer l’analyse (aperçu) avant de confirmer. Tant que vous n’avez pas confirmé,
          rien n’est écrit en base.
        </p>
      </PageHelp>

      <NumberedSteps
        steps={[
          { title: "Choisir les données", description: "Exposants, planning, quotas…" },
          { title: "Choisir l’événement", description: "Sélectionnez l’événement concerné." },
          { title: "Vérifier le fichier", description: "Aperçu sans enregistrement." },
          { title: "Confirmer", description: "Corrigez les erreurs avant l’écriture." },
        ]}
      />

      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Important — fichiers Référentiel et Planning</p>
        <p className="mt-1">
          Les fichiers <strong>Référentiel</strong> et <strong>Planning</strong> de Mathieu ne créent pas
          d’accréditations. Ils servent uniquement à préparer le formulaire public.
        </p>
      </div>

      <Glossary
        id="lexique-import"
        title="Lexique — Import"
        terms={[
          {
            term: "Aperçu sans enregistrement (dry-run)",
            definition:
              "Simulation sans écriture : vous voyez créations, modifications et erreurs avant de confirmer.",
          },
          {
            term: "Mettre à jour sans supprimer les autres données (fusion)",
            definition: "Met à jour les lignes existantes et en crée de nouvelles, sans tout effacer.",
          },
          {
            term: "Référentiel",
            definition: "Fichier des exposants et de leurs emplacements.",
          },
          {
            term: "Planning",
            definition: "Fichier des créneaux de montage / démontage autorisés.",
          },
        ]}
      />

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 sm:p-4">
        <p className="mb-3 text-sm font-semibold text-blue-900">Ordre recommandé</p>
        <div className="flex flex-col gap-2 text-sm text-blue-800 sm:flex-row sm:flex-wrap sm:items-center">
          {["Exposants", "Planning", "Règles stands", "Capacités", "Accréditations"].map((label, index) => (
            <div key={label} className="flex items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm">{index + 1}. {label}</span>
              {index < 4 && <ChevronRight size={16} className="hidden sm:block" aria-hidden />}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <label htmlFor="organization" className="mb-2 block text-sm font-semibold text-gray-800">
          Organisation concernée
        </label>
        <select
          id="organization"
          value={orgId}
          onChange={(event) => {
            const id = event.target.value;
            const organization = orgs.find((item) => item.id === id);
            setOrgId(id);
            setOrgSlug(organization?.slug ?? "");
            setEventId("");
            resetAnalysis();
            if (organization?.slug === "rx" && profile?.supportsFormat) setFormat("rx");
          }}
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
        >
          <option value="">— Choisir une organisation —</option>
          {orgs.map((organization) => (
            <option key={organization.id} value={organization.id}>{organization.name}</option>
          ))}
        </select>
        <FieldHint>
          Ce choix filtre l’historique et préremplit le contexte (pour RX : format RX automatique).
        </FieldHint>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">1. Que voulez-vous importer ?</h2>
            <p className="mt-1 text-sm text-gray-500">Formats acceptés pour tous les profils : CSV et XLSX.</p>
          </div>
          {permissionsLoading && <Loader2 className="animate-spin text-gray-400" size={18} />}
        </div>

        {!permissionsLoading && visibleProfiles.length === 0 ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
            Aucun profil d’import n’est disponible avec vos permissions actuelles.
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleProfiles.map((item) => {
              const lastBatch = history.find(
                (batch) => batch.sourceProfile === item.key.toUpperCase().replace("-", "_")
              );
              const selected = profileKey === item.key;
              return (
                <article
                  key={item.key}
                  className={`flex flex-col rounded-xl border bg-white p-4 sm:min-h-72 sm:p-5 transition ${
                    selected ? "border-primary ring-2 ring-primary/15" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-primary">
                    <FileSpreadsheet size={21} />
                  </div>
                  <p className="text-sm font-semibold text-primary">{item.question}</p>
                  <h3 className="mt-1 font-semibold text-gray-900">{item.label}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-gray-600">{item.shortDescription}</p>
                  {item.example && (
                    <p className="mt-2 rounded-lg bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-600">
                      Ex. {item.example}
                    </p>
                  )}
                  {item.recommendation && (
                    <p className="mt-3 text-xs font-medium text-blue-700">{item.recommendation}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    {lastBatch
                      ? `Dernier import : ${new Date(lastBatch.startedAt).toLocaleDateString("fr-FR")}`
                      : orgId
                        ? "Aucun import enregistré"
                        : "Choisissez une organisation pour voir le dernier import"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-xs">
                    <a
                      href={`/api/admin/import/template?profile=${item.key}&kind=empty`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Download size={14} /> Modèle vide
                    </a>
                    <a
                      href={`/api/admin/import/template?profile=${item.key}&kind=example`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Download size={14} /> Exemple
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => chooseProfile(item.key)}
                    className="mt-4 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 sm:min-h-0"
                  >
                    Importer ou mettre à jour
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {profile && visibleProfiles.some((item) => item.key === profile.key) && (
        <section id="import-wizard" className="space-y-5 scroll-mt-6">
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-4">
            <ol className="flex min-w-[520px] items-center justify-between">
              {STEPS.map((label, index) => {
                const number = index + 1;
                const complete = number < currentStep;
                const active = number === currentStep;
                return (
                  <li key={label} className="flex flex-1 items-center last:flex-none">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          complete
                            ? "bg-green-600 text-white"
                            : active
                              ? "bg-primary text-white"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {complete ? <Check size={14} /> : number}
                      </span>
                      <span className={`text-xs ${active ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                        {label}{number === 2 && !profile.requiresEvent ? " (facultatif)" : ""}
                      </span>
                    </div>
                    {number < STEPS.length && <div className="mx-3 h-px flex-1 bg-gray-200" />}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Import sélectionné</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">{profile.label}</h2>
                <p className="mt-1 text-sm text-gray-600">{profile.shortDescription}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileKey(null);
                  resetAnalysis();
                }}
                className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
              >
                <RotateCcw size={15} /> Changer de type
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="wizard-organization" className="mb-1 block text-sm font-medium text-gray-800">
                  Organisation
                </label>
                <select
                  id="wizard-organization"
                  value={orgId}
                  onChange={(event) => {
                    const id = event.target.value;
                    const organization = orgs.find((item) => item.id === id);
                    setOrgId(id);
                    setOrgSlug(organization?.slug ?? "");
                    setEventId("");
                    resetAnalysis();
                    if (organization?.slug === "rx" && profile.supportsFormat) setFormat("rx");
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">— Choisir —</option>
                  {orgs.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="event" className="mb-1 block text-sm font-medium text-gray-800">
                  Événement {profile.requiresEvent ? "" : "(facultatif)"}
                </label>
                <select
                  id="event"
                  value={eventId}
                  onChange={(event) => {
                    setEventId(event.target.value);
                    resetAnalysis();
                  }}
                  disabled={!orgId}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="">— {profile.requiresEvent ? "Choisir" : "Aucun"} —</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {dependencyWarning && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                <div><strong>Point de vigilance :</strong> {dependencyWarning}</div>
              </div>
            )}

            {profile.supportsFormat && (
              <fieldset className="mt-5">
                <legend className="text-sm font-medium text-gray-800">Structure du fichier</legend>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" checked={format === "canonical"} onChange={() => setFormat("canonical")} />
                    Format canonique
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" checked={format === "rx"} onChange={() => setFormat("rx")} />
                    Classeur RX officiel
                  </label>
                </div>
              </fieldset>
            )}

            {profile.supportsImportMode && (
              <fieldset className="mt-5">
                <legend className="text-sm font-medium text-gray-800">Statut des accréditations créées</legend>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      checked={importMode === "PENDING"}
                      onChange={() => setImportMode("PENDING")}
                    />
                    En attente de validation
                  </label>
                  <label className={`inline-flex items-center gap-2 ${!isSuperAdmin ? "opacity-50" : ""}`}>
                    <input
                      type="radio"
                      checked={importMode === "VALIDATED"}
                      disabled={!isSuperAdmin}
                      onChange={() => setImportMode("VALIDATED")}
                    />
                    Directement validées (SUPER_ADMIN)
                  </label>
                </div>
              </fieldset>
            )}

            <div className="mt-6 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <FileUp className="mx-auto text-gray-400" size={28} />
              <p className="mt-2 text-sm font-medium text-gray-800">
                {file ? file.name : "Déposez un fichier CSV ou XLSX"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                L’analyse est un aperçu sans enregistrement : aucune donnée n’est écrite tant que vous n’avez pas confirmé.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xlsm,.xls"
                disabled={!ready || uploading || committing}
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];
                  if (selectedFile) handleFileSelected(selectedFile);
                }}
                className="mx-auto mt-4 block max-w-full text-sm"
              />
              {!ready && (
                <p className="mt-3 text-xs text-orange-700">
                  Choisissez une organisation{profile.requiresEvent ? " et un événement" : ""} avant le fichier.
                </p>
              )}
            </div>
          </div>

          {uploading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-800">
              <Loader2 size={18} className="animate-spin" /> Analyse en cours, aucune écriture…
            </div>
          )}

          {dryRun && (
            <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Aperçu sans enregistrement</h2>
                  <p className="text-sm text-gray-500">
                    {typeof dryRun.totalRows === "number" ? `${dryRun.totalRows} ligne(s) analysée(s)` : file?.name}
                    {" · "}
                    Aucune donnée enregistrée avant confirmation.
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  canConfirm ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}>
                  {canConfirm ? "Prêt à confirmer" : "Correction nécessaire"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Créations", previewCreated, "text-green-700"],
                  ["Modifications", previewUpdated, "text-blue-700"],
                  ["Inchangés", previewUnchanged, "text-gray-700"],
                  ["Avertissements", warnings.length, "text-orange-700"],
                  ["Erreurs", errors.length + (dryRun.error ? 1 : 0), "text-red-700"],
                  ["Doublons", dryRun.duplicateRowsDetected ? "Détectés" : 0, "text-purple-700"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className={`mt-1 text-xl font-bold ${color}`}>
                      {value === null ? "—" : String(value)}
                    </p>
                  </div>
                ))}
              </div>
              {(previewCreated === null || previewUpdated === null) && (
                <p className="text-xs text-gray-500">
                  « — » indique que ce profil ne calcule pas encore cette distinction pendant l’aperçu.
                </p>
              )}

              {dryRun.error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <XCircle size={17} className="mt-0.5 shrink-0" /> {dryRun.error}
                </div>
              )}

              {errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
                      <XCircle size={16} /> {errors.length} erreur(s) à corriger dans le fichier
                    </h3>
                    <button
                      type="button"
                      onClick={() => downloadErrorReport(errors, file?.name ?? "import")}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50 sm:min-h-0"
                    >
                      <Download size={14} /> Télécharger le rapport d’erreurs
                    </button>
                  </div>
                  <div className="mt-3 max-h-64 overflow-auto rounded border border-red-100 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-red-50 text-xs text-red-700">
                        <tr><th className="p-2">Ligne</th><th className="p-2">Colonne</th><th className="p-2">Problème</th></tr>
                      </thead>
                      <tbody>
                        {errors.slice(0, 100).map((issue, index) => (
                          <tr key={`${issue.line}-${issue.column}-${index}`} className="border-t border-red-100">
                            <td className="p-2">{issue.line ?? "Fichier"}</td>
                            <td className="p-2">{issue.column ?? "—"}</td>
                            <td className="p-2">{issue.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <details className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-orange-800">
                    {warnings.length} avertissement(s) non bloquant(s)
                  </summary>
                  <ul className="mt-3 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-orange-800">
                    {warnings.slice(0, 100).map((issue, index) => (
                      <li key={`${issue.line}-${index}`}>
                        {issue.line ? `Ligne ${issue.line} — ` : ""}{issue.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {dryRun.previousBatchId && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  <p>Ce fichier a déjà été importé (lot {dryRun.previousBatchId}).</p>
                  {isSuperAdmin ? (
                    <label className="mt-2 flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={confirmReimport}
                        onChange={(event) => setConfirmReimport(event.target.checked)}
                      />
                      Je confirme le réimport de ce fichier
                    </label>
                  ) : (
                    <p className="mt-1">Le réimport est réservé aux SUPER_ADMIN.</p>
                  )}
                </div>
              )}

              {dryRun.duplicateRowsDetected && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  <p>Le fichier contient des lignes strictement identiques.</p>
                  <label className="mt-2 flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={confirmDuplicates}
                      onChange={(event) => setConfirmDuplicates(event.target.checked)}
                    />
                    Je confirme l’import de toutes ces lignes
                  </label>
                </div>
              )}

              {rows.length > 0 && columns.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-800">Extrait du fichier</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-600">
                        <tr>{columns.map((column) => <th key={column} className="whitespace-nowrap p-2">{column}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => (
                          <tr key={index} className="border-t border-gray-100">
                            {columns.map((column) => (
                              <td key={column} className="max-w-64 truncate p-2" title={displayValue(row[column])}>
                                {displayValue(row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {dryRun.preview && (
                <details className="text-sm text-gray-600">
                  <summary className="cursor-pointer">Données techniques</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100">
                    {JSON.stringify(dryRun.preview, null, 2)}
                  </pre>
                </details>
              )}

              <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                <button type="button" onClick={resetAnalysis} className="rounded-lg border px-4 py-2 text-sm">
                  Choisir un autre fichier
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!canConfirm || committing}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {committing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Confirmer l’import
                </button>
              </div>
              {!canConfirm && (
                <p className="text-right text-xs text-gray-500">
                  Corrigez les erreurs ou validez les avertissements requis avant de confirmer.
                </p>
              )}
            </div>
          )}

          {commitResult && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-5">
              <h2 className="flex items-center gap-2 font-semibold text-green-900">
                <CheckCircle2 size={19} /> Import terminé
              </h2>
              <p className="mt-1 text-sm text-green-800">Lot : {commitResult.batchId ?? "enregistré"}</p>
              {commitResult.imported && (
                <p className="mt-2 text-sm text-green-800">
                  {commitResult.imported.created} création(s), {commitResult.imported.updated} modification(s),{" "}
                  {commitResult.imported.unchanged} inchangé(s).
                </p>
              )}
              {typeof commitResult.created === "number" && (
                <p className="mt-2 text-sm text-green-800">{commitResult.created} accréditation(s) créée(s).</p>
              )}
              {commitResult.emailSummary && (
                <p className="mt-2 text-sm text-green-800">
                  E-mails envoyés : {commitResult.emailSummary.sent}/{commitResult.emailSummary.total}
                  {commitResult.emailSummary.failed > 0 ? ` (${commitResult.emailSummary.failed} échec(s))` : ""}.
                </p>
              )}
              <button type="button" onClick={resetAnalysis} className="mt-4 rounded-lg border border-green-300 px-4 py-2 text-sm text-green-900">
                Importer un autre fichier
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <History size={19} />
          <h2 className="text-lg font-bold text-gray-900">Historique des imports</h2>
          {historyLoading && <Loader2 size={15} className="animate-spin text-gray-400" />}
        </div>
        {!orgId ? (
          <p className="text-sm text-gray-500">Choisissez une organisation pour afficher son historique.</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun import enregistré pour cette organisation.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="p-2">Type</th><th className="p-2">Événement</th><th className="p-2">Fichier</th>
                  <th className="p-2">Date</th><th className="p-2 text-right">Créations</th>
                  <th className="p-2 text-right">Modifications</th><th className="p-2 text-right">Erreurs</th>
                  <th className="p-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {history.map((batch) => (
                  <tr key={batch.id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{PROFILE_LABELS[batch.sourceProfile] ?? batch.sourceProfile}</td>
                    <td className="p-2">{batch.event?.name ?? "—"}</td>
                    <td className="max-w-48 truncate p-2" title={batch.fileName}>{batch.fileName}</td>
                    <td className="whitespace-nowrap p-2">{new Date(batch.startedAt).toLocaleString("fr-FR")}</td>
                    <td className="p-2 text-right">{batch.created}</td>
                    <td className="p-2 text-right">{batch.updated}</td>
                    <td className={`p-2 text-right ${batch.errorCount ? "font-semibold text-red-700" : ""}`}>
                      {batch.errorCount}
                    </td>
                    <td className="p-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        batch.status === "COMPLETED"
                          ? "bg-green-100 text-green-800"
                          : batch.status === "FAILED"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-700"
                      }`}>
                        {statusLabel(batch.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
