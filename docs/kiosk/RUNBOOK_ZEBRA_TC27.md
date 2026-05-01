# Runbook kiosque — Zebra TC27

> Cible : 1 unité actuelle, extensible. Outils : **StageNow** (provisioning par barcode) + **Enterprise Home Screen (EHS)** (launcher kiosque). 100% gratuit côté Zebra.
>
> Avantage clé : une fois le profil StageNow créé, **chaque futur TC27 = factory reset + scan barcode + 10 min** = device prêt.
>
> Lis aussi `README.md` (politique générale) et `CHECKLIST_PILOTE.md` (validation avant déploiement).

---

## Architecture cible TC27

```
Boot TC27
  └─► EHS (launcher verrouille, package com.zebra.mdna.enterprisehomescreen)
        ├─► Icone "WhatsApp" (com.whatsapp)
        └─► Icone "Cannes One Pass" (raccourci Chrome PWA, com.android.chrome)
            └─ tap titre EHS + PIN admin = sortie en User/Admin Mode
```

---

## Pré-requis (PC Windows administrateur)

- Compte Zebra (gratuit) sur `zebra.com/us/en/support-downloads.html`.
- **StageNow** dernière version (`zebra.com/.../stagenow.html`). .NET requis (l'installeur le gère).
- **EHS APK** dernière version compatible Android 13/14 (`zebra.com/.../enterprise-home-screen.html`). Le TC27 supporte EHS à partir de `6.3.35` (Android 13) et `7.x` (Android 14). Vérifie la version Android du device avant de télécharger.
- **WhatsApp APK** : depuis Play Store sur le device au premier setup, ou téléchargé sur APKMirror et stagé via App Manager.
- **Mot de passe StageNow Administrator** : choisi à la première install et **non récupérable**. **À noter immédiatement dans le coffre.**
- Un PIN admin EHS choisi (à renseigner dans `enterprisehomescreen.xml`).

---

## Étape 1 — Reset propre du TC27

1. Éteins le TC27.
2. Maintiens **Power + bouton scan jaune** (combinaison TC27 standard, vérifier sur `techdocs.zebra.com` selon ta release Android) jusqu'à entrer en recovery.
3. Choisis **Enterprise Reset** (préserve `/enterprise/`, idéal pour stager).
4. Reboot.
5. Skipper l'assistant Google (StageNow le fait aussi automatiquement si tu as le Setting Type "Skip Setup Wizard" dans ton profil).

## Étape 2 — Préparer les fichiers de déploiement

> Sur le PC Windows, dans le dossier `docs/kiosk/zebra/` du repo, tu trouves :
> - `enterprisehomescreen.xml` — config EHS (édite le PIN admin avant de stager).
> - `stagenow_profile_README.md` — la procédure pour reconstruire le profil StageNow.

1. Ouvre `enterprisehomescreen.xml` dans un éditeur texte.
2. Remplace `__REMPLACER_PIN_ADMIN__` par ton PIN admin choisi (en clair pour un premier test, on l'encryptera après).
3. Sauvegarde.
4. Récupère l'APK EHS (`EHS-x.x.x.apk`) et l'APK WhatsApp dans le même dossier que ton profil StageNow.

> **Note** : la syntaxe XML EHS varie légèrement entre 6.x et 7.x. Le template fourni couvre les cas standards. Si EHS refuse de charger : récupère le template officiel sur `techdocs.zebra.com/ehs/` et adapte.

## Étape 3 — Créer le profil StageNow

1. Lance **StageNow Administrator** sur le PC. Saisis ton mot de passe Administrator.
2. **Create New Profile** → MX version la plus récente compatible (MX 11.x pour Android 13+).
3. Nom : `CannesOnePass_TC27_v1`.
4. Wizard : **Xpert Mode**.

### Setting Types à ajouter (dans l'ordre)

1. **Wi-Fi (WifiMgr)** — un par SSID à pré-charger
   - SSID, Security (WPA2/WPA3), password.
   - Auto-connect : ON.
   - Répète pour chaque SSID prod.
2. **File Transfer (FileMgr)**
   - Source : `enterprisehomescreen.xml` (sur ton PC).
   - Destination : `/enterprise/usr/enterprisehomescreen.xml`.
   - Permissions : `644`.
3. **App Install (AppMgr)** — pour EHS APK
   - Source : `EHS-x.x.x.apk`.
   - Action : Install.
4. **App Install (AppMgr)** — pour WhatsApp APK
   - Source : `WhatsApp.apk` (ou skip si tu installes ensuite via Play Store).
   - Action : Install.
5. **App Manager (AppMgr) — Set Default Home App**
   - Action : Set as Default Home App.
   - Package : `com.zebra.mdna.enterprisehomescreen`.
6. **Access Manager (AccessMgr) — restrictions**
   - Disable USB debugging : OFF (laisse ON pendant le pilote, ferme après validation).
   - Disable Factory Reset : ON.
   - Disable Status Bar Expansion : selon ton choix notif (laisser OFF si tu veux les notifs WhatsApp dépliables).
   - Whitelist apps : `com.whatsapp`, `com.android.chrome`, `com.zebra.mdna.enterprisehomescreen`.
   - Blacklist : `com.android.settings` (évite le contournement), `com.google.android.youtube`, `com.google.android.apps.maps`.
7. **Power Manager (PowerMgr)**
   - Action : Reboot, delay 10s. **Force le reboot** pour que EHS devienne le launcher par défaut.

### Compile et publish

1. **Compile** → StageNow vérifie le profil.
2. **Publish** → choisis **Staging Client → Barcode (PDF417)**.
3. StageNow génère un PDF avec **1 ou plusieurs barcodes**. Imprime ou affiche sur écran. **Archive ce PDF** (c'est ton "image disque" pour les futurs TC27).
4. **Export profile** (bouton "Export for StageNow") : récupère un fichier XML que tu pourras ré-importer plus tard sur un autre PC.

## Étape 4 — Stager le TC27

1. Sur le TC27 fraîchement reset, ouvre l'app **StageNow** (préinstallée).
2. Le client lance la caméra/scanner.
3. Scanne le premier barcode (en cas de série, suis l'ordre indiqué par le PDF).
4. Le TC27 exécute : Wi-Fi configuré, fichiers transférés, apps installées. Compte **5–10 min**.
5. Le TC27 reboote automatiquement.

## Étape 5 — Installer la PWA Cannes One Pass sur le TC27

> EHS ne crée pas la PWA tout seul. À faire manuellement sur le device en mode admin une fois EHS actif.

1. Sors EHS en mode admin (tap sur le titre/menu admin → saisir PIN admin).
2. Ouvre **Chrome**.
3. URL : `https://cannes-one-pass-r2.vercel.app/login`.
4. Attends que la page charge complètement (~5–10 s).
5. Menu Chrome → **Installer l'application**. Confirme.
6. Vérifie sur l'écran d'accueil Android natif (avant rebascule en EHS) qu'une icône PWA "One Pass" est apparue.
7. Préconnexion : ouvre la PWA, login avec les identifiants utilisateur dédiés au TC27, accepte "Enregistrer le mot de passe" si proposé.
8. Repasse en mode utilisateur EHS (tap admin titre → "Switch to User Mode").

> Le `<ChromeShortcut>` dans `enterprisehomescreen.xml` lance Chrome sur l'URL de la PWA. Si Chrome a bien créé une WebAPK propre, le `<ChromeShortcut>` ouvrira la version standalone (sans barre URL). Sinon il ouvrira Chrome avec la barre. Pour le **vrai plein écran sans barre URL**, deux options pro :
> - Utiliser **Zebra Enterprise Browser (EB)** (gratuit) à la place de Chrome — plus robuste en environnement industriel. Voir `techdocs.zebra.com/enterprise-browser`.
> - Utiliser la technique **Pinned Shortcut** (blog Ian Hatton sur `developer.zebra.com`) qui capture le raccourci PWA Chrome dans EHS.

## Étape 6 — Validation

1. Reboot complet du TC27.
2. EHS s'affiche, **deux icônes uniquement** (WhatsApp + Cannes One Pass).
3. Tap WhatsApp → s'ouvre. HOME → retour à EHS.
4. Tap Cannes One Pass → la PWA s'ouvre. HOME → retour à EHS.
5. Tirer la barre de notif → bloquée si tu as mis `<DisableStatusBar>true` ou réduite si OFF (selon ton choix notif).
6. Bouton scan jaune (barcode) : à tester si l'app a besoin du scanner — DataWedge doit fonctionner. Si non, ajouter un profil DataWedge à ton StageNow.
7. Sortie admin : tap sur titre/menu EHS en haut → saisir PIN admin → **Switch to Admin Mode** (apps cachées redeviennent visibles).
8. Re-tap titre admin → **Switch to User Mode** : retour kiosque.

## Étape 7 — Cloner pour les futurs TC27

Pour chaque nouveau TC27 acheté :

1. **Enterprise Reset** sur le device.
2. Ouvrir StageNow Client.
3. Scanner le **PDF de barcodes** archivé en Étape 3.
4. Attendre 5–10 min.
5. Faire l'**Étape 5** (installer la PWA via Chrome — étape manuelle car Chrome doit créer la WebAPK).
6. Device prêt.

> Si tu changes le PIN admin EHS, le PIN d'un Wi-Fi, ou ajoutes une app : reconstruire un nouveau profil StageNow (incrément `_v2`, `_v3`...) et archiver le nouveau PDF.

---

## Pièges connus côté Zebra (à savoir)

- **Boot-loop Android 13** : peut survenir si `com.android.settings` est désactivé via EHS au moment d'une mise à jour OS. Réactive "System Settings Access" avant chaque upgrade LifeGuard.
- **Mot de passe StageNow Admin non récupérable** : si tu le perds, réinstaller StageNow et tous les profils non exportés sont perdus. **Toujours exporter** chaque profil.
- **DataWedge restauré** : si tu pousses un profil DataWedge, le scanner StageNow peut casser temporairement. Relancer le client StageNow.
- **EHS package** : depuis EHS 5.0+, le package est `com.zebra.mdna.enterprisehomescreen` (avant : `com.symbol.enterprisehomescreen`). Si une ancienne version est présente : désinstaller via AppMgr avant de stager.
- **Reset config XML** : sur certains EHS 6.x/7.x Android 13/14, pousser un nouveau XML sans reboot peut réinitialiser la config. Toujours faire le reboot via PowerMgr en fin de profil.

---

## Mise à jour PWA / WhatsApp

- **PWA** : aucune action sur le device. Push Vercel → le service worker récupère à la prochaine ouverture (`NetworkFirst` côté Serwist).
- **WhatsApp** : tous les ~3 mois, télécharger le nouvel APK officiel et le pousser via un mini profil StageNow (juste un App Install AppMgr → upgrade). Alternative : laisser Play Store accessible en arrière-plan (whitelist sans icône visible) mais sur Zebra c'est moins clean qu'un push contrôlé.

## Sortie kiosque pour maintenance

1. Tap sur le titre/menu admin en haut d'EHS.
2. Saisir PIN admin (`__REMPLACER_PIN_ADMIN__` que tu as configuré).
3. EHS bascule en **Admin Mode** : toutes les apps cachées redeviennent accessibles.
4. Pour rebasculer : tap titre → **Switch to User Mode**.

## Recovery si PIN admin EHS perdu

1. Enterprise Reset (Power + scan jaune au boot → Enterprise Reset).
2. Re-stager avec le PDF de barcodes archivé.
3. Re-installer la PWA (Étape 5).

---

## Récapitulatif à archiver

Dans le coffre + le tableau de suivi :

- Numéro de série du TC27.
- Version Android (`Paramètres → À propos`).
- Version EHS installée.
- Version MX du device (utile pour StageNow).
- PIN admin EHS de **ce** device.
- Identifiants utilisateur Cannes One Pass préconnectés.
- Numéro WhatsApp dédié + compte Google associé.
- Mot de passe StageNow Administrator (commun à tous, sur le PC).
- Chemin du PDF de barcodes du profil v1 (stockage immuable, ex. cloud entreprise).
