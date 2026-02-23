#!/usr/bin/env python3
"""
LURKER Hybrid Scanner - RPC + DexScreener
Detects fresh contracts via RPC, enriches with DexScreener data
"""
import json
import os
import sys
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

BASE_RPC = os.getenv("BASE_RPC_URL", "https://mainnet.base.org")
FEED_FILE = Path(__file__).parent.parent / "signals" / "hybrid_feed.json"
STATE_FILE = Path(__file__).parent.parent / "state" / "hybrid_seen.json"

def now():
    return datetime.now(timezone.utc)

def load_json(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}

def save_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def get_latest_block():
    """Get latest block number from Base RPC"""
    try:
        r = requests.post(BASE_RPC, json={
            "jsonrpc": "2.0",
            "method": "eth_blockNumber",
            "params": [],
            "id": 1
        }, timeout=30)
        result = r.json()
        return int(result.get("result", "0x0"), 16)
    except Exception as e:
        print(f"[HYBRID] Error getting block: {e}")
        return None

def get_block(block_num):
    """Get block data"""
    try:
        r = requests.post(BASE_RPC, json={
            "jsonrpc": "2.0",
            "method": "eth_getBlockByNumber",
            "params": [hex(block_num), True],
            "id": 1
        }, timeout=30)
        return r.json().get("result", {})
    except Exception as e:
        return {}

def calculate_risk(token_data, dex_data=None, top_traders=None):
    """Calculate risk level based on token metrics and trader patterns"""
    risks = []
    
    # Check liquidity
    if dex_data:
        liq = dex_data.get('liquidity', {}).get('usd', 0) or 0
        if liq < 1000:
            risks.append("very_low_liquidity")
        elif liq < 5000:
            risks.append("low_liquidity")
        
        # Check volume
        vol_5m = dex_data.get('volume', {}).get('m5', 0) or 0
        if vol_5m < 100:
            risks.append("low_volume")
        
        # Check transactions
        tx_5m = dex_data.get('txns', {}).get('m5', {}).get('buys', 0) or 0
        tx_5m += dex_data.get('txns', {}).get('m5', {}).get('sells', 0) or 0
        if tx_5m < 3:
            risks.append("low_activity")
        
        # Check for dumping (more sells than buys)
        buys = dex_data.get('txns', {}).get('m5', {}).get('buys', 0) or 0
        sells = dex_data.get('txns', {}).get('m5', {}).get('sells', 0) or 0
        if sells > buys * 1.5:
            risks.append("dumping")
    
    # Unknown token = higher risk
    if token_data.get('symbol') == 'UNKNOWN':
        risks.append("unknown_token")
    
    # Check for bundle farming pattern
    if top_traders and len(top_traders) >= 10:
        # Check for identical balances (sign of bot/bundle)
        balances = [t.get('balance', 0) for t in top_traders[:20]]
        unique_balances = len(set(balances))
        
        if unique_balances <= 5 and len(balances) >= 10:
            risks.append("suspicious_balances")
        
        # Check for wallets with tiny balance but huge volume
        fake_volume_wallets = 0
        for trader in top_traders[:20]:
            balance = trader.get('balance', 0)
            volume = trader.get('volume', 0)
            # If balance < $100 but volume > $1M = wash trading
            if balance < 100 and volume > 1_000_000:
                fake_volume_wallets += 1
        
        if fake_volume_wallets >= 5:
            risks.append("bundle_farming")
        
        # Check for 1-transaction wallets (bot pattern)
        one_tx_wallets = sum(1 for t in top_traders[:20] if t.get('tx_count', 0) <= 1)
        if one_tx_wallets >= 10:
            risks.append("bot_wallets")
    
    # Determine risk level
    if len(risks) >= 3 or "bundle_farming" in risks:
        risk_level = "high"
    elif len(risks) >= 1:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    return {
        "level": risk_level,
        "factors": risks
    }

def get_dexscreener_data(token_address):
    """Get token data from DexScreener"""
    try:
        url = f"https://api.dexscreener.com/latest/dex/tokens/{token_address}"
        r = requests.get(url, timeout=10)
        data = r.json()
        
        pairs = data.get("pairs", [])
        if not pairs:
            return None, None
        
        # Get best pair (highest liquidity)
        best_pair = max(pairs, key=lambda x: x.get("liquidity", {}).get("usd", 0) or 0)
        
        dex_data = {
            "priceUsd": best_pair.get("priceUsd"),
            "liquidity": best_pair.get("liquidity", {}),
            "volume": best_pair.get("volume", {}),
            "txns": best_pair.get("txns", {}),
            "marketCap": best_pair.get("marketCap"),
            "fdv": best_pair.get("fdv"),
            "pairAddress": best_pair.get("pairAddress"),
            "dexId": best_pair.get("dexId"),
            "pairCreatedAt": best_pair.get("pairCreatedAt"),
            "info": best_pair.get("info", {})
        }
        
        # Try to get top traders from DexScreener
        top_traders = None
        try:
            pair_address = best_pair.get("pairAddress")
            if pair_address:
                traders_url = f"https://api.dexscreener.com/latest/dex/pairs/base/{pair_address}"
                traders_r = requests.get(traders_url, timeout=10)
                traders_data = traders_r.json()
                pair_data = traders_data.get("pair", {})
                
                # DexScreener doesn't expose top traders directly via API
                # This would require additional data source
                # For now, we'll use heuristics based on available data
                top_traders = []
        except:
            pass
        
        return dex_data, top_traders
    except Exception as e:
        return None, None

def scan_hybrid():
    """Main hybrid scan function"""
    print("="*60)
    print("[HYBRID] LURKER RPC + DexScreener Scanner")
    print("="*60)
    
    seen = load_json(STATE_FILE)
    new_tokens = []
    
    # === DEXSCREENER FIRST: Get all fresh tokens on Base ===
    print("[HYBRID] Fetching fresh tokens from DexScreener...")
    
    try:
        # Use token profiles API for fresh tokens
        profiles_response = requests.get(
            "https://api.dexscreener.com/token-profiles/latest/v1",
            timeout=15
        )
        profiles = profiles_response.json()
        
        # Also get boosted tokens
        boosts_response = requests.get(
            "https://api.dexscreener.com/token-boosts/latest/v1",
            timeout=15
        )
        boosts = boosts_response.json()
        
        # Also get top trending on Base
        trending_response = requests.get(
            "https://api.dexscreener.com/token-boosts/top/v1",
            timeout=15
        )
        trending = trending_response.json()
        
        print(f"[HYBRID] Profiles: {len(profiles)}, Boosts: {len(boosts)}, Trending: {len(trending)}")
        
        # Collect all token addresses from these endpoints
        all_tokens = {}
        
        for source_list, source_name in [(profiles, 'profiles'), (boosts, 'boosts'), (trending, 'trending')]:
            for item in source_list:
                token_address = item.get('tokenAddress')
                chain = item.get('chainId')
                
                if not token_address or chain != 'base':
                    continue
                
                if token_address in seen:
                    continue
                
                all_tokens[token_address] = {
                    'source': source_name,
                    'url': item.get('url', ''),
                    'header': item.get('header', ''),
                    'icon': item.get('icon', '')
                }
        
        print(f"[HYBRID] Found {len(all_tokens)} unique fresh tokens on Base")
        
        # Now get detailed data for each token
        for token_address, meta in all_tokens.items():
            dex_data, top_traders = get_dexscreener_data(token_address)
            
            if dex_data:
                # Calculate age
                pair_created = dex_data.get('pairCreatedAt')
                if pair_created:
                    age_hours = (time.time() * 1000 - pair_created) / (1000 * 3600)
                else:
                    age_hours = 999  # Unknown age
                
                # Skip if too old (> 7 days)
                if age_hours > 168:
                    continue
                
                # Get token info from DexScreener pairs
                symbol = "UNKNOWN"
                name = "Unknown"
                
                # Try to get symbol from first pair's baseToken
                url = f"https://api.dexscreener.com/latest/dex/tokens/{token_address}"
                try:
                    r = requests.get(url, timeout=10)
                    pairs = r.json().get("pairs", [])
                    if pairs:
                        base_token = pairs[0].get("baseToken", {})
                        symbol = base_token.get("symbol", "UNKNOWN")
                        name = base_token.get("name", "Unknown")
                except:
                    pass
                
                # Calculate risk with trader analysis
                risk = calculate_risk({"symbol": symbol}, dex_data, top_traders)
                
                new_tokens.append({
                    "token": {
                        "address": token_address,
                        "symbol": symbol,
                        "name": name
                    },
                    "source": f"hybrid_{meta['source']}",
                    "detected_at": now().isoformat(),
                    "age_hours": round(age_hours, 2),
                    "creator": "unknown",
                    "tx_hash": None,
                    "dexscreener": dex_data,
                    "risk": risk,
                    "meta": meta
                })
                
                seen[token_address] = {
                    "detected": now().isoformat(),
                    "source": meta['source']
                }
                
                risk_flag = "⚠️" if risk['level'] == 'high' else ""
                print(f"[HYBRID] ✅ {meta['source']}: {symbol} {risk_flag} ({age_hours:.1f}h, risk={risk['level']})")
    
    except Exception as e:
        print(f"[HYBRID] DexScreener error: {e}")
    
    # === RPC SECOND: Check for contracts created in last blocks ===
    print("\n[HYBRID] Scanning recent blocks via RPC...")
    
    latest = get_latest_block()
    if latest:
        print(f"[HYBRID] Latest block: {latest}")
        
        for i in range(5):  # Last 5 blocks
            block_num = latest - i
            block = get_block(block_num)
            
            if not block:
                continue
            
            timestamp = int(block.get("timestamp", "0x0"), 16)
            age_hours = (time.time() - timestamp) / 3600
            transactions = block.get("transactions", [])
            
            for tx in transactions:
                if not tx.get("to") and tx.get("input") and len(tx.get("input", "")) > 100:
                    tx_hash = tx.get("hash", "")
                    
                    if tx_hash in seen:
                        continue
                    
                    # Calculate risk (high risk for RPC-only tokens - no liquidity, no verification)
                    risk = {
                        "level": "high",
                        "factors": ["no_liquidity", "unverified_contract", "rpc_only"]
                    }
                    
                    new_tokens.append({
                        "token": {
                            "address": f"pending_{tx_hash[:20]}",
                            "symbol": "UNKNOWN",
                            "name": "Fresh Contract"
                        },
                        "source": "hybrid_rpc",
                        "detected_at": now().isoformat(),
                        "block": block_num,
                        "age_hours": round(age_hours, 2),
                        "creator": tx.get("from", ""),
                        "tx_hash": tx_hash,
                        "dexscreener": None,
                        "risk": risk
                    })
                    
                    seen[tx_hash] = {
                        "detected": now().isoformat(),
                        "block": block_num
                    }
                    
                    print(f"[HYBRID] ✅ RPC: Contract at block {block_num} ({age_hours:.1f}h)")
    
    # Save state and feed
    save_json(STATE_FILE, seen)
    
    feed = load_json(FEED_FILE)
    if "candidates" not in feed:
        feed["candidates"] = []
    
    feed["candidates"].extend(new_tokens)
    feed["candidates"] = feed["candidates"][-100:]  # Keep last 100
    
    feed["meta"] = {
        "updated_at": now().isoformat(),
        "count": len(feed["candidates"]),
        "new_this_scan": len(new_tokens),
        "latest_block": latest
    }
    
    save_json(FEED_FILE, feed)
    
    print(f"\n[HYBRID] ✅ Found {len(new_tokens)} new tokens")
    print(f"[HYBRID] Total tracked: {len(feed['candidates'])}")
    
    return True

if __name__ == "__main__":
    success = scan_hybrid()
    sys.exit(0 if success else 1)
