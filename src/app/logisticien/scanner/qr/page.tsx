"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, AlertTriangle, RefreshCw } from "lucide-react";

const READER_ID = "qr-reader";

/**
 * Extrait une route logisticien cible depuis le contenu décodé d'un QR.
 * Supporte : URL absolue (.../logisticien/...), chemin relatif (/logisticien/...),
 * et le format JSON legacy { "id": "..." } → /logisticien/{id}.
 */
function resolveTarget(decoded: string): string | null {
  const text = decoded.trim();

  // 1) URL absolue
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      if (u.pathname.startsWith("/logisticien")) {
        return u.pathname + u.search;
      }
    } catch {
      /* ignore */
    }
  }

  // 2) Chemin relatif
  if (text.startsWith("/logisticien")) {
    return text;
  }

  // 3) JSON { id } (format du PDF et du badge QR) → page de vérification guérite
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj.id === "string") {
      return `/logisticien/${obj.id}/verify`;
    }
  } catch {
    /* ignore */
  }

  return null;
}

function QRScannerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const espace = searchParams?.get("espace") ?? null;

  const [error, setError] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    handledRef.current = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(READER_ID);
        scannerRef.current = scanner;

        const onSuccess = (decodedText: string) => {
          if (handledRef.current) return;
          const target = resolveTarget(decodedText);
          if (!target) {
            setError(
              "QR code non reconnu. Présentez un QR d'accréditation ou de stand."
            );
            return;
          }
          handledRef.current = true;
          // Conserve l'espace courant si la cible n'en a pas déjà un.
          let dest = target;
          if (espace && !/[?&]espace=/.test(dest)) {
            dest += (dest.includes("?") ? "&" : "?") + `espace=${encodeURIComponent(espace)}`;
          }
          scanner
            .stop()
            .catch(() => {})
            .finally(() => router.push(dest));
        };

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onSuccess,
          () => {
            /* erreurs de décodage par frame : ignorées */
          }
        );
        if (!cancelled) setScanning(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(
            "Impossible d'accéder à la caméra. Vérifiez les autorisations du navigateur (HTTPS requis)."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [router, espace, restartKey]);

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 gap-4 w-full max-w-md mx-auto">
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center justify-center gap-2">
          <Camera size={22} className="text-[#4F587E]" />
          Scanner QR Code
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Scannez un QR Véhicule ou un QR Stand pour ouvrir l&apos;accréditation
          correspondante.
        </p>
      </div>

      <div
        id={READER_ID}
        className="w-full rounded-xl overflow-hidden border border-gray-200 bg-black/5 min-h-[260px]"
      />

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded text-sm w-full">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {scanning && !error && (
        <p className="text-xs text-gray-400">Caméra active — visez le QR code.</p>
      )}

      <button
        type="button"
        onClick={() => {
          setError("");
          handledRef.current = false;
          setRestartKey((k) => k + 1);
        }}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition"
      >
        <RefreshCw size={15} />
        Relancer le scan
      </button>
    </div>
  );
}

export default function QRScannerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full p-8 text-gray-400">
          Chargement du scanner…
        </div>
      }
    >
      <QRScannerInner />
    </Suspense>
  );
}
