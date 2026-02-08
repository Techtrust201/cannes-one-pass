"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function LogisticienError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erreur logisticien:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Une erreur est survenue
          </h2>
        </div>
        <p className="text-gray-600 mb-6">
          Impossible de charger le tableau de bord. Cela peut être dû à un
          problème de connexion à la base de données ou à une erreur temporaire.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4">
            Digest : {error.digest}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 px-4 py-2 bg-[#353c52] text-white rounded-lg hover:bg-[#4F587E] transition-colors duration-200 font-medium"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200 font-medium text-center"
          >
            Retour accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
