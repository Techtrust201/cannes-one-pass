-- Améliorer le suivi carbone
-- Ajouter des champs pour un meilleur bilan carbone

-- Ajouter enum pour les types de véhicules standardisés (si n'existe pas déjà)
DO $$ BEGIN
    CREATE TYPE "VehicleType" AS ENUM ('PETIT', 'MOYEN', 'GRAND', 'TRES_GRAND');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ajouter enum pour les pays/régions (si n'existe pas déjà)
DO $$ BEGIN
    CREATE TYPE "CountryRegion" AS ENUM ('FRANCE', 'ESPAGNE', 'ITALIE', 'ALLEMAGNE', 'BELGIQUE', 'SUISSE', 'ROYAUME_UNI', 'PAYS_BAS', 'PORTUGAL', 'AUTRE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ajouter des colonnes à la table Vehicle (si elles n'existent pas déjà)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Vehicle' AND column_name = 'vehicleType') THEN
        ALTER TABLE "Vehicle" ADD COLUMN "vehicleType" "VehicleType";
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Vehicle' AND column_name = 'country') THEN
        ALTER TABLE "Vehicle" ADD COLUMN "country" "CountryRegion";
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Vehicle' AND column_name = 'estimatedKms') THEN
        ALTER TABLE "Vehicle" ADD COLUMN "estimatedKms" INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Vehicle' AND column_name = 'arrivalDate') THEN
        ALTER TABLE "Vehicle" ADD COLUMN "arrivalDate" TIMESTAMP(3);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Vehicle' AND column_name = 'departureDate') THEN
        ALTER TABLE "Vehicle" ADD COLUMN "departureDate" TIMESTAMP(3);
    END IF;
END $$;

-- Migrer les données existantes
UPDATE "Vehicle" 
SET "vehicleType" = CASE 
  WHEN UPPER("size") LIKE '%PETIT%' OR UPPER("size") LIKE '%SMALL%' THEN 'PETIT'
  WHEN UPPER("size") LIKE '%GRAND%' OR UPPER("size") LIKE '%LARGE%' THEN 'GRAND'  
  WHEN UPPER("size") LIKE '%TRES%' OR UPPER("size") LIKE '%XL%' THEN 'TRES_GRAND'
  ELSE 'MOYEN'
END;

-- Essayer de déduire le pays depuis la ville
UPDATE "Vehicle" 
SET "country" = CASE 
  WHEN UPPER("city") LIKE '%PARIS%' OR UPPER("city") LIKE '%LYON%' OR UPPER("city") LIKE '%MARSEILLE%' OR UPPER("city") LIKE '%TOULOUSE%' OR UPPER("city") LIKE '%NICE%' THEN 'FRANCE'
  WHEN UPPER("city") LIKE '%MADRID%' OR UPPER("city") LIKE '%BARCELONA%' OR UPPER("city") LIKE '%VALENCIA%' THEN 'ESPAGNE'
  WHEN UPPER("city") LIKE '%ROME%' OR UPPER("city") LIKE '%MILAN%' OR UPPER("city") LIKE '%NAPLES%' THEN 'ITALIE'
  WHEN UPPER("city") LIKE '%BERLIN%' OR UPPER("city") LIKE '%MUNICH%' OR UPPER("city") LIKE '%HAMBURG%' THEN 'ALLEMAGNE'
  WHEN UPPER("city") LIKE '%BRUSSELS%' OR UPPER("city") LIKE '%BRUXELLES%' THEN 'BELGIQUE'
  WHEN UPPER("city") LIKE '%ZURICH%' OR UPPER("city") LIKE '%GENEVA%' OR UPPER("city") LIKE '%GENEVE%' THEN 'SUISSE'
  WHEN UPPER("city") LIKE '%LONDON%' OR UPPER("city") LIKE '%LONDRES%' THEN 'ROYAUME_UNI'
  WHEN UPPER("city") LIKE '%AMSTERDAM%' THEN 'PAYS_BAS'
  WHEN UPPER("city") LIKE '%LISBON%' OR UPPER("city") LIKE '%LISBONNE%' OR UPPER("city") LIKE '%PORTO%' THEN 'PORTUGAL'
  ELSE 'FRANCE'
END;

-- Migrer les kms vers estimatedKms
UPDATE "Vehicle" 
SET "estimatedKms" = CASE 
  WHEN "kms" IS NOT NULL AND "kms" != '' THEN 
    CAST(REGEXP_REPLACE("kms", '[^0-9]', '', 'g') AS INTEGER)
  ELSE 
    -- Estimation par défaut selon le pays
    CASE 
      WHEN "country" = 'FRANCE' THEN 500
      WHEN "country" = 'ESPAGNE' THEN 800
      WHEN "country" = 'ITALIE' THEN 700
      WHEN "country" = 'ALLEMAGNE' THEN 900
      WHEN "country" = 'BELGIQUE' THEN 400
      WHEN "country" = 'SUISSE' THEN 600
      WHEN "country" = 'ROYAUME_UNI' THEN 1200
      WHEN "country" = 'PAYS_BAS' THEN 450
      WHEN "country" = 'PORTUGAL' THEN 1100
      ELSE 600
    END
END
WHERE "estimatedKms" = 0;

-- Essayer de parser les dates
UPDATE "Vehicle" 
SET "arrivalDate" = 
  CASE 
    WHEN "date" ~ '^\d{2}/\d{2}/\d{4}$' THEN 
      TO_TIMESTAMP("date", 'DD/MM/YYYY')
    WHEN "date" ~ '^\d{4}-\d{2}-\d{2}$' THEN 
      TO_TIMESTAMP("date", 'YYYY-MM-DD')
    ELSE 
      CURRENT_TIMESTAMP
  END;


