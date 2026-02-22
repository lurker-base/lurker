#!/usr/bin/env python3
"""
LURKER Base Scanner — MVP via DexScreener API
Queries new/high-activity pairs on Base, filters, scores, writes to feed
"""
import json
import requests
import time
from datetime import datetime, timedelta
from pathlib import Path

# Config
FEED_FILE = Path(__file__).parent.parent / "signals" / "live_feed.json"
MIN_LIQUIDITY = 1000   # $1k min (lowered for testing)
MIN_VOLUME_24H = 500    # $500 min (lowered for testing)
TOP_PAIRS = 20  # Keep top 20

def fetch_base_pairs():
    """Fetch Base pairs from DexScreener via search"""
    try:
        # Search for recent Base activity - using multiple queries for coverage
        all_pairs = []
        queries = ["base", "eth", "usdc"]
        
        queries = ["aerodrome", "clanker", "degen", "brett", "base"]  # More active Base tokens
        for q in queries:
            url = f"https://api.dexscreener.com/latest/dex/search?q={q}"
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                pairs = data.get("pairs", [])
                # Filter for Base chain only
                base_pairs = [p for p in pairs if p.get("chainId") == "base"]
                all_pairs.extend(base_pairs)
                print(f"[SCANNER] Query '{q}': {len(base_pairs)} Base pairs")
            time.sleep(0.3)  # Rate limit
        
        # Deduplicate by pair address
        seen = set()
        unique_pairs = []
        for p in all_pairs:
            addr = p.get("pairAddress", "")
            if addr and addr not in seen:
                seen.add(addr)
                unique_pairs.append(p)
        
        return unique_pairs
    except Exception as e:
        print(f"[SCANNER] Error fetching: {e}")
    return []

def calculate_confidence(pair):
    """Simple scoring based on liquidity, volume, age"""
    score = 50  # Base
    
    # Liquidity score (max +30)
    liq = pair.get("liquidity", {}).get("usd", 0) or 0
    if liq > 500000:
        score += 30
    elif liq > 200000:
        score += 25
    elif liq > 100000:
        score += 20
    elif liq > 50000:
        score += 15
    
    # Volume score (max +20)
    vol = pair.get("volume", {}).get("h24", 0) or 0
    if vol > 1000000:
        score += 20
    elif vol > 500000:
        score += 15
    elif vol > 100000:
        score += 10
    elif vol > 50000:
        score += 5
    
    # Age bonus (newer = higher, max +10)
    pair_created = pair.get("pairCreatedAt", 0)
    if pair_created:
        age_hours = (datetime.now().timestamp() * 1000 - pair_created) / (1000 * 3600)
        if age_hours < 1:
            score += 10
        elif age_hours < 6:
            score += 7
        elif age_hours < 12:
            score += 5
        elif age_hours < 24:
            score += 3
    
    return min(score, 100)

def pair_to_signal(pair):
    """Convert DexScreener pair to LURKER signal format"""
    base_token = pair.get("baseToken", {})
    
    # Use base token as the main signal
    token_symbol = base_token.get("symbol", "UNKNOWN")
    token_address = base_token.get("address", "")
    
    # Skip if no address or if it's a stable/common pair
    if not token_address:
        return None, "no_address"
    
    # Skip if symbol is common stable
    if token_symbol in ["USDC", "USDT", "DAI", "WETH", "WBTC"]:
        return None, "stable_token"
    
    liq = pair.get("liquidity", {}).get("usd", 0) or 0
    vol = pair.get("volume", {}).get("h24", 0) or 0
    
    # Skip low liquidity
    if liq < MIN_LIQUIDITY:
        return None, f"low_liq_${liq:,.0f}"
    
    # Skip low volume
    if vol < MIN_VOLUME_24H:
        return None, f"low_vol_${vol:,.0f}"
    
    confidence = calculate_confidence(pair)
    
    # Temporarily lower confidence threshold for testing
    if confidence < 30:
        return None, f"low_confidence_{confidence}"
    
    # Determine risk
    if liq > 200000:
        risk = "low"
    elif liq > 100000:
        risk = "medium"
    else:
        risk = "high"
    
    price = pair.get("priceUsd", 0) or 0
    
    return {
        "kind": "LURKER_SIGNAL",
        "status": "posted",
        "ts_utc": datetime.now().isoformat() + "Z",
        "chain": "base",
        "token": {
            "name": base_token.get("name", token_symbol),
            "symbol": f"${token_symbol}",
            "address": token_address,
            "pair_url": pair.get("url", f"https://dexscreener.com/base/{pair.get('pairAddress', '')}")
        },
        "scores": {
            "confidence": confidence,
            "rarity": "3-5/day",
            "risk": risk
        },
        "metrics": {
            "price_usd": float(price) if price else 0,
            "mcap_usd": 0,
            "liq_usd": liq,
            "vol_24h_usd": vol
        },
        "dex": pair.get("dexId", "unknown"),
        "pair_address": pair.get("pairAddress", ""),
        "scanner": "dexscreener"
    }, None

def update_feed():
    """Main update function"""
    print("[SCANNER] Fetching Base pairs from DexScreener...")
    
    pairs = fetch_base_pairs()
    print(f"[SCANNER] Raw pairs from API: {len(pairs)}")
    
    # Debug: show first few
    for p in pairs[:3]:
        print(f"  - {p.get('baseToken',{}).get('symbol')}: liq=${p.get('liquidity',{}).get('usd',0):,.0f}")
    
    # Convert to signals
    signals = []
    rejected = {}
    for pair in pairs:
        signal, reason = pair_to_signal(pair)
        if signal:
            signals.append(signal)
        else:
            rejected[reason] = rejected.get(reason, 0) + 1
    
    print(f"[SCANNER] Rejected: {rejected}")
    
    # Sort by confidence
    signals.sort(key=lambda x: x["scores"]["confidence"], reverse=True)
    
    # Keep top N
    signals = signals[:TOP_PAIRS]
    
    print(f"[SCANNER] {len(signals)} signals after filtering")
    
    # Add timestamp
    feed = {
        "meta": {
            "updated_at": datetime.now().isoformat(),
            "source": "dexscreener",
            "chain": "base",
            "count": len(signals),
            "debug": {
                "raw_pairs": len(pairs),
                "rejected": rejected
            }
        },
        "signals": signals
    }
    
    # Write feed
    FEED_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(FEED_FILE, 'w') as f:
        json.dump(feed, f, indent=2)
    
    print(f"[SCANNER] Feed updated: {len(signals)} signals")
    for s in signals[:5]:
        print(f"  - {s['token']['symbol']}: conf={s['scores']['confidence']}, liq=${s['metrics']['liq_usd']:,.0f}")

if __name__ == "__main__":
    update_feed()
