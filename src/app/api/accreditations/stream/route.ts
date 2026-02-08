import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Server-Sent Events endpoint for real-time accreditation updates.
 * Polls database every 3 seconds and sends changes to connected clients.
 * Filter by zone with ?zone=LA_BOCCA etc.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filterZone = searchParams.get("zone");

  const encoder = new TextEncoder();
  let lastCheck = new Date();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`)
      );

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        try {
          // Get recent history entries since last check
          const recentHistory = await prisma.accreditationHistory.findMany({
            where: {
              createdAt: { gt: lastCheck },
            },
            orderBy: { createdAt: "asc" },
            include: {
              accreditation: {
                select: {
                  id: true,
                  status: true,
                  currentZone: true,
                  company: true,
                },
              },
            },
          });

          lastCheck = new Date();

          for (const entry of recentHistory) {
            // Filter by zone if specified
            if (filterZone && entry.accreditation.currentZone !== filterZone) {
              continue;
            }

            const event = {
              type: entry.action === "ZONE_TRANSFER" ? "zone_transfer" :
                    entry.action === "ZONE_CHANGED" ? "zone_change" :
                    entry.action === "STATUS_CHANGED" ? "status_change" :
                    entry.action === "CREATED" ? "created" : "update",
              accreditationId: entry.accreditationId,
              data: {
                action: entry.action,
                field: entry.field,
                oldValue: entry.oldValue,
                newValue: entry.newValue,
                description: entry.description,
                zone: entry.accreditation.currentZone,
                company: entry.accreditation.company,
                status: entry.accreditation.status,
              },
              timestamp: entry.createdAt.toISOString(),
            };

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          }
        } catch (error) {
          console.error("SSE stream error:", error);
        }
      }, 3000);

      // Cleanup on close
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
