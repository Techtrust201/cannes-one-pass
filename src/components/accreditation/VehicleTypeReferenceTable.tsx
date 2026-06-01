"use client";

import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { getColorClasses } from "@/lib/color-palette";
import { formatNumber } from "@/lib/carbonData";

export default function VehicleTypeReferenceTable() {
  const espace = useEspaceSlug();
  const { types, loading } = useVehicleTypes(false, espace);

  if (loading) {
    return (
      <div className="text-xs text-gray-500 py-2">Chargement des gabarits...</div>
    );
  }

  if (types.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden bg-[#1f2937] text-white">
      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b border-gray-600 text-gray-300">
              <th className="px-3 py-2 text-left font-medium">Gabarit</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">Tonnage mini (T)</th>
              <th className="px-3 py-2 text-right font-medium">Tonnage moyen (T)</th>
              <th className="px-3 py-2 text-right font-medium">Tonnage maxi (T)</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => {
              const colors = getColorClasses(type.color);
              return (
                <tr key={type.code} className="border-b border-gray-700/60">
                  <td className="px-3 py-2 font-medium">{type.gabarit}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
                    >
                      {type.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatNumber(type.tonnageMini).replace(/\s/g, "")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatNumber(type.tonnageMoyen).replace(/\s/g, "")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatNumber(type.tonnageMaxi).replace(/\s/g, "")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[10px] md:text-xs text-gray-400 border-t border-gray-700">
        Tonnages exprimés en PTAC (Poids Total Autorisé en Charge). Valeurs indicatives
        marché français — peuvent varier selon le constructeur et l&apos;équipement.
      </p>
    </div>
  );
}
