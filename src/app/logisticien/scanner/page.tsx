"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  Suspense,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  QrCode,
  ScanText,
  AlertTriangle,
  RefreshCw,
  MapPin,
  CheckCircle,
  XCircle,
  Info,
  Loader2,
  Search,
  ExternalLink,
} from "lucide-react";
import { useZones } from "@/hooks/useZones";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizePlate } from "@/lib/plate-utils";
import { getZoneLabel } from "@/lib/zone-utils";
import { isSafeHttpUrl } from "@/lib/url-safety";
import { recognizePlateClient } from "@/lib/plate-recognition/client-tesseract";
import type {
  PlateProvider,
  PlateRecognitionResult,
} from "@/lib/plate-recognition/types";
import AccreditationScanModal, {
  type ScanActionResult,
} from "@/components/logisticien/AccreditationScanModal";
import type { AccreditationScanSummary, ScanType } from "@/lib/scan-types";

const READER_ID = "qr-reader";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Extrait l'id d'accréditation depuis un QR (JSON {id}, URL ou chemin). */
function resolveAccreditationId(decoded: string): string | null {
  const text = decoded.trim();
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj.id === "string") return obj.id;
  } catch {
    /* ignore */
  }
  const m = text.match(/\/logisticien\/([^/?#]+)/);
  if (m && m[1] && m[1] !== "scanner") return m[1];
  return null;
}

/** Statut administratif court (séparé de l'état de présence). */
function adminStatusLabel(status: AccreditationScanSummary["status"]): string {
  switch (status) {
    case "NOUVEAU":
      return "À valider";
    case "REFUS":
      return "Refusée";
    case "ABSENT":
      return "Absente";
    default:
      // ATTENTE / ENTREE / SORTIE = validée administrativement.
      return "Validée";
  }
}

/** État de présence court pour la liste de suggestions. */
function presenceShort(s: AccreditationScanSummary): string {
  const zoneLabel = s.currentZone ? getZoneLabel(s.currentZone) : null;
  switch (s.status) {
    case "ENTREE":
      return zoneLabel ? `Dans ${zoneLabel}` : "Dans une zone";
    case "SORTIE":
      return zoneLabel ? `Hors zone (${zoneLabel})` : "Hors zone";
    case "ATTENTE":
      return zoneLabel ? `Attendu · ${zoneLabel}` : "Attendu";
    case "NOUVEAU":
      return "Pas encore sur site";
    default:
      return "—";
  }
}

/**
 * Détermine quelle plaque (principale ou remorque) correspond au fragment
 * normalisé saisi, pour afficher la bonne plaque + le badge « Remorque ».
 */
function matchedPlate(
  s: AccreditationScanSummary,
  nq: string
): { plate: string; trailer: boolean } {
  if (nq) {
    for (const v of s.vehicles) {
      const np = normalizePlate(v.plate);
      if (np && np.includes(nq)) return { plate: v.plate ?? "—", trailer: false };
      const nt = normalizePlate(v.trailerPlate);
      if (nt && nt.includes(nq))
        return { plate: v.trailerPlate ?? "—", trailer: true };
    }
  }
  const first = s.vehicles[0];
  return { plate: first?.plate ?? first?.trailerPlate ?? "—", trailer: false };
}

/**
 * Arrêt totalement tolérant du scanner html5-qrcode (stop() lève une exception
 * SYNCHRONE si le scanner n'est plus actif → on garde un try/catch + getState).
 */
async function safeStopScanner(scanner: unknown): Promise<void> {
  if (!scanner || typeof scanner !== "object") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = scanner as any;
  try {
    const state = typeof s.getState === "function" ? s.getState() : undefined;
    if (state === undefined || state === 2 || state === 3) {
      await s.stop();
    }
  } catch {
    /* déjà arrêté / non démarré : ignoré */
  }
  try {
    if (typeof s.clear === "function") s.clear();
  } catch {
    /* libération DOM best-effort */
  }
}

/* ------------------------------------------------------------------ */
/*  Toasts (léger, local)                                             */
/* ------------------------------------------------------------------ */

interface Toast {
  id: number;
  type: ScanActionResult["type"];
  message: string;
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] flex flex-col gap-2 w-[90%] max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const cfg =
          t.type === "success"
            ? { bg: "bg-green-600", Icon: CheckCircle }
            : t.type === "error"
              ? { bg: "bg-red-600", Icon: XCircle }
              : { bg: "bg-[#4F587E]", Icon: Info };
        const Icon = cfg.Icon;
        return (
          <div
            key={t.id}
            className={`${cfg.bg} text-white rounded-xl shadow-lg px-4 py-3 text-sm font-medium flex items-center gap-2 animate-in slide-in-from-top fade-in duration-200`}
          >
            <Icon size={16} className="shrink-0" />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

type Tab = "qr" | "plaque";

function ScannerInner() {
  const espace = useEspaceSlug();
  const searchParams = useSearchParams();
  const requestedTab = searchParams?.get("tab");
  const { zones } = useZones();
  const { hasPermission, loading: permsLoading } = usePermissions();

  const canQr = hasPermission("QR_CODE", "read");
  const canPlaque = hasPermission("PLAQUE", "read");

  const [tab, setTab] = useState<Tab>(requestedTab === "plaque" ? "plaque" : "qr");
  const [zone, setZone] = useState<string>("");
  const [zoneLoaded, setZoneLoaded] = useState(false);

  const [summary, setSummary] = useState<AccreditationScanSummary | null>(null);
  const [scanContext, setScanContext] = useState<{
    scanType: ScanType;
    scannedValue: string;
  } | null>(null);
  const [matches, setMatches] = useState<AccreditationScanSummary[] | null>(null);
  const [looking, setLooking] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [qrError, setQrError] = useState("");
  const [restartKey, setRestartKey] = useState(0);

  const modalOpen = summary !== null;
  const multiOpen = matches !== null && matches.length > 1;

  /* ---------- toast helper ---------- */
  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  /* ---------- zone de poste persistée ---------- */
  const storageKey = `scanPosteZone:${espace ?? "global"}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setZone(saved);
    } catch {
      /* localStorage indisponible */
    }
    setZoneLoaded(true);
  }, [storageKey]);

  // Le tab par défaut suit les permissions disponibles (en respectant un
  // éventuel ?tab= explicite tant que la permission existe).
  useEffect(() => {
    if (permsLoading) return;
    if (requestedTab === "plaque" && canPlaque) setTab("plaque");
    else if (requestedTab === "qr" && canQr) setTab("qr");
    else if (!canQr && canPlaque) setTab("plaque");
    else setTab("qr");
  }, [permsLoading, canQr, canPlaque, requestedTab]);

  function changeZone(z: string) {
    setZone(z);
    try {
      if (z) localStorage.setItem(storageKey, z);
      else localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  /* ---------- résolution / lookup ---------- */
  const runLookup = useCallback(
    async (params: { id?: string; plate?: string }, scanType: ScanType, scannedValue: string) => {
      if (!zone) {
        pushToast("error", "Sélectionnez d'abord votre zone de poste.");
        return;
      }
      setLooking(true);
      try {
        const qs = new URLSearchParams();
        if (params.id) qs.set("id", params.id);
        if (params.plate) qs.set("plate", params.plate);
        if (espace) qs.set("espace", espace);
        const res = await fetch(`/api/accreditations/lookup?${qs.toString()}`);
        if (!res.ok) {
          pushToast("error", "Recherche impossible. Réessayez.");
          return;
        }
        const data = (await res.json()) as { matches: AccreditationScanSummary[] };
        const found = data.matches ?? [];
        if (found.length === 0) {
          pushToast(
            "error",
            params.plate
              ? `Aucune accréditation pour la plaque ${params.plate}.`
              : "QR code non reconnu ou accréditation introuvable."
          );
          return;
        }
        setScanContext({ scanType, scannedValue });
        if (found.length === 1) {
          setSummary(found[0]);
        } else {
          setMatches(found);
        }
      } catch {
        pushToast("error", "Erreur réseau pendant la recherche.");
      } finally {
        setLooking(false);
      }
    },
    [zone, espace, pushToast]
  );

  /* ---------- QR scanner (sans navigation) ---------- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const handledRef = useRef(false);
  const stoppedRef = useRef(false);
  const [qrActive, setQrActive] = useState(false);

  useEffect(() => {
    // Une seule caméra active : on ne démarre le QR que sur l'onglet QR, zone
    // choisie, et aucune popup ouverte. Sinon on s'assure que tout est arrêté.
    if (tab !== "qr" || !zone || modalOpen || multiOpen || permsLoading || !canQr) {
      return;
    }

    let cancelled = false;
    handledRef.current = false;
    stoppedRef.current = false;
    setQrError("");

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(READER_ID);
        scannerRef.current = scanner;

        const onSuccess = (decodedText: string) => {
          if (handledRef.current) return;
          const id = resolveAccreditationId(decodedText);
          if (!id) {
            setQrError("QR code non reconnu. Présentez un QR d'accréditation.");
            return;
          }
          handledRef.current = true;
          stoppedRef.current = true;
          void safeStopScanner(scanner).finally(() => {
            void runLookup({ id }, "qr", id);
          });
        };

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onSuccess,
          () => {
            /* erreurs de décodage par frame ignorées */
          }
        );
        if (!cancelled) setQrActive(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setQrError(
            "Impossible d'accéder à la caméra. Vérifiez les autorisations (HTTPS requis)."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      setQrActive(false);
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s && !stoppedRef.current) {
        stoppedRef.current = true;
        void safeStopScanner(s);
      }
    };
  }, [tab, zone, modalOpen, multiOpen, permsLoading, canQr, restartKey, runLookup]);

  /* ---------- Plaque : caméra OCR (à la demande) + saisie manuelle ---------- */
  type CamState = "idle" | "starting" | "active" | "error";
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<"environment" | "user">("environment");
  const [plateInput, setPlateInput] = useState("");
  const [camState, setCamState] = useState<CamState>("idle");
  const [camError, setCamError] = useState("");

  /* ---------- Recherche plaque dynamique (autocomplete) ---------- */
  const [suggestions, setSuggestions] = useState<
    AccreditationScanSummary[] | null
  >(null);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchAbortRef = useRef<AbortController | null>(null);
  // Séquence anti résultats obsolètes (réponses hors ordre).
  const searchSeqRef = useRef(0);
  const plateInputRef = useRef<HTMLInputElement>(null);
  // Déclencheur explicite : une ref (streamRef) ne re-déclenche pas un effet.
  // On incrémente cette clé après avoir rempli streamRef pour forcer le rejeu
  // de l'effet d'attachement, quel que soit l'ordre (stream avant/après <video>).
  const [streamReadyKey, setStreamReadyKey] = useState(0);
  const [ocrBusy, setOcrBusy] = useState(false);

  const stopPlateCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamState("idle");
    setCamError("");
  }, []);

  // Arrête la caméra OCR si on quitte l'onglet plaque ou si une popup s'ouvre.
  useEffect(() => {
    if (tab !== "plaque" || modalOpen || multiOpen) stopPlateCamera();
  }, [tab, modalOpen, multiOpen, stopPlateCamera]);

  // Nettoyage au démontage.
  useEffect(() => () => stopPlateCamera(), [stopPlateCamera]);

  /**
   * Attachement robuste du flux au <video>. Dépend de camState ET de
   * streamReadyKey pour couvrir les deux ordres possibles :
   *  - stream prêt avant le montage du <video> (l'effet rejoue au montage) ;
   *  - <video> monté avant le stream (l'effet rejoue via streamReadyKey).
   */
  useEffect(() => {
    if (camState === "idle" || camState === "error") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;

    const markActiveOrFail = () => {
      void video.play().catch(() => {});
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setCamState("active");
      } else {
        setCamState("error");
        setCamError(
          "Aucune image détectée. Essayez une autre caméra ou la saisie manuelle."
        );
      }
    };

    // Si les métadonnées sont déjà disponibles (caméra rapide / re-render),
    // on évalue immédiatement, sinon on attend loadedmetadata.
    if (video.readyState >= 1 && video.videoWidth > 0) {
      markActiveOrFail();
      return;
    }
    video.addEventListener("loadedmetadata", markActiveOrFail);
    return () => video.removeEventListener("loadedmetadata", markActiveOrFail);
  }, [camState, streamReadyKey]);

  /** Acquisition du flux avec fallback : facingMode souhaité puis video:true. */
  async function acquireStream(
    facing: "environment" | "user"
  ): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
    } catch {
      // Fallback générique (ex: pas de caméra correspondant au facingMode).
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }
  }

  async function startPlateCamera() {
    setCamError("");
    setCamState("starting"); // monte le <video> dans le DOM
    try {
      const stream = await acquireStream(facingRef.current);
      streamRef.current = stream;
      // Force le rejeu de l'effet d'attachement une fois la ref remplie.
      setStreamReadyKey((k) => k + 1);
    } catch {
      setCamState("error");
      setCamError(
        "Impossible d'accéder à la caméra. Vérifiez les autorisations (HTTPS requis) ou utilisez la saisie manuelle."
      );
    }
  }

  function switchCamera() {
    facingRef.current =
      facingRef.current === "environment" ? "user" : "environment";
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    void startPlateCamera();
  }

  // Config provider de reconnaissance (résolue côté serveur, mise en cache).
  // Non secrète : seulement le nom du provider + seuil de confiance.
  const plateConfigRef = useRef<{
    provider: PlateProvider;
    minConfidence: number;
  } | null>(null);

  const getPlateConfig = useCallback(async () => {
    if (plateConfigRef.current) return plateConfigRef.current;
    try {
      const res = await fetch("/api/plate-recognition");
      if (res.ok) {
        const cfg = (await res.json()) as {
          provider: PlateProvider;
          minConfidence: number;
        };
        plateConfigRef.current = cfg;
        return cfg;
      }
    } catch {
      /* réseau indisponible */
    }
    // Défaut résilient : Tesseract local gratuit (le scan reste possible).
    plateConfigRef.current = { provider: "tesseract", minConfidence: 0.75 };
    return plateConfigRef.current;
  }, []);

  /** Envoie le crop au backend (provider serveur self-hosted type CodeProject.AI). */
  async function recognizeViaBackend(
    canvas: HTMLCanvasElement
  ): Promise<PlateRecognitionResult> {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7)
    );
    if (!blob) {
      return {
        success: false,
        plate: null,
        normalizedPlate: null,
        confidence: null,
        provider: "codeproject_ai",
        message: "Capture impossible.",
      };
    }
    const form = new FormData();
    form.append("image", blob, "plate.jpg");
    if (espace) form.append("espace", espace);
    if (zone) form.append("zone", zone);
    const res = await fetch("/api/plate-recognition", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      return {
        success: false,
        plate: null,
        normalizedPlate: null,
        confidence: null,
        provider: "codeproject_ai",
        message: "Service de reconnaissance indisponible.",
      };
    }
    return (await res.json()) as PlateRecognitionResult;
  }

  async function captureAndRecognize() {
    const video = videoRef.current;
    if (
      !video ||
      !streamRef.current ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      pushToast("error", "Image caméra pas encore prête. Patientez un instant.");
      return;
    }
    setOcrBusy(true);
    try {
      const canvas = document.createElement("canvas");
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      // Crop central (bande horizontale) : zone la plus probable de la plaque.
      const cropH = Math.round(h * 0.35);
      const cropY = Math.round((h - cropH) / 2);
      canvas.width = w;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no-canvas");
      ctx.drawImage(video, 0, cropY, w, cropH, 0, 0, w, cropH);

      const cfg = await getPlateConfig();

      // Provider désactivé : on bascule directement sur la saisie manuelle.
      if (cfg.provider === "disabled") {
        stopPlateCamera();
        pushToast("info", "Reconnaissance auto désactivée. Saisissez la plaque.");
        return;
      }

      // Routage : Tesseract en local (gratuit, privé), sinon backend self-hosted.
      const result =
        cfg.provider === "codeproject_ai"
          ? await recognizeViaBackend(canvas)
          : await recognizePlateClient(canvas, cfg.minConfidence);

      stopPlateCamera();
      if (result.normalizedPlate) {
        setPlateInput(result.normalizedPlate);
        pushToast(
          "info",
          result.success
            ? "Plaque détectée — vérifiez puis recherchez."
            : "Lecture incertaine — corrigez si besoin."
        );
      } else {
        pushToast(
          "info",
          result.message || "Lecture incertaine. Saisissez la plaque."
        );
      }
    } catch {
      stopPlateCamera();
      pushToast(
        "error",
        "Reconnaissance indisponible. Saisissez la plaque manuellement."
      );
    } finally {
      setOcrBusy(false);
    }
  }

  function searchPlate() {
    const normalized = normalizePlate(plateInput);
    if (!normalized) {
      pushToast("error", "Saisissez une plaque valide.");
      return;
    }
    void runLookup({ plate: normalized }, "plate", normalized);
  }

  /* ---------- Recherche plaque dynamique ---------- */
  const closeSuggestions = useCallback(() => {
    searchAbortRef.current?.abort();
    setSuggestions(null);
    setSearching(false);
    setActiveIndex(-1);
  }, []);

  const doSearch = useCallback(
    async (nq: string) => {
      const seq = ++searchSeqRef.current;
      // Annule la requête précédente (l'agent continue à taper).
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearching(true);
      try {
        const qs = new URLSearchParams();
        qs.set("q", nq);
        if (espace) qs.set("espace", espace);
        const res = await fetch(
          `/api/accreditations/plate-search?${qs.toString()}`,
          { signal: controller.signal }
        );
        // Réponse obsolète (une frappe plus récente a pris le relais) → ignorée.
        if (seq !== searchSeqRef.current) return;
        if (!res.ok) {
          setSuggestions([]);
          setActiveIndex(-1);
          return;
        }
        const data = (await res.json()) as {
          matches: AccreditationScanSummary[];
        };
        if (seq !== searchSeqRef.current) return;
        const found = data.matches ?? [];
        setSuggestions(found);
        setActiveIndex(found.length > 0 ? 0 : -1);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (seq === searchSeqRef.current) {
          setSuggestions([]);
          setActiveIndex(-1);
        }
      } finally {
        if (seq === searchSeqRef.current) setSearching(false);
      }
    },
    [espace]
  );

  // Débounce : recherche automatique dès 2 caractères normalisés, sans clic.
  useEffect(() => {
    if (tab !== "plaque" || modalOpen || multiOpen) return;
    const nq = normalizePlate(plateInput);
    if (!nq || nq.length < 2) {
      closeSuggestions();
      return;
    }
    const handle = setTimeout(() => void doSearch(nq), 200);
    return () => clearTimeout(handle);
  }, [plateInput, tab, modalOpen, multiOpen, doSearch, closeSuggestions]);

  // Sélection d'une suggestion → même popup que le scan, zone conservée.
  const selectSummary = useCallback(
    (s: AccreditationScanSummary) => {
      if (!zone) {
        pushToast("error", "Sélectionnez d'abord votre zone de poste.");
        return;
      }
      const nq = normalizePlate(plateInput) ?? "";
      const mp = matchedPlate(s, nq);
      setScanContext({
        scanType: "plate",
        scannedValue: mp.plate || plateInput,
      });
      closeSuggestions();
      setSummary(s);
    },
    [zone, plateInput, pushToast, closeSuggestions]
  );

  function onPlateKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    const list = suggestions ?? [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.length) setActiveIndex((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length) setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list.length) selectSummary(list[activeIndex >= 0 ? activeIndex : 0]);
      else searchPlate(); // fallback recherche exacte
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  }

  /* ---------- résultat d'action depuis la popup ---------- */
  function handleResult(result: ScanActionResult) {
    pushToast(result.type, result.message);
    setSummary(null);
    setMatches(null);
    setScanContext(null);
    setPlateInput("");
    closeSuggestions();
    // Relance le scan pour le véhicule suivant (sans changer de page).
    setRestartKey((k) => k + 1);
  }

  function closeModal() {
    setSummary(null);
    setMatches(null);
    setScanContext(null);
    closeSuggestions();
    setRestartKey((k) => k + 1);
  }

  /* ---------- rendu ---------- */
  const noZone = zoneLoaded && !zone;

  // Lot 3 — Lecteur de plaque de la zone de poste (lien optionnel, sécurisé).
  const selectedZoneConfig = zones.find((z) => z.zone === zone);
  const readerLink =
    selectedZoneConfig?.readerActive &&
    selectedZoneConfig.readerUrl &&
    isSafeHttpUrl(selectedZoneConfig.readerUrl)
      ? selectedZoneConfig.readerUrl
      : null;

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 space-y-4">
      <ToastStack toasts={toasts} />

      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-800 flex items-center justify-center gap-2">
          <Camera size={20} className="text-[#4F587E]" />
          Scan véhicules
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Sélectionnez votre zone, scannez, puis validez l&apos;action.
        </p>
      </div>

      {/* Zone de poste */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <MapPin size={12} />
          Zone de poste
        </label>
        <select
          value={zone}
          onChange={(e) => changeZone(e.target.value)}
          className={`w-full h-11 rounded-xl border px-3 text-sm font-medium bg-white transition focus:ring-2 focus:ring-[#4F587E]/30 ${
            noZone ? "border-red-300" : "border-gray-200"
          }`}
        >
          <option value="">— Choisir ma zone —</option>
          {zones.map((z) => (
            <option key={z.zone} value={z.zone}>
              {z.label}
              {z.isFinalDestination ? " (destination finale)" : ""}
            </option>
          ))}
        </select>
        {noZone && (
          <p className="text-[11px] text-red-500 mt-1.5 font-medium">
            Zone obligatoire pour scanner et valider une action.
          </p>
        )}
        {readerLink && (
          <a
            href={readerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4F587E]/10 text-[#4F587E] hover:bg-[#4F587E]/20 transition"
          >
            <ExternalLink size={15} />
            Ouvrir le lecteur{selectedZoneConfig?.readerName ? ` · ${selectedZoneConfig.readerName}` : ""}
          </a>
        )}
      </div>

      {/* Onglets */}
      <div className="grid grid-cols-2 gap-2">
        {canQr && (
          <button
            onClick={() => setTab("qr")}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
              tab === "qr"
                ? "bg-[#4F587E] text-white border-[#4F587E]"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <QrCode size={16} />
            QR code
          </button>
        )}
        {canPlaque && (
          <button
            onClick={() => setTab("plaque")}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
              tab === "plaque"
                ? "bg-[#4F587E] text-white border-[#4F587E]"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            } ${!canQr ? "col-span-2" : ""}`}
          >
            <ScanText size={16} />
            Plaque
          </button>
        )}
      </div>

      {/* Contenu onglet */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        {looking && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 size={16} className="animate-spin" /> Recherche…
          </div>
        )}

        {/* --- Onglet QR --- */}
        {tab === "qr" && canQr && (
          <>
            <div
              id={READER_ID}
              className="w-full rounded-xl overflow-hidden border border-gray-200 bg-black/5 min-h-[240px]"
            />
            {!zone && (
              <p className="text-xs text-amber-600 text-center">
                Choisissez votre zone de poste pour activer la caméra.
              </p>
            )}
            {qrError && (
              <div className="flex items-start gap-2 bg-red-50 border-l-4 border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{qrError}</span>
              </div>
            )}
            {qrActive && !qrError && zone && (
              <p className="text-xs text-gray-400 text-center">
                Caméra active — visez le QR.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setQrError("");
                handledRef.current = false;
                setRestartKey((k) => k + 1);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition"
            >
              <RefreshCw size={15} />
              Relancer le scan
            </button>
          </>
        )}

        {/* --- Onglet Plaque (scan-first + fallback manuel) --- */}
        {tab === "plaque" && canPlaque && (
          <>
            {camState !== "idle" && camState !== "error" ? (
              <div className="space-y-2">
                <div className="relative w-full rounded-xl overflow-hidden border border-gray-200 bg-black min-h-[200px]">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full min-h-[200px] object-cover"
                  />
                  {camState === "starting" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/90 bg-black/40">
                      <Loader2 size={22} className="animate-spin" />
                      <span className="text-xs font-medium">Démarrage caméra…</span>
                    </div>
                  )}
                  {camState === "active" && (
                    <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      Caméra active
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={captureAndRecognize}
                    disabled={ocrBusy || camState !== "active"}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4F587E] text-white hover:bg-[#3B4252] transition disabled:opacity-50"
                  >
                    {ocrBusy ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ScanText size={16} />
                    )}
                    {ocrBusy ? "Lecture…" : "Capturer & lire"}
                  </button>
                  <button
                    onClick={switchCamera}
                    disabled={ocrBusy || camState === "starting"}
                    title="Changer de caméra"
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    onClick={stopPlateCamera}
                    disabled={ocrBusy}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    Arrêter
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={startPlateCamera}
                  disabled={!zone}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-[#4F587E] text-white hover:bg-[#3B4252] shadow-sm transition disabled:opacity-50"
                >
                  <Camera size={18} />
                  Scanner une plaque avec la caméra
                </button>
                {camState === "error" && camError && (
                  <div className="flex items-start gap-2 bg-red-50 border-l-4 border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <span>{camError}</span>
                  </div>
                )}
              </>
            )}

            {/* Recherche dynamique par plaque (autocomplete temps réel) */}
            <div className="pt-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Recherche par plaque
              </label>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={plateInputRef}
                      value={plateInput}
                      onChange={(e) =>
                        setPlateInput(e.target.value.toUpperCase())
                      }
                      onKeyDown={onPlateKeyDown}
                      placeholder="Tapez une plaque, ex. GG ou 542…"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      role="combobox"
                      aria-expanded={!!suggestions && suggestions.length > 0}
                      aria-controls="plate-suggestions"
                      aria-autocomplete="list"
                      className="w-full h-12 rounded-xl border border-gray-200 pl-3 pr-9 text-base font-mono font-semibold tracking-wider uppercase focus:ring-2 focus:ring-[#4F587E]/30"
                    />
                    {searching && (
                      <Loader2
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400"
                      />
                    )}
                  </div>
                  <button
                    onClick={searchPlate}
                    disabled={!zone || !plateInput.trim()}
                    className="px-4 rounded-xl bg-[#4F587E] text-white text-sm font-semibold hover:bg-[#3B4252] transition disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
                  >
                    <Search size={15} />
                    <span className="hidden sm:inline">Rechercher</span>
                  </button>
                </div>

                {/* Suggestions */}
                {suggestions && suggestions.length > 0 && (
                  <ul
                    id="plate-suggestions"
                    role="listbox"
                    className="mt-2 max-h-[44vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100"
                  >
                    {suggestions.map((s, idx) => {
                      const nq = normalizePlate(plateInput) ?? "";
                      const mp = matchedPlate(s, nq);
                      return (
                        <li key={s.id} role="option" aria-selected={idx === activeIndex}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectSummary(s)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={`w-full text-left px-3 py-2.5 transition ${
                              idx === activeIndex
                                ? "bg-[#4F587E]/10"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-sm text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                                {mp.plate}
                              </span>
                              {mp.trailer && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                  Remorque
                                </span>
                              )}
                              <span className="text-[11px] font-semibold text-[#4F587E]">
                                {adminStatusLabel(s.status)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-gray-600 truncate">
                              {s.company || "—"}
                              {s.stand ? ` · Stand ${s.stand}` : ""}
                            </div>
                            <div className="text-[11px] text-gray-400 truncate">
                              {presenceShort(s)}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Aucun résultat (seulement après ≥ 2 caractères, hors frappe). */}
                {!searching &&
                  suggestions !== null &&
                  suggestions.length === 0 &&
                  (normalizePlate(plateInput)?.length ?? 0) >= 2 && (
                    <p className="mt-2 text-sm text-gray-400 px-1">
                      Aucune plaque trouvée
                    </p>
                  )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                La recherche démarre dès 2 caractères. La caméra propose une
                plaque ; vérifiez-la toujours.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Sélection multi-accréditations (même plaque) */}
      {multiOpen && matches && scanContext && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-100 p-5 space-y-3">
            <h2 className="text-base font-bold text-gray-900">
              {matches.length} accréditations trouvées
            </h2>
            <p className="text-xs text-gray-500">
              Sélectionnez la bonne accréditation.
            </p>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setMatches(null);
                    setSummary(m);
                  }}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-[#4F587E] hover:bg-gray-50 transition"
                >
                  <p className="font-semibold text-sm text-gray-900">{m.company}</p>
                  <p className="text-xs text-gray-500">
                    Stand {m.stand || "—"} ·{" "}
                    {m.vehicles[0]?.plate || "plaque à l'arrivée"} ·{" "}
                    {m.vehicles[0]?.vehicleLabel}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={closeModal}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 font-semibold text-sm hover:bg-gray-50 transition"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Popup résumé + actions */}
      {modalOpen && summary && scanContext && (
        <AccreditationScanModal
          summary={summary}
          zone={zone}
          scanType={scanContext.scanType}
          scannedValue={scanContext.scannedValue}
          onClose={closeModal}
          onResult={handleResult}
        />
      )}

      {!permsLoading && !canQr && !canPlaque && (
        <div className="text-center text-sm text-gray-400 py-6">
          Vous n&apos;avez pas accès au module de scan.
        </div>
      )}
    </div>
  );
}

export default function ScannerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full p-8 text-gray-400">
          Chargement du scanner…
        </div>
      }
    >
      <ScannerInner />
    </Suspense>
  );
}
