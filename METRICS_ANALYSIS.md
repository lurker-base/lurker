# LURKER Metrics Dashboard — Analyse Custos

## Métriques Custos (à reproduire)

### Header Stats
| Metric | Valeur | Ce que ça montre |
|--------|--------|------------------|
| Commits | 508 | Activité de dev |
| Lines of Code | 35,300 | Complexité du projet |
| Net Revenue | $13,517 | **Preuve de business model** |
| Runway | 56d | Sustainability |
| Compute Credits | $278/$565 | Ressources restantes |

### Navigation
- Overview
- Intelligence (market signals, lessons)
- Activity (actions logged real-time)
- Pipeline (what's being built)
- Schedule (cron status)
- Financials (on-chain verified)
- Guides

### Intelligence Feed
Articles auto-générés :
- "Base Mini Apps infrastructure production-ready"
- "Neynar validates 'agent as economic participant'"
- "Base Mini Apps is a full product line"

### Token Section
- $CUSTOS Token — Active
- Ecosystem token for autonomous agent
- Deployed on Base via Clanker
- Dynamic 1-3% trading fee → WETH → 0xsplits treasury

---

## LURKER Metrics à implémenter

### Phase 1: Preuve d'activité (dès maintenant)
```
SCANNER UPTIME:     99.9%
TOKENS DETECTED:    [nombre réel]
SIGNALS SENT:       [nombre réel]
API CALLS/DAY:      [nombre réel]
```

### Phase 2: Performance (après 7 jours de données)
```
SUCCESS RATE:       [tokens qui pump / total]%
AVG PUMP TIME:      [heures après signal]
AVG RETURN:         [x après 24h]
VOLATILITY INDEX:   [mesure de qualité]
```

### Phase 3: Revenue (après launch token)
```
TREASURY BALANCE:   $[montant] (on-chain)
BURNED TOKENS:      [nombre] LURKER
SUBSCRIBERS:        [nombre]
MRR:                $[montant]/mois
RUNWAY:             [jours]
```

---

## Implémentation technique

### Données à tracker (signals.json)
```json
{
  "scanner": {
    "startTime": "2026-02-20T05:00:00Z",
    "totalScans": 150,
    "uptimePercent": 99.9
  },
  "signals": [...],
  "performance": {
    "totalDetected": 45,
    "pumpedWithin24h": 28,
    "successRate": 62.2
  }
}
```

### Affichage sur /proof.html
Remplacer les cycles fictifs par des vraies métriques :
- Uptime (depuis quand le scanner tourne)
- Tokens scannés (nombre réel)
- Performance (quand on aura l'historique)

---

## Next Steps

1. **Maintenant** : Tracker uptime + tokens détectés
2. **J+7** : Mesurer success rate (pump après signal)
3. **J+30** : Lancer token + afficher treasury

**Règle d'or** : Pas de fake numbers. Que des vraies données ou "coming soon".
