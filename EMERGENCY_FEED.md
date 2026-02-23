# 🚨 LURKER — Procédures d'Urgence Feed
## Document critique — Lire en cas de problème

---

## ⚠️ SITUATION ACTUELLE

**Date :** 2026-02-23  
**Problème :** Feed bloqué depuis 23h55 (6h de retard détecté)  
**Statut :** RÉSOLU manuellement (commit `f6e9599`)  
**Cause :** Workflow GitHub Actions probablement désactivé ou erreur

---

## 🔴 SIGNE D'ALERTE

Le feed est **STALE** si :
- ❌ Âge des tokens identique depuis >15 minutes
- ❌ `updated_at` dans `cio_feed.json` n'a pas changé
- ❌ Pas de nouveaux tokens détectés sur la page live

**Vérification rapide :**
```bash
cd /data/.openclaw/workspace/lurker-project
python3 scripts/feed_sentinel.py
```

---

## 🛠️ SOLUTIONS (par ordre de rapidité)

### Option 1 — Auto-fix (2 minutes)
```bash
cd /data/.openclaw/workspace/lurker-project
./scripts/emergency_update.sh
```
**Fait tout automatiquement :** scan + commit + push + vérifie

### Option 2 — Manuel étape par étape
```bash
cd /data/.openclaw/workspace/lurker-project

# 1. Scanner
python3 scripts/scanner_cio_ultra.py

# 2. Vérifier
python3 scripts/feed_sentinel.py

# 3. Commit
git add signals/cio_feed.json state/token_registry.json
git commit -m "fix: manual update $(date +%H:%M)"
git push origin main
```

### Option 3 — Depuis GitHub (si local impossible)
1. Aller sur https://github.com/lurker-base/lurker/actions
2. Cliquer **"LURKER CIO Scanner - ULTRA LAUNCH"**
3. Cliquer **"Run workflow"** → **"Run workflow"**
4. Attendre 2-3 minutes
5. Vérifier sur https://lurker-base.github.io/lurker/live.html

---

## 🔔 SURVEILLANCE AUTOMATIQUE (Mise en place)

**Sentinel local** vérifie toutes les 10 minutes :
```bash
# Vérifier si sentinel tourne
crontab -l | grep sentinel

# Si pas présent, l'ajouter :
crontab -e
# Ajouter cette ligne :
*/10 * * * * /data/.openclaw/workspace/lurker-project/scripts/sentinel_cron.sh
```

**Alertes Telegram** si feed stale >15 min :
- Bot : @LurkerAlphaSignals
- Message automatique avec instructions

---

## 🔍 DIAGNOSTIC PROFOND

### Vérifier GitHub Actions
1. https://github.com/lurker-base/lurker/actions
2. Chercher erreurs rouges ❌
3. Si workflow "disabled" → bouton **"Enable workflow"**

### Vérifier Secrets
Settings → Secrets → Actions :
- `DEXSCREENER_API_KEY` ✅ doit être présent
- `TELEGRAM_BOT_TOKEN` ✅ doit être présent

### Vérifier Fichiers
```bash
ls -la signals/cio_feed.json
cat signals/cio_feed.json | grep updated_at
```

---

## 📊 CHECKLIST PRÉ-LAUNCH TOKEN

Avant lancement $LURKER, vérifier :

- [ ] Feed mis à jour dans les 10 dernières minutes
- [ ] Scanner fonctionne (test manuel)
- [ ] Sentinel cron actif
- [ ] Alertes Telegram configurées
- [ ] Procédure d'urgence testée
- [ ] Boss sait faire un emergency_update.sh

---

## 📞 CONTACTS URGENCE

| Problème | Qui | Comment |
|----------|-----|---------|
| Feed down | Clara | `python3 scripts/emergency_update.sh` |
| GitHub bug | Boss | Settings → Actions |
| Secrets manquants | Boss | Settings → Secrets |
| Token launch | Ensemble | Validation manuelle |

---

## ⚡ COMMANDES ESSENTIELLES (Copier-coller)

```bash
# Vérifier santé
python3 scripts/feed_sentinel.py

# Fix immédiat
./scripts/emergency_update.sh

# Voir dernier commit
git log -1 --oneline

# Voir tokens actifs
cat signals/cio_feed.json | jq '.candidates[].token.symbol'
```

---

**Document créé :** 2026-02-23  
**Dernière mise à jour :** 2026-02-23  
**Prochaine review :** Avant lancement token

**🎯 RÈGLE D'OR :** Si doute → Emergency update. Mieux vaut un commit inutile que 6h de feed mort.
