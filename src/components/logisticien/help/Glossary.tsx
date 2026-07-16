"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  GLOSSARY_OPEN_EVENT,
  openGlossaryById,
  parseGlossaryIdFromHash,
} from "./glossary-anchor";

type GlossaryTerm = {
  term: string;
  definition: string;
};

type GlossaryProps = {
  id?: string;
  title?: string;
  terms: GlossaryTerm[];
  /** Ouvert par défaut (ex. première visite). */
  defaultOpen?: boolean;
};

/**
 * Lexique repliable. S’ouvre automatiquement lorsque :
 * - l’URL contient `#lexique-…` ;
 * - l’utilisateur clique sur « Voir le lexique » (PageHelp) ;
 * - un événement `GLOSSARY_OPEN_EVENT` cible cet id.
 */
export default function Glossary({
  id = "lexique",
  title = "Lexique",
  terms,
  defaultOpen = false,
}: GlossaryProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const reactId = useId();
  const summaryId = `${id}-summary-${reactId.replace(/:/g, "")}`;
  const [open, setOpen] = useState(defaultOpen);

  const syncFromHash = useCallback(() => {
    const target = parseGlossaryIdFromHash(window.location.hash);
    if (target === id) {
      setOpen(true);
      requestAnimationFrame(() => {
        detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        const summary = detailsRef.current?.querySelector("summary");
        if (summary instanceof HTMLElement) summary.focus({ preventScroll: true });
      });
    }
  }, [id]);

  useEffect(() => {
    syncFromHash();
    const onHash = () => syncFromHash();
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail?.id === id) setOpen(true);
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener(GLOSSARY_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(GLOSSARY_OPEN_EVENT, onOpen);
    };
  }, [id, syncFromHash]);

  if (terms.length === 0) return null;

  return (
    <details
      ref={detailsRef}
      id={id}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="mb-4 scroll-mt-28 rounded-xl border border-gray-200 bg-white shadow-sm motion-reduce:scroll-auto"
      style={{ scrollMarginTop: "7rem" }}
    >
      <summary
        id={summaryId}
        tabIndex={0}
        className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900 outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-[#3F4660] focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
        aria-expanded={open}
      >
        <span className="flex min-h-11 items-center justify-between gap-2 sm:min-h-0">
          {title}
          <span className="text-xs font-normal text-gray-400" aria-hidden>
            {open ? "fermer" : "ouvrir"}
          </span>
        </span>
      </summary>
      <dl className="space-y-3 border-t border-gray-100 px-4 py-3">
        {terms.map((item) => (
          <div key={item.term}>
            <dt className="text-sm font-semibold text-[#3F4660]">{item.term}</dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-gray-600">{item.definition}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Bouton « Voir le lexique » — ouvre le `<details>` ciblé. */
export function GlossaryLink({
  glossaryId,
  className,
  children = "Voir le lexique",
}: {
  glossaryId: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={
        className ??
        "mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-[#3F4660] underline underline-offset-2 hover:text-[#2a3048] sm:min-h-0"
      }
      onClick={() => openGlossaryById(glossaryId)}
    >
      {children}
    </button>
  );
}
