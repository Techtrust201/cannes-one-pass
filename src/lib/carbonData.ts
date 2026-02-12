// Données mock pour le bilan carbone

export interface CarbonData {
  id: string;
  evenement: string;
  plaque: string;
  entreprise: string;
  stand: string;
  origine: string;
  type: string;
  km: number;
  kgCO2eq: number;
  date: string; // ISO format
}

export interface AggregatedData {
  category: string;
  nbVehicules: number;
  distanceKm: number;
  emissionsKgCO2eq: number;
}

export interface MonthlyData {
  month: string;
  year: number;
  nbVehicules: number;
  typeBreakdown: {
    [key: string]: number;
  };
}

// Mapping des couleurs pour les types de véhicules réels
export const TYPE_COLORS = {
  "Porteur": "#3B82F6",           // bleu
  "Porteur articulé": "#F59E0B",  // orange
  "Semi-remorque": "#EF4444",     // rouge
};

// Données mock détaillées
export const mockDetailedData: CarbonData[] = [
  {
    id: "#AAA-999",
    evenement: "Cannes series",
    plaque: "XP-777-XD",
    entreprise: "Nomdeentrepriselongue",
    stand: "Nomdestandlongue",
    origine: "Nomdepaystreslong",
    type: "Semi-remorque",
    km: 999999,
    kgCO2eq: 999999,
    date: "2025-01-15",
  },
  // Ajouter plus de données mock...
];

// Fonction pour formater les nombres en français
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("fr-FR", {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(num)
    .replace(/\s/g, " "); // Espace insécable
}

// Fonction pour obtenir les 12 mois précédant une date
export function getTwelveMonthsPeriod(endDateStr: string): {
  start: Date;
  end: Date;
  months: string[];
} {
  const endDate = parseDate(endDateStr);
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 11);
  startDate.setDate(1);

  const months: string[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const monthName = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(currentDate);
    months.push(monthName);
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return { start: startDate, end: endDate, months };
}

// Fonction pour parser une date au format jj/mm/aaaa
export function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

// Fonction pour formater un mois en français
export function formatMonth(
  date: Date,
  format: "long" | "short" = "long"
): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: format === "long" ? "long" : "short",
    year: "numeric",
  }).format(date);
}

// Fonction pour obtenir l'abréviation du mois
export function getMonthAbbr(monthIndex: number): string {
  const months = [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Jun",
    "Jul",
    "Aoû",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
  ];
  return months[monthIndex];
}

// Données agrégées mock
export const mockAggregatedData = {
  pays: [
    {
      category: "France",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Portugal",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Espagne",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Kazakhstan",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Pologne",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
  ],
  evenement: [
    {
      category: "MIPM",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "MIDEM",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Cannes Series",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Cannes Lions",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "WORLD",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
  ],
  entreprise: [
    {
      category: "Techtrust",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Amazon",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Facebook",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Netflix",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Nomsuperlongalire",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
  ],
  type: [
    {
      category: "Porteur",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Porteur articulé",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
    {
      category: "Semi-remorque",
      nbVehicules: 999999999,
      distanceKm: 999999999,
      emissionsKgCO2eq: 999999999,
    },
  ],
};

// Données mensuelles mock
export const mockMonthlyData: MonthlyData[] = [
  {
    month: "Janvier 2025",
    year: 2025,
    nbVehicules: 9999,
    typeBreakdown: {
      "Porteur": 3500,
      "Porteur articulé": 3000,
      "Semi-remorque": 3499,
    },
  },
  // Ajouter plus de données pour les 12 mois...
];
