import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forcer l'injection des env vars au build time (contournement Vercel)
  env: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  },
  serverExternalPackages: [
    "pg",
    "pg-pool",
    "@prisma/adapter-pg",
    "@prisma/client",
    "better-auth",
    "kysely",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "static.wikia.nocookie.net",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
