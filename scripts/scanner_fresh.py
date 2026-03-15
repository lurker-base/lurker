#!/usr/bin/env python3
"""
LURKER Fresh Token Scanner - Uses multiple free sources
"""
import json
import time
import requests
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv('/data/.openclaw/workspace/.env.secrets')

# Files
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
STATE_FILE = Path(__file__).parent.parent / "state" / "fresh_scanner.json"

def load_state():
    if STATE_FILE.exists():
        return json.load(open(STATE_FILE))
    return {"seen_addresses": set(), "last_scan": None}

def save_state(state):
    state["last_scan"] = datetime.now(timezone.utc).isoformat()
    json.dump({"seen_addresses": list(state["seen_addresses"])}, open(STATE_FILE, 'w'))

def get_geckoterminal_new():
    """Source 1: GeckoTerminal new pairs"""
    pairs = []
    try:
        # Get latest pairs on Base
        url = "https://api.geckoterminal.com/api/v2/networks/base/dexes/uniswap_v3/pools?page=1&limit=50"
        resp = requests.get(url, timeout=15)
        data = resp.json()
        for p in data.get("data", []):
            attrs = p.get("attributes", {})
            token = attrs.get("base_token", {})
            pairs.append({
                "address": token.get("address", ""),
                "symbol": token.get("symbol", "?"),
                "name": token.get("name", "?"),
                "dex": "uniswap_v3",
                "age": attrs.get("age", 0),
                "volume_usd": attrs.get("volume_usd", {}).get("h24", 0),
                "liquidity_usd": attrs.get("reserve_in_usd", 0)
            })
    except Exception as e:
        print(f"[GeckoTerminal] Error: {e}")
    return pairs

def get_recent_from_basescan():
    """Source 2: Recent ERC20 transfers from BaseScan (no key needed for basic)"""
    tokens = []
    try:
        # Get recent internal transactions (includes contract creations)
        url = "https://api.basescan.org/api?module=account&action=txlistinternal&startblock=0&endblock=99999999&sort=desc&limit=100"
        resp = requests.get(url, timeout=15)
        data = resp.json()
        if data.get("result"):
            # Parse transactions - look for contract interactions
            pass
    except Exception as e:
        print(f"[BaseScan] Error: {e}")
    return tokens

def main():
    print("[FRESHER] Scanning for new tokens...")
    state = load_state()
    seen = state.get("seen_addresses", set())
    if isinstance(seen, list):
        seen = set(seen)
    
    all_tokens = []
    
    # Source 1: GeckoTerminal
    print("[FRESHER] GeckoTerminal...")
    gecko_tokens = get_geckoterminal_new()
    print(f"[FRESHER] Found {len(gecko_tokens)} from GeckoTerminal")
    all_tokens.extend(gecko_tokens)
    
    # Deduplicate and filter new
    new_tokens = []
    for t in all_tokens:
        addr = t.get("address", "").lower()
        if addr and addr not in seen:
            new_tokens.append(t)
            seen.add(addr)
    
    print(f"[FRESHER] New tokens this scan: {len(new_tokens)}")
    
    if new_tokens:
        # Load existing CIO feed
        if CIO_FILE.exists():
            cio = json.load(open(CIO_FILE))
        else:
            cio = {"candidates": [], "meta": {}}
        
        # Add new tokens to CIO format
        now = datetime.now(timezone.utc).isoformat()
        for t in new_tokens[:10]:  # Limit to 10
            candidate = {
                "token": {
                    "address": t.get("address", ""),
                    "symbol": t.get("symbol", "?"),
                    "name": t.get("name", "?")
                },
                "metrics": {
                    "liq_usd": t.get("liquidity_usd", 0),
                    "vol_24h_usd": t.get("volume_usd", 0)
                },
                "age_hours": t.get("age", 0) / 3600 if t.get("age") else 0,
                "detected_at": now,
                "source": "geckoterminal_fresh",
                "score": min(100, int(t.get("liquidity_usd", 0) / 1000)),
                "risk": {"level": "unknown"},
                "badges": ["🆕 FRESH"]
            }
            cio["candidates"].append(candidate)
        
        # Keep only last 50
        cio["candidates"] = cio["candidates"][-50:]
        cio["meta"] = {"updated_at": now, "source": "fresh_scanner"}
        
        # Save
        CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
        json.dump(cio, open(CIO_FILE, 'w'), indent=2)
        print(f"[FRESHER] Updated CIO with {len(new_tokens)} new tokens")
    
    save_state({"seen_addresses": list(seen)})
    
    # Trigger feed generation
    import subprocess
    subprocess.run(["node", "scripts/generateFeeds.js"], cwd=Path(__file__).parent.parent, capture_output=True)
    print("[FRESHER] Feeds regenerated")

if __name__ == "__main__":
    main()
