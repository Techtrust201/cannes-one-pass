-- Champs enrichis du formulaire de ticket RX (nullable → rétrocompat Palais).
ALTER TABLE "SupportTicket" ADD COLUMN "company" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "problemType" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "identification" TEXT;
