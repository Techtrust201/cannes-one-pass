"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

interface Props {
  /**
   * Conteneur scrollable à observer/remonter. Si non fourni (ou null), on
   * écoute le scroll de la fenêtre (cas mobile / pages en scroll de page).
   */
  scrollContainer?: HTMLElement | null;
  /** Seuil d'apparition en px (défaut 300). */
  threshold?: number;
}

/**
 * Bouton « Remonter en haut » discret, fixé en bas à droite, visible uniquement
 * après un défilement suffisant. Remonte en douceur le conteneur scrollable
 * (desktop) ou la fenêtre (mobile).
 */
export default function ScrollToTopButton({
  scrollContainer,
  threshold = 300,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target: HTMLElement | Window = scrollContainer ?? window;

    const getScrollTop = () =>
      scrollContainer
        ? scrollContainer.scrollTop
        : window.scrollY || document.documentElement.scrollTop;

    const onScroll = () => setVisible(getScrollTop() > threshold);

    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scrollContainer, threshold]);

  const handleClick = () => {
    const target: HTMLElement | Window = scrollContainer ?? window;
    target.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Remonter en haut"
      title="Remonter en haut"
      className="fixed z-40 right-4 bottom-[calc(var(--mobile-nav-total,0px)+1rem)] sm:bottom-6 flex h-11 w-11 items-center justify-center rounded-full bg-[#3F4660] text-white shadow-lg ring-1 ring-black/5 transition hover:bg-[#2C2F3F] active:scale-95 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <ArrowUp size={20} />
    </button>
  );
}
