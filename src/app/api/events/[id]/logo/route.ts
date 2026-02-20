import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-helpers";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

function handleAuthError(error: unknown) {
  if (error instanceof Response)
    return new Response(error.body, {
      status: error.status,
      statusText: error.statusText,
    });
  return new Response("Non autorisé", { status: 401 });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  const event = await prisma.event.findUnique({
    where: { id },
    select: { logoData: true, logoMimeType: true, updatedAt: true },
  });

  if (!event?.logoData) {
    return new Response(null, { status: 404 });
  }

  const etag = `"logo-${id}-${event.updatedAt.getTime()}"`;

  return new Response(Buffer.from(event.logoData), {
    headers: {
      "Content-Type": event.logoMimeType || "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      ETag: etag,
    },
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await requirePermission(req, "GESTION_DATES", "write");
  } catch (error) {
    return handleAuthError(error);
  }

  const { id } = await ctx.params;

  const existing = await prisma.event.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return Response.json({ error: "Événement introuvable" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return Response.json({ error: "Fichier requis" }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json(
      { error: "Type non supporté. Formats acceptés : PNG, JPEG, WebP, SVG" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: "Fichier trop volumineux (max 2 Mo)" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  await prisma.event.update({
    where: { id },
    data: {
      logoData: buffer,
      logoMimeType: file.type,
      logo: `/api/events/${id}/logo`,
    },
  });

  return Response.json({ url: `/api/events/${id}/logo` });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requirePermission(req, "GESTION_DATES", "write");
  } catch (error) {
    return handleAuthError(error);
  }

  const { id } = await ctx.params;

  await prisma.event.update({
    where: { id },
    data: { logoData: null, logoMimeType: null, logo: null },
  });

  return new Response(null, { status: 204 });
}
