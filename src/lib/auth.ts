import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  // Fallback hardcodé car les env vars manuelles Vercel ne sont pas injectées
  secret:
    process.env.BETTER_AUTH_SECRET ||
    "Q8EHTzJ37/CKCyMeol4GuKLfZ/LQfq4HXuFSA2qw6SM=",
  baseURL:
    process.env.BETTER_AUTH_URL ||
    "https://cannes-one-pass-r2.vercel.app",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 jours
    updateAge: 60 * 60 * 24, // Mise à jour toutes les 24h
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache cookie 5 minutes
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  trustedOrigins: [
    "https://cannes-one-pass-r2.vercel.app",
    "http://localhost:3000",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ].filter(Boolean),
});

export type Session = typeof auth.$Infer.Session;
