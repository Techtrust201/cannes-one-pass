import type { ReactNode } from "react";

/** Texte d’aide sous un champ de formulaire. */
export default function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-snug text-gray-500">{children}</p>;
}
