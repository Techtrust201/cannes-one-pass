#!/bin/bash
SUPA_URL="postgresql://postgres.avbioovvnoepogtawtzp:sI51yfH2aFeJzsX4@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
IN="/tmp/neon_export"

echo "🔓 Désactivation des triggers FK..."
psql "$SUPA_URL" -c "ALTER TABLE \"session\" DISABLE TRIGGER ALL;
ALTER TABLE \"account\" DISABLE TRIGGER ALL;
ALTER TABLE \"user_permission\" DISABLE TRIGGER ALL;
ALTER TABLE \"Accreditation\" DISABLE TRIGGER ALL;
ALTER TABLE \"Vehicle\" DISABLE TRIGGER ALL;
ALTER TABLE \"ZoneMovement\" DISABLE TRIGGER ALL;
ALTER TABLE \"AccreditationEmailHistory\" DISABLE TRIGGER ALL;
ALTER TABLE \"AccreditationHistory\" DISABLE TRIGGER ALL;
ALTER TABLE \"VehicleTimeSlot\" DISABLE TRIGGER ALL;
ALTER TABLE \"ChatMessage\" DISABLE TRIGGER ALL;"

echo ""
echo "📥 Import des données..."

import_table() {
  local TABLE="$1"
  local COLS="$2"
  local FILE="$IN/$TABLE.csv"

  if [ ! -f "$FILE" ]; then echo "  ⏭️  $TABLE — absent"; return; fi
  LINES=$(wc -l < "$FILE")
  ROWS=$((LINES - 1))
  if [ "$ROWS" -le 0 ]; then echo "  ⏭️  $TABLE — vide"; return; fi

  psql "$SUPA_URL" -c "\\COPY \"$TABLE\" ($COLS) FROM '$FILE' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')"
  if [ $? -eq 0 ]; then
    echo "  ✅ $TABLE — $ROWS lignes"
  else
    echo "  ❌ $TABLE — erreur (voir ci-dessus)"
  fi
}

import_table "user" '"id","name","email","emailVerified","image","createdAt","updatedAt","role","isActive"'
import_table "session" '"id","expiresAt","token","createdAt","updatedAt","ipAddress","userAgent","userId"'
import_table "account" '"id","accountId","providerId","userId","accessToken","refreshToken","idToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","password","createdAt","updatedAt"'
import_table "verification" '"id","identifier","value","expiresAt","createdAt","updatedAt"'
import_table "user_permission" '"id","userId","feature","canRead","canWrite","createdAt"'
import_table "Event" '"id","name","slug","logo","description","location","color","startDate","endDate","setupStartDate","setupEndDate","teardownStartDate","teardownEndDate","accessStartTime","accessEndTime","notes","activationDays","isActive","isArchived","createdAt","updatedAt","logoData","logoMimeType"'
import_table "ZoneConfig" '"id","label","address","latitude","longitude","isActive","createdAt","updatedAt","zone","color","isFinalDestination"'
import_table "Accreditation" '"id","createdAt","company","stand","unloading","event","message","consent","status","entryAt","exitAt","email","sentAt","updatedAt","version","isArchived","currentZone","eventId"'
import_table "Vehicle" '"id","plate","size","phoneCode","phoneNumber","date","time","city","unloading","kms","accreditationId","arrivalDate","country","departureDate","estimatedKms","vehicleType","currentWeight","emptyWeight","maxWeight","trailerPlate"'
import_table "ZoneMovement" '"id","accreditationId","action","timestamp","userId","userAgent","fromZone","toZone"'
import_table "AccreditationEmailHistory" '"id","accreditationId","email","sentAt"'
import_table "AccreditationHistory" '"id","accreditationId","action","field","oldValue","newValue","description","userId","userAgent","createdAt"'
import_table "AccreditationHistoryArchive" '"id","accreditationId","action","summary","createdAt","archivedAt"'
import_table "VehicleTimeSlot" '"id","accreditationId","vehicleId","date","stepNumber","entryAt","exitAt","zone"'
import_table "ChatMessage" '"id","accreditationId","userId","userName","message","createdAt"'

echo ""
echo "🔒 Réactivation des triggers..."
psql "$SUPA_URL" -c "ALTER TABLE \"session\" ENABLE TRIGGER ALL;
ALTER TABLE \"account\" ENABLE TRIGGER ALL;
ALTER TABLE \"user_permission\" ENABLE TRIGGER ALL;
ALTER TABLE \"Accreditation\" ENABLE TRIGGER ALL;
ALTER TABLE \"Vehicle\" ENABLE TRIGGER ALL;
ALTER TABLE \"ZoneMovement\" ENABLE TRIGGER ALL;
ALTER TABLE \"AccreditationEmailHistory\" ENABLE TRIGGER ALL;
ALTER TABLE \"AccreditationHistory\" ENABLE TRIGGER ALL;
ALTER TABLE \"VehicleTimeSlot\" ENABLE TRIGGER ALL;
ALTER TABLE \"ChatMessage\" ENABLE TRIGGER ALL;"

echo ""
echo "🔄 Synchronisation des séquences..."
psql "$SUPA_URL" -c "
SELECT setval(pg_get_serial_sequence('\"ZoneConfig\"', 'id'), COALESCE((SELECT MAX(id) FROM \"ZoneConfig\"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('\"Vehicle\"', 'id'), COALESCE((SELECT MAX(id) FROM \"Vehicle\"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('\"ZoneMovement\"', 'id'), COALESCE((SELECT MAX(id) FROM \"ZoneMovement\"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('\"AccreditationEmailHistory\"', 'id'), COALESCE((SELECT MAX(id) FROM \"AccreditationEmailHistory\"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('\"AccreditationHistory\"', 'id'), COALESCE((SELECT MAX(id) FROM \"AccreditationHistory\"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('\"VehicleTimeSlot\"', 'id'), COALESCE((SELECT MAX(id) FROM \"VehicleTimeSlot\"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('\"ChatMessage\"', 'id'), COALESCE((SELECT MAX(id) FROM \"ChatMessage\"), 0) + 1, false);
"

echo ""
echo "✅ Comptages finaux :"
psql "$SUPA_URL" -c '
SELECT 
  (SELECT count(*) FROM "user") as users,
  (SELECT count(*) FROM "account") as accounts,
  (SELECT count(*) FROM "user_permission") as permissions,
  (SELECT count(*) FROM "Event") as events,
  (SELECT count(*) FROM "ZoneConfig") as zones,
  (SELECT count(*) FROM "Accreditation") as accreditations,
  (SELECT count(*) FROM "Vehicle") as vehicles,
  (SELECT count(*) FROM "AccreditationHistory") as history,
  (SELECT count(*) FROM "ZoneMovement") as zone_moves,
  (SELECT count(*) FROM "VehicleTimeSlot") as timeslots;
'

echo "🎉 DONE !"
