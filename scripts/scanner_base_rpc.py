#!/usr/bin/env python3
"""
LURKER Base RPC Scanner - Detect fresh contracts via Base RPC
Alternative to BaseScan API (requires paid plan for V2)
"""
import json
import os
import sys
import requests
from datetime import datetime, timezone
from pathlib import Path

# Use public Base RPC or QuickNode/Alchemy if available
BASE_RPC = os.getenv("BASE_RPC_URL", "https://mainnet.base.org")
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
        print(f"[RPC] Error getting block: {e}")
        return None

def get_block_transactions(block_num):
    """Get transactions from a specific block"""
    try:
        r = requests.post(BASE_RPC, json={
            "jsonrpc": "2.0",
            "method": "eth_getBlockByNumber",
            "params": [hex(block_num), True],
            "id": 1
        }, timeout=30)
        result = r.json()
        return result.get("result", {})
    except Exception as e:
        print(f"[RPC] Error getting block {block_num}: {e}")
        return {}

def scan_recent_blocks(num_blocks=10):
    """Scan recent blocks for contract creations"""
    latest = get_latest_block()
    if not latest:
        return []
    
    print(f"[RPC] Latest block: {latest}")
    print(f"[RPC] Scanning last {num_blocks} blocks...")
    
    contracts = []
    
    for i in range(num_blocks):
        block_num = latest - i
        block = get_block_transactions(block_num)
        
        if not block:
            continue
        
        timestamp = int(block.get("timestamp", "0x0"), 16)
        transactions = block.get("transactions", [])
        
        for tx in transactions:
            # Contract creation has 'to' as null/None and 'input' is the contract code
            if not tx.get("to") and tx.get("input") and len(tx.get("input", "")) > 2:
                contracts.append({
                    "address": None,  # Will need to compute from tx
                    "creator": tx.get("from"),
                    "block": block_num,
                    "timestamp": timestamp,
                    "hash": tx.get("hash"),
                    "input": tx.get("input")[:100]  # First 100 chars of bytecode
                })
    
    return contracts

def scan_fresh_tokens():
    """Main scan function"""
    print("="*60)
    print("[RPC] LURKER Base RPC Scanner")
    print("="*60)
    
    # Scan recent blocks
    contracts = scan_recent_blocks(num_blocks=5)
    
    if not contracts:
        print("[RPC] No contract creations found")
        return True
    
    print(f"\n[RPC] Found {len(contracts)} potential contract creations")
    
    # For now, just log them (computing contract address from tx requires more logic)
    for c in contracts[:5]:
        print(f"[RPC] Block {c['block']}: {c['creator'][:12]}... created contract")
    
    # Save minimal feed
    feed = load_json(FEED_FILE)
    feed["meta"] = {
        "updated_at": now().isoformat(),
        "contracts_found": len(contracts),
        "note": "BaseScan API requires paid plan. Using RPC fallback."
    }
    save_json(FEED_FILE, feed)
    
    return True

if __name__ == "__main__":
    success = scan_fresh_tokens()
    sys.exit(0 if success else 1)
