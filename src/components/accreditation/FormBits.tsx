"use client";

import { formErrorClass } from "@/lib/form-styles";

/** Astérisque rouge signalant un champ obligatoire. */
export function RequiredMark() {
  return (
    <span className="text-red-500" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

/** Message d'erreur affiché sous un champ lorsque `show` est vrai. */
export function FieldError({
  show,
  children,
}: {
  show?: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return <p className={formErrorClass}>{children}</p>;
}

/**
 * Résumé des champs obligatoires manquants, affiché en haut d'étape après une
 * tentative de validation infructueuse.
 */
export function RequiredFieldsSummary({
  show,
  title,
  fields,
}: {
  show?: boolean;
  title: string;
  fields: string[];
}) {
  if (!show || fields.length === 0) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5 space-y-0.5">
        {fields.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
