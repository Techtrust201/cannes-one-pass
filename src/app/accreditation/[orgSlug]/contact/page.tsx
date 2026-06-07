import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { SupportTicketForm } from "@/components/accreditation/SupportTicketForm";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Formulaire public d'ouverture de ticket pour une organisation.
 *
 * Le ticket atterrit dans `/logisticien/tickets?espace=<slug>` côté
 * back-office, accessible aux membres de l'organisation avec la
 * permission `TICKETS`.
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
    <div
      className="min-h-screen flex flex-col text-gray-900"
      style={{ background: "linear-gradient(#353c52 0 50%, #ffffff 0 100%)" }}
    >
      <main className="mb-24 flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 py-10">
        <div className="px-4 flex flex-col items-center text-white gap-1 w-full max-w-3xl mb-8">
          <h1 className="text-4xl font-bold">Besoin d&apos;aide ?</h1>
          <p className="text-lg opacity-80">Support logistique</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-11/12 max-w-2xl">
          <SupportTicketForm orgSlug={slug} orgName={org.name} />
        </div>

        <div className="mt-6 text-sm">
          <Link href={`/accreditation/${slug}`} className="text-white/80 hover:text-white underline">
            ← Retour au formulaire d&apos;accréditation
          </Link>
        </div>
      </main>
    </div>
  );
}
