import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  getAvailableEspacesForUser,
} from "@/lib/auth-helpers";
import {
  pickPreferredEspaceSlug,
  resolveDefaultEspaceSlugForUser,
} from "@/lib/default-espace";
import { getBaseUrl } from "@/lib/base-url";
import QrPrintCard from "@/components/admin/QrPrintCard";

export const metadata = {
  title: "QR Accréditation",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/admin/qr` — Affiche le QR code d'accréditation pour l'organisation active.
 *
 * Sélection de l'organisation :
 *   1. `?espace=<slug>` si présent dans l'URL (et accessible à l'utilisateur)
 *   2. Sinon : organisation par défaut résolue depuis `UserOrganization` du user
 *   3. Sinon : fallback `pickPreferredEspaceSlug` (Palais en priorité)
 *
 * Le QR encode l'URL publique `/accreditation/<slug>` à imprimer pour la guérite.
 */
export default async function AdminQrPage({ searchParams }: PageProps) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin/qr");
  }

  const sp = await searchParams;
  const rawEspace = sp.espace;
  const requestedSlug =
    typeof rawEspace === "string"
      ? rawEspace.trim().toLowerCase() || null
      : null;

  const availableEspaces = await getAvailableEspacesForUser(session.user.id);
  if (availableEspaces.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            QR code pour la guérite
          </h1>
          <p className="text-sm text-gray-600">
            Vous n&apos;êtes membre d&apos;aucune organisation. Demandez à un
            super-administrateur de vous rattacher à un Espace pour générer
            un QR.
          </p>
        </div>
      </div>
    );
  }

  // Si l'utilisateur a demandé un espace : on vérifie qu'il y a accès.
  // Sinon, on prend son default (priorité Palais).
  let activeSlug: string | null = null;
  if (requestedSlug) {
    const found = availableEspaces.find((o) => o.slug === requestedSlug);
    if (found) activeSlug = found.slug;
  }
  if (!activeSlug) {
    activeSlug =
      (await resolveDefaultEspaceSlugForUser(
        session.user.id,
        availableEspaces
      )) ?? pickPreferredEspaceSlug(availableEspaces);
  }
  if (!activeSlug) {
    redirect("/logisticien");
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: activeSlug },
    select: { name: true, color: true, isActive: true },
  });
  if (!organization || !organization.isActive) {
    redirect("/admin/qr");
  }

  const host = headersList.get("host") ?? "";
  const proto = host.includes("localhost")
    ? "http"
    : (headersList.get("x-forwarded-proto") ?? "https");
  const baseUrl = host ? `${proto}://${host}` : getBaseUrl();
  const accreditationUrl = `${baseUrl}/accreditation/${activeSlug}`;

  const qrDataUrl = await QRCode.toDataURL(accreditationUrl, {
    type: "image/png",
    margin: 2,
    width: 400,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-bold text-gray-900">
          QR code pour la guérite
        </h1>
        <p className="text-gray-600 mt-1">
          Personnalisez le texte, imprimez l&apos;affiche et affichez-la à
          l&apos;entrée pour que les chauffeurs puissent s&apos;enregistrer.
          Le QR pointe vers le formulaire de{" "}
          <span className="font-semibold">{organization.name}</span>.
        </p>
      </div>

      {availableEspaces.length > 1 && (
        <div className="mb-6 print:hidden">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Choisir l&apos;organisation
          </p>
          <div className="flex flex-wrap gap-2">
            {availableEspaces.map((o) => {
              const isActive = o.slug === activeSlug;
              return (
                <a
                  key={o.id}
                  href={`/admin/qr?espace=${encodeURIComponent(o.slug)}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition ${
                    isActive
                      ? "bg-[#3F4660] text-white border-[#3F4660]"
                      : "bg-white text-gray-700 border-gray-200 hover:border-[#3F4660]"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: o.color ?? "#4F587E" }}
                    aria-hidden
                  />
                  {o.name}
                </a>
              );
            })}
          </div>
        </div>
      )}

      <QrPrintCard
        qrDataUrl={qrDataUrl}
        accreditationUrl={accreditationUrl}
        organizationName={organization.name}
        organizationColor={organization.color ?? undefined}
      />
    </div>
  );
}
