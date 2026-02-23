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

def get_dexscreener_data(token_address):
    """Get token data from DexScreener"""
    try:
        url = f"https://api.dexscreener.com/latest/dex/tokens/{token_address}"
        r = requests.get(url, timeout=10)
        data = r.json()
        
        pairs = data.get("pairs", [])
        if not pairs:
            return None
        
        # Get best pair (highest liquidity)
        best_pair = max(pairs, key=lambda x: x.get("liquidity", {}).get("usd", 0) or 0)
        
        return {
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
    except Exception as e:
        return None

def scan_hybrid():
    """Main hybrid scan function"""
    print("="*60)
    print("[HYBRID] LURKER RPC + DexScreener Scanner")
    print("="*60)
    
    latest = get_latest_block()
    if not latest:
        print("[HYBRID] ❌ Cannot get latest block")
        return False
    
    print(f"[HYBRID] Latest block: {latest}")
    print("[HYBRID] Scanning last 10 blocks for new contracts...")
    
    seen = load_json(STATE_FILE)
    new_tokens = []
    
    # Scan last 10 blocks
    for i in range(10):
        block_num = latest - i
        block = get_block(block_num)
        
        if not block:
            continue
        
        timestamp = int(block.get("timestamp", "0x0"), 16)
        age_hours = (time.time() - timestamp) / 3600
        transactions = block.get("transactions", [])
        
        for tx in transactions:
            # Contract creation detection
            if not tx.get("to") and tx.get("input") and len(tx.get("input", "")) > 100:
                # Compute contract address (simplified - would need proper RLP encoding)
                # For now, we'll use a placeholder and enrich with DexScreener later
                creator = tx.get("from", "")
                tx_hash = tx.get("hash", "")
                
                if tx_hash in seen:
                    continue
                
                # Try to find this token on DexScreener (may not exist yet)
                # We'll store the creator and try to match later
                
                token_data = {
                    "token": {
                        "address": f"pending_{tx_hash[:20]}",  # Will be updated when found on DexScreener
                        "symbol": "UNKNOWN",
                        "name": "Fresh Contract"
                    },
                    "source": "hybrid_rpc",
                    "detected_at": now().isoformat(),
                    "block": block_num,
                    "age_hours": round(age_hours, 2),
                    "creator": creator,
                    "tx_hash": tx_hash,
                    "dexscreener": None  # Will be enriched later
                }
                
                new_tokens.append(token_data)
                seen[tx_hash] = {
                    "detected": now().isoformat(),
                    "block": block_num,
                    "creator": creator
                }
                
                print(f"[HYBRID] ✅ New contract: {creator[:12]}... (block {block_num}, {age_hours:.1f}h)")
    
    # Now enrich with DexScreener for known tokens
    print("\n[HYBRID] Enriching with DexScreener...")
    
    # Get top tokens from DexScreener for Base
    try:
        dex_response = requests.get(
            "https://api.dexscreener.com/latest/dex/search?q=base",
            timeout=15
        )
        dex_data = dex_response.json()
        pairs = dex_data.get("pairs", [])[:50]  # Top 50 pairs
        
        for pair in pairs:
            base_token = pair.get("baseToken", {})
            token_addr = base_token.get("address")
            
            if not token_addr:
                continue
            
            # Check if this token is new (< 6 hours)
            pair_created = pair.get("pairCreatedAt")
            if pair_created:
                age_hours = (time.time() * 1000 - pair_created) / (1000 * 3600)
                
                if age_hours < 6:  # Less than 6 hours old
                    if token_addr not in [t["token"]["address"] for t in new_tokens]:
                        new_tokens.append({
                            "token": {
                                "address": token_addr,
                                "symbol": base_token.get("symbol", "UNKNOWN"),
                                "name": base_token.get("name", "Unknown")
                            },
                            "source": "hybrid_dexscreener",
                            "detected_at": now().isoformat(),
                            "age_hours": round(age_hours, 2),
                            "creator": "unknown",
                            "tx_hash": None,
                            "dexscreener": {
                                "priceUsd": pair.get("priceUsd"),
                                "liquidity": pair.get("liquidity", {}),
                                "volume": pair.get("volume", {}),
                                "marketCap": pair.get("marketCap"),
                                "pairAddress": pair.get("pairAddress")
                            }
                        })
                        print(f"[HYBRID] ✅ DexScreener: {base_token.get('symbol')} ({age_hours:.1f}h)")
        
    except Exception as e:
        print(f"[HYBRID] DexScreener error: {e}")
    
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
