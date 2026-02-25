# LURKER — V1 Consolidée (Définitive)

## Problème identifié
La V1 fonctionne mais est fragmentée : 27 workflows, duplication de code, credentials éparpillés.
La V2 proposée était incomplète et non testée.

## Solution : Consolidation V1
Pas de réécriture. On garde la logique éprouvée de V1, on élimine la redondance.

## Architecture cible

```
┌─────────────────────────────────────────────┐
│  ORCHESTRATEUR UNIQUE (1 workflow)         │
│  Remplace : scanner + lifecycle + notifier │
├─────────────────────────────────────────────┤
│  Étape 1: SCAN (toutes les 2 min)          │
│  → DexScreener multi-query (comme V1)      │
├─────────────────────────────────────────────┤
│  Étape 2: LIFECYCLE (toutes les 10 min)    │
│  → Gestion CIO → WATCH → HOTLIST → CERTIFIED│
├─────────────────────────────────────────────┤
│  Étape 3: NOTIFY (toutes les 5 min)        │
│  → Pump/Dump alerts + Telegram             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  SINGLE SOURCE OF TRUTH                     │
│  state/lurker_state.json                    │
│  (remplace les 12 feeds JSON)              │
└─────────────────────────────────────────────┘
```

## Unification des credentials

Fichier unique : `.env.lurker` (déjà sur le VPS, jamais commité)
```
# Twitter LURKER
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_SECRET=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# GitHub (pour push automatique)
GITHUB_TOKEN=

# Optionnel : BaseScan (pour whale detector)
BASESCAN_API_KEY=
```

## Scripts consolidés

| Ancien (V1) | Nouveau (V1.5) | Lignes |
|-------------|----------------|--------|
| scanner_cio_ultra.py | **scanner_core.py** | ~150 |
| lifecycle_manager.py | **lifecycle_core.py** | ~200 |
| pump_dump_detector.py | **notifier_core.py** | ~150 |
| 23 autres scripts | **SUPPRIMÉS** | - |

## Configuration centralisée

Fichier : `config/lurker_config.yaml`
```yaml
# Seuils ajustables sans toucher au code
thresholds:
  min_liquidity: 1000        # $ minimum pour CIO
  min_volume_5m: 500         # $ volume 5min
  pump_alert: 50             # % pour alerte pump
  dump_alert: -30            # % pour alerte dump
  
# Timings
intervals:
  scan: 120      # secondes
  lifecycle: 600 # secondes  
  notify: 300    # secondes

# Filtres
filters:
  max_age_hours: 168     # 7 jours max
  blacklist_tokens: []   # tokens à ignorer
  min_mcap: 0            # market cap minimum
```

## Workflow unique

```yaml
name: LURKER Core
on:
  schedule:
    - cron: '*/2 * * * *'  # Toutes les 2 min
jobs:
  run:
    steps:
      - checkout
      - setup-python
      - run: |
          python scripts/scanner_core.py
          python scripts/lifecycle_core.py  
          python scripts/notifier_core.py
      - commit-state
```

## Dashboard

Page unique : `docs/index.html`
- Lit state/lurker_state.json
- Temps réel (auto-refresh 30s)
- Filtres : CIO / WATCH / HOTLIST / CERTIFIED / RUGGED
- Stats : tokens détectés, pumps/dumps 24h, taux réussite

## Migration depuis V1

1. **Audit** : Identifier quels workflows V1 fonctionnent vraiment
2. **Extraction** : Copier la logique métier dans les 3 scripts core
3. **Consolidation** : Créer le state unique
4. **Tests** : 48h parallèle V1/V1.5
5. **Switch** : Un seul workflow à surveiller

## Avantages

- **1 workflow** au lieu de 27
- **3 scripts** au lieu de 50+
- **1 state** au lieu de 12 feeds
- **1 config** pour tous les réglages
- **Testable** : on peut tester en local facilement
- **Définitif** : pas besoin de réécrire, juste ajuster la config

## Durée estimée

- Consolidation scripts : 4-6h
- Tests 48h : 2 jours
- Migration data V1 → V1.5 : 1h

**Total : 3 jours pour une base définitive.**
