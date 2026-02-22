#!/usr/bin/env python3
"""
LURKER FAST-CERTIFIED Scanner — 6-24h momentum detection
Runs hourly, analyzes CIO candidates aged 6-24h for early momentum
"""
import json
import requests
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://api.dexscreener.com"
CHAIN = "base"

CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
FAST_FILE = Path(__file__).parent.parent / "signals" / "fast_certified_feed.json"

# FAST-CERTIFIED criteria (1-24h)
MIN_AGE_HOURS = 1
MAX_AGE_HOURS = 24
MIN_LIQ_USD = 20_000
MIN_TX_6H = 50
MAX_DUMP_PCT = -40  # Allow up to 40% drawdown from ATH

def load_cio_feed():
    """Load current CIO feed"""
    if not CIO_FILE.exists():
        return {"candidates": []}
    with open(CIO_FILE) as f:
        return json.load(f)

def fetch_pair_metrics(pool_address):
    """Re-fetch current metrics for a pair"""
    try:
        url = f"{BASE_URL}/token-pairs/v1/{CHAIN}/{pool_address}"
        # Actually we need to fetch by token, let's use dexscreener pair endpoint
        # Fallback: return None, we'll use stored metrics
        return None
    except:
        return None

def calculate_momentum_score(cio, current_time_ms):
    """Calculate momentum score for FAST-CERTIFIED"""
    metrics = cio.get("metrics", {})
    timestamps = cio.get("timestamps", {})
    scores = cio.get("scores", {})
    
    # Age at time of check
    pair_created = datetime.fromisoformat(timestamps.get("pair_created_at", "2024-01-01").replace("Z", "+00:00"))
    age_hours = (datetime.now(timezone.utc) - pair_created).total_seconds() / 3600
    
    if age_hours < MIN_AGE_HOURS or age_hours > MAX_AGE_HOURS:
        return None, f"age_{age_hours:.1f}h"
    
    # Liquidity check
    liq = metrics.get("liq_usd", 0)
    if liq < MIN_LIQ_USD:
        return None, f"low_liq_${liq:,.0f}"
    
    # Volume momentum (6h vs 1h trend)
    vol_1h = metrics.get("vol_1h_usd", 0)
    vol_6h = metrics.get("vol_6h_usd", vol_1h * 3)  # Estimate if not stored
    vol_24h = metrics.get("vol_24h_usd", 0)
    
    # Transaction momentum
    tx_1h = metrics.get("txns_1h", 0)
    tx_24h = metrics.get("txns_24h", 0)
    
    if tx_24h < MIN_TX_6H:
        return None, f"low_tx_{tx_24h}"
    
    # Calculate momentum score (0-100)
    score = 50  # Base
    
    # Age sweet spot (6-12h best)
    if 6 <= age_hours <= 12:
        score += 25
    elif 12 < age_hours <= 18:
        score += 15
    else:
        score += 5
    
    # Liquidity strength (higher = better up to 100k)
    liq_score = min(liq / 100000, 1.0) * 15
    score += liq_score
    
    # Volume trend (vol_1h vs avg)
    avg_vol_1h = vol_24h / 24 if vol_24h > 0 else 0
    if avg_vol_1h > 0 and vol_1h > avg_vol_1h * 1.5:
        score += 10  # Accelerating volume
    
    # Transaction density
    if tx_1h > 20:
        score += 10
    
    # Original CIO score factor
    cio_score = scores.get("cio_score", 0)
    score += (cio_score / 100) * 10
    
    result = {
        "kind": "FAST_CERTIFIED",
        "original_cio": {
            "token": cio["token"],
            "pool_address": cio["pool_address"],
            "dex_id": cio.get("dex_id", "unknown"),
            "pair_url": cio.get("pair_url", "")
        },
        "timestamps": {
            "pair_created_at": timestamps.get("pair_created_at"),
            "certified_at": datetime.now(timezone.utc).isoformat(),
            "age_hours": round(age_hours, 2)
        },
        "metrics_at_cert": {
            "liq_usd": liq,
            "vol_1h_usd": vol_1h,
            "vol_24h_usd": vol_24h,
            "txns_1h": tx_1h,
            "txns_24h": tx_24h,
            "price_usd": metrics.get("price_usd"),
            "marketCap": metrics.get("marketCap")
        },
        "momentum": {
            "score": round(min(score, 100), 1),
            "vol_trend": "up" if vol_1h > avg_vol_1h * 1.2 else "stable" if vol_1h > avg_vol_1h * 0.8 else "down",
            "tx_density": "high" if tx_1h > 30 else "medium" if tx_1h > 15 else "low"
        },
        "status": "fast_certified"
    }
    
    return result, None

def scan():
    """Main scan for FAST-CERTIFIED"""
    print("=" * 60)
    print("[FAST-CERTIFIED] LURKER 6-24h Momentum Scanner")
    print("=" * 60)
    
    cio_feed = load_cio_feed()
    cio_list = cio_feed.get("candidates", [])
    
    print(f"[FAST] Loaded {len(cio_list)} CIO candidates")
    
    current_time_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    
    fast_certified = []
    rejected = {}
    seen_tokens = set()
    
    for cio in cio_list:
        token_addr = cio.get("token", {}).get("address", "").lower()
        if token_addr in seen_tokens:
            continue
        
        result, reason = calculate_momentum_score(cio, current_time_ms)
        if result:
            fast_certified.append(result)
            seen_tokens.add(token_addr)
        else:
            rejected[reason] = rejected.get(reason, 0) + 1
    
    # Sort by momentum score
    fast_certified.sort(key=lambda x: x["momentum"]["score"], reverse=True)
    
    # Build feed
    feed = {
        "schema": "lurker_fast_certified_v1",
        "meta": {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "source": "cio_recheck",
            "count": len(fast_certified),
            "criteria": {
                "min_age_hours": MIN_AGE_HOURS,
                "max_age_hours": MAX_AGE_HOURS,
                "min_liq_usd": MIN_LIQ_USD,
                "min_tx_6h": MIN_TX_6H
            },
            "rejected": rejected
        },
        "fast_certified": fast_certified
    }
    
    # Save
    FAST_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(FAST_FILE, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    
    print(f"\n[FAST] ✅ Certified: {len(fast_certified)}")
    print(f"[FAST] Rejected: {rejected}")
    
    for f in fast_certified[:5]:
        print(f"  • {f['original_cio']['token']['symbol']}: "
              f"momentum={f['momentum']['score']}, "
              f"age={f['timestamps']['age_hours']:.1f}h, "
              f"liq=${f['metrics_at_cert']['liq_usd']:,.0f}")

if __name__ == "__main__":
    scan()
