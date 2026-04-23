import Link from "next/link";
import { Building2, Info } from "lucide-react";

interface EspaceOption {
  id: string;
  slug: string;
  name: string;
  color: string;
  logo: string | null;
}

interface NoEspaceStateProps {
  mode: "none" | "choose";
  espaces?: EspaceOption[];
  currentSearchParams?: Record<string, string | undefined>;
}

function buildEspaceUrl(
  slug: string,
  currentSearchParams?: Record<string, string | undefined>
): string {
  const qs = new URLSearchParams();
  if (currentSearchParams) {
    for (const [k, v] of Object.entries(currentSearchParams)) {
      if (k === "espace") continue;
      if (v === undefined || v === null || v === "") continue;
      qs.set(k, String(v));
    }
  }
  qs.set("espace", slug);
  return `/logisticien?${qs.toString()}`;
}

export default function NoEspaceState({ mode, espaces = [], currentSearchParams }: NoEspaceStateProps) {
  if (mode === "none") {
    return (
      <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-6 sm:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">
        <div className="max-w-lg w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-6 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Info size={18} />
            </div>
            <div className="space-y-2 min-w-0">
              <h2 className="font-bold text-[15px] sm:text-base leading-tight">
                Aucun Espace rattaché à votre compte
              </h2>
              <p className="text-sm leading-relaxed">
                Votre compte n&apos;est rattaché à aucun Espace (organisation).
                Contactez un administrateur pour qu&apos;il vous assigne un
                Espace : vous pourrez alors voir les accréditations et
                interagir avec la plateforme.
              </p>
              <p className="text-xs text-amber-800/80">
                En attendant, aucune donnée n&apos;est visible.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-6 sm:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">
      <div className="max-w-xl w-full rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#EEF1F8] flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-[#4F587E]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-[15px] sm:text-base text-gray-900 leading-tight">
              Choisissez un Espace
            </h2>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
              Votre compte est rattaché à plusieurs Espaces. Sélectionnez
              celui sur lequel vous souhaitez travailler — vous pourrez en
              changer à tout moment.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {espaces.map((org) => (
            <Link
              key={org.id}
              href={buildEspaceUrl(org.slug, currentSearchParams)}
              className="group flex items-center gap-3 rounded-xl border border-gray-200 p-3 min-h-[56px] hover:border-[#4F587E] hover:bg-[#F6F8FC] active:bg-[#EEF1F8] transition"
            >
              <div
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: org.color }}
              >
                {org.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={org.logo}
                    alt=""
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  org.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#4F587E]">
                  {org.name}
                </p>
                <p className="text-xs text-gray-500 truncate">/{org.slug}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
