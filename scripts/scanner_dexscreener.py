#!/usr/bin/env python3
"""
LURKER Base Scanner — MVP via DexScreener API
Queries new/high-activity pairs on Base, filters, scores, writes to feed
"""
import json
import random
import requests
import time
from datetime import datetime, timedelta
from pathlib import Path

# Config
FEED_FILE = Path(__file__).parent.parent / "signals" / "live_feed.json"
MIN_LIQUIDITY = 5000   # $5k min
MIN_VOLUME_24H = 1000  # $1k min
MAX_MCAP = 10000000    # $10M max (favor smaller/newer tokens)
TOP_PAIRS = 20  # Keep top 20

# Blacklist bluechips (known large tokens)
BLUECHIP_SYMBOLS = {
    "AERO", "AERODROME", "cbBTC", "CBBTC", "SOL", "WETH", "ETH", "USDC", "USDT", 
    "DAI", "VIRTUAL", "VVV", "BRETT", "DEGEN", "CLANKER", "BASE", "USDBC",
    "WSTETH", "CBETH", "WEETH", "RSR", "SNX", "UNI", "LINK", "AAVE"
}
BLUECHIP_ADDRESSES = {
    "0x940181a94a35a4569e4529a3cdfb74e38fd98631",  # AERO
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",  # cbBTC
    "0x532f27101965dd16442e59d40670faf5ebb142e4",  # BRETT
    "0x4ed4e862860be51c722da7f9d9165e9a8ad3c50e",  # DEGEN
}

def fetch_with_retry(url, max_retries=3, backoff_base=2):
    """Fetch with exponential backoff, handle 429/503/timeouts"""
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, timeout=20)
            
            # Handle rate limit
            if resp.status_code == 429:
                sleep_time = backoff_base * (2 ** attempt) + random.uniform(0, 2)
                print(f"[SCANNER] 429 rate limit, retry in {sleep_time:.1f}s (attempt {attempt+1}/{max_retries})")
                time.sleep(sleep_time)
                continue
            
            # Handle service unavailable
            if resp.status_code in [502, 503, 504]:
                sleep_time = backoff_base * (2 ** attempt)
                print(f"[SCANNER] {resp.status_code} error, retry in {sleep_time:.1f}s")
                time.sleep(sleep_time)
                continue
            
            # Check content-type before parsing
            content_type = resp.headers.get('content-type', '').lower()
            if 'json' not in content_type and resp.status_code == 200:
                # Might be HTML error page
                if len(resp.text) < 500 and '<html' in resp.text.lower():
                    print(f"[SCANNER] Got HTML instead of JSON, retry...")
                    time.sleep(backoff_base * (2 ** attempt))
                    continue
            
            resp.raise_for_status()
            return resp.json()
            
        except requests.exceptions.Timeout:
            sleep_time = backoff_base * (2 ** attempt)
            print(f"[SCANNER] Timeout, retry in {sleep_time:.1f}s")
            time.sleep(sleep_time)
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                sleep_time = backoff_base * (2 ** attempt)
                print(f"[SCANNER] Request error: {e}, retry in {sleep_time:.1f}s")
                time.sleep(sleep_time)
            else:
                raise
    
    raise Exception(f"Failed after {max_retries} retries")

def fetch_base_pairs():
    """Fetch Base pairs from DexScreener via search with resilience"""
    all_pairs = []
    queries = ["aerodrome", "clanker", "degen", "brett", "base"]
    
    for q in queries:
        url = f"https://api.dexscreener.com/latest/dex/search?q={q}"
        try:
            data = fetch_with_retry(url)
            pairs = data.get("pairs", [])
            # Filter for Base chain only
            base_pairs = [p for p in pairs if p.get("chainId") == "base"]
            all_pairs.extend(base_pairs)
            print(f"[SCANNER] Query '{q}': {len(base_pairs)} Base pairs")
            time.sleep(0.5 + random.uniform(0, 0.5))  # Rate limit with jitter
        except Exception as e:
            print(f"[SCANNER] Failed query '{q}': {e}")
            # Continue with other queries - fail-soft
            continue
    
    # Deduplicate by pair address
    seen = set()
    unique_pairs = []
    for p in all_pairs:
        addr = p.get("pairAddress", "")
        if addr and addr not in seen:
            seen.add(addr)
            unique_pairs.append(p)
    
    return unique_pairs

def calculate_confidence(pair):
    """Scoring favoring smaller/newer tokens (anti-bluechip)"""
    score = 50  # Base
    
    # Get metrics
    liq = pair.get("liquidity", {}).get("usd", 0) or 0
    vol = pair.get("volume", {}).get("h24", 0) or 0
    mcap = pair.get("marketCap", 0) or pair.get("fdv", 0) or 0
    
    # Market cap factor (favor small caps - proxy for "new")
    # Lower mcap = higher score (inverse relationship)
    if 0 < mcap < 1000000:      # < $1M
        score += 25
    elif mcap < 5000000:        # $1-5M
        score += 15
    elif mcap < 10000000:       # $5-10M
        score += 5
    elif mcap > 50000000:       # > $50M (too big)
        score -= 20
    
    # Liquidity score (reasonable liquidity is good, max +20)
    if liq > 500000:
        score += 10  # Reduced for big tokens
    elif liq > 200000:
        score += 15
    elif liq > 100000:
        score += 20
    elif liq > 50000:
        score += 15
    elif liq > 10000:
        score += 10
    
    # Volume score (activity is good, max +15)
    if vol > 1000000:
        score += 10
    elif vol > 500000:
        score += 12
    elif vol > 100000:
        score += 15
    elif vol > 50000:
        score += 10
    elif vol > 10000:
        score += 5
    
    return max(0, min(score, 100))

def pair_to_signal(pair):
    """Convert DexScreener pair to LURKER signal format"""
    base_token = pair.get("baseToken", {})
    
    # Use base token as the main signal
    token_symbol = base_token.get("symbol", "UNKNOWN")
    token_address = base_token.get("address", "")
    
    # Skip if no address or if it's a stable/common pair
    if not token_address:
        return None, "no_address"
    
    # Skip bluechips
    if token_symbol.upper() in BLUECHIP_SYMBOLS:
        return None, "bluechip_symbol"
    if token_address.lower() in BLUECHIP_ADDRESSES:
        return None, "bluechip_address"
    
    # Skip common stables
    if token_symbol in ["USDC", "USDT", "DAI", "WETH", "WBTC"]:
        return None, "stable_token"
    
    liq = pair.get("liquidity", {}).get("usd", 0) or 0
    vol = pair.get("volume", {}).get("h24", 0) or 0
    mcap = pair.get("marketCap", 0) or pair.get("fdv", 0) or 0
    
    # Skip if market cap too high (bluechip proxy)
    if mcap > MAX_MCAP:
        return None, f"high_mcap_${mcap:,.0f}"
    
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
            "mcap_usd": mcap,
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
