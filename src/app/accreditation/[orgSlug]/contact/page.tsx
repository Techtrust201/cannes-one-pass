import { Suspense } from "react";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { ContactPageContent } from "@/components/accreditation/ContactPageContent";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Formulaire public d'ouverture de ticket pour une organisation.
 */
export default async function ContactPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const slug = orgSlug.toLowerCase();

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, isActive: true },
  });
  if (!org || !org.isActive) notFound();

  return (
    <Suspense fallback={null}>
      <ContactPageContent orgSlug={slug} />
    </Suspense>
  );
}
