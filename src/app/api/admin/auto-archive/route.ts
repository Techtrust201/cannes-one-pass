import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const DAYS_AFTER_END = 90;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron) {
    try {
      await requireRole(req, "SUPER_ADMIN");
    } catch (error) {
      if (error instanceof Response) {
        return new Response(error.body, { status: error.status });
      }
      return new Response("Non autorisé", { status: 401 });
    }
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAYS_AFTER_END);

    const eventsToArchive = await prisma.event.findMany({
      where: {
        isArchived: false,
        endDate: { lt: cutoff },
      },
      select: { id: true, name: true, slug: true, endDate: true },
    });

    let totalAccreditations = 0;

    for (const event of eventsToArchive) {
      await prisma.$transaction([
        prisma.event.update({
          where: { id: event.id },
          data: { isArchived: true },
        }),
        prisma.accreditation.updateMany({
          where: { eventId: event.id },
          data: { isArchived: true },
        }),
      ]);

      const count = await prisma.accreditation.count({
        where: { eventId: event.id, isArchived: true },
      });
      totalAccreditations += count;
    }

    const report = {
      success: true,
      cutoffDate: cutoff.toISOString(),
      daysAfterEnd: DAYS_AFTER_END,
      eventsArchived: eventsToArchive.map((e) => e.name),
      totalEventsArchived: eventsToArchive.length,
      totalAccreditationsArchived: totalAccreditations,
      timestamp: new Date().toISOString(),
    };

    console.log("[auto-archive] Rapport :", report);
    return Response.json(report);
  } catch (error) {
    console.error("[auto-archive] Erreur :", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
