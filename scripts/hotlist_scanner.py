#!/usr/bin/env python3
"""
LURKER HOTLIST Scanner — 30-60min early opportunity detection
NOT certified — high risk, high reward scalping candidates
"""
import json
import sys
import time
import requests
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

BASE_URL = "https://api.dexscreener.com"
CHAIN = "base"

CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
HOTLIST_FILE = Path(__file__).parent.parent / "signals" / "hotlist_feed.json"
STATE_FILE = Path(__file__).parent.parent / "state" / "hotlist_state.json"

# HOTLIST criteria (6-48h window) - for tokens with momentum after initial pump
MIN_AGE_MINUTES = 360
MAX_AGE_MINUTES = 2880
MIN_LIQ_USD = 2_000       # Aggressive: $2k (was $5k)
MIN_TX_1H = 15            # 15 (was 30)
MIN_TX_15M = 5            # 5 (was 12)
MIN_VOL_1H = 1_000        # $1k (was $2k)
MAX_PRICE_DROP_5M = -25   # ULTRA: -25% (was -20%)
MAX_SELL_BUY_RATIO = 1.6  # ULTRA: 1.6x (was 1.5x)

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
    return {"schema": "lurker_hotlist_state_v1", "last_seen": {}, "rejected": {}}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def fetch_pair_data(pool_address):
    """Fetch fresh data for a specific pair"""
    try:
        # Use token-pairs endpoint with the pool's token
        # For now, we use the data from CIO feed and enrich if needed
        return None
    except:
        return None

def calculate_hotlist_score(pair_data, tx_1h, vol_1h, liq, trend_5m):
    """Score: txns 35%, liq 30%, vol 20%, trend 15%"""
    score = 0
    
    # Txns density (35%) - normalized to 100 txns = max
    tx_score = min(tx_1h / 100, 1.0) * 35
    score += tx_score
    
    # Liquidity (30%) - log scale, 100k = max
    if liq > 0:
        import math
        liq_score = min(math.log10(liq) / 5, 1.0) * 30
        score += liq_score
    
    # Volume (20%) - log scale, 50k = max  
    if vol_1h > 0:
        import math
        vol_score = min(math.log10(vol_1h) / 4.7, 1.0) * 20
        score += vol_score
    
    # Trend (15%) - 5min price change, +10% = max, -10% = 0
    trend_score = max(0, min((trend_5m + 10) / 20, 1.0)) * 15
    score += trend_score
    
    return round(score, 1)

def assess_rug_risk(metrics, tx_data, prev_liq=None):
    """Assess rug pull risk factors"""
    risks = []
    risk_score = 0
    
    # Low liquidity
    liq = safe_num(metrics.get("liq_usd"), 0)
    if liq < 25_000:
        risks.append("low_liq")
        risk_score += 30
    
    # Sells > buys
    tx_1h = tx_data.get("h1", {})
    buys = safe_num(tx_1h.get("buys"), 0)
    sells = safe_num(tx_1h.get("sells"), 0)
    if buys > 0 and sells / buys > MAX_SELL_BUY_RATIO:
        risks.append("sell_pressure")
        risk_score += 40
    elif sells > buys:
        risks.append("more_sells")
        risk_score += 20
    
    # Liquidity drop
    if prev_liq and prev_liq > 0:
        liq_drop = (prev_liq - liq) / prev_liq
        if liq_drop > 0.25:
            risks.append("liq_dropping")
            risk_score += 50
    
    # Wash trading detection (high vol, low tx)
    vol_1h = safe_num(metrics.get("vol_1h_usd"), 0)
    tx_count = buys + sells
    if vol_1h > 50_000 and tx_count < 20:
        risks.append("wash_trading_suspected")
        risk_score += 35
    
    # Determine risk level
    if risk_score >= 70:
        risk_level = "high"
    elif risk_score >= 40:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    return risk_level, risks, risk_score

def process_cio_for_hotlist(cio, state):
    """Process a CIO candidate for HOTLIST eligibility"""
    timestamps = cio.get("timestamps", {})
    metrics = cio.get("metrics", {})
    token = cio.get("token", {})
    
    # Basic metrics
    liq = safe_num(metrics.get("liq_usd"), 0)
    
    # Calculate age in minutes
    pair_created = datetime.fromisoformat(timestamps.get("pair_created_at", "2024-01-01").replace("Z", "+00:00"))
    age_minutes = (datetime.now(timezone.utc) - pair_created).total_seconds() / 60
    
    # Age window check (more permissive for high liquidity)
    if age_minutes < MIN_AGE_MINUTES:
        return None, "too_young"
    if age_minutes > MAX_AGE_MINUTES:
        # Exception: keep hotlisting tokens with $10k+ liquidity up to 72h
        if liq >= 10000 and age_minutes <= 4320:
            pass  # Accept it
        else:
            return None, "too_old"
    vol_1h = safe_num(metrics.get("vol_1h_usd"), 0)
    tx_1h_obj = metrics.get("txns_h1", 0)  # This is a number in our format
    tx_1h = int(tx_1h_obj) if isinstance(tx_1h_obj, (int, float)) else 0
    
    # Try to get 15m tx from txns structure
    tx_15m = 0
    txns_data = cio.get("txns", {}) or {}
    if isinstance(txns_data, dict):
        m15 = txns_data.get("m15", {})
        if isinstance(m15, dict):
            tx_15m = (m15.get("buys") or 0) + (m15.get("sells") or 0)
    
    # Transaction check: 15m OR 1h (more permissive for early runs)
    tx_ok = (tx_15m >= MIN_TX_15M) or (tx_1h >= MIN_TX_1H)
    
    # Hard filters
    if liq < MIN_LIQ_USD:
        return None, f"low_liq_${liq:,.0f}"
    
    if vol_1h < MIN_VOL_1H:
        return None, f"low_vol_${vol_1h:,.0f}"
    
    if not tx_ok:
        return None, f"low_tx_15m_{tx_15m}_1h_{tx_1h}"
    
    # Get tx breakdown (we need to re-fetch for detailed tx data)
    # For now, use estimated values
    buys = int(tx_1h_obj * 0.55)  # Estimate 55% buys
    sells = int(tx_1h_obj * 0.45)
    
    # Price trend (estimate from vol/liq ratio changes if available)
    trend_5m = 0  # Will need fresh data
    
    # Check rug risk
    token_addr = token.get("address", "").lower()
    prev_liq = state["last_seen"].get(token_addr, {}).get("liq")
    risk_level, risks, risk_score = assess_rug_risk(metrics, {"h1": {"buys": buys, "sells": sells}}, prev_liq)
    
    # Hard reject on critical risks
    if "liq_dropping" in risks or "wash_trading_suspected" in risks:
        return None, f"critical_risk_{risks[0]}"
    
    # Calculate score
    score = calculate_hotlist_score(metrics, tx_1h_obj, vol_1h, liq, trend_5m)
    
    # Boost score for low risk
    if risk_level == "low":
        score += 10
    
    # Build hotlist entry
    result = {
        "kind": "HOTLIST_CANDIDATE",
        "token": token,
        "pool_address": cio.get("pool_address"),
        "pair_url": cio.get("pair_url"),
        "dex_id": cio.get("dex_id", "unknown"),
        "timestamps": {
            "pair_created_at": timestamps.get("pair_created_at"),
            "hotlisted_at": iso(),
            "age_minutes": round(age_minutes, 1)
        },
        "metrics": {
            "liq_usd": liq,
            "vol_1h_usd": vol_1h,
            "txns_1h": tx_1h_obj,
            "buys_1h_est": buys,
            "sells_1h_est": sells
        },
        "scores": {
            "hotlist_score": score,
            "rug_risk_score": risk_score,
            "opportunity_score": round(score - risk_score * 0.5, 1)
        },
        "risk": {
            "level": risk_level,
            "factors": risks
        },
        "warnings": [
            "EARLY_OPPORTUNITY_NOT_CERTIFIED",
            "HIGH_RISK_HIGH_REWARD" if risk_level != "low" else "MODERATE_RISK"
        ],
        "status": "hotlist"
    }
    
    # Update state
    state["last_seen"][token_addr] = {
        "liq": liq,
        "timestamp": now_ms()
    }
    
    return result, None

def scan():
    """Main scan for HOTLIST candidates"""
    print("=" * 60)
    print("[HOTLIST] LURKER 30-60min Early Opportunity Scanner")
    print("=" * 60)
    
    # Load CIO feed
    if not CIO_FILE.exists():
        print("[HOTLIST] ⚠️ No CIO feed found — creating empty hotlist feed")
        feed = {
            "schema": "lurker_hotlist_v1",
            "meta": {
                "updated_at": iso(),
                "status": "degraded",
                "source": "cio_30-60min_filter",
                "count": 0,
                "criteria": {
                    "age_minutes": f"{MIN_AGE_MINUTES}-{MAX_AGE_MINUTES}",
                    "min_liq_usd": MIN_LIQ_USD,
                    "min_tx_1h": MIN_TX_1H,
                    "min_vol_1h": MIN_VOL_1H,
                    "max_sell_buy_ratio": MAX_SELL_BUY_RATIO
                },
                "rejected": {"no_cio_feed": 1}
            },
            "hotlist": []
        }
        HOTLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(HOTLIST_FILE, 'w', encoding='utf-8') as f:
            json.dump(feed, f, ensure_ascii=False, indent=2)
        print(f"[HOTLIST] ✅ Created empty feed (no CIO available)")
        return 0
    
    with open(CIO_FILE) as f:
        cio_feed = json.load(f)
    
    cio_list = cio_feed.get("candidates", [])
    print(f"[HOTLIST] Loaded {len(cio_list)} CIO candidates")
    
    state = load_state()
    
    hotlist = []
    rejected = defaultdict(int)
    seen_tokens = set()
    
    for cio in cio_list:
        token_addr = cio.get("token", {}).get("address", "").lower()
        if token_addr in seen_tokens:
            continue
        
        result, reason = process_cio_for_hotlist(cio, state)
        if result:
            hotlist.append(result)
            seen_tokens.add(token_addr)
        else:
            rejected[reason] += 1
    
    # Sort by opportunity score
    hotlist.sort(key=lambda x: x["scores"]["opportunity_score"], reverse=True)
    
    # Keep top 20
    hotlist = hotlist[:20]
    
    # Determine status
    if len(hotlist) > 0:
        status = "ok"
    else:
        status = "calm"  # No candidates in window
    
    # Build feed
    feed = {
        "schema": "lurker_hotlist_v1",
        "meta": {
            "updated_at": iso(),
            "status": status,
            "source": "cio_30-60min_filter",
            "count": len(hotlist),
            "criteria": {
                "age_minutes": f"{MIN_AGE_MINUTES}-{MAX_AGE_MINUTES}",
                "min_liq_usd": MIN_LIQ_USD,
                "min_tx_1h": MIN_TX_1H,
                "min_vol_1h": MIN_VOL_1H,
                "max_sell_buy_ratio": MAX_SELL_BUY_RATIO
            },
            "rejected": dict(rejected)
        },
        "hotlist": hotlist
    }
    
    # Save
    HOTLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(HOTLIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    
    save_state(state)
    
    print(f"\n[HOTLIST] ✅ Hotlisted: {len(hotlist)}")
    print(f"[HOTLIST] Rejected: {dict(rejected)}")
    
    for h in hotlist[:5]:
        print(f"  • {h['token']['symbol']}: score={h['scores']['hotlist_score']}, "
              f"opp={h['scores']['opportunity_score']}, "
              f"risk={h['risk']['level']}, "
              f"age={h['timestamps']['age_minutes']:.0f}m")
    
    return 0

def write_fail(msg: str):
    """Write empty feed with error - crash = exit 1"""
    import traceback
    HOTLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "lurker_hotlist_v1",
        "meta": {
            "updated_at": iso(),
            "status": "error",
            "count": 0,
            "error": msg[:500],
            "trace": traceback.format_exc()[-500:]
        },
        "hotlist": []
    }
    HOTLIST_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[HOTLIST] ⚠️ Error handled: {msg[:200]}")

if __name__ == "__main__":
    try:
        exit_code = scan()
        sys.exit(exit_code if exit_code is not None else 0)
    except Exception as e:
        write_fail(f"hotlist scanner crashed: {repr(e)}")
        sys.exit(1)  # Exit 1 for total crash
