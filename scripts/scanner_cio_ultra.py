#!/usr/bin/env python3
"""
LURKER CIO Scanner - ULTRA LAUNCH MODE
Discovery-first: catch everything, tag risk, filter later
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
STATE_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"

# ULTRA LAUNCH MODE - Discovery thresholds
MIN_LIQ_USD = 1_000        # $1k (was $2k)
MIN_VOLUME_5M = 50         # $50 vol 5min
MIN_TX_5M = 2              # 2 tx minimum
MAX_AGE_MINUTES = 60       # Extended window
TIMEOUT = 15

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

def get_json(url):
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"Accept": "application/json"})
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[SCANNER] Error {url}: {e}")
        return None

def load_token_registry():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"schema": "lurker_token_registry_v1", "tokens": {}}

def save_token_registry(registry):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(registry, f, indent=2)

def calculate_risk_tags(pair):
    """Tag risks instead of filtering out"""
    risks = []
    liq = safe_num((pair.get("liquidity") or {}).get("usd"), 0)
    vol_5m = safe_num((pair.get("volume") or {}).get("m5"), 0)
    tx_5m = (pair.get("txns") or {}).get("m5") or {}
    tx_count = (tx_5m.get("buys") or 0) + (tx_5m.get("sells") or 0)
    
    if liq < 5000:
        risks.append("low_liquidity")
    if liq < 2000:
        risks.append("very_low_liquidity")
    if tx_count < 5:
        risks.append("low_activity")
    if vol_5m < 100:
        risks.append("low_volume")
    
    price_change = safe_num(pair.get("priceChange", {}).get("m5"), 0)
    if price_change < -10:
        risks.append("dumping")
    
    return risks

def fetch_search_pairs():
    """Source 1: Search popular pairs (the 'rake')"""
    print("[SCANNER] Source 1: Search rake...")
    
    # Popular search terms that catch new pairs
    search_terms = ["WETH", "USDC", "ETH", "1000000", "0x", "BASE"]
    all_pairs = []
    
    for term in search_terms[:3]:  # Limit to avoid rate limits
        results = get_json(f"{BASE_URL}/latest/dex/search?q={term}")
        if results and isinstance(results, dict):
            pairs = results.get("pairs", [])
            # Filter Base chain
            base_pairs = [p for p in pairs if (p.get("chainId") or "").lower() == CHAIN]
            all_pairs.extend(base_pairs)
        time.sleep(0.2)
    
    # Deduplicate by pair address
    seen = set()
    unique = []
    for p in all_pairs:
        addr = p.get("pairAddress", "").lower()
        if addr and addr not in seen:
            seen.add(addr)
            unique.append({"pair": p, "source": "search"})
    
    print(f"[SCANNER] Source 1: {len(unique)} unique pairs")
    return unique

def fetch_token_profiles():
    """Source 2: Token profiles"""
    print("[SCANNER] Source 2: Token profiles...")
    profiles = get_json(f"{BASE_URL}/token-profiles/latest/v1")
    if not profiles:
        return []
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles") or profiles.get("data") or []
    
    base_profiles = [p for p in profiles if (p.get("chainId") or "").lower() == CHAIN][:50]
    results = []
    
    for p in base_profiles:
        token = p.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list) and len(pairs) > 0:
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "profiles", "profile": p})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 2: {len(results)} pairs")
    return results

def fetch_boosted():
    """Source 3: Boosted tokens"""
    print("[SCANNER] Source 3: Boosted tokens...")
    boosts = get_json(f"{BASE_URL}/token-boosts/latest/v1")
    if not boosts:
        return []
    if isinstance(boosts, dict):
        boosts = boosts.get("boosts") or boosts.get("data") or []
    
    base_boosts = [b for b in boosts if (b.get("chainId") or "").lower() == CHAIN][:30]
    results = []
    
    for b in base_boosts:
        token = b.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list) and len(pairs) > 0:
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "boosts", "boost": b})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 3: {len(results)} pairs")
    return results

def process_candidate(item, registry):
    """Process a candidate - ULTRA LAUNCH MODE (permissive)"""
    pair = item["pair"]
    source = item.get("source", "unknown")
    
    # Get basic info
    pair_addr = pair.get("pairAddress", "").lower()
    token = pair.get("baseToken") or pair.get("token") or {}
    token_addr = (token.get("address") or "").lower()
    token_symbol = token.get("symbol", "UNKNOWN")
    
    if not token_addr:
        return None, "no_token"
    
    # Check quote token (permissive - allow more pairs)
    quote = pair.get("quoteToken") or {}
    quote_symbol = quote.get("symbol", "")
    
    # Get pair creation time
    pair_created = pair.get("pairCreatedAt") or 0
    if not pair_created:
        # Try to estimate from registry
        token_meta = registry["tokens"].get(token_addr, {})
        pair_created = token_meta.get("first_seen", now_ms())
    
    # Calculate age
    age_ms = now_ms() - pair_created
    age_min = age_ms / 60000
    age_h = age_ms / 3600000
    
    # ULTRA LAUNCH: accept up to 60 minutes
    if age_min > MAX_AGE_MINUTES:
        return None, "too_old"
    
    # Check if truly new (anti-relist)
    is_new, token_meta = True, {"first_seen": now_ms(), "first_seen_iso": iso()}
    if token_addr in registry["tokens"]:
        first_seen = registry["tokens"][token_addr]["first_seen"]
        token_age_h = (now_ms() - first_seen) / 3600000
        if token_age_h > 48:  # Seen more than 48h ago
            return None, "known_token"
        is_new = False
        token_meta = registry["tokens"][token_addr]
    else:
        registry["tokens"][token_addr] = token_meta
    
    # Get metrics
    liq = safe_num((pair.get("liquidity") or {}).get("usd"), 0)
    vol_5m = safe_num((pair.get("volume") or {}).get("m5"), 0)
    vol_1h = safe_num((pair.get("volume") or {}).get("h1"), 0)
    tx_5m = (pair.get("txns") or {}).get("m5") or {}
    tx_count_5m = (tx_5m.get("buys") or 0) + (tx_5m.get("sells") or 0)
    
    # ULTRA LAUNCH thresholds
    if liq < MIN_LIQ_USD:
        return None, "low_liq"
    if vol_5m < MIN_VOLUME_5M and vol_1h < 500:
        return None, "low_volume"
    if tx_count_5m < MIN_TX_5M:
        return None, "low_tx"
    
    # Calculate risk tags
    risks = calculate_risk_tags(pair)
    
    # Score (higher = better)
    score = 50  # Base
    if age_h < 1: score += 30
    elif age_h < 10: score += 20
    elif age_h < 30: score += 10
    
    if liq > 10000: score += 15
    elif liq > 5000: score += 10
    elif liq > 2000: score += 5
    
    if vol_5m > 1000: score += 10
    if tx_count_5m > 10: score += 10
    
    if source == "boosts": score += 5
    
    return {
        "token": {
            "address": token_addr,
            "symbol": token_symbol,
            "name": token.get("name", ""),
        },
        "pair": {
            "address": pair_addr,
            "dex": pair.get("dexId", ""),
            "quote": quote_symbol,
        },
        "metrics": {
            "liq_usd": liq,
            "vol_5m_usd": vol_5m,
            "vol_1h_usd": vol_1h,
            "txns_5m": tx_count_5m,
            "price_usd": pair.get("priceUsd"),
        },
        "timestamps": {
            "pair_created_at": iso(pair_created),
            "token_first_seen": token_meta["first_seen_iso"],
            "age_minutes": round(age_min, 1),
            "age_hours": round(age_h, 2),
        },
        "scores": {
            "cio_score": min(score, 100),
            "freshness": round(max(0, 1 - age_h/60), 2),
        },
        "risks": risks,
        "risk_level": "high" if len(risks) >= 3 else "medium" if len(risks) >= 1 else "low",
        "source": source,
        "status": "observing",
    }, None

def scan():
    """Main scan - ULTRA LAUNCH MODE"""
    print("=" * 60)
    print("[SCANNER] LURKER CIO Scanner - ULTRA LAUNCH MODE")
    print(f"[SCANNER] Thresholds: liq>${MIN_LIQ_USD}, vol>${MIN_VOLUME_5M}, tx>{MIN_TX_5M}")
    print("=" * 60)
    
    t0 = now_ms()
    registry = load_token_registry()
    
    # Fetch all sources
    all_items = []
    all_items.extend(fetch_search_pairs())      # Source 1: Search
    all_items.extend(fetch_token_profiles())    # Source 2: Profiles
    all_items.extend(fetch_boosted())           # Source 3: Boosted
    
    print(f"\n[SCANNER] Total raw: {len(all_items)} items")
    
    # Process and dedupe
    candidates = []
    rejected = defaultdict(int)
    seen_tokens = set()
    
    for item in all_items:
        pair = item["pair"]
        token = pair.get("baseToken") or pair.get("token") or {}
        token_addr = (token.get("address") or "").lower()
        
        if not token_addr or token_addr in seen_tokens:
            rejected["duplicate" if token_addr else "no_token"] += 1
            continue
        
        candidate, reason = process_candidate(item, registry)
        if candidate:
            candidates.append(candidate)
            seen_tokens.add(token_addr)
        else:
            rejected[reason] += 1
    
    # Save registry
    save_token_registry(registry)
    
    # Sort by score (freshness prioritized)
    candidates.sort(key=lambda x: (x["scores"]["cio_score"], -x["timestamps"]["age_minutes"]), reverse=True)
    
    # Keep top 50 (more than before)
    candidates = candidates[:50]
    
    # Count by risk
    risk_counts = defaultdict(int)
    for c in candidates:
        risk_counts[c["risk_level"]] += 1
    
    # Determine status
    if len(candidates) > 0:
        status = "ok"
    elif len(all_items) == 0:
        status = "degraded"  # No raw data from any source
    else:
        status = "calm"  # Data available but no candidates passed filters
    
    # Build feed
    feed = {
        "schema": "lurker_cio_ultra_launch",
        "meta": {
            "updated_at": iso(),
            "generated_at": iso(),  # For health check freshness validation
            "status": status,
            "count": len(candidates),
            "thresholds": {
                "min_liq_usd": MIN_LIQ_USD,
                "min_vol_5m": MIN_VOLUME_5M,
                "min_tx_5m": MIN_TX_5M,
                "max_age_min": MAX_AGE_MINUTES,
            },
            "risk_distribution": dict(risk_counts),
            "rejected": dict(rejected),
            "source": "ultra_launch_scanner",
        },
        "candidates": candidates,
    }
    
    # Save
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CIO_FILE, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    
    print(f"\n[SCANNER] ✅ Candidates: {len(candidates)}")
    print(f"[SCANNER] Risk: {dict(risk_counts)}")
    print(f"[SCANNER] Rejected: {dict(rejected)}")
    print(f"[SCANNER] Time: {(now_ms()-t0)/1000:.1f}s")
    
    for c in candidates[:5]:
        print(f"  • {c['token']['symbol']}: score={c['scores']['cio_score']}, "
              f"age={c['timestamps']['age_minutes']:.0f}m, "
              f"liq=${c['metrics']['liq_usd']:,.0f}, "
              f"risk={c['risk_level']}, source={c['source']}")

def write_fail(msg: str):
    import traceback
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "lurker_cio_ultra_launch",
        "meta": {
            "updated_at": iso(),
            "status": "error",
            "count": 0,
            "error": msg[:500],
            "trace": traceback.format_exc()[-500:],
        },
        "candidates": [],
    }
    CIO_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[SCANNER] ⚠️ Error handled: {msg[:200]}")

if __name__ == "__main__":
    try:
        scan()
    except Exception as e:
        write_fail(f"scanner crashed: {repr(e)}")
        sys.exit(1)  # Exit 1 for total crash
