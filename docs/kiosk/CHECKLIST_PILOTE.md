# Checklist pilote — kiosque parc Android

> À dérouler **avant** tout déploiement de masse. **Go/No-Go strict** : si une seule case ne passe pas, on ne généralise pas.
>
> Cette checklist couvre les 3 familles de devices. À adapter selon l'ordre choisi (recommandé : 1 G1 → 1 V62 → 1 TC27).

---

## 0. Pré-requis avant de démarrer

- [ ] PWA déployée et visible sur `https://cannes-one-pass-r2.vercel.app/login`.
- [ ] Sur Chrome desktop : F12 → Application → Manifest → **0 erreur**, et icône "Installer l'application" visible dans la barre d'URL.
- [ ] Coffre (Bitwarden/KeePass) prêt avec les entrées : compte Google parc, mots de passe Wi-Fi, PIN admin EHS, mot de passe StageNow Administrator.
- [ ] Tableau de suivi prêt à être renseigné (cf. `README.md` § 6).
- [ ] 1 numéro WhatsApp dédié par device pilote (peut être un numéro test du parc).
- [ ] 1 compte utilisateur Cannes One Pass dédié au device pilote (à créer côté admin de la web app).

---

## 1. Pilote Oukitel G1 (~30 min)

> Suivre `RUNBOOK_OUKITEL_VANWIN.md` étapes 1 → 8.

### Configuration

- [ ] Device configuré (langue FR, Wi-Fi, compte Google parc, PIN écran).
- [ ] Options développeur activées, "Rester actif" ON.
- [ ] WhatsApp installé, numéro dédié configuré, optimisation batterie désactivée.
- [ ] PWA installée via Chrome ("Installer l'application"), s'ouvre **standalone** (pas de barre URL).
- [ ] Optimisation batterie de Chrome désactivée.
- [ ] **Préconnexion utilisateur** : login fait, "Rester connecté" coché si dispo, "Enregistrer le mot de passe" accepté.
- [ ] SureLock installé, toutes permissions accordées.
- [ ] WhatsApp + One Pass ajoutés en Allowed Applications dans SureLock.
- [ ] SureLock défini comme launcher par défaut (toujours).
- [ ] SureLock Settings appliqués selon le tableau du runbook (Run at Startup ON, Auto-launch One Pass, hard keys disabled, etc.).

### Tests fonctionnels (après reboot complet)

- [ ] **Boot direct sur la PWA** : la PWA s'ouvre toute seule au démarrage.
- [ ] HOME → ramène à SureLock avec **2 icônes uniquement**.
- [ ] Tap WhatsApp → s'ouvre. HOME → retour SureLock.
- [ ] Tap One Pass → la PWA s'ouvre. HOME → retour SureLock.
- [ ] Status bar dépliable bloquée (selon réglage choisi).
- [ ] Aucune autre app accessible (test : tenter d'ouvrir Chrome, Settings, Play Store via recherche).
- [ ] Sortie admin : 5 taps + `0000` → menu admin → **Exit SureLock**.
- [ ] Re-Lance SureLock → re-bascule en kiosque.

### Tests non-régression web app

- [ ] Login utilisateur ou session déjà active suite à préconnexion.
- [ ] **3 parcours métier critiques fonctionnent** (à définir par le métier — ex. créer une accréditation, scanner un QR, naviguer dans la liste logisticien).
- [ ] Déconnexion → reconnexion → OK.
- [ ] Hard refresh (sortie admin → Chrome → effacer cache du site → relancer la PWA) → la PWA repart proprement.

### Tests réseau

- [ ] Couper le Wi-Fi → device passe en 4G/5G en ~3 s, PWA reste fonctionnelle.
- [ ] Rétablir le Wi-Fi → bascule auto en ~10 s.
- [ ] Désactiver les données mobiles (mode admin uniquement) → vérifier message offline propre dans la PWA.

### Test mise à jour PWA

- [ ] Faire un **petit changement visible** dans la web app (ex. modifier un texte). Push sur Vercel. Attendre 2 min.
- [ ] Sur le device : fermer la PWA → ré-ouvrir → la nouvelle version doit apparaître **après 1-2 ouvertures** (à cause de la stratégie service worker).

### Test notifications

- [ ] Verrouiller l'écran 2 minutes.
- [ ] Depuis un autre numéro, envoyer un message WhatsApp → notification reçue (son ou badge).
- [ ] Laisser le device en veille 1 heure → renvoyer un message → notification toujours reçue.

### Suivi

- [ ] Ligne renseignée dans le tableau de suivi pour ce device.

---

## 2. Pilote Vanwin V62 (~30 min)

> Mêmes étapes que ci-dessus, plus :

- [ ] **Orientation** figée selon usage (paysage tablette par défaut).
- [ ] **SSID multiples** pré-configurés (la V62 dépend du Wi-Fi pur, pas de SIM).
- [ ] Optimisations batterie constructeur Vanwin : `Paramètres → Batterie → Apps protégées` (ou équivalent) → WhatsApp et Chrome ajoutés.
- [ ] Test autofill mot de passe : la PWA propose-t-elle bien le compte enregistré au prochain login ?
- [ ] Refaire les tests fonctionnels et non-régression de la section précédente.

### Suivi

- [ ] Ligne renseignée dans le tableau de suivi pour ce device.

---

## 3. Pilote Zebra TC27 (~2-3 h, courbe StageNow)

> Suivre `RUNBOOK_ZEBRA_TC27.md` + `zebra/stagenow_profile_README.md`.

### Préparation PC

- [ ] StageNow installé sur PC Windows, mot de passe Administrator créé et stocké dans le coffre.
- [ ] EHS APK téléchargé (version compatible Android du TC27).
- [ ] WhatsApp APK récupéré (officiel, dernière version).
- [ ] `enterprisehomescreen.xml` édité avec un PIN admin propre (différent de `__REMPLACER_PIN_ADMIN__`), stocké dans le coffre.

### Construction profil

- [ ] Profil `CannesOnePass_TC27_v1` créé en MX 11.x.
- [ ] Setting Types Wi-Fi (un par SSID), FileMgr (push XML), AppMgr (install EHS + WhatsApp), AppMgr (set EHS as default home), AccessMgr (whitelist + blacklist), PowerMgr (reboot 10 s).
- [ ] Profil **compilé sans erreur**.
- [ ] PDF de barcodes généré.
- [ ] Profil **exporté** en `.xml`.
- [ ] PDF + XML + APKs **archivés dans le cloud entreprise** (immuable, accès tech parc).

### Staging du device

- [ ] Enterprise Reset effectué.
- [ ] StageNow Client lancé sur le TC27, scan du PDF effectué.
- [ ] Le device a rebooté automatiquement après ~5-10 min.
- [ ] EHS s'affiche au boot avec **2 icônes** (WhatsApp + Cannes One Pass).

### Installation manuelle de la PWA (Étape 5 du runbook)

- [ ] Sortie admin EHS (tap titre + PIN).
- [ ] Chrome ouvert sur l'URL Cannes One Pass.
- [ ] PWA installée via menu Chrome ("Installer l'application").
- [ ] **Préconnexion utilisateur** : login fait, mot de passe enregistré côté Chrome.
- [ ] Retour User Mode EHS.

### Tests fonctionnels

- [ ] Reboot complet → EHS s'affiche, 2 icônes uniquement.
- [ ] Tap WhatsApp → s'ouvre, HOME → retour EHS.
- [ ] Tap Cannes One Pass → la PWA s'ouvre, HOME → retour EHS.
- [ ] Sortie admin par tap titre + PIN → bascule **Switch to Admin Mode** OK.
- [ ] Re-bascule en User Mode OK.
- [ ] DataWedge / scanner barcode jaune (si métier l'utilise) : à tester.

### Tests non-régression web app + réseau + notifs

> Reproduire les mêmes tests que pour la section Oukitel/Vanwin.

- [ ] 3 parcours métier critiques OK.
- [ ] Bascule Wi-Fi ↔ 4G/5G OK (si SIM).
- [ ] Notifications WhatsApp en arrière-plan OK.
- [ ] Mise à jour PWA récupérée après push Vercel.

### Suivi

- [ ] Ligne renseignée dans le tableau de suivi pour ce TC27.
- [ ] PDF de barcodes archivé sous nom versionné (`CannesOnePass_TC27_v1_barcodes.pdf`).

---

## 4. Décision Go / No-Go pour déploiement de masse

À cocher seulement après validation des **3 sections ci-dessus** :

- [ ] Toutes les cases pilote G1 sont vertes.
- [ ] Toutes les cases pilote V62 sont vertes.
- [ ] Toutes les cases pilote TC27 sont vertes.
- [ ] **Aucune régression métier** détectée pendant les tests des 3 parcours critiques.
- [ ] Notifications WhatsApp fiables sur les 3 familles.
- [ ] Mise à jour PWA récupérée correctement sur les 3 familles.
- [ ] Sortie admin testée et fonctionnelle sur les 3 familles.

> **Si toutes les cases sont vertes → GO** : passer au déploiement masse (2 G1 + 2 V62 restants, ~30 min/device en suivant le runbook). Les futurs TC27 = juste re-scan du PDF + Étape 5.
>
> **Si une seule case est rouge → NO-GO** : documenter l'incident, ajuster, re-tester, ne pas généraliser tant que ce n'est pas vert.

---

## 5. Rollback (si comportement de la PWA dégrade un device en exploitation)

> Procédure de secours si la PWA déclenche un bug bloquant après mise à jour Vercel.

1. **Identifier la version Vercel cassante** : Dashboard Vercel → Deployments → trouver la dernière "OK" et la nouvelle "KO".
2. **Rollback Vercel** : promouvoir le dernier déploiement "OK" en production. La PWA récupère cette version au prochain refresh.
3. **Sur les devices qui ne se mettent pas à jour rapidement** : sortie admin → Chrome → effacer cache du site → relancer la PWA.
4. Si nécessaire, désinstaller et réinstaller la PWA :
   - Sortie admin → long press sur l'icône PWA → désinstaller.
   - Chrome → URL → menu → Installer l'application.
   - Re-préconnexion + retour kiosque.
