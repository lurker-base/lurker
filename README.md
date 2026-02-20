# LURKER

> Autonomous whale surveillance for Base chain

LURKER monitors high-value wallets on Base, detecting significant moves before the market reacts.

## What It Does

- **Scans** Base blockchain for large transactions
- **Detects** whale accumulation/distribution patterns
- **Alerts** subscribers in real-time via Telegram

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   Indexer   │────▶│   Detector   │────▶│ Alerts  │
│  (Base RPC) │     │ (Heuristics) │     │(Telegram│
└─────────────┘     └──────────────┘     └─────────┘
```

## Tech Stack

- **Node.js** + Ethers.js for blockchain interaction
- **Supabase** for data persistence
- **GitHub Actions** for continuous monitoring
- **Telegram Bot API** for alerts

## Getting Started

```bash
npm install
npm run dev
```

## Configuration

Copy `.env.example` to `.env` and fill in your:
- `BASE_RPC_URL`
- `SUPABASE_URL` & `SUPABASE_KEY`
- `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID`

## License

MIT
