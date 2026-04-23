"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Building2, ChevronDown, Check } from "lucide-react";

interface EspaceOption {
  id: string;
  slug: string;
  name: string;
  color: string;
  logo: string | null;
}

interface EspaceSwitcherProps {
  collapsed?: boolean;
}

export default function EspaceSwitcher({ collapsed = false }: EspaceSwitcherProps) {
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
    function onClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

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
    router.push(target);
  }

  if (collapsed) {
    return (
      <div ref={ref} className="relative flex justify-center px-2 pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white"
          title={current ? current.name : "Choisir un Espace"}
          style={{ backgroundColor: current?.color ?? "#2C2F3F" }}
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
          <div className="absolute left-full top-0 ml-2 w-56 z-50 rounded-xl bg-white shadow-xl border border-gray-200 py-1">
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

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-left transition-colors"
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-white"
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
          <p className="text-xs font-semibold text-white truncate">
            {current ? current.name : "Choisir…"}
          </p>
        </div>
        <ChevronDown size={14} className="text-white/60 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 mt-1 z-50 rounded-xl bg-white shadow-xl border border-gray-200 py-1">
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
}: {
  espaces: EspaceOption[];
  currentSlug: string | null;
  onSelect: (slug: string | null) => void;
}) {
  return (
    <ul className="max-h-72 overflow-y-auto">
      {espaces.map((org) => {
        const active = org.slug === currentSlug;
        return (
          <li key={org.id}>
            <button
              type="button"
              onClick={() => onSelect(org.slug)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                active ? "bg-gray-50" : ""
              }`}
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white text-[11px] font-bold"
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
                <p className="text-gray-900 truncate">{org.name}</p>
                <p className="text-[10px] text-gray-500 truncate">/{org.slug}</p>
              </div>
              {active && <Check size={14} className="text-[#4F587E] shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
