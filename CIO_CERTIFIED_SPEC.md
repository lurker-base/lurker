# LURKER Architecture CIO/CERTIFIED — Spécifications

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│  CHAIN (Base)                                                    │
│  ├─ Factories (Aerodrome, Uniswap V3)                           │
│  └─ Events: PoolCreated/PairCreated                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  SCANNER (cron 5 min)                                           │
│  ├─ Lit events depuis last_scanned_block                        │
│  ├─ Enrichit via DexScreener (liq/vol/price)                    │
│  └─ Filtre CIO → Écrit cio_feed.json                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  CIO FEED (0-48h)                                               │
│  ├─ Age: 0h ≤ age ≤ 48h                                         │
│  ├─ Quote whitelist: WETH, USDC, cbBTC only                     │
│  ├─ Min liq: $10k                                               │
│  └─ Anti-spam: blacklist + dedup                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (time passes)
┌─────────────────────────────────────────────────────────────────┐
│  CERTIFICATION JOB (cron 1h)                                    │
│  ├─ Réévalue CIO à 48h et 72h                                   │
│  ├─ Critères: holders, liq, vol, txns, price action             │
│  └─ Passe en pulse_feed.json si OK                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  CERTIFIED FEED (48h+)                                          │
│  └─ Survivants validés                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## CIO (Candidates In Observation) — Critères

### Phase: 0-48h après création

| Critère | Valeur | Raison |
|---------|--------|--------|
| **Age** | 0h ≤ age ≤ 48h | Trop jeune = instable, trop vieux = raté l'entrée |
| **Quote Token** | WETH, USDC, cbBTC uniquement | Évite les paires token/token (poubelle) |
| **Min Liquidity** | $10,000 | Assez pour trader, pas assez pour mega-scam |
| **Max Market Cap** | $50,000,000 | Évite les bluechips déjà pumpés |
| **Anti-Spam** | Dedup par pair | 1 entrée max par pool |
| **Blacklist** | Symbols + addresses connus | Évite les tokens déjà établis |

### Score CIO (0-100)

```
freshness = 1 - (age_hours / 48)           # 1.0 (new) → 0.0 (48h)
liq_score = min(log10(liq_usd) / 6, 1.0)   # Normalisé
vol_score = min(log10(vol_24h) / 6, 1.0)   # Normalisé

score = 40*freshness + 35*liq_score + 25*vol_score
```

### Format CIO JSON

```json
{
  "schema": "lurker_cio_v1",
  "last_updated": "2026-02-22T11:00:00Z",
  "count": 15,
  "candidates": [
    {
      "kind": "CIO_CANDIDATE",
      "created_at": "2026-02-22T10:30:00Z",
      "age_hours": 0.5,
      "chain": "base",
      "dex": "aerodrome",
      "pool_address": "0x...",
      "token": {
        "symbol": "$XXX",
        "name": "Token Name",
        "address": "0x..."
      },
      "quote_token": {
        "symbol": "WETH",
        "address": "0x..."
      },
      "metrics": {
        "liq_usd": 25000,
        "vol_24h_usd": 15000,
        "price_usd": 0.0001,
        "mcap_usd": 500000
      },
      "scores": {
        "cio_score": 72,
        "freshness": 0.95
      },
      "status": "observing",
      "next_check": "2026-02-22T12:00:00Z"
    }
  ]
}
```

---

## CERTIFIED — Critères (48h+ et 72h+)

### Phase: Réévaluation à T+48h et T+72h

Un token passe de CIO → CERTIFIED s'il survit ET montre des signes de santé.

#### Critères T+48h (première certification)

| Critère | Minimum | Pourquoi |
|---------|---------|----------|
| **Holders** | ≥ 200 | Distribution suffisante |
| **Top 10 holders** | ≤ 40% | Pas de concentration excessive |
| **Liquidity** | ≥ $30k | Assez pour entrer/sortir |
| **Volume 24h** | ≥ $20k | Activité réelle |
| **Transactions 24h** | ≥ 100 | Pas juste wash trading |
| **Price action** | Drawdown < 70% depuis ATH | Pas de rug évident |

#### Critères T+72h (certification complète)

| Critère | Minimum | Pourquoi |
|---------|---------|----------|
| **Holders** | ≥ 500 | Distribution saine |
| **Top 10 holders** | ≤ 30% | Décantation des whales |
| **Liquidity** | ≥ $50k | Maturité |
| **Volume 24h** | ≥ $50k | Traction confirmée |
| **Transactions 24h** | ≥ 200 | Communauté active |
| **Price vs launch** | ≥ -30% | Pas de dump massif |

### Score CERTIFIED (0-100)

```
holders_score = min(holders / 500, 1.0)           # 500 = 100%
distribution_score = 1 - (top10_pct / 40)         # <40% = 100%
liq_score = min(liq_usd / 50000, 1.0)             # $50k = 100%
vol_score = min(vol_24h / 50000, 1.0)             # $50k = 100%
health_score = max(0, 1 - abs(drawdown / 70))     # <70% drawdown

score = 20*holders + 20*distribution + 20*liq + 20*vol + 20*health
```

### Format CERTIFIED JSON

```json
{
  "schema": "lurker_certified_v1",
  "last_updated": "2026-02-22T11:00:00Z",
  "count": 5,
  "certified": [
    {
      "kind": "CERTIFIED_SIGNAL",
      "created_at": "2026-02-20T10:00:00Z",
      "certified_at": "2026-02-22T10:00:00Z",
      "age_hours": 48,
      "chain": "base",
      "dex": "aerodrome",
      "pool_address": "0x...",
      "token": {
        "symbol": "$XXX",
        "name": "Token Name",
        "address": "0x..."
      },
      "metrics": {
        "liq_usd": 75000,
        "vol_24h_usd": 65000,
        "holders": 350,
        "top10_pct": 25,
        "txns_24h": 150,
        "price_vs_launch": 1.45
      },
      "scores": {
        "certified_score": 78,
        "holders_score": 0.70,
        "distribution_score": 0.625,
        "health_score": 1.0
      },
      "status": "certified_48h",
      "next_check": "2026-02-23T10:00:00Z"
    }
  ]
}
```

---

## UI Mapping

| Page | Source | Contenu |
|------|--------|---------|
| `/live.html` | `cio_feed.json` | Candidats 0-48h avec badge "age: 2h" |
| `/pulse.html` | `pulse_feed.json` | Certifiés 48h+ avec badge "✓ CERTIFIED" |
| `/` (home) | Dernier CIO + dernier Certified | Aperçu rapide |

---

## Workflows GitHub Actions

### 1. scanner_onchain.yml (toutes les 5 min)
```yaml
- Run: scanner_onchain.py
- Input: state/scan_state.json
- Output: signals/cio_feed.json
- Update: state/scan_state.json (last_scanned_block)
```

### 2. certifier.yml (toutes les heures)
```yaml
- Run: certifier.py
- Input: signals/cio_feed.json + API holders/vol/txns
- Output: signals/pulse_feed.json
- Update: cio.status (observing → certified_48h → certified_72h)
```

---

## Factories Base à Scanner

| DEX | Factory Address | Type | Priorité |
|-----|-----------------|------|----------|
| **Aerodrome** | `0x420DD381b31aEf6683db6b902084cB0FFECe40Da` | Solidly | P0 |
| **Uniswap V3** | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` | Uni V3 | P0 |
| **Alien Base** | `0x...` | Solidly | P1 |
| **SwapBased** | `0x...` | Solidly | P1 |

---

## Prochaines étapes (ordre)

1. **Implémenter scanner_onchain.py** — MVP avec Aerodrome seulement
2. **Valider CIO feed** — Vérifier qu'on capture des pools récents
3. **Ajouter enrichissement DexScreener** — Liq/vol/price par pool
4. **Implémenter certifier.py** — Logique 48h/72h
5. **Brancher UI** — /live et /pulse sur les bons feeds

---

**Cette spec est verrouillée. Prêt pour implémentation.**
