# 🔑 TWITTER SECRETS - Configuration GitHub

## Problème
Les tweets ne partent pas car les secrets X/Twitter ne sont pas configurés dans GitHub.

## Solution
Ajouter 4 secrets dans GitHub Settings.

---

## 📋 ÉTAPES

### 1. Récupérer les credentials Twitter
Dans le fichier local : `/data/.openclaw/workspace/lurker-project/.env.twitter`

```
API_KEY=xxx
API_SECRET=xxx
ACCESS_TOKEN=xxx
ACCESS_TOKEN_SECRET=xxx
```

### 2. Aller sur GitHub
1. Ouvre : https://github.com/lurker-base/lurker/settings/secrets/actions
2. Clique **"New repository secret"**

### 3. Ajouter les 4 secrets

| Nom | Valeur (depuis .env.twitter) |
|-----|------------------------------|
| `TWITTER_API_KEY` | API_KEY |
| `TWITTER_API_SECRET` | API_SECRET |
| `TWITTER_ACCESS_TOKEN` | ACCESS_TOKEN |
| `TWITTER_ACCESS_SECRET` | ACCESS_TOKEN_SECRET |

### 4. Tester
1. Va sur : https://github.com/lurker-base/lurker/actions
2. Clique **"LURKER Twitter Post"** → **"Run workflow"**
3. Vérifie que le log dit : `X_API_KEY set? true`

---

## 🔍 Vérification

Dans les logs GitHub Actions, tu dois voir :
```
X_API_KEY set? true
X_API_SECRET set? true
X_ACCESS_TOKEN set? true
X_ACCESS_SECRET set? true
[LURKER] Posted Phase X: ...
https://twitter.com/i/web/status/...
```

Si tu vois `false` sur l'un d'eux → le secret est mal copié.

---

## ⏰ Fréquence
Une fois activé, le workflow poste automatiquement toutes les 25 minutes.

**Arc narratif en cours :** Phase 1 (Éveil) - 4 tweets
