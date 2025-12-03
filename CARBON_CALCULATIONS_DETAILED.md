# 📊 **CALCULS DÉTAILLÉS DU BILAN CARBONE**

## 🎯 **RÈGLES FONDAMENTALES**

### ✅ **Critère Principal : STATUTS "ENTRÉE" OU "SORTIE"**

- **INCLUS** : Accréditations avec `status = "ENTREE"` OU `status = "SORTIE"`
- **POURQUOI** : Ces deux statuts signifient que le véhicule s'est effectivement présenté
- **EXCLUS** : ATTENTE, NOUVEAU, REFUS, ABSENT (véhicules qui ne se sont pas présentés)

---

## 🚗 **CALCUL : NB VÉHICULES**

### **Méthode :**

```sql
COUNT(Vehicle) WHERE Accreditation.status IN ("ENTREE", "SORTIE")
```

### **Détail :**

1. ✅ Récupérer toutes les accréditations avec statut "ENTRÉE" ou "SORTIE"
2. ✅ Compter TOUS les véhicules associés à ces accréditations
3. ✅ Un véhicule = une ligne dans la table Vehicle

### **Exemple :**

- Accréditation A (ENTREE) → 2 véhicules ✅
- Accréditation B (ATTENTE) → 1 véhicule ❌ (exclus)
- Accréditation C (SORTIE) → 3 véhicules ✅
- Accréditation D (ENTREE) → 1 véhicule ✅
- **TOTAL NB VÉHICULES : 6** (2+3+1)

---

## 📏 **CALCUL : DISTANCE KM**

### **Méthode par priorité :**

#### **1. Priorité 1 : `estimatedKms` (nouveau champ)**

```javascript
if (vehicle.estimatedKms > 0) {
  km = vehicle.estimatedKms;
  source = "calculée automatiquement";
}
```

#### **2. Priorité 2 : `kms` (champ texte existant)**

```javascript
else if (vehicle.kms) {
  km = parseInt(vehicle.kms.replace(/\D/g, "")) || 0;
  source = "saisie manuelle";
}
```

#### **3. Priorité 3 : Calcul depuis la ville**

```javascript
else if (vehicle.city) {
  // API /api/distance?city=Paris
  km = calculateDistanceFromCity(vehicle.city);
  source = "calculée depuis " + vehicle.city;
}
```

#### **4. Fallback : Distance = 0**

```javascript
else {
  km = 0;
  source = "non renseignée";
}
```

### **Calcul de distance automatique :**

- **Destination fixe** : Palais des festivals, 1 Bd de la Croisette, 06400 Cannes
- **Coordonnées** : 43.5506°N, 7.0175°E
- **Méthode** : Formule de Haversine × 1.3 (facteur route)
- **Base de données** : 30+ villes européennes principales

### **Exemple :**

- Véhicule 1 : Paris → Cannes = 937 km (calculé automatiquement)
- Véhicule 2 : "500 km" saisi manuellement = 500 km
- Véhicule 3 : Pas de données = 0 km

---

## 🌍 **CALCUL : ÉMISSIONS (kgCO2eq)**

### **Formule :**

```javascript
kgCO2eq = km × COEFFICIENT_CO2[typeVéhicule]
```

### **Coefficients par type :**

```javascript
const CO2_COEFFICIENTS = {
  "<10m3": 0.15, // kg CO2 par km
  "10-15m3": 0.25, // kg CO2 par km
  "15-20m3": 0.35, // kg CO2 par km
  ">20m3": 0.45, // kg CO2 par km
};
```

### **Mapping des types :**

```javascript
// Depuis nouveau champ vehicleType (priorité)
PETIT → <10m3
MOYEN → 10-15m3
GRAND → 15-20m3
TRES_GRAND → >20m3

// Fallback depuis champ size (texte libre)
"petit", "small" → <10m3
"moyen", "medium" → 10-15m3
"grand", "large" → 15-20m3
"très grand", "xl" → >20m3
```

### **Exemple :**

- Véhicule MOYEN, 500km → 500 × 0.25 = **125 kg CO2**
- Véhicule GRAND, 800km → 800 × 0.35 = **280 kg CO2**

---

## 🌍 **AGRÉGATIONS PAR CATÉGORIE**

### **1. PAYS (Origine)**

#### **Méthode :**

```javascript
// Priorité 1: Nouveau champ country
FRANCE → "France"
ESPAGNE → "Espagne"
ITALIE → "Italie"

// Priorité 2: Déduction depuis city
"Paris", "Lyon" → "France"
"Madrid", "Barcelona" → "Espagne"
"Rome", "Milan" → "Italie"

// Fallback
city → city (tel quel)
```

#### **Calculs par pays :**

- **NB véhicules** : COUNT(véhicules de ce pays)
- **Distance Km** : SUM(km de tous véhicules de ce pays)
- **Émissions** : SUM(kgCO2eq de tous véhicules de ce pays)

### **2. ÉVÉNEMENT**

#### **Source :** `Accreditation.event` (données réelles uniquement)

- **Exemples réels** : "MIPM", "MIDEM", "Cannes Lions", etc.
- **PAS d'invention** : Seuls les événements vraiment enregistrés

### **3. ENTREPRISE**

#### **Source :** `Accreditation.company` (données réelles uniquement)

- **Exemples** : Noms des vraies entreprises enregistrées
- **PAS d'invention** : Seules les entreprises ayant fait une accréditation

### **4. TYPE**

#### **Source :** Mapping depuis `Vehicle.size` ou `Vehicle.vehicleType`

- **<10m3** : Petits véhicules
- **10-15m3** : Véhicules moyens
- **15-20m3** : Grands véhicules
- **>20m3** : Très grands véhicules

---

## 📅 **FILTRAGE TEMPOREL "12 MOIS"**

### **Règle :**

```javascript
// Période = 12 mois précédant la date de fin sélectionnée
endDate = "25/03/2025";
startDate = "25/03/2024"; // 12 mois avant
```

### **Application :**

- Filtrer sur `Vehicle.date` ou `Vehicle.arrivalDate`
- Inclure seulement les véhicules dans cette période
- Recalculer toutes les métriques sur cette base

---

## 🔍 **DONNÉES MENSUELLES**

### **Méthode :**

1. Grouper par mois (janvier 2024, février 2024, etc.)
2. Pour chaque mois :
   - **NB véhicules total**
   - **Répartition par type** : COUNT par type de véhicule
   - **Données détaillées** : Liste complète des véhicules

---

## ✅ **VÉRIFICATIONS DE COHÉRENCE**

### **Tests à effectuer :**

1. **Total véhicules** = Somme des véhicules par pays/événement/entreprise/type
2. **Total distance** = Somme des distances individuelles
3. **Total émissions** = Somme des émissions individuelles
4. **Pourcentages** dans les camemberts = 100% exactement
5. **Données mensuelles** = Somme des 12 mois = Total général

### **Logs de contrôle :**

```javascript
console.log(
  `📊 Trouvé ${accreditations.length} accréditations avec statut ENTREE`
);
console.log(`📈 Total véhicules: ${totalVehiclesProcessed}`);
console.log(`📈 Avec distance: ${vehiclesWithDistance}`);
console.log(`📈 Sans distance: ${vehiclesWithoutDistance}`);
```

---

## 🚨 **POINTS D'ATTENTION**

### **❌ Ce qui est EXCLU :**

- Accréditations avec statut ≠ "ENTRÉE"
- Véhicules sans données de base (plaque, etc.)
- Données de test/factices

### **✅ Ce qui est INCLUS :**

- UNIQUEMENT les vraies accréditations validées
- UNIQUEMENT les vrais événements enregistrés
- UNIQUEMENT les vraies entreprises
- Calculs basés sur des données réelles ou calculées automatiquement

### **🔄 Gestion des données manquantes :**

- **Distance manquante** → Calcul automatique depuis la ville
- **Ville inconnue** → Distance = 0, mais véhicule comptabilisé
- **Type inconnu** → Type par défaut "10-15m3"
- **Date manquante** → Date du jour

---

## 📋 **RÉSUMÉ DES SOURCES DE DONNÉES**

| Métrique         | Source Primaire  | Source Secondaire | Fallback           |
| ---------------- | ---------------- | ----------------- | ------------------ |
| **NB Véhicules** | COUNT(Vehicle)   | -                 | -                  |
| **Distance**     | estimatedKms     | kms (parsé)       | Calcul depuis city |
| **Émissions**    | distance × coeff | -                 | 0 si distance = 0  |
| **Pays**         | country (enum)   | Déduction city    | city tel quel      |
| **Événement**    | event            | -                 | "Non renseigné"    |
| **Entreprise**   | company          | -                 | "Non renseigné"    |
| **Type**         | vehicleType      | size (parsé)      | "10-15m3"          |

**🎯 OBJECTIF : 100% des données affichées sont traçables et vérifiables !**
