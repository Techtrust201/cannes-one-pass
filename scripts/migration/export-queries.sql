-- =============================================================
-- MIGRATION NEON → SUPABASE : Requêtes d'export
-- =============================================================
-- Exécuter CHAQUE requête séparément dans le SQL Editor de Neon
-- (https://console.neon.tech → SQL Editor)
-- Copier le résultat JSON et le sauvegarder dans le fichier indiqué
-- =============================================================

-- =============================================
-- REQUÊTE 1 : users + accounts + permissions
-- Sauvegarder le résultat dans : scripts/migration/data/01-users.json
-- =============================================
SELECT json_build_object(
  'users', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "user" t),
  'accounts', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "account" t),
  'user_permissions', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "user_permission" t),
  'verifications', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "verification" t)
) as export_data;

-- =============================================
-- REQUÊTE 2 : events + zones
-- Sauvegarder le résultat dans : scripts/migration/data/02-config.json
-- =============================================
SELECT json_build_object(
  'events', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "Event" t),
  'zone_configs', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "ZoneConfig" t)
) as export_data;

-- =============================================
-- REQUÊTE 3 : accreditations
-- Sauvegarder le résultat dans : scripts/migration/data/03-accreditations.json
-- =============================================
SELECT json_build_object(
  'accreditations', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "Accreditation" t)
) as export_data;

-- =============================================
-- REQUÊTE 4 : vehicles + time slots
-- Sauvegarder le résultat dans : scripts/migration/data/04-vehicles.json
-- =============================================
SELECT json_build_object(
  'vehicles', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "Vehicle" t),
  'vehicle_time_slots', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "VehicleTimeSlot" t)
) as export_data;

-- =============================================
-- REQUÊTE 5 : historique + chat + zone movements
-- Sauvegarder le résultat dans : scripts/migration/data/05-history.json
-- =============================================
SELECT json_build_object(
  'accreditation_history', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "AccreditationHistory" t),
  'accreditation_email_history', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "AccreditationEmailHistory" t),
  'zone_movements', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "ZoneMovement" t),
  'chat_messages', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "ChatMessage" t),
  'history_archives', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM "AccreditationHistoryArchive" t)
) as export_data;
