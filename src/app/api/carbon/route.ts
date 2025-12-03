import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

// Types pour les données du bilan carbone
interface CarbonDataEntry {
  id: string;
  evenement: string;
  plaque: string;
  entreprise: string;
  stand: string;
  origine: string;
  type: string;
  km: number;
  kgCO2eq: number;
  date: string;
}

interface AggregatedData {
  category: string;
  nbVehicules: number;
  distanceKm: number;
  emissionsKgCO2eq: number;
}

// Coefficients d'émission CO2 par type de véhicule (kg CO2/km)
// Basés sur les données ADEME 2024 pour les véhicules utilitaires diesel
const CO2_COEFFICIENTS = {
  "<10m3": 0.185, // Fourgonnette/camionnette <3.5t (185g CO2/km)
  "10-15m3": 0.265, // Fourgon moyen 3.5-7.5t (265g CO2/km)
  "15-20m3": 0.385, // Camion porteur 7.5-16t (385g CO2/km)
  ">20m3": 0.485, // Poids lourd >16t (485g CO2/km)
} as const;

// Mapping des tailles de véhicules depuis les nouveaux enums
function mapVehicleTypeToSize(
  vehicleType: string | null,
  fallbackSize?: string
): string {
  if (vehicleType) {
    switch (vehicleType) {
      case "PETIT":
        return "<10m3";
      case "MOYEN":
        return "10-15m3";
      case "GRAND":
        return "15-20m3";
      case "TRES_GRAND":
        return ">20m3";
      default:
        return "10-15m3";
    }
  }

  // Fallback sur l'ancien système si pas de vehicleType
  if (fallbackSize) {
    const sizeUpper = fallbackSize.toUpperCase();
    if (
      sizeUpper.includes("PETIT") ||
      sizeUpper.includes("SMALL") ||
      sizeUpper.includes("<10")
    )
      return "<10m3";
    if (
      sizeUpper.includes("MOYEN") ||
      sizeUpper.includes("MEDIUM") ||
      sizeUpper.includes("10-15")
    )
      return "10-15m3";
    if (
      sizeUpper.includes("GRAND") ||
      sizeUpper.includes("LARGE") ||
      sizeUpper.includes("15-20")
    )
      return "15-20m3";
    if (
      sizeUpper.includes("TRES") ||
      sizeUpper.includes("XL") ||
      sizeUpper.includes(">20")
    )
      return ">20m3";
  }

  return "10-15m3"; // Défaut
}

// Mapping des pays depuis les nouveaux enums
function mapCountryToFrench(
  country: string | null,
  fallbackCity?: string
): string {
  if (country) {
    switch (country) {
      case "FRANCE":
        return "France";
      case "ESPAGNE":
        return "Espagne";
      case "ITALIE":
        return "Italie";
      case "ALLEMAGNE":
        return "Allemagne";
      case "BELGIQUE":
        return "Belgique";
      case "SUISSE":
        return "Suisse";
      case "ROYAUME_UNI":
        return "Royaume-Uni";
      case "PAYS_BAS":
        return "Pays-Bas";
      case "PORTUGAL":
        return "Portugal";
      case "AUTRE":
        return "Autre";
      default:
        return "France";
    }
  }

  // Fallback sur la ville si pas de country
  if (fallbackCity) {
    const cityUpper = fallbackCity.toUpperCase();
    if (
      cityUpper.includes("PARIS") ||
      cityUpper.includes("LYON") ||
      cityUpper.includes("MARSEILLE")
    )
      return "France";
    if (cityUpper.includes("MADRID") || cityUpper.includes("BARCELONA"))
      return "Espagne";
    if (cityUpper.includes("ROME") || cityUpper.includes("MILAN"))
      return "Italie";
    if (cityUpper.includes("BERLIN") || cityUpper.includes("MUNICH"))
      return "Allemagne";
  }

  return fallbackCity || "Origine non renseignée";
}

// Fonction pour parser les dates françaises
function parseDate(dateStr: string): Date {
  if (dateStr.includes("/")) {
    const [day, month, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(dateStr);
}

// Fonction pour filtrer les données sur 12 mois
function filterTwelveMonths(
  data: CarbonDataEntry[],
  endDateStr: string
): CarbonDataEntry[] {
  const endDate = parseDate(endDateStr);
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 11);
  startDate.setDate(1);

  return data.filter((entry) => {
    const entryDate = parseDate(entry.date);
    return entryDate >= startDate && entryDate <= endDate;
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start") || "01/01/2024";
    const endDate = searchParams.get("end") || "31/12/2024";
    const search = searchParams.get("search") || "";

    console.log(
      `🔍 API Carbon - Recherche: "${search}", Période: ${startDate} -> ${endDate}`
    );

    // IMPORTANT: Récupérer les accréditations avec statut "ENTREE" OU "SORTIE"
    // Car les deux signifient que le véhicule s'est effectivement présenté
    const accreditations = await prisma.accreditation.findMany({
      include: {
        vehicles: true,
      },
      where: {
        AND: [
          // CONDITION PRINCIPALE: Véhicules qui se sont présentés (ENTREE ou SORTIE)
          {
            status: {
              in: ["ENTREE", "SORTIE"],
            },
          },
          // Filtres de recherche optionnels
          search
            ? {
                OR: [
                  { company: { contains: search, mode: "insensitive" } },
                  { event: { contains: search, mode: "insensitive" } },
                  { stand: { contains: search, mode: "insensitive" } },
                  {
                    vehicles: {
                      some: {
                        plate: { contains: search, mode: "insensitive" },
                      },
                    },
                  },
                ],
              }
            : {},
        ],
      },
    });

    console.log(
      `📊 Trouvé ${accreditations.length} accréditations avec statut ENTREE ou SORTIE`
    );

    // Transformer les données en format bilan carbone
    const carbonData: CarbonDataEntry[] = [];

    let totalVehiclesProcessed = 0;
    let vehiclesWithDistance = 0;
    let vehiclesWithoutDistance = 0;

    for (const acc of accreditations) {
      console.log(
        `🚗 Traitement accréditation: ${acc.company} - ${acc.event} (${acc.vehicles.length} véhicules)`
      );

      for (const vehicle of acc.vehicles) {
        totalVehiclesProcessed++;

        // 1. CALCUL DU TYPE DE VÉHICULE
        // Utiliser les nouveaux champs en priorité, puis fallback sur le champ "size"
        const vehicleType = mapVehicleTypeToSize(
          (vehicle as any).vehicleType,
          vehicle.size
        );

        // 2. CALCUL DE LA DISTANCE
        let km = 0;
        let distanceSource = "non renseignée";

        // Priorité 1: estimatedKms (nouveau champ calculé)
        if (
          (vehicle as any).estimatedKms &&
          (vehicle as any).estimatedKms > 0
        ) {
          km = (vehicle as any).estimatedKms;
          distanceSource = "calculée automatiquement";
          vehiclesWithDistance++;
        }
        // Priorité 2: kms (ancien champ texte)
        else if (vehicle.kms) {
          const parsedKms = parseInt(vehicle.kms.replace(/\D/g, "")) || 0;
          if (parsedKms > 0) {
            km = parsedKms;
            distanceSource = "saisie manuelle";
            vehiclesWithDistance++;
          } else {
            vehiclesWithoutDistance++;
          }
        }
        // Priorité 3: Calculer depuis la ville si possible
        else if (vehicle.city) {
          try {
            const distanceResponse = await fetch(
              `${req.nextUrl.origin}/api/distance?city=${encodeURIComponent(vehicle.city)}`
            );
            if (distanceResponse.ok) {
              const distanceData = await distanceResponse.json();
              if (distanceData.success && distanceData.data.distance > 0) {
                km = distanceData.data.distance;
                distanceSource = `calculée depuis ${vehicle.city}`;
                vehiclesWithDistance++;
              } else {
                vehiclesWithoutDistance++;
              }
            } else {
              vehiclesWithoutDistance++;
            }
          } catch (error) {
            console.error(
              `Erreur calcul distance pour ${vehicle.city}:`,
              error
            );
            vehiclesWithoutDistance++;
          }
        } else {
          vehiclesWithoutDistance++;
        }

        // 3. CALCUL DES ÉMISSIONS CO2
        // 🔧 FIX: Vérifier que le vehicleType existe dans les coefficients
        const validVehicleTypes = Object.keys(CO2_COEFFICIENTS);
        const finalVehicleType = validVehicleTypes.includes(vehicleType)
          ? vehicleType
          : "10-15m3"; // Fallback sûr

        const coefficient =
          CO2_COEFFICIENTS[finalVehicleType as keyof typeof CO2_COEFFICIENTS];
        const kgCO2eq = km > 0 ? Math.round(km * coefficient) : 0;

        console.log(
          `  🧮 Calcul CO2: ${km}km × ${coefficient} = ${kgCO2eq}kg (type: ${finalVehicleType})`
        );

        // 4. DÉTERMINATION DU PAYS D'ORIGINE
        const origine = mapCountryToFrench(
          (vehicle as any).country,
          vehicle.city
        );

        // 5. GESTION DES DATES
        let dateFormatted =
          vehicle.date || new Date().toISOString().split("T")[0];
        if ((vehicle as any).arrivalDate) {
          dateFormatted = new Date((vehicle as any).arrivalDate)
            .toISOString()
            .split("T")[0];
        }

        // 6. CRÉATION DE L'ENTRÉE CARBON
        carbonData.push({
          id: `${acc.id}-${vehicle.id}`,
          evenement: acc.event, // DONNÉES RÉELLES uniquement
          plaque: vehicle.plate,
          entreprise: acc.company,
          stand: acc.stand,
          origine,
          type: vehicleType,
          km,
          kgCO2eq,
          date: dateFormatted,
        });

        console.log(
          `  ✅ Véhicule ${vehicle.plate}: ${km}km (${distanceSource}), ${kgCO2eq}kg CO2`
        );
      }
    }

    console.log(`📈 Résumé traitement:`);
    console.log(`  - Total véhicules: ${totalVehiclesProcessed}`);
    console.log(`  - Avec distance: ${vehiclesWithDistance}`);
    console.log(`  - Sans distance: ${vehiclesWithoutDistance}`);

    // Filtrer sur 12 mois
    const filteredData = filterTwelveMonths(carbonData, endDate);

    // Calculer les agrégations
    const aggregations = {
      pays: calculateAggregation(filteredData, "origine"),
      evenement: calculateAggregation(filteredData, "evenement"),
      entreprise: calculateAggregation(filteredData, "entreprise"),
      type: calculateAggregation(filteredData, "type"),
    };

    // Calculer les données mensuelles
    const monthlyData = calculateMonthlyData(filteredData, endDate);

    return Response.json({
      success: true,
      data: {
        detailed: filteredData,
        aggregations,
        monthly: monthlyData,
        period: { start: startDate, end: endDate },
        total: filteredData.length,
      },
    });
  } catch (error) {
    console.error("Erreur API bilan carbone:", error);
    return Response.json(
      { success: false, error: "Erreur lors de la récupération des données" },
      { status: 500 }
    );
  }
}

// Fonction pour calculer les agrégations
function calculateAggregation(
  data: CarbonDataEntry[],
  field: keyof CarbonDataEntry
): AggregatedData[] {
  const groups = data.reduce(
    (acc, entry) => {
      const key = String(entry[field]);
      if (!acc[key]) {
        acc[key] = { nbVehicules: 0, distanceKm: 0, emissionsKgCO2eq: 0 };
      }
      acc[key].nbVehicules += 1;
      acc[key].distanceKm += entry.km;
      acc[key].emissionsKgCO2eq += entry.kgCO2eq;
      return acc;
    },
    {} as Record<
      string,
      { nbVehicules: number; distanceKm: number; emissionsKgCO2eq: number }
    >
  );

  return Object.entries(groups)
    .map(([category, values]) => ({
      category,
      ...values,
    }))
    .sort((a, b) => b.nbVehicules - a.nbVehicules);
}

// Fonction pour calculer les données mensuelles
function calculateMonthlyData(data: CarbonDataEntry[], endDateStr: string) {
  console.log(`🗓️  Calcul données mensuelles pour ${data.length} véhicules`);
  const endDate = parseDate(endDateStr);
  
  // 🔧 FIX: Générer TOUS les 12 mois précédant la date de fin (règle métier)
  const months: any[] = [];
  const processedMonths = new Set<string>(); // Éviter les doublons

  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(endDate);
    monthDate.setMonth(monthDate.getMonth() - i);

    const monthName = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(monthDate);
    
    // Créer une clé unique pour éviter les doublons
    const uniqueKey = `${monthDate.getFullYear()}-${monthDate.getMonth().toString().padStart(2, "0")}`;
    
    // Skip si déjà traité
    if (processedMonths.has(uniqueKey)) {
      continue;
    }
    processedMonths.add(uniqueKey);

    // Filtrer les véhicules pour ce mois spécifique
    const monthData = data.filter((entry) => {
      const entryDate = parseDate(entry.date);
      return (
        entryDate.getMonth() === monthDate.getMonth() &&
        entryDate.getFullYear() === monthDate.getFullYear()
      );
    });

    const typeBreakdown = {
      "<10m3": monthData.filter((d) => d.type === "<10m3").length,
      "10-15m3": monthData.filter((d) => d.type === "10-15m3").length,
      "15-20m3": monthData.filter((d) => d.type === "15-20m3").length,
      ">20m3": monthData.filter((d) => d.type === ">20m3").length,
    };

    console.log(`📅 ${monthName}: ${monthData.length} véhicules`);

    months.push({
      month: monthName,
      monthIndex: monthDate.getMonth(),
      year: monthDate.getFullYear(),
      nbVehicules: monthData.length,
      typeBreakdown,
      data: monthData,
      uniqueKey,
    });
  }

  console.log(`🎯 Généré ${months.length} mois (tous les 12 mois de la période)`);
  return months;
}
