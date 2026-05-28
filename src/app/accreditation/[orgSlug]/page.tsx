import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { AccreditationWizard } from "@/components/accreditation/AccreditationWizard";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Formulaire public d'accréditation, scopé par organisation.
 *
 * - `/accreditation/palais-des-festivals` → template Palais (wizard 4 steps).
 * - `/accreditation/rx`                   → template RX (même tram UI).
 *
 * Une org dont le slug est inconnu ou inactive renvoie 404 — empêche
 * l'énumération discrète d'organisations via URL.
 *
 * IMPORTANT — la page server ne passe que des **strings** au Client
 * Component `AccreditationWizard`. Le template (qui contient des fonctions
 * et un schéma Zod, non-sérialisables) est résolu côté client via
 * `getTemplate(formTemplate)`.
 */
export default async function AccreditationByOrgPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const slug = orgSlug.toLowerCase();

  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, isActive: true, formTemplate: true },
  });

  if (!organization || !organization.isActive) {
    notFound();
  }

  return (
    <AccreditationWizard
      orgSlug={organization.slug}
      formTemplate={organization.formTemplate ?? "palais"}
      organizationId={organization.id}
      storageKey={`acc_formData:${organization.slug}`}
    />
  );
}
