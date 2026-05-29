"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { PortalOverlay } from "@/components/ui/PortalOverlay";
import { cn } from "@/lib/utils";

export type BottomChromeMode = "public" | "logisticien" | "none";

interface AnchoredDropdownProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** Réserve basse selon le contexte (footer wizard, navbar logisticien). */
  bottomChrome?: BottomChromeMode;
  className?: string;
  children: ReactNode;
}

const GAP = 4;

function readPxVar(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.height = raw;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return px || fallback;
}

function bottomReserve(mode: BottomChromeMode): number {
  const safeBottom = readPxVar("--safe-bottom", 0);
  if (mode === "logisticien") {
    return readPxVar("--mobile-nav-total", 56 + safeBottom);
  }
  if (mode === "public") {
    const footer = readPxVar("--wizard-footer-height", 48);
    return footer + safeBottom;
  }
  return safeBottom;
}

/**
 * Panneau dropdown ancré au trigger, rendu en portal avec position fixed
 * et max-height dynamique pour ne pas passer sous les barres fixes du bas.
 */
export function AnchoredDropdown({
  open,
  onClose,
  anchorRef,
  bottomChrome = "none",
  className,
  children,
}: AnchoredDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || !open) return;

    const rect = anchor.getBoundingClientRect();
    const reserve = bottomReserve(bottomChrome);
    const maxHeight = Math.max(
      120,
      Math.min(320, window.innerHeight - rect.bottom - reserve - GAP)
    );

    setStyle({
      top: rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, [anchorRef, bottomChrome, open]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onScrollOrResize() {
      updatePosition();
    }

    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !style) return null;

  return (
    <PortalOverlay>
      <div
        ref={panelRef}
        role="listbox"
        className={cn(
          "fixed z-[60] overflow-y-auto rounded-md border border-gray-200 bg-white shadow-xl",
          className
        )}
        style={{
          top: style.top,
          left: style.left,
          width: style.width,
          maxHeight: style.maxHeight,
        }}
      >
        {children}
      </div>
    </PortalOverlay>
  );
}
