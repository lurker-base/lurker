#!/usr/bin/env python3
"""
LURKER CIO Scanner v3 — Râteau large multi-source
Combines: new pairs + token profiles + boosts
Anti-relist: tracks token first_seen
"""
import json
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import defaultdict

# Config
BASE_URL = "https://api.dexscreener.com"
CHAIN = "base"
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
STATE_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"

# Filters - LAUNCH MODE (temporarily lowered)
QUOTE_WHITELIST = {"USDC", "WETH", "cbBTC", "USDBC", "ETH"}
MIN_LIQ_USD = 2_000       # LAUNCH MODE: $2k (was $5k)
MIN_VOLUME_1H = 200       # LAUNCH MODE: $200 (was $500)
MIN_TX_1H = 5             # LAUNCH MODE: 5 (was 10)
MAX_AGE_HOURS = 48
MAX_TOKENS_PER_SOURCE = 50
TIMEOUT = 15

# Blacklist
BLUECHIP_SYMBOLS = {
    "AERO", "AERODROME", "cbBTC", "CBBTC", "WETH", "ETH", "USDC", "USDT", 
    "DAI", "VIRTUAL", "VVV", "BRETT", "DEGEN", "CLANKER", "BASE", "USDBC",
    "WSTETH", "CBETH", "WEETH", "RSR", "SNX", "UNI", "LINK", "AAVE", "CRV",
    "SOL", "WBTC", "BTC", "TRUMP", "MIGGLES"
}

def get_json(url):
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"Accept": "application/json"})
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[SCANNER] Error {url}: {e}")
        return None

def now_ms():
    return int(time.time() * 1000)

def iso(ts_ms=None):
    if ts_ms is None:
        ts_ms = now_ms()
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()

def age_hours(ts_ms):
    return (now_ms() - ts_ms) / 3600000.0

def safe_num(x, default=0):
    try:
        return float(x) if x is not None else default
    except:
        return default

def load_token_registry():
    """Load token first_seen registry for anti-relist"""
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"schema": "lurker_token_registry_v1", "tokens": {}}

def save_token_registry(registry):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(registry, f, indent=2)

def is_new_token(token_addr, registry, max_age_hours=48):
    """Check if token is truly new (first_seen < max_age)"""
    token_addr = token_addr.lower()
    now = now_ms()
    
    if token_addr in registry["tokens"]:
        first_seen = registry["tokens"][token_addr]["first_seen"]
        age = (now - first_seen) / 3600000.0
        return age < max_age_hours, registry["tokens"][token_addr]
    else:
        # First time seeing this token
        registry["tokens"][token_addr] = {
            "first_seen": now,
            "first_seen_iso": iso(now)
        }
        return True, registry["tokens"][token_addr]

def score_cio(pair, age_h, source_boost=0):
    """Score: freshness + liquidity + volume + source boost"""
    score = 30 + source_boost  # Base + source bonus
    
    # Freshness (40%)
    if age_h < 1:
        score += 40
    elif age_h < 6:
        score += 35
    elif age_h < 12:
        score += 30
    elif age_h < 24:
        score += 20
    elif age_h < 48:
        score += 10
    
    # Liquidity (20%)
    liq = safe_num((pair.get("liquidity") or {}).get("usd"), 0)
    if liq > 0:
        import math
        score += min(math.log10(liq) / 7, 1.0) * 20
    
    # Volume 1h (20%) - momentum signal
    vol_1h = safe_num((pair.get("volume") or {}).get("h1"), 0)
    if vol_1h > 0:
        import math
        score += min(math.log10(vol_1h) / 5, 1.0) * 20
    
    # Transaction count (10%) - activity signal
    tx_1h = (pair.get("txns") or {}).get("h1") or {}
    tx_count = (tx_1h.get("buys") or 0) + (tx_1h.get("sells") or 0)
    score += min(tx_count / 100, 1.0) * 10
    
    return round(min(score, 100), 1)

def fetch_new_pairs():
    """Source 1: Recent pairs via token-profiles -> token-pairs"""
    print("[SCANNER] Source 1: New pairs via token-profiles...")
    profiles = get_json(f"{BASE_URL}/token-profiles/latest/v1")
    if not profiles:
        return []
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles") or profiles.get("data") or []
    
    base_profiles = [p for p in profiles if (p.get("chainId") or "").lower() == CHAIN][:MAX_TOKENS_PER_SOURCE]
    results = []
    
    for p in base_profiles:
        token = p.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list):
            # Take best pair by liquidity
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "profiles", "profile": p})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 1: {len(results)} pairs")
    return results

def fetch_boosted_tokens():
    """Source 2: Boosted tokens (budget = intent)"""
    print("[SCANNER] Source 2: Boosted tokens...")
    boosts = get_json(f"{BASE_URL}/token-boosts/latest/v1")
    if not boosts:
        return []
    if isinstance(boosts, dict):
        boosts = boosts.get("boosts") or boosts.get("data") or []
    
    base_boosts = [b for b in boosts if (b.get("chainId") or "").lower() == CHAIN][:MAX_TOKENS_PER_SOURCE]
    results = []
    
    for b in base_boosts:
        token = b.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list):
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "boosts", "boost": b})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 2: {len(results)} pairs")
    return results

def fetch_top_boosted():
    """Source 3: Top boosted (highest budget)"""
    print("[SCANNER] Source 3: Top boosted...")
    boosts = get_json(f"{BASE_URL}/token-boosts/top/v1")
    if not boosts:
        return []
    if isinstance(boosts, dict):
        boosts = boosts.get("boosts") or boosts.get("data") or []
    
    base_boosts = [b for b in boosts if (b.get("chainId") or "").lower() == CHAIN][:20]
    results = []
    
    for b in base_boosts:
        token = b.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list):
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "top_boosts", "boost": b})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 3: {len(results)} pairs")
    return results

def process_candidate(item, registry):
    """Process a candidate through filters"""
    pair = item["pair"]
    source = item["source"]
    
    # Get pair created timestamp
    pair_created = pair.get("pairCreatedAt")
    if not pair_created:
        return None, "no_created_at"
    
    pair_age = age_hours(pair_created)
    if pair_age > MAX_AGE_HOURS:
        return None, f"pair_too_old_{pair_age:.0f}h"
    
    # Get token info
    base_token = pair.get("baseToken") or {}
    quote_token = pair.get("quoteToken") or {}
    token_addr = base_token.get("address", "").lower()
    symbol = base_token.get("symbol", "UNKNOWN")
    
    # Blacklist
    if symbol.upper() in BLUECHIP_SYMBOLS:
        return None, "bluechip"
    
    # Anti-relist: check token first_seen
    is_new, token_meta = is_new_token(token_addr, registry)
    token_age = (now_ms() - token_meta["first_seen"]) / 3600000.0
    
    if not is_new:
        return None, f"token_old_{token_age:.0f}h"
    
    # Quote whitelist
    quote = quote_token.get("symbol", "")
    if quote not in QUOTE_WHITELIST:
        return None, "bad_quote"
    
    # Metrics
    liq = safe_num((pair.get("liquidity") or {}).get("usd"), 0)
    vol_1h = safe_num((pair.get("volume") or {}).get("h1"), 0)
    tx_1h_obj = (pair.get("txns") or {}).get("h1") or {}
    tx_1h = (tx_1h_obj.get("buys") or 0) + (tx_1h_obj.get("sells") or 0)
    
    # Filters
    if liq < MIN_LIQ_USD:
        return None, f"low_liq_${liq:,.0f}"
    
    if vol_1h < MIN_VOLUME_1H:
        return None, f"low_vol_1h_${vol_1h:,.0f}"
    
    if tx_1h < MIN_TX_1H:
        return None, f"low_tx_{tx_1h}"
    
    # Source boost
    source_boost = {"profiles": 5, "boosts": 10, "top_boosts": 15}.get(source, 0)
    
    # Score
    score = score_cio(pair, min(pair_age, token_age), source_boost)
    
    # Build candidate
    return {
        "kind": "CIO_CANDIDATE",
        "token": {
            "address": token_addr,
            "symbol": f"${symbol}",
            "name": base_token.get("name", symbol)
        },
        "quote_token": {
            "symbol": quote,
            "address": quote_token.get("address", "")
        },
        "pool_address": pair.get("pairAddress", ""),
        "pair_url": pair.get("url", ""),
        "dex_id": pair.get("dexId", "unknown"),
        "chain": CHAIN,
        "metrics": {
            "liq_usd": liq,
            "vol_1h_usd": vol_1h,
            "vol_24h_usd": safe_num((pair.get("volume") or {}).get("h24"), 0),
            "txns_1h": tx_1h,
            "txns_24h": safe_num((pair.get("txns") or {}).get("h24", {}).get("total"), 0),
            "price_usd": pair.get("priceUsd"),
            "marketCap": pair.get("marketCap") or pair.get("fdv")
        },
        "timestamps": {
            "pair_created_at": iso(int(pair_created)),
            "token_first_seen": token_meta["first_seen_iso"],
            "pair_age_hours": round(pair_age, 2),
            "token_age_hours": round(token_age, 2)
        },
        "scores": {
            "cio_score": score,
            "freshness": round(max(0, 1 - (min(pair_age, token_age) / 48)), 2),
            "source": source,
            "source_boost": source_boost
        },
        "status": "observing",
        "enriched": True
    }, None

def scan():
    """Main scan — râteau large"""
    print("=" * 60)
    print("[SCANNER] LURKER CIO Scanner v3 — Multi-source Rake")
    print("=" * 60)
    
    t0 = now_ms()
    registry = load_token_registry()
    
    # Fetch all sources
    all_items = []
    all_items.extend(fetch_new_pairs())
    all_items.extend(fetch_boosted_tokens())
    all_items.extend(fetch_top_boosted())
    
    print(f"\n[SCANNER] Total raw: {len(all_items)} items")
    
    # Process and dedupe
    candidates = []
    rejected = defaultdict(int)
    seen_pools = set()
    
    for item in all_items:
        pool = item["pair"].get("pairAddress", "").lower()
        if pool in seen_pools:
            rejected["duplicate_pool"] += 1
            continue
        
        candidate, reason = process_candidate(item, registry)
        if candidate:
            candidates.append(candidate)
            seen_pools.add(pool)
        else:
            rejected[reason] += 1
    
    # Save registry (updated first_seen)
    save_token_registry(registry)
    
    # Sort by score
    candidates.sort(key=lambda x: x["scores"]["cio_score"], reverse=True)
    
    # Keep top 30
    candidates = candidates[:30]
    
    # Build feed
    feed = {
        "schema": "lurker_cio_v3",
        "meta": {
            "updated_at": iso(),
            "source": "multi-source-rake",
            "count": len(candidates),
            "sources": ["profiles", "boosts", "top_boosts"],
            "filters": {
                "max_age_hours": MAX_AGE_HOURS,
                "min_liq_usd": MIN_LIQ_USD,
                "min_vol_1h": MIN_VOLUME_1H,
                "min_tx_1h": MIN_TX_1H
            },
            "rejected": dict(rejected)
        },
        "candidates": candidates
    }
    
    # Save
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CIO_FILE, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    
    print(f"\n[SCANNER] ✅ Candidates: {len(candidates)}")
    print(f"[SCANNER] Rejected: {dict(rejected)}")
    print(f"[SCANNER] Time: {(now_ms()-t0)/1000:.1f}s")
    
    for c in candidates[:5]:
        print(f"  • {c['token']['symbol']}: score={c['scores']['cio_score']}, "
              f"pair_age={c['timestamps']['pair_age_hours']:.1f}h, "
              f"token_age={c['timestamps']['token_age_hours']:.1f}h, "
              f"source={c['scores']['source']}")

def write_fail(msg: str):
    """Write empty feed with error - never crash GitHub Actions"""
    import traceback
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "lurker_cio_v3",
        "meta": {
            "updated_at": iso(),
            "count": 0,
            "error": msg[:500],
            "trace": traceback.format_exc()[-500:]
        },
        "candidates": []
    }
    CIO_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[SCANNER] ⚠️ Error handled: {msg[:200]}")

if __name__ == "__main__":
    try:
        scan()
    except Exception as e:
        write_fail(f"scanner crashed: {repr(e)}")
        # Exit 0 = GitHub Actions stays green
        sys.exit(0)
