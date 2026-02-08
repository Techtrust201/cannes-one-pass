import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Tronque un texte à une longueur maximale et ajoute "..." si nécessaire
 * @param text - Le texte à tronquer
 * @param maxLength - La longueur maximale (par défaut 20)
 * @returns Le texte tronqué avec "..." si nécessaire
 */
export function truncateText(text: string, maxLength: number = 20): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
