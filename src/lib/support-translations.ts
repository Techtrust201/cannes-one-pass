import type { LangCode } from "./translations";

export interface SupportT {
  title: string;
  subtitle: string;
  backToForm: string;
  intro: string;
  event: string;
  company: string;
  problemType: string;
  identification: string;
  stand: string;
  email: string;
  phone: string;
  message: string;
  selectEvent: string;
  selectProblem: string;
  companyPlaceholder: string;
  identificationPlaceholder: string;
  standPlaceholder: string;
  emailPlaceholder: string;
  phonePlaceholder: string;
  messagePlaceholder: string;
  identificationHint: string;
  phoneOptional: string;
  problemAccreditation: string;
  problemCreneau: string;
  problemZone: string;
  problemAutre: string;
  submit: string;
  successTitle: string;
  successMessage: string;
  submitError: string;
  networkError: string;
}

const fr: SupportT = {
  title: "Besoin d'aide ?",
  subtitle: "Support logistique",
  backToForm: "← Retour au formulaire d'accréditation",
  intro:
    "Décrivez votre demande à l'équipe logistique. Une réponse vous sera envoyée par e-mail.",
  event: "Événement",
  company: "Société",
  problemType: "Objet (type de problème)",
  identification: "Identification",
  stand: "Stand",
  email: "Email",
  phone: "Téléphone",
  message: "Message",
  selectEvent: "— Sélectionnez l'événement —",
  selectProblem: "— Sélectionnez —",
  companyPlaceholder: "Nom de votre société",
  identificationPlaceholder: "Plaque, n° de demande ou stand",
  standPlaceholder: "ex: PALAIS 110",
  emailPlaceholder: "vous@exemple.com",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Décrivez votre demande…",
  identificationHint:
    "Aide le support à retrouver votre demande (plaque du véhicule, identifiant de demande, ou numéro de stand).",
  phoneOptional: "(optionnel)",
  problemAccreditation: "Accréditation",
  problemCreneau: "Créneau / horaire",
  problemZone: "Zone / accès",
  problemAutre: "Autre",
  submit: "Envoyer la demande",
  successTitle: "Demande prise en compte",
  successMessage:
    "Merci, votre demande a bien été prise en compte. L'équipe logistique reviendra vers vous à l'adresse {email} dans les meilleurs délais.",
  submitError: "Erreur lors de l'envoi du ticket.",
  networkError: "Erreur réseau, réessayez.",
};

const en: SupportT = {
  title: "Need help?",
  subtitle: "Logistics support",
  backToForm: "← Back to the accreditation form",
  intro:
    "Describe your request to the logistics team. A reply will be sent to you by email.",
  event: "Event",
  company: "Company",
  problemType: "Subject (type of issue)",
  identification: "Identification",
  stand: "Stand",
  email: "Email",
  phone: "Phone",
  message: "Message",
  selectEvent: "— Select an event —",
  selectProblem: "— Select —",
  companyPlaceholder: "Your company name",
  identificationPlaceholder: "Plate, request no. or stand",
  standPlaceholder: "e.g. PALAIS 110",
  emailPlaceholder: "you@example.com",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Describe your request…",
  identificationHint:
    "Helps support find your request (vehicle plate, request ID, or stand number).",
  phoneOptional: "(optional)",
  problemAccreditation: "Accreditation",
  problemCreneau: "Time slot / schedule",
  problemZone: "Zone / access",
  problemAutre: "Other",
  submit: "Send request",
  successTitle: "Request received",
  successMessage:
    "Thank you, your request has been received. The logistics team will reply to {email} as soon as possible.",
  submitError: "Error sending the ticket.",
  networkError: "Network error, please try again.",
};

const de: SupportT = {
  title: "Brauchen Sie Hilfe?",
  subtitle: "Logistik-Support",
  backToForm: "← Zurück zum Akkreditierungsformular",
  intro:
    "Beschreiben Sie Ihr Anliegen an das Logistikteam. Eine Antwort wird Ihnen per E-Mail zugesandt.",
  event: "Veranstaltung",
  company: "Unternehmen",
  problemType: "Betreff (Art des Problems)",
  identification: "Identifikation",
  stand: "Stand",
  email: "E-Mail",
  phone: "Telefon",
  message: "Nachricht",
  selectEvent: "— Veranstaltung auswählen —",
  selectProblem: "— Auswählen —",
  companyPlaceholder: "Name Ihres Unternehmens",
  identificationPlaceholder: "Kennzeichen, Antragsnr. oder Stand",
  standPlaceholder: "z. B. PALAIS 110",
  emailPlaceholder: "sie@beispiel.de",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Beschreiben Sie Ihr Anliegen…",
  identificationHint:
    "Hilft dem Support, Ihren Antrag zu finden (Fahrzeugkennzeichen, Antrags-ID oder Standnummer).",
  phoneOptional: "(optional)",
  problemAccreditation: "Akkreditierung",
  problemCreneau: "Zeitfenster / Zeitplan",
  problemZone: "Zone / Zugang",
  problemAutre: "Sonstiges",
  submit: "Anfrage senden",
  successTitle: "Anfrage erhalten",
  successMessage:
    "Vielen Dank, Ihre Anfrage wurde erfasst. Das Logistikteam wird sich unter {email} bei Ihnen melden.",
  submitError: "Fehler beim Senden des Tickets.",
  networkError: "Netzwerkfehler, bitte erneut versuchen.",
};

const es: SupportT = {
  title: "¿Necesita ayuda?",
  subtitle: "Soporte logístico",
  backToForm: "← Volver al formulario de acreditación",
  intro:
    "Describa su solicitud al equipo logístico. Recibirá una respuesta por correo electrónico.",
  event: "Evento",
  company: "Empresa",
  problemType: "Asunto (tipo de problema)",
  identification: "Identificación",
  stand: "Stand",
  email: "Correo electrónico",
  phone: "Teléfono",
  message: "Mensaje",
  selectEvent: "— Seleccione un evento —",
  selectProblem: "— Seleccione —",
  companyPlaceholder: "Nombre de su empresa",
  identificationPlaceholder: "Matrícula, nº de solicitud o stand",
  standPlaceholder: "ej: PALAIS 110",
  emailPlaceholder: "usted@ejemplo.com",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Describa su solicitud…",
  identificationHint:
    "Ayuda al soporte a encontrar su solicitud (matrícula, identificador o número de stand).",
  phoneOptional: "(opcional)",
  problemAccreditation: "Acreditación",
  problemCreneau: "Franja horaria / horario",
  problemZone: "Zona / acceso",
  problemAutre: "Otro",
  submit: "Enviar solicitud",
  successTitle: "Solicitud recibida",
  successMessage:
    "Gracias, su solicitud ha sido registrada. El equipo logístico le responderá a {email} lo antes posible.",
  submitError: "Error al enviar el ticket.",
  networkError: "Error de red, inténtelo de nuevo.",
};

const pt: SupportT = {
  title: "Precisa de ajuda?",
  subtitle: "Suporte logístico",
  backToForm: "← Voltar ao formulário de acreditação",
  intro:
    "Descreva o seu pedido à equipa logística. Receberá uma resposta por e-mail.",
  event: "Evento",
  company: "Empresa",
  problemType: "Assunto (tipo de problema)",
  identification: "Identificação",
  stand: "Stand",
  email: "E-mail",
  phone: "Telefone",
  message: "Mensagem",
  selectEvent: "— Selecione um evento —",
  selectProblem: "— Selecione —",
  companyPlaceholder: "Nome da sua empresa",
  identificationPlaceholder: "Matrícula, nº do pedido ou stand",
  standPlaceholder: "ex: PALAIS 110",
  emailPlaceholder: "voce@exemplo.com",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Descreva o seu pedido…",
  identificationHint:
    "Ajuda o suporte a encontrar o seu pedido (matrícula, identificador ou número de stand).",
  phoneOptional: "(opcional)",
  problemAccreditation: "Acreditação",
  problemCreneau: "Horário / faixa horária",
  problemZone: "Zona / acesso",
  problemAutre: "Outro",
  submit: "Enviar pedido",
  successTitle: "Pedido recebido",
  successMessage:
    "Obrigado, o seu pedido foi registado. A equipa logística responderá para {email} o mais breve possível.",
  submitError: "Erro ao enviar o ticket.",
  networkError: "Erro de rede, tente novamente.",
};

const it: SupportT = {
  title: "Hai bisogno di aiuto?",
  subtitle: "Supporto logistico",
  backToForm: "← Torna al modulo di accreditamento",
  intro:
    "Descrivi la tua richiesta al team logistico. Riceverai una risposta via e-mail.",
  event: "Evento",
  company: "Azienda",
  problemType: "Oggetto (tipo di problema)",
  identification: "Identificazione",
  stand: "Stand",
  email: "E-mail",
  phone: "Telefono",
  message: "Messaggio",
  selectEvent: "— Seleziona un evento —",
  selectProblem: "— Seleziona —",
  companyPlaceholder: "Nome della tua azienda",
  identificationPlaceholder: "Targa, nº richiesta o stand",
  standPlaceholder: "es: PALAIS 110",
  emailPlaceholder: "tuo@esempio.com",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Descrivi la tua richiesta…",
  identificationHint:
    "Aiuta il supporto a trovare la tua richiesta (targa, identificativo o numero stand).",
  phoneOptional: "(opzionale)",
  problemAccreditation: "Accreditamento",
  problemCreneau: "Fascia oraria / orario",
  problemZone: "Zona / accesso",
  problemAutre: "Altro",
  submit: "Invia richiesta",
  successTitle: "Richiesta ricevuta",
  successMessage:
    "Grazie, la tua richiesta è stata registrata. Il team logistico risponderà a {email} al più presto.",
  submitError: "Errore durante l'invio del ticket.",
  networkError: "Errore di rete, riprova.",
};

const pl: SupportT = {
  title: "Potrzebujesz pomocy?",
  subtitle: "Wsparcie logistyczne",
  backToForm: "← Powrót do formularza akredytacji",
  intro:
    "Opisz swoje zgłoszenie zespołowi logistycznemu. Odpowiedź zostanie wysłana e-mailem.",
  event: "Wydarzenie",
  company: "Firma",
  problemType: "Temat (rodzaj problemu)",
  identification: "Identyfikacja",
  stand: "Stoisko",
  email: "E-mail",
  phone: "Telefon",
  message: "Wiadomość",
  selectEvent: "— Wybierz wydarzenie —",
  selectProblem: "— Wybierz —",
  companyPlaceholder: "Nazwa firmy",
  identificationPlaceholder: "Tablica, nr wniosku lub stoisko",
  standPlaceholder: "np. PALAIS 110",
  emailPlaceholder: "ty@przyklad.pl",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Opisz swoje zgłoszenie…",
  identificationHint:
    "Pomaga wsparciu znaleźć wniosek (tablica rejestracyjna, identyfikator lub numer stoiska).",
  phoneOptional: "(opcjonalnie)",
  problemAccreditation: "Akredytacja",
  problemCreneau: "Przedział czasowy / harmonogram",
  problemZone: "Strefa / dostęp",
  problemAutre: "Inne",
  submit: "Wyślij zgłoszenie",
  successTitle: "Zgłoszenie przyjęte",
  successMessage:
    "Dziękujemy, zgłoszenie zostało zarejestrowane. Zespół logistyczny odpowie na {email} w możliwie krótkim czasie.",
  submitError: "Błąd podczas wysyłania zgłoszenia.",
  networkError: "Błąd sieci, spróbuj ponownie.",
};

const cs: SupportT = {
  title: "Potřebujete pomoc?",
  subtitle: "Logistická podpora",
  backToForm: "← Zpět na formulář akreditace",
  intro:
    "Popište svůj požadavek logistickému týmu. Odpověď vám bude zaslána e-mailem.",
  event: "Akce",
  company: "Společnost",
  problemType: "Předmět (typ problému)",
  identification: "Identifikace",
  stand: "Stánek",
  email: "E-mail",
  phone: "Telefon",
  message: "Zpráva",
  selectEvent: "— Vyberte akci —",
  selectProblem: "— Vyberte —",
  companyPlaceholder: "Název společnosti",
  identificationPlaceholder: "SPZ, č. žádosti nebo stánek",
  standPlaceholder: "např. PALAIS 110",
  emailPlaceholder: "vy@priklad.cz",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Popište svůj požadavek…",
  identificationHint:
    "Pomáhá podpoře najít vaši žádost (SPZ vozidla, identifikátor nebo číslo stánku).",
  phoneOptional: "(volitelné)",
  problemAccreditation: "Akreditace",
  problemCreneau: "Časový slot / rozvrh",
  problemZone: "Zóna / přístup",
  problemAutre: "Jiné",
  submit: "Odeslat požadavek",
  successTitle: "Požadavek přijat",
  successMessage:
    "Děkujeme, váš požadavek byl zaregistrován. Logistický tým odpoví na {email} co nejdříve.",
  submitError: "Chyba při odesílání ticketu.",
  networkError: "Chyba sítě, zkuste to znovu.",
};

const lt: SupportT = {
  title: "Reikia pagalbos?",
  subtitle: "Logistikos palaikymas",
  backToForm: "← Atgal į akreditacijos formą",
  intro:
    "Aprašykite savo užklausą logistikos komandai. Atsakymas bus išsiųstas el. paštu.",
  event: "Renginys",
  company: "Įmonė",
  problemType: "Tema (problemos tipas)",
  identification: "Identifikacija",
  stand: "Stendas",
  email: "El. paštas",
  phone: "Telefonas",
  message: "Žinutė",
  selectEvent: "— Pasirinkite renginį —",
  selectProblem: "— Pasirinkite —",
  companyPlaceholder: "Jūsų įmonės pavadinimas",
  identificationPlaceholder: "Valstybinis nr., prašymo nr. arba stendas",
  standPlaceholder: "pvz. PALAIS 110",
  emailPlaceholder: "jus@pavyzdys.lt",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Aprašykite savo užklausą…",
  identificationHint:
    "Padeda palaikymui rasti jūsų prašymą (transporto priemonės numeris, identifikatorius arba stendo numeris).",
  phoneOptional: "(neprivaloma)",
  problemAccreditation: "Akreditacija",
  problemCreneau: "Laiko tarpas / grafikas",
  problemZone: "Zona / prieiga",
  problemAutre: "Kita",
  submit: "Siųsti užklausą",
  successTitle: "Užklausa gauta",
  successMessage:
    "Ačiū, jūsų užklausa užregistruota. Logistikos komanda atsakys į {email} kuo greičiau.",
  submitError: "Klaida siunčiant bilietą.",
  networkError: "Tinklo klaida, bandykite dar kartą.",
};

const tr: SupportT = {
  title: "Yardıma mı ihtiyacınız var?",
  subtitle: "Lojistik desteği",
  backToForm: "← Akreditasyon formuna dön",
  intro:
    "Talebinizi lojistik ekibine açıklayın. E-posta ile yanıt alacaksınız.",
  event: "Etkinlik",
  company: "Şirket",
  problemType: "Konu (sorun türü)",
  identification: "Kimlik",
  stand: "Stand",
  email: "E-posta",
  phone: "Telefon",
  message: "Mesaj",
  selectEvent: "— Etkinlik seçin —",
  selectProblem: "— Seçin —",
  companyPlaceholder: "Şirket adınız",
  identificationPlaceholder: "Plaka, talep no. veya stand",
  standPlaceholder: "örn: PALAIS 110",
  emailPlaceholder: "siz@ornek.com",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Talebinizi açıklayın…",
  identificationHint:
    "Desteğin talebinizi bulmasına yardımcı olur (araç plakası, talep kimliği veya stand numarası).",
  phoneOptional: "(isteğe bağlı)",
  problemAccreditation: "Akreditasyon",
  problemCreneau: "Zaman dilimi / program",
  problemZone: "Bölge / erişim",
  problemAutre: "Diğer",
  submit: "Talebi gönder",
  successTitle: "Talep alındı",
  successMessage:
    "Teşekkürler, talebiniz kaydedildi. Lojistik ekibi en kısa sürede {email} adresine yanıt verecektir.",
  submitError: "Bilet gönderilirken hata oluştu.",
  networkError: "Ağ hatası, lütfen tekrar deneyin.",
};

const ru: SupportT = {
  title: "Нужна помощь?",
  subtitle: "Логистическая поддержка",
  backToForm: "← Вернуться к форме аккредитации",
  intro:
    "Опишите ваш запрос логистической команде. Ответ будет отправлен по электронной почте.",
  event: "Мероприятие",
  company: "Компания",
  problemType: "Тема (тип проблемы)",
  identification: "Идентификация",
  stand: "Стенд",
  email: "E-mail",
  phone: "Телефон",
  message: "Сообщение",
  selectEvent: "— Выберите мероприятие —",
  selectProblem: "— Выберите —",
  companyPlaceholder: "Название компании",
  identificationPlaceholder: "Номер, ID заявки или стенд",
  standPlaceholder: "напр. PALAIS 110",
  emailPlaceholder: "vy@primer.ru",
  phonePlaceholder: "+33 6 12 34 56 78",
  messagePlaceholder: "Опишите ваш запрос…",
  identificationHint:
    "Помогает поддержке найти заявку (номер ТС, идентификатор или номер стенда).",
  phoneOptional: "(необязательно)",
  problemAccreditation: "Аккредитация",
  problemCreneau: "Временной слот / расписание",
  problemZone: "Зона / доступ",
  problemAutre: "Другое",
  submit: "Отправить запрос",
  successTitle: "Запрос получен",
  successMessage:
    "Спасибо, ваш запрос зарегистрирован. Логистическая команда ответит на {email} в ближайшее время.",
  submitError: "Ошибка при отправке тикета.",
  networkError: "Ошибка сети, попробуйте снова.",
};

export const supportTranslations: Record<LangCode, SupportT> = {
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
