/**
 * GET /api/events/[id]/timeslots
 *
 * Endpoint PUBLIC (formulaire d'accréditation exposant).
 *
 * Le segment [id] accepte indifféremment un UUID (id event) ou un slug — cohérent
 * avec le reste de l'API events (qui se résout parfois par slug côté formulaire
 * public).
 *
 * Retourne les fenêtres de dépose et de récupération calculées à partir des
 * dates setup / teardown de l'événement, bornées par accessStartTime /
 * accessEndTime pour la grille journalière.
 *
 * Vision Killian : stand/secteur pilotent les créneaux, mais aucune granularité
 * par secteur cette année (cf. Lot C optionnel). Plan uniforme par event.
 *
 * Réponse :
 * {
 *   dropOff: { earliest: ISO|null, latest: ISO|null, hoursPerDay: ["06:00",...] },
 *   pickUp:  { earliest: ISO|null, latest: ISO|null, hoursPerDay: [...] }
 * }
 *
 * Quand une fenêtre n'est pas configurée, `earliest`/`latest` sont `null` et le
 * client peut retomber sur une liste 00:00–23:30 par pas de 30 min.
 */
import { NextRequest } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";

function parseHhmm(hhmm: string | null | undefined): { h: number; m: number } | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

function buildHoursRange(
  start: { h: number; m: number } | null,
  end: { h: number; m: number } | null
): string[] {
  const startMinutes = start ? start.h * 60 + start.m : 0;
  const endMinutes = end ? end.h * 60 + end.m : 23 * 60 + 30;
  if (endMinutes <= startMinutes) {
    return Array.from({ length: 48 }).map((_, i) => {
      const hh = String(Math.floor(i / 2)).padStart(2, "0");
      const mm = i % 2 === 0 ? "00" : "30";
      return `${hh}:${mm}`;
    });
  }
  const slots: string[] = [];
  for (let t = startMinutes; t <= endMinutes; t += 30) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;

  // id peut être un UUID ou un slug. Tenter les deux.
  const event = await withRetry(() =>
    prisma.event.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
      select: {
        id: true,
        slug: true,
        startDate: true,
        endDate: true,
        setupStartDate: true,
        setupEndDate: true,
        teardownStartDate: true,
        teardownEndDate: true,
        accessStartTime: true,
        accessEndTime: true,
        isArchived: true,
      },
    })
  );

  if (!event || event.isArchived) {
    return new Response(JSON.stringify({ error: "Event not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startTime = parseHhmm(event.accessStartTime);
  const endTime = parseHhmm(event.accessEndTime);
  const hoursPerDay = buildHoursRange(startTime, endTime);

  const dropOffEarliest = event.setupStartDate ?? null;
  const dropOffLatest = event.setupEndDate ?? event.startDate ?? null;

  const pickUpEarliest = event.teardownStartDate ?? event.endDate ?? null;
  const pickUpLatest = event.teardownEndDate ?? null;

  return Response.json({
    dropOff: {
      earliest: dropOffEarliest ? dropOffEarliest.toISOString() : null,
      latest: dropOffLatest ? dropOffLatest.toISOString() : null,
      hoursPerDay,
    },
    pickUp: {
      earliest: pickUpEarliest ? pickUpEarliest.toISOString() : null,
      latest: pickUpLatest ? pickUpLatest.toISOString() : null,
      hoursPerDay,
    },
  });
}
