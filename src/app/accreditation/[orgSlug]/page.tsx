import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { AccreditationWizard } from "@/components/accreditation/AccreditationWizard";
import { getTemplate } from "@/templates/accreditation/registry";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Formulaire public d'accréditation, scopé par organisation.
 *
 * - `/accreditation/palais` → template Palais (wizard 4 steps historique).
 * - `/accreditation/rx`     → template RX (même tram UI, champs RX-spécifiques).
 *
 * Une org dont le slug est inconnu ou inactif renvoie 404 — empêche
 * l'énumération discrète d'organisations via URL.
 */
export default async function AccreditationByOrgPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const slug = orgSlug.toLowerCase();

  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, isActive: true, formTemplate: true },
  });

  if (!organization || !organization.isActive) {
    notFound();
  }

  const template = getTemplate(organization.formTemplate);

  return (
    <AccreditationWizard
      template={template}
      organizationId={organization.id}
      storageKey={`acc_formData:${slug}`}
    />
  );
}
