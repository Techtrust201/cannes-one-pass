# Durcissement sécurité Neon (base primaire)

Ce dossier contient les scripts d'audit et de hardening pour la base
**Neon production** — la base primaire utilisée par l'app Next.js via Prisma.

## Différence fondamentale avec Supabase

| Aspect | Neon | Supabase |
|---|---|---|
| Connexion app | Prisma + pg (serveur ↔ serveur, port 5432) | (idem pour les scripts de sync) |
| API REST publique exposée par défaut | **Non** | **Oui** (PostgREST avec clé `anon`) |
| RLS critique pour la sécurité ? | **Non** (pas d'attaque possible sans le mot de passe Postgres) | **Oui** (sinon n'importe qui peut lire via `/rest/v1/...`) |
| Quoi durcir | Index FK + Protect branch + Snapshots | RLS + REVOKE anon + Sensitive columns |

**Conclusion** : sur Neon, pas besoin d'activer RLS (et le faire serait
même contre-productif sans policy). On se concentre sur la **perf** (index)
et la **résilience opérationnelle** (protect branch, snapshots).

---

## Ordre d'exécution recommandé

| # | Action | Où | Temps | Risque |
|---|---|---|---|---|
| 1 | `00_diagnostic_before.sql` | Neon SQL Editor | 1 min | Zéro (read-only) |
| 2a | Laisser `vercel-build` appliquer la migration FK indexes | Auto au prochain push | Auto | Très faible |
| 2b | OU `01_apply_fk_indexes.sql` manuellement | Neon SQL Editor | 1 min | Très faible |
| 3 | Activer **Protect branch** sur `production` | Neon Dashboard (clic) | 30 sec | Zéro |
| 4 | Configurer **Snapshot schedule** | Neon Dashboard (clic) | 30 sec | Zéro |
| 5 | (Optionnel) Augmenter le **History window** (PITR) | Neon Dashboard → Settings | 1 min | Zéro |
| 6 | Rotation des secrets | Dashboards externes | 10 min | Faible (re-deploy nécessaire) |

---

## 1. Diagnostic préalable (read-only)

Aller sur `console.neon.tech` → projet → branche `production` → **SQL Editor**.

Coller `00_diagnostic_before.sql` et **Run**. Vérifier :

| Section | Ce qu'on doit voir |
|---|---|
| 1. Identité session | `current_user = palais_des_festivals_owner` |
| 2. Rôles | Pas de rôle inattendu avec `can_login = true` |
| 3. Owners | Toutes les tables appartiennent à `palais_des_festivals_owner` |
| 4. Droits autres rôles | Idéalement **0 ligne** retournée |
| 5. Extensions | Pas de `pg_graphql`, `pgrest`, `pg_net` non sollicités |
| 6. RLS status | Tout à `rls_enabled = false` (normal sur Neon) |
| 7. FK sans index | La liste des 6 FK à indexer (corrigée à l'étape 2) |
| 8. Migrations Prisma | Dernière migration appliquée connue |
| 9. Connexions actives | Doit montrer principalement `application_name = prisma` |

**Capturer les résultats** pour comparer après.

---

## 2. Application des index manquants

### Option A : automatique via Vercel (recommandé)

Le `package.json` contient :

```json
"vercel-build": "prisma generate && prisma migrate deploy && next build"
```

Au prochain `git push` sur Vercel, `prisma migrate deploy` détectera la
nouvelle migration `20260514180000_add_missing_fk_indexes` et appliquera
les `CREATE INDEX IF NOT EXISTS` sur Neon prod automatiquement.

### Option B : manuelle immédiate

Si vous voulez appliquer tout de suite sans attendre un déploiement :

- Coller `01_apply_fk_indexes.sql` dans le SQL Editor Neon → **Run**
- La migration Prisma sera quand même appliquée plus tard, mais ses
  `CREATE INDEX IF NOT EXISTS` feront un no-op (idempotence).

### Vérification

Re-exécuter la section 7 du diagnostic, elle doit retourner **0 ligne**.

---

## 3. Protect branch (Neon Dashboard)

1. Aller sur la page **Branch overview** de la branche `production`
   (visible sur votre screenshot, URL :
   `console.neon.tech/app/projects/.../branches/...`)
2. Cliquer le bouton **Protect** en haut à droite
3. Confirmer

Effet : empêche toute suppression accidentelle ou reset de la branche
production depuis le dashboard ou l'API Neon. Aucun impact sur les
écritures applicatives normales.

---

## 4. Snapshot schedule (sauvegarde planifiée)

1. Aller sur **Backup & Restore** dans la sidebar Neon
2. Section **Or restore from a snapshot (Beta)**
3. Cliquer **Edit schedule**
4. Configurer (recommandation) :
   - Fréquence : quotidienne
   - Heure : 03:00 UTC (creux d'activité)
   - Rétention : 7 jours minimum
5. **Save**

Effet : un snapshot complet de la branche production est créé chaque jour,
récupérable en 1 clic en cas de catastrophe. C'est complémentaire au
PITR (Point-in-Time Restore) intégré.

---

## 5. (Optionnel) Augmenter le History window PITR

Par défaut sur votre plan Launch, la fenêtre PITR est de **6 heures**
(visible sur votre screenshot : "6 hour history window").

Pour augmenter (jusqu'à 7 jours selon le plan Launch) :

1. Projet → **Settings**
2. Section **History retention** (ou similaire)
3. Augmenter à la valeur souhaitée
4. Save

**Attention** : augmenter cette valeur augmente votre consommation de
stockage facturable. À calibrer selon votre tolérance au coût vs au risque.

---

## 6. Stratégie de backup multi-couches (résumé)

Une fois les étapes 3 et 4 faites, vous avez :

```
Niveau 1 — Neon PITR (Point-in-Time Restore)
  └─ Granularité : seconde
  └─ Fenêtre : 6h (ou plus si étape 5 appliquée)
  └─ Coût : inclus dans le plan

Niveau 2 — Neon Snapshots planifiés
  └─ Granularité : 1 par jour
  └─ Rétention : 7 jours
  └─ Coût : stockage marginal

Niveau 3 — Sync vers Supabase (déjà existant)
  └─ Commande : npm run db:backup
  └─ Géographie : Frankfurt → Ireland (résilience régionale)
  └─ À lancer manuellement ou via cron

Niveau 4 — Code source dans Git
  └─ schema.prisma + migrations versionnées
  └─ Reproductibilité totale du schéma

Niveau 5 (optionnel) — pg_dump cron externe
  └─ Vers S3, Backblaze B2, Vercel Blob, etc.
  └─ Non implémenté ici, à voir si besoin
```

Pour automatiser le **Niveau 3**, vous pouvez créer un cron Vercel qui
lance `npm run db:backup` (déjà disponible dans `package.json`). À voir
plus tard, ce n'est pas urgent vu que Niveaux 1+2 couvrent déjà
99 % des cas.

---

## Checklist rotation des secrets (à faire à votre rythme)

Tant qu'on y est, voici les secrets visibles dans votre `.env` que je
recommande de régénérer après ce hardening :

- [ ] **`BETTER_AUTH_SECRET`**
   - Générer une nouvelle valeur : `openssl rand -base64 32`
   - La poser dans Vercel → Settings → Environment Variables (prod + preview)
   - Mettre à jour `.env` en local
   - **Effet** : toutes les sessions Better Auth en cours seront
     invalidées (les utilisateurs devront se reconnecter)

- [ ] **`RESEND_API_KEY`**
   - https://resend.com/api-keys → Revoke l'actuelle + Create new
   - La poser dans Vercel et `.env`

- [ ] **Mot de passe Neon** (`DATABASE_URL`)
   - Neon Dashboard → **Roles & Databases** → `palais_des_festivals_owner`
     → Reset password
   - Mettre à jour la `DATABASE_URL` complète dans Vercel et `.env`
   - **Effet** : Vercel redéploiera avec la nouvelle URL

- [ ] **Clés API Supabase** (`anon` + `service_role`)
   - Supabase Dashboard → **Settings → API** → **Reset**
   - Pas de variable à mettre à jour si vous n'utilisez pas le client
     Supabase JS — c'est juste pour invalider les clés potentiellement
     fuite vers Internet

- [ ] **Mot de passe Postgres Supabase** (`BACKUP_DATABASE_URL`)
   - Supabase Dashboard → **Settings → Database → Reset password**
   - Mettre à jour `BACKUP_DATABASE_URL` dans `.env` (pas besoin sur Vercel
     si le backup ne tourne qu'en local)

- [ ] **`CRON_SECRET`**
   - Si utilisé pour protéger des routes API cron (à vérifier dans le code)
   - Générer une nouvelle valeur et la poser dans Vercel

⚠️ **Ne PAS commit le `.env` mis à jour** : il est dans `.gitignore` et
contient des secrets.

---

## Validation finale

Après application des étapes 1–4 (au minimum), vérifier :

```bash
# Côté app : tout fonctionne ?
npm run dev
# → Tester un parcours de connexion + une accréditation

# Côté backup : la sync fonctionne toujours ?
npm run db:sync:verify
```

Sur le **Supabase Advisor**, après que `01_enable_rls_and_revoke_anon.sql`
ait été exécuté côté Supabase, les 19 alertes Critical doivent disparaître
(les alertes "Unindexed foreign keys" disparaîtront aussi côté Supabase
après le prochain `npm run db:sync` qui propagera les nouveaux index).

Sur Neon, il n'y a pas d'Advisor équivalent, mais vous pouvez re-exécuter
le diagnostic et constater que la section 7 (FK sans index) ne retourne
plus rien.
