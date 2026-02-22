#!/usr/bin/env python3
"""
LURKER WATCH Scanner — 10-30min silent buffer
Re-tests candidates 3 times before promotion to HOTLIST
"""
import json
import time
import requests
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

BASE_URL = "https://api.dexscreener.com"
CHAIN = "base"

CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
WATCH_FILE = Path(__file__).parent.parent / "signals" / "watch_feed.json"
STATE_FILE = Path(__file__).parent.parent / "state" / "watch_state.json"

# WATCH criteria (10-30 min window)
MIN_AGE_MINUTES = 10
MAX_AGE_MINUTES = 30
MIN_LIQ_USD = 8_000
MIN_TX_5M = 15  # Activity in last 5 minutes
MAX_CHECKS = 3  # Re-test up to 3 times before reject

def now_ms():
    return int(time.time() * 1000)

def iso(ts_ms=None):
    if ts_ms is None:
        ts_ms = now_ms()
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()

def safe_num(x, default=0):
    try:
        return float(x) if x is not None else default
    except:
        return default

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"schema": "lurker_watch_state_v1", "watching": {}}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def get_tx_5m(metrics):
    """Get 5min tx count from metrics"""
    txns = metrics.get("txns", {})
    m5 = txns.get("m5", {})
    return (m5.get("buys") or 0) + (m5.get("sells") or 0)

def process_cio_for_watch(cio, state):
    """Process a CIO candidate for WATCH eligibility"""
    timestamps = cio.get("timestamps", {})
    metrics = cio.get("metrics", {})
    token = cio.get("token", {})
    
    # Calculate age in minutes
    pair_created = datetime.fromisoformat(timestamps.get("pair_created_at", "2024-01-01").replace("Z", "+00:00"))
    age_minutes = (datetime.now(timezone.utc) - pair_created).total_seconds() / 60
    
    # Age window check
    if age_minutes < MIN_AGE_MINUTES:
        return None, "too_young"
    if age_minutes > MAX_AGE_MINUTES:
        return None, "too_old"
    
    # Basic metrics
    liq = safe_num(metrics.get("liq_usd"), 0)
    tx_5m = get_tx_5m(metrics)
    
    # Hard filters
    if liq < MIN_LIQ_USD:
        return None, f"low_liq_${liq:,.0f}"
    
    if tx_5m < MIN_TX_5M:
        return None, f"low_tx_5m_{tx_5m}"
    
    # Track check count
    token_addr = token.get("address", "").lower()
    if token_addr in state["watching"]:
        state["watching"][token_addr]["checks"] += 1
        state["watching"][token_addr]["last_check"] = now_ms()
    else:
        state["watching"][token_addr] = {
            "first_seen": now_ms(),
            "checks": 1,
            "last_check": now_ms()
        }
    
    check_count = state["watching"][token_addr]["checks"]
    
    # Build watch entry
    result = {
        "kind": "WATCH_CANDIDATE",
        "token": token,
        "pool_address": cio.get("pool_address"),
        "pair_url": cio.get("pair_url"),
        "dex_id": cio.get("dex_id", "unknown"),
        "timestamps": {
            "pair_created_at": timestamps.get("pair_created_at"),
            "added_to_watch": iso(),
            "age_minutes": round(age_minutes, 1),
            "checks": check_count
        },
        "metrics": {
            "liq_usd": liq,
            "txns_5m": tx_5m,
            "vol_5m_usd": metrics.get("volume", {}).get("m5", 0),
            "price_usd": metrics.get("price_usd")
        },
        "status": "watching",
        "next_check": "HOTLIST eligibility at 30-60m"
    }
    
    return result, None

def scan():
    """Main scan for WATCH candidates"""
    print("=" * 60)
    print("[WATCH] LURKER 10-30min Silent Buffer")
    print("=" * 60)
    
    # Load CIO feed
    if not CIO_FILE.exists():
        print("[WATCH] No CIO feed found")
        return
    
    with open(CIO_FILE) as f:
        cio_feed = json.load(f)
    
    cio_list = cio_feed.get("candidates", [])
    print(f"[WATCH] Loaded {len(cio_list)} CIO candidates")
    
    state = load_state()
    
    watch_list = []
    rejected = defaultdict(int)
    seen_tokens = set()
    
    for cio in cio_list:
        token_addr = cio.get("token", {}).get("address", "").lower()
        if token_addr in seen_tokens:
            continue
        
        result, reason = process_cio_for_watch(cio, state)
        if result:
            # Only keep if checked less than MAX_CHECKS
            check_count = result["timestamps"]["checks"]
            if check_count <= MAX_CHECKS:
                watch_list.append(result)
                seen_tokens.add(token_addr)
            else:
                rejected["max_checks_exceeded"] += 1
        else:
            rejected[reason] += 1
    
    # Clean old watch entries (> 2 hours)
    cutoff = now_ms() - (2 * 60 * 60 * 1000)
    state["watching"] = {k: v for k, v in state["watching"].items() if v.get("last_check", 0) > cutoff}
    
    save_state(state)
    
    # Sort by checks (most checked = most promising)
    watch_list.sort(key=lambda x: x["timestamps"]["checks"], reverse=True)
    
    # Keep top 20
    watch_list = watch_list[:20]
    
    # Build feed
    feed = {
        "schema": "lurker_watch_v1",
        "meta": {
            "updated_at": iso(),
            "source": "cio_10-30min_buffer",
            "count": len(watch_list),
            "criteria": {
                "age_minutes": f"{MIN_AGE_MINUTES}-{MAX_AGE_MINUTES}",
                "min_liq_usd": MIN_LIQ_USD,
                "min_tx_5m": MIN_TX_5M,
                "max_checks": MAX_CHECKS
            },
            "rejected": dict(rejected)
        },
        "watch": watch_list
    }
    
    # Save
    WATCH_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(WATCH_FILE, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    
    print(f"\n[WATCH] ✅ Watching: {len(watch_list)}")
    print(f"[WATCH] Rejected: {dict(rejected)}")
    
    for w in watch_list[:5]:
        print(f"  • {w['token']['symbol']}: checks={w['timestamps']['checks']}, "
              f"age={w['timestamps']['age_minutes']:.0f}m, "
              f"tx5m={w['metrics']['txns_5m']}")

if __name__ == "__main__":
    scan()
