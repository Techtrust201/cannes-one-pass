#!/bin/bash
# Export toutes les tables de Neon en CSV
NEON_URL="postgresql://palais_des_festivals_owner:npg_ZrkI5FS9HDay@ep-shy-voice-a2x54gid-pooler.eu-central-1.aws.neon.tech/palais_des_festivals?sslmode=require"
OUT="/tmp/neon_export"

TABLES=(
  "user"
  "session"
  "account"
  "verification"
  "user_permission"
  "Event"
  "ZoneConfig"
  "Accreditation"
  "Vehicle"
  "ZoneMovement"
  "AccreditationEmailHistory"
  "AccreditationHistory"
  "AccreditationHistoryArchive"
  "VehicleTimeSlot"
  "ChatMessage"
)

for t in "${TABLES[@]}"; do
  echo -n "Exporting $t..."
  psql "$NEON_URL" -c "\\COPY \"$t\" TO '$OUT/$t.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')" 2>&1
  COUNT=$(wc -l < "$OUT/$t.csv" 2>/dev/null || echo 0)
  echo " $((COUNT - 1)) rows"
done

echo "Export terminé !"
