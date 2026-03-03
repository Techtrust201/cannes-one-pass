-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "UnloadingProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnloadingProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "UnloadingProvider_name_key" ON "UnloadingProvider"("name");

-- Seed initial providers
INSERT INTO "UnloadingProvider" ("id", "name", "isActive", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'Palais', true, NOW(), NOW()),
    (gen_random_uuid()::text, 'SVMM', true, NOW(), NOW()),
    (gen_random_uuid()::text, 'BBO', true, NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;
