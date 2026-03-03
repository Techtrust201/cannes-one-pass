export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import AccreditationFormCard from "@/components/logisticien/AccreditationFormCard";
import MobileAccreditationEditCard from "@/components/logisticien/MobileAccreditationEditCard";
import prisma from "@/lib/prisma";
import { Accreditation } from "@/types";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  async function queryAccreditation() {
    return prisma.accreditation.findUnique({
      where: { id },
      include: { vehicles: true },
    });
  }

  let acc;
  try {
    acc = await queryAccreditation();
  } catch (err) {
    console.warn("[accreditation-detail] First query failed, retrying in 1s:", err);
    await new Promise((r) => setTimeout(r, 1000));
    acc = await queryAccreditation();
  }
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

  return (
    <div className="max-w-2xl mx-auto p-2 sm:p-8">
      {/* Mobile/tablette */}
      <div className="block sm:hidden">
        <MobileAccreditationEditCard acc={safeAcc as Accreditation} />
      </div>
      {/* Desktop */}
      <div className="hidden sm:block">
        <AccreditationFormCard acc={safeAcc as Accreditation} />
      </div>
    </div>
  );
}
