-- =========================================================================
-- Catégorisation d'emplacement pour Accreditation
-- Ajoute l'enum EmplacementCategory et deux colonnes nullable sur Accreditation.
-- Ne touche à AUCUNE donnée existante : les lignes actuelles conservent
-- category = NULL et seront enrichies ultérieurement (auto-deduction, saisie,
-- ou import CSV).
-- =========================================================================

CREATE TYPE "EmplacementCategory" AS ENUM (
    'STAND_NU',
    'STAND_CLE_EN_MAIN',
    'BATEAU_TERRE',
    'BATEAU_FLOT',
    'TENTE_STRUCTURE'
);

ALTER TABLE "Accreditation"
    ADD COLUMN "category"       "EmplacementCategory",
    ADD COLUMN "categorySource" "ActorSource";
