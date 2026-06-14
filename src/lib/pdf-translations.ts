import type { LangCode } from "./translations";
import { isValidLang } from "./translations";
import { rxTranslations } from "./rx-translations";

export interface PdfT {
  requestTitle: string;
  officialTitle: string;
  rxSubtitle: string;
  palaisSubtitle: string;
  issuedDate: string;
  requestBanner: string;
  generalInfo: string;
  exhibitor: string;
  stand: string;
  event: string;
  reference: string;
  unloadingZone: string;
  address: string;
  gpsCoords: string;
  contact: string;
  email: string;
  phone: string;
  handling: string;
  status: string;
  deliveryVehicle: string;
  template: string;
  plate: string;
  platePending: string;
  trailerPlate: string;
  driverPhone: string;
  deliverySlot: string;
  interveningCompanyDelivery: string;
  departureCityDelivery: string;
  returnVehicle: string;
  returnSlot: string;
  sameAsDelivery: string;
  templateReturn: string;
  plateReturn: string;
  interveningCompanyReturn: string;
  departureCityReturn: string;
  phoneReturn: string;
  message: string;
  consent: string;
  qrTracking: string;
  qrSetup: string;
  qrTeardown: string;
  qrVehicle: string;
  requestNote1: string;
  requestNote2: string;
  officialNote1: string;
  officialNote2: string;
  statusLabels: Record<string, string>;
}

const fr: PdfT = {
  requestTitle: "Demande d'accréditation Véhicule",
  officialTitle: "Accréditation Véhicule",
  rxSubtitle: "Cannes Yachting Festival — Logistique",
  palaisSubtitle: "Palais des Festivals et des Congrès de Cannes",
  issuedDate: "Date d'émission",
  requestBanner: "DEMANDE NON VALIDEE — NE PERMET PAS L'ACCES AU SITE",
  generalInfo: "Informations Générales",
  exhibitor: "Exposant / Décorateur",
  stand: "Stand",
  event: "Événement",
  reference: "Référence de la demande",
  unloadingZone: "Zone de déchargement",
  address: "Adresse",
  gpsCoords: "Coordonnées GPS",
  contact: "Contact",
  email: "E-mail",
  phone: "Téléphone contact",
  handling: "Manutention",
  status: "Statut",
  deliveryVehicle: "Véhicule de livraison",
  template: "Gabarit",
  plate: "Plaque",
  platePending: "— (à renseigner à l'arrivée)",
  trailerPlate: "Plaque remorque",
  driverPhone: "Téléphone conducteur",
  deliverySlot: "Créneau livraison",
  interveningCompanyDelivery: "Société intervenante livraison",
  departureCityDelivery: "Ville de départ livraison",
  returnVehicle: "Véhicule de reprise",
  returnSlot: "Créneau reprise",
  sameAsDelivery: "Identique au véhicule de livraison",
  templateReturn: "Gabarit reprise",
  plateReturn: "Plaque reprise",
  interveningCompanyReturn: "Société intervenante reprise",
  departureCityReturn: "Ville de départ reprise",
  phoneReturn: "Téléphone reprise",
  message: "Message",
  consent: "Je consens à la politique de confidentialité",
  qrTracking: "QR de suivi de demande",
  qrSetup: "QR Montage",
  qrTeardown: "QR Démontage",
  qrVehicle: "QR Véhicule",
  requestNote1:
    "Ce document peut être transmis au transporteur à titre informatif.",
  requestNote2: "Il ne constitue pas une accréditation d'accès au site.",
  officialNote1:
    "Cette accréditation est valable pour une durée de 24 heures à compter de l'heure d'entrée validée.",
  officialNote2:
    "Veuillez présenter ce document (QR code) à l'entrée du site.",
  statusLabels: {
    NOUVEAU: "NOUVEAU",
    ATTENTE: "VALIDÉE",
    ENTREE: "ENTREE",
    SORTIE: "SORTIE",
  },
};

const en: PdfT = {
  requestTitle: "Vehicle Accreditation Request",
  officialTitle: "Vehicle Accreditation",
  rxSubtitle: "Cannes Yachting Festival — Logistics",
  palaisSubtitle: "Palais des Festivals et des Congrès de Cannes",
  issuedDate: "Issue date",
  requestBanner: "REQUEST NOT VALIDATED — DOES NOT ALLOW SITE ACCESS",
  generalInfo: "General Information",
  exhibitor: "Exhibitor / Decorator",
  stand: "Stand",
  event: "Event",
  reference: "Request reference",
  unloadingZone: "Unloading zone",
  address: "Address",
  gpsCoords: "GPS coordinates",
  contact: "Contact",
  email: "Email",
  phone: "Contact phone",
  handling: "Handling",
  status: "Status",
  deliveryVehicle: "Delivery vehicle",
  template: "Vehicle type",
  plate: "Plate",
  platePending: "— (to be filled in on arrival)",
  trailerPlate: "Trailer plate",
  driverPhone: "Driver phone",
  deliverySlot: "Delivery slot",
  interveningCompanyDelivery: "Delivery carrier company",
  departureCityDelivery: "Departure city (delivery)",
  returnVehicle: "Return vehicle",
  returnSlot: "Return slot",
  sameAsDelivery: "Same as delivery vehicle",
  templateReturn: "Return vehicle type",
  plateReturn: "Return plate",
  interveningCompanyReturn: "Return carrier company",
  departureCityReturn: "Departure city (return)",
  phoneReturn: "Return phone",
  message: "Message",
  consent: "I consent to the privacy policy",
  qrTracking: "Request tracking QR",
  qrSetup: "Set-up QR",
  qrTeardown: "Teardown QR",
  qrVehicle: "Vehicle QR",
  requestNote1: "This document may be shared with the carrier for information only.",
  requestNote2: "It is not an access accreditation for the site.",
  officialNote1:
    "This accreditation is valid for 24 hours from the validated entry time.",
  officialNote2: "Please present this document (QR code) at the site entrance.",
  statusLabels: {
    NOUVEAU: "NEW",
    ATTENTE: "VALIDATED",
    ENTREE: "ENTRY",
    SORTIE: "EXIT",
  },
};

const de: PdfT = {
  ...en,
  requestTitle: "Fahrzeug-Akkreditierungsantrag",
  officialTitle: "Fahrzeug-Akkreditierung",
  rxSubtitle: "Cannes Yachting Festival — Logistik",
  issuedDate: "Ausstellungsdatum",
  requestBanner: "ANTRAG NICHT VALIDIERT — ERLAUBT KEINEN ZUGANG ZUR STÄTTE",
  generalInfo: "Allgemeine Informationen",
  exhibitor: "Aussteller / Dekorateur",
  stand: "Stand",
  event: "Veranstaltung",
  reference: "Antragsreferenz",
  unloadingZone: "Entladezone",
  address: "Adresse",
  gpsCoords: "GPS-Koordinaten",
  contact: "Kontakt",
  email: "E-Mail",
  phone: "Kontakttelefon",
  handling: "Handling",
  status: "Status",
  deliveryVehicle: "Lieferfahrzeug",
  template: "Fahrzeugtyp",
  plate: "Kennzeichen",
  platePending: "— (bei Ankunft einzutragen)",
  trailerPlate: "Anhängerkennzeichen",
  driverPhone: "Fahrertelefon",
  deliverySlot: "Lieferzeitfenster",
  interveningCompanyDelivery: "Spediteur (Lieferung)",
  departureCityDelivery: "Abfahrtsstadt (Lieferung)",
  returnVehicle: "Rückführungsfahrzeug",
  returnSlot: "Rückführungszeitfenster",
  sameAsDelivery: "Identisch mit Lieferfahrzeug",
  templateReturn: "Rückführungstyp",
  plateReturn: "Rückführungskennzeichen",
  interveningCompanyReturn: "Spediteur (Rückführung)",
  departureCityReturn: "Abfahrtsstadt (Rückführung)",
  phoneReturn: "Rückführungstelefon",
  message: "Nachricht",
  consent: "Ich stimme der Datenschutzrichtlinie zu",
  qrTracking: "Antragsverfolgungs-QR",
  qrSetup: "Montage-QR",
  qrTeardown: "Demontage-QR",
  qrVehicle: "Fahrzeug-QR",
  requestNote1: "Dieses Dokument kann dem Spediteur zur Information übermittelt werden.",
  requestNote2: "Es stellt keine Zugangsakkreditierung dar.",
  officialNote1:
    "Diese Akkreditierung ist 24 Stunden ab der validierten Einfahrtszeit gültig.",
  officialNote2: "Bitte legen Sie dieses Dokument (QR-Code) am Eingang vor.",
  statusLabels: { NOUVEAU: "NEU", ATTENTE: "VALIDIERT", ENTREE: "EINGANG", SORTIE: "AUSGANG" },
};

const es: PdfT = {
  ...en,
  requestTitle: "Solicitud de acreditación de vehículo",
  officialTitle: "Acreditación de vehículo",
  rxSubtitle: "Cannes Yachting Festival — Logística",
  issuedDate: "Fecha de emisión",
  requestBanner: "SOLICITUD NO VALIDADA — NO PERMITE EL ACCESO AL RECINTO",
  generalInfo: "Información general",
  exhibitor: "Expositor / Decorador",
  event: "Evento",
  reference: "Referencia de la solicitud",
  unloadingZone: "Zona de descarga",
  address: "Dirección",
  gpsCoords: "Coordenadas GPS",
  contact: "Contacto",
  email: "Correo electrónico",
  phone: "Teléfono de contacto",
  handling: "Manipulación",
  status: "Estado",
  deliveryVehicle: "Vehículo de entrega",
  template: "Tipo de vehículo",
  plate: "Matrícula",
  platePending: "— (a completar a la llegada)",
  trailerPlate: "Matrícula del remolque",
  driverPhone: "Teléfono del conductor",
  deliverySlot: "Franja de entrega",
  interveningCompanyDelivery: "Empresa transportista (entrega)",
  departureCityDelivery: "Ciudad de salida (entrega)",
  returnVehicle: "Vehículo de recogida",
  returnSlot: "Franja de recogida",
  sameAsDelivery: "Igual que el vehículo de entrega",
  templateReturn: "Tipo de vehículo de recogida",
  plateReturn: "Matrícula de recogida",
  interveningCompanyReturn: "Empresa transportista (recogida)",
  departureCityReturn: "Ciudad de salida (recogida)",
  phoneReturn: "Teléfono de recogida",
  message: "Mensaje",
  consent: "Consiento la política de privacidad",
  qrTracking: "QR de seguimiento de solicitud",
  qrSetup: "QR Montaje",
  qrTeardown: "QR Desmontaje",
  qrVehicle: "QR Vehículo",
  requestNote1: "Este documento puede transmitirse al transportista a título informativo.",
  requestNote2: "No constituye una acreditación de acceso al recinto.",
  officialNote1:
    "Esta acreditación es válida durante 24 horas a partir de la hora de entrada validada.",
  officialNote2: "Presente este documento (código QR) en la entrada del recinto.",
  statusLabels: { NOUVEAU: "NUEVO", ATTENTE: "VALIDADA", ENTREE: "ENTRADA", SORTIE: "SALIDA" },
};

const pt: PdfT = { ...es, requestTitle: "Pedido de acreditação de veículo", officialTitle: "Acreditação de veículo", rxSubtitle: "Cannes Yachting Festival — Logística", issuedDate: "Data de emissão", requestBanner: "PEDIDO NÃO VALIDADO — NÃO PERMITE ACESSO AO LOCAL", generalInfo: "Informações gerais", exhibitor: "Expositor / Decorador", event: "Evento", reference: "Referência do pedido", unloadingZone: "Zona de descarga", address: "Morada", gpsCoords: "Coordenadas GPS", contact: "Contacto", email: "E-mail", phone: "Telefone de contacto", handling: "Manuseamento", status: "Estado", deliveryVehicle: "Veículo de entrega", template: "Tipo de veículo", plate: "Matrícula", platePending: "— (a preencher à chegada)", trailerPlate: "Matrícula do reboque", driverPhone: "Telefone do condutor", deliverySlot: "Faixa de entrega", interveningCompanyDelivery: "Empresa transportadora (entrega)", departureCityDelivery: "Cidade de partida (entrega)", returnVehicle: "Veículo de recolha", returnSlot: "Faixa de recolha", sameAsDelivery: "Igual ao veículo de entrega", templateReturn: "Tipo de veículo de recolha", plateReturn: "Matrícula de recolha", interveningCompanyReturn: "Empresa transportadora (recolha)", departureCityReturn: "Cidade de partida (recolha)", phoneReturn: "Telefone de recolha", message: "Mensagem", consent: "Consinto a política de privacidade", qrTracking: "QR de acompanhamento do pedido", qrSetup: "QR Montagem", qrTeardown: "QR Desmontagem", qrVehicle: "QR Veículo", requestNote1: "Este documento pode ser transmitido ao transportador a título informativo.", requestNote2: "Não constitui uma acreditação de acesso ao local.", officialNote1: "Esta acreditação é válida por 24 horas a partir da hora de entrada validada.", officialNote2: "Apresente este documento (código QR) na entrada do local.", statusLabels: { NOUVEAU: "NOVO", ATTENTE: "PENDENTE", ENTREE: "ENTRADA", SORTIE: "SAÍDA" } };

const it: PdfT = { ...es, requestTitle: "Richiesta di accreditamento veicolo", officialTitle: "Accreditamento veicolo", rxSubtitle: "Cannes Yachting Festival — Logistica", issuedDate: "Data di emissione", requestBanner: "RICHIESTA NON VALIDATA — NON CONSENTE L'ACCESSO AL SITO", generalInfo: "Informazioni generali", exhibitor: "Espositore / Decoratore", event: "Evento", reference: "Riferimento richiesta", unloadingZone: "Zona di scarico", address: "Indirizzo", gpsCoords: "Coordinate GPS", contact: "Contatto", email: "E-mail", phone: "Telefono contatto", handling: "Movimentazione", status: "Stato", deliveryVehicle: "Veicolo di consegna", template: "Tipo di veicolo", plate: "Targa", platePending: "— (da compilare all'arrivo)", trailerPlate: "Targa rimorchio", driverPhone: "Telefono conducente", deliverySlot: "Fascia di consegna", interveningCompanyDelivery: "Società trasportatore (consegna)", departureCityDelivery: "Città di partenza (consegna)", returnVehicle: "Veicolo di ritiro", returnSlot: "Fascia di ritiro", sameAsDelivery: "Uguale al veicolo di consegna", templateReturn: "Tipo veicolo di ritiro", plateReturn: "Targa di ritiro", interveningCompanyReturn: "Società trasportatore (ritiro)", departureCityReturn: "Città di partenza (ritiro)", phoneReturn: "Telefono di ritiro", message: "Messaggio", consent: "Acconsento all'informativa sulla privacy", qrTracking: "QR di tracciamento richiesta", qrSetup: "QR Montaggio", qrTeardown: "QR Smontaggio", qrVehicle: "QR Veicolo", requestNote1: "Questo documento può essere trasmesso al trasportatore a titolo informativo.", requestNote2: "Non costituisce un accreditamento di accesso al sito.", officialNote1: "Questo accreditamento è valido per 24 ore dall'ora di ingresso validata.", officialNote2: "Presentare questo documento (codice QR) all'ingresso del sito.", statusLabels: { NOUVEAU: "NUOVO", ATTENTE: "IN ATTESA", ENTREE: "INGRESSO", SORTIE: "USCITA" } };

const pl: PdfT = { ...en, requestTitle: "Wniosek o akredytację pojazdu", officialTitle: "Akredytacja pojazdu", rxSubtitle: "Cannes Yachting Festival — Logistyka", issuedDate: "Data wystawienia", requestBanner: "WNIOSEK NIEZATWIERDZONY — NIE UMOŻLIWIA DOSTĘPU NA TEREN", generalInfo: "Informacje ogólne", exhibitor: "Wystawca / Dekorator", stand: "Stoisko", event: "Wydarzenie", reference: "Numer wniosku", unloadingZone: "Strefa rozładunku", address: "Adres", gpsCoords: "Współrzędne GPS", contact: "Kontakt", email: "E-mail", phone: "Telefon kontaktowy", handling: "Obsługa", status: "Status", deliveryVehicle: "Pojazd dostawczy", template: "Typ pojazdu", plate: "Tablica rejestracyjna", platePending: "— (do uzupełnienia po przyjeździe)", trailerPlate: "Tablica przyczepy", driverPhone: "Telefon kierowcy", deliverySlot: "Przedział dostawy", interveningCompanyDelivery: "Firma przewozowa (dostawa)", departureCityDelivery: "Miasto wyjazdu (dostawa)", returnVehicle: "Pojazd odbioru", returnSlot: "Przedział odbioru", sameAsDelivery: "Taki sam jak pojazd dostawczy", templateReturn: "Typ pojazdu odbioru", plateReturn: "Tablica odbioru", interveningCompanyReturn: "Firma przewozowa (odbiór)", departureCityReturn: "Miasto wyjazdu (odbiór)", phoneReturn: "Telefon odbioru", message: "Wiadomość", consent: "Wyrażam zgodę na politykę prywatności", qrTracking: "QR śledzenia wniosku", qrSetup: "QR Montaż", qrTeardown: "QR Demontaż", qrVehicle: "QR Pojazd", requestNote1: "Ten dokument można przekazać przewoźnikowi w celach informacyjnych.", requestNote2: "Nie stanowi akredytacji dostępu na teren.", officialNote1: "Akredytacja ważna 24 godziny od zatwierdzonego czasu wjazdu.", officialNote2: "Prosimy okazać ten dokument (kod QR) przy wjeździe.", statusLabels: { NOUVEAU: "NOWY", ATTENTE: "OCZEKUJĄCY", ENTREE: "WJAZD", SORTIE: "WYJAZD" } };

const cs: PdfT = { ...en, requestTitle: "Žádost o akreditaci vozidla", officialTitle: "Akreditace vozidla", rxSubtitle: "Cannes Yachting Festival — Logistika", issuedDate: "Datum vydání", requestBanner: "ŽÁDOST NEVALIDOVÁNA — NEUMOŽŇUJE PŘÍSTUP NA AREÁL", generalInfo: "Obecné informace", exhibitor: "Vystavovatel / Dekoratér", stand: "Stánek", event: "Akce", reference: "Reference žádosti", unloadingZone: "Zóna vykládky", address: "Adresa", gpsCoords: "GPS souřadnice", contact: "Kontakt", email: "E-mail", phone: "Kontaktní telefon", handling: "Manipulace", status: "Stav", deliveryVehicle: "Dodávkové vozidlo", template: "Typ vozidla", plate: "SPZ", platePending: "— (doplnit po příjezdu)", trailerPlate: "SPZ přívěsu", driverPhone: "Telefon řidiče", deliverySlot: "Časový slot dodání", interveningCompanyDelivery: "Dopravce (dodání)", departureCityDelivery: "Město odjezdu (dodání)", returnVehicle: "Vozidlo pro svoz", returnSlot: "Časový slot svozu", sameAsDelivery: "Stejné jako dodávkové vozidlo", templateReturn: "Typ vozidla svozu", plateReturn: "SPZ svozu", interveningCompanyReturn: "Dopravce (svoz)", departureCityReturn: "Město odjezdu (svoz)", phoneReturn: "Telefon svozu", message: "Zpráva", consent: "Souhlasím se zásadami ochrany osobních údajů", qrTracking: "QR sledování žádosti", qrSetup: "QR Montáž", qrTeardown: "QR Demontáž", qrVehicle: "QR Vozidlo", requestNote1: "Tento dokument lze předat dopravci informativně.", requestNote2: "Nepředstavuje akreditaci pro přístup na areál.", officialNote1: "Akreditace platí 24 hodin od schváleného času vjezdu.", officialNote2: "Předložte tento dokument (QR kód) u vjezdu.", statusLabels: { NOUVEAU: "NOVÝ", ATTENTE: "ČEKAJÍCÍ", ENTREE: "VJEZD", SORTIE: "VÝJEZD" } };

const lt: PdfT = { ...en, requestTitle: "Transporto priemonės akreditacijos prašymas", officialTitle: "Transporto priemonės akreditacija", rxSubtitle: "Cannes Yachting Festival — Logistika", issuedDate: "Išdavimo data", requestBanner: "PRAŠYMAS NEPATVIRTINTAS — NESUTEIKIA PRIEIGOS PRIE OBJEKTO", generalInfo: "Bendra informacija", exhibitor: "Eksponentas / Dekoratorius", stand: "Stendas", event: "Renginys", reference: "Prašymo nuoroda", unloadingZone: "Iškrovimo zona", address: "Adresas", gpsCoords: "GPS koordinatės", contact: "Kontaktas", email: "El. paštas", phone: "Kontaktinis telefonas", handling: "Tvarkymas", status: "Būsena", deliveryVehicle: "Pristatymo transporto priemonė", template: "Transporto priemonės tipas", plate: "Valstybinis numeris", platePending: "— (užpildyti atvykus)", trailerPlate: "Priekabos numeris", driverPhone: "Vairuotojo telefonas", deliverySlot: "Pristatymo laiko tarpas", interveningCompanyDelivery: "Vežėjas (pristatymas)", departureCityDelivery: "Išvykimo miestas (pristatymas)", returnVehicle: "Paėmimo transporto priemonė", returnSlot: "Paėmimo laiko tarpas", sameAsDelivery: "Tokia pati kaip pristatymo transporto priemonė", templateReturn: "Paėmimo transporto priemonės tipas", plateReturn: "Paėmimo numeris", interveningCompanyReturn: "Vežėjas (paėmimas)", departureCityReturn: "Išvykimo miestas (paėmimas)", phoneReturn: "Paėmimo telefonas", message: "Žinutė", consent: "Sutinku su privatumo politika", qrTracking: "Prašymo stebėjimo QR", qrSetup: "Montavimo QR", qrTeardown: "Demontavimo QR", qrVehicle: "Transporto priemonės QR", requestNote1: "Šis dokumentas gali būti perduotas vežėjui informaciniais tikslais.", requestNote2: "Tai nėra prieigos akreditacija.", officialNote1: "Akreditacija galioja 24 valandas nuo patvirtinto įvažiavimo laiko.", officialNote2: "Pateikite šį dokumentą (QR kodą) prie įvažiavimo.", statusLabels: { NOUVEAU: "NAUJAS", ATTENTE: "LAUKIAMAS", ENTREE: "ĮVAŽIAVIMAS", SORTIE: "IŠVAŽIAVIMAS" } };

const tr: PdfT = { ...en, requestTitle: "Araç akreditasyon talebi", officialTitle: "Araç akreditasyonu", rxSubtitle: "Cannes Yachting Festival — Lojistik", issuedDate: "Düzenleme tarihi", requestBanner: "TALEP ONAYLANMADI — ALANA GİRİŞ İZNİ VERMEZ", generalInfo: "Genel bilgiler", exhibitor: "Katılımcı / Dekoratör", stand: "Stand", event: "Etkinlik", reference: "Talep referansı", unloadingZone: "Boşaltma bölgesi", address: "Adres", gpsCoords: "GPS koordinatları", contact: "İletişim", email: "E-posta", phone: "İletişim telefonu", handling: "Elleçleme", status: "Durum", deliveryVehicle: "Teslimat aracı", template: "Araç tipi", plate: "Plaka", platePending: "— (varışta doldurulacak)", trailerPlate: "Römork plakası", driverPhone: "Sürücü telefonu", deliverySlot: "Teslimat zaman dilimi", interveningCompanyDelivery: "Taşıyıcı şirket (teslimat)", departureCityDelivery: "Kalkış şehri (teslimat)", returnVehicle: "Geri alma aracı", returnSlot: "Geri alma zaman dilimi", sameAsDelivery: "Teslimat aracı ile aynı", templateReturn: "Geri alma araç tipi", plateReturn: "Geri alma plakası", interveningCompanyReturn: "Taşıyıcı şirket (geri alma)", departureCityReturn: "Kalkış şehri (geri alma)", phoneReturn: "Geri alma telefonu", message: "Mesaj", consent: "Gizlilik politikasını kabul ediyorum", qrTracking: "Talep takip QR", qrSetup: "Kurulum QR", qrTeardown: "Söküm QR", qrVehicle: "Araç QR", requestNote1: "Bu belge taşıyıcıya bilgi amaçlı iletilebilir.", requestNote2: "Alan erişim akreditasyonu değildir.", officialNote1: "Bu akreditasyon onaylanan giriş saatinden itibaren 24 saat geçerlidir.", officialNote2: "Lütfen bu belgeyi (QR kod) girişte sunun.", statusLabels: { NOUVEAU: "YENİ", ATTENTE: "BEKLEMEDE", ENTREE: "GİRİŞ", SORTIE: "ÇIKIŞ" } };

const ru: PdfT = { ...en, requestTitle: "Заявка на аккредитацию транспортного средства", officialTitle: "Аккредитация транспортного средства", rxSubtitle: "Cannes Yachting Festival — Логистика", issuedDate: "Дата выдачи", requestBanner: "ЗАЯВКА НЕ ПОДТВЕРЖДЕНА — НЕ ДАЁТ ДОСТУП НА ПЛОЩАДКУ", generalInfo: "Общая информация", exhibitor: "Экспонент / Декоратор", stand: "Стенд", event: "Мероприятие", reference: "Ссылка на заявку", unloadingZone: "Зона разгрузки", address: "Адрес", gpsCoords: "GPS-координаты", contact: "Контакт", email: "E-mail", phone: "Контактный телефон", handling: "Погрузка", status: "Статус", deliveryVehicle: "Транспорт доставки", template: "Тип ТС", plate: "Номер", platePending: "— (заполнить по прибытии)", trailerPlate: "Номер прицепа", driverPhone: "Телефон водителя", deliverySlot: "Слот доставки", interveningCompanyDelivery: "Перевозчик (доставка)", departureCityDelivery: "Город отправления (доставка)", returnVehicle: "Транспорт возврата", returnSlot: "Слот возврата", sameAsDelivery: "Такой же, как транспорт доставки", templateReturn: "Тип ТС возврата", plateReturn: "Номер возврата", interveningCompanyReturn: "Перевозчик (возврат)", departureCityReturn: "Город отправления (возврат)", phoneReturn: "Телефон возврата", message: "Сообщение", consent: "Я согласен с политикой конфиденциальности", qrTracking: "QR отслеживания заявки", qrSetup: "QR Монтаж", qrTeardown: "QR Демонтаж", qrVehicle: "QR ТС", requestNote1: "Этот документ может быть передан перевозчику в информационных целях.", requestNote2: "Он не является аккредитацией доступа на площадку.", officialNote1: "Аккредитация действительна 24 часа с момента подтверждённого въезда.", officialNote2: "Предъявите этот документ (QR-код) при въезде.", statusLabels: { NOUVEAU: "НОВАЯ", ATTENTE: "ОЖИДАНИЕ", ENTREE: "ВЪЕЗД", SORTIE: "ВЫЕЗД" } };

export const pdfTranslations: Record<LangCode, PdfT> = {
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

export function getPdfTranslations(lang: string): PdfT {
  return isValidLang(lang) ? pdfTranslations[lang] : pdfTranslations.fr;
}

export function resolvePdfVehicleLabel(
  lang: LangCode,
  code: string | null | undefined,
  fallbackGabarit: string
): string {
  if (!code) return fallbackGabarit;
  const key = code.trim().toUpperCase();
  const vt = rxTranslations[lang]?.vehicleTypes?.[key];
  if (vt) return vt;
  return fallbackGabarit;
}
