# Runbook kiosque — Oukitel G1 et Vanwin V62

> Procédure à appliquer **device par device**. Cible : 3 Oukitel G1 + 3 Vanwin V62. Outil : **SureLock free** (limite 2 apps : WhatsApp + PWA Cannes One Pass).
>
> Coût : 0 €. Durée : ~25 min/device la première fois, ~10 min ensuite.
> Lis aussi `README.md` (politique générale) et `docs/kiosk/CHECKLIST_PILOTE.md` (validation avant déploiement de masse).

---

## Pré-requis (à faire **une seule fois** avant tout déploiement)

- PWA Cannes One Pass installable (vérifié sur Chrome desktop : icône "Installer l'application" visible dans la barre d'URL sur `https://cannes-one-pass-r2.vercel.app/login`).
- Compte Google "jetable" du parc créé (par exemple `cannesonepass.devices@gmail.com`) avec un mot de passe stocké dans le coffre.
- Pour chaque device : un numéro de téléphone WhatsApp dédié (un numéro = un device).
- Tableau de suivi prêt (voir `README.md`) avec une ligne par device : marque/modèle, IMEI/numéro de série, numéro WhatsApp, PIN écran, date de mise en service.

---

## Étape 1 — Premier démarrage et configuration de base

1. Allume l'appareil.
2. Langue : **Français**.
3. Wi-Fi : connecte tous les SSID que l'appareil doit connaître (bureau, salle, événement, etc.). Saisis les mots de passe maintenant, ils seront verrouillés ensuite.
4. Compte Google : connecte le **compte du parc** (tu en as besoin pour Play Store).
5. Saute toutes les options inutiles (assistant Google, sauvegarde, empreinte si tu n'en veux pas, ou empreinte du tech qui gère le parc).
6. Définis un **PIN d'écran de verrouillage** différent du PIN admin SureLock. Note-le dans le coffre.

## Étape 2 — Activer les options développeur

1. `Paramètres → À propos du téléphone` → tap **7×** sur **Numéro de build**.
2. Reviens dans `Paramètres → Système → Options pour les développeurs`.
3. Active :
   - **Rester actif** (l'écran reste allumé pendant la charge — utile pour kiosque).
   - **Débogage USB** (utile pour ADB de secours).
4. Désactive **Déverrouillage OEM** s'il est présent (empêche flash bootloader).

## Étape 3 — Réglages système

1. `Paramètres → Affichage → Veille` : **30 minutes** ou **Jamais** selon usage.
2. `Paramètres → Affichage → Rotation auto` : OFF (figer en portrait pour téléphones, paysage pour tablettes selon usage).
3. `Paramètres → Sons` : désactive les clics et sons de verrouillage (optionnel).
4. `Paramètres → Réseau → Préférences avancées → Basculer vers les données mobiles` : **ON** (bascule auto Wi-Fi ↔ 4G/5G).

## Étape 4 — Installer WhatsApp et configurer le compte

1. Play Store → **WhatsApp Messenger** → installer.
2. Ouvre WhatsApp → conditions → numéro de téléphone **dédié à cet appareil** → vérification SMS.
3. Configure le profil (nom, photo).
4. Restaure une sauvegarde si nécessaire.

**CRUCIAL — désactiver l'optimisation batterie :**

5. `Paramètres → Applications → WhatsApp → Batterie` → **Sans restriction** (ou "Non optimisée").
6. `Paramètres → Applications → WhatsApp → Notifications` : tout activé.

**Test rapide** : depuis un autre appareil, envoie un message → tu dois recevoir la notification. Verrouille l'écran 1 min, renvoie un message → la notif doit toujours arriver.

## Étape 5 — Installer la PWA Cannes One Pass

1. Ouvre **Chrome** (préinstallé).
2. URL : `https://cannes-one-pass-r2.vercel.app/login`.
3. Attends que la page charge **complètement** (le service worker s'enregistre en arrière-plan, ~5–10 s).
4. Menu Chrome (3 points en haut à droite) → cherche **"Installer l'application"** ou **"Ajouter à l'écran d'accueil"**.
5. Confirme. Vérifie qu'une icône **"One Pass"** apparaît sur l'écran d'accueil.
6. Tape sur l'icône : la PWA doit s'ouvrir **plein écran, sans barre d'URL Chrome**.
7. **CRUCIAL — désactiver l'optimisation batterie pour Chrome aussi** :
   - `Paramètres → Applications → Chrome → Batterie` → **Sans restriction**.

> Si la barre d'URL Chrome apparaît encore : la PWA n'est pas en mode standalone. Vérifie que `manifest.webmanifest` se charge sans erreur (Chrome desktop : F12 → Application → Manifest). Ne continue pas avant que la PWA soit propre.

## Étape 5.bis — Préconnexion utilisateur (mode kiosque pro)

> Objectif : l'utilisateur final ne doit **jamais** voir l'écran de login au quotidien.

1. Dans la PWA, saisis les identifiants utilisateur **dédiés au device** (compte propre à cet appareil, pas un compte personnel d'un agent).
2. Quand Chrome propose **"Enregistrer le mot de passe"** : accepte.
3. Coche **"Rester connecté"** si l'option existe sur l'écran de login.
4. Vérifie que la session reste active après :
   - fermeture de la PWA depuis les apps récentes,
   - reboot complet du device.
5. Note dans le coffre les identifiants utilisés sur cet appareil.

## Étape 6 — Installer SureLock

1. Play Store → **SureLock Kiosk Lockdown** (éditeur 42Gears Mobility Systems) → installer.
2. Ouvre SureLock.
3. SureLock va demander une à une les permissions suivantes — **accepte tout** :
   - **Device Administrator** → Activer.
   - **Accessibility Service** → Paramètres → Accessibilité → SureLock → ON.
   - **Draw over other apps** → Autoriser.
   - **Usage Access** → Autoriser.
   - **Modify system settings** → Autoriser.
   - **Auto-start at boot** (selon Android) → Autoriser.

## Étape 7 — Configurer SureLock

> Mot de passe par défaut : `0000` (impossible à changer en version gratuite).

1. Dans SureLock, **5 taps rapides** sur l'écran (ou icône menu en haut à droite) → saisis `0000` → menu admin.
2. **Add Application** → liste des apps installées :
   - Coche **WhatsApp**.
   - Coche **One Pass** (la PWA, si elle apparaît bien comme app native).
3. **Si la PWA n'apparaît pas dans la liste** : Chrome a créé un raccourci au lieu d'un WebAPK. Désinstalle la PWA (long press → désinstaller), recharge la page Chrome, et réinstalle. Si le problème persiste : whitelister Chrome entier (moins propre, mais fonctionnel).

### SureLock Settings (menu admin)

| Réglage | Valeur | Justification |
|---|---|---|
| Run at Startup | **ON** | Lance SureLock dès le boot |
| Auto-launch app at startup | **One Pass** | L'utilisateur tombe direct sur la PWA |
| Hide Bottom Bar | **ON** | Cache la barre de nav système |
| Disable Status Bar Pulldown | **ON** | Empêche d'ouvrir les paramètres rapides |
| Hide Status Bar | **OFF** | Garde le statut Wi-Fi/batterie visible |
| Single App Mode | **OFF** | On veut 2 apps |
| Disable Hard Keys → Home | **ON** | HOME ramène à SureLock uniquement |
| Disable Hard Keys → Recent Apps | **ON** | Empêche le multitâche |
| Disable Hard Keys → Volume | **OFF** | Garde le réglage du son |
| Disable USB Connection | **ON** | Empêche montage stockage par câble |
| Disable Safe Mode | **ON** (si dispo) | Empêche le contournement par safe boot |

4. **Définir SureLock comme launcher par défaut** :
   - Quitte SureLock (bouton Home).
   - Android demande quel launcher utiliser : **SureLock → Toujours**.
   - Si Android ne demande pas : `Paramètres → Applications → Apps par défaut → Application d'accueil → SureLock`.

## Étape 8 — Validation

1. Reboot complet du device.
2. Au démarrage, **la PWA doit s'ouvrir automatiquement plein écran**.
3. Bouton HOME → ramène à SureLock avec **2 icônes uniquement** (WhatsApp + One Pass).
4. Tape WhatsApp → s'ouvre. Bouton HOME → retour SureLock.
5. Tape One Pass → la PWA s'ouvre. Bouton HOME → retour SureLock.
6. Tire la barre de notif → bloquée (ou réduite, sans accès aux paramètres rapides).
7. Tente d'ouvrir une autre app par recherche/menu → impossible.
8. Sortie admin : 5 taps rapides sur SureLock → `0000` → **Exit SureLock** (en bas du menu).
9. Vérifie qu'on retombe bien sur le launcher Android natif (mode admin).
10. Re-Lance SureLock → re-bascule en kiosque.

## Étape 9 — Validation utilisateur (checklist non-régression PWA)

À faire **avant** de déployer sur les autres devices.

- [ ] Login utilisateur valide (ou session déjà active suite à préconnexion).
- [ ] Au moins 3 parcours métier critiques fonctionnent (ex. accréditation, scan QR, page logisticien — adapter selon usage réel).
- [ ] Déconnexion + reconnexion OK.
- [ ] Hard refresh (sortie admin → ouvrir Chrome → `chrome://flags` → effacer cache de la PWA) → la PWA repart proprement.
- [ ] Bascule Wi-Fi ↔ 4G : couper le Wi-Fi, vérifier que la PWA reste fonctionnelle en 4G/5G.
- [ ] Push d'une nouvelle release Vercel : la PWA récupère bien la nouvelle version après ré-ouverture (peut nécessiter 2 ouvertures successives à cause de `skipWaiting`).
- [ ] Notifications WhatsApp arrivent même PWA ouverte au premier plan.

## Étape 10 — Particularités Vanwin V62 (tablette)

- **Format tablette** : décide de l'orientation (paysage souvent plus pratique pour la PWA et WhatsApp Web-like).
- **Pas de SIM** sur la majorité des V62 : dépendant du Wi-Fi pur. **Pré-configure tous les SSID nécessaires** avant verrouillage.
- **Optimisations batterie agressives** : double-checker `Paramètres → Batterie → Apps protégées` (ou équivalent constructeur) pour WhatsApp + Chrome.
- Si compte Google **non obligatoire** au setup : tu peux skip et installer SureLock + WhatsApp via APK sideload (clé USB OTG ou ADB), mais **garder Play Store présent** pour les MAJ silencieuses de WhatsApp.

---

## Sortie kiosque pour maintenance

1. SureLock affiché → **5 taps rapides** sur l'écran.
2. Saisis `0000`.
3. Menu admin :
   - Modifier la liste des apps autorisées (rare).
   - **Exit SureLock** (en bas) pour revenir au launcher Android (corrections poussées, MAJ système, etc.).
4. Pour rebasculer en kiosque : ouvre SureLock manuellement et choisis "Toujours" si Android redemande le launcher par défaut.

## Mise à jour de la PWA — aucune action sur le device

- Tu push sur Vercel → le service worker récupère la nouvelle version à la **prochaine ouverture** de la PWA.
- Stratégie cache : `NetworkFirst` sur la navigation et `StaleWhileRevalidate` sur les assets (réglé via Serwist `defaultCache`). Donc la PWA n'affichera pas de version trop ancienne dès qu'il y a réseau.
- Si une fois sur 1000 un device reste collé sur une ancienne version : sortie admin → ouvrir Chrome → `chrome://flags/#unsafely-treat-insecure-origin-as-secure` (non) — utilise plutôt `Paramètres Chrome → Confidentialité → Effacer les données → cibler le site` puis relancer la PWA.

## Mise à jour de WhatsApp

- WhatsApp expire automatiquement ~6 mois après une release majeure si l'app n'est pas mise à jour.
- **Ne désactive PAS Play Store** ; laisse-le installé mais pas dans la liste des apps visibles SureLock. Les MAJ se feront en arrière-plan via le compte Google du parc.
- Vérifie tous les ~2 mois (sortie admin → ouvrir Play Store → MAJ disponibles).

## Mot de passe oublié / device compromis

| Cas | Action |
|---|---|
| PIN écran perdu | Factory reset (volume bas + power au boot) → tout reconfigurer (~30 min) |
| PIN SureLock perdu (`0000` par défaut, donc rare) | Factory reset → tout reconfigurer |
| Compte Google parc compromis | Réinitialiser mot de passe sur compte de récupération, repush |
| Device perdu/volé | Find My Device (associé au compte Google parc) → wipe à distance |

---

## Récapitulatif des informations à archiver pour ce device

À renseigner dans le tableau de suivi (voir `README.md`) :

- Marque / modèle (Oukitel G1 ou Vanwin V62).
- Numéro de série / IMEI.
- Numéro WhatsApp dédié.
- Compte Google (du parc).
- Identifiants utilisateur Cannes One Pass utilisés en préconnexion.
- PIN écran (différent par device).
- PIN SureLock : `0000` (commun à tous, version gratuite).
- Date de mise en service.
- Référent technique.
