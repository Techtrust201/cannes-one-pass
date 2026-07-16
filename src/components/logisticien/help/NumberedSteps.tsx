type Step = {
  title: string;
  description?: string;
};

/**
 * Étapes numérotées — verticale sur mobile, horizontale à partir de `sm`.
 */
export default function NumberedSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li
          key={`${index}-${step.title}`}
          className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3F4660] text-sm font-bold text-white"
            aria-hidden
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{step.title}</p>
            {step.description && (
              <p className="mt-0.5 text-xs leading-snug text-gray-500">{step.description}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
