import type { ChangeEvent, RefObject } from "react";

/**
 * Normalise une plaque d'immatriculation : alphanumérique uniquement, majuscules.
 */
export function sanitizePlate(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Calcule la position du curseur après sanitisation (caractères spéciaux retirés).
 */
export function plateCursorAfterSanitize(rawValue: string, cursorPos: number): number {
  return rawValue.slice(0, cursorPos).replace(/[^A-Za-z0-9]/g, "").length;
}

/**
 * Handler réutilisable pour inputs plaque (Palais, RX livraison/reprise).
 */
export function handleSanitizedPlateInput(
  e: ChangeEvent<HTMLInputElement>,
  onChange: (sanitized: string) => void,
  inputRef?: RefObject<HTMLInputElement | null>
): void {
  const input = e.target;
  const rawValue = input.value;
  const cursorPos = input.selectionStart ?? rawValue.length;
  const newCursor = plateCursorAfterSanitize(rawValue, cursorPos);
  const sanitized = sanitizePlate(rawValue);
  onChange(sanitized);
  if (inputRef?.current) {
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(newCursor, newCursor);
    });
  }
}
