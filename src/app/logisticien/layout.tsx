"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Image from "next/image";
import { useState, useEffect, useMemo, Suspense } from "react";
import { X, ChevronsLeft, ChevronsRight } from "lucide-react";
import MobileNavbar from "@/components/logisticien/MobileNavbar";
import { usePermissions } from "@/hooks/usePermissions";
import { authClient } from "@/lib/auth-client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { withEspaceQuery } from "@/lib/url";
import { ESPACE_COOKIE } from "@/lib/espace-cookie";
import EspaceSwitcher from "@/components/logisticien/EspaceSwitcher";
import EspaceChangeRefresher from "@/components/logisticien/EspaceChangeRefresher";
import { VehicleTypesProvider } from "@/contexts/VehicleTypesContext";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export default function LogisticienLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin h-8 w-8 border-4 border-[#3F4660] border-t-transparent rounded-full" />
        </div>
      }
    >
      <LogisticienLayoutContent>{children}</LogisticienLayoutContent>
    </Suspense>
  );
}

function LogisticienLayoutContent({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, hasPermission, isSuperAdmin, loading } =
    usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const espace = searchParams?.get("espace") ?? null;
  const withEspace = useMemo(
    () => (path: string) => withEspaceQuery(path, espace),
    [espace]
  );

  // Restaurer l'état collapsed depuis localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "true") setCollapsed(true);
    } catch { /* ignore SSR */ }
  }, []);

  // Guard multi-tenant : toute sous-page logisticien doit avoir `?espace=`.
  // Le dashboard racine `/logisticien` gère son propre redirect côté serveur.
  // Pour les sous-pages, on résout l'espace dans l'ordre : cookie « dernier
  // espace » → Palais → 1er espace accessible, puis on redirige côté client.
  useEffect(() => {
    if (espace) return;
    if (!pathname || pathname === "/logisticien") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me/espaces");
        if (!res.ok) return;
        const list: Array<{ slug: string; name: string }> = await res.json();
        if (cancelled || list.length === 0) return;
        // 1) Dernier espace choisi (cookie), s'il est toujours accessible.
        const cookieEspace = document.cookie
          .split("; ")
          .find((c) => c.startsWith(`${ESPACE_COOKIE}=`))
          ?.split("=")[1];
        const decoded = cookieEspace ? decodeURIComponent(cookieEspace) : null;
        const fromCookie = decoded && list.some((o) => o.slug === decoded) ? decoded : null;
        // 2) Palais en priorité, 3) sinon le 1er accessible.
        const palais = list.find((o) => o.slug === "palais-des-festivals");
        const target = fromCookie ?? (palais ?? list[0]).slug;
        const qs = new URLSearchParams(searchParams?.toString() ?? "");
        qs.set("espace", target);
        router.replace(`${pathname}?${qs.toString()}`);
      } catch {
        // Erreur réseau : on laisse l'utilisateur sur la page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [espace, pathname, router, searchParams]);

  // Redirection vers /login UNIQUEMENT via effet (jamais pendant le render) :
  // naviguer pendant le render leve "Cannot update a component while rendering"
  // -> exception client au 1er chargement (cf. bug scan). On attend que l'état
  // session soit confirmé (`!loading`) avant de conclure à une déconnexion.
  useEffect(() => {
    if (loading || user) return;
    router.replace(
      `/login?callbackUrl=${encodeURIComponent(pathname || "/logisticien")}`
    );
  }, [loading, user, pathname, router]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Spinner neutre pendant le chargement de session ET pendant la redirection
  // login (user absent) : aucun rendu de l'app ni navigation pendant le render.
  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#3F4660] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen text-sm text-gray-900">
      <EspaceChangeRefresher />
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[55] sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar — fixed sur desktop : reste toujours visible au scroll
          (pages longues type Comptage, Archives…). Le main compense via ml. */}
      <aside
        className={`
        fixed top-0 left-0 z-[60] h-screen bg-[#3F4660] text-white flex flex-col transition-all duration-300
        ${sidebarOpen ? "translate-x-0 w-60" : "-translate-x-full w-60"}
        sm:translate-x-0 sm:flex
        ${collapsed ? "sm:w-16" : "sm:w-60"}
      `}
      >
        {/* Logo + User info */}
        <div className="h-auto border-b border-white/10">
          <div className="h-16 sm:h-14 flex items-center justify-center px-2">
            <Image
              src="/icons/icon-192.png"
              alt="Cannes One Pass"
              width={52}
              height={52}
              className="object-contain max-h-14 sm:max-h-11 w-auto"
              priority
            />
          </div>
          {user && !collapsed && (
            <div className="px-4 pb-3 sm:pb-2">
              <p className="text-xs text-white/70 truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-white/50 truncate">
                {user.email}
              </p>
            </div>
          )}
        </div>
        {/* Sélecteur d'Espace */}
        <EspaceSwitcher collapsed={collapsed} />
        {/* Navigation */}
        <nav className="logisticien-sidebar-scroll flex-1 overflow-y-auto px-2 py-4 space-y-4 pb-20 sm:pb-4 sm:py-2 sm:space-y-2">
          {/* Bloc Accréditations */}
          {(hasPermission("LISTE", "read") ||
            hasPermission("CREER", "read")) && (
            collapsed ? (
              <div className="space-y-1">
                {hasPermission("LISTE", "read") && (
                  <Link href={withEspace("/logisticien")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Liste" onClick={() => setSidebarOpen(false)}>
                    <Image src="/logisticien/Vector%20(17).svg" width={16} height={16} alt="Liste" />
                  </Link>
                )}
                {hasPermission("CREER", "read") && (
                  <Link href={withEspace("/logisticien/nouveau?step=1")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Créer" onClick={() => setSidebarOpen(false)}>
                    <Image src="/logisticien/Vector%20(18).svg" width={16} height={16} alt="Créer" />
                  </Link>
                )}
                {hasPermission("LISTE", "read") && (
                  <Link href={withEspace("/logisticien/stands")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Stands" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                      <path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16M9 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                )}
                {hasPermission("ARCHIVES", "read") && (
                  <Link href={withEspace("/logisticien/archives")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Archives" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                      <path d="M21 8v13H3V8M1 3h22v5H1V3zM10 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                )}
              </div>
            ) : (
            <details open className="group">
              <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 sm:py-2 bg-[#2C2F3F] rounded-lg text-xs font-semibold uppercase tracking-wide select-none">
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
                      href={withEspace("/logisticien")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
                      href={withEspace("/logisticien/nouveau?step=1")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
                {hasPermission("LISTE", "read") && (
                  <li>
                    <Link
                      href={withEspace("/logisticien/stands")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                        <path d="M3 9l1-5h16l1 5M4 9v11h16V9M4 9h16M9 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Stands
                    </Link>
                  </li>
                )}
                {hasPermission("ARCHIVES", "read") && (
                  <li>
                    <Link
                      href={withEspace("/logisticien/archives")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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

          {/* Bloc Tickets de support */}
          {hasPermission("TICKETS", "read") && (
            collapsed ? (
              <div className="space-y-1">
                <Link
                  href={withEspace("/logisticien/tickets")}
                  className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors"
                  title="Tickets de support"
                  onClick={() => setSidebarOpen(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  </svg>
                </Link>
              </div>
            ) : (
              <details open className="group">
                <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 sm:py-2 bg-[#2C2F3F] rounded-lg text-xs font-semibold uppercase tracking-wide select-none">
                  <span className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                    </svg>
                    Support
                  </span>
                  <svg className="w-3 h-3 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6 8l4 4 4-4" />
                  </svg>
                </summary>
                <ul className="mt-2 pl-3 space-y-1 text-sm">
                  <li>
                    <Link
                      href={withEspace("/logisticien/tickets")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      Tickets
                    </Link>
                  </li>
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
                  <Link href={withEspace("/logisticien/scanner?tab=plaque")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Plaque" onClick={() => setSidebarOpen(false)}>
                    <Image src="/logisticien/Group%201%20(1).svg" width={22} height={16} alt="Plaque" />
                  </Link>
                )}
                {hasPermission("QR_CODE", "read") && (
                  <Link href={withEspace("/logisticien/scanner?tab=qr")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="QR code" onClick={() => setSidebarOpen(false)}>
                    <Image src="/logisticien/Vector%20(20).svg" width={16} height={16} alt="QR code" />
                  </Link>
                )}
              </div>
            ) : (
            <details open className="group">
              <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 sm:py-2 bg-[#2C2F3F] rounded-lg text-xs font-semibold uppercase tracking-wide select-none">
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
                      href={withEspace("/logisticien/scanner?tab=plaque")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
                      href={withEspace("/logisticien/scanner?tab=qr")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
                  <Link href={withEspace("/logisticien/vehicles")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Flux véhicules" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="currentColor"/></svg>
                  </Link>
                )}
                {hasPermission("BILAN_CARBONE", "read") && (
                  <Link href={withEspace("/logisticien/carbon")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Bilan carbone" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/></svg>
                  </Link>
                )}
                {hasPermission("GESTION_ZONES", "read") && (
                  <Link href={withEspace("/logisticien/zones")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Gestion zones" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>
                  </Link>
                )}
                {hasPermission("GESTION_DATES", "read") && (
                  <Link href={withEspace("/logisticien/dates")} className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors" title="Gestion dates" onClick={() => setSidebarOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" fill="currentColor"/></svg>
                  </Link>
                )}
              </div>
            ) : (
            <details open className="group">
              <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 sm:py-2 bg-[#2C2F3F] rounded-lg text-xs font-semibold uppercase tracking-wide select-none">
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
                      href={withEspace("/logisticien/vehicles")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
                      href={withEspace("/logisticien/carbon")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
                {hasPermission("LISTE", "read") && (
                  <li>
                    <Link
                      href={withEspace("/logisticien/exports")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
                          d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Exports
                    </Link>
                  </li>
                )}
                {hasPermission("GESTION_ZONES", "read") && (
                  <li>
                    <Link
                      href={withEspace("/logisticien/zones")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
                      href={withEspace("/logisticien/dates")}
                      className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
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
            <div className="pt-2 sm:pt-1">
              <Link
                href="/admin/users"
                className={`flex items-center ${collapsed ? "justify-center" : "gap-2"} px-3 py-2.5 sm:py-2 bg-purple-500/20 text-purple-200 rounded-lg hover:bg-purple-500/30 active:bg-purple-500/40 text-xs font-semibold uppercase tracking-wide transition-colors`}
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
        <div className="hidden sm:flex border-t border-white/10 p-1.5 justify-center">
          <button
            onClick={toggleCollapsed}
            className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors text-white/70 hover:text-white"
            title={collapsed ? "Déplier le menu" : "Replier le menu"}
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>
        {/* Déconnexion */}
        <div className="border-t border-white/10 p-3 sm:p-3 mb-16 sm:mb-0">
          <button
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
            }}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full text-left px-3 py-3 sm:py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors text-sm`}
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
      {/* Contenu principal — marge gauche desktop = largeur sidebar fixed */}
      <main
        className={`flex-1 bg-gray-50 h-auto min-h-0 overflow-x-hidden pb-[var(--mobile-nav-total)] md:pb-0 flex flex-col transition-all duration-300 ${
          collapsed ? "sm:ml-16" : "sm:ml-60"
        }`}
      >
        {/* Barre supérieure mobile : espace actif + accès rapide switch */}
        <div className="md:hidden sticky top-0 z-40 bg-[#3F4660] text-white px-3 py-2 flex items-center justify-between gap-2 shadow-sm pt-[calc(var(--safe-top)+0.5rem)]">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-lg text-white/90 active:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Ouvrir le menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <EspaceSwitcher variant="mobile" />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <VehicleTypesProvider>
            {children}
          </VehicleTypesProvider>
        </div>
      </main>
      {/* Navbar mobile en bas */}
      <MobileNavbar onBurger={() => setSidebarOpen(true)} hidden={sidebarOpen} espace={espace} />
    </div>
  );
}
