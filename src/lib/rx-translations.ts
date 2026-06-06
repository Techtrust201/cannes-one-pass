import type { LangCode } from "./translations";

/**
 * Traductions spécifiques au template d'accréditation RX (Cannes Yachting
 * Festival). Isolées du dictionnaire Palais pour ne jamais mélanger les
 * contenus métier des deux organisations. Consommées exclusivement par les
 * composants RX via `t.rx.*`.
 *
 * Les libellés métier (espaces logistiques, catégories, notes Scales) sont
 * indexés par identifiant technique stable (jamais par texte) afin d'éviter
 * toute désynchronisation avec `rx/config.ts`.
 */

export interface RxCategoryT {
  name: string;
  scalesNote?: string;
}

export interface RxSpaceT {
  label: string;
  note?: string;
}

export interface RxT {
  steps: {
    exhibitor: string;
    contact: string;
    delivery: string;
    pickup: string;
    manutention: string;
  };
  exhibitor: {
    title: string;
    subtitle: string;
    noEventsBanner: string;
    label: string;
    searchPlaceholder: string;
    loading: string;
    notFound: string;
    clear: string;
    standNumber: string;
    selectToContinue: string;
    othersSector: string;
  };
  contact: {
    title: string;
    subtitle: string;
    lastName: string;
    firstName: string;
    lastNamePlaceholder: string;
    firstNamePlaceholder: string;
    email: string;
    emailPlaceholder: string;
    mobilePhone: string;
    phonePlaceholder: string;
    required: string;
    invalidEmail: string;
    invalidPhone: string;
  };
  delivery: {
    title: string;
    palaisIntro: string;
    interiorPalais: string;
    interiorPalaisDesc: string;
    exteriorPalais: string;
    exteriorPalaisDesc: string;
    spaceLabel: string;
    instructions: string;
    rdvScales: string;
    date: string;
    chooseDate: string;
    slot: string;
    chooseSlot: string;
    chooseDateFirst: string;
    vehicles: string;
    vehiclesHint: string;
    addVehicle: string;
    loadingTypes: string;
    noTypes: string;
    interveningCompany: string;
    interveningPlaceholder: string;
    vehicleType: string;
    choose: string;
    plateOptional: string;
    removeVehicle: string;
    scalesMandatory: string;
    scalesDefault: string;
    scalesContact: string;
    validationHint: string;
  };
  pickup: {
    title: string;
    emptyHint: string;
    intro: string;
    pickupDate: string;
    slot: string;
    chooseDate: string;
    chooseSlot: string;
    chooseDateFirst: string;
    pickupVehicles: string;
    deliveryVehicle: string;
    sameVehicle: string;
    pickupVehicleType: string;
    choose: string;
    pickupPlateOptional: string;
    driverPhonePickup: string;
    lockedAria: string;
    validationHint: string;
  };
  manutention: {
    title: string;
    subtitle: string;
    scalesAutoNotice: string;
    complementaryProvider: string;
    chooseProvider: string;
    noneOption: string;
    scalesAck: string;
    consent: string;
    recapExhibitor: string;
    recapCategories: string;
    recapVehicles: string;
    recapContact: string;
    validate: string;
    validateHint: string;
    validateHintScales: string;
    validateHintEnd: string;
    successTitleOne: string;
    successTitleMany: string;
    successPerVehicle: string;
    successLogisticien: string;
    successPublic: string;
    downloadNotice: string;
    generating: string;
    downloadCta: string;
    scalesReminder: string;
    newRequest: string;
  };
  spaces: Record<string, RxSpaceT>;
  categories: Record<string, RxCategoryT>;
}

/** Concepts de catégories distincts pour une langue donnée. */
interface CategoryConcepts {
  standNu: string;
  cleEnMain: string;
  bateauTerre: string;
  standTente: string;
  motoristes: string;
  flotPonton: string;
  tenteNuDevant: string;
  nuDevant: string;
  tender: string;
  tenteNuDevantSlash: string;
  bateauFlot: string;
  noteA: string;
  noteB: string;
  noteC: string;
  noteD: string;
  noteE: string;
  noteF: string;
  noteG: string;
}

/**
 * Construit le dictionnaire `categories` (indexé par id de catégorie) à partir
 * des concepts distincts d'une langue. Évite de répéter les traductions
 * communes à plusieurs espaces.
 */
function buildCategories(c: CategoryConcepts): Record<string, RxCategoryT> {
  return {
    "stand-nu-int": { name: c.standNu },
    "cle-en-main": { name: c.cleEnMain },
    "bateau-terre-int": { name: c.bateauTerre, scalesNote: c.noteA },
    "bateau-terre-ext": { name: c.bateauTerre, scalesNote: c.noteB },
    "tente-ext": { name: c.standTente },
    motoristes: { name: c.motoristes, scalesNote: c.noteC },
    "flot-qml": { name: c.flotPonton },
    "tente-qml": { name: c.tenteNuDevant },
    "flot-qsp": { name: c.flotPonton },
    "tente-qsp": { name: c.tenteNuDevant },
    "flot-pan": { name: c.flotPonton, scalesNote: c.noteD },
    "tente-pan": { name: c.tenteNuDevant },
    "flot-jetee": { name: c.flotPonton },
    "tente-jetee": { name: c.standTente },
    "nus-jetee": { name: c.nuDevant },
    "flot-sye": { name: c.flotPonton, scalesNote: c.noteD },
    "tente-sye": { name: c.standTente },
    "tender-bateau": { name: c.tender, scalesNote: c.noteE },
    "tender-tente": { name: c.standTente },
    "flot-broker": { name: c.flotPonton, scalesNote: c.noteF },
    "tente-broker": { name: c.tenteNuDevantSlash },
    "flot-sail": { name: c.flotPonton },
    "tente-sail": { name: c.standTente },
    "nus-sail": { name: c.nuDevant },
    "flot-power": { name: c.bateauFlot },
    "terre-power": { name: c.bateauTerre, scalesNote: c.noteG },
  };
}

const fr: RxT = {
  steps: {
    exhibitor: "Exposant",
    contact: "Contact",
    delivery: "Livraison",
    pickup: "Reprise",
    manutention: "Manutention",
  },
  exhibitor: {
    title: "Sélection de l'exposant",
    subtitle: "Choisissez votre société dans la liste officielle.",
    noEventsBanner:
      "Aucun événement actif n'est ouvert aux accréditations pour le moment. Contactez l'organisateur.",
    label: "Exposant",
    searchPlaceholder: "Rechercher par nom ou n° de stand…",
    loading: "Chargement des exposants…",
    notFound: "Aucun exposant trouvé",
    clear: "Effacer",
    standNumber: "N° de stand",
    selectToContinue: "Sélectionnez votre exposant pour continuer.",
    othersSector: "Autres",
  },
  contact: {
    title: "Contact du responsable",
    subtitle: "Personne à contacter pour la logistique de ce stand.",
    lastName: "Nom",
    firstName: "Prénom",
    lastNamePlaceholder: "Dupont",
    firstNamePlaceholder: "Jean",
    email: "Adresse e-mail",
    emailPlaceholder: "jean.dupont@entreprise.com",
    mobilePhone: "Téléphone portable",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Champ obligatoire.",
    invalidEmail: "Adresse e-mail invalide.",
    invalidPhone: "Numéro de téléphone invalide.",
  },
  delivery: {
    title: "Gestion des livraisons (montage)",
    palaisIntro:
      "Votre stand est dans le Palais des Festivals. Précisez son emplacement pour afficher les catégories.",
    interiorPalais: "Intérieur Palais",
    interiorPalaisDesc: "À l'intérieur du Palais des Festivals",
    exteriorPalais: "Extérieur Palais",
    exteriorPalaisDesc: "Esplanade extérieure (Macé, etc.)",
    spaceLabel: "Espace :",
    instructions:
      "Cochez chaque catégorie applicable à votre stand, puis renseignez la date, le créneau et le(s) véhicule(s) pour chacune.",
    rdvScales: "RDV Scales",
    date: "Date",
    chooseDate: "— Choisir une date —",
    slot: "Créneau",
    chooseSlot: "— Choisir un créneau —",
    chooseDateFirst: "— Choisir d'abord une date —",
    vehicles: "Véhicule(s)",
    vehiclesHint: "(type de véhicule obligatoire · plaque optionnelle)",
    addVehicle: "+ Ajouter un véhicule",
    loadingTypes: "Chargement des types de véhicule…",
    noTypes:
      "Aucun type de véhicule configuré pour le moment. Contactez l'organisateur.",
    interveningCompany: "Société intervenante",
    interveningPlaceholder: "Transporteur, décorateur, prestataire…",
    vehicleType: "Type de véhicule",
    choose: "— Choisir —",
    plateOptional: "Plaque (optionnelle)",
    removeVehicle: "Retirer ce véhicule",
    scalesMandatory: "Coordination Scales obligatoire :",
    scalesDefault: "cette catégorie nécessite la prise de RDV avec Scales.",
    scalesContact: "Contact :",
    validationHint:
      "Sélectionnez au moins une catégorie avec sa date, son créneau et un véhicule (type de véhicule).",
  },
  pickup: {
    title: "Gestion des reprises (démontage)",
    emptyHint: "Configurez d'abord vos livraisons à l'étape précédente.",
    intro:
      "Les catégories sélectionnées au montage sont reprises automatiquement. Renseignez la date, le créneau et le véhicule de reprise pour chacune.",
    pickupDate: "Date de reprise",
    slot: "Créneau",
    chooseDate: "— Choisir une date —",
    chooseSlot: "— Choisir un créneau —",
    chooseDateFirst: "— Choisir d'abord une date —",
    pickupVehicles: "Véhicules de reprise",
    deliveryVehicle: "Véhicule livraison",
    sameVehicle: "Reprise par le même véhicule",
    pickupVehicleType: "Type de véhicule (reprise)",
    choose: "— Choisir —",
    pickupPlateOptional: "Plaque reprise (optionnelle)",
    driverPhonePickup: "Téléphone conducteur reprise",
    lockedAria: "(verrouillé)",
    validationHint:
      "Renseignez la date, le créneau et les véhicules de reprise pour chaque catégorie.",
  },
  manutention: {
    title: "Prestataire de manutention",
    subtitle: "Société pour la manutention non-Scales.",
    scalesAutoNotice:
      "Scales sera automatiquement assigné pour les catégories cochées le nécessitant (bateaux à terre, motoristes…). Vous pouvez choisir un prestataire complémentaire pour le reste.",
    complementaryProvider: "Prestataire complémentaire",
    chooseProvider: "— Sélectionnez un prestataire —",
    noneOption: "Aucun (Scales uniquement pour catégories concernées)",
    scalesAck:
      "Je prendrai contact avec Scales pour planifier la manutention des catégories concernées",
    consent:
      "J'autorise le traitement de ces informations dans le cadre de l'accréditation logistique de l'événement.",
    recapExhibitor: "Exposant :",
    recapCategories: "Catégories :",
    recapVehicles: "Véhicules :",
    recapContact: "Contact :",
    validate: "Valider l'accréditation",
    validateHint: "Confirmez le consentement",
    validateHintScales: " et l'acquittement Scales",
    validateHintEnd: " pour valider.",
    successTitleOne: "Accréditation enregistrée !",
    successTitleMany: "accréditations enregistrées !",
    successPerVehicle: "Une accréditation a été créée par véhicule. ",
    successLogisticien: "Elles sont validées et visibles dans la liste.",
    successPublic:
      "Votre demande sera traitée puis validée par l'organisateur. Un e-mail de confirmation vous sera envoyé.",
    downloadNotice:
      "Vous devez télécharger et présenter votre accréditation (QR code) à l'entrée du site.",
    generating: "Génération…",
    downloadCta: "Télécharger mon accréditation",
    scalesReminder:
      "Rappel Scales : n'oubliez pas de prendre rendez-vous avec Scales pour les catégories concernées.",
    newRequest: "Nouvelle demande",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Intérieur Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Extérieur Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + traversante" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Jetée Nord / Sud" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Espace Tenders (proche du Palais)",
      note: "Espace proche du Palais — règles équivalentes à l'Extérieur Palais.",
    },
    BROKER: { label: "Espace Broker et Toys" },
    SAIL: { label: "Espace Voile (Mono / Multicoque)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Stand nu",
    cleEnMain: "Stand Clé en main / Saphir",
    bateauTerre: "Bateau à terre",
    standTente: "Stand sous tente",
    motoristes: "Structures spécifiques (motoristes)",
    flotPonton: "Bateau à flot / ponton privatif",
    tenteNuDevant: "Stand sous tente / espace nu devant bateau",
    nuDevant: "Espace nu devant bateau",
    tender: "Bateau / Tender",
    tenteNuDevantSlash: "Tente / espace nu / devant bateau",
    bateauFlot: "Bateau à flot",
    noteA:
      "Manutention bateaux intérieur Palais réalisée le mardi 15/09 selon planning Scales.",
    noteB: "Mise en place via Scales entre sam 5/09 16h et dim 6/09 12h.",
    noteC: "Pour les moteurs, RDV obligatoire avec Scales (réception 1er–2 sept).",
    noteD: "Planning d'arrivée individuel envoyé par l'organisateur.",
    noteE: "Manutention via Scales selon planning individuel.",
    noteF: "Planning individuel à coordonner avec Scales.",
    noteG: "Manutention via Scales obligatoire pour les bateaux à terre.",
  }),
};

const en: RxT = {
  steps: {
    exhibitor: "Exhibitor",
    contact: "Contact",
    delivery: "Delivery",
    pickup: "Pickup",
    manutention: "Handling",
  },
  exhibitor: {
    title: "Exhibitor selection",
    subtitle: "Choose your company from the official list.",
    noEventsBanner:
      "No active event is currently open for accreditations. Please contact the organiser.",
    label: "Exhibitor",
    searchPlaceholder: "Search by name or stand number…",
    loading: "Loading exhibitors…",
    notFound: "No exhibitor found",
    clear: "Clear",
    standNumber: "Stand no.",
    selectToContinue: "Select your exhibitor to continue.",
    othersSector: "Others",
  },
  contact: {
    title: "Lead contact",
    subtitle: "Person to contact for this stand's logistics.",
    lastName: "Last name",
    firstName: "First name",
    lastNamePlaceholder: "Smith",
    firstNamePlaceholder: "John",
    email: "Email address",
    emailPlaceholder: "john.smith@company.com",
    mobilePhone: "Mobile phone",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Required field.",
    invalidEmail: "Invalid email address.",
    invalidPhone: "Invalid phone number.",
  },
  delivery: {
    title: "Delivery management (set-up)",
    palaisIntro:
      "Your stand is inside the Palais des Festivals. Specify its location to display the categories.",
    interiorPalais: "Inside Palais",
    interiorPalaisDesc: "Inside the Palais des Festivals",
    exteriorPalais: "Outside Palais",
    exteriorPalaisDesc: "Outdoor esplanade (Macé, etc.)",
    spaceLabel: "Area:",
    instructions:
      "Tick each category applicable to your stand, then enter the date, time slot and vehicle(s) for each one.",
    rdvScales: "Scales appointment",
    date: "Date",
    chooseDate: "— Choose a date —",
    slot: "Time slot",
    chooseSlot: "— Choose a time slot —",
    chooseDateFirst: "— Choose a date first —",
    vehicles: "Vehicle(s)",
    vehiclesHint: "(vehicle type required · plate optional)",
    addVehicle: "+ Add a vehicle",
    loadingTypes: "Loading vehicle types…",
    noTypes:
      "No vehicle type configured at the moment. Please contact the organiser.",
    interveningCompany: "Operating company",
    interveningPlaceholder: "Carrier, decorator, provider…",
    vehicleType: "Vehicle type",
    choose: "— Choose —",
    plateOptional: "Plate (optional)",
    removeVehicle: "Remove this vehicle",
    scalesMandatory: "Mandatory Scales coordination:",
    scalesDefault: "this category requires booking an appointment with Scales.",
    scalesContact: "Contact:",
    validationHint:
      "Select at least one category with its date, time slot and a vehicle (vehicle type).",
  },
  pickup: {
    title: "Pickup management (dismantling)",
    emptyHint: "Set up your deliveries first in the previous step.",
    intro:
      "The categories selected during set-up are picked up automatically. Enter the date, time slot and pickup vehicle for each one.",
    pickupDate: "Pickup date",
    slot: "Time slot",
    chooseDate: "— Choose a date —",
    chooseSlot: "— Choose a time slot —",
    chooseDateFirst: "— Choose a date first —",
    pickupVehicles: "Pickup vehicles",
    deliveryVehicle: "Delivery vehicle",
    sameVehicle: "Pickup with the same vehicle",
    pickupVehicleType: "Vehicle type (pickup)",
    choose: "— Choose —",
    pickupPlateOptional: "Pickup plate (optional)",
    driverPhonePickup: "Pickup driver's phone",
    lockedAria: "(locked)",
    validationHint:
      "Enter the date, time slot and pickup vehicles for each category.",
  },
  manutention: {
    title: "Handling provider",
    subtitle: "Company for non-Scales handling.",
    scalesAutoNotice:
      "Scales will be automatically assigned for the ticked categories that require it (boats ashore, engine builders…). You may choose an additional provider for the rest.",
    complementaryProvider: "Additional provider",
    chooseProvider: "— Select a provider —",
    noneOption: "None (Scales only for relevant categories)",
    scalesAck:
      "I will contact Scales to schedule the handling of the relevant categories",
    consent:
      "I authorise the processing of this information as part of the event's logistics accreditation.",
    recapExhibitor: "Exhibitor:",
    recapCategories: "Categories:",
    recapVehicles: "Vehicles:",
    recapContact: "Contact:",
    validate: "Validate the accreditation",
    validateHint: "Confirm consent",
    validateHintScales: " and the Scales acknowledgement",
    validateHintEnd: " to validate.",
    successTitleOne: "Accreditation saved!",
    successTitleMany: "accreditations saved!",
    successPerVehicle: "One accreditation was created per vehicle. ",
    successLogisticien: "They are validated and visible in the list.",
    successPublic:
      "Your request will be processed and validated by the organiser. A confirmation email will be sent to you.",
    downloadNotice:
      "You must download and present your accreditation (QR code) at the site entrance.",
    generating: "Generating…",
    downloadCta: "Download my accreditation",
    scalesReminder:
      "Scales reminder: do not forget to book an appointment with Scales for the relevant categories.",
    newRequest: "New request",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Inside Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Outside Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + crossing area" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "North / South Pier" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Tenders area (near the Palais)",
      note: "Area near the Palais — rules equivalent to Outside Palais.",
    },
    BROKER: { label: "Broker and Toys area" },
    SAIL: { label: "Sailing area (Mono / Multihull)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Bare stand",
    cleEnMain: "Turnkey stand / Saphir",
    bateauTerre: "Boat ashore",
    standTente: "Tented stand",
    motoristes: "Specific structures (engine builders)",
    flotPonton: "Boat afloat / private pontoon",
    tenteNuDevant: "Tented stand / bare space in front of boat",
    nuDevant: "Bare space in front of boat",
    tender: "Boat / Tender",
    tenteNuDevantSlash: "Tent / bare space / in front of boat",
    bateauFlot: "Boat afloat",
    noteA:
      "Inside Palais boat handling carried out on Tuesday 15/09 according to the Scales schedule.",
    noteB: "Set-up via Scales between Sat 5/09 4pm and Sun 6/09 12pm.",
    noteC:
      "For engines, an appointment with Scales is mandatory (reception 1–2 Sep).",
    noteD: "Individual arrival schedule sent by the organiser.",
    noteE: "Handling via Scales according to individual schedule.",
    noteF: "Individual schedule to be coordinated with Scales.",
    noteG: "Handling via Scales mandatory for boats ashore.",
  }),
};

const de: RxT = {
  steps: {
    exhibitor: "Aussteller",
    contact: "Kontakt",
    delivery: "Anlieferung",
    pickup: "Abholung",
    manutention: "Handling",
  },
  exhibitor: {
    title: "Auswahl des Ausstellers",
    subtitle: "Wählen Sie Ihr Unternehmen aus der offiziellen Liste.",
    noEventsBanner:
      "Derzeit ist keine aktive Veranstaltung für Akkreditierungen geöffnet. Bitte kontaktieren Sie den Veranstalter.",
    label: "Aussteller",
    searchPlaceholder: "Nach Name oder Standnummer suchen…",
    loading: "Aussteller werden geladen…",
    notFound: "Kein Aussteller gefunden",
    clear: "Löschen",
    standNumber: "Stand-Nr.",
    selectToContinue: "Wählen Sie Ihren Aussteller, um fortzufahren.",
    othersSector: "Andere",
  },
  contact: {
    title: "Verantwortlicher Kontakt",
    subtitle: "Ansprechpartner für die Logistik dieses Standes.",
    lastName: "Nachname",
    firstName: "Vorname",
    lastNamePlaceholder: "Müller",
    firstNamePlaceholder: "Hans",
    email: "E-Mail-Adresse",
    emailPlaceholder: "hans.mueller@firma.com",
    mobilePhone: "Mobiltelefon",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Pflichtfeld.",
    invalidEmail: "Ungültige E-Mail-Adresse.",
    invalidPhone: "Ungültige Telefonnummer.",
  },
  delivery: {
    title: "Anlieferungsverwaltung (Aufbau)",
    palaisIntro:
      "Ihr Stand befindet sich im Palais des Festivals. Geben Sie den Standort an, um die Kategorien anzuzeigen.",
    interiorPalais: "Innen Palais",
    interiorPalaisDesc: "Im Inneren des Palais des Festivals",
    exteriorPalais: "Außen Palais",
    exteriorPalaisDesc: "Außenesplanade (Macé usw.)",
    spaceLabel: "Bereich:",
    instructions:
      "Kreuzen Sie jede für Ihren Stand zutreffende Kategorie an und geben Sie dann Datum, Zeitfenster und Fahrzeug(e) für jede an.",
    rdvScales: "Scales-Termin",
    date: "Datum",
    chooseDate: "— Datum wählen —",
    slot: "Zeitfenster",
    chooseSlot: "— Zeitfenster wählen —",
    chooseDateFirst: "— Zuerst ein Datum wählen —",
    vehicles: "Fahrzeug(e)",
    vehiclesHint: "(Fahrzeugtyp erforderlich · Kennzeichen optional)",
    addVehicle: "+ Fahrzeug hinzufügen",
    loadingTypes: "Fahrzeugtypen werden geladen…",
    noTypes:
      "Derzeit ist kein Fahrzeugtyp konfiguriert. Bitte kontaktieren Sie den Veranstalter.",
    interveningCompany: "Ausführendes Unternehmen",
    interveningPlaceholder: "Spediteur, Dekorateur, Dienstleister…",
    vehicleType: "Fahrzeugtyp",
    choose: "— Wählen —",
    plateOptional: "Kennzeichen (optional)",
    removeVehicle: "Dieses Fahrzeug entfernen",
    scalesMandatory: "Verpflichtende Scales-Koordination:",
    scalesDefault: "diese Kategorie erfordert einen Termin mit Scales.",
    scalesContact: "Kontakt:",
    validationHint:
      "Wählen Sie mindestens eine Kategorie mit Datum, Zeitfenster und einem Fahrzeug (Fahrzeugtyp).",
  },
  pickup: {
    title: "Abholungsverwaltung (Abbau)",
    emptyHint: "Konfigurieren Sie zuerst Ihre Anlieferungen im vorherigen Schritt.",
    intro:
      "Die beim Aufbau ausgewählten Kategorien werden automatisch abgeholt. Geben Sie Datum, Zeitfenster und Abholfahrzeug für jede an.",
    pickupDate: "Abholdatum",
    slot: "Zeitfenster",
    chooseDate: "— Datum wählen —",
    chooseSlot: "— Zeitfenster wählen —",
    chooseDateFirst: "— Zuerst ein Datum wählen —",
    pickupVehicles: "Abholfahrzeuge",
    deliveryVehicle: "Anlieferfahrzeug",
    sameVehicle: "Abholung mit demselben Fahrzeug",
    pickupVehicleType: "Fahrzeugtyp (Abholung)",
    choose: "— Wählen —",
    pickupPlateOptional: "Kennzeichen Abholung (optional)",
    driverPhonePickup: "Telefon Abholfahrer",
    lockedAria: "(gesperrt)",
    validationHint:
      "Geben Sie Datum, Zeitfenster und Abholfahrzeuge für jede Kategorie an.",
  },
  manutention: {
    title: "Handling-Dienstleister",
    subtitle: "Unternehmen für Nicht-Scales-Handling.",
    scalesAutoNotice:
      "Scales wird automatisch für die angekreuzten Kategorien zugewiesen, die dies erfordern (Boote an Land, Motorenbauer…). Sie können für den Rest einen zusätzlichen Dienstleister wählen.",
    complementaryProvider: "Zusätzlicher Dienstleister",
    chooseProvider: "— Dienstleister auswählen —",
    noneOption: "Keiner (Scales nur für betroffene Kategorien)",
    scalesAck:
      "Ich werde Scales kontaktieren, um das Handling der betroffenen Kategorien zu planen",
    consent:
      "Ich stimme der Verarbeitung dieser Informationen im Rahmen der logistischen Akkreditierung der Veranstaltung zu.",
    recapExhibitor: "Aussteller:",
    recapCategories: "Kategorien:",
    recapVehicles: "Fahrzeuge:",
    recapContact: "Kontakt:",
    validate: "Akkreditierung bestätigen",
    validateHint: "Bestätigen Sie die Einwilligung",
    validateHintScales: " und die Scales-Bestätigung",
    validateHintEnd: ", um zu bestätigen.",
    successTitleOne: "Akkreditierung gespeichert!",
    successTitleMany: "Akkreditierungen gespeichert!",
    successPerVehicle: "Pro Fahrzeug wurde eine Akkreditierung erstellt. ",
    successLogisticien: "Sie sind validiert und in der Liste sichtbar.",
    successPublic:
      "Ihr Antrag wird bearbeitet und vom Veranstalter validiert. Eine Bestätigungs-E-Mail wird Ihnen zugesandt.",
    downloadNotice:
      "Sie müssen Ihre Akkreditierung (QR-Code) herunterladen und am Eingang des Geländes vorzeigen.",
    generating: "Generierung…",
    downloadCta: "Meine Akkreditierung herunterladen",
    scalesReminder:
      "Scales-Erinnerung: Vergessen Sie nicht, einen Termin mit Scales für die betroffenen Kategorien zu vereinbaren.",
    newRequest: "Neuer Antrag",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Innen Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Außen Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + Querbereich" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Nord-/Südsteg" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Tenders-Bereich (in der Nähe des Palais)",
      note: "Bereich in der Nähe des Palais — Regeln entsprechen dem Außen-Palais.",
    },
    BROKER: { label: "Broker- und Toys-Bereich" },
    SAIL: { label: "Segelbereich (Mono / Multihull)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Roher Stand",
    cleEnMain: "Schlüsselfertiger Stand / Saphir",
    bateauTerre: "Boot an Land",
    standTente: "Zeltstand",
    motoristes: "Spezifische Strukturen (Motorenbauer)",
    flotPonton: "Boot im Wasser / privater Ponton",
    tenteNuDevant: "Zeltstand / Freifläche vor dem Boot",
    nuDevant: "Freifläche vor dem Boot",
    tender: "Boot / Tender",
    tenteNuDevantSlash: "Zelt / Freifläche / vor dem Boot",
    bateauFlot: "Boot im Wasser",
    noteA:
      "Boothandling im Inneren des Palais am Dienstag, 15.09. gemäß Scales-Plan.",
    noteB: "Aufbau über Scales zwischen Sa 5.09. 16 Uhr und So 6.09. 12 Uhr.",
    noteC:
      "Für Motoren ist ein Termin mit Scales verpflichtend (Annahme 1.–2. Sep).",
    noteD: "Individueller Ankunftsplan vom Veranstalter zugesandt.",
    noteE: "Handling über Scales gemäß individuellem Plan.",
    noteF: "Individueller Plan mit Scales abzustimmen.",
    noteG: "Handling über Scales für Boote an Land verpflichtend.",
  }),
};

const es: RxT = {
  steps: {
    exhibitor: "Expositor",
    contact: "Contacto",
    delivery: "Entrega",
    pickup: "Recogida",
    manutention: "Manipulación",
  },
  exhibitor: {
    title: "Selección del expositor",
    subtitle: "Elija su empresa en la lista oficial.",
    noEventsBanner:
      "No hay ningún evento activo abierto a acreditaciones por el momento. Contacte con el organizador.",
    label: "Expositor",
    searchPlaceholder: "Buscar por nombre o número de stand…",
    loading: "Cargando expositores…",
    notFound: "No se encontró ningún expositor",
    clear: "Borrar",
    standNumber: "N.º de stand",
    selectToContinue: "Seleccione su expositor para continuar.",
    othersSector: "Otros",
  },
  contact: {
    title: "Contacto del responsable",
    subtitle: "Persona de contacto para la logística de este stand.",
    lastName: "Apellido",
    firstName: "Nombre",
    lastNamePlaceholder: "García",
    firstNamePlaceholder: "Juan",
    email: "Correo electrónico",
    emailPlaceholder: "juan.garcia@empresa.com",
    mobilePhone: "Teléfono móvil",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Campo obligatorio.",
    invalidEmail: "Correo electrónico no válido.",
    invalidPhone: "Número de teléfono no válido.",
  },
  delivery: {
    title: "Gestión de las entregas (montaje)",
    palaisIntro:
      "Su stand está en el Palais des Festivals. Indique su ubicación para mostrar las categorías.",
    interiorPalais: "Interior Palais",
    interiorPalaisDesc: "En el interior del Palais des Festivals",
    exteriorPalais: "Exterior Palais",
    exteriorPalaisDesc: "Explanada exterior (Macé, etc.)",
    spaceLabel: "Espacio:",
    instructions:
      "Marque cada categoría aplicable a su stand y, a continuación, indique la fecha, la franja horaria y el/los vehículo(s) para cada una.",
    rdvScales: "Cita Scales",
    date: "Fecha",
    chooseDate: "— Elegir una fecha —",
    slot: "Franja horaria",
    chooseSlot: "— Elegir una franja horaria —",
    chooseDateFirst: "— Elegir primero una fecha —",
    vehicles: "Vehículo(s)",
    vehiclesHint: "(tipo de vehículo obligatorio · matrícula opcional)",
    addVehicle: "+ Añadir un vehículo",
    loadingTypes: "Cargando tipos de vehículo…",
    noTypes:
      "No hay ningún tipo de vehículo configurado por el momento. Contacte con el organizador.",
    interveningCompany: "Empresa interviniente",
    interveningPlaceholder: "Transportista, decorador, proveedor…",
    vehicleType: "Tipo de vehículo",
    choose: "— Elegir —",
    plateOptional: "Matrícula (opcional)",
    removeVehicle: "Eliminar este vehículo",
    scalesMandatory: "Coordinación Scales obligatoria:",
    scalesDefault: "esta categoría requiere concertar una cita con Scales.",
    scalesContact: "Contacto:",
    validationHint:
      "Seleccione al menos una categoría con su fecha, su franja horaria y un vehículo (tipo de vehículo).",
  },
  pickup: {
    title: "Gestión de las recogidas (desmontaje)",
    emptyHint: "Configure primero sus entregas en el paso anterior.",
    intro:
      "Las categorías seleccionadas en el montaje se recogen automáticamente. Indique la fecha, la franja horaria y el vehículo de recogida para cada una.",
    pickupDate: "Fecha de recogida",
    slot: "Franja horaria",
    chooseDate: "— Elegir una fecha —",
    chooseSlot: "— Elegir una franja horaria —",
    chooseDateFirst: "— Elegir primero una fecha —",
    pickupVehicles: "Vehículos de recogida",
    deliveryVehicle: "Vehículo de entrega",
    sameVehicle: "Recogida con el mismo vehículo",
    pickupVehicleType: "Tipo de vehículo (recogida)",
    choose: "— Elegir —",
    pickupPlateOptional: "Matrícula de recogida (opcional)",
    driverPhonePickup: "Teléfono del conductor de recogida",
    lockedAria: "(bloqueado)",
    validationHint:
      "Indique la fecha, la franja horaria y los vehículos de recogida para cada categoría.",
  },
  manutention: {
    title: "Proveedor de manipulación",
    subtitle: "Empresa para la manipulación no-Scales.",
    scalesAutoNotice:
      "Scales se asignará automáticamente para las categorías marcadas que lo requieran (barcos en tierra, motoristas…). Puede elegir un proveedor complementario para el resto.",
    complementaryProvider: "Proveedor complementario",
    chooseProvider: "— Seleccione un proveedor —",
    noneOption: "Ninguno (Scales solo para las categorías afectadas)",
    scalesAck:
      "Me pondré en contacto con Scales para planificar la manipulación de las categorías afectadas",
    consent:
      "Autorizo el tratamiento de esta información en el marco de la acreditación logística del evento.",
    recapExhibitor: "Expositor:",
    recapCategories: "Categorías:",
    recapVehicles: "Vehículos:",
    recapContact: "Contacto:",
    validate: "Validar la acreditación",
    validateHint: "Confirme el consentimiento",
    validateHintScales: " y la confirmación de Scales",
    validateHintEnd: " para validar.",
    successTitleOne: "¡Acreditación guardada!",
    successTitleMany: "acreditaciones guardadas!",
    successPerVehicle: "Se ha creado una acreditación por vehículo. ",
    successLogisticien: "Están validadas y visibles en la lista.",
    successPublic:
      "Su solicitud será procesada y validada por el organizador. Se le enviará un correo de confirmación.",
    downloadNotice:
      "Debe descargar y presentar su acreditación (código QR) en la entrada del recinto.",
    generating: "Generando…",
    downloadCta: "Descargar mi acreditación",
    scalesReminder:
      "Recordatorio Scales: no olvide concertar una cita con Scales para las categorías afectadas.",
    newRequest: "Nueva solicitud",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Interior Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Exterior Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + zona transversal" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Muelle Norte / Sur" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Zona Tenders (cerca del Palais)",
      note: "Zona cerca del Palais — reglas equivalentes al Exterior Palais.",
    },
    BROKER: { label: "Zona Broker y Toys" },
    SAIL: { label: "Zona Vela (Mono / Multicasco)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Stand desnudo",
    cleEnMain: "Stand llave en mano / Saphir",
    bateauTerre: "Barco en tierra",
    standTente: "Stand bajo carpa",
    motoristes: "Estructuras específicas (motoristas)",
    flotPonton: "Barco a flote / pontón privado",
    tenteNuDevant: "Stand bajo carpa / espacio desnudo delante del barco",
    nuDevant: "Espacio desnudo delante del barco",
    tender: "Barco / Tender",
    tenteNuDevantSlash: "Carpa / espacio desnudo / delante del barco",
    bateauFlot: "Barco a flote",
    noteA:
      "Manipulación de barcos en el interior del Palais realizada el martes 15/09 según el planning de Scales.",
    noteB: "Instalación vía Scales entre sáb 5/09 16h y dom 6/09 12h.",
    noteC:
      "Para los motores, cita obligatoria con Scales (recepción 1-2 sep).",
    noteD: "Planning de llegada individual enviado por el organizador.",
    noteE: "Manipulación vía Scales según planning individual.",
    noteF: "Planning individual a coordinar con Scales.",
    noteG: "Manipulación vía Scales obligatoria para los barcos en tierra.",
  }),
};

const pt: RxT = {
  steps: {
    exhibitor: "Expositor",
    contact: "Contacto",
    delivery: "Entrega",
    pickup: "Recolha",
    manutention: "Manuseamento",
  },
  exhibitor: {
    title: "Seleção do expositor",
    subtitle: "Escolha a sua empresa na lista oficial.",
    noEventsBanner:
      "Nenhum evento ativo está aberto a acreditações de momento. Contacte o organizador.",
    label: "Expositor",
    searchPlaceholder: "Pesquisar por nome ou número de stand…",
    loading: "A carregar expositores…",
    notFound: "Nenhum expositor encontrado",
    clear: "Limpar",
    standNumber: "N.º de stand",
    selectToContinue: "Selecione o seu expositor para continuar.",
    othersSector: "Outros",
  },
  contact: {
    title: "Contacto do responsável",
    subtitle: "Pessoa a contactar para a logística deste stand.",
    lastName: "Apelido",
    firstName: "Nome próprio",
    lastNamePlaceholder: "Silva",
    firstNamePlaceholder: "João",
    email: "Endereço de e-mail",
    emailPlaceholder: "joao.silva@empresa.com",
    mobilePhone: "Telemóvel",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Campo obrigatório.",
    invalidEmail: "Endereço de e-mail inválido.",
    invalidPhone: "Número de telefone inválido.",
  },
  delivery: {
    title: "Gestão das entregas (montagem)",
    palaisIntro:
      "O seu stand está no Palais des Festivals. Indique a sua localização para mostrar as categorias.",
    interiorPalais: "Interior Palais",
    interiorPalaisDesc: "No interior do Palais des Festivals",
    exteriorPalais: "Exterior Palais",
    exteriorPalaisDesc: "Esplanada exterior (Macé, etc.)",
    spaceLabel: "Espaço:",
    instructions:
      "Assinale cada categoria aplicável ao seu stand e indique a data, o intervalo de tempo e o(s) veículo(s) para cada uma.",
    rdvScales: "Marcação Scales",
    date: "Data",
    chooseDate: "— Escolher uma data —",
    slot: "Intervalo de tempo",
    chooseSlot: "— Escolher um intervalo —",
    chooseDateFirst: "— Escolher primeiro uma data —",
    vehicles: "Veículo(s)",
    vehiclesHint: "(tipo de veículo obrigatório · matrícula opcional)",
    addVehicle: "+ Adicionar um veículo",
    loadingTypes: "A carregar tipos de veículo…",
    noTypes:
      "Nenhum tipo de veículo configurado de momento. Contacte o organizador.",
    interveningCompany: "Empresa interveniente",
    interveningPlaceholder: "Transportador, decorador, prestador…",
    vehicleType: "Tipo de veículo",
    choose: "— Escolher —",
    plateOptional: "Matrícula (opcional)",
    removeVehicle: "Remover este veículo",
    scalesMandatory: "Coordenação Scales obrigatória:",
    scalesDefault: "esta categoria exige a marcação de uma reunião com a Scales.",
    scalesContact: "Contacto:",
    validationHint:
      "Selecione pelo menos uma categoria com a sua data, o seu intervalo e um veículo (tipo de veículo).",
  },
  pickup: {
    title: "Gestão das recolhas (desmontagem)",
    emptyHint: "Configure primeiro as suas entregas no passo anterior.",
    intro:
      "As categorias selecionadas na montagem são recolhidas automaticamente. Indique a data, o intervalo e o veículo de recolha para cada uma.",
    pickupDate: "Data de recolha",
    slot: "Intervalo de tempo",
    chooseDate: "— Escolher uma data —",
    chooseSlot: "— Escolher um intervalo —",
    chooseDateFirst: "— Escolher primeiro uma data —",
    pickupVehicles: "Veículos de recolha",
    deliveryVehicle: "Veículo de entrega",
    sameVehicle: "Recolha com o mesmo veículo",
    pickupVehicleType: "Tipo de veículo (recolha)",
    choose: "— Escolher —",
    pickupPlateOptional: "Matrícula de recolha (opcional)",
    driverPhonePickup: "Telefone do condutor de recolha",
    lockedAria: "(bloqueado)",
    validationHint:
      "Indique a data, o intervalo e os veículos de recolha para cada categoria.",
  },
  manutention: {
    title: "Prestador de manuseamento",
    subtitle: "Empresa para o manuseamento não-Scales.",
    scalesAutoNotice:
      "A Scales será automaticamente atribuída para as categorias assinaladas que o exijam (barcos em terra, motoristas…). Pode escolher um prestador complementar para o resto.",
    complementaryProvider: "Prestador complementar",
    chooseProvider: "— Selecione um prestador —",
    noneOption: "Nenhum (Scales apenas para as categorias em causa)",
    scalesAck:
      "Entrarei em contacto com a Scales para planear o manuseamento das categorias em causa",
    consent:
      "Autorizo o tratamento destas informações no âmbito da acreditação logística do evento.",
    recapExhibitor: "Expositor:",
    recapCategories: "Categorias:",
    recapVehicles: "Veículos:",
    recapContact: "Contacto:",
    validate: "Validar a acreditação",
    validateHint: "Confirme o consentimento",
    validateHintScales: " e a confirmação Scales",
    validateHintEnd: " para validar.",
    successTitleOne: "Acreditação guardada!",
    successTitleMany: "acreditações guardadas!",
    successPerVehicle: "Foi criada uma acreditação por veículo. ",
    successLogisticien: "Estão validadas e visíveis na lista.",
    successPublic:
      "O seu pedido será processado e validado pelo organizador. Ser-lhe-á enviado um e-mail de confirmação.",
    downloadNotice:
      "Deve descarregar e apresentar a sua acreditação (código QR) à entrada do recinto.",
    generating: "A gerar…",
    downloadCta: "Descarregar a minha acreditação",
    scalesReminder:
      "Lembrete Scales: não se esqueça de marcar uma reunião com a Scales para as categorias em causa.",
    newRequest: "Novo pedido",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Interior Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Exterior Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + zona transversal" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Cais Norte / Sul" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Zona Tenders (perto do Palais)",
      note: "Zona perto do Palais — regras equivalentes ao Exterior Palais.",
    },
    BROKER: { label: "Zona Broker e Toys" },
    SAIL: { label: "Zona Vela (Mono / Multicasco)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Stand vazio",
    cleEnMain: "Stand chave na mão / Saphir",
    bateauTerre: "Barco em terra",
    standTente: "Stand em tenda",
    motoristes: "Estruturas específicas (motoristas)",
    flotPonton: "Barco a flutuar / pontão privativo",
    tenteNuDevant: "Stand em tenda / espaço vazio em frente ao barco",
    nuDevant: "Espaço vazio em frente ao barco",
    tender: "Barco / Tender",
    tenteNuDevantSlash: "Tenda / espaço vazio / em frente ao barco",
    bateauFlot: "Barco a flutuar",
    noteA:
      "Manuseamento de barcos no interior do Palais realizado na terça-feira 15/09 segundo o planeamento Scales.",
    noteB: "Instalação via Scales entre sáb 5/09 16h e dom 6/09 12h.",
    noteC:
      "Para os motores, marcação obrigatória com a Scales (receção 1-2 set).",
    noteD: "Planeamento de chegada individual enviado pelo organizador.",
    noteE: "Manuseamento via Scales segundo planeamento individual.",
    noteF: "Planeamento individual a coordenar com a Scales.",
    noteG: "Manuseamento via Scales obrigatório para os barcos em terra.",
  }),
};

const it: RxT = {
  steps: {
    exhibitor: "Espositore",
    contact: "Contatto",
    delivery: "Consegna",
    pickup: "Ritiro",
    manutention: "Movimentazione",
  },
  exhibitor: {
    title: "Selezione dell'espositore",
    subtitle: "Scegli la tua azienda dall'elenco ufficiale.",
    noEventsBanner:
      "Nessun evento attivo è aperto agli accreditamenti al momento. Contatta l'organizzatore.",
    label: "Espositore",
    searchPlaceholder: "Cerca per nome o numero di stand…",
    loading: "Caricamento espositori…",
    notFound: "Nessun espositore trovato",
    clear: "Cancella",
    standNumber: "N. stand",
    selectToContinue: "Seleziona il tuo espositore per continuare.",
    othersSector: "Altri",
  },
  contact: {
    title: "Contatto del responsabile",
    subtitle: "Persona da contattare per la logistica di questo stand.",
    lastName: "Cognome",
    firstName: "Nome",
    lastNamePlaceholder: "Rossi",
    firstNamePlaceholder: "Mario",
    email: "Indirizzo e-mail",
    emailPlaceholder: "mario.rossi@azienda.com",
    mobilePhone: "Telefono cellulare",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Campo obbligatorio.",
    invalidEmail: "Indirizzo e-mail non valido.",
    invalidPhone: "Numero di telefono non valido.",
  },
  delivery: {
    title: "Gestione delle consegne (allestimento)",
    palaisIntro:
      "Il tuo stand è nel Palais des Festivals. Indica la sua posizione per visualizzare le categorie.",
    interiorPalais: "Interno Palais",
    interiorPalaisDesc: "All'interno del Palais des Festivals",
    exteriorPalais: "Esterno Palais",
    exteriorPalaisDesc: "Spianata esterna (Macé, ecc.)",
    spaceLabel: "Spazio:",
    instructions:
      "Seleziona ogni categoria applicabile al tuo stand, poi indica la data, la fascia oraria e il/i veicolo/i per ciascuna.",
    rdvScales: "Appuntamento Scales",
    date: "Data",
    chooseDate: "— Scegli una data —",
    slot: "Fascia oraria",
    chooseSlot: "— Scegli una fascia oraria —",
    chooseDateFirst: "— Scegli prima una data —",
    vehicles: "Veicolo/i",
    vehiclesHint: "(tipo di veicolo obbligatorio · targa facoltativa)",
    addVehicle: "+ Aggiungi un veicolo",
    loadingTypes: "Caricamento tipi di veicolo…",
    noTypes:
      "Nessun tipo di veicolo configurato al momento. Contatta l'organizzatore.",
    interveningCompany: "Azienda incaricata",
    interveningPlaceholder: "Trasportatore, decoratore, fornitore…",
    vehicleType: "Tipo di veicolo",
    choose: "— Scegli —",
    plateOptional: "Targa (facoltativa)",
    removeVehicle: "Rimuovi questo veicolo",
    scalesMandatory: "Coordinamento Scales obbligatorio:",
    scalesDefault: "questa categoria richiede la prenotazione di un appuntamento con Scales.",
    scalesContact: "Contatto:",
    validationHint:
      "Seleziona almeno una categoria con la sua data, la sua fascia oraria e un veicolo (tipo di veicolo).",
  },
  pickup: {
    title: "Gestione dei ritiri (smontaggio)",
    emptyHint: "Configura prima le tue consegne nel passaggio precedente.",
    intro:
      "Le categorie selezionate durante l'allestimento vengono ritirate automaticamente. Indica la data, la fascia oraria e il veicolo di ritiro per ciascuna.",
    pickupDate: "Data di ritiro",
    slot: "Fascia oraria",
    chooseDate: "— Scegli una data —",
    chooseSlot: "— Scegli una fascia oraria —",
    chooseDateFirst: "— Scegli prima una data —",
    pickupVehicles: "Veicoli di ritiro",
    deliveryVehicle: "Veicolo di consegna",
    sameVehicle: "Ritiro con lo stesso veicolo",
    pickupVehicleType: "Tipo di veicolo (ritiro)",
    choose: "— Scegli —",
    pickupPlateOptional: "Targa di ritiro (facoltativa)",
    driverPhonePickup: "Telefono conducente ritiro",
    lockedAria: "(bloccato)",
    validationHint:
      "Indica la data, la fascia oraria e i veicoli di ritiro per ogni categoria.",
  },
  manutention: {
    title: "Fornitore di movimentazione",
    subtitle: "Azienda per la movimentazione non-Scales.",
    scalesAutoNotice:
      "Scales sarà assegnato automaticamente per le categorie selezionate che lo richiedono (barche a terra, motoristi…). Puoi scegliere un fornitore complementare per il resto.",
    complementaryProvider: "Fornitore complementare",
    chooseProvider: "— Seleziona un fornitore —",
    noneOption: "Nessuno (Scales solo per le categorie interessate)",
    scalesAck:
      "Contatterò Scales per pianificare la movimentazione delle categorie interessate",
    consent:
      "Autorizzo il trattamento di queste informazioni nell'ambito dell'accreditamento logistico dell'evento.",
    recapExhibitor: "Espositore:",
    recapCategories: "Categorie:",
    recapVehicles: "Veicoli:",
    recapContact: "Contatto:",
    validate: "Convalida l'accreditamento",
    validateHint: "Conferma il consenso",
    validateHintScales: " e la conferma Scales",
    validateHintEnd: " per convalidare.",
    successTitleOne: "Accreditamento salvato!",
    successTitleMany: "accreditamenti salvati!",
    successPerVehicle: "È stato creato un accreditamento per veicolo. ",
    successLogisticien: "Sono convalidati e visibili nell'elenco.",
    successPublic:
      "La tua richiesta sarà elaborata e convalidata dall'organizzatore. Ti sarà inviata un'e-mail di conferma.",
    downloadNotice:
      "Devi scaricare e presentare il tuo accreditamento (codice QR) all'ingresso del sito.",
    generating: "Generazione…",
    downloadCta: "Scarica il mio accreditamento",
    scalesReminder:
      "Promemoria Scales: non dimenticare di prenotare un appuntamento con Scales per le categorie interessate.",
    newRequest: "Nuova richiesta",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Interno Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Esterno Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + zona trasversale" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Molo Nord / Sud" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Zona Tenders (vicino al Palais)",
      note: "Zona vicino al Palais — regole equivalenti all'Esterno Palais.",
    },
    BROKER: { label: "Zona Broker e Toys" },
    SAIL: { label: "Zona Vela (Mono / Multiscafo)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Stand grezzo",
    cleEnMain: "Stand chiavi in mano / Saphir",
    bateauTerre: "Barca a terra",
    standTente: "Stand sotto tenda",
    motoristes: "Strutture specifiche (motoristi)",
    flotPonton: "Barca a galla / pontile privato",
    tenteNuDevant: "Stand sotto tenda / spazio grezzo davanti alla barca",
    nuDevant: "Spazio grezzo davanti alla barca",
    tender: "Barca / Tender",
    tenteNuDevantSlash: "Tenda / spazio grezzo / davanti alla barca",
    bateauFlot: "Barca a galla",
    noteA:
      "Movimentazione barche interno Palais effettuata martedì 15/09 secondo la pianificazione Scales.",
    noteB: "Allestimento tramite Scales tra sab 5/09 16:00 e dom 6/09 12:00.",
    noteC:
      "Per i motori, appuntamento obbligatorio con Scales (ricezione 1-2 set).",
    noteD: "Pianificazione di arrivo individuale inviata dall'organizzatore.",
    noteE: "Movimentazione tramite Scales secondo pianificazione individuale.",
    noteF: "Pianificazione individuale da coordinare con Scales.",
    noteG: "Movimentazione tramite Scales obbligatoria per le barche a terra.",
  }),
};

const pl: RxT = {
  steps: {
    exhibitor: "Wystawca",
    contact: "Kontakt",
    delivery: "Dostawa",
    pickup: "Odbiór",
    manutention: "Obsługa",
  },
  exhibitor: {
    title: "Wybór wystawcy",
    subtitle: "Wybierz swoją firmę z oficjalnej listy.",
    noEventsBanner:
      "Obecnie żadne aktywne wydarzenie nie jest otwarte na akredytacje. Skontaktuj się z organizatorem.",
    label: "Wystawca",
    searchPlaceholder: "Szukaj po nazwie lub numerze stoiska…",
    loading: "Ładowanie wystawców…",
    notFound: "Nie znaleziono wystawcy",
    clear: "Wyczyść",
    standNumber: "Nr stoiska",
    selectToContinue: "Wybierz swojego wystawcę, aby kontynuować.",
    othersSector: "Inne",
  },
  contact: {
    title: "Kontakt osoby odpowiedzialnej",
    subtitle: "Osoba do kontaktu w sprawie logistyki tego stoiska.",
    lastName: "Nazwisko",
    firstName: "Imię",
    lastNamePlaceholder: "Kowalski",
    firstNamePlaceholder: "Jan",
    email: "Adres e-mail",
    emailPlaceholder: "jan.kowalski@firma.com",
    mobilePhone: "Telefon komórkowy",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Pole obowiązkowe.",
    invalidEmail: "Nieprawidłowy adres e-mail.",
    invalidPhone: "Nieprawidłowy numer telefonu.",
  },
  delivery: {
    title: "Zarządzanie dostawami (montaż)",
    palaisIntro:
      "Twoje stoisko znajduje się w Palais des Festivals. Podaj jego lokalizację, aby wyświetlić kategorie.",
    interiorPalais: "Wewnątrz Palais",
    interiorPalaisDesc: "Wewnątrz Palais des Festivals",
    exteriorPalais: "Na zewnątrz Palais",
    exteriorPalaisDesc: "Esplanada zewnętrzna (Macé itp.)",
    spaceLabel: "Strefa:",
    instructions:
      "Zaznacz każdą kategorię dotyczącą Twojego stoiska, a następnie podaj datę, przedział czasowy i pojazd(y) dla każdej.",
    rdvScales: "Spotkanie Scales",
    date: "Data",
    chooseDate: "— Wybierz datę —",
    slot: "Przedział czasowy",
    chooseSlot: "— Wybierz przedział —",
    chooseDateFirst: "— Najpierw wybierz datę —",
    vehicles: "Pojazd(y)",
    vehiclesHint: "(typ pojazdu wymagany · tablica opcjonalna)",
    addVehicle: "+ Dodaj pojazd",
    loadingTypes: "Ładowanie typów pojazdów…",
    noTypes:
      "Obecnie nie skonfigurowano żadnego typu pojazdu. Skontaktuj się z organizatorem.",
    interveningCompany: "Firma wykonawcza",
    interveningPlaceholder: "Przewoźnik, dekorator, dostawca…",
    vehicleType: "Typ pojazdu",
    choose: "— Wybierz —",
    plateOptional: "Tablica (opcjonalna)",
    removeVehicle: "Usuń ten pojazd",
    scalesMandatory: "Obowiązkowa koordynacja Scales:",
    scalesDefault: "ta kategoria wymaga umówienia spotkania ze Scales.",
    scalesContact: "Kontakt:",
    validationHint:
      "Wybierz co najmniej jedną kategorię z datą, przedziałem czasowym i pojazdem (typ pojazdu).",
  },
  pickup: {
    title: "Zarządzanie odbiorami (demontaż)",
    emptyHint: "Najpierw skonfiguruj dostawy w poprzednim kroku.",
    intro:
      "Kategorie wybrane podczas montażu są odbierane automatycznie. Podaj datę, przedział czasowy i pojazd odbioru dla każdej.",
    pickupDate: "Data odbioru",
    slot: "Przedział czasowy",
    chooseDate: "— Wybierz datę —",
    chooseSlot: "— Wybierz przedział —",
    chooseDateFirst: "— Najpierw wybierz datę —",
    pickupVehicles: "Pojazdy odbioru",
    deliveryVehicle: "Pojazd dostawy",
    sameVehicle: "Odbiór tym samym pojazdem",
    pickupVehicleType: "Typ pojazdu (odbiór)",
    choose: "— Wybierz —",
    pickupPlateOptional: "Tablica odbioru (opcjonalna)",
    driverPhonePickup: "Telefon kierowcy odbioru",
    lockedAria: "(zablokowane)",
    validationHint:
      "Podaj datę, przedział czasowy i pojazdy odbioru dla każdej kategorii.",
  },
  manutention: {
    title: "Dostawca obsługi",
    subtitle: "Firma do obsługi spoza Scales.",
    scalesAutoNotice:
      "Scales zostanie automatycznie przypisany do zaznaczonych kategorii, które tego wymagają (łodzie na lądzie, producenci silników…). Dla pozostałych możesz wybrać dodatkowego dostawcę.",
    complementaryProvider: "Dodatkowy dostawca",
    chooseProvider: "— Wybierz dostawcę —",
    noneOption: "Brak (Scales tylko dla odpowiednich kategorii)",
    scalesAck:
      "Skontaktuję się ze Scales, aby zaplanować obsługę odpowiednich kategorii",
    consent:
      "Wyrażam zgodę na przetwarzanie tych informacji w ramach akredytacji logistycznej wydarzenia.",
    recapExhibitor: "Wystawca:",
    recapCategories: "Kategorie:",
    recapVehicles: "Pojazdy:",
    recapContact: "Kontakt:",
    validate: "Zatwierdź akredytację",
    validateHint: "Potwierdź zgodę",
    validateHintScales: " i potwierdzenie Scales",
    validateHintEnd: ", aby zatwierdzić.",
    successTitleOne: "Akredytacja zapisana!",
    successTitleMany: "akredytacji zapisanych!",
    successPerVehicle: "Utworzono jedną akredytację na pojazd. ",
    successLogisticien: "Są zatwierdzone i widoczne na liście.",
    successPublic:
      "Twój wniosek zostanie przetworzony i zatwierdzony przez organizatora. Otrzymasz e-mail z potwierdzeniem.",
    downloadNotice:
      "Musisz pobrać i okazać swoją akredytację (kod QR) przy wejściu na teren.",
    generating: "Generowanie…",
    downloadCta: "Pobierz moją akredytację",
    scalesReminder:
      "Przypomnienie Scales: nie zapomnij umówić spotkania ze Scales dla odpowiednich kategorii.",
    newRequest: "Nowy wniosek",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Wewnątrz Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Na zewnątrz Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + strefa przejściowa" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Molo Północne / Południowe" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Strefa Tenders (blisko Palais)",
      note: "Strefa blisko Palais — zasady równoważne ze strefą zewnętrzną Palais.",
    },
    BROKER: { label: "Strefa Broker i Toys" },
    SAIL: { label: "Strefa Żeglarska (Mono / Wielokadłubowiec)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Stoisko surowe",
    cleEnMain: "Stoisko pod klucz / Saphir",
    bateauTerre: "Łódź na lądzie",
    standTente: "Stoisko w namiocie",
    motoristes: "Specyficzne konstrukcje (producenci silników)",
    flotPonton: "Łódź na wodzie / prywatny ponton",
    tenteNuDevant: "Stoisko w namiocie / wolna przestrzeń przed łodzią",
    nuDevant: "Wolna przestrzeń przed łodzią",
    tender: "Łódź / Tender",
    tenteNuDevantSlash: "Namiot / wolna przestrzeń / przed łodzią",
    bateauFlot: "Łódź na wodzie",
    noteA:
      "Obsługa łodzi wewnątrz Palais realizowana we wtorek 15/09 zgodnie z harmonogramem Scales.",
    noteB: "Montaż przez Scales między sob. 5/09 16:00 a niedz. 6/09 12:00.",
    noteC:
      "W przypadku silników obowiązkowe spotkanie ze Scales (przyjęcie 1-2 wrz).",
    noteD: "Indywidualny harmonogram przyjazdu wysłany przez organizatora.",
    noteE: "Obsługa przez Scales zgodnie z indywidualnym harmonogramem.",
    noteF: "Indywidualny harmonogram do uzgodnienia ze Scales.",
    noteG: "Obsługa przez Scales obowiązkowa dla łodzi na lądzie.",
  }),
};

const cs: RxT = {
  steps: {
    exhibitor: "Vystavovatel",
    contact: "Kontakt",
    delivery: "Dodávka",
    pickup: "Odvoz",
    manutention: "Manipulace",
  },
  exhibitor: {
    title: "Výběr vystavovatele",
    subtitle: "Vyberte svou společnost z oficiálního seznamu.",
    noEventsBanner:
      "Momentálně není žádná aktivní událost otevřená pro akreditace. Kontaktujte organizátora.",
    label: "Vystavovatel",
    searchPlaceholder: "Hledat podle názvu nebo čísla stánku…",
    loading: "Načítání vystavovatelů…",
    notFound: "Žádný vystavovatel nenalezen",
    clear: "Vymazat",
    standNumber: "Č. stánku",
    selectToContinue: "Vyberte svého vystavovatele pro pokračování.",
    othersSector: "Ostatní",
  },
  contact: {
    title: "Kontakt odpovědné osoby",
    subtitle: "Osoba ke kontaktu ohledně logistiky tohoto stánku.",
    lastName: "Příjmení",
    firstName: "Jméno",
    lastNamePlaceholder: "Novák",
    firstNamePlaceholder: "Jan",
    email: "E-mailová adresa",
    emailPlaceholder: "jan.novak@firma.com",
    mobilePhone: "Mobilní telefon",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Povinné pole.",
    invalidEmail: "Neplatná e-mailová adresa.",
    invalidPhone: "Neplatné telefonní číslo.",
  },
  delivery: {
    title: "Správa dodávek (montáž)",
    palaisIntro:
      "Váš stánek je v Palais des Festivals. Upřesněte jeho umístění pro zobrazení kategorií.",
    interiorPalais: "Vnitřní Palais",
    interiorPalaisDesc: "Uvnitř Palais des Festivals",
    exteriorPalais: "Vnější Palais",
    exteriorPalaisDesc: "Venkovní esplanáda (Macé atd.)",
    spaceLabel: "Prostor:",
    instructions:
      "Zaškrtněte každou kategorii platnou pro váš stánek a poté zadejte datum, časové okno a vozidlo/vozidla pro každou.",
    rdvScales: "Schůzka Scales",
    date: "Datum",
    chooseDate: "— Vyberte datum —",
    slot: "Časové okno",
    chooseSlot: "— Vyberte časové okno —",
    chooseDateFirst: "— Nejprve vyberte datum —",
    vehicles: "Vozidlo/a",
    vehiclesHint: "(typ vozidla povinný · SPZ nepovinná)",
    addVehicle: "+ Přidat vozidlo",
    loadingTypes: "Načítání typů vozidel…",
    noTypes:
      "Momentálně není nakonfigurován žádný typ vozidla. Kontaktujte organizátora.",
    interveningCompany: "Zajišťující společnost",
    interveningPlaceholder: "Dopravce, dekoratér, poskytovatel…",
    vehicleType: "Typ vozidla",
    choose: "— Vyberte —",
    plateOptional: "SPZ (nepovinná)",
    removeVehicle: "Odebrat toto vozidlo",
    scalesMandatory: "Povinná koordinace Scales:",
    scalesDefault: "tato kategorie vyžaduje sjednání schůzky se Scales.",
    scalesContact: "Kontakt:",
    validationHint:
      "Vyberte alespoň jednu kategorii s datem, časovým oknem a vozidlem (typ vozidla).",
  },
  pickup: {
    title: "Správa odvozů (demontáž)",
    emptyHint: "Nejprve nakonfigurujte své dodávky v předchozím kroku.",
    intro:
      "Kategorie vybrané při montáži jsou odvezeny automaticky. Zadejte datum, časové okno a vozidlo odvozu pro každou.",
    pickupDate: "Datum odvozu",
    slot: "Časové okno",
    chooseDate: "— Vyberte datum —",
    chooseSlot: "— Vyberte časové okno —",
    chooseDateFirst: "— Nejprve vyberte datum —",
    pickupVehicles: "Vozidla odvozu",
    deliveryVehicle: "Vozidlo dodávky",
    sameVehicle: "Odvoz stejným vozidlem",
    pickupVehicleType: "Typ vozidla (odvoz)",
    choose: "— Vyberte —",
    pickupPlateOptional: "SPZ odvozu (nepovinná)",
    driverPhonePickup: "Telefon řidiče odvozu",
    lockedAria: "(uzamčeno)",
    validationHint:
      "Zadejte datum, časové okno a vozidla odvozu pro každou kategorii.",
  },
  manutention: {
    title: "Poskytovatel manipulace",
    subtitle: "Společnost pro manipulaci mimo Scales.",
    scalesAutoNotice:
      "Scales bude automaticky přiřazen pro zaškrtnuté kategorie, které to vyžadují (lodě na souši, výrobci motorů…). Pro zbytek můžete vybrat doplňkového poskytovatele.",
    complementaryProvider: "Doplňkový poskytovatel",
    chooseProvider: "— Vyberte poskytovatele —",
    noneOption: "Žádný (Scales pouze pro dotčené kategorie)",
    scalesAck:
      "Kontaktuji Scales za účelem naplánování manipulace dotčených kategorií",
    consent:
      "Souhlasím se zpracováním těchto informací v rámci logistické akreditace události.",
    recapExhibitor: "Vystavovatel:",
    recapCategories: "Kategorie:",
    recapVehicles: "Vozidla:",
    recapContact: "Kontakt:",
    validate: "Potvrdit akreditaci",
    validateHint: "Potvrďte souhlas",
    validateHintScales: " a potvrzení Scales",
    validateHintEnd: " pro potvrzení.",
    successTitleOne: "Akreditace uložena!",
    successTitleMany: "akreditací uloženo!",
    successPerVehicle: "Pro každé vozidlo byla vytvořena jedna akreditace. ",
    successLogisticien: "Jsou ověřené a viditelné v seznamu.",
    successPublic:
      "Vaše žádost bude zpracována a ověřena organizátorem. Bude vám zaslán potvrzovací e-mail.",
    downloadNotice:
      "Musíte si stáhnout a předložit svou akreditaci (QR kód) u vchodu na místo.",
    generating: "Generování…",
    downloadCta: "Stáhnout mou akreditaci",
    scalesReminder:
      "Připomínka Scales: nezapomeňte si domluvit schůzku se Scales pro dotčené kategorie.",
    newRequest: "Nová žádost",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Vnitřní Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Vnější Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + průchozí zóna" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Severní / Jižní molo" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Zóna Tenders (poblíž Palais)",
      note: "Zóna poblíž Palais — pravidla shodná s vnějším Palais.",
    },
    BROKER: { label: "Zóna Broker a Toys" },
    SAIL: { label: "Plachetní zóna (Mono / Vícetrupá)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Holý stánek",
    cleEnMain: "Stánek na klíč / Saphir",
    bateauTerre: "Loď na souši",
    standTente: "Stánek ve stanu",
    motoristes: "Specifické konstrukce (výrobci motorů)",
    flotPonton: "Loď na vodě / soukromý ponton",
    tenteNuDevant: "Stánek ve stanu / volný prostor před lodí",
    nuDevant: "Volný prostor před lodí",
    tender: "Loď / Tender",
    tenteNuDevantSlash: "Stan / volný prostor / před lodí",
    bateauFlot: "Loď na vodě",
    noteA:
      "Manipulace s loděmi uvnitř Palais provedena v úterý 15/09 podle plánu Scales.",
    noteB: "Instalace přes Scales mezi so 5/09 16:00 a ne 6/09 12:00.",
    noteC:
      "U motorů je povinná schůzka se Scales (příjem 1.–2. zář).",
    noteD: "Individuální plán příjezdu zaslaný organizátorem.",
    noteE: "Manipulace přes Scales podle individuálního plánu.",
    noteF: "Individuální plán ke koordinaci se Scales.",
    noteG: "Manipulace přes Scales povinná pro lodě na souši.",
  }),
};

const lt: RxT = {
  steps: {
    exhibitor: "Dalyvis",
    contact: "Kontaktas",
    delivery: "Pristatymas",
    pickup: "Išvežimas",
    manutention: "Tvarkymas",
  },
  exhibitor: {
    title: "Dalyvio pasirinkimas",
    subtitle: "Pasirinkite savo įmonę iš oficialaus sąrašo.",
    noEventsBanner:
      "Šiuo metu nėra aktyvaus renginio, atviro akreditacijoms. Susisiekite su organizatoriumi.",
    label: "Dalyvis",
    searchPlaceholder: "Ieškoti pagal pavadinimą ar stendo numerį…",
    loading: "Įkeliami dalyviai…",
    notFound: "Dalyvių nerasta",
    clear: "Išvalyti",
    standNumber: "Stendo nr.",
    selectToContinue: "Pasirinkite savo dalyvį, kad galėtumėte tęsti.",
    othersSector: "Kiti",
  },
  contact: {
    title: "Atsakingo asmens kontaktas",
    subtitle: "Asmuo, į kurį kreiptis dėl šio stendo logistikos.",
    lastName: "Pavardė",
    firstName: "Vardas",
    lastNamePlaceholder: "Kazlauskas",
    firstNamePlaceholder: "Jonas",
    email: "El. pašto adresas",
    emailPlaceholder: "jonas.kazlauskas@imone.com",
    mobilePhone: "Mobilusis telefonas",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Privalomas laukas.",
    invalidEmail: "Neteisingas el. pašto adresas.",
    invalidPhone: "Neteisingas telefono numeris.",
  },
  delivery: {
    title: "Pristatymų valdymas (montavimas)",
    palaisIntro:
      "Jūsų stendas yra Palais des Festivals. Nurodykite jo vietą, kad būtų rodomos kategorijos.",
    interiorPalais: "Palais viduje",
    interiorPalaisDesc: "Palais des Festivals viduje",
    exteriorPalais: "Palais išorėje",
    exteriorPalaisDesc: "Išorinė esplanada (Macé ir kt.)",
    spaceLabel: "Zona:",
    instructions:
      "Pažymėkite kiekvieną jūsų stendui taikomą kategoriją, tada nurodykite datą, laiko tarpą ir transporto priemonę(-es) kiekvienai.",
    rdvScales: "Scales susitikimas",
    date: "Data",
    chooseDate: "— Pasirinkite datą —",
    slot: "Laiko tarpas",
    chooseSlot: "— Pasirinkite laiko tarpą —",
    chooseDateFirst: "— Pirmiausia pasirinkite datą —",
    vehicles: "Transporto priemonė(-s)",
    vehiclesHint: "(transporto priemonės tipas privalomas · numeris neprivalomas)",
    addVehicle: "+ Pridėti transporto priemonę",
    loadingTypes: "Įkeliami transporto priemonių tipai…",
    noTypes:
      "Šiuo metu nesukonfigūruotas joks transporto priemonės tipas. Susisiekite su organizatoriumi.",
    interveningCompany: "Vykdančioji įmonė",
    interveningPlaceholder: "Vežėjas, dekoratorius, paslaugų teikėjas…",
    vehicleType: "Transporto priemonės tipas",
    choose: "— Pasirinkite —",
    plateOptional: "Numeris (neprivalomas)",
    removeVehicle: "Pašalinti šią transporto priemonę",
    scalesMandatory: "Privalomas Scales koordinavimas:",
    scalesDefault: "ši kategorija reikalauja susitikimo su Scales rezervavimo.",
    scalesContact: "Kontaktas:",
    validationHint:
      "Pasirinkite bent vieną kategoriją su data, laiko tarpu ir transporto priemone (transporto priemonės tipu).",
  },
  pickup: {
    title: "Išvežimų valdymas (išmontavimas)",
    emptyHint: "Pirmiausia sukonfigūruokite pristatymus ankstesniame žingsnyje.",
    intro:
      "Montavimo metu pasirinktos kategorijos išvežamos automatiškai. Nurodykite datą, laiko tarpą ir išvežimo transporto priemonę kiekvienai.",
    pickupDate: "Išvežimo data",
    slot: "Laiko tarpas",
    chooseDate: "— Pasirinkite datą —",
    chooseSlot: "— Pasirinkite laiko tarpą —",
    chooseDateFirst: "— Pirmiausia pasirinkite datą —",
    pickupVehicles: "Išvežimo transporto priemonės",
    deliveryVehicle: "Pristatymo transporto priemonė",
    sameVehicle: "Išvežimas ta pačia transporto priemone",
    pickupVehicleType: "Transporto priemonės tipas (išvežimas)",
    choose: "— Pasirinkite —",
    pickupPlateOptional: "Išvežimo numeris (neprivalomas)",
    driverPhonePickup: "Išvežimo vairuotojo telefonas",
    lockedAria: "(užrakinta)",
    validationHint:
      "Nurodykite datą, laiko tarpą ir išvežimo transporto priemones kiekvienai kategorijai.",
  },
  manutention: {
    title: "Tvarkymo paslaugų teikėjas",
    subtitle: "Įmonė ne Scales tvarkymui.",
    scalesAutoNotice:
      "Scales bus automatiškai priskirtas pažymėtoms kategorijoms, kurioms to reikia (laivai sausumoje, variklių gamintojai…). Likusioms galite pasirinkti papildomą teikėją.",
    complementaryProvider: "Papildomas teikėjas",
    chooseProvider: "— Pasirinkite teikėją —",
    noneOption: "Nėra (Scales tik atitinkamoms kategorijoms)",
    scalesAck:
      "Susisieksiu su Scales, kad suplanuočiau atitinkamų kategorijų tvarkymą",
    consent:
      "Sutinku, kad ši informacija būtų tvarkoma renginio logistikos akreditacijos tikslais.",
    recapExhibitor: "Dalyvis:",
    recapCategories: "Kategorijos:",
    recapVehicles: "Transporto priemonės:",
    recapContact: "Kontaktas:",
    validate: "Patvirtinti akreditaciją",
    validateHint: "Patvirtinkite sutikimą",
    validateHintScales: " ir Scales patvirtinimą",
    validateHintEnd: ", kad patvirtintumėte.",
    successTitleOne: "Akreditacija išsaugota!",
    successTitleMany: "akreditacijos išsaugotos!",
    successPerVehicle: "Kiekvienai transporto priemonei sukurta po akreditaciją. ",
    successLogisticien: "Jos patvirtintos ir matomos sąraše.",
    successPublic:
      "Jūsų prašymas bus apdorotas ir patvirtintas organizatoriaus. Jums bus išsiųstas patvirtinimo el. laiškas.",
    downloadNotice:
      "Turite atsisiųsti ir pateikti savo akreditaciją (QR kodą) prie įėjimo į teritoriją.",
    generating: "Generuojama…",
    downloadCta: "Atsisiųsti mano akreditaciją",
    scalesReminder:
      "Scales priminimas: nepamirškite rezervuoti susitikimo su Scales atitinkamoms kategorijoms.",
    newRequest: "Naujas prašymas",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Palais des Festivals vidus" },
    EXTERIEUR_PALAIS: { label: "Palais des Festivals išorė" },
    QML: { label: "Quai Max Laubeuf (QML) + pereinamoji zona" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Šiaurinis / Pietinis molas" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Tenders zona (netoli Palais)",
      note: "Zona netoli Palais — taisyklės atitinka Palais išorę.",
    },
    BROKER: { label: "Broker ir Toys zona" },
    SAIL: { label: "Burlaivių zona (Mono / Daugiakorpusiai)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Tuščias stendas",
    cleEnMain: "Stendas „raktas į rankas“ / Saphir",
    bateauTerre: "Laivas sausumoje",
    standTente: "Stendas palapinėje",
    motoristes: "Specifinės konstrukcijos (variklių gamintojai)",
    flotPonton: "Laivas vandenyje / privatus pontonas",
    tenteNuDevant: "Stendas palapinėje / tuščia erdvė priešais laivą",
    nuDevant: "Tuščia erdvė priešais laivą",
    tender: "Laivas / Tender",
    tenteNuDevantSlash: "Palapinė / tuščia erdvė / priešais laivą",
    bateauFlot: "Laivas vandenyje",
    noteA:
      "Laivų tvarkymas Palais viduje atliekamas antradienį 15/09 pagal Scales grafiką.",
    noteB: "Įrengimas per Scales nuo šešt. 5/09 16 val. iki sekm. 6/09 12 val.",
    noteC:
      "Varikliams privalomas susitikimas su Scales (priėmimas 1–2 rugs.).",
    noteD: "Individualus atvykimo grafikas, atsiųstas organizatoriaus.",
    noteE: "Tvarkymas per Scales pagal individualų grafiką.",
    noteF: "Individualus grafikas derinamas su Scales.",
    noteG: "Tvarkymas per Scales privalomas laivams sausumoje.",
  }),
};

const tr: RxT = {
  steps: {
    exhibitor: "Katılımcı",
    contact: "İletişim",
    delivery: "Teslimat",
    pickup: "Toplama",
    manutention: "Elleçleme",
  },
  exhibitor: {
    title: "Katılımcı seçimi",
    subtitle: "Resmi listeden şirketinizi seçin.",
    noEventsBanner:
      "Şu anda akreditasyonlara açık aktif bir etkinlik yok. Lütfen organizatörle iletişime geçin.",
    label: "Katılımcı",
    searchPlaceholder: "Ada veya stant numarasına göre ara…",
    loading: "Katılımcılar yükleniyor…",
    notFound: "Katılımcı bulunamadı",
    clear: "Temizle",
    standNumber: "Stant no.",
    selectToContinue: "Devam etmek için katılımcınızı seçin.",
    othersSector: "Diğer",
  },
  contact: {
    title: "Sorumlu iletişim kişisi",
    subtitle: "Bu standın lojistiği için iletişime geçilecek kişi.",
    lastName: "Soyadı",
    firstName: "Adı",
    lastNamePlaceholder: "Yılmaz",
    firstNamePlaceholder: "Ahmet",
    email: "E-posta adresi",
    emailPlaceholder: "ahmet.yilmaz@sirket.com",
    mobilePhone: "Cep telefonu",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Zorunlu alan.",
    invalidEmail: "Geçersiz e-posta adresi.",
    invalidPhone: "Geçersiz telefon numarası.",
  },
  delivery: {
    title: "Teslimat yönetimi (kurulum)",
    palaisIntro:
      "Standınız Palais des Festivals içinde. Kategorileri görüntülemek için konumunu belirtin.",
    interiorPalais: "Palais İçi",
    interiorPalaisDesc: "Palais des Festivals içinde",
    exteriorPalais: "Palais Dışı",
    exteriorPalaisDesc: "Dış esplanad (Macé vb.)",
    spaceLabel: "Alan:",
    instructions:
      "Standınıza uygun her kategoriyi işaretleyin, ardından her biri için tarih, zaman aralığı ve araç(lar)ı girin.",
    rdvScales: "Scales randevusu",
    date: "Tarih",
    chooseDate: "— Bir tarih seçin —",
    slot: "Zaman aralığı",
    chooseSlot: "— Bir zaman aralığı seçin —",
    chooseDateFirst: "— Önce bir tarih seçin —",
    vehicles: "Araç(lar)",
    vehiclesHint: "(araç tipi zorunlu · plaka isteğe bağlı)",
    addVehicle: "+ Araç ekle",
    loadingTypes: "Araç tipleri yükleniyor…",
    noTypes:
      "Şu anda yapılandırılmış araç tipi yok. Lütfen organizatörle iletişime geçin.",
    interveningCompany: "Görevli şirket",
    interveningPlaceholder: "Nakliyeci, dekoratör, tedarikçi…",
    vehicleType: "Araç tipi",
    choose: "— Seçin —",
    plateOptional: "Plaka (isteğe bağlı)",
    removeVehicle: "Bu aracı kaldır",
    scalesMandatory: "Zorunlu Scales koordinasyonu:",
    scalesDefault: "bu kategori Scales ile randevu alınmasını gerektirir.",
    scalesContact: "İletişim:",
    validationHint:
      "Tarihi, zaman aralığı ve bir araç (araç tipi) ile en az bir kategori seçin.",
  },
  pickup: {
    title: "Toplama yönetimi (söküm)",
    emptyHint: "Önce bir önceki adımda teslimatlarınızı yapılandırın.",
    intro:
      "Kurulumda seçilen kategoriler otomatik olarak toplanır. Her biri için tarih, zaman aralığı ve toplama aracını girin.",
    pickupDate: "Toplama tarihi",
    slot: "Zaman aralığı",
    chooseDate: "— Bir tarih seçin —",
    chooseSlot: "— Bir zaman aralığı seçin —",
    chooseDateFirst: "— Önce bir tarih seçin —",
    pickupVehicles: "Toplama araçları",
    deliveryVehicle: "Teslimat aracı",
    sameVehicle: "Aynı araçla toplama",
    pickupVehicleType: "Araç tipi (toplama)",
    choose: "— Seçin —",
    pickupPlateOptional: "Toplama plakası (isteğe bağlı)",
    driverPhonePickup: "Toplama sürücüsü telefonu",
    lockedAria: "(kilitli)",
    validationHint:
      "Her kategori için tarih, zaman aralığı ve toplama araçlarını girin.",
  },
  manutention: {
    title: "Elleçleme sağlayıcısı",
    subtitle: "Scales dışı elleçleme için şirket.",
    scalesAutoNotice:
      "Scales, bunu gerektiren işaretli kategoriler için otomatik olarak atanacaktır (karadaki tekneler, motor üreticileri…). Geri kalanı için tamamlayıcı bir sağlayıcı seçebilirsiniz.",
    complementaryProvider: "Tamamlayıcı sağlayıcı",
    chooseProvider: "— Bir sağlayıcı seçin —",
    noneOption: "Hiçbiri (yalnızca ilgili kategoriler için Scales)",
    scalesAck:
      "İlgili kategorilerin elleçlemesini planlamak için Scales ile iletişime geçeceğim",
    consent:
      "Bu bilgilerin etkinliğin lojistik akreditasyonu kapsamında işlenmesine izin veriyorum.",
    recapExhibitor: "Katılımcı:",
    recapCategories: "Kategoriler:",
    recapVehicles: "Araçlar:",
    recapContact: "İletişim:",
    validate: "Akreditasyonu doğrula",
    validateHint: "Onayı onaylayın",
    validateHintScales: " ve Scales onayını",
    validateHintEnd: " doğrulamak için.",
    successTitleOne: "Akreditasyon kaydedildi!",
    successTitleMany: "akreditasyon kaydedildi!",
    successPerVehicle: "Her araç için bir akreditasyon oluşturuldu. ",
    successLogisticien: "Doğrulandılar ve listede görünüyorlar.",
    successPublic:
      "Talebiniz işlenecek ve organizatör tarafından doğrulanacaktır. Size bir onay e-postası gönderilecektir.",
    downloadNotice:
      "Akreditasyonunuzu (QR kodu) indirmeli ve alan girişinde göstermelisiniz.",
    generating: "Oluşturuluyor…",
    downloadCta: "Akreditasyonumu indir",
    scalesReminder:
      "Scales hatırlatması: ilgili kategoriler için Scales ile randevu almayı unutmayın.",
    newRequest: "Yeni talep",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Palais des Festivals İçi" },
    EXTERIEUR_PALAIS: { label: "Palais des Festivals Dışı" },
    QML: { label: "Quai Max Laubeuf (QML) + geçiş bölgesi" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Kuzey / Güney İskelesi" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Tenders bölgesi (Palais yakını)",
      note: "Palais yakınındaki bölge — Palais Dışı ile eşdeğer kurallar.",
    },
    BROKER: { label: "Broker ve Toys bölgesi" },
    SAIL: { label: "Yelken bölgesi (Mono / Çok gövdeli)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Boş stant",
    cleEnMain: "Anahtar teslim stant / Saphir",
    bateauTerre: "Karada tekne",
    standTente: "Çadır altı stant",
    motoristes: "Özel yapılar (motor üreticileri)",
    flotPonton: "Suda tekne / özel iskele",
    tenteNuDevant: "Çadır altı stant / teknenin önünde boş alan",
    nuDevant: "Teknenin önünde boş alan",
    tender: "Tekne / Tender",
    tenteNuDevantSlash: "Çadır / boş alan / teknenin önünde",
    bateauFlot: "Suda tekne",
    noteA:
      "Palais içi tekne elleçlemesi Salı 15/09 tarihinde Scales planına göre yapılır.",
    noteB: "Scales aracılığıyla kurulum Cmt 5/09 16:00 ile Paz 6/09 12:00 arası.",
    noteC:
      "Motorlar için Scales ile randevu zorunludur (kabul 1-2 Eyl).",
    noteD: "Organizatör tarafından gönderilen bireysel varış planı.",
    noteE: "Bireysel plana göre Scales aracılığıyla elleçleme.",
    noteF: "Scales ile koordine edilecek bireysel plan.",
    noteG: "Karadaki tekneler için Scales aracılığıyla elleçleme zorunludur.",
  }),
};

const ru: RxT = {
  steps: {
    exhibitor: "Экспонент",
    contact: "Контакт",
    delivery: "Доставка",
    pickup: "Вывоз",
    manutention: "Погрузка",
  },
  exhibitor: {
    title: "Выбор экспонента",
    subtitle: "Выберите вашу компанию из официального списка.",
    noEventsBanner:
      "В настоящее время нет активного мероприятия, открытого для аккредитаций. Свяжитесь с организатором.",
    label: "Экспонент",
    searchPlaceholder: "Поиск по названию или номеру стенда…",
    loading: "Загрузка экспонентов…",
    notFound: "Экспонент не найден",
    clear: "Очистить",
    standNumber: "№ стенда",
    selectToContinue: "Выберите вашего экспонента, чтобы продолжить.",
    othersSector: "Другие",
  },
  contact: {
    title: "Контакт ответственного",
    subtitle: "Лицо для связи по логистике этого стенда.",
    lastName: "Фамилия",
    firstName: "Имя",
    lastNamePlaceholder: "Иванов",
    firstNamePlaceholder: "Иван",
    email: "Адрес электронной почты",
    emailPlaceholder: "ivan.ivanov@company.com",
    mobilePhone: "Мобильный телефон",
    phonePlaceholder: "6 XX XX XX XX",
    required: "Обязательное поле.",
    invalidEmail: "Неверный адрес электронной почты.",
    invalidPhone: "Неверный номер телефона.",
  },
  delivery: {
    title: "Управление доставками (монтаж)",
    palaisIntro:
      "Ваш стенд находится в Palais des Festivals. Укажите его расположение для отображения категорий.",
    interiorPalais: "Внутри Palais",
    interiorPalaisDesc: "Внутри Palais des Festivals",
    exteriorPalais: "Снаружи Palais",
    exteriorPalaisDesc: "Внешняя эспланада (Macé и т. д.)",
    spaceLabel: "Зона:",
    instructions:
      "Отметьте каждую применимую к вашему стенду категорию, затем укажите дату, временной интервал и транспортное(ые) средство(а) для каждой.",
    rdvScales: "Встреча Scales",
    date: "Дата",
    chooseDate: "— Выберите дату —",
    slot: "Временной интервал",
    chooseSlot: "— Выберите интервал —",
    chooseDateFirst: "— Сначала выберите дату —",
    vehicles: "Транспортное(ые) средство(а)",
    vehiclesHint: "(тип транспортного средства обязателен · номер необязателен)",
    addVehicle: "+ Добавить транспортное средство",
    loadingTypes: "Загрузка типов транспортных средств…",
    noTypes:
      "В настоящее время не настроен ни один тип транспортного средства. Свяжитесь с организатором.",
    interveningCompany: "Компания-исполнитель",
    interveningPlaceholder: "Перевозчик, декоратор, поставщик…",
    vehicleType: "Тип транспортного средства",
    choose: "— Выберите —",
    plateOptional: "Номер (необязательно)",
    removeVehicle: "Удалить это транспортное средство",
    scalesMandatory: "Обязательная координация со Scales:",
    scalesDefault: "эта категория требует записи на встречу со Scales.",
    scalesContact: "Контакт:",
    validationHint:
      "Выберите хотя бы одну категорию с датой, временным интервалом и транспортным средством (тип транспортного средства).",
  },
  pickup: {
    title: "Управление вывозами (демонтаж)",
    emptyHint: "Сначала настройте доставки на предыдущем шаге.",
    intro:
      "Категории, выбранные при монтаже, вывозятся автоматически. Укажите дату, временной интервал и транспортное средство вывоза для каждой.",
    pickupDate: "Дата вывоза",
    slot: "Временной интервал",
    chooseDate: "— Выберите дату —",
    chooseSlot: "— Выберите интервал —",
    chooseDateFirst: "— Сначала выберите дату —",
    pickupVehicles: "Транспортные средства вывоза",
    deliveryVehicle: "Транспортное средство доставки",
    sameVehicle: "Вывоз тем же транспортным средством",
    pickupVehicleType: "Тип транспортного средства (вывоз)",
    choose: "— Выберите —",
    pickupPlateOptional: "Номер вывоза (необязательно)",
    driverPhonePickup: "Телефон водителя вывоза",
    lockedAria: "(заблокировано)",
    validationHint:
      "Укажите дату, временной интервал и транспортные средства вывоза для каждой категории.",
  },
  manutention: {
    title: "Поставщик погрузочных услуг",
    subtitle: "Компания для погрузки вне Scales.",
    scalesAutoNotice:
      "Scales будет автоматически назначен для отмеченных категорий, которым это требуется (суда на берегу, производители двигателей…). Для остального вы можете выбрать дополнительного поставщика.",
    complementaryProvider: "Дополнительный поставщик",
    chooseProvider: "— Выберите поставщика —",
    noneOption: "Нет (Scales только для соответствующих категорий)",
    scalesAck:
      "Я свяжусь со Scales, чтобы запланировать погрузку соответствующих категорий",
    consent:
      "Я разрешаю обработку этой информации в рамках логистической аккредитации мероприятия.",
    recapExhibitor: "Экспонент:",
    recapCategories: "Категории:",
    recapVehicles: "Транспортные средства:",
    recapContact: "Контакт:",
    validate: "Подтвердить аккредитацию",
    validateHint: "Подтвердите согласие",
    validateHintScales: " и подтверждение Scales",
    validateHintEnd: " для подтверждения.",
    successTitleOne: "Аккредитация сохранена!",
    successTitleMany: "аккредитаций сохранено!",
    successPerVehicle: "Создана одна аккредитация на каждое транспортное средство. ",
    successLogisticien: "Они подтверждены и видны в списке.",
    successPublic:
      "Ваша заявка будет обработана и подтверждена организатором. Вам будет отправлено письмо с подтверждением.",
    downloadNotice:
      "Вы должны скачать и предъявить вашу аккредитацию (QR-код) на входе на территорию.",
    generating: "Генерация…",
    downloadCta: "Скачать мою аккредитацию",
    scalesReminder:
      "Напоминание Scales: не забудьте записаться на встречу со Scales для соответствующих категорий.",
    newRequest: "Новая заявка",
  },
  spaces: {
    INTERIEUR_PALAIS: { label: "Внутри Palais des Festivals" },
    EXTERIEUR_PALAIS: { label: "Снаружи Palais des Festivals" },
    QML: { label: "Quai Max Laubeuf (QML) + проходная зона" },
    QSP: { label: "Quai Saint-Pierre" },
    PANTIERO: { label: "Pantiero" },
    JETEE: { label: "Северный / Южный пирс" },
    SYE: { label: "Super Yachts Extension" },
    TENDERS: {
      label: "Зона Tenders (рядом с Palais)",
      note: "Зона рядом с Palais — правила эквивалентны зоне снаружи Palais.",
    },
    BROKER: { label: "Зона Broker и Toys" },
    SAIL: { label: "Парусная зона (Моно / Многокорпусные)" },
    POWER: { label: "Power Boat Marina" },
  },
  categories: buildCategories({
    standNu: "Пустой стенд",
    cleEnMain: "Стенд «под ключ» / Saphir",
    bateauTerre: "Судно на берегу",
    standTente: "Стенд в шатре",
    motoristes: "Специфические конструкции (производители двигателей)",
    flotPonton: "Судно на плаву / частный понтон",
    tenteNuDevant: "Стенд в шатре / пустое пространство перед судном",
    nuDevant: "Пустое пространство перед судном",
    tender: "Судно / Tender",
    tenteNuDevantSlash: "Шатёр / пустое пространство / перед судном",
    bateauFlot: "Судно на плаву",
    noteA:
      "Погрузка судов внутри Palais выполняется во вторник 15/09 согласно расписанию Scales.",
    noteB: "Установка через Scales между сб 5/09 16:00 и вс 6/09 12:00.",
    noteC:
      "Для двигателей обязательна встреча со Scales (приём 1–2 сен).",
    noteD: "Индивидуальный график прибытия, отправленный организатором.",
    noteE: "Погрузка через Scales согласно индивидуальному графику.",
    noteF: "Индивидуальный график для согласования со Scales.",
    noteG: "Погрузка через Scales обязательна для судов на берегу.",
  }),
};

export const rxTranslations: Record<LangCode, RxT> = {
  fr,
  en,
  de,
  es,
  pt,
  it,
  pl,
  cs,
  lt,
  tr,
  ru,
};
