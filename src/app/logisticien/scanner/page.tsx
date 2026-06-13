"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  Suspense,
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
} from "lucide-react";
import { useZones } from "@/hooks/useZones";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizePlate } from "@/lib/plate-utils";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [plateInput, setPlateInput] = useState("");
  const [ocrCameraOn, setOcrCameraOn] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);

  const stopPlateCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setOcrCameraOn(false);
  }, []);

  // Arrête la caméra OCR si on quitte l'onglet plaque ou si une popup s'ouvre.
  useEffect(() => {
    if (tab !== "plaque" || modalOpen || multiOpen) stopPlateCamera();
  }, [tab, modalOpen, multiOpen, stopPlateCamera]);

  // Nettoyage au démontage.
  useEffect(() => () => stopPlateCamera(), [stopPlateCamera]);

  async function startPlateCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setOcrCameraOn(true);
    } catch {
      pushToast(
        "error",
        "Caméra indisponible. Saisissez la plaque manuellement."
      );
    }
  }

  async function captureAndRecognize() {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
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

      // Tesseract.js chargé UNIQUEMENT ici (lazy/dynamic import), à l'action agent.
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      });
      const {
        data: { text },
      } = await worker.recognize(canvas);
      await worker.terminate();

      const guess = normalizePlate(text);
      stopPlateCamera();
      if (guess) {
        setPlateInput(guess);
        pushToast("info", "Plaque détectée — vérifiez puis recherchez.");
      } else {
        pushToast(
          "info",
          "Lecture incertaine. Corrigez ou saisissez la plaque."
        );
      }
    } catch {
      stopPlateCamera();
      pushToast("error", "OCR indisponible. Saisissez la plaque manuellement.");
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

  /* ---------- résultat d'action depuis la popup ---------- */
  function handleResult(result: ScanActionResult) {
    pushToast(result.type, result.message);
    setSummary(null);
    setMatches(null);
    setScanContext(null);
    setPlateInput("");
    // Relance le scan pour le véhicule suivant (sans changer de page).
    setRestartKey((k) => k + 1);
  }

  function closeModal() {
    setSummary(null);
    setMatches(null);
    setScanContext(null);
    setRestartKey((k) => k + 1);
  }

  /* ---------- rendu ---------- */
  const noZone = zoneLoaded && !zone;

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
            {ocrCameraOn ? (
              <div className="space-y-2">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full rounded-xl border border-gray-200 bg-black min-h-[200px] object-cover"
                />
                <div className="flex gap-2">
                  <button
                    onClick={captureAndRecognize}
                    disabled={ocrBusy}
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
                    onClick={stopPlateCamera}
                    disabled={ocrBusy}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    Arrêter
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={startPlateCamera}
                disabled={!zone}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-[#4F587E] text-white hover:bg-[#3B4252] shadow-sm transition disabled:opacity-50"
              >
                <Camera size={18} />
                Scanner une plaque avec la caméra
              </button>
            )}

            {/* Fallback manuel permanent */}
            <div className="pt-1">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Ou saisie manuelle
              </label>
              <div className="flex gap-2">
                <input
                  value={plateInput}
                  onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchPlate();
                  }}
                  placeholder="AB-123-CD"
                  className="flex-1 h-11 rounded-xl border border-gray-200 px-3 text-sm font-mono font-semibold tracking-wider uppercase focus:ring-2 focus:ring-[#4F587E]/30"
                />
                <button
                  onClick={searchPlate}
                  disabled={!zone || !plateInput.trim()}
                  className="px-4 rounded-xl bg-[#4F587E] text-white text-sm font-semibold hover:bg-[#3B4252] transition disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Search size={15} />
                  Rechercher
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                La caméra propose une plaque ; vérifiez-la toujours avant de
                rechercher.
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
