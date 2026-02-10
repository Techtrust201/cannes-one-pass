import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Rate limiting sur les routes POST publiques ───────────────────
  if (request.method === "POST") {
    const rateLimitedPaths = [
      "/api/accreditations",       // Création d'accréditation (formulaire public)
      "/api/auth",                 // Login / signup
    ];

    const needsRateLimit = rateLimitedPaths.some((path) =>
      pathname.startsWith(path)
    );

    if (needsRateLimit) {
      const ip = getClientIp(request.headers);
      const result = rateLimit(`${ip}:${pathname}`, {
        limit: 20,          // 20 requêtes max
        windowSeconds: 60,  // par minute
      });

      if (!result.success) {
        return NextResponse.json(
          { error: "Trop de requêtes. Veuillez réessayer dans quelques instants." },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)),
              "X-RateLimit-Limit": String(result.limit),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(result.reset),
            },
          }
        );
      }
    }
  }

  // ─── Protection des routes pages (authentification) ────────────────
  const protectedPaths = ["/logisticien", "/admin"];
  const isProtected = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Better Auth préfixe les cookies avec __Secure- en HTTPS (production)
  // En HTTP (localhost), pas de préfixe
  const sessionToken =
    request.cookies.get("__Secure-better-auth.session_token")?.value ||
    request.cookies.get("better-auth.session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Pour le contrôle de rôle admin, décoder le cookie session_data
  // (signé par Better Auth, contient les infos utilisateur en JSON)
  if (pathname.startsWith("/admin")) {
    const sessionData =
      request.cookies.get("__Secure-better-auth.session_data")?.value ||
      request.cookies.get("better-auth.session_data")?.value;

    if (sessionData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(sessionData));
        const role = decoded?.user?.role;
        if (role !== "SUPER_ADMIN") {
          return NextResponse.redirect(new URL("/logisticien", request.url));
        }
      } catch {
        // Cookie illisible, laisser passer — la page fera la vérif côté serveur
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/logisticien/:path*",
    "/admin/:path*",
    "/api/accreditations",
    "/api/auth/:path*",
  ],
};
