#!/usr/bin/env python3
"""
LURKER BaseScan Scanner - Detect fresh ERC20 contracts on Base (API V2)
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

def get_recent_transactions():
    """Get recent transactions from BaseScan V2 API"""
    if not BASESCAN_API_KEY:
        print("[BASESCAN] No API key configured")
        return []
    
    try:
        # V2 API endpoint
        url = f"https://api.basescan.org/api?module=account&action=txlistinternal&startblock=0&endblock=99999999&sort=desc&apikey={BASESCAN_API_KEY}"
        
        r = requests.get(url, timeout=30)
        data = r.json()
        
        if data.get("status") != "1":
            print(f"[BASESCAN] API error: {data.get('message', 'Unknown error')}")
            return []
        
        # Filter contract creations (where contractAddress is not empty)
        contracts = []
        for tx in data.get("result", [])[:100]:  # Last 100 transactions
            if tx.get("contractAddress") and tx["contractAddress"] != "":
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

def check_contract(address: str) -> dict:
    """Check if contract exists and get basic info"""
    if not BASESCAN_API_KEY:
        return None
    
    try:
        # Get contract code
        url = f"https://api.basescan.org/api?module=proxy&action=eth_getCode&address={address}&tag=latest&apikey={BASESCAN_API_KEY}"
        r = requests.get(url, timeout=30)
        data = r.json()
        
        code = data.get("result", "0x")
        if code and code != "0x":
            # Has code = is contract
            return {
                "address": address,
                "has_code": True,
                "detected_at": now().isoformat()
            }
        return None
        
    except Exception as e:
        print(f"[BASESCAN] Error checking {address}: {e}")
        return None

def scan_fresh_tokens():
    """Main scan function"""
    print("="*60)
    print("[BASESCAN] LURKER Fresh Token Scanner V2")
    print("="*60)
    
    if not BASESCAN_API_KEY:
        print("[BASESCAN] ❌ No API key configured!")
        print("Set BASESCAN_API_KEY environment variable")
        return False
    
    # Load seen contracts
    seen = load_json(STATE_FILE)
    
    # Get recent contracts
    contracts = get_recent_transactions()
    print(f"[BASESCAN] Found {len(contracts)} recent contract creations")
    
    new_tokens = []
    
    for contract in contracts[:20]:  # Limit to 20 most recent
        addr = contract["address"]
        
        if addr in seen:
            continue
        
        # Check if valid contract
        token_info = check_contract(addr)
        
        if token_info:
            age_hours = (now().timestamp() - contract["timestamp"]) / 3600
            
            new_tokens.append({
                "token": {
                    "address": addr,
                    "symbol": "UNKNOWN",
                    "name": "Unknown Token"
                },
                "source": "basescan",
                "detected_at": now().isoformat(),
                "age_hours": round(age_hours, 2),
                "creator": contract["creator"],
                "tx_hash": contract["hash"]
            })
            
            print(f"[BASESCAN] ✅ New contract: {addr[:12]}... ({age_hours:.1f}h old)")
        
        seen[addr] = {
            "detected": now().isoformat(),
            "has_code": token_info is not None
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
    
    print(f"\n[BASESCAN] ✅ Found {len(new_tokens)} new contracts")
    print(f"[BASESCAN] Total tracked: {len(feed['candidates'])}")
    
    return True

if __name__ == "__main__":
    success = scan_fresh_tokens()
    sys.exit(0 if success else 1)
