#!/bin/bash
# Import toutes les tables CSV dans Supabase
SUPA_URL="postgresql://postgres.avbioovvnoepogtawtzp:sI51yfH2aFeJzsX4@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
IN="/tmp/neon_export"

# Ordre respectant les foreign keys
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

# Tables avec des sequences auto-increment
SERIAL_TABLES=("ZoneConfig" "Vehicle" "ZoneMovement" "AccreditationEmailHistory" "AccreditationHistory" "VehicleTimeSlot" "ChatMessage")

echo "🔓 Désactivation des contraintes FK..."
psql "$SUPA_URL" -c "SET session_replication_role = 'replica';" 2>&1

for t in "${TABLES[@]}"; do
  FILE="$IN/$t.csv"
  if [ ! -f "$FILE" ]; then
    echo "⏭️  $t — fichier non trouvé"
    continue
  fi

  LINES=$(wc -l < "$FILE")
  ROWS=$((LINES - 1))

  if [ "$ROWS" -le 0 ]; then
    echo "⏭️  $t — vide"
    continue
  fi

  echo -n "📥 $t ($ROWS rows)..."
  psql "$SUPA_URL" -c "\\COPY \"$t\" FROM '$FILE' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')" 2>&1
done

echo ""
echo "🔄 Synchronisation des séquences auto-increment..."
for t in "${SERIAL_TABLES[@]}"; do
  psql "$SUPA_URL" -c "SELECT setval(pg_get_serial_sequence('\"$t\"', 'id'), COALESCE((SELECT MAX(id) FROM \"$t\"), 0) + 1, false);" 2>/dev/null
done

echo "🔒 Réactivation des contraintes FK..."
psql "$SUPA_URL" -c "SET session_replication_role = 'origin';" 2>&1

echo ""
echo "🎉 Import terminé !"
