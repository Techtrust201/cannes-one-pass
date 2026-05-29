"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

interface VehicleRow {
  id: number;
  plate: string | null;
  vehicleType: string | null;
  trailerPlate: string | null;
  date: string;
  time: string;
  assignedAt: string | null;
}

interface Props {
  accreditationStand: string;
  vehicles: VehicleRow[];
}

/**
 * Panneau d'affectation des plaques pour les accréditations RX.
 *
 * Affiché au-dessus de la fiche détail logisticien lorsque
 * `accreditation.organizationId → org.formTemplate === "rx"`.
 *
 * Pour chaque véhicule attendu sans plaque, l'agent saisit la plaque
 * réelle à l'arrivée du chauffeur. Le serveur écrit `Vehicle.plate` +
 * `Vehicle.assignedAt` et journalise dans l'historique.
 */
export function RxAssignPlatesPanel({ accreditationStand, vehicles }: Props) {
  const [rows, setRows] = useState<VehicleRow[]>(vehicles);
  const [drafts, setDrafts] = useState<Record<number, { plate: string; trailerPlate: string }>>(
    () => {
      const init: Record<number, { plate: string; trailerPlate: string }> = {};
      for (const v of vehicles) {
        init[v.id] = { plate: v.plate ?? "", trailerPlate: v.trailerPlate ?? "" };
      }
      return init;
    }
  );
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  async function handleAssign(vehicleId: number) {
    const draft = drafts[vehicleId];
    if (!draft?.plate.trim()) {
      setErrors((e) => ({ ...e, [vehicleId]: "La plaque est obligatoire" }));
      return;
    }
    setBusy((b) => ({ ...b, [vehicleId]: true }));
    setErrors((e) => ({ ...e, [vehicleId]: "" }));
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/assign-plate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: draft.plate.trim(),
          trailerPlate: draft.trailerPlate.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrors((e) => ({
          ...e,
          [vehicleId]: data.error ?? "Échec de l'affectation",
        }));
        return;
      }
      const updated = (await res.json()) as {
        id: number;
        plate: string | null;
        trailerPlate: string | null;
        assignedAt: string | null;
      };
      setRows((rs) =>
        rs.map((r) =>
          r.id === updated.id
            ? {
                ...r,
                plate: updated.plate,
                trailerPlate: updated.trailerPlate,
                assignedAt: updated.assignedAt,
              }
            : r
        )
      );
    } catch (err) {
      console.error(err);
      setErrors((e) => ({ ...e, [vehicleId]: "Erreur réseau" }));
    } finally {
      setBusy((b) => ({ ...b, [vehicleId]: false }));
    }
  }

  const pending = rows.filter((v) => !v.plate);

  function renderVehicleRow(v: VehicleRow) {
    const draft = drafts[v.id] ?? { plate: "", trailerPlate: "" };
    const assigned = !!v.plate;
    const isBusy = !!busy[v.id];
    const err = errors[v.id];

    return { draft, assigned, isBusy, err };
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-gray-800 break-words">
            Véhicules attendus — {accreditationStand}
          </h2>
          <p className="text-xs text-gray-500">
            Affectez la plaque réelle au véhicule entrant lors de son arrivée.
          </p>
        </div>
        {pending.length > 0 ? (
          <span className="shrink-0 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-1 rounded">
            {pending.length} en attente
          </span>
        ) : (
          <span className="shrink-0 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
            Tous affectés
          </span>
        )}
      </div>

      {/* Mobile : une card par véhicule */}
      <div className="md:hidden space-y-3">
        {rows.map((v) => {
          const { draft, assigned, isBusy, err } = renderVehicleRow(v);
          return (
            <div
              key={v.id}
              className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{v.vehicleType ?? "—"}</div>
                  <div className="text-xs text-gray-500">
                    {v.date} {v.time}
                  </div>
                </div>
                {assigned ? (
                  <span className="inline-flex items-center gap-1 text-green-700 text-xs shrink-0">
                    <CheckCircle2 size={14} /> Affectée
                  </span>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">
                  Plaque
                  <input
                    value={assigned ? (v.plate ?? "") : draft.plate}
                    onChange={(e) =>
                      !assigned &&
                      setDrafts((d) => ({
                        ...d,
                        [v.id]: { ...draft, plate: e.target.value },
                      }))
                    }
                    disabled={assigned}
                    placeholder="AB-123-CD"
                    className="mt-1 w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-mono disabled:bg-white"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  Remorque (optionnel)
                  <input
                    value={assigned ? (v.trailerPlate ?? "") : draft.trailerPlate}
                    onChange={(e) =>
                      !assigned &&
                      setDrafts((d) => ({
                        ...d,
                        [v.id]: { ...draft, trailerPlate: e.target.value },
                      }))
                    }
                    disabled={assigned}
                    placeholder="(optionnel)"
                    className="mt-1 w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-mono disabled:bg-white"
                  />
                </label>
              </div>
              {err && <div className="text-xs text-red-600">{err}</div>}
              {!assigned && (
                <button
                  onClick={() => handleAssign(v.id)}
                  disabled={isBusy}
                  className="w-full inline-flex items-center justify-center gap-1 text-sm bg-primary text-white px-3 py-2 rounded-md disabled:opacity-60"
                >
                  {isBusy && <Loader2 size={14} className="animate-spin" />}
                  Affecter
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop : table */}
      <div className="hidden md:block overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b">
            <tr>
              <th className="text-left py-1 pr-3">Gabarit</th>
              <th className="text-left py-1 pr-3">Créneau</th>
              <th className="text-left py-1 pr-3">Plaque</th>
              <th className="text-left py-1 pr-3">Remorque</th>
              <th className="text-left py-1 pr-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const { draft, assigned, isBusy, err } = renderVehicleRow(v);
              return (
                <tr key={v.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 text-gray-800">{v.vehicleType ?? "—"}</td>
                  <td className="py-2 pr-3 text-gray-600">
                    {v.date} {v.time}
                  </td>
                  <td className="py-2 pr-3">
                    {assigned ? (
                      <span className="font-mono font-semibold">{v.plate}</span>
                    ) : (
                      <input
                        value={draft.plate}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [v.id]: { ...draft, plate: e.target.value },
                          }))
                        }
                        placeholder="AB-123-CD"
                        className="w-32 border border-gray-300 rounded-md px-2 py-1 text-sm font-mono"
                      />
                    )}
                    {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
                  </td>
                  <td className="py-2 pr-3">
                    {assigned ? (
                      <span className="font-mono text-gray-600">{v.trailerPlate ?? "—"}</span>
                    ) : (
                      <input
                        value={draft.trailerPlate}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [v.id]: { ...draft, trailerPlate: e.target.value },
                          }))
                        }
                        placeholder="(optionnel)"
                        className="w-28 border border-gray-300 rounded-md px-2 py-1 text-sm font-mono"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {assigned ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs">
                        <CheckCircle2 size={14} /> Affectée
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAssign(v.id)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 text-xs bg-primary text-white px-3 py-1 rounded-md disabled:opacity-60"
                      >
                        {isBusy && <Loader2 size={14} className="animate-spin" />}
                        Affecter
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
