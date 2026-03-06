#!/usr/bin/env python3
"""
LURKER Multi-API Scanner with Fallback
Implements fallback chain: Birdeye → CoinGecko → DexScreener → Cache

Each source:
- Fetches trending/new tokens
- Normalizes to standard format (symbol, address, liquidity, volume, price)
- Adds to state/lurker_state.json

Rate limiting:
- If source returns 429, wait and retry with exponential backoff
- If all sources fail, use cached data
"""
import json
import os
import random
import requests
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List, Any

# Config
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
STATE_FILE = PROJECT_DIR / "state" / "lurker_state.json"
CACHE_FILE = PROJECT_DIR / "cache" / "multi_api_cache.json"
LOG_FILE = PROJECT_DIR / "logs" / "multi_api_scanner.log"

# Token filters
MIN_LIQUIDITY = 5000    # $5k min
MIN_VOLUME_24H = 1000   # $1k min
MAX_MCAP = 10000000     # $10M max

# Blacklist
BLUECHIP_SYMBOLS = {
    "AERO", "AERODROME", "cbBTC", "CBBTC", "SOL", "WETH", "ETH", "USDC", "USDT",
    "DAI", "VIRTUAL", "VVV", "BRETT", "DEGEN", "CLANKER", "BASE", "USDBC",
    "WSTETH", "CBETH", "WEETH", "RSR", "SNX", "UNI", "LINK", "AAVE", "WBTC"
}

# API Endpoints (free tiers)
BIRDEYE_API = "https://api.birdeye.so"
COINGECKO_API = "https://api.coingecko.com/api/v3"
DEXSCREENER_API = "https://api.dexscreener.com/latest/dex"


def log(msg: str):
    """Log to file and print"""
    ts = datetime.now().isoformat()
    line = f"[{ts}] {msg}"
    print(line)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def load_state() -> Dict:
    """Load current LURKER state"""
    if STATE_FILE.exists():
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {"tokens": {}, "meta": {}}


def save_state(state: Dict):
    """Save LURKER state"""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def load_cache() -> Dict:
    """Load cached data"""
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    return {"tokens": {}, "last_updated": None, "sources_used": []}


def save_cache(cache: Dict):
    """Save cache"""
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


def fetch_with_retry(url: str, headers: Optional[Dict] = None, max_retries: int = 3, 
                     backoff_base: int = 2) -> Optional[Dict]:
    """Fetch with exponential backoff, handle 429/503/timeouts"""
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, headers=headers, timeout=20)
            
            # Handle rate limit
            if resp.status_code == 429:
                sleep_time = backoff_base * (2 ** attempt) + random.uniform(0, 3)
                log(f"⚠️ 429 rate limit, retry in {sleep_time:.1f}s (attempt {attempt+1}/{max_retries})")
                time.sleep(sleep_time)
                continue
            
            # Handle service unavailable
            if resp.status_code in [502, 503, 504]:
                sleep_time = backoff_base * (2 ** attempt)
                log(f"⚠️ {resp.status_code} error, retry in {sleep_time:.1f}s")
                time.sleep(sleep_time)
                continue
            
            resp.raise_for_status()
            return resp.json()
            
        except requests.exceptions.Timeout:
            sleep_time = backoff_base * (2 ** attempt)
            log(f"⚠️ Timeout, retry in {sleep_time:.1f}s")
            time.sleep(sleep_time)
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                sleep_time = backoff_base * (2 ** attempt)
                log(f"⚠️ Request error: {e}, retry in {sleep_time:.1f}s")
                time.sleep(sleep_time)
            else:
                log(f"❌ Failed after {max_retries} retries: {e}")
                return None
    
    return None


def is_bluechip(symbol: str, address: str = "") -> bool:
    """Check if token is a bluechip"""
    if symbol.upper() in BLUECHIP_SYMBOLS:
        return True
    if address.lower() in {
        "0x940181a94a35a4569e4529a3cdfb74e38fd98631",  # AERO
        "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",  # cbBTC
    }:
        return True
    return False


def normalize_token(data: Dict, source: str) -> Optional[Dict]:
    """Normalize token data to standard format"""
    try:
        symbol = data.get("symbol", "").upper()
        address = data.get("address", "") or data.get("token_address", "") or ""
        
        if not address or not symbol:
            return None
        
        if is_bluechip(symbol, address):
            return None
        
        # Extract metrics
        price = data.get("price", 0) or data.get("price_usd", 0) or data.get("priceUsd", 0) or 0
        liquidity = data.get("liquidity", 0) or data.get("liquidity_usd", 0) or data.get("liq_usd", 0) or 0
        volume = data.get("volume", 0) or data.get("volume_24h", 0) or data.get("vol_24h", 0) or data.get("volume24h", 0) or 0
        mcap = data.get("market_cap", 0) or data.get("mcap", 0) or data.get("marketCap", 0) or 0
        
        # Apply filters
        if liquidity < MIN_LIQUIDITY:
            return None
        if volume < MIN_VOLUME_24H:
            return None
        if mcap > MAX_MCAP and mcap > 0:
            return None
        
        return {
            "symbol": symbol,
            "address": address,
            "name": data.get("name", ""),
            "price_usd": float(price) if price else 0,
            "liquidity_usd": float(liquidity) if liquidity else 0,
            "volume_24h": float(volume) if volume else 0,
            "market_cap": float(mcap) if mcap else 0,
            "source": source,
            "detected_at": datetime.now().isoformat()
        }
    except Exception as e:
        log(f"⚠️ Normalize error: {e}")
        return None


def fetch_birdeye() -> List[Dict]:
    """Fetch from Birdeye API (free, good for Solana/Base)"""
    log("📡 Trying Birdeye API...")
    
    tokens = []
    
    # Birdeye doesn't have a public trending endpoint, but has recent tokens
    # Using their price API with limited functionality
    # Note: Birdeye requires API key for most endpoints, try without first
    headers = {
        "Accept": "application/json"
    }
    
    # Try trending tokens endpoint
    url = f"{BIRDEYE_API}/defi/trending/list?sort_by=volume_24h&sort_order=desc&limit=50"
    data = fetch_with_retry(url, headers=headers)
    
    if data and isinstance(data, dict):
        items = data.get("data", []) or data.get("items", []) or data.get("tokens", [])
        for item in items:
            token = normalize_token(item, "birdeye")
            if token:
                tokens.append(token)
    
    if tokens:
        log(f"✅ Birdeye: {len(tokens)} tokens")
        return tokens
    
    log("⚠️ Birdeye: no data")
    return []


def fetch_coingecko() -> List[Dict]:
    """Fetch from CoinGecko API (free tier, rate limited)"""
    log("📡 Trying CoinGecko API...")
    
    tokens = []
    
    # Get trending coins
    url = f"{COINGECKO_API}/search/trending"
    data = fetch_with_retry(url)
    
    if data and isinstance(data, dict):
        coins = data.get("coins", [])
        for coin in coins:
            item = coin.get("item", {})
            # Map CoinGecko format to our format
            token_data = {
                "symbol": item.get("symbol", "").upper(),
                "address": item.get("id", ""),  # CoinGecko uses id not address
                "name": item.get("name", ""),
                "price_usd": item.get("price_btc", 0) * 40000,  # rough USD estimate
                "market_cap": item.get("market_cap_rank", 0),
                "volume_24h": item.get("market_cap", 0),
            }
            token = normalize_token(token_data, "coingecko")
            if token:
                tokens.append(token)
    
    if tokens:
        log(f"✅ CoinGecko: {len(tokens)} tokens")
        return tokens
    
    # Fallback: get coins list
    url = f"{COINGECKO_API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=50&page=1"
    data = fetch_with_retry(url)
    
    if data and isinstance(data, list):
        for item in data:
            token_data = {
                "symbol": item.get("symbol", ""),
                "address": item.get("id", ""),
                "name": item.get("name", ""),
                "price_usd": item.get("current_price", 0),
                "market_cap": item.get("market_cap", 0),
                "volume_24h": item.get("total_volume", 0),
            }
            token = normalize_token(token_data, "coingecko")
            if token:
                tokens.append(token)
    
    if tokens:
        log(f"✅ CoinGecko (markets): {len(tokens)} tokens")
        return tokens
    
    log("⚠️ CoinGecko: no data")
    return []


def fetch_dexscreener() -> List[Dict]:
    """Fetch from DexScreener API (current, rate limited)"""
    log("📡 Trying DexScreener API...")
    
    tokens = []
    queries = ["new", "trending", "base", "solana", "ethereum"]
    
    for q in queries[:2]:  # Limit queries
        url = f"{DEXSCREENER_API}/search?q={q}"
        data = fetch_with_retry(url)
        
        if data and isinstance(data, dict):
            pairs = data.get("pairs", [])
            for pair in pairs:
                base_token = pair.get("baseToken", {})
                token_data = {
                    "symbol": base_token.get("symbol", ""),
                    "address": base_token.get("address", ""),
                    "name": base_token.get("name", ""),
                    "price_usd": pair.get("priceUsd", 0),
                    "liquidity_usd": pair.get("liquidity", {}).get("usd", 0),
                    "volume_24h": pair.get("volume", {}).get("h24", 0),
                    "market_cap": pair.get("marketCap", 0) or pair.get("fdv", 0),
                }
                token = normalize_token(token_data, "dexscreener")
                if token:
                    tokens.append(token)
        
        time.sleep(0.5 + random.uniform(0, 0.5))  # Rate limiting
    
    # Deduplicate
    seen = set()
    unique_tokens = []
    for t in tokens:
        if t["address"] not in seen:
            seen.add(t["address"])
            unique_tokens.append(t)
    
    if unique_tokens:
        log(f"✅ DexScreener: {len(unique_tokens)} tokens")
        return unique_tokens
    
    log("⚠️ DexScreener: no data")
    return []


def fetch_all_sources() -> List[Dict]:
    """Fetch from all sources with fallback"""
    all_tokens = []
    sources_used = []
    
    # Try each source in order
    sources = [
        ("birdeye", fetch_birdeye),
        ("coingecko", fetch_coingecko),
        ("dexscreener", fetch_dexscreener),
    ]
    
    for source_name, fetch_func in sources:
        try:
            tokens = fetch_func()
            if tokens:
                all_tokens.extend(tokens)
                sources_used.append(source_name)
                log(f"📊 {source_name} returned {len(tokens)} tokens")
                break  # Stop at first successful source
            else:
                log(f"⚠️ {source_name} returned no tokens, trying next...")
        except Exception as e:
            log(f"❌ {source_name} failed: {e}, trying next...")
            continue
    
    # Deduplicate
    seen = set()
    unique_tokens = []
    for t in all_tokens:
        if t["address"].lower() not in seen:
            seen.add(t["address"].lower())
            unique_tokens.append(t)
    
    return unique_tokens, sources_used


def update_state(tokens: List[Dict], sources_used: List[str]):
    """Update lurker_state.json with new tokens"""
    state = load_state()
    
    if "tokens" not in state:
        state["tokens"] = {}
    if "meta" not in state:
        state["meta"] = {}
    
    # Update meta
    state["meta"]["last_scan"] = datetime.now().isoformat()
    state["meta"]["scanner"] = "multi_api"
    state["meta"]["sources_used"] = sources_used
    state["meta"]["tokens_found"] = len(tokens)
    
    # Update tokens
    for token in tokens:
        addr = token["address"].lower()
        state["tokens"][addr] = {
            "address": token["address"],
            "symbol": token["symbol"],
            "name": token.get("name", ""),
            "source": token["source"],
            "detected_at": token["detected_at"],
            "category": "NEW",
            "metrics": {
                "price_usd": token["price_usd"],
                "liq_usd": token["liquidity_usd"],
                "vol_24h_usd": token["volume_24h"],
                "market_cap": token["market_cap"],
            }
        }
    
    save_state(state)
    log(f"✅ State updated: {len(tokens)} tokens from {sources_used}")


def run_scanner():
    """Main scanner entry point"""
    log("=" * 50)
    log("🚀 Starting Multi-API Scanner")
    
    # Try to fetch from live sources
    tokens, sources_used = fetch_all_sources()
    
    if tokens:
        # Update state with live data
        update_state(tokens, sources_used)
        
        # Update cache
        cache = {
            "tokens": tokens,
            "last_updated": datetime.now().isoformat(),
            "sources_used": sources_used
        }
        save_cache(cache)
        
        log(f"✅ Scanner complete: {len(tokens)} tokens")
        for t in tokens[:5]:
            log(f"  - ${t['symbol']}: ${t['price_usd']:.6f}, liq=${t['liquidity_usd']:,.0f}")
        return 0
    else:
        # All sources failed, try cache
        log("⚠️ All sources failed, trying cache...")
        cache = load_cache()
        
        if cache.get("tokens"):
            log(f"📦 Using cached data: {len(cache['tokens'])} tokens")
            # Still update state with cache but mark as cached
            update_state(cache["tokens"], ["cache"])
            return 0
        else:
            log("❌ No cache available")
            return 1


if __name__ == "__main__":
    exit_code = run_scanner()
    exit(exit_code)
