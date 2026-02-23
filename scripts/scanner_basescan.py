#!/usr/bin/env python3
"""
LURKER BaseScan Scanner - Detect fresh ERC20 contracts on Base
No liquidity filter - just NEW tokens
"""
import json
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASESCAN_API_KEY = os.getenv("BASESCAN_API_KEY", "")
BASESCAN_URL = "https://api.basescan.org/api"
CHAIN = "base"
FEED_FILE = Path(__file__).parent.parent / "signals" / "basescan_feed.json"
STATE_FILE = Path(__file__).parent.parent / "state" / "basescan_seen.json"

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

def get_recent_contracts():
    """Get recently created contracts from BaseScan"""
    if not BASESCAN_API_KEY:
        print("[BASESCAN] No API key configured")
        return []
    
    # Get latest block number
    try:
        r = requests.get(
            BASESCAN_URL,
            params={
                "module": "proxy",
                "action": "eth_blockNumber",
                "apikey": BASESCAN_API_KEY
            },
            timeout=30
        )
        latest_block = int(r.json().get("result", "0"), 16)
        
        # Look back ~1000 blocks (~3-4 hours on Base)
        from_block = latest_block - 1000
        
        print(f"[BASESCAN] Scanning blocks {from_block} to {latest_block}")
        
        # Get transactions with contract creation
        r = requests.get(
            BASESCAN_URL,
            params={
                "module": "account",
                "action": "txlistinternal",
                "startblock": from_block,
                "endblock": latest_block,
                "sort": "desc",
                "apikey": BASESCAN_API_KEY
            },
            timeout=30
        )
        
        data = r.json()
        if data.get("status") != "1":
            print(f"[BASESCAN] API error: {data.get('result', data.get('message'))}")
            return []
        
        # Filter contract creations
        contracts = []
        for tx in data.get("result", []):
            if tx.get("contractAddress"):
                contracts.append({
                    "address": tx["contractAddress"],
                    "creator": tx.get("from", ""),
                    "block": int(tx.get("blockNumber", 0)),
                    "timestamp": int(tx.get("timeStamp", 0)),
                    "hash": tx.get("hash", "")
                })
        
        return contracts
        
    except Exception as e:
        print(f"[BASESCAN] Error: {e}")
        return []

def check_erc20(address: str) -> dict:
    """Check if contract is ERC20 and get basic info"""
    if not BASESCAN_API_KEY:
        return None
    
    try:
        # Get contract ABI
        r = requests.get(
            BASESCAN_URL,
            params={
                "module": "contract",
                "action": "getabi",
                "address": address,
                "apikey": BASESCAN_API_KEY
            },
            timeout=30
        )
        
        abi_data = r.json()
        if abi_data.get("status") != "1":
            return None
        
        abi = abi_data.get("result", "")
        
        # Check for ERC20 functions
        is_erc20 = all(x in abi for x in ["totalSupply", "balanceOf", "transfer"])
        
        if not is_erc20:
            return None
        
        # Try to get token info
        # We'll use a simple heuristic - check if it has Transfer event
        return {
            "address": address,
            "is_erc20": True,
            "detected_at": now().isoformat()
        }
        
    except Exception as e:
        print(f"[BASESCAN] Error checking {address}: {e}")
        return None

def scan_fresh_tokens():
    """Main scan function"""
    print("="*60)
    print("[BASESCAN] LURKER Fresh Token Scanner")
    print("="*60)
    
    if not BASESCAN_API_KEY:
        print("[BASESCAN] ❌ No API key configured!")
        print("Set BASESCAN_API_KEY environment variable")
        return False
    
    # Load seen contracts
    seen = load_json(STATE_FILE)
    
    # Get recent contracts
    contracts = get_recent_contracts()
    print(f"[BASESCAN] Found {len(contracts)} recent contracts")
    
    new_tokens = []
    
    for contract in contracts[:50]:  # Limit to 50 most recent
        addr = contract["address"]
        
        if addr in seen:
            continue
        
        # Check if ERC20
        token_info = check_erc20(addr)
        
        if token_info:
            age_hours = (now().timestamp() - contract["timestamp"]) / 3600
            
            new_tokens.append({
                "token": {
                    "address": addr,
                    "symbol": "UNKNOWN",  # Will be filled later
                    "name": "Unknown Token"
                },
                "source": "basescan",
                "detected_at": now().isoformat(),
                "age_hours": round(age_hours, 2),
                "creator": contract["creator"],
                "tx_hash": contract["hash"]
            })
            
            print(f"[BASESCAN] ✅ New ERC20: {addr[:12]}... ({age_hours:.1f}h old)")
        
        seen[addr] = {
            "detected": now().isoformat(),
            "is_erc20": token_info is not None
        }
    
    # Save state
    save_json(STATE_FILE, seen)
    
    # Load existing feed and append
    feed = load_json(FEED_FILE)
    if "candidates" not in feed:
        feed["candidates"] = []
    
    # Add new tokens
    feed["candidates"].extend(new_tokens)
    
    # Keep only last 100
    feed["candidates"] = feed["candidates"][-100:]
    
    feed["meta"] = {
        "updated_at": now().isoformat(),
        "count": len(feed["candidates"]),
        "new_this_scan": len(new_tokens)
    }
    
    save_json(FEED_FILE, feed)
    
    print(f"\n[BASESCAN] ✅ Found {len(new_tokens)} new ERC20 tokens")
    print(f"[BASESCAN] Total tracked: {len(feed['candidates'])}")
    
    return True

if __name__ == "__main__":
    success = scan_fresh_tokens()
    sys.exit(0 if success else 1)
