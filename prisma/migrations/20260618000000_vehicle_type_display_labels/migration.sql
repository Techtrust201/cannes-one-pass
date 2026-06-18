-- Traductions d'affichage configurables par l'admin pour les gabarits véhicules.
-- JSON indexé par code langue (ex. { "en": "Refrigerated truck 12T" }). Permet de
-- traduire les gabarits créés/modifiés en back-office, que l'i18n standard codée
-- en dur (codes connus) ne peut pas couvrir. Null = repli i18n standard / label BDD.
ALTER TABLE "VehicleTypeConfig" ADD COLUMN IF NOT EXISTS "displayLabels" JSONB;
