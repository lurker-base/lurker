# LURKER V2 - Architecture Simplifiée

## Principes
- **3 workflows maximum** (scan → analyse → notifier)
- **1 source de vérité** (`state/tokens.json`)
- **Dashboard temps réel** (API directe, pas de cache)
- **Zero duplication** de données

## Workflows

### 1. scanner.yml (toutes les 2 minutes)
Détecte les nouveaux tokens sur Base via DexScreener API.
Met à jour `state/tokens.json` avec les nouvelles détections.

### 2. analyzer.yml (toutes les 5 minutes)
Analyse les tokens existants :
- Calcule les performances (pump/dump)
- Détecte les risques (rug, P&D)
- Met à jour les catégories (CIO → WATCH → HOTLIST → CERTIFIED)
- Met à jour `state/tokens.json`

### 3. notifier.yml (toutes les 5 minutes)
Envoi les alertes :
- Tweet sur @LURKER_AI2026 si pump +50% ou dump -30%
- Telegram privé pour toi
- Met à jour `state/alerts.json` (historique)

## Structure des données

```json
{
  "schema": "lurker_v2",
  "meta": {
    "last_scan": "2026-02-25T01:00:00Z",
    "last_analyze": "2026-02-25T01:05:00Z",
    "total_tokens": 150
  },
  "tokens": {
    "0x1234...": {
      "symbol": "ABC",
      "name": "Token ABC",
      "detected_at": "2026-02-25T00:00:00Z",
      "category": "HOTLIST",
      "metrics": {
        "liq_usd": 50000,
        "price_usd": 0.001,
        "price_change_24h": 150
      },
      "risk": {
        "level": "low",
        "factors": []
      },
      "performance": {
        "max_gain": 200,
        "current_gain": 150,
        "status": "pumping"
      }
    }
  }
}
```

## Dashboard

Le dashboard (`docs/v2/index.html`) lit directement via GitHub API :
- `https://api.github.com/repos/lurker-base/lurker/contents/state/tokens.json?ref=v2-refonte`

Pas de fichiers JSON statiques, pas de cache, données temps réel.

## Tests

- `tests/test_scanner.py` - Test la détection
- `tests/test_analyzer.py` - Test l'analyse
- `tests/test_notifier.py` - Test les alertes

## Migration depuis V1

1. V1 continue sur `main`
2. V2 construite sur `v2-refonte`
3. Tests 48h sur V2
4. Switch DNS vers V2 quand stable
5. V1 en backup 1 semaine

## Date de début
25 février 2026
