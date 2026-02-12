"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Image from "next/image";
import { useState, useEffect } from "react";
import { X, ChevronsLeft, ChevronsRight } from "lucide-react";
import MobileNavbar from "@/components/logisticien/MobileNavbar";
import { usePermissions } from "@/hooks/usePermissions";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export default function LogisticienLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, hasPermission, isSuperAdmin, loading } =
    usePermissions();
  const router = useRouter();

  // Restaurer l'état collapsed depuis localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "true") setCollapsed(true);
    } catch { /* ignore SSR */ }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#3F4660] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen text-sm text-gray-900">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[55] sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside
        className={`
        fixed sm:static top-0 left-0 z-[60] h-screen bg-[#3F4660] text-white flex flex-col transition-all duration-300
        ${sidebarOpen ? "translate-x-0 w-60" : "-translate-x-full w-60"}
        sm:translate-x-0 sm:flex
        ${collapsed ? "sm:w-16" : "sm:w-60"}
      `}
      >
        {/* Logo + User info */}
        <div className="h-auto border-b border-white/10">
          <div className="h-16 flex items-center justify-center text-lg font-semibold">
            <svg
              width="60"
              height="24"
              viewBox="0 0 60 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-white"
            >
              <path
                d="M9 19L15 3H21L15 19H9Z"
                fill="currentColor"
              />
            </svg>
          </div>
          {user && !collapsed && (
            <div className="px-4 pb-3">
              <p className="text-xs text-white/70 truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-white/50 truncate">
                {user.email}
              </p>
            </div>
          )}
        </div>
        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-4 pb-20 sm:pb-4">
          {/* Bloc Accréditations */}
          {(hasPermission("LISTE", "read") ||
            hasPermission("CREER", "read")) && (
            collapsed ? (
              <div className="space-y-1">
                {hasPermission("LISTE", "read") && (
                  <Link href="/logisticien" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="Liste" onClick={() => setSidebarOpen(false)}>
                    <Image src="/logisticien/Vector%20(17).svg" width={16} height={16} alt="Liste" />
                  </Link>
                )}
                {hasPermission("CREER", "read") && (
                  <Link href="/logisticien/nouveau?step=1" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="Créer" onClick={() => setSidebarOpen(false)}>
                    <Image src="/logisticien/Vector%20(18).svg" width={16} height={16} alt="Créer" />
                  </Link>
                )}
                {hasPermission("ARCHIVES", "read") && (
                  <Link href="/logisticien/archives" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="Archives" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                      <path d="M21 8v13H3V8M1 3h22v5H1V3zM10 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                )}
              </div>
            ) : (
            <details open className="group">
              <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 bg-[#2C2F3F] rounded-lg text-xs font-semibold uppercase tracking-wide select-none">
                <span className="flex items-center gap-2">
                  <Image
                    src="/logisticien/Vector%20(16).svg"
                    width={16}
                    height={16}
                    alt=""
                  />
                  Accréditations
                </span>
                <svg
                  className="w-3 h-3 transition-transform group-open:rotate-180"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M6 8l4 4 4-4" />
                </svg>
              </summary>
              <ul className="mt-2 pl-3 space-y-1 text-sm">
                {hasPermission("LISTE", "read") && (
                  <li>
                    <Link
                      href="/logisticien"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Image
                        src="/logisticien/Vector%20(17).svg"
                        width={16}
                        height={16}
                        alt=""
                      />
                      Liste
                    </Link>
                  </li>
                )}
                {hasPermission("CREER", "read") && (
                  <li>
                    <Link
                      href="/logisticien/nouveau?step=1"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Image
                        src="/logisticien/Vector%20(18).svg"
                        width={16}
                        height={16}
                        alt=""
                      />
                      Créer
                    </Link>
                  </li>
                )}
                {hasPermission("ARCHIVES", "read") && (
                  <li>
                    <Link
                      href="/logisticien/archives"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                        <path d="M21 8v13H3V8M1 3h22v5H1V3zM10 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Archives
                    </Link>
                  </li>
                )}
              </ul>
            </details>
            )
          )}

          {/* Bloc Scans */}
          {(hasPermission("PLAQUE", "read") ||
            hasPermission("QR_CODE", "read")) && (
            collapsed ? (
              <div className="space-y-1">
                {hasPermission("PLAQUE", "read") && (
                  <Link href="/logisticien/scanner/plaque" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="Plaque" onClick={() => setSidebarOpen(false)}>
                    <Image src="/logisticien/Group%201%20(1).svg" width={22} height={16} alt="Plaque" />
                  </Link>
                )}
                {hasPermission("QR_CODE", "read") && (
                  <Link href="/logisticien/scanner/qr" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="QR code" onClick={() => setSidebarOpen(false)}>
                    <Image src="/logisticien/Vector%20(20).svg" width={16} height={16} alt="QR code" />
                  </Link>
                )}
              </div>
            ) : (
            <details open className="group">
              <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 bg-[#2C2F3F] rounded-lg text-xs font-semibold uppercase tracking-wide select-none">
                <span className="flex items-center gap-2">
                  <Image
                    src="/logisticien/Vector%20(19).svg"
                    width={16}
                    height={16}
                    alt=""
                  />
                  Scans
                </span>
                <svg
                  className="w-3 h-3 transition-transform group-open:rotate-180"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M6 8l4 4 4-4" />
                </svg>
              </summary>
              <ul className="mt-2 pl-3 space-y-1 text-sm">
                {hasPermission("PLAQUE", "read") && (
                  <li>
                    <Link
                      href="/logisticien/scanner/plaque"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Image
                        src="/logisticien/Group%201%20(1).svg"
                        width={22}
                        height={16}
                        alt=""
                      />
                      Plaque
                    </Link>
                  </li>
                )}
                {hasPermission("QR_CODE", "read") && (
                  <li>
                    <Link
                      href="/logisticien/scanner/qr"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Image
                        src="/logisticien/Vector%20(20).svg"
                        width={16}
                        height={16}
                        alt=""
                      />
                      QR code
                    </Link>
                  </li>
                )}
              </ul>
            </details>
            )
          )}

          {/* Bloc Suivi */}
          {(hasPermission("FLUX_VEHICULES", "read") ||
            hasPermission("BILAN_CARBONE", "read") ||
            hasPermission("GESTION_ZONES", "read") ||
            hasPermission("GESTION_DATES", "read")) && (
            collapsed ? (
              <div className="space-y-1">
                {hasPermission("FLUX_VEHICULES", "read") && (
                  <Link href="/logisticien/vehicles" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="Flux véhicules" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="currentColor"/></svg>
                  </Link>
                )}
                {hasPermission("BILAN_CARBONE", "read") && (
                  <Link href="/logisticien/carbon" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="Bilan carbone" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/></svg>
                  </Link>
                )}
                {hasPermission("GESTION_ZONES", "read") && (
                  <Link href="/logisticien/zones" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="Gestion zones" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>
                  </Link>
                )}
                {hasPermission("GESTION_DATES", "read") && (
                  <Link href="/logisticien/dates" className="flex items-center justify-center p-2.5 rounded-lg hover:bg-white/10 transition-colors" title="Gestion dates" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" fill="currentColor"/></svg>
                  </Link>
                )}
              </div>
            ) : (
            <details open className="group">
              <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 bg-[#2C2F3F] rounded-lg text-xs font-semibold uppercase tracking-wide select-none">
                <span className="flex items-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-white"
                  >
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                      fill="currentColor"
                    />
                  </svg>
                  Suivi
                </span>
                <svg
                  className="w-3 h-3 transition-transform group-open:rotate-180"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M6 8l4 4 4-4" />
                </svg>
              </summary>
              <ul className="mt-2 pl-3 space-y-1 text-sm">
                {hasPermission("FLUX_VEHICULES", "read") && (
                  <li>
                    <Link
                      href="/logisticien/vehicles"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-white"
                      >
                        <path
                          d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
                          fill="currentColor"
                        />
                      </svg>
                      Flux véhicules
                    </Link>
                  </li>
                )}
                {hasPermission("BILAN_CARBONE", "read") && (
                  <li>
                    <Link
                      href="/logisticien/carbon"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-white"
                      >
                        <path
                          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                          fill="currentColor"
                        />
                      </svg>
                      Bilan carbone
                    </Link>
                  </li>
                )}
                {hasPermission("GESTION_ZONES", "read") && (
                  <li>
                    <Link
                      href="/logisticien/zones"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-white"
                      >
                        <path
                          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                          fill="currentColor"
                        />
                      </svg>
                      Gestion zones
                    </Link>
                  </li>
                )}
                {hasPermission("GESTION_DATES", "read") && (
                  <li>
                    <Link
                      href="/logisticien/dates"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-white"
                      >
                        <path
                          d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"
                          fill="currentColor"
                        />
                      </svg>
                      Gestion dates
                    </Link>
                  </li>
                )}
              </ul>
            </details>
            )
          )}

          {/* Lien Admin (Super Admin uniquement) */}
          {isSuperAdmin && (
            <div className="pt-2">
              <Link
                href="/admin/users"
                className={`flex items-center ${collapsed ? "justify-center" : "gap-2"} px-3 py-2.5 bg-purple-500/20 text-purple-200 rounded-lg hover:bg-purple-500/30 active:bg-purple-500/40 text-xs font-semibold uppercase tracking-wide transition-colors`}
                onClick={() => setSidebarOpen(false)}
                title="Administration"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                    fill="currentColor"
                  />
                </svg>
                {!collapsed && "Administration"}
              </Link>
            </div>
          )}
        </nav>
        {/* Bouton collapse (desktop uniquement) */}
        <div className="hidden sm:flex border-t border-white/10 p-2 justify-center">
          <button
            onClick={toggleCollapsed}
            className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors text-white/70 hover:text-white"
            title={collapsed ? "Déplier le menu" : "Replier le menu"}
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>
        {/* Déconnexion */}
        <div className="border-t border-white/10 p-3 sm:p-4 mb-16 sm:mb-0">
          <button
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
            }}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full text-left px-3 py-3 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors text-sm`}
            title="Se déconnecter"
          >
            <Image
              src="/logisticien/Vector%20(21).svg"
              width={16}
              height={16}
              alt=""
            />
            {!collapsed && "Se déconnecter"}
          </button>
        </div>
        {/* Close button mobile */}
        {sidebarOpen && (
          <button
            className="absolute top-4 right-4 sm:hidden text-white bg-[#2C2F3F] p-2.5 rounded-full active:bg-[#1a1d2e] transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
          >
            <X size={24} />
          </button>
        )}
      </aside>
      {/* Contenu principal */}
      <main className="flex-1 bg-gray-50 h-auto min-h-0 pb-20 sm:pb-0">
        {children}
      </main>
      {/* Navbar mobile en bas */}
      <MobileNavbar onBurger={() => setSidebarOpen(true)} hidden={sidebarOpen} />
    </div>
  );
}
