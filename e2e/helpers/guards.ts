/** Garde-fous E2E : refuse toute écriture si la config est absente ou dangereuse. */

const PRODUCTION_URL_MARKERS = [
  "ep-ancient-bread",
  "neon.tech/cy",
  "cannes-one-pass-production",
];

export function getE2eRunId(): string {
  return process.env.E2E_RUN_ID?.trim() || `E2E-${Date.now()}`;
}

export function isE2eWritesAllowed(): boolean {
  return process.env.E2E_ALLOW_WRITES === "true";
}

export function assertE2eDatabaseSafe(): void {
  const e2eUrl = process.env.E2E_DATABASE_URL?.trim();
  const prodUrl = process.env.DATABASE_URL?.trim();

  if (!e2eUrl) {
    throw new Error("E2E_DATABASE_URL manquant — tests mutatifs refusés.");
  }

  if (prodUrl && e2eUrl === prodUrl) {
    throw new Error("E2E_DATABASE_URL identique à DATABASE_URL — refusé.");
  }

  const lower = e2eUrl.toLowerCase();
  if (PRODUCTION_URL_MARKERS.some((marker) => lower.includes(marker))) {
    throw new Error("E2E_DATABASE_URL ressemble à la production — refusé.");
  }
}

export function requireE2eWrites(test: { skip: (condition: boolean, reason: string) => void }): string {
  if (!isE2eWritesAllowed()) {
    test.skip(true, "E2E_ALLOW_WRITES=true requis pour ce test mutatif.");
  }
  assertE2eDatabaseSafe();
  return getE2eRunId();
}

export function hasE2eCredentials(): boolean {
  return Boolean(process.env.E2E_USER_EMAIL?.trim() && process.env.E2E_USER_PASSWORD?.trim());
}
