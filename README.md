# LURKER

[![LURKER Pipeline](https://github.com/lurker-base/lurker/actions/workflows/telegram_publish.yml/badge.svg)](https://github.com/lurker-base/lurker/actions/workflows/telegram_publish.yml)

> Autonomous alpha signals for Base chain — **3-5 high-quality signals per day**

LURKER detects early opportunities on Base before the market reacts. Quality over quantity.

## Philosophy

- **Rarity**: Max 5 signals/day ( enforced )
- **Quality**: Min 70/100 confidence score
- **Transparency**: All signals verifiable on-chain
- **GitHub-Only**: Zero VPS, zero external dashboard

> **Note on CI Status:** Some scheduled workflows may show ❌ intermittently due to external API rate limits (DexScreener, RPC nodes). This is expected and handled gracefully. The [Health Dashboard](https://lurker-base.github.io/lurker/) reflects real system status, not raw CI history.

## How It Works

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Market Data    │────▶│   LURKER     │────▶│  Telegram   │
│  (DexScreener)  │     │  Validator   │     │  @LurkerAlphaSignals │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              ┌─────────┐           ┌──────────┐
              │ Posted  │           │ Skipped  │
              │(if OK)  │           │(guardrails│
              └─────────┘           └──────────┘
```

## Guardrails (Active)

| Rule | Value |
|------|-------|
| **Daily Limit** | 5 signals max |
| **Min Confidence** | 70/100 |
| **Anti-Duplicate** | 7-day cooldown per token |
| **Status Check** | Only `ready` signals post |

## Signal Format

```json
{
  "kind": "LURKER_SIGNAL",
  "status": "ready",
  "chain": "base",
  "token": {
    "symbol": "$TOKEN",
    "address": "0x..."
  },
  "scores": {
    "confidence": 75,
    "risk": "high"
  },
  "trade": {
    "entry": "0.00000110",
    "targets": ["0.00000145", "0.00000160"],
    "stop": "0.00000095"
  }
}
```

## Usage (GitHub-Only)

### Post a Signal

1. **Edit** [`signals/latest.json`](https://github.com/lurker-base/lurker/edit/main/signals/latest.json)
2. **Fill** your token data
3. **Set** `"status": "ready"` and `confidence >= 70`
4. **Commit** → GitHub Actions validates & posts automatically

### Manual Test

Run workflow manually: [Actions → Test Secrets](https://github.com/lurker-base/lurker/actions/workflows/test_secrets.yml)

## Tech Stack

- **GitHub Actions** — CI/CD pipeline
- **Telegram Bot API** — Alert delivery
- **DexScreener API** — Market data (public)
- **BaseScan API** — On-chain verification

## Channel

**[@LurkerAlphaSignals](https://t.me/LurkerAlphaSignals)** — Live signals

## License

MIT
