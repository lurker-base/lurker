#!/usr/bin/env python3
"""
Test script to verify GeckoTerminal fallback integration
Simulates scenario where DexScreener returns 0 results
"""
import json
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

GECKO_API = "https://api.geckoterminal.com/api/v2"
GECKO_HEADERS = {"Accept": "application/json;version=20230203"}
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

def get_gecko_json(url, max_retries=2):
    """Fetch from GeckoTerminal API with rate limit handling"""
    for attempt in range(max_retries + 1):
        try:
            r = requests.get(url, timeout=TIMEOUT, headers=GECKO_HEADERS)
            
            if r.status_code == 429:
                wait = 2 * (attempt + 1)
                print(f"[TEST]   GeckoTerminal rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
                
            r.raise_for_status()
            return r.json()
        except requests.exceptions.HTTPError as e:
            if r.status_code == 429:
                wait = 2 * (attempt + 1)
                print(f"[TEST]   GeckoTerminal rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"[TEST] GeckoTerminal error {url}: {e}")
            return None
        except Exception as e:
            print(f"[TEST] GeckoTerminal error {url}: {e}")
            return None
    return None

def fetch_geckoterminal_trending():
    """Fetch trending pools from GeckoTerminal"""
    print("[TEST] Fetching GeckoTerminal trending pools...")
    
    url = f"{GECKO_API}/networks/base/trending_pools?page=1&limit=30"
    data = get_gecko_json(url)
    
    if not data or "data" not in data:
        print("[TEST]   No data from GeckoTerminal")
        return []
    
    results = []
    
    for pool in data.get("data", []):
        attrs = pool.get("attributes", {})
        relationships = pool.get("relationships", {})
        
        base_token_data = relationships.get("base_token", {}).get("data", {})
        token_addr = base_token_data.get("id", "").replace("base_", "")
        
        if not token_addr:
            continue
        
        quote_token_data = relationships.get("quote_token", {}).get("data", {})
        quote_addr = quote_token_data.get("id", "").replace("base_", "")
        
        pool_name = attrs.get("name", "")
        symbol = pool_name.split(" / ")[0] if " / " in pool_name else "UNKNOWN"
        quote_symbol = pool_name.split(" / ")[1] if " / " in pool_name else ""
        
        liq = float(attrs.get("reserve_in_usd", 0) or 0)
        vol_5m = float(attrs.get("volume_usd", {}).get("m5", 0) or 0)
        vol_1h = float(attrs.get("volume_usd", {}).get("h1", 0) or 0)
        vol_24h = float(attrs.get("volume_usd", {}).get("h24", 0) or 0)
        
        tx_5m_data = attrs.get("transactions", {}).get("m5", {})
        tx_5m = (tx_5m_data.get("buys", 0) or 0) + (tx_5m_data.get("sells", 0) or 0)
        
        tx_1h_data = attrs.get("transactions", {}).get("h1", {})
        tx_1h = (tx_1h_data.get("buys", 0) or 0) + (tx_1h_data.get("sells", 0) or 0)
        
        price_usd = float(attrs.get("base_token_price_usd", 0) or 0)
        price_change_1h = float(attrs.get("price_change_percentage", {}).get("h1", 0) or 0)
        
        pool_created = attrs.get("pool_created_at", "")
        pair_created_ms = 0
        if pool_created:
            try:
                pair_created_ms = int(datetime.fromisoformat(pool_created.replace("Z", "+00:00")).timestamp() * 1000)
            except:
                pair_created_ms = now_ms()
        
        normalized_pair = {
            "pairAddress": attrs.get("address", ""),
            "chainId": "base",
            "dexId": relationships.get("dex", {}).get("data", {}).get("id", ""),
            "baseToken": {
                "address": token_addr,
                "symbol": symbol,
                "name": symbol
            },
            "quoteToken": {
                "address": quote_addr,
                "symbol": quote_symbol
            },
            "liquidity": {
                "usd": liq
            },
            "volume": {
                "m5": vol_5m,
                "h1": vol_1h,
                "h24": vol_24h
            },
            "txns": {
                "m5": {"buys": tx_5m_data.get("buys", 0), "sells": tx_5m_data.get("sells", 0)},
                "h1": {"buys": tx_1h_data.get("buys", 0), "sells": tx_1h_data.get("sells", 0)}
            },
            "priceUsd": price_usd,
            "priceChange": {
                "h1": price_change_1h
            },
            "pairCreatedAt": pair_created_ms,
            "info": {
                "imageUrl": None,
                "socials": [],
                "websites": []
            },
            "_geckoterminal": True
        }
        
        results.append({"pair": normalized_pair, "source": "geckoterminal_trending"})
    
    print(f"[TEST] Found {len(results)} trending pools")
    return results

def fetch_geckoterminal_new():
    """Fetch new pools from GeckoTerminal"""
    print("[TEST] Fetching GeckoTerminal new pools...")
    
    url = f"{GECKO_API}/networks/base/new_pools?page=1&limit=30"
    data = get_gecko_json(url)
    
    if not data or "data" not in data:
        print("[TEST]   No data from GeckoTerminal new pools")
        return []
    
    results = []
    
    for pool in data.get("data", []):
        attrs = pool.get("attributes", {})
        relationships = pool.get("relationships", {})
        
        base_token_data = relationships.get("base_token", {}).get("data", {})
        token_addr = base_token_data.get("id", "").replace("base_", "")
        
        if not token_addr:
            continue
        
        quote_token_data = relationships.get("quote_token", {}).get("data", {})
        quote_addr = quote_token_data.get("id", "").replace("base_", "")
        
        pool_name = attrs.get("name", "")
        symbol = pool_name.split(" / ")[0] if " / " in pool_name else "UNKNOWN"
        quote_symbol = pool_name.split(" / ")[1] if " / " in pool_name else ""
        
        liq = float(attrs.get("reserve_in_usd", 0) or 0)
        vol_5m = float(attrs.get("volume_usd", {}).get("m5", 0) or 0)
        vol_1h = float(attrs.get("volume_usd", {}).get("h1", 0) or 0)
        vol_24h = float(attrs.get("volume_usd", {}).get("h24", 0) or 0)
        
        tx_5m_data = attrs.get("transactions", {}).get("m5", {})
        tx_5m = (tx_5m_data.get("buys", 0) or 0) + (tx_5m_data.get("sells", 0) or 0)
        
        tx_1h_data = attrs.get("transactions", {}).get("h1", {})
        tx_1h = (tx_1h_data.get("buys", 0) or 0) + (tx_1h_data.get("sells", 0) or 0)
        
        price_usd = float(attrs.get("base_token_price_usd", 0) or 0)
        price_change_1h = float(attrs.get("price_change_percentage", {}).get("h1", 0) or 0)
        
        pool_created = attrs.get("pool_created_at", "")
        pair_created_ms = 0
        if pool_created:
            try:
                pair_created_ms = int(datetime.fromisoformat(pool_created.replace("Z", "+00:00")).timestamp() * 1000)
            except:
                pair_created_ms = now_ms()
        
        normalized_pair = {
            "pairAddress": attrs.get("address", ""),
            "chainId": "base",
            "dexId": relationships.get("dex", {}).get("data", {}).get("id", ""),
            "baseToken": {
                "address": token_addr,
                "symbol": symbol,
                "name": symbol
            },
            "quoteToken": {
                "address": quote_addr,
                "symbol": quote_symbol
            },
            "liquidity": {
                "usd": liq
            },
            "volume": {
                "m5": vol_5m,
                "h1": vol_1h,
                "h24": vol_24h
            },
            "txns": {
                "m5": {"buys": tx_5m_data.get("buys", 0), "sells": tx_5m_data.get("sells", 0)},
                "h1": {"buys": tx_1h_data.get("buys", 0), "sells": tx_1h_data.get("sells", 0)}
            },
            "priceUsd": price_usd,
            "priceChange": {
                "h1": price_change_1h
            },
            "pairCreatedAt": pair_created_ms,
            "info": {
                "imageUrl": None,
                "socials": [],
                "websites": []
            },
            "_geckoterminal": True
        }
        
        results.append({"pair": normalized_pair, "source": "geckoterminal_new"})
    
    print(f"[TEST] Found {len(results)} new pools")
    return results

def test_fallback():
    """Test the GeckoTerminal fallback mechanism"""
    print("=" * 60)
    print("[TEST] Testing GeckoTerminal Fallback Integration")
    print("=" * 60)
    
    # Simulate 0 results from DexScreener
    dexscreener_items = []
    print(f"\n[TEST] Simulated DexScreener results: {len(dexscreener_items)} items")
    
    # Trigger fallback
    all_items = list(dexscreener_items)
    
    if len(all_items) < 15:
        print(f"[TEST] Low results ({len(all_items)}), activating GeckoTerminal fallback...")
        gecko_items = []
        gecko_items.extend(fetch_geckoterminal_trending())
        gecko_items.extend(fetch_geckoterminal_new())
        
        # Merge and dedupe
        existing_tokens = set()
        for item in all_items:
            token = item["pair"].get("baseToken") or item["pair"].get("token") or {}
            token_addr = (token.get("address") or "").lower()
            if token_addr:
                existing_tokens.add(token_addr)
        
        added_count = 0
        for item in gecko_items:
            token = item["pair"].get("baseToken") or item["pair"].get("token") or {}
            token_addr = (token.get("address") or "").lower()
            if token_addr and token_addr not in existing_tokens:
                all_items.append(item)
                existing_tokens.add(token_addr)
                added_count += 1
        
        print(f"[TEST]   Added {added_count} unique tokens from GeckoTerminal")
    
    print(f"\n[TEST] Total raw after fallback: {len(all_items)} items")
    
    # Show sample data
    print("\n[TEST] Sample candidates from GeckoTerminal:")
    for i, item in enumerate(all_items[:5]):
        pair = item["pair"]
        token = pair.get("baseToken", {})
        symbol = token.get("symbol", "UNKNOWN")
        liq = pair.get("liquidity", {}).get("usd", 0)
        vol_1h = pair.get("volume", {}).get("h1", 0)
        tx_5m = (pair.get("txns", {}).get("m5", {}).get("buys", 0) + 
                 pair.get("txns", {}).get("m5", {}).get("sells", 0))
        print(f"  {i+1}. {symbol}: ${liq:,.0f} liq, ${vol_1h:,.0f} vol/h, {tx_5m} txs/5m")
    
    # Check if data format is compatible
    print("\n[TEST] Data format validation:")
    if all_items:
        sample = all_items[0]["pair"]
        required_fields = ["pairAddress", "chainId", "baseToken", "liquidity", "volume", "txns"]
        missing = [f for f in required_fields if f not in sample]
        if missing:
            print(f"  ❌ Missing fields: {missing}")
        else:
            print("  ✅ All required fields present")
        
        # Check token structure
        token = sample.get("baseToken", {})
        if "address" in token and "symbol" in token:
            print("  ✅ Token structure valid")
        else:
            print(f"  ❌ Token missing fields: {token.keys()}")
    
    print(f"\n[TEST] ✅ Test complete - {len(all_items)} items from GeckoTerminal fallback")
    return len(all_items)

if __name__ == "__main__":
    count = test_fallback()
    exit(0 if count > 0 else 1)
