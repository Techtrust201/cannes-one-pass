# Configuration Resend — Cannes One Pass

## Principe

Les e-mails transactionnels (création d’accréditation, validation, etc.) passent par [Resend](https://resend.com). Pour qu’un envoi réussisse :

1. **L’adresse `from` doit appartenir à un domaine vérifié** dans le projet Resend utilisé.
2. **La clé API (`RESEND_API_KEY`) doit appartenir au même compte / projet** que le domaine vérifié.

Si l’un de ces deux points ne correspond pas, Resend renvoie une erreur du type :

```text
This API key is not authorized to send emails from notifications.fr
```

Ce n’est **pas** un bug applicatif : la clé et le domaine d’expédition ne sont pas alignés.

## Où vérifier la configuration dans l’application

Pour chaque organisation (espace RX, Palais, etc.) :

- **Administration → Espaces → [organisation]**
- Champ **Adresse d’expédition e-mail** (`emailFromAddress`)

Cette adresse est résolue par `resolveAccreditationSender` (`src/lib/email-sender.ts`) avant chaque envoi.

Variables d’environnement côté serveur :

- `RESEND_API_KEY` — clé API du projet Resend autorisé
- éventuellement une adresse fallback globale selon la configuration de l’organisation

## Vérifier dans Resend

1. Connectez-vous au [dashboard Resend](https://resend.com/domains).
2. Ouvrez **Domains** et confirmez que le domaine de l’adresse `from` est **Verified**.
3. Ouvrez **API Keys** et vérifiez que la clé utilisée dans Vercel / Neon appartient au **même projet**.
4. L’adresse complète (ex. `notifications@notifications.fr`) doit utiliser un domaine listé et vérifié.

## Test contrôlé

1. Configurez une adresse `from` sur un domaine déjà vérifié dans Resend.
2. Créez une accréditation de test sur un environnement de recette (pas la production CYF26).
3. Consultez l’historique de l’accréditation : un succès crée une entrée dans l’historique e-mail ; un échec laisse une trace lisible.

En cas d’échec domaine, l’interface affiche :

> L’adresse d’expédition n’est pas autorisée par le fournisseur e-mail. Vérifiez le domaine Resend.

Le détail technique Resend reste visible dans la trace support (ex. `not authorized to send emails from …`).

## Tests automatisés (E2E)

Les tests Playwright **ne déclenchent jamais de vrai envoi Resend**. Le client est mocké ou le processus de test intercepte l’appel ; seul le payload généré est vérifié.

## Ne jamais faire

- Hardcoder une clé ou une adresse `from` non autorisée « pour contourner » l’erreur.
- Utiliser une clé de production dans un environnement de dev sans domaine correspondant.
- Masquer l’échec : l’historique doit toujours refléter un envoi raté.
