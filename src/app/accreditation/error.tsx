"use client";

import { useEffect } from "react";

/**
 * ErrorBoundary du parcours PUBLIC d'accréditation (`/accreditation/**`).
 *
 * Objectif : un QR public ne doit JAMAIS aboutir à l'écran blanc Next
 * « Application error: a client-side exception has occurred ». En cas
 * d'exception client non catchée (storage bloqué, API JS non supportée, etc.),
 * on affiche un écran propre + actions, et on journalise côté serveur.
 *
 * Message bilingue FR/EN volontaire : le public est international et l'erreur
 * peut survenir avant même que la langue soit déterminée.
 */
export default function AccreditationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erreur parcours public accréditation:", error);
    // Log best-effort côté serveur (ne bloque jamais le rendu).
    try {
      const payload = JSON.stringify({
        message: error?.message ?? "",
        stack: error?.stack ?? "",
        digest: error?.digest ?? "",
        url: typeof window !== "undefined" ? window.location.href : "",
      });
      const url = "/api/client-error";
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      } else if (typeof fetch !== "undefined") {
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // best-effort
    }
  }, [error]);

  function restart() {
    if (typeof window !== "undefined") {
      window.location.href = "/accreditation";
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(#353c52 0 50%, #ffffff 0 100%)" }}
    >
      <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-6 sm:p-8 max-w-md w-full text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>

        <h1 className="text-lg font-bold text-gray-900">
          Une erreur est survenue
        </h1>
        <p className="text-sm text-gray-500 mb-1">Something went wrong</p>

        <p className="text-sm text-gray-600 mt-3">
          La page n&apos;a pas pu se charger correctement. Vérifiez votre
          connexion puis réessayez.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          The page failed to load. Please check your connection and try again.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={reset}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#353c52] text-white font-semibold hover:bg-[#4F587E] transition"
          >
            Réessayer / Retry
          </button>
          <button
            onClick={restart}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition"
          >
            Recommencer / Restart
          </button>
        </div>

        {error?.digest && (
          <p className="text-[11px] text-gray-300 mt-4">Réf : {error.digest}</p>
        )}
      </div>
    </div>
  );
}
