/** Palette de couleurs partagée (zones + gabarits véhicules) */
export const COLOR_OPTIONS = [
  { value: "orange", label: "Orange", hex: "#F97316" },
  { value: "green", label: "Vert", hex: "#22C55E" },
  { value: "blue", label: "Bleu", hex: "#3B82F6" },
  { value: "purple", label: "Violet", hex: "#8B5CF6" },
  { value: "red", label: "Rouge", hex: "#EF4444" },
  { value: "yellow", label: "Jaune", hex: "#EAB308" },
  { value: "pink", label: "Rose", hex: "#EC4899" },
  { value: "indigo", label: "Indigo", hex: "#6366F1" },
  { value: "teal", label: "Teal", hex: "#14B8A6" },
  { value: "gray", label: "Gris", hex: "#94A3B8" },
] as const;

export type ColorName = (typeof COLOR_OPTIONS)[number]["value"];

export function getColorHex(colorName: string): string {
  return COLOR_OPTIONS.find((c) => c.value === colorName)?.hex ?? "#94A3B8";
}

export function getColorClasses(colorName: string): {
  bg: string;
  border: string;
  text: string;
  accent: string;
  dot: string;
} {
  const map: Record<string, { bg: string; border: string; text: string; accent: string; dot: string }> = {
    orange: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", accent: "bg-orange-500", dot: "bg-orange-400" },
    green: { bg: "bg-green-50", border: "border-green-300", text: "text-green-800", accent: "bg-green-500", dot: "bg-green-400" },
    blue: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-800", accent: "bg-blue-500", dot: "bg-blue-400" },
    purple: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", accent: "bg-purple-500", dot: "bg-purple-400" },
    red: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", accent: "bg-red-500", dot: "bg-red-400" },
    yellow: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", accent: "bg-yellow-500", dot: "bg-yellow-400" },
    pink: { bg: "bg-pink-50", border: "border-pink-300", text: "text-pink-800", accent: "bg-pink-500", dot: "bg-pink-400" },
    indigo: { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-800", accent: "bg-indigo-500", dot: "bg-indigo-400" },
    teal: { bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-800", accent: "bg-teal-500", dot: "bg-teal-400" },
    gray: { bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-800", accent: "bg-gray-500", dot: "bg-gray-400" },
  };
  return map[colorName] ?? map.gray;
}
