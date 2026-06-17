import type { LangCode } from "./translations";

/**
 * Traductions de la modale « doublon détecté » (composant DuplicateAlert),
 * affichée dans le parcours public multilingue. Module autonome (même pattern
 * que `supportTranslations` / `rxTranslations`) pour ne pas alourdir l'interface
 * `T` principale. Sélection par langue via `useTranslation().lang`.
 */
export interface DuplicateT {
  title: string;
  subtitle: string;
  existingOne: string;
  existingMany: string;
  stand: string;
  zone: string;
  vehicles: string;
  trailer: string;
  view: string;
  cancel: string;
  createAnyway: string;
  status: {
    ATTENTE: string;
    ENTREE: string;
    SORTIE: string;
    NOUVEAU: string;
    REFUS: string;
    ABSENT: string;
  };
}

export const duplicateTranslations: Record<LangCode, DuplicateT> = {
  fr: {
    title: "Doublon détecté",
    subtitle:
      "Une accréditation avec les mêmes informations existe déjà. Voulez-vous quand même créer cette accréditation ?",
    existingOne: "Accréditation existante",
    existingMany: "Accréditations existantes",
    stand: "Stand",
    zone: "Zone",
    vehicles: "Véhicules :",
    trailer: "Remorque",
    view: "Voir cette accréditation",
    cancel: "Annuler",
    createAnyway: "Créer quand même",
    status: {
      ATTENTE: "Validée",
      ENTREE: "Entrée",
      SORTIE: "Sortie",
      NOUVEAU: "Nouveau",
      REFUS: "Refusé",
      ABSENT: "Absent",
    },
  },
  en: {
    title: "Duplicate detected",
    subtitle:
      "An accreditation with the same information already exists. Do you still want to create this accreditation?",
    existingOne: "Existing accreditation",
    existingMany: "Existing accreditations",
    stand: "Booth",
    zone: "Zone",
    vehicles: "Vehicles:",
    trailer: "Trailer",
    view: "View this accreditation",
    cancel: "Cancel",
    createAnyway: "Create anyway",
    status: {
      ATTENTE: "Approved",
      ENTREE: "Entry",
      SORTIE: "Exit",
      NOUVEAU: "New",
      REFUS: "Refused",
      ABSENT: "Absent",
    },
  },
  de: {
    title: "Duplikat erkannt",
    subtitle:
      "Eine Akkreditierung mit denselben Informationen existiert bereits. Möchten Sie diese Akkreditierung trotzdem erstellen?",
    existingOne: "Vorhandene Akkreditierung",
    existingMany: "Vorhandene Akkreditierungen",
    stand: "Stand",
    zone: "Zone",
    vehicles: "Fahrzeuge:",
    trailer: "Anhänger",
    view: "Diese Akkreditierung ansehen",
    cancel: "Abbrechen",
    createAnyway: "Trotzdem erstellen",
    status: {
      ATTENTE: "Genehmigt",
      ENTREE: "Einfahrt",
      SORTIE: "Ausfahrt",
      NOUVEAU: "Neu",
      REFUS: "Abgelehnt",
      ABSENT: "Abwesend",
    },
  },
  es: {
    title: "Duplicado detectado",
    subtitle:
      "Ya existe una acreditación con la misma información. ¿Desea crear esta acreditación de todos modos?",
    existingOne: "Acreditación existente",
    existingMany: "Acreditaciones existentes",
    stand: "Stand",
    zone: "Zona",
    vehicles: "Vehículos:",
    trailer: "Remolque",
    view: "Ver esta acreditación",
    cancel: "Cancelar",
    createAnyway: "Crear de todos modos",
    status: {
      ATTENTE: "Validada",
      ENTREE: "Entrada",
      SORTIE: "Salida",
      NOUVEAU: "Nueva",
      REFUS: "Rechazada",
      ABSENT: "Ausente",
    },
  },
  pt: {
    title: "Duplicado detetado",
    subtitle:
      "Já existe uma acreditação com as mesmas informações. Pretende criar esta acreditação mesmo assim?",
    existingOne: "Acreditação existente",
    existingMany: "Acreditações existentes",
    stand: "Stand",
    zone: "Zona",
    vehicles: "Veículos:",
    trailer: "Reboque",
    view: "Ver esta acreditação",
    cancel: "Cancelar",
    createAnyway: "Criar mesmo assim",
    status: {
      ATTENTE: "Validada",
      ENTREE: "Entrada",
      SORTIE: "Saída",
      NOUVEAU: "Nova",
      REFUS: "Recusada",
      ABSENT: "Ausente",
    },
  },
  it: {
    title: "Duplicato rilevato",
    subtitle:
      "Esiste già un accredito con le stesse informazioni. Vuoi creare comunque questo accredito?",
    existingOne: "Accredito esistente",
    existingMany: "Accrediti esistenti",
    stand: "Stand",
    zone: "Zona",
    vehicles: "Veicoli:",
    trailer: "Rimorchio",
    view: "Vedi questo accredito",
    cancel: "Annulla",
    createAnyway: "Crea comunque",
    status: {
      ATTENTE: "Validato",
      ENTREE: "Entrata",
      SORTIE: "Uscita",
      NOUVEAU: "Nuovo",
      REFUS: "Rifiutato",
      ABSENT: "Assente",
    },
  },
  pl: {
    title: "Wykryto duplikat",
    subtitle:
      "Akredytacja z tymi samymi informacjami już istnieje. Czy mimo to chcesz utworzyć tę akredytację?",
    existingOne: "Istniejąca akredytacja",
    existingMany: "Istniejące akredytacje",
    stand: "Stoisko",
    zone: "Strefa",
    vehicles: "Pojazdy:",
    trailer: "Przyczepa",
    view: "Zobacz tę akredytację",
    cancel: "Anuluj",
    createAnyway: "Utwórz mimo to",
    status: {
      ATTENTE: "Zatwierdzona",
      ENTREE: "Wjazd",
      SORTIE: "Wyjazd",
      NOUVEAU: "Nowa",
      REFUS: "Odrzucona",
      ABSENT: "Nieobecna",
    },
  },
  cs: {
    title: "Zjištěn duplikát",
    subtitle:
      "Akreditace se stejnými údaji již existuje. Chcete tuto akreditaci přesto vytvořit?",
    existingOne: "Existující akreditace",
    existingMany: "Existující akreditace",
    stand: "Stánek",
    zone: "Zóna",
    vehicles: "Vozidla:",
    trailer: "Přívěs",
    view: "Zobrazit tuto akreditaci",
    cancel: "Zrušit",
    createAnyway: "Přesto vytvořit",
    status: {
      ATTENTE: "Schváleno",
      ENTREE: "Vjezd",
      SORTIE: "Výjezd",
      NOUVEAU: "Nové",
      REFUS: "Zamítnuto",
      ABSENT: "Nepřítomno",
    },
  },
  lt: {
    title: "Aptiktas dublikatas",
    subtitle:
      "Akreditacija su ta pačia informacija jau egzistuoja. Ar vis tiek norite sukurti šią akreditaciją?",
    existingOne: "Esama akreditacija",
    existingMany: "Esamos akreditacijos",
    stand: "Stendas",
    zone: "Zona",
    vehicles: "Transporto priemonės:",
    trailer: "Priekaba",
    view: "Peržiūrėti šią akreditaciją",
    cancel: "Atšaukti",
    createAnyway: "Vis tiek sukurti",
    status: {
      ATTENTE: "Patvirtinta",
      ENTREE: "Įvažiavimas",
      SORTIE: "Išvažiavimas",
      NOUVEAU: "Nauja",
      REFUS: "Atmesta",
      ABSENT: "Nėra",
    },
  },
  tr: {
    title: "Yinelenen kayıt tespit edildi",
    subtitle:
      "Aynı bilgilere sahip bir akreditasyon zaten mevcut. Yine de bu akreditasyonu oluşturmak istiyor musunuz?",
    existingOne: "Mevcut akreditasyon",
    existingMany: "Mevcut akreditasyonlar",
    stand: "Stant",
    zone: "Bölge",
    vehicles: "Araçlar:",
    trailer: "Römork",
    view: "Bu akreditasyonu görüntüle",
    cancel: "İptal",
    createAnyway: "Yine de oluştur",
    status: {
      ATTENTE: "Onaylandı",
      ENTREE: "Giriş",
      SORTIE: "Çıkış",
      NOUVEAU: "Yeni",
      REFUS: "Reddedildi",
      ABSENT: "Yok",
    },
  },
  ru: {
    title: "Обнаружен дубликат",
    subtitle:
      "Аккредитация с такой же информацией уже существует. Все равно создать эту аккредитацию?",
    existingOne: "Существующая аккредитация",
    existingMany: "Существующие аккредитации",
    stand: "Стенд",
    zone: "Зона",
    vehicles: "Транспорт:",
    trailer: "Прицеп",
    view: "Посмотреть эту аккредитацию",
    cancel: "Отмена",
    createAnyway: "Все равно создать",
    status: {
      ATTENTE: "Подтверждена",
      ENTREE: "Въезд",
      SORTIE: "Выезд",
      NOUVEAU: "Новая",
      REFUS: "Отклонена",
      ABSENT: "Отсутствует",
    },
  },
};
