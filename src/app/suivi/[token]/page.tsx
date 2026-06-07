import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

const STATUS_INFO: Record<
  string,
  { label: string; help: string; tone: string }
> = {
  NOUVEAU: {
    label: "En attente de validation",
    help: "Votre demande a bien été reçue. Elle sera étudiée par l'équipe logistique. Ce document ne permet pas l'accès au site.",
    tone: "bg-amber-50 border-amber-200 text-amber-800",
  },
  ATTENTE: {
    label: "Validée — véhicule attendu",
    help: "Votre demande a été validée. L'accréditation officielle fait foi pour l'accès.",
    tone: "bg-green-50 border-green-200 text-green-800",
  },
  ENTREE: {
    label: "Entrée enregistrée",
    help: "Le véhicule est entré sur le site.",
    tone: "bg-green-50 border-green-200 text-green-800",
  },
  SORTIE: {
    label: "Sortie enregistrée",
    help: "Le véhicule est sorti du site.",
    tone: "bg-gray-50 border-gray-200 text-gray-700",
  },
  REFUS: {
    label: "Demande refusée",
    help: "Votre demande a été refusée. Contactez l'équipe logistique pour plus d'informations.",
    tone: "bg-red-50 border-red-200 text-red-800",
  },
  ABSENT: {
    label: "Absent",
    help: "Le véhicule n'a pas été présenté.",
    tone: "bg-gray-50 border-gray-200 text-gray-700",
  },
};

/**
 * Page publique de SUIVI d'une demande d'accréditation, ciblée par le QR du
 * PDF « demande ». Recherche par `publicToken` uniquement (jamais par `id`),
 * et n'affiche que le **statut** et un minimum d'informations — aucune action,
 * pas de PII détaillée. 404 si le jeton est inconnu.
 */
export default async function SuiviPage({ params }: PageProps) {
  const { token } = await params;
  if (!token) notFound();

  const acc = await prisma.accreditation.findUnique({
    where: { publicToken: token },
    select: {
      status: true,
      event: true,
      createdAt: true,
      eventRef: { select: { name: true } },
    },
  });
  if (!acc) notFound();

  const info = STATUS_INFO[acc.status] ?? {
    label: acc.status,
    help: "",
    tone: "bg-gray-50 border-gray-200 text-gray-700",
  };
  const eventName = acc.eventRef?.name ?? acc.event;

  return (
    <div
      className="min-h-screen flex flex-col items-center text-gray-900"
      style={{ background: "linear-gradient(#353c52 0 40%, #ffffff 0 100%)" }}
    >
      <main className="flex-1 flex flex-col items-center px-4 py-12 w-full">
        <h1 className="text-3xl font-bold text-white mb-1">Suivi de la demande</h1>
        <p className="text-white/70 text-sm mb-8">{eventName}</p>

        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-11/12 max-w-md text-center space-y-4">
          <div className={`rounded-xl border px-4 py-4 ${info.tone}`}>
            <p className="text-xs uppercase tracking-wide opacity-70">Statut</p>
            <p className="text-lg font-bold">{info.label}</p>
          </div>
          {info.help && <p className="text-sm text-gray-600">{info.help}</p>}
          <p className="text-xs text-gray-400">
            Demande déposée le{" "}
            {new Date(acc.createdAt).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </main>
    </div>
  );
}
