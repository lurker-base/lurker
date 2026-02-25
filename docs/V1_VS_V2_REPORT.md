# RAPPORT COMPARATIF V1 vs V2 — LURKER

**Date:** 25 février 2026, 04:15  
**Branche V2:** `v2-refonte` (commit 05a89ff)

---

## 📊 Vue d'ensemble

| Métrique | V1 (main) | V2 (v2-refonte) | Delta |
|----------|-----------|-----------------|-------|
| **Workflows GitHub** | 27 | 3 | -89% |
| **Lignes de code Python** | ~8 965 | ~492 | -95% |
| **Fichiers de données** | 12+ feeds JSON | 2 (tokens.json + alerts.json) | -83% |
| **Architecture** | Multi-feeds complexe | Single source of truth | Simplifié |
| **Fréquence scan** | 2-10 min (variable) | 2 min (fixe) | +Régulier |

---

## 🔍 Analyse détaillée

### 1. Architecture V1 (Complexe)

```
┌─────────────────────────────────────────────────────────────┐
│  WORKFLOWS V1 (27 total)                                    │
├─────────────────────────────────────────────────────────────┤
│  scanner_cio_v3.yml        →  CIO feed                      │
│  watch.yml                 →  WATCH feed                    │
│  hotlist.yml               →  HOTLIST feed                  │
│  fast_certified.yml        →  FAST_CERTIFIED feed           │
│  certifier.yml             →  CERTIFIED feed                │
│  lifecycle.yml             →  Gestion 72h + badges          │
│  pump_dump_detector.yml    →  Détection P&D                 │
│  hall_of_fame.yml          →  Top performers                │
│  telegram_notifier.yml     →  Alertes Telegram              │
│  twitter_post.yml          →  Tweets auto                   │
│  ... (17 autres workflows)                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  FEEDS MULTIPLES (12 fichiers JSON)                         │
├─────────────────────────────────────────────────────────────┤
│  signals/cio_feed.json                                    │
│  signals/watch_feed.json                                  │
│  signals/hotlist_feed.json                                │
│  signals/fast_certified_feed.json                         │
│  signals/certified_feed.json                              │
│  signals/lifecycle_feed.json                              │
│  signals/rugged_feed.json                                 │
│  signals/archived_feed.json                               │
│  state/token_registry.json                                │
│  state/volume_alerts.json                                 │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

**Problèmes V1 identifiés:**
- Synchronisation complexe entre feeds
- Duplication de tokens possibles
- Lifecycle manager 500+ lignes, difficile à maintenir
- 27 workflows = 27 points de défaillance potentiels

---

### 2. Architecture V2 (Simplifiée)

```
┌─────────────────────────────────────────────────────────────┐
│  WORKFLOWS V2 (3 total)                                     │
├─────────────────────────────────────────────────────────────┤
│  v2-scanner.yml      →  Détection tokens (2 min)           │
│  v2-analyzer.yml     →  Analyse perf + risque (5 min)      │
│  v2-notifier.yml     →  Alertes Twitter/Telegram (5 min)   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  SINGLE SOURCE OF TRUTH                                     │
├─────────────────────────────────────────────────────────────┤
│  state/tokens.json     →  Tous les tokens + métriques      │
│  state/alerts.json     →  Historique alertes envoyées      │
└─────────────────────────────────────────────────────────────┘
```

**Avantages V2:**
- Une seule source de vérité
- Pas de duplication de tokens
- Pipeline linéaire clair
- 3 workflows = maintenance simplifiée

---

### 3. Comparaison technique

#### Scanner

| Aspect | V1 (scanner_cio_ultra.py) | V2 (scanner.py) |
|--------|---------------------------|-----------------|
| **Lignes** | 468 | 139 (-70%) |
| **Sources** | DexScreener multi-query | DexScreener search simple |
| **Filtres** | Complexes (risk tags, quality) | Minimaux ($1k liq, $100 vol) |
| **Critères** | MIN_LIQ: $1k, MIN_VOL_5M: $500 | MIN_LIQ: $1k, MIN_VOL_5M: $100 |
| **Age max** | 7 jours (10080 min) | Non filtré |

**Verdict:** V2 plus simple mais risque de capturer plus de bruit.

#### Analyzer

| Aspect | V1 (lifecycle_manager.py) | V2 (analyzer.py) |
|--------|---------------------------|------------------|
| **Lignes** | 500+ | 171 (-66%) |
| **Logique** | Multi-feeds évolutifs | Categories simples (CIO→CERTIFIED) |
| **PUMP threshold** | +50% | +50% (identique) ✅ |
| **DUMP threshold** | -30% | -30% (identique) ✅ |
| **RUG detection** | liq=0 + pattern P&D | liq=0 uniquement |

**Verdict:** Seuils identiques, logique V2 plus simple.

#### Notifier

| Aspect | V1 (pump_dump_detector.py) | V2 (notifier.py) |
|--------|----------------------------|------------------|
| **Lignes** | 400+ | 182 (-55%) |
| **Twitter** | Oui | Oui ✅ |
| **Telegram** | Oui | Oui ✅ |
| **Déduplication** | Oui (fichier local) | Oui (state/alerts.json) ✅ |
| **Format tweets** | Identique | Identique ✅ |

**Verdict:** Fonctionnalités préservées.

---

### 4. Ressources GitHub Actions

| Aspect | V1 | V2 |
|--------|-----|-----|
| **Minutes/mois** | ~20 000 (27 workflows) | ~2 500 (3 workflows) |
| **Concurrent jobs** | Risque de conflits | Séquentiel propre |
| **Commits** | ~100/jour | ~20/jour (estimé) |

---

### 5. Secrets GitHub requis

| Secret | V1 | V2 | Statut |
|--------|-----|-----|--------|
| `TWITTER_API_KEY_LURKER` | ✅ | ✅ | Requis |
| `TWITTER_API_SECRET_LURKER` | ✅ | ✅ | Requis |
| `TWITTER_ACCESS_TOKEN_LURKER` | ✅ | ✅ | Requis |
| `TWITTER_ACCESS_SECRET_LURKER` | ✅ | ✅ | Requis |
| `TELEGRAM_BOT_TOKEN` | ✅ | ✅ | Requis |
| `TELEGRAM_CHAT_ID` | ✅ | ✅ | Requis |

**Corrections appliquées:**
- ✅ Fix des noms de variables d'environnement (commit 05a89ff)

---

## ⚠️ Risques identifiés

### Risque 1: Sources de données réduites
- **V1:** Multi-sources (DexScreener queries + BaseScan + RPC)
- **V2:** DexScreener uniquement
- **Impact:** Peut manquer certains tokens

### Risque 2: Pas de détection P&D avancée
- **V1:** Pattern pump+100% then dump-25% = RUGGED
- **V2:** Liquidity=0 uniquement
- **Impact:** Tokens P&D peuvent rester en CIO plus longtemps

### Risque 3: Pas de Hall of Fame automatisé
- **V1:** Système HOF complet avec badges
- **V2:** Non implémenté
- **Impact:** Perte de la fonctionnalité "top performers"

### Risque 4: Dashboard V2-preview statique
- **V1:** Live dashboard avec auto-refresh
- **V2:** Dashboard statique (GitHub API)
- **Impact:** Moins réactif

---

## ✅ Checklist activation V2

- [x] Code V2 complet (scanner + analyzer + notifier)
- [x] Workflows GitHub configurés
- [x] Secrets compatibles
- [x] Seuils d'alerte identiques à V1
- [x] Déduplication alertes
- [ ] **Test scanner** — Lancer manuellement v2-scanner.yml
- [ ] **Test analyzer** — Vérifier calculs performances
- [ ] **Test notifier** — Vérifier envoi Twitter/Telegram
- [ ] **Validation 6h** — Comparer données V1 vs V2
- [ ] **Switch DNS** — Pointer site vers V2 si validé

---

## 🎯 Recommandation

**PRÊT pour tests limités, PAS PRÊT pour production immédiate.**

La V2 est **fonctionnelle mais incomplète** par rapport à V1 :
- ✅ Core (scan → analyse → notify)
- ❌ Hall of Fame
- ❌ Pattern P&D avancé
- ❌ Multi-sources

**Plan suggéré:**
1. **Aujourd'hui:** Tests V2 en parallèle (sans switch)
2. **Demain:** Comparaison données + ajustements
3. **48h:** Switch si V2 >= 90% fiabilité vs V1

---

*Rapport généré par Clara — 25 février 2026*
