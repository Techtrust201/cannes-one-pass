export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { notFound } from "next/navigation";
import AccreditationFormCard from "@/components/logisticien/AccreditationFormCard";
import MobileAccreditationEditCard from "@/components/logisticien/MobileAccreditationEditCard";
import { RxAssignPlatesPanel } from "@/components/logisticien/RxAssignPlatesPanel";
import prisma, { withRetry } from "@/lib/prisma";
import { Accreditation } from "@/types";
import PageHelp from "@/components/logisticien/help/PageHelp";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const acc = await withRetry(() => prisma.accreditation.findUnique({
    where: { id },
    include: {
      vehicles: true,
      organization: { select: { id: true, slug: true, formTemplate: true } },
    },
  }));
  if (!acc) return notFound();

  // Correction : garantir que unloading est toujours un tableau pour chaque véhicule
  const safeAcc = {
    ...acc,
    vehicles: acc.vehicles.map((v) => ({
      ...v,
      unloading: Array.isArray(v.unloading)
        ? v.unloading
        : typeof v.unloading === "string" && v.unloading.startsWith("[")
          ? (() => { try { return JSON.parse(v.unloading as string); } catch { return [v.unloading]; } })()
          : v.unloading
            ? [v.unloading]
            : [],
    })),
  };

  // Le panneau d'affectation des plaques RX n'est affiché que pour les
  // accréditations rattachées à une organisation au template `rx`.
  const showRxPanel = acc.organization?.formTemplate === "rx";
  const rxVehicleRows = showRxPanel
    ? acc.vehicles.map((v) => ({
        id: v.id,
        plate: v.plate,
        vehicleType: v.vehicleType,
        trailerPlate: v.trailerPlate,
        date: v.date,
        time: v.time,
        assignedAt: v.assignedAt ? v.assignedAt.toISOString() : null,
      }))
    : [];

  return (
    <div className="max-w-2xl mx-auto p-2 sm:p-8 min-w-0 overflow-x-hidden">
      <PageHelp storageKey="logisticien-detail">
        <p>
          Fiche d’une demande : vérifiez les infos, changez le statut, renvoyez le QR ou modifiez
          le véhicule.
        </p>
        <p>
          Sur mobile, utilisez les boutons d’action en bas de la carte. Sur RX, le panneau plaques
          permet d’affecter les immatriculations.
        </p>
      </PageHelp>
      {showRxPanel && (
        <RxAssignPlatesPanel
          accreditationStand={acc.stand}
          vehicles={rxVehicleRows}
        />
      )}
      {/* Mobile/tablette */}
      <div className="block sm:hidden">
        <MobileAccreditationEditCard acc={safeAcc as Accreditation} />
      </div>
      {/* Desktop */}
      <div className="hidden sm:block">
        <AccreditationFormCard
          acc={safeAcc as Accreditation}
          orgSlug={acc.organization?.slug ?? null}
        />
      </div>
    </div>
  );
}
