"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";

type PageHelpProps = {
  /** Clé localStorage unique par page (ex. "rx-planning"). */
  storageKey: string;
  title?: string;
  children: ReactNode;
  /** Ancre optionnelle vers un glossaire sur la page. */
  glossaryHref?: string;
};

/**
 * Bandeau dismissible « À quoi sert cette page ».
 * Masqué via localStorage une fois fermé ; réaffichable en vidant le stockage.
 */
export default function PageHelp({
  storageKey,
  title = "À quoi sert cette page ?",
  children,
  glossaryHref,
}: PageHelpProps) {
  const key = `page-help:${storageKey}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(key) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [key]);

  if (!visible) return null;

  return (
    <div className="relative mb-4 rounded-xl border border-[#3F4660]/20 bg-[#3F4660]/5 p-3 sm:p-4">
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(key, "1");
          } catch {
            /* ignore */
          }
          setVisible(false);
        }}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-[#3F4660]/70 hover:bg-[#3F4660]/10 hover:text-[#3F4660] sm:h-9 sm:w-9"
        aria-label="Masquer l’aide"
        title="Masquer"
      >
        <X size={18} />
      </button>
      <div className="flex gap-3 pr-10">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#3F4660]" aria-hidden />
        <div className="min-w-0 text-sm text-[#3F4660]">
          <p className="font-semibold">{title}</p>
          <div className="mt-1 space-y-1.5 text-[13px] leading-relaxed text-[#3F4660]/90">
            {children}
          </div>
          {glossaryHref && (
            <a
              href={glossaryHref}
              className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-2 sm:min-h-0"
            >
              Voir le lexique
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
