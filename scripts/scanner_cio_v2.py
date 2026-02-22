#!/usr/bin/env python3
"""
LURKER CIO Scanner v2 — Real freshness via pairCreatedAt
Uses DexScreener token-profiles/latest + token-pairs endpoints
"""
import json
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

# Config
BASE_URL = "https://api.dexscreener.com"
CHAIN = "base"
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"

# Filters
QUOTE_WHITELIST = {"USDC", "WETH", "cbBTC", "USDBC"}
MIN_LIQ_USD = 10_000
MAX_AGE_HOURS = 48
MAX_TOKENS_PER_RUN = 35
TIMEOUT = 15

# Blacklist
BLUECHIP_SYMBOLS = {
    "AERO", "AERODROME", "cbBTC", "CBBTC", "WETH", "ETH", "USDC", "USDT", 
    "DAI", "VIRTUAL", "VVV", "BRETT", "DEGEN", "CLANKER", "BASE", "USDBC",
    "WSTETH", "CBETH", "WEETH", "RSR", "SNX", "UNI", "LINK", "AAVE", "CRV",
    "SOL", "WBTC", "BTC", "TRUMP"
}

def get_json(url):
    """Fetch JSON with error handling"""
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"Accept": "application/json"})
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[SCANNER] Error fetching {url}: {e}")
        return None

def now_ms():
    return int(time.time() * 1000)

def iso(ts_ms):
    """Convert timestamp ms to ISO string"""
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()

def pick_best_pair(pairs):
    """Choose pair with highest liquidity"""
    best = None
    best_liq = -1
    for p in pairs:
        liq = (p.get("liquidity") or {}).get("usd") or 0
        if liq > best_liq:
            best = p
            best_liq = liq
    return best

def calculate_score(pair, age_hours):
    """CIO score: freshness + liquidity + volume"""
    score = 40  # Base
    
    # Freshness (40%)
    if age_hours < 1:
        score += 40
    elif age_hours < 6:
        score += 35
    elif age_hours < 12:
        score += 30
    elif age_hours < 24:
        score += 20
    elif age_hours < 48:
        score += 10
    
    # Liquidity (30%)
    liq = (pair.get("liquidity") or {}).get("usd") or 0
    if liq > 0:
        import math
        liq_score = min(math.log10(liq) / 6, 1.0) * 30
        score += liq_score
    
    # Volume (30%)
    vol = (pair.get("volume") or {}).get("h24") or 0
    if vol > 0:
        import math
        vol_score = min(math.log10(vol) / 6, 1.0) * 30
        score += vol_score
    
    return round(min(score, 100), 1)

def scan():
    """Main scan function"""
    t0 = now_ms()
    print("[SCANNER] LURKER CIO Scanner v2 — Real pairCreatedAt")
    print("=" * 60)
    
    # 1) Get latest token profiles
    print("[SCANNER] Fetching latest token profiles...")
    profiles = get_json(f"{BASE_URL}/token-profiles/latest/v1")
    
    if not profiles:
        print("[SCANNER] ERROR: Failed to fetch profiles")
        return
    
    # Normalize to list
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles") or profiles.get("data") or []
    
    print(f"[SCANNER] Got {len(profiles)} profiles")
    
    # 2) Filter for Base chain
    base_profiles = [p for p in profiles if (p.get("chainId") or "").lower() == CHAIN]
    print(f"[SCANNER] Base profiles: {len(base_profiles)}")
    
    # Limit per run
    base_profiles = base_profiles[:MAX_TOKENS_PER_RUN]
    
    # 3) Process each token
    candidates = []
    rejected = {}
    
    for i, profile in enumerate(base_profiles):
        token_addr = profile.get("tokenAddress")
        if not token_addr:
            continue
        
        print(f"[SCANNER] [{i+1}/{len(base_profiles)}] Processing {token_addr[:10]}...")
        
        # Get token pairs
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token_addr}")
        
        if not pairs or not isinstance(pairs, list) or len(pairs) == 0:
            rejected["no_pairs"] = rejected.get("no_pairs", 0) + 1
            continue
        
        # Pick best pair (highest liquidity)
        best = pick_best_pair(pairs)
        if not best:
            rejected["no_best_pair"] = rejected.get("no_best_pair", 0) + 1
            continue
        
        # Get pairCreatedAt (ms timestamp)
        pair_created = best.get("pairCreatedAt")
        if not pair_created:
            rejected["no_created_at"] = rejected.get("no_created_at", 0) + 1
            continue
        
        # Calculate age
        try:
            age_hours = (now_ms() - int(pair_created)) / 3600000.0
        except:
            rejected["invalid_timestamp"] = rejected.get("invalid_timestamp", 0) + 1
            continue
        
        # Filter: age 0-48h
        if age_hours < 0 or age_hours > MAX_AGE_HOURS:
            rejected[f"age_{'old' if age_hours > MAX_AGE_HOURS else 'future'}"] = rejected.get(f"age_{'old' if age_hours > MAX_AGE_HOURS else 'future'}", 0) + 1
            continue
        
        # Filter: quote whitelist
        quote = ((best.get("quoteToken") or {}).get("symbol") or "").strip()
        if quote not in QUOTE_WHITELIST:
            rejected["bad_quote"] = rejected.get("bad_quote", 0) + 1
            continue
        
        # Filter: min liquidity
        liq = (best.get("liquidity") or {}).get("usd") or 0
        if liq < MIN_LIQ_USD:
            rejected["low_liq"] = rejected.get("low_liq", 0) + 1
            continue
        
        # Filter: blacklist
        base_sym = ((best.get("baseToken") or {}).get("symbol") or "").strip()
        if base_sym.upper() in BLUECHIP_SYMBOLS:
            rejected["bluechip"] = rejected.get("bluechip", 0) + 1
            continue
        
        # Get metrics
        vol24 = (best.get("volume") or {}).get("h24") or 0
        tx24_obj = (best.get("txns") or {}).get("h24") or {}
        tx24 = (tx24_obj.get("buys") or 0) + (tx24_obj.get("sells") or 0)
        
        # Calculate score
        score = calculate_score(best, age_hours)
        
        # Build candidate
        candidate = {
            "kind": "CIO_CANDIDATE",
            "chainId": CHAIN,
            "dexId": best.get("dexId", "unknown"),
            "token": {
                "address": token_addr,
                "symbol": f"${base_sym}",
                "name": (best.get("baseToken") or {}).get("name", base_sym)
            },
            "quote_token": {
                "address": (best.get("quoteToken") or {}).get("address", ""),
                "symbol": quote
            },
            "pool_address": best.get("pairAddress", ""),
            "pair_url": best.get("url", ""),
            "created_at": iso(int(pair_created)),
            "age_hours": round(age_hours, 2),
            "pairCreatedAt": int(pair_created),
            "metrics": {
                "liq_usd": liq,
                "vol_24h_usd": vol24,
                "txns_24h": tx24,
                "fdv": best.get("fdv"),
                "marketCap": best.get("marketCap"),
                "price_usd": best.get("priceUsd")
            },
            "scores": {
                "cio_score": score,
                "freshness": round(max(0, 1 - (age_hours / 48)), 2)
            },
            "status": "observing",
            "source": "dexscreener_v2"
        }
        
        candidates.append(candidate)
        print(f"  ✓ {base_sym}: age={age_hours:.1f}h, liq=${liq:,.0f}, score={score}")
        
        # Rate limit
        time.sleep(0.2)
    
    # Sort by freshness (youngest first), then by score
    candidates.sort(key=lambda x: (x["age_hours"], -x["scores"]["cio_score"]))
    
    # Build feed
    feed = {
        "schema": "lurker_cio_v2",
        "meta": {
            "updated_at": iso(now_ms()),
            "source": "dexscreener(token-profiles/latest + token-pairs/v1)",
            "chain": CHAIN,
            "count": len(candidates),
            "filters": {
                "max_age_hours": MAX_AGE_HOURS,
                "min_liq_usd": MIN_LIQ_USD,
                "quote_whitelist": sorted(list(QUOTE_WHITELIST)),
                "max_tokens_per_run": MAX_TOKENS_PER_RUN
            },
            "rejected": rejected
        },
        "candidates": candidates
    }
    
    # Save
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CIO_FILE, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    
    print(f"\n[SCANNER] Candidates: {len(candidates)}")
    print(f"[SCANNER] Rejected: {sum(rejected.values())}")
    print(f"[SCANNER] Time: {(now_ms()-t0)/1000:.2f}s")
    print("[SCANNER] Done")

if __name__ == "__main__":
    scan()
