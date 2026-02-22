#!/usr/bin/env python3
"""
LURKER CIO Scanner — MVP DexScreener only (no web3 required)
Builds CIO feed from DexScreener pairs with freshness scoring
"""
import json
import requests
import math
import time
from datetime import datetime, timedelta
from pathlib import Path

# Config
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"

# Filters
MIN_LIQUIDITY = 5000      # $5k min
MIN_VOLUME_24H = 1000     # $1k min  
MAX_MCAP = 50000000       # $50M max (anti-bluechip)
MAX_AGE_HOURS = 48        # Fresh only
TOP_PAIRS = 30            # Keep top 30

# Blacklist bluechips
BLUECHIP_SYMBOLS = {
    "AERO", "AERODROME", "cbBTC", "CBBTC", "WETH", "ETH", "USDC", "USDT", 
    "DAI", "VIRTUAL", "VVV", "BRETT", "DEGEN", "CLANKER", "BASE", "USDBC",
    "WSTETH", "CBETH", "WEETH", "RSR", "SNX", "UNI", "LINK", "AAVE", "CRV"
}

def fetch_dexscreener_pairs():
    """Fetch Base pairs from DexScreener via multiple queries"""
    all_pairs = []
    
    # Multiple queries to get coverage
    queries = ["aerodrome", "clanker", "base", "eth", "usdc", "degen"]
    
    for q in queries:
        try:
            url = f"https://api.dexscreener.com/latest/dex/search?q={q}"
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                pairs = data.get("pairs", [])
                # Filter for Base chain
                base_pairs = [p for p in pairs if p.get("chainId") == "base"]
                all_pairs.extend(base_pairs)
                print(f"[SCANNER] Query '{q}': {len(base_pairs)} Base pairs")
            time.sleep(0.3)
        except Exception as e:
            print(f"[SCANNER] Error querying '{q}': {e}")
    
    # Deduplicate by pair address
    seen = set()
    unique_pairs = []
    for p in all_pairs:
        addr = p.get("pairAddress", "").lower()
        if addr and addr not in seen:
            seen.add(addr)
            unique_pairs.append(p)
    
    return unique_pairs

def calculate_freshness_proxy(pair):
    """
    Calculate freshness proxy since pairCreatedAt is often missing.
    Uses: vol_1h / vol_24h ratio (high = very active recently)
    """
    vol_24h = pair.get("volume", {}).get("h24", 0) or 0
    vol_1h = pair.get("volume", {}).get("h1", 0) or 0
    
    if vol_24h > 0 and vol_1h > 0:
        # If 1h vol is significant portion of 24h, it's active now
        ratio = vol_1h / vol_24h
        # Scale: ratio > 0.1 (very active) → freshness ~0-6h
        #        ratio < 0.02 (low activity) → freshness ~24h+
        if ratio > 0.15:
            return 2  # ~2h (very fresh)
        elif ratio > 0.1:
            return 6  # ~6h
        elif ratio > 0.05:
            return 12  # ~12h
        elif ratio > 0.02:
            return 24  # ~24h
        else:
            return 36  # older
    
    # Fallback: use pairCreatedAt if available
    pair_created = pair.get("pairCreatedAt")
    if pair_created:
        try:
            created = datetime.fromtimestamp(pair_created / 1000)
            age = (datetime.now() - created).total_seconds() / 3600
            return age
        except:
            pass
    
    return 48  # Default to max age if no data

def calculate_cio_score(pair, age_hours):
    """Calculate CIO score: freshness + liq + vol"""
    score = 40  # Base
    
    # Freshness (40%): newer is better
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
    
    # Liquidity (30%): log scale
    liq = pair.get("liquidity", {}).get("usd", 0) or 0
    if liq > 0:
        liq_score = min(math.log10(liq) / 6, 1.0) * 30
        score += liq_score
    
    # Volume (30%): log scale  
    vol = pair.get("volume", {}).get("h24", 0) or 0
    if vol > 0:
        vol_score = min(math.log10(vol) / 6, 1.0) * 30
        score += vol_score
    
    return round(min(score, 100), 1)

def pair_to_cio(pair):
    """Convert DexScreener pair to CIO format"""
    base_token = pair.get("baseToken", {})
    quote_token = pair.get("quoteToken", {})
    
    token_symbol = base_token.get("symbol", "UNKNOWN")
    token_address = base_token.get("address", "")
    quote_symbol = quote_token.get("symbol", "")
    
    # Skip if no address
    if not token_address:
        return None, "no_address"
    
    # Skip bluechips
    if token_symbol.upper() in BLUECHIP_SYMBOLS:
        return None, "bluechip"
    
    # Skip stables as base
    if token_symbol in ["USDC", "USDT", "DAI", "USDBC"]:
        return None, "stable"
    
    # Calculate freshness proxy
    age_hours = calculate_freshness_proxy(pair)
    
    # Get timestamp for created_at
    pair_created = pair.get("pairCreatedAt")
    if pair_created:
        created_at = datetime.fromtimestamp(pair_created / 1000).isoformat()
    else:
        # Estimate from freshness proxy
        created_at = (datetime.now() - timedelta(hours=age_hours)).isoformat()
    
    # Get metrics
    liq = pair.get("liquidity", {}).get("usd", 0) or 0
    vol = pair.get("volume", {}).get("h24", 0) or 0
    mcap = pair.get("marketCap", 0) or pair.get("fdv", 0) or 0
    price = pair.get("priceUsd", 0) or 0
    
    # Skip if filters fail
    if liq < MIN_LIQUIDITY:
        return None, f"low_liq_${liq:,.0f}"
    
    if vol < MIN_VOLUME_24H:
        return None, f"low_vol_${vol:,.0f}"
    
    if mcap > MAX_MCAP:
        return None, f"high_mcap_${mcap:,.0f}"
    
    # Calculate score
    cio_score = calculate_cio_score(pair, age_hours)
    
    # Risk tags
    risk_tags = []
    if liq < 10000:
        risk_tags.append("low_liquidity")
    if vol < 5000:
        risk_tags.append("low_volume")
    if age_hours > 36:
        risk_tags.append("aging")
    
    # Determine quote whitelist status
    quote_whitelist = quote_symbol in ["WETH", "ETH", "USDC", "USDBC", "cbBTC", "CBETH"]
    
    # Get transactions if available
    txns = pair.get("txns", {})
    txns_24h = (txns.get("h24", {}).get("buys", 0) or 0) + (txns.get("h24", {}).get("sells", 0) or 0)
    txns_1h = (txns.get("h1", {}).get("buys", 0) or 0) + (txns.get("h1", {}).get("sells", 0) or 0)
    
    return {
        "kind": "CIO_CANDIDATE",
        "created_at": created_at,
        "age_hours": round(age_hours, 1),
        "chain": "base",
        "dex": pair.get("dexId", "unknown"),
        "pool_address": pair.get("pairAddress", ""),
        "token": {
            "symbol": f"${token_symbol}",
            "name": base_token.get("name", token_symbol),
            "address": token_address
        },
        "quote_token": {
            "symbol": quote_symbol,
            "address": quote_token.get("address", "")
        },
        "metrics": {
            "price_usd": float(price) if price else 0,
            "mcap": float(mcap) if mcap else 0,
            "liq_usd": float(liq),
            "vol_24h_usd": float(vol),
            "vol_1h_usd": float(pair.get("volume", {}).get("h1", 0) or 0),
            "txns_24h": int(txns_24h),
            "txns_1h": int(txns_1h)
        },
        "scores": {
            "cio_score": cio_score,
            "freshness": round(max(0, 1 - (age_hours / 48)), 2)
        },
        "risk_tags": risk_tags,
        "quote_whitelisted": quote_whitelist,
        "status": "observing",
        "enriched": True
    }, None

def scan():
    """Main scan function"""
    print("[SCANNER] LURKER DexScreener CIO Scanner")
    print("=" * 50)
    
    # Fetch pairs
    pairs = fetch_dexscreener_pairs()
    print(f"[SCANNER] Total unique pairs: {len(pairs)}")
    
    # Convert to CIO
    candidates = []
    rejected = {}
    
    for pair in pairs:
        cio, reason = pair_to_cio(pair)
        if cio:
            candidates.append(cio)
        else:
            rejected[reason] = rejected.get(reason, 0) + 1
    
    print(f"[SCANNER] Rejected: {len(rejected)} reasons, {sum(rejected.values())} total")
    for reason, count in sorted(rejected.items(), key=lambda x: -x[1])[:5]:
        print(f"  - {reason}: {count}")
    
    # Sort by score
    candidates.sort(key=lambda x: x["scores"]["cio_score"], reverse=True)
    
    # Keep top N
    candidates = candidates[:TOP_PAIRS]
    
    print(f"[SCANNER] Candidates: {len(candidates)}")
    for c in candidates[:5]:
        print(f"  - {c['token']['symbol']}: score={c['scores']['cio_score']}, age={c['age_hours']:.1f}h, liq=${c['metrics']['liq_usd']:,.0f}")
    
    # Build feed
    feed = {
        "schema": "lurker_cio_v1",
        "last_updated": datetime.now().isoformat(),
        "source": "dexscreener",
        "chain": "base",
        "count": len(candidates),
        "debug": {
            "raw_pairs": len(pairs),
            "rejected_reasons": rejected
        },
        "candidates": candidates
    }
    
    # Save
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CIO_FILE, 'w') as f:
        json.dump(feed, f, indent=2)
    
    print(f"[SCANNER] Feed saved: {len(candidates)} candidates")
    print("[SCANNER] Done")

if __name__ == "__main__":
    scan()
