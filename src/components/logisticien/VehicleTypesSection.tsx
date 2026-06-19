"use client";

import { useState } from "react";
import {
  Pencil,
  Check,
  Loader2,
  PlusCircle,
  Power,
  PowerOff,
  RotateCcw,
  MapPin,
  Languages,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useEspaceSlug } from "@/hooks/useEspaceSlug";
import { useZones } from "@/hooks/useZones";
import { COLOR_OPTIONS, getColorClasses } from "@/lib/color-palette";
import { invalidateVehicleTypeCache } from "@/lib/vehicle-utils";
import type { VehicleTypeData } from "@/lib/vehicle-utils";
import { withEspaceQuery } from "@/lib/url";
import { parseLocalizedNumber } from "@/lib/parse-localized-number";
import { LANGUAGES } from "@/lib/translations";
import {
  isStandardVehicleTypeCode,
  type VehicleTypeDbTranslations,
} from "@/lib/vehicle-type-i18n";

type TranslationFields = Record<string, string>;

/** Ne conserve que les langues supportées avec une valeur non vide. */
function buildDisplayLabels(translations: TranslationFields): VehicleTypeDbTranslations {
  const out: VehicleTypeDbTranslations = {};
  for (const { code } of LANGUAGES) {
    const value = translations[code]?.trim();
    if (value) out[code] = value;
  }
  return out;
}

/**
 * Compte les langues sans traduction BDD explicite pour un gabarit. Les codes
 * standards disposent d'un repli i18n intégré : on n'affiche donc l'alerte
 * « traductions manquantes » que pour les gabarits custom (créés en admin).
 */
function countMissingTranslations(type: VehicleTypeData): number {
  if (isStandardVehicleTypeCode(type.code)) return 0;
  return LANGUAGES.filter((l) => !type.displayLabels?.[l.code]?.trim()).length;
}

interface VehicleTypesSectionProps {
  canWrite: boolean;
}

type NumericFields = {
  tonnageMini: number;
  tonnageMoyen: number;
  tonnageMaxi: number;
  co2Coefficient: number;
  sortOrder: number;
};

/**
 * Valide et normalise les champs numériques d'un gabarit (décimales FR ou EN).
 * Retourne soit les valeurs converties, soit un message d'erreur clair par champ.
 */
function validateNumericFields(
  form: Record<string, string | boolean>
): { ok: true; values: NumericFields } | { ok: false; error: string } {
  const tonnageMini = parseLocalizedNumber(form.tonnageMini);
  if (tonnageMini === null)
    return { ok: false, error: "Le tonnage mini doit être un nombre" };
  const tonnageMoyen = parseLocalizedNumber(form.tonnageMoyen);
  if (tonnageMoyen === null)
    return { ok: false, error: "Le tonnage moyen doit être un nombre" };
  const tonnageMaxi = parseLocalizedNumber(form.tonnageMaxi);
  if (tonnageMaxi === null)
    return { ok: false, error: "Le tonnage maxi doit être un nombre" };
  const co2Coefficient = parseLocalizedNumber(form.co2Coefficient);
  if (co2Coefficient === null)
    return { ok: false, error: "Le CO₂ doit être un nombre" };
  const sortOrderParsed = parseLocalizedNumber(form.sortOrder);
  if (sortOrderParsed === null)
    return { ok: false, error: "L'ordre doit être un nombre" };

  if (tonnageMini > tonnageMoyen)
    return {
      ok: false,
      error: "Le tonnage mini doit être inférieur ou égal au tonnage moyen",
    };
  if (tonnageMoyen > tonnageMaxi)
    return {
      ok: false,
      error: "Le tonnage moyen doit être inférieur ou égal au tonnage maxi",
    };

  return {
    ok: true,
    values: {
      tonnageMini,
      tonnageMoyen,
      tonnageMaxi,
      co2Coefficient,
      sortOrder: Math.round(sortOrderParsed),
    },
  };
}

const EMPTY_FORM = {
  label: "",
  gabarit: "",
  code: "",
  tonnageMini: "",
  tonnageMoyen: "",
  tonnageMaxi: "",
  co2Coefficient: "0.22",
  pdfCode: "C",
  color: "gray",
  showTrailerPlate: false,
  rxPalmBeachAtCanto: false,
  rxZoneCanto: "",
  rxZoneVieuxPort: "",
  sortOrder: "0",
};

export default function VehicleTypesSection({ canWrite }: VehicleTypesSectionProps) {
  const espace = useEspaceSlug();
  const { types, loading, refresh } = useVehicleTypes(true, espace);
  const { zones } = useZones();
  const activeTypes = types.filter((t) => t.isActive);
  const inactiveTypes = types.filter((t) => !t.isActive);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createTranslations, setCreateTranslations] = useState<TranslationFields>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [seeding, setSeeding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | boolean>>({});
  const [editTranslations, setEditTranslations] = useState<TranslationFields>({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [reordering, setReordering] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch(withEspaceQuery("/api/vehicle-types/seed", espace), { method: "POST" });
      if (res.ok) {
        invalidateVehicleTypeCache();
        await refresh();
      }
    } finally {
      setSeeding(false);
    }
  };

  const handleCreate = async () => {
    // `label` est dérivé de `gabarit` (pas de champ dédié en création) : on ne
    // valide donc QUE l'appellation, sinon le bouton « Créer » resterait inerte.
    const gabarit = createForm.gabarit.trim();
    if (!gabarit) {
      setCreateError("L'appellation (gabarit) est requise");
      return;
    }
    const nums = validateNumericFields(createForm);
    if (!nums.ok) {
      setCreateError(nums.error);
      return;
    }

    setCreating(true);
    setCreateError("");
    // Nouveau type ajouté en fin de liste (ordre = max + 1) : l'ordre se gère
    // ensuite visuellement avec les flèches monter/descendre, pas au clavier.
    const nextSortOrder = activeTypes.length
      ? Math.max(...activeTypes.map((t) => t.sortOrder ?? 0)) + 1
      : 0;
    try {
      const res = await fetch(withEspaceQuery("/api/vehicle-types", espace), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gabarit,
          label: gabarit,
          tonnageMini: nums.values.tonnageMini,
          tonnageMoyen: nums.values.tonnageMoyen,
          tonnageMaxi: nums.values.tonnageMaxi,
          co2Coefficient: nums.values.co2Coefficient,
          pdfCode: createForm.pdfCode,
          color: createForm.color,
          showTrailerPlate: createForm.showTrailerPlate,
          rxPalmBeachAtCanto: createForm.rxPalmBeachAtCanto,
          rxZoneCanto: createForm.rxZoneCanto || null,
          rxZoneVieuxPort: createForm.rxZoneVieuxPort || null,
          displayLabels: buildDisplayLabels(createTranslations),
          sortOrder: nextSortOrder,
        }),
      });
      if (res.ok) {
        setShowCreateForm(false);
        setCreateForm(EMPTY_FORM);
        setCreateTranslations({});
        invalidateVehicleTypeCache();
        await refresh();
      } else {
        // Conserve le formulaire et affiche le vrai message renvoyé par l'API.
        const err = await res.json().catch(() => ({}));
        setCreateError(
          err.error || `Erreur lors de la création (code ${res.status})`
        );
      }
    } catch {
      setCreateError("Erreur réseau : la requête n'a pas pu aboutir");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (type: VehicleTypeData) => {
    setEditingId(type.id);
    setEditForm({
      label: type.label,
      gabarit: type.gabarit,
      code: type.code,
      tonnageMini: String(type.tonnageMini),
      tonnageMoyen: String(type.tonnageMoyen),
      tonnageMaxi: String(type.tonnageMaxi),
      co2Coefficient: String(type.co2Coefficient),
      pdfCode: type.pdfCode,
      color: type.color,
      showTrailerPlate: type.showTrailerPlate,
      rxPalmBeachAtCanto: type.rxPalmBeachAtCanto,
      rxZoneCanto: type.rxZoneCanto ?? "",
      rxZoneVieuxPort: type.rxZoneVieuxPort ?? "",
      sortOrder: String(type.sortOrder),
    });
    setEditTranslations({ ...(type.displayLabels ?? {}) });
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditTranslations({});
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const gabarit = String(editForm.gabarit ?? "").trim();
    if (!gabarit) {
      setEditError("L'appellation (gabarit) est requise");
      return;
    }
    const nums = validateNumericFields(editForm);
    if (!nums.ok) {
      setEditError(nums.error);
      return;
    }

    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/vehicle-types/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gabarit,
          label: gabarit,
          code: String(editForm.code).trim(),
          tonnageMini: nums.values.tonnageMini,
          tonnageMoyen: nums.values.tonnageMoyen,
          tonnageMaxi: nums.values.tonnageMaxi,
          co2Coefficient: nums.values.co2Coefficient,
          pdfCode: String(editForm.pdfCode),
          color: String(editForm.color),
          showTrailerPlate: Boolean(editForm.showTrailerPlate),
          rxPalmBeachAtCanto: Boolean(editForm.rxPalmBeachAtCanto),
          rxZoneCanto: editForm.rxZoneCanto ? String(editForm.rxZoneCanto) : null,
          rxZoneVieuxPort: editForm.rxZoneVieuxPort
            ? String(editForm.rxZoneVieuxPort)
            : null,
          displayLabels: buildDisplayLabels(editTranslations),
          sortOrder: nums.values.sortOrder,
        }),
      });
      if (res.ok) {
        cancelEdit();
        invalidateVehicleTypeCache();
        await refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setEditError(
          err.error || `Erreur lors de la sauvegarde (code ${res.status})`
        );
      }
    } catch {
      setEditError("Erreur réseau : la requête n'a pas pu aboutir");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    try {
      const res = await fetch(`/api/vehicle-types/${id}`, { method: "DELETE" });
      if (res.ok) {
        invalidateVehicleTypeCache();
        await refresh();
      }
    } catch {
      alert("Erreur réseau");
    }
  };

  const handleReactivate = async (id: number) => {
    try {
      const res = await fetch(`/api/vehicle-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (res.ok) {
        invalidateVehicleTypeCache();
        await refresh();
      }
    } catch {
      alert("Erreur réseau");
    }
  };

  // Réordonnancement par flèches : échange le type avec son voisin puis
  // renumérote 0..n et persiste les positions modifiées. L'ordre s'applique
  // au formulaire public (cache invalidé + revalidation « live »).
  const moveType = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (reordering || target < 0 || target >= activeTypes.length) return;

    const reordered = [...activeTypes];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setReordering(true);
    try {
      const requests = reordered
        .map((t, i) => ({ t, i }))
        .filter(({ t, i }) => (t.sortOrder ?? 0) !== i)
        .map(({ t, i }) =>
          fetch(`/api/vehicle-types/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: i }),
          })
        );
      await Promise.all(requests);
      invalidateVehicleTypeCache();
      await refresh();
    } catch {
      alert("Erreur réseau lors du réordonnancement");
    } finally {
      setReordering(false);
    }
  };

  const renderTranslations = (
    gabaritFallback: string,
    translations: TranslationFields,
    setTranslations: (next: TranslationFields) => void
  ) => {
    const fallback = gabaritFallback.trim() || "—";
    const filledCount = LANGUAGES.filter((l) => translations[l.code]?.trim()).length;
    const missingCount = LANGUAGES.length - filledCount;
    return (
      <details className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-gray-600 select-none flex items-center gap-2">
          <Languages size={14} className="shrink-0 text-gray-400" />
          Traductions du libellé affiché
          {missingCount > 0 ? (
            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              {missingCount} manquante{missingCount > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
              Complet
            </span>
          )}
        </summary>
        <p className="text-[10px] text-gray-400 mt-2">
          Libellé affiché aux exposants dans leur langue (formulaire, récap, PDF,
          e-mail). Laissez vide pour utiliser le repli automatique :{" "}
          <span className="font-medium text-gray-500">« {fallback} »</span>.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 mt-3">
          {LANGUAGES.map((l) => (
            <div key={l.code}>
              <label className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                <span aria-hidden>{l.flag}</span>
                {l.label}
              </label>
              <input
                type="text"
                value={translations[l.code] ?? ""}
                onChange={(e) =>
                  setTranslations({ ...translations, [l.code]: e.target.value })
                }
                placeholder={fallback}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          ))}
        </div>
      </details>
    );
  };

  const renderFormFields = (
    form: typeof createForm | Record<string, string | boolean>,
    setForm: (patch: Record<string, string | boolean>) => void,
    isEditing = false,
    translations: TranslationFields = {},
    setTranslations: (next: TranslationFields) => void = () => {}
  ) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-gray-500 uppercase">
          Appellation (gabarit)
        </label>
        <input
          type="text"
          value={String(form.gabarit ?? "")}
          onChange={(e) => setForm({ gabarit: e.target.value })}
          placeholder="10 m³, VL, ~90 m³ Semi-remorque…"
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          Texte affiché dans les formulaires, listes et exports.
        </p>
      </div>
      {isEditing && (
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">
            Identifiant technique
          </label>
          <input
            type="text"
            value={String(form.code ?? "")}
            onChange={(e) => setForm({ code: e.target.value })}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Clé stable en base (véhicules existants). Modifiable uniquement si aucun
            véhicule ne l&apos;utilise encore.
          </p>
        </div>
      )}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase">Tonnage mini (T)</label>
        <input
          type="text"
          inputMode="decimal"
          value={String(form.tonnageMini ?? "")}
          onChange={(e) => setForm({ tonnageMini: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase">Tonnage moyen (T)</label>
        <input
          type="text"
          inputMode="decimal"
          value={String(form.tonnageMoyen ?? "")}
          onChange={(e) => setForm({ tonnageMoyen: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase">Tonnage maxi (T)</label>
        <input
          type="text"
          inputMode="decimal"
          value={String(form.tonnageMaxi ?? "")}
          onChange={(e) => setForm({ tonnageMaxi: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase">CO₂ (kg/km)</label>
        <input
          type="text"
          inputMode="decimal"
          value={String(form.co2Coefficient ?? "")}
          onChange={(e) => setForm({ co2Coefficient: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase">Code PDF</label>
        <select
          value={String(form.pdfCode ?? "C")}
          onChange={(e) => setForm({ pdfCode: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {["A", "B", "C", "D"].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Couleur</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setForm({ color: c.value })}
              className={`w-7 h-7 rounded-full border-2 ${
                form.color === c.value ? "border-gray-900 scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.label}
            />
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(form.showTrailerPlate)}
            onChange={(e) => setForm({ showTrailerPlate: e.target.checked })}
          />
          Plaque de remorque requise
        </label>
      </div>
      {renderTranslations(
        String(form.gabarit ?? ""),
        translations,
        setTranslations
      )}
      {espace === "rx" && (
        <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
          <div className="sm:col-span-2 flex items-center gap-1.5 text-xs font-semibold text-blue-900">
            <MapPin size={14} className="shrink-0" />
            Aire de rétention par port (RX)
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Exposant au Port Canto →
            </label>
            <select
              value={String(form.rxZoneCanto ?? "")}
              onChange={(e) => setForm({ rxZoneCanto: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">Repli automatique</option>
              {zones.map((z) => (
                <option key={z.zone} value={z.zone}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">
              Exposant au Vieux Port →
            </label>
            <select
              value={String(form.rxZoneVieuxPort ?? "")}
              onChange={(e) => setForm({ rxZoneVieuxPort: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">Repli automatique</option>
              {zones.map((z) => (
                <option key={z.zone} value={z.zone}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
          <p className="sm:col-span-2 text-[10px] text-gray-400">
            Zone de déchargement vers laquelle ce gabarit est dirigé selon le
            port de l&apos;exposant. « Repli automatique » conserve l&apos;ancienne
            règle (case Palm Beach au Port Canto). Pour ajouter une aire de
            rétention, créez-la d&apos;abord dans <strong>Zones</strong> : elle
            apparaîtra ici. Sans impact sur le flux Palais.
          </p>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 py-8">
        <Loader2 className="animate-spin" size={18} />
        <span className="text-sm">Chargement des types de véhicule...</span>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-orange-500 rounded-full" />
          <h2 className="text-base font-bold text-gray-800">Types de véhicule</h2>
          <span className="text-xs text-gray-400 font-medium ml-1">
            {activeTypes.length} actif{activeTypes.length > 1 ? "s" : ""}
          </span>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            {activeTypes.length === 0 && (
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                {seeding ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Réinitialiser
              </button>
            )}
            <button
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setCreateError("");
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#4F587E] text-white rounded-lg text-xs font-semibold hover:bg-[#3B4252]"
            >
              <PlusCircle size={14} />
              Nouveau type
            </button>
          </div>
        )}
      </div>

      {espace === "rx" && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
          <div className="flex items-center gap-2 font-semibold">
            <MapPin size={16} className="shrink-0" />
            Affectation automatique des aires de rétention
          </div>
          <p className="mt-2 text-blue-800/90 leading-relaxed">
            À la demande d&apos;accréditation, chaque véhicule se voit suggérer
            une aire de rétention selon son <strong>gabarit</strong> et le
            <strong> port de l&apos;exposant</strong> (Port Canto ou Vieux Port,
            déduit automatiquement du secteur). Vous définissez vous-même cette
            table de routage, gabarit par gabarit.
          </p>
          <p className="mt-2 text-blue-800/90 leading-relaxed">
            <strong>Pour configurer :</strong> via « Nouveau type » ou
            l&apos;édition d&apos;un type, renseignez les deux menus
            <em> « Exposant au Port Canto → »</em> et
            <em> « Exposant au Vieux Port → »</em> avec la zone de déchargement
            cible. Exemple : un VL au Port Canto → <strong>Palm Beach</strong> ;
            un semi-remorque → <strong>La Bocca</strong>. « Repli automatique »
            conserve l&apos;ancienne règle.
          </p>
          <p className="mt-2 text-blue-800/90 leading-relaxed">
            <strong>Ajouter une aire de rétention :</strong> créez-la dans la page
            <strong> Zones</strong> (ex. « Port Canto » comme destination finale).
            Elle apparaîtra aussitôt dans les menus ci-dessus. La suggestion reste
            modifiable manuellement à la validation back-office.
          </p>
        </div>
      )}

      {showCreateForm && canWrite && (
        <div className="mb-6 bg-white rounded-2xl border-2 border-dashed border-orange-300/40 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Ajouter un type de véhicule</h3>
          {renderFormFields(
            createForm,
            (patch) => setCreateForm((prev) => ({ ...prev, ...patch })),
            false,
            createTranslations,
            setCreateTranslations
          )}
          {createError && <p className="text-red-500 text-xs mt-2">{createError}</p>}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#4F587E] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Créer
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setCreateForm(EMPTY_FORM);
                setCreateError("");
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {canWrite && activeTypes.length > 1 && (
        <p className="mb-4 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <ChevronUp size={13} className="text-orange-500" />
          <ChevronDown size={13} className="-ml-1.5 text-orange-500" />
          Utilisez les flèches pour ordonner la liste. L&apos;ordre s&apos;applique
          automatiquement au formulaire d&apos;accréditation (mise à jour en direct).
        </p>
      )}

      {activeTypes.length > 0 ? (
        <div className="grid gap-3">
          {activeTypes.map((type, index) => {
            const colors = getColorClasses(type.color);
            const isEditing = editingId === type.id;

            return (
              <div
                key={type.id}
                className={`bg-white rounded-xl border shadow-sm transition-all ${
                  isEditing ? "border-[#4F587E] ring-2 ring-[#4F587E]/20" : "border-gray-200"
                }`}
              >
                <div className="p-4">
                  {isEditing ? (
                    <>
                      {renderFormFields(
                        editForm,
                        (patch) => setEditForm((prev) => ({ ...prev, ...patch })),
                        true,
                        editTranslations,
                        setEditTranslations
                      )}
                      {editError && <p className="text-red-500 text-xs mt-2">{editError}</p>}
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#4F587E] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Enregistrer
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold"
                        >
                          Annuler
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      {canWrite && (
                        <div className="flex flex-col -my-1 pt-0.5 shrink-0">
                          <button
                            onClick={() => moveType(index, -1)}
                            disabled={index === 0 || reordering}
                            className="p-0.5 rounded text-gray-300 hover:text-orange-500 hover:bg-gray-100 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300"
                            title="Monter"
                            aria-label="Monter"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            onClick={() => moveType(index, 1)}
                            disabled={index === activeTypes.length - 1 || reordering}
                            className="p-0.5 rounded text-gray-300 hover:text-orange-500 hover:bg-gray-100 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300"
                            title="Descendre"
                            aria-label="Descendre"
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                            {type.gabarit}
                          </span>
                          {type.rxPalmBeachAtCanto && (
                            <span className="text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                              Palm Beach Canto
                            </span>
                          )}
                          {countMissingTranslations(type) > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
                              title="Gabarit custom : des langues utilisent le repli automatique faute de traduction."
                            >
                              <Languages size={11} className="shrink-0" />
                              {countMissingTranslations(type)} trad. manquante
                              {countMissingTranslations(type) > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {type.tonnageMini}–{type.tonnageMaxi} t · CO₂ {type.co2Coefficient} · PDF {type.pdfCode}
                          {type.showTrailerPlate ? " · Remorque" : ""}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{type.code}</p>
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEdit(type)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#4F587E] hover:bg-gray-100"
                            title="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeactivate(type.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                            title="Désactiver"
                          >
                            <PowerOff size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-10 bg-white rounded-xl border border-gray-200">
          <p className="text-sm font-semibold text-gray-500">Aucun type de véhicule configuré</p>
          {canWrite && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-[#4F587E] text-white rounded-lg text-sm font-semibold"
            >
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Initialiser les types par défaut
            </button>
          )}
        </div>
      )}

      {canWrite && inactiveTypes.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Types de véhicule désactivés
          </h3>
          <div className="grid gap-3">
            {inactiveTypes.map((type) => (
              <div key={type.id} className="bg-gray-100 rounded-xl p-4 border border-gray-200 opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-600">{type.label}</span>
                    <span className="text-xs text-gray-400 ml-2">{type.gabarit}</span>
                  </div>
                  <button
                    onClick={() => handleReactivate(type.id)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg"
                  >
                    <Power size={12} />
                    Réactiver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
