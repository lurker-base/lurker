# LURKER Signal Quality Improvements — 2026-03-16

## Problem Statement
- Baseline precision: **5%** (1 in 20 signals is a winner)
- Noise ratio: **95%** — nearly all signals are false positives
- `maxAgeMinutes: 75000` (52 days!) — effectively no age filter
- 117 signals with "UNKNOWN" symbol — unresolved token names
- Only 1/9 HoF winners captured by backtest (data disconnect)
- No volume/liquidity ratio analysis — key pump indicator missing
- No buy/sell pressure tracking

## Changes Made

### 1. Signal Quality Scorer (`scripts/signal_quality_scorer.py`) — NEW
Multi-factor quality scoring system replacing simple liq+age filters:
- **Volume/Liquidity ratio** (20%) — key pump indicator, sweet spot 0.5-10x
- **Buy/Sell pressure** (15%) — accumulation vs dump detection
- **Transaction density** (15%) — organic interest proxy
- **Freshness decay** (15%) — sweet spot 1-12h, penalizes too-new and stale
- **Liquidity health** (15%) — tiered scoring $5k-$100k+
- **Source credibility** (10%) — boosts, profiles, RPC weighted differently
- **Risk penalty** (10%) — bundle farming, unknown symbols, etc.
- Grades: S/A/B/C/D/F with numeric score 0-100

### 2. Backtest Engine v2 (`backtest_v2.js`) — NEW
Comprehensive backtester that fixes data disconnection:
- Loads **all** signal sources (not just 5 files): token_registry, lifecycle, hybrid
- Properly connects Hall of Fame winners across all feeds
- Calculates **actual ROI** from price_history (first → peak)
- Multi-dimensional filters: liq, vol, vol/liq ratio, age, symbol, risk level
- Extended precision metric counting strong performers (>100% peak ROI)
- Result: **16.67% precision** (3.3x improvement), **33% recall** (3x improvement)

### 3. Filters v2 (`filters_v2.json`) — NEW
Multi-dimensional filter configuration:
- `minLiquidityUSD: 5000` (was 700)
- `maxLiquidityUSD: 25M` (new — filters blue chips disguised as new tokens)
- `minVolume1hUSD: 500` (new)
- `minVolLiqRatio: 0.1` (new — activity minimum)
- `maxVolLiqRatio: 50` (new — wash trading filter)
- `maxAgeMinutes: 2880` (48h, was 75000 = 52 days!)
- `rejectUnknownSymbol: true` (new — eliminates UNKNOWN noise)
- `maxRiskLevel: medium` (new)

### 4. CIO Scanner Scoring v3.1 (`scanner_cio_v3.py`) — IMPROVED
Rewritten `score_cio()` with proper weighting:
- **Volume/Liquidity ratio** (25%) — pump detection signal
- **Freshness sweet spot** (20%) — peak at 1-6h, not too new
- **Liquidity health** (20%) — log-scale scoring
- **Buy/Sell pressure** (15%) — accumulation detection
- **Transaction density** (10%) — organic interest
- **Source credibility** (10%) — boost sources weighted higher
- Added `vol_liq_ratio`, `buy_ratio_1h`, `txns_1h_buys/sells` to output metrics

### 5. Auto Signal Generator — FIXED
- Resolves token symbols from DexScreener pair data (fixes UNKNOWN)
- **Skips signals for unresolved tokens** — major noise reduction
- Adds vol/liq ratio, buys/sells to signal output
- Updates stored token names when resolved

### 6. Data Fixes
- Fixed corrupted `token_registry.json` (4 git merge conflicts + embedded text)
- Recovered 130 tokens from corrupted file + 13 from backup = 130 merged
- Restored `signals.json` from `latest.json` (was emptied by conflict)

## Results (Backtest v2)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Precision | 5.0% | 16.7% | **3.3x** |
| Recall | 11.1% | 33.3% | **3x** |
| Noise ratio | 95% | 83% | **-12pp** |
| F1 Score | 6.9% | 22.2% | **3.2x** |
| Winners captured | 1/9 | 3/9 | HEDW, ZEROCLAW, EARENDEL |
| Winner avg gain | 0% | 667% | Captures high-quality signals |

### Winners Now Captured
- **HEDW** — +1,320% gain (was #1 HoF token)
- **ZEROCLAW** — +241% gain
- **EARENDEL** — +442% gain

### Remaining Gaps
- 6 HoF winners not captured (BOUNCERBOT, CLOC, ClawnchPedia, ClawCaster, AI2028, WILDE)
  - These have zero initial liquidity in registry → need enrichment at detection time
- Precision target: 20%+ (current: 16.7%)
- Need more historical data to fully validate quality scorer

## Files Changed
```
scripts/signal_quality_scorer.py    — NEW (quality scoring)
scripts/scanner_cio_v3.py          — IMPROVED (scoring v3.1 + metrics)
scripts/auto_signal_generator.py   — FIXED (symbol resolution, skip UNKNOWN)
state/token_registry.json          — FIXED (merge conflicts resolved)
signals/signals.json               — FIXED (restored from latest.json)
```

## Files Added (workspace/lurker/)
```
backtest_v2.js                     — NEW (comprehensive backtest)
filters_v2.json                    — NEW (multi-dimensional filters)
```

## Next Steps
1. Enable `pump_dump_detector.py` with quality scorer integration
2. Add holder count data source (Covalent/Moralis API)
3. Track vol_liq_ratio over time for momentum shift detection
4. Build "alert quality" feedback loop from user reactions
5. Integrate quality_score into Telegram alert messages (show grade)
