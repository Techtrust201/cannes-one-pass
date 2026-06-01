/**
 * Zones par défaut, partagées entre le seed initial et l'auto-seed
 * des nouvelles organisations. Coordonnées GPS réelles (Cannes).
 */
export interface DefaultZone {
  zone: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isFinalDestination: boolean;
  color: string;
}

export const DEFAULT_ZONES: DefaultZone[] = [
  {
    zone: "LA_BOCCA",
    label: "La Bocca",
    address: "Zone de stockage La Bocca, Cannes",
    latitude: 43.5519,
    longitude: 6.9629,
    isFinalDestination: false,
    color: "orange",
  },
  {
    zone: "PALAIS_DES_FESTIVALS",
    label: "Palais des Festivals",
    address: "1 Bd de la Croisette, 06400 Cannes",
    latitude: 43.5506,
    longitude: 7.0175,
    isFinalDestination: true,
    color: "green",
  },
  {
    zone: "PANTIERO",
    label: "Pantiero",
    address: "Prom. de la Pantiero, 06400 Cannes",
    latitude: 43.5509,
    longitude: 7.014,
    isFinalDestination: false,
    color: "blue",
  },
  {
    zone: "MACE",
    label: "Macé",
    address: "Plage Macé, Bd de la Croisette, 06400 Cannes",
    latitude: 43.5503,
    longitude: 7.0223,
    isFinalDestination: false,
    color: "purple",
  },
];
