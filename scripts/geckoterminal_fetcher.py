#!/usr/bin/env python3
"""
GeckoTerminal API V2 Fetcher for LURKER
Ref: https://api.geckoterminal.com/api/v2
"""
import json
import requests
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
LOG_FILE = PROJECT_DIR / "logs" / "geckoterminal.log"

GECKO_API = "https://api.geckoterminal.com/api/v2"
HEADERS = {
    "Accept": "application/json;version=20230203"
}

MIN_LIQUIDITY = 5000
MIN_VOLUME = 1000

BLUECHIP_ADDRESSES = {
    "0x4200000000000000000000000000000000000006",  # WETH
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",  # USDC
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",  # cbBTC
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",  # USDC (mainnet)
}

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [GeckoTerminal] {msg}")

def fetch_with_retry(url: str, max_retries: int = 3) -> Optional[Dict]:
    """Fetch with rate limit handling"""
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
            
            if resp.status_code == 429:
                wait = 10 * (attempt + 1)
                log(f"⚠️ Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
                
            if resp.status_code == 200:
                return resp.json()
            else:
                log(f"⚠️ Status {resp.status_code}")
                
        except Exception as e:
            log(f"⚠️ Error: {e}")
            
        time.sleep(2)
    return None

def fetch_new_pools(limit: int = 20) -> List[Dict]:
    """Fetch newest pools on Base"""
    log(f"📡 Fetching new pools (limit={limit})...")
    
    url = f"{GECKO_API}/networks/base/new_pools?page=1&limit={limit}"
    data = fetch_with_retry(url)
    
    if not data:
        return []
    
    pools = []
    for pool in data.get("data", []):
        attrs = pool.get("attributes", {})
        
        # Get token addresses from relationships
        relationships = pool.get("relationships", {})
        base_token = relationships.get("base_token", {}).get("data", {})
        quote_token = relationships.get("quote_token", {}).get("data", {})
        
        base_addr = base_token.get("id", "").replace("base_", "")
        quote_addr = quote_token.get("id", "").replace("base_", "")
        
        # Skip bluechips
        if base_addr.lower() in {a.lower() for a in BLUECHIP_ADDRESSES}:
            continue
        if quote_addr.lower() in {a.lower() for a in BLUECHIP_ADDRESSES}:
            continue
            
        # Get pool name (contains token symbols)
        pool_name = attrs.get("name", "")
        
        # Extract token symbol from pool name (e.g., "DEGEN / WETH" -> "DEGEN")
        symbol = pool_name.split(" / ")[0] if "/" in pool_name else "UNKNOWN"
        
        # Get metrics
        liquidity = float(attrs.get("reserve_in_usd", 0) or 0)
        volume_24h = float(attrs.get("volume_usd", {}).get("h24", 0) or 0)
        
        if liquidity < MIN_LIQUIDITY:
            continue
            
        pools.append({
            "symbol": symbol,
            "address": attrs.get("address", ""),
            "name": pool_name,
            "liquidity_usd": liquidity,
            "volume_24h": volume_24h,
            "price_usd": float(attrs.get("base_token_price_usd", 0) or 0),
            "pool_created_at": attrs.get("pool_created_at", ""),
            "dex": relationships.get("dex", {}).get("data", {}).get("id", ""),
            "source": "geckoterminal"
        })
    
    log(f"✅ Found {len(pools)} new pools")
    return pools

def fetch_trending_pools(limit: int = 20) -> List[Dict]:
    """Fetch trending pools on Base"""
    log(f"📡 Fetching trending pools (limit={limit})...")
    
    url = f"{GECKO_API}/networks/base/trending_pools?page=1&limit={limit}"
    data = fetch_with_retry(url)
    
    if not data:
        return []
    
    pools = []
    for pool in data.get("data", []):
        attrs = pool.get("attributes", {})
        
        relationships = pool.get("relationships", {})
        base_token = relationships.get("base_token", {}).get("data", {})
        quote_token = relationships.get("quote_token", {}).get("data", {})
        
        base_addr = base_token.get("id", "").replace("base_", "")
        quote_addr = quote_token.get("id", "").replace("base_", "")
        
        if base_addr.lower() in {a.lower() for a in BLUECHIP_ADDRESSES}:
            continue
        if quote_addr.lower() in {a.lower() for a in BLUECHIP_ADDRESSES}:
            continue
            
        pool_name = attrs.get("name", "")
        symbol = pool_name.split(" / ")[0] if "/" in pool_name else "UNKNOWN"
        
        liquidity = float(attrs.get("reserve_in_usd", 0) or 0)
        volume_24h = float(attrs.get("volume_usd", {}).get("h24", 0) or 0)
        
        if liquidity < MIN_LIQUIDITY:
            continue
            
        pools.append({
            "symbol": symbol,
            "address": attrs.get("address", ""),
            "name": pool_name,
            "liquidity_usd": liquidity,
            "volume_24h": volume_24h,
            "price_usd": float(attrs.get("base_token_price_usd", 0) or 0),
            "price_change_1h": float(attrs.get("price_change_percentage", {}).get("h1", 0) or 0),
            "dex": relationships.get("dex", {}).get("data", {}).get("id", ""),
            "source": "geckoterminal"
        })
    
    log(f"✅ Found {len(pools)} trending pools")
    return pools

def fetch_token_data(address: str) -> Optional[Dict]:
    """Get detailed data for a specific token"""
    url = f"{GECKO_API}/networks/base/pools/{address}"
    data = fetch_with_retry(url)
    
    if not data:
        return None
        
    pool = data.get("data", {}).get("attributes", {})
    return {
        "address": address,
        "name": pool.get("name", ""),
        "price_usd": float(pool.get("base_token_price_usd", 0) or 0),
        "liquidity_usd": float(pool.get("reserve_in_usd", 0) or 0),
        "volume_24h": float(pool.get("volume_usd", {}).get("h24", 0) or 0),
        "txns_24h": pool.get("transactions", {}).get("h24", {}),
        "price_change": pool.get("price_change_percentage", {})
    }

if __name__ == "__main__":
    # Test
    print("=== Testing GeckoTerminal API ===")
    
    print("\n📊 New Pools:")
    new_pools = fetch_new_pools(10)
    for p in new_pools[:5]:
        print(f"  {p['symbol']}: ${p['liquidity_usd']:.0f} liq, ${p['volume_24h']:.0f} vol")
    
    print("\n📈 Trending Pools:")
    trending = fetch_trending_pools(10)
    for p in trending[:5]:
        print(f"  {p['symbol']}: ${p['liquidity_usd']:.0f} liq")
