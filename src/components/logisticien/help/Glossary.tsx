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

/** Lexique court en `<details>`, repliable. */
export default function Glossary({
  id = "lexique",
  title = "Lexique",
  terms,
  defaultOpen = false,
}: GlossaryProps) {
  if (terms.length === 0) return null;

  return (
    <details
      id={id}
      open={defaultOpen || undefined}
      className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-h-11 items-center justify-between gap-2 sm:min-h-0">
          {title}
          <span className="text-xs font-normal text-gray-400">ouvrir / fermer</span>
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
