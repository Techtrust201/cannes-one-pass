"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Building2, ChevronDown, Check, X } from "lucide-react";

interface EspaceOption {
  id: string;
  slug: string;
  name: string;
  color: string;
  logo: string | null;
}

interface EspaceSwitcherProps {
  collapsed?: boolean;
  /** Variante d'affichage : sidebar (par défaut) ou barre mobile compacte. */
  variant?: "sidebar" | "mobile";
  /** Callback lorsque l'utilisateur change d'espace (fermeture de sheet, etc.) */
  onChange?: () => void;
}

export default function EspaceSwitcher({
  collapsed = false,
  variant = "sidebar",
  onChange,
}: EspaceSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentEspace = searchParams?.get("espace") ?? null;

  const [espaces, setEspaces] = useState<EspaceOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me/espaces");
        if (!res.ok) return;
        const data: EspaceOption[] = await res.json();
        if (active) setEspaces(data);
      } catch {
        // silencieux — le switcher sera juste caché
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (variant === "mobile") return; // bottom-sheet gère son propre backdrop
    function onClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [variant]);

  // Lock scroll du body quand le sheet mobile est ouvert
  useEffect(() => {
    if (variant !== "mobile") return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open, variant]);

  if (!espaces || espaces.length === 0) return null;

  const current = espaces.find((o) => o.slug === currentEspace) ?? null;

  function switchTo(slug: string | null) {
    const qs = new URLSearchParams();
    if (searchParams) {
      searchParams.forEach((v, k) => {
        if (k === "espace") return;
        qs.set(k, v);
      });
    }
    if (slug) qs.set("espace", slug);
    const target = `${pathname || "/logisticien"}${qs.toString() ? `?${qs}` : ""}`;
    setOpen(false);
    onChange?.();
    router.push(target);
  }

  // ── Variante "mobile" : bouton compact + bottom-sheet plein écran ───────
  if (variant === "mobile") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-full bg-white/10 active:bg-white/20 text-white transition-colors max-w-[60vw]"
          aria-label="Changer d'Espace"
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white"
            style={{ backgroundColor: current?.color ?? "#2C2F3F" }}
          >
            {current?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.logo} alt="" className="w-full h-full object-cover rounded-md" />
            ) : current ? (
              <span className="text-[11px] font-bold">{current.name.charAt(0).toUpperCase()}</span>
            ) : (
              <Building2 size={12} />
            )}
          </div>
          <span className="text-xs font-semibold truncate">
            {current ? current.name : "Choisir un Espace"}
          </span>
          <ChevronDown size={14} className="text-white/70 shrink-0" />
        </button>
        {open && (
          <div className="fixed inset-0 z-[70] sm:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 size={16} className="text-[#4F587E] shrink-0" />
                  <h3 className="font-bold text-sm text-gray-900 truncate">
                    Changer d&apos;Espace
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 -mr-2 rounded-full text-gray-500 active:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Fermer"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="overflow-y-auto py-1">
                <EspaceList
                  espaces={espaces}
                  currentSlug={currentEspace}
                  onSelect={switchTo}
                  compact={false}
                />
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Variante "sidebar" collapsed : petit bouton icône ───────────────────
  if (collapsed) {
    return (
      <div ref={ref} className="relative flex justify-center px-2 pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white active:scale-95 transition-transform"
          title={current ? current.name : "Choisir un Espace"}
          style={{ backgroundColor: current?.color ?? "#2C2F3F" }}
          aria-label={current ? `Espace : ${current.name}` : "Choisir un Espace"}
        >
          {current?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.logo} alt="" className="w-full h-full object-cover rounded-lg" />
          ) : current ? (
            <span className="text-sm font-bold">{current.name.charAt(0).toUpperCase()}</span>
          ) : (
            <Building2 size={16} />
          )}
        </button>
        {open && (
          <div className="absolute left-full top-0 ml-2 w-56 z-50 rounded-xl bg-white shadow-xl border border-gray-200 py-1 max-h-[70vh] overflow-y-auto">
            <EspaceList
              espaces={espaces}
              currentSlug={currentEspace}
              onSelect={switchTo}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Variante "sidebar" étendue ──────────────────────────────────────────
  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2.5 min-h-[44px] bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-lg text-left transition-colors"
      >
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-white"
          style={{ backgroundColor: current?.color ?? "#2C2F3F" }}
        >
          {current?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.logo} alt="" className="w-full h-full object-cover rounded-md" />
          ) : current ? (
            <span className="text-xs font-bold">{current.name.charAt(0).toUpperCase()}</span>
          ) : (
            <Building2 size={14} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-white/50 leading-none">
            Espace
          </p>
          <p className="text-xs font-semibold text-white truncate mt-0.5">
            {current ? current.name : "Choisir…"}
          </p>
        </div>
        <ChevronDown size={14} className="text-white/60 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 mt-1 z-50 rounded-xl bg-white shadow-xl border border-gray-200 py-1 max-h-[60vh] overflow-y-auto">
          <EspaceList
            espaces={espaces}
            currentSlug={currentEspace}
            onSelect={switchTo}
          />
        </div>
      )}
    </div>
  );
}

function EspaceList({
  espaces,
  currentSlug,
  onSelect,
  compact = true,
}: {
  espaces: EspaceOption[];
  currentSlug: string | null;
  onSelect: (slug: string | null) => void;
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "max-h-72 overflow-y-auto" : ""}>
      {espaces.map((org) => {
        const active = org.slug === currentSlug;
        return (
          <li key={org.id}>
            <button
              type="button"
              onClick={() => onSelect(org.slug)}
              className={`w-full flex items-center gap-3 px-4 py-3 min-h-[52px] text-left text-sm hover:bg-gray-50 active:bg-gray-100 ${
                active ? "bg-gray-50" : ""
              }`}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-white text-xs font-bold"
                style={{ backgroundColor: org.color }}
              >
                {org.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logo} alt="" className="w-full h-full object-cover rounded-md" />
                ) : (
                  org.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 truncate font-medium">{org.name}</p>
                <p className="text-[11px] text-gray-500 truncate">/{org.slug}</p>
              </div>
              {active && <Check size={16} className="text-[#4F587E] shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
