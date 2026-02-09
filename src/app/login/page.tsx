"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(
          result.error.message || "Email ou mot de passe incorrect"
        );
        setLoading(false);
        return;
      }

      // Redirection après connexion réussie — utiliser le callbackUrl si présent
      const callbackUrl = searchParams.get("callbackUrl") || "/logisticien";
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Erreur de connexion. Veuillez réessayer.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-xl p-8 space-y-5"
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Adresse email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="vous@palaisdesfestivals.com"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3F4660] focus:border-transparent outline-none transition text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3F4660] focus:border-transparent outline-none transition text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#3F4660] hover:bg-[#2C2F3F] text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Connexion...
          </span>
        ) : (
          "Se connecter"
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#3F4660] to-[#2C2F3F] px-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <svg
              width="32"
              height="32"
              viewBox="0 0 60 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-white"
            >
              <path d="M9 19L15 3H21L15 19H9Z" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">
            Palais des Festivals
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Connectez-vous pour accéder à la plateforme
          </p>
        </div>

        {/* Formulaire — Suspense requis par useSearchParams() en Next.js 15 */}
        <Suspense
          fallback={
            <div className="bg-white rounded-2xl shadow-xl p-8 flex items-center justify-center">
              <svg
                className="animate-spin h-6 w-6 text-[#3F4660]"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-center text-white/40 text-xs mt-6">
          &copy; {new Date().getFullYear()} Palais des Festivals &amp;
          des Congrès de Cannes
        </p>
      </div>
    </div>
  );
}
