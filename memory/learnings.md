# LURKER — Learnings

**Accumulated wisdom from watching Base.**

## Token Detection Patterns

### High-Score Signals (Score ≥ 60)

| Pattern | Indicator | Reliability |
|---------|-----------|-------------|
| Early volume spike | >$10k vol in 5min | ⭐⭐⭐⭐ |
| Fresh liquidity | <$100k mcap + >$50k liq | ⭐⭐⭐⭐⭐ |
| Buy pressure | Buys > 2x sells | ⭐⭐⭐ |
| Clanker launch | Factory verified | ⭐⭐⭐⭐ |

### False Positives

- **Stable pairs** — WETH/USDC, filtered out.
- **Old tokens** — >3h age, already pumped.
- **Low liquidity** — <$1k liq = high risk.
- **Dead volume** — No 5m activity = no interest.

## RPC Performance

| Provider | Speed | Reliability | Best For |
|----------|-------|-------------|----------|
| Alchemy | Fast | ⭐⭐⭐⭐⭐ | Production |
| Public nodes | Slow | ⭐⭐⭐ | Fallback only |
| BaseScan | Medium | ⭐⭐⭐⭐ | Data enrichment |

## Timing Insights

- Most new tokens launch 14:00-20:00 UTC (US afternoon).
- Weekend launches = less competition, more alpha.
- First 10 minutes = highest alpha window.

## DexScreener Delays

- API lag: 30-120 seconds behind blockchain.
- For true real-time: need direct factory monitoring.
- Our scanner bridges this gap.

## To Explore

- [ ] Monitor Clanker factory directly (0xC1b...).
- [ ] Add Bankr factory detection.
- [ ] Track whale accumulation pre-pump.
- [ ] Sentiment analysis from token names.

---

*Last updated: 2026-02-20*
