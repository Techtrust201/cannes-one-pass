"use client";

import { useEffect } from "react";

/**
 * Filet de sécurité ULTIME : capture les exceptions qui surviennent jusque
 * dans le layout racine (là où un `error.tsx` de segment ne s'applique pas).
 * Remplace tout le document, donc DOIT fournir ses propres `<html>`/`<body>`.
 *
 * Garantit qu'aucun écran blanc Next « Application error » ne soit montré à un
 * utilisateur, y compris sur un QR public.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erreur globale:", error);
    try {
      const payload = JSON.stringify({
        message: error?.message ?? "",
        stack: error?.stack ?? "",
        digest: error?.digest ?? "",
        url: typeof window !== "undefined" ? window.location.href : "",
      });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/client-error",
          new Blob([payload], { type: "application/json" })
        );
      }
    } catch {
      // best-effort
    }
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#353c52",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          padding: "16px",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "28px",
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          }}
        >
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", margin: 0 }}>
            Une erreur est survenue
          </h1>
          <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
            Something went wrong
          </p>
          <p style={{ fontSize: "14px", color: "#4b5563", marginTop: "16px" }}>
            La page n&apos;a pas pu se charger. Veuillez réessayer.
            <br />
            The page failed to load. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "20px",
              width: "100%",
              padding: "12px",
              borderRadius: "12px",
              background: "#353c52",
              color: "#fff",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Réessayer / Retry
          </button>
          {error?.digest && (
            <p style={{ fontSize: "11px", color: "#d1d5db", marginTop: "14px" }}>
              Réf : {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
