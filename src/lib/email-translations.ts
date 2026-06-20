import type { LangCode } from "@/lib/translations";

/**
 * Traductions du corps de l'e-mail de création/validation d'accréditation
 * (Lot 8). Auparavant le corps HTML était figé en français quelle que soit la
 * langue choisie dans le formulaire. On suit désormais la langue de
 * l'accréditation (fallback `fr`).
 *
 * Noms propres NON traduits (zones, événements, prestataires, stands) : ils
 * proviennent des données et sont injectés tels quels.
 */
export interface EmailT {
  titleValidated: string;
  titleRequest: string;
  greeting: string;
  introValidated: string;
  introRequest: string;
  bannerValidatedTitle: string;
  bannerValidatedText: string;
  bannerRequestTitle: string;
  bannerRequestText: string;
  event: string;
  vehicle: string;
  vehicleTemplate: string;
  trailer: string;
  plannedDate: string;
  departureCity: string;
  driverPhone: string;
  qrAlt: string;
  qrCaption: string;
  spamTitle: string;
  spamText: string;
  footerAuto: string;
  subjectValidated: string;
  subjectRequest: string;
}

const fr: EmailT = {
  titleValidated: "Votre accréditation",
  titleRequest: "Demande d'accréditation reçue",
  greeting: "Bonjour,",
  introValidated:
    "Votre accréditation véhicule a été créée et validée. Voici votre récapitulatif et votre QR code.",
  introRequest:
    "Votre demande d'accréditation véhicule a bien été enregistrée. Voici votre récapitulatif et votre QR code.",
  bannerValidatedTitle: "Votre accréditation a été validée.",
  bannerValidatedText: "Présentez ce QR code à votre arrivée sur site.",
  bannerRequestTitle: "Accréditation pas encore valide.",
  bannerRequestText:
    "Elle devra être validée par un agent à votre arrivée sur site. Présentez ce QR code à l'agent.",
  event: "Événement",
  vehicle: "Véhicule",
  vehicleTemplate: "Gabarit du véhicule",
  trailer: "Remorque",
  plannedDate: "Date prévue",
  departureCity: "Ville de départ",
  driverPhone: "Téléphone chauffeur",
  qrAlt: "QR code de l'accréditation",
  qrCaption: "QR de l'accréditation — à présenter à l'agent",
  spamTitle: "Vous ne trouvez pas cet e-mail ?",
  spamText:
    "Si vous ne recevez pas l'e-mail dans les prochaines minutes, pensez à vérifier votre dossier spam / courrier indésirable.",
  footerAuto: "Cet e-mail est envoyé automatiquement, merci de ne pas y répondre.",
  subjectValidated: "Votre accréditation validée",
  subjectRequest: "Demande d'accréditation reçue",
};

const en: EmailT = {
  titleValidated: "Your accreditation",
  titleRequest: "Accreditation request received",
  greeting: "Hello,",
  introValidated:
    "Your vehicle accreditation has been created and validated. Here is your summary and your QR code.",
  introRequest:
    "Your vehicle accreditation request has been recorded. Here is your summary and your QR code.",
  bannerValidatedTitle: "Your accreditation has been validated.",
  bannerValidatedText: "Show this QR code when you arrive on site.",
  bannerRequestTitle: "Accreditation not yet valid.",
  bannerRequestText:
    "It must be validated by an officer when you arrive on site. Show this QR code to the officer.",
  event: "Event",
  vehicle: "Vehicle",
  vehicleTemplate: "Vehicle type",
  trailer: "Trailer",
  plannedDate: "Scheduled date",
  departureCity: "Departure city",
  driverPhone: "Driver phone",
  qrAlt: "Accreditation QR code",
  qrCaption: "Accreditation QR — to be shown to the officer",
  spamTitle: "Can't find this email?",
  spamText:
    "If you do not receive the email within the next few minutes, please check your spam / junk folder.",
  footerAuto: "This email is sent automatically, please do not reply.",
  subjectValidated: "Your validated accreditation",
  subjectRequest: "Accreditation request received",
};

const de: EmailT = {
  ...en,
  titleValidated: "Ihre Akkreditierung",
  titleRequest: "Akkreditierungsantrag erhalten",
  greeting: "Guten Tag,",
  introValidated:
    "Ihre Fahrzeugakkreditierung wurde erstellt und validiert. Hier sind Ihre Zusammenfassung und Ihr QR-Code.",
  introRequest:
    "Ihr Antrag auf Fahrzeugakkreditierung wurde erfasst. Hier sind Ihre Zusammenfassung und Ihr QR-Code.",
  bannerValidatedTitle: "Ihre Akkreditierung wurde validiert.",
  bannerValidatedText: "Zeigen Sie diesen QR-Code bei Ihrer Ankunft vor Ort vor.",
  bannerRequestTitle: "Akkreditierung noch nicht gültig.",
  bannerRequestText:
    "Sie muss bei Ihrer Ankunft vor Ort von einem Mitarbeiter validiert werden. Zeigen Sie diesen QR-Code dem Mitarbeiter.",
  event: "Veranstaltung",
  vehicle: "Fahrzeug",
  vehicleTemplate: "Fahrzeugtyp",
  trailer: "Anhänger",
  plannedDate: "Geplantes Datum",
  departureCity: "Abfahrtsstadt",
  driverPhone: "Telefon des Fahrers",
  qrAlt: "QR-Code der Akkreditierung",
  qrCaption: "Akkreditierungs-QR — dem Mitarbeiter vorzeigen",
  spamTitle: "Sie finden diese E-Mail nicht?",
  spamText:
    "Wenn Sie die E-Mail in den nächsten Minuten nicht erhalten, prüfen Sie bitte Ihren Spam-/Junk-Ordner.",
  footerAuto: "Diese E-Mail wird automatisch gesendet, bitte antworten Sie nicht.",
  subjectValidated: "Ihre validierte Akkreditierung",
  subjectRequest: "Akkreditierungsantrag erhalten",
};

const es: EmailT = {
  ...en,
  titleValidated: "Su acreditación",
  titleRequest: "Solicitud de acreditación recibida",
  greeting: "Hola,",
  introValidated:
    "Su acreditación de vehículo se ha creado y validado. Aquí tiene su resumen y su código QR.",
  introRequest:
    "Su solicitud de acreditación de vehículo se ha registrado. Aquí tiene su resumen y su código QR.",
  bannerValidatedTitle: "Su acreditación ha sido validada.",
  bannerValidatedText: "Muestre este código QR a su llegada al recinto.",
  bannerRequestTitle: "Acreditación aún no válida.",
  bannerRequestText:
    "Deberá ser validada por un agente a su llegada al recinto. Muestre este código QR al agente.",
  event: "Evento",
  vehicle: "Vehículo",
  vehicleTemplate: "Tipo de vehículo",
  trailer: "Remolque",
  plannedDate: "Fecha prevista",
  departureCity: "Ciudad de salida",
  driverPhone: "Teléfono del conductor",
  qrAlt: "Código QR de la acreditación",
  qrCaption: "QR de la acreditación — para mostrar al agente",
  spamTitle: "¿No encuentra este correo?",
  spamText:
    "Si no recibe el correo en los próximos minutos, revise su carpeta de spam / correo no deseado.",
  footerAuto: "Este correo se envía automáticamente, por favor no responda.",
  subjectValidated: "Su acreditación validada",
  subjectRequest: "Solicitud de acreditación recibida",
};

const pt: EmailT = {
  ...en,
  titleValidated: "A sua acreditação",
  titleRequest: "Pedido de acreditação recebido",
  greeting: "Olá,",
  introValidated:
    "A sua acreditação de veículo foi criada e validada. Aqui está o seu resumo e o seu código QR.",
  introRequest:
    "O seu pedido de acreditação de veículo foi registado. Aqui está o seu resumo e o seu código QR.",
  bannerValidatedTitle: "A sua acreditação foi validada.",
  bannerValidatedText: "Apresente este código QR à chegada ao local.",
  bannerRequestTitle: "Acreditação ainda não válida.",
  bannerRequestText:
    "Deverá ser validada por um agente à sua chegada ao local. Apresente este código QR ao agente.",
  event: "Evento",
  vehicle: "Veículo",
  vehicleTemplate: "Tipo de veículo",
  trailer: "Reboque",
  plannedDate: "Data prevista",
  departureCity: "Cidade de partida",
  driverPhone: "Telefone do condutor",
  qrAlt: "Código QR da acreditação",
  qrCaption: "QR da acreditação — a apresentar ao agente",
  spamTitle: "Não encontra este e-mail?",
  spamText:
    "Se não receber o e-mail nos próximos minutos, verifique a sua pasta de spam / lixo.",
  footerAuto: "Este e-mail é enviado automaticamente, por favor não responda.",
  subjectValidated: "A sua acreditação validada",
  subjectRequest: "Pedido de acreditação recebido",
};

const it: EmailT = {
  ...en,
  titleValidated: "Il tuo accreditamento",
  titleRequest: "Richiesta di accreditamento ricevuta",
  greeting: "Salve,",
  introValidated:
    "Il tuo accreditamento veicolo è stato creato e validato. Ecco il riepilogo e il codice QR.",
  introRequest:
    "La tua richiesta di accreditamento veicolo è stata registrata. Ecco il riepilogo e il codice QR.",
  bannerValidatedTitle: "Il tuo accreditamento è stato validato.",
  bannerValidatedText: "Mostra questo codice QR al tuo arrivo in sede.",
  bannerRequestTitle: "Accreditamento non ancora valido.",
  bannerRequestText:
    "Dovrà essere validato da un addetto al tuo arrivo in sede. Mostra questo codice QR all'addetto.",
  event: "Evento",
  vehicle: "Veicolo",
  vehicleTemplate: "Tipo di veicolo",
  trailer: "Rimorchio",
  plannedDate: "Data prevista",
  departureCity: "Città di partenza",
  driverPhone: "Telefono del conducente",
  qrAlt: "Codice QR dell'accreditamento",
  qrCaption: "QR dell'accreditamento — da mostrare all'addetto",
  spamTitle: "Non trovi questa e-mail?",
  spamText:
    "Se non ricevi l'e-mail nei prossimi minuti, controlla la cartella spam / posta indesiderata.",
  footerAuto: "Questa e-mail è inviata automaticamente, ti preghiamo di non rispondere.",
  subjectValidated: "Il tuo accreditamento validato",
  subjectRequest: "Richiesta di accreditamento ricevuta",
};

const pl: EmailT = {
  ...en,
  titleValidated: "Twoja akredytacja",
  titleRequest: "Otrzymano wniosek o akredytację",
  greeting: "Dzień dobry,",
  introValidated:
    "Twoja akredytacja pojazdu została utworzona i zatwierdzona. Oto podsumowanie i kod QR.",
  introRequest:
    "Twój wniosek o akredytację pojazdu został zarejestrowany. Oto podsumowanie i kod QR.",
  bannerValidatedTitle: "Twoja akredytacja została zatwierdzona.",
  bannerValidatedText: "Okaż ten kod QR po przybyciu na teren obiektu.",
  bannerRequestTitle: "Akredytacja jeszcze nieważna.",
  bannerRequestText:
    "Musi zostać zatwierdzona przez pracownika po przybyciu na teren obiektu. Okaż ten kod QR pracownikowi.",
  event: "Wydarzenie",
  vehicle: "Pojazd",
  vehicleTemplate: "Typ pojazdu",
  trailer: "Przyczepa",
  plannedDate: "Planowana data",
  departureCity: "Miasto wyjazdu",
  driverPhone: "Telefon kierowcy",
  qrAlt: "Kod QR akredytacji",
  qrCaption: "QR akredytacji — do okazania pracownikowi",
  spamTitle: "Nie możesz znaleźć tego e-maila?",
  spamText:
    "Jeśli nie otrzymasz e-maila w ciągu kilku minut, sprawdź folder spam / wiadomości-śmieci.",
  footerAuto: "Ten e-mail jest wysyłany automatycznie, prosimy nie odpowiadać.",
  subjectValidated: "Twoja zatwierdzona akredytacja",
  subjectRequest: "Otrzymano wniosek o akredytację",
};

const cs: EmailT = {
  ...en,
  titleValidated: "Vaše akreditace",
  titleRequest: "Žádost o akreditaci přijata",
  greeting: "Dobrý den,",
  introValidated:
    "Vaše akreditace vozidla byla vytvořena a schválena. Zde je souhrn a QR kód.",
  introRequest:
    "Vaše žádost o akreditaci vozidla byla zaznamenána. Zde je souhrn a QR kód.",
  bannerValidatedTitle: "Vaše akreditace byla schválena.",
  bannerValidatedText: "Po příjezdu na místo předložte tento QR kód.",
  bannerRequestTitle: "Akreditace zatím není platná.",
  bannerRequestText:
    "Musí být schválena pracovníkem po vašem příjezdu na místo. Předložte tento QR kód pracovníkovi.",
  event: "Akce",
  vehicle: "Vozidlo",
  vehicleTemplate: "Typ vozidla",
  trailer: "Přívěs",
  plannedDate: "Plánované datum",
  departureCity: "Město odjezdu",
  driverPhone: "Telefon řidiče",
  qrAlt: "QR kód akreditace",
  qrCaption: "QR akreditace — k předložení pracovníkovi",
  spamTitle: "Nemůžete tento e-mail najít?",
  spamText:
    "Pokud e-mail neobdržíte během několika minut, zkontrolujte složku spam / nevyžádaná pošta.",
  footerAuto: "Tento e-mail je odeslán automaticky, prosím neodpovídejte na něj.",
  subjectValidated: "Vaše schválená akreditace",
  subjectRequest: "Žádost o akreditaci přijata",
};

const lt: EmailT = {
  ...en,
  titleValidated: "Jūsų akreditacija",
  titleRequest: "Akreditacijos prašymas gautas",
  greeting: "Sveiki,",
  introValidated:
    "Jūsų transporto priemonės akreditacija sukurta ir patvirtinta. Štai santrauka ir QR kodas.",
  introRequest:
    "Jūsų transporto priemonės akreditacijos prašymas užregistruotas. Štai santrauka ir QR kodas.",
  bannerValidatedTitle: "Jūsų akreditacija patvirtinta.",
  bannerValidatedText: "Atvykę į vietą parodykite šį QR kodą.",
  bannerRequestTitle: "Akreditacija dar negalioja.",
  bannerRequestText:
    "Ją turi patvirtinti darbuotojas jums atvykus į vietą. Parodykite šį QR kodą darbuotojui.",
  event: "Renginys",
  vehicle: "Transporto priemonė",
  vehicleTemplate: "Transporto priemonės tipas",
  trailer: "Priekaba",
  plannedDate: "Numatyta data",
  departureCity: "Išvykimo miestas",
  driverPhone: "Vairuotojo telefonas",
  qrAlt: "Akreditacijos QR kodas",
  qrCaption: "Akreditacijos QR — parodyti darbuotojui",
  spamTitle: "Nerandate šio el. laiško?",
  spamText:
    "Jei negausite el. laiško per kelias minutes, patikrinkite šlamšto / nepageidaujamų laiškų aplanką.",
  footerAuto: "Šis el. laiškas išsiųstas automatiškai, prašome neatsakyti.",
  subjectValidated: "Jūsų patvirtinta akreditacija",
  subjectRequest: "Akreditacijos prašymas gautas",
};

const tr: EmailT = {
  ...en,
  titleValidated: "Akreditasyonunuz",
  titleRequest: "Akreditasyon talebi alındı",
  greeting: "Merhaba,",
  introValidated:
    "Araç akreditasyonunuz oluşturuldu ve onaylandı. Özetiniz ve QR kodunuz aşağıdadır.",
  introRequest:
    "Araç akreditasyon talebiniz kaydedildi. Özetiniz ve QR kodunuz aşağıdadır.",
  bannerValidatedTitle: "Akreditasyonunuz onaylandı.",
  bannerValidatedText: "Alana vardığınızda bu QR kodunu gösterin.",
  bannerRequestTitle: "Akreditasyon henüz geçerli değil.",
  bannerRequestText:
    "Alana vardığınızda bir görevli tarafından onaylanması gerekir. Bu QR kodunu görevliye gösterin.",
  event: "Etkinlik",
  vehicle: "Araç",
  vehicleTemplate: "Araç tipi",
  trailer: "Römork",
  plannedDate: "Planlanan tarih",
  departureCity: "Kalkış şehri",
  driverPhone: "Sürücü telefonu",
  qrAlt: "Akreditasyon QR kodu",
  qrCaption: "Akreditasyon QR — görevliye gösterilecek",
  spamTitle: "Bu e-postayı bulamıyor musunuz?",
  spamText:
    "E-postayı birkaç dakika içinde almazsanız spam / önemsiz posta klasörünüzü kontrol edin.",
  footerAuto: "Bu e-posta otomatik olarak gönderilir, lütfen yanıtlamayın.",
  subjectValidated: "Onaylanmış akreditasyonunuz",
  subjectRequest: "Akreditasyon talebi alındı",
};

const ru: EmailT = {
  ...en,
  titleValidated: "Ваша аккредитация",
  titleRequest: "Заявка на аккредитацию получена",
  greeting: "Здравствуйте,",
  introValidated:
    "Ваша аккредитация транспортного средства создана и подтверждена. Ниже — ваша сводка и QR-код.",
  introRequest:
    "Ваша заявка на аккредитацию транспортного средства зарегистрирована. Ниже — ваша сводка и QR-код.",
  bannerValidatedTitle: "Ваша аккредитация подтверждена.",
  bannerValidatedText: "Покажите этот QR-код по прибытии на площадку.",
  bannerRequestTitle: "Аккредитация ещё не действительна.",
  bannerRequestText:
    "Она должна быть подтверждена сотрудником по вашему прибытии на площадку. Покажите этот QR-код сотруднику.",
  event: "Мероприятие",
  vehicle: "Транспортное средство",
  vehicleTemplate: "Тип транспортного средства",
  trailer: "Прицеп",
  plannedDate: "Планируемая дата",
  departureCity: "Город отправления",
  driverPhone: "Телефон водителя",
  qrAlt: "QR-код аккредитации",
  qrCaption: "QR аккредитации — предъявить сотруднику",
  spamTitle: "Не можете найти это письмо?",
  spamText:
    "Если вы не получите письмо в ближайшие минуты, проверьте папку спам / нежелательная почта.",
  footerAuto: "Это письмо отправлено автоматически, пожалуйста, не отвечайте на него.",
  subjectValidated: "Ваша подтверждённая аккредитация",
  subjectRequest: "Заявка на аккредитацию получена",
};

const TABLE: Record<LangCode, EmailT> = {
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

export function getEmailTranslations(lang: LangCode): EmailT {
  return TABLE[lang] ?? fr;
}
