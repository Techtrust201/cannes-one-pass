"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { usePermissions } from "@/hooks/usePermissions";
import { Menu, X } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = usePermissions();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          {/* Top row: title + hamburger (mobile) or full nav (desktop) */}
          <div className="flex justify-between items-center h-14 md:h-16">
            <div className="flex items-center gap-4 md:gap-6">
              <h1 className="text-base md:text-lg font-semibold">
                Administration
              </h1>
              {/* Desktop nav */}
              <nav className="hidden md:flex gap-4">
                <Link
                  href="/admin/users"
                  className="text-white/80 hover:text-white text-sm transition-colors min-h-[44px] flex items-center"
                >
                  Utilisateurs
                </Link>
                <Link
                  href="/logisticien"
                  className="text-white/80 hover:text-white text-sm transition-colors min-h-[44px] flex items-center"
                >
                  Logisticien
                </Link>
              </nav>
            </div>

            {/* Desktop user info + logout */}
            <div className="hidden md:flex items-center gap-4">
              <span className="text-sm text-white/70 truncate max-w-[250px]">
                {user.name} ({user.email})
              </span>
              <button
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/login");
                }}
                className="text-sm bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg transition-colors min-h-[44px]"
              >
                Déconnexion
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile dropdown menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-white/20 py-3 space-y-1">
              <div className="text-sm text-white/70 px-1 py-2 truncate">
                {user.name}
              </div>
              <Link
                href="/admin/users"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-white/80 hover:text-white hover:bg-white/10 text-sm transition-colors rounded-lg px-3 py-3 min-h-[44px]"
              >
                Utilisateurs
              </Link>
              <Link
                href="/logisticien"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-white/80 hover:text-white hover:bg-white/10 text-sm transition-colors rounded-lg px-3 py-3 min-h-[44px]"
              >
                Logisticien
              </Link>
              <button
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/login");
                }}
                className="w-full text-left text-sm bg-white/10 hover:bg-white/20 px-3 py-3 rounded-lg transition-colors min-h-[44px]"
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        {children}
      </main>
    </div>
  );
}
