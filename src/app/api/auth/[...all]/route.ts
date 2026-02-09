import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

const handler = toNextJsHandler(auth);

export async function GET(req: NextRequest) {
  try {
    return await handler.GET(req);
  } catch (e) {
    console.error("[Auth] GET error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handler.POST(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Auth] POST error:", msg, e);
    return Response.json(
      { error: "Internal Server Error", detail: msg },
      { status: 500 }
    );
  }
}
