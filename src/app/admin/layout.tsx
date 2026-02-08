"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { usePermissions } from "@/hooks/usePermissions";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = usePermissions();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#3F4660] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Accès refusé
          </h1>
          <p className="text-gray-600 mb-4">
            Vous devez être Super Admin pour accéder à cette page.
          </p>
          <Link
            href="/logisticien"
            className="text-[#3F4660] hover:underline"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header admin */}
      <header className="bg-[#3F4660] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <h1 className="text-lg font-semibold">
                Administration
              </h1>
              <nav className="flex gap-4">
                <Link
                  href="/admin/users"
                  className="text-white/80 hover:text-white text-sm transition-colors"
                >
                  Utilisateurs
                </Link>
                <Link
                  href="/logisticien"
                  className="text-white/80 hover:text-white text-sm transition-colors"
                >
                  Logisticien
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/70">
                {user.name} ({user.email})
              </span>
              <button
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/login");
                }}
                className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
