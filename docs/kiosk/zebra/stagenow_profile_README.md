# Profil StageNow `CannesOnePass_TC27_v1`

> Procédure de **construction** et **export** du profil StageNow associé au TC27. À garder comme source de vérité pour reconstruire le profil si l'export `.xml` est perdu, ou pour incrémenter en `_v2`.
>
> Cible : MX 11.x / Android 13–14 / EHS 6.3.x ou 7.x.

---

## Pré-requis avant d'ouvrir StageNow

1. PC Windows avec **StageNow** installé. Mot de passe Administrator déjà créé et stocké dans le coffre.
2. Dossier de travail (par exemple `C:\StageNow\CannesOnePass\v1\`) contenant :
   - `enterprisehomescreen.xml` (copie du fichier de ce dossier, **PIN admin déjà remplacé**).
   - `EHS-x.x.x.apk` (téléchargé depuis `zebra.com/.../enterprise-home-screen.html`).
   - `WhatsApp.apk` (téléchargé depuis APKMirror, version officielle, à jour).
3. Liste des SSID Wi-Fi à pré-charger (avec mots de passe).
4. PIN admin EHS choisi (le même que dans `enterprisehomescreen.xml`).

---

## Construction du profil pas à pas

> Lance **StageNow Administrator** → saisis ton mot de passe → **Create New Profile**.

### Configuration générale

| Champ | Valeur |
|---|---|
| Profile Name | `CannesOnePass_TC27_v1` |
| MX Version | `11.7` (ou la plus récente supportée par le device — vérifier via "View Client Info") |
| Wizard Mode | **Xpert Mode** |

### Setting Types à empiler (ordre exact)

#### 1. Wi-Fi (`WifiMgr`)

Un Setting Type **par SSID** à pré-charger.

- Action : Add Network.
- SSID : `<NOM_DU_RESEAU>`.
- Security Type : `WPA2-Personal` (ou ce qui correspond).
- Pre-Shared Key : `<MOT_DE_PASSE>`.
- Auto-connect : `Enabled`.

> Au minimum, configure le SSID du bureau + le SSID de l'événement.

#### 2. File Transfer (`FileMgr`)

- Action : `Transfer/Copy file`.
- Target Access Method : `File on Device`.
- Source : `enterprisehomescreen.xml` (sélectionne le fichier sur le PC).
- Target File on Device : `/enterprise/usr/enterprisehomescreen.xml`.
- Permissions : `644` (lecture pour tout le monde, écriture pour le proprio).

#### 3. App Install (`AppMgr`) — Enterprise Home Screen

- Action : `Install`.
- Target Access Method : `File on Device` (StageNow embarque l'APK dans le profil).
- Source : `EHS-x.x.x.apk`.
- App Type : System (si le device le permet pour rendre EHS difficile à désinstaller) sinon User.

#### 4. App Install (`AppMgr`) — WhatsApp

- Action : `Install`.
- Source : `WhatsApp.apk`.
- App Type : User.

> Alternative : laisser Play Store gérer WhatsApp. Mais pour rester sur un déploiement reproductible, on stage l'APK.

#### 5. App Manager (`AppMgr`) — Set Default Home App

- Action : `Set as Default Home App`.
- Package : `com.zebra.mdna.enterprisehomescreen`.

#### 6. Access Manager (`AccessMgr`) — restrictions

| Sous-réglage | Valeur |
|---|---|
| Disable Factory Reset | `Disable` (= bloque le reset utilisateur) |
| Disable USB Debugging | `Enable` (laisse ON pendant le pilote ; mettre `Disable` pour la prod) |
| Disable Status Bar Expansion | `Allow` (laisse les notifs WhatsApp dépliables) |
| Whitelist Apps | `com.whatsapp`, `com.android.chrome`, `com.zebra.mdna.enterprisehomescreen`, `com.zebra.mdna.stagenow` |
| Blacklist Apps | `com.android.settings`, `com.google.android.youtube`, `com.google.android.apps.maps`, `com.android.vending` (Play Store, à ne PAS blacklister si tu comptes sur les MAJ auto) |

> **Attention Play Store** : le blacklister coupera les MAJ silencieuses de WhatsApp et de Chrome. Recommandation : ne PAS le blacklister, juste éviter qu'il soit lancé par l'utilisateur (EHS le cache de toute façon car il n'est pas dans `<Applications>`).

#### 7. Power Manager (`PowerMgr`)

- Action : `Reboot`.
- Delay : `10` secondes.

> Indispensable : c'est le reboot qui rend EHS effectif comme launcher par défaut.

### Compile, Test, Stage

1. **Compile** → StageNow vérifie le profil (corrige les erreurs MX si besoin).
2. **Publish** → choisis **Staging Client** → format **Barcode (PDF417)** → langue : `English`.
3. StageNow génère :
   - Le PDF de barcodes (à imprimer ou afficher).
   - Un fichier de profil exporté (`.xml`).
4. **Archive** dans le cloud entreprise (Drive, S3, …) :
   - `CannesOnePass_TC27_v1_barcodes.pdf`
   - `CannesOnePass_TC27_v1.xml` (export profil)
   - `EHS-x.x.x.apk` (l'APK utilisé)
   - `WhatsApp_<version>.apk`
   - `enterprisehomescreen.xml` (avec le PIN admin tel qu'utilisé)

> **L'archive est ton "image disque"**. Pour stager un nouveau TC27, il suffit de récupérer ces fichiers et de scanner le PDF.

---

## Versionnage du profil

Crée un **nouveau profil** à chaque changement substantiel :

| Version | Changement | Date |
|---|---|---|
| v1 | Premier déploiement (WhatsApp + PWA, EHS, accès admin, Wi-Fi prod) | _à remplir_ |
| v2 | _exemple : ajout SSID événement, MAJ WhatsApp APK_ | _à remplir_ |

Ne **jamais** écraser le profil v1 archivé. Il sert de baseline en cas de retour arrière.

---

## Recovery du PC StageNow Administrator

Si le PC StageNow tombe :

1. Réinstaller StageNow sur un nouveau PC Windows.
2. Saisir le **mot de passe Administrator** stocké dans le coffre (sinon → réinstall complète, profils non-exportés perdus).
3. Importer le profil exporté `CannesOnePass_TC27_v1.xml`.
4. Replacer les APK et `enterprisehomescreen.xml` dans le dossier de travail.
5. Reproduire la séquence Compile → Publish si tu as besoin de regénérer un PDF.

---

## Tests à faire APRÈS staging d'un device

À cocher à chaque nouveau TC27 stagé (voir aussi `CHECKLIST_PILOTE.md`) :

- [ ] EHS s'affiche au boot avec **2 icônes uniquement**.
- [ ] WhatsApp s'ouvre, HOME ramène à EHS.
- [ ] Cannes One Pass s'ouvre, HOME ramène à EHS.
- [ ] Notifications WhatsApp arrivent quand l'écran est verrouillé.
- [ ] Tirage barre de notif → comportement attendu (selon `<DisableStatusBar>`).
- [ ] Sortie admin par tap titre + PIN fonctionne.
- [ ] Reboot complet → retour à EHS automatique.
- [ ] Bascule Wi-Fi ↔ 4G OK (si SIM présente).
- [ ] Push d'une nouvelle release Vercel → la PWA récupère bien la nouvelle version.
- [ ] Scanner barcode jaune fonctionne (si DataWedge utilisé).
