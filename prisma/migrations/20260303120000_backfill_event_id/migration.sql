-- Backfill eventId for existing accreditations based on event slug
UPDATE "Accreditation" a
SET "eventId" = e."id"
FROM "Event" e
WHERE a."event" = e."slug" AND a."eventId" IS NULL;
