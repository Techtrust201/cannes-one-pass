"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, AlertTriangle, Loader2, Download } from "lucide-react";
import { formInputClass } from "@/lib/form-styles";
import { formatPhoneNumber } from "@/lib/contact-utils";
import { useTranslation } from "@/components/accreditation/TranslationProvider";
import {
  extractCapacityQuotaFullMessage,
  getCapacityQuotaFullMessages,
} from "@/lib/accreditation-save-error";
import { PortalOverlay } from "@/components/ui/PortalOverlay";
import { useUnloadingProviders } from "@/hooks/useUnloadingProviders";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { buildPalmBeachAtCantoCodes } from "@/lib/vehicle-type-defaults";
import { suggestZone, buildRxZoneRouting } from "@/lib/rx-zone-rules";
import { useZones } from "@/hooks/useZones";
import { mapRxPayload } from "../mapPayload";
import { rxPayloadSchema } from "../schema";
import { countRxLogicalVehicles } from "../count-vehicles";
import {
  RX_MANUTENTION_PROVIDERS,
  findCategory,
  resolveEffectiveRxSpace,
  resolveEffectiveRxSector,
} from "../config";
import { getSkipT, getOtherProviderT, getRxFlowT } from "../i18n";
import type { ZodIssue } from "zod";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

const OTHER_PROVIDER = "Autre" as const;

function formatZodIssues(issues: ZodIssue[], fallback: string): string {
  return issues[0]?.message ?? fallback;
}

/**
 * Step 5 RX — Manutention + validation finale.
 *
 * - Notice Scales auto si au moins une catégorie cochée le nécessite.
 * - Sélection d'un prestataire complémentaire (optionnel).
 * - Consentement.
 * - Bouton "Valider l'accréditation" : POST /api/accreditations + overlay
 *   de succès avec ID d'accréditation (pattern homogène avec le Palais).
 */
export function StepManutentionRx({
  data,
  update,
  onValidityChange,
  mode,
  onClearDraft,
  onResetForm,
  orgSlug,
}: StepProps<RxFormData>) {
  const { t, lang } = useTranslation();
  const { stepOne, stepTwo, stepThree } = data;

  // Prestataires de manutention chargés depuis la BDD pour l'organisation
  // courante (scoping multi-tenant). On conserve l'option sentinelle "Aucun"
  // et, en cas de liste vide (BDD indisponible), un repli sur la liste codée.
  const { providers: dbProviders } = useUnloadingProviders(orgSlug);
  const { types: vehicleTypes, getLabel: getVehicleLabel } = useVehicleTypes(
    false,
    orgSlug
  );
  const palmBeachAtCantoCodes = useMemo(
    () => buildPalmBeachAtCantoCodes(vehicleTypes),
    [vehicleTypes]
  );
  // Table de routage configurable (gabarit × port → zone) issue de l'admin.
  const zoneRouting = useMemo(
    () => buildRxZoneRouting(vehicleTypes),
    [vehicleTypes]
  );
  const { getLabel: getZoneLabel } = useZones();

  // Phase 6C-A (F1, correction ciblée) — Espace/secteur effectifs : même
  // priorité que StepDeliveryRx/StepPickupRx (référentiel réel de
  // l'ExhibitorLocation résolue > secteur legacy figé sur l'exposant, repli
  // legacy interdit en STRICT). Avant cette correction, `scalesRequired` et
  // l'aperçu de zones utilisaient encore `stepOne.space`/`exhibitorSector`
  // directement : `selectLocation` (StepExhibitorRx) vide `stepOne.space`
  // dès qu'un emplacement référentiel est résolu, ce qui masquait à tort la
  // notice/l'acquittement Scales alors que `mapPayload` calculait déjà
  // correctement `scalesAssigned` via ces mêmes résolveurs.
  const effectiveSpace = useMemo(
    () =>
      resolveEffectiveRxSpace({
        logisticSpace: stepOne.logisticSpace,
        sectorCode: stepOne.sectorCode,
        exhibitorSector: stepOne.exhibitorSector,
        manualPalaisChoice: stepOne.space,
        planningMode: stepOne.logisticsPlanningMode,
      }),
    [
      stepOne.logisticSpace,
      stepOne.sectorCode,
      stepOne.exhibitorSector,
      stepOne.space,
      stepOne.logisticsPlanningMode,
    ]
  );
  const effectiveSector = useMemo(
    () =>
      resolveEffectiveRxSector({
        portCode: stepOne.portCode,
        sectorCode: stepOne.sectorCode,
        exhibitorSector: stepOne.exhibitorSector,
      }).sector,
    [stepOne.portCode, stepOne.sectorCode, stepOne.exhibitorSector]
  );
  const skipT = getSkipT(t);
  const otherT = getOtherProviderT(t);
  const flowMode = mode === "logisticien" ? "logisticien" : "public";
  const flowT = getRxFlowT(t, flowMode);
  const manutentionOptions = useMemo(() => {
    const base =
      dbProviders.length === 0
        ? RX_MANUTENTION_PROVIDERS.map((p) => ({ id: p.value, value: p.value, label: p.label }))
        : dbProviders.map((p) => ({ id: p.id, value: p.name, label: p.name }));

    const withoutOther = base.filter((p) => p.value !== OTHER_PROVIDER);

    // Option « Autre » toujours disponible (champ libre obligatoire ensuite).
    return [
      ...withoutOther,
      { id: "__other__", value: OTHER_PROVIDER, label: otherT.otherProvider },
    ];
  }, [dbProviders, otherT.otherProvider]);

  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  // Capturé au moment du submit pour rester correct sur l'écran de succès
  // même après purge du brouillon.
  const [scalesAtSubmit, setScalesAtSubmit] = useState(false);
  const [error, setError] = useState("");
  const [eventLoading, setEventLoading] = useState(false);

  const scalesRequired = useMemo(
    () =>
      stepTwo.categories.some(
        (c) => findCategory(effectiveSpace.space ?? "", c.categoryId)?.scales === true
      ),
    [effectiveSpace.space, stepTwo.categories]
  );

  // Si « Autre » prestataire est sélectionné, le champ libre est obligatoire.
  const providerOk =
    stepThree.manutentionProvider !== OTHER_PROVIDER ||
    !!stepThree.manutentionProviderOther?.trim();

  // L'étape est "valide" (bouton Suivant) dès que le consentement est donné ;
  // mais comme c'est la dernière étape, la validation réelle se fait au submit.
  const isValid =
    stepThree.consent &&
    (!scalesRequired || stepThree.scalesAcknowledged) &&
    providerOk;

  const waitingForEvent =
    mode === "logisticien" && !stepOne.event?.trim() && eventLoading;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  // Logisticien : si l'utilisateur arrive directement à l'étape 5 (deep-link)
  // sans passer par le carrousel événement, on pré-sélectionne le 1er event actif.
  useEffect(() => {
    if (mode !== "logisticien" || stepOne.event?.trim()) return;
    let cancelled = false;
    setEventLoading(true);
    fetch(`/api/events?active=true&espace=${encodeURIComponent(orgSlug ?? "rx")}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled || !Array.isArray(data) || data.length === 0) return;
        const slug = data[0]?.slug;
        if (slug) update({ stepOne: { ...stepOne, event: String(slug) } });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEventLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, stepOne.event, orgSlug, update, stepOne]);

  const m = t.rx.manutention;

  function validateBeforeSubmit(): string | null {
    if (!stepOne.event?.trim()) {
      return m.missingEvent ?? "Événement manquant. Retournez à l'étape 1 pour le sélectionner.";
    }
    if (!stepOne.exhibitorId?.trim()) {
      return m.missingExhibitor ?? "Exposant manquant. Retournez à l'étape 1 pour le sélectionner.";
    }
    const vehicleCount = stepTwo.categories.reduce((s, c) => s + c.vehicles.length, 0);
    if (vehicleCount === 0) {
      return (
        m.noVehicles ??
        "Aucun véhicule renseigné. Retournez aux étapes Livraison / Reprise pour compléter le formulaire."
      );
    }
    const status = mode === "logisticien" ? "ATTENTE" : "NOUVEAU";
    const payload = mapRxPayload(data, lang, {
      status,
      split: true,
      palmBeachAtCantoCodes,
      zoneRouting,
    });
    const parsed = rxPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return formatZodIssues(
        parsed.error.issues,
        m.validationFallback ?? "Certaines informations sont incomplètes ou invalides."
      );
    }
    return null;
  }

  function handleValidateClick() {
    setError("");
    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }
    setShowModal(true);
  }

  async function handleConfirm() {
    if (hasSaved) {
      setShowModal(false);
      return;
    }
    setError("");

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      setShowModal(false);
      return;
    }

    try {
      setLoading(true);
      // Public → NOUVEAU (en attente de validation) ; logisticien → ATTENTE (validé).
      const status = mode === "logisticien" ? "ATTENTE" : "NOUVEAU";
      const payload = mapRxPayload(data, lang, {
      status,
      split: true,
      palmBeachAtCantoCodes,
      zoneRouting,
    });
      const vehicleCount = stepTwo.categories.reduce((s, c) => s + c.vehicles.length, 0);

      const res = await fetch("/api/accreditations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const quotaMsg = extractCapacityQuotaFullMessage(
          body,
          getCapacityQuotaFullMessages(t)
        );
        const detailMsg = Array.isArray(body?.details)
          ? body.details[0]?.message
          : undefined;
        throw new Error(quotaMsg || detailMsg || body?.error || "save error");
      }
      const created = await res.json().catch(() => null);
      // L'API split renvoie { count, ids } ; fallback au nombre de véhicules.
      const fallbackCount = vehicleCount || 1;
      setCreatedCount(
        typeof created?.count === "number" ? created.count : fallbackCount
      );
      setCreatedIds(Array.isArray(created?.ids) ? created.ids : []);
      setScalesAtSubmit(scalesRequired);
      setHasSaved(true);
      setShowModal(false);
      onClearDraft?.();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && err.message !== "save error"
          ? err.message
          : t.saveError
      );
      setShowModal(false);
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (createdIds.length === 0) return;
    try {
      setDownloading(true);
      const res = await fetch("/api/accreditation/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: createdIds, mode: flowT.pdfMode }),
      });
      if (!res.ok) throw new Error("pdf error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = flowT.pdfFilename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(t.pdfError);
    } finally {
      setDownloading(false);
    }
  }

  const totalVehicles = countRxLogicalVehicles(
    stepTwo.categories,
    stepTwo.skipDemontage
  );

  // Pré-visualisation des aires de rétention : on regroupe les véhicules par
  // zone estimée (gabarit × port de l'exposant), séparément pour le montage et
  // le démontage. Purement informatif côté formulaire ; la zone réelle est
  // figée à la validation back-office.
  //
  // Bugfix : l'ancien calcul ne regardait que `v.vehicleType` (montage), ce qui
  // faisait disparaître du récap les véhicules de reprise distincts
  // (`repSameAsDelivery === false` → `repVehicleType`). On parcourt désormais
  // les deux phases sans jamais perdre un gabarit.
  const { montageZones, demontageZones } = useMemo(() => {
    type ZoneGroup = { zone: string; items: { label: string; count: number }[] };

    const buildPhase = (phase: "montage" | "demontage"): ZoneGroup[] => {
      // Map zone → (label → compteur), pour grouper proprement et garder le
      // nombre de véhicules par gabarit sans en perdre.
      const groups = new Map<string, Map<string, number>>();
      for (const cat of stepTwo.categories) {
        for (const v of cat.vehicles) {
          const code =
            phase === "montage"
              ? v.vehicleType
              : v.repSameAsDelivery === false
                ? v.repVehicleType
                : v.vehicleType;
          if (!code) continue;
          const zone = suggestZone(
            code,
            effectiveSector,
            palmBeachAtCantoCodes,
            zoneRouting
          );
          if (!zone) continue;
          const label = getVehicleLabel(code);
          const byLabel = groups.get(zone) ?? new Map<string, number>();
          byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
          groups.set(zone, byLabel);
        }
      }
      return Array.from(groups.entries()).map(([zone, byLabel]) => ({
        zone,
        items: Array.from(byLabel.entries()).map(([label, count]) => ({
          label,
          count,
        })),
      }));
    };

    return {
      montageZones: stepTwo.skipMontage ? [] : buildPhase("montage"),
      demontageZones: stepTwo.skipDemontage ? [] : buildPhase("demontage"),
    };
  }, [
    stepTwo.categories,
    stepTwo.skipMontage,
    stepTwo.skipDemontage,
    effectiveSector,
    palmBeachAtCantoCodes,
    zoneRouting,
    getVehicleLabel,
  ]);

  const hasZoneEstimates = montageZones.length > 0 || demontageZones.length > 0;
  // Si une seule phase est concernée, le sous-titrage par phase n'apporte rien.
  const showPhaseLabels = montageZones.length > 0 && demontageZones.length > 0;

  // Écran de succès — wording et PDF distincts : public (demande) vs logisticien (officiel).
  if (hasSaved) {
    return (
      <div className="flex flex-col items-center py-4 md:py-8 w-full">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg px-5 py-7 md:px-8 md:py-8 w-full max-w-xl text-center space-y-5">
          <div className="flex flex-col items-center gap-3">
            <CheckCircle size={56} className="text-green-500" />
            <h2 className="text-2xl font-bold text-gray-900">
              {createdCount > 1
                ? `${createdCount} ${flowT.successTitleMany}`
                : flowT.successTitleOne}
            </h2>
            <p className="text-sm text-gray-600 max-w-md">{flowT.successSubtext}</p>
          </div>

          <div className={flowT.downloadBoxClass}>
            <p className={flowT.downloadNoticeClass}>{flowT.downloadNotice}</p>
            {createdIds.length > 0 && (
              <button
                type="button"
                onClick={downloadPdf}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-white font-semibold text-base shadow hover:bg-primary-dark transition disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Download size={18} />
                )}
                {downloading ? t.rx.manutention.generating : flowT.downloadCta}
              </button>
            )}
          </div>

          {scalesAtSubmit && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-800 text-left">
              <strong>⚠ {t.rx.manutention.scalesReminder}</strong> {t.rx.delivery.scalesContact}{" "}
              <strong>scales.expo@scales.fr</strong>
            </div>
          )}

          {onResetForm && (
            <button
              type="button"
              onClick={() => {
                setHasSaved(false);
                setCreatedIds([]);
                onResetForm();
              }}
              className="w-full px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition"
            >
              {flowT.resetCta}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-4">
      {/* Réactivation du démontage si l'exposant l'avait sauté. */}
      {stepTwo.skipDemontage && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          <span>{skipT.addDemontageBanner}</span>
          <button
            type="button"
            onClick={() =>
              update({ stepTwo: { ...stepTwo, skipDemontage: false } })
            }
            className="text-amber-800 font-semibold underline hover:no-underline"
          >
            + {skipT.addDemontageCta}
          </button>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          {t.rx.manutention.title}
        </h2>
        <p className="text-sm text-gray-500">{t.rx.manutention.subtitle}</p>
      </div>

      {scalesRequired && (
        <div className="bg-orange-50 border border-orange-200 rounded-md p-3 text-sm text-orange-800">
          ⚠ {t.rx.manutention.scalesAutoNotice}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-semibold text-gray-700">
          {t.rx.manutention.complementaryProvider}
        </label>
        <select
          value={stepThree.manutentionProvider}
          onChange={(e) =>
            update({ stepThree: { ...stepThree, manutentionProvider: e.target.value } })
          }
          className={formInputClass(false)}
        >
          <option value="">{t.rx.manutention.chooseProvider}</option>
          {manutentionOptions.map((p) => (
            <option key={p.id} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {stepThree.manutentionProvider === OTHER_PROVIDER && (
          <div className="pt-2">
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              {otherT.otherProviderLabel} <span className="text-red-500">*</span>
            </label>
            <input
              value={stepThree.manutentionProviderOther ?? ""}
              onChange={(e) =>
                update({
                  stepThree: {
                    ...stepThree,
                    manutentionProviderOther: e.target.value,
                  },
                })
              }
              placeholder={otherT.otherProviderPlaceholder}
              className={formInputClass(
                !stepThree.manutentionProviderOther?.trim()
              )}
            />
            {!stepThree.manutentionProviderOther?.trim() && (
              <p className="text-[11px] text-red-500 mt-1">
                {otherT.otherProviderRequired}
              </p>
            )}
          </div>
        )}
      </div>

      {scalesRequired && (
        <label className="flex items-start gap-2 text-sm bg-orange-50 border border-orange-200 rounded-md p-3">
          <input
            type="checkbox"
            checked={stepThree.scalesAcknowledged}
            onChange={(e) =>
              update({ stepThree: { ...stepThree, scalesAcknowledged: e.target.checked } })
            }
            className="mt-1 accent-orange-600"
          />
          <span>
            {t.rx.manutention.scalesAck} (
            <a href="mailto:scales.expo@scales.fr" className="underline">
              scales.expo@scales.fr
            </a>
            ).
          </span>
        </label>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={stepThree.consent}
          onChange={(e) => update({ stepThree: { ...stepThree, consent: e.target.checked } })}
          className="mt-1 accent-primary"
        />
        <span>{t.rx.manutention.consent}</span>
      </label>

      {/* Récap compact */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
        <div>
          <span className="font-semibold">{t.rx.manutention.recapExhibitor}</span> {stepOne.exhibitorName}{" "}
          <span className="text-gray-500">({stepOne.exhibitorStand})</span>
        </div>
        <div>
          <span className="font-semibold">{t.rx.manutention.recapCategories}</span> {stepTwo.categories.length}
          {" · "}
          <span className="font-semibold">{t.rx.manutention.recapVehicles}</span> {totalVehicles}
        </div>
        <div>
          <span className="font-semibold">{t.rx.manutention.recapContact}</span> {stepOne.contact.firstName}{" "}
          {stepOne.contact.lastName} · {stepOne.contact.email}
          {stepOne.contact.phoneNumber?.trim()
            ? ` · ${formatPhoneNumber(
                stepOne.contact.phoneCode,
                stepOne.contact.phoneNumber
              )}`
            : ""}
        </div>
        {hasZoneEstimates && (
          <div className="pt-1 mt-1 border-t border-gray-200 space-y-1.5">
            <span className="font-semibold">{t.rx.manutention.recapZones}</span>
            {([
              { phase: "montage", label: t.rx.manutention.phaseSetup, zones: montageZones },
              { phase: "demontage", label: t.rx.manutention.phaseTeardown, zones: demontageZones },
            ] as const).map(({ phase, label, zones }) =>
              zones.length > 0 ? (
                <div key={phase} className="space-y-0.5">
                  {showPhaseLabels && (
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {label}
                    </div>
                  )}
                  {zones.map(({ zone, items }) => (
                    <div key={zone} className="text-gray-600">
                      <span className="font-medium">{getZoneLabel(zone)}</span>
                      <span className="text-gray-400">
                        {" : "}
                        {items
                          .map((it) => (it.count > 1 ? `${it.label} ×${it.count}` : it.label))
                          .join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-2 rounded text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleValidateClick}
        disabled={!isValid || loading || waitingForEvent}
        className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base shadow transition-all duration-150 bg-primary text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {loading || waitingForEvent ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          "✅"
        )}
        {t.rx.manutention.validate}
      </button>

      {waitingForEvent && (
        <p className="text-gray-400 text-xs text-center">
          {m.loadingEvent ?? "Chargement de l'événement…"}
        </p>
      )}

      {!isValid && (
        <p className="text-gray-400 text-xs text-center">
          {t.rx.manutention.validateHint}
          {scalesRequired ? t.rx.manutention.validateHintScales : ""}
          {t.rx.manutention.validateHintEnd}
        </p>
      )}

      {showModal && (
        <PortalOverlay>
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] px-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-gray-200">
              <h2 className="text-lg font-bold mb-4 text-gray-900 text-center">
                {flowT.confirmTitle}
              </h2>
              <p className="mb-6 text-gray-700 leading-relaxed text-center text-sm">
                {flowT.confirmMsg}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 transition"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow hover:bg-primary-dark transition disabled:opacity-60"
                >
                  {loading
                    ? t.savingProgress
                    : flowT.confirmCta}
                </button>
              </div>
            </div>
          </div>
        </PortalOverlay>
      )}
    </div>
  );
}
