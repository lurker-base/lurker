#!/usr/bin/env python3
"""
LURKER Token Fetcher
Récupère les nouveaux tokens depuis DexScreener pour Base
"""

import json
import requests
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path("/data/.openclaw/workspace/lurker-project")
TOKENS_FILE = BASE_DIR / "tokens" / "base.json"
LOG_FILE = BASE_DIR / "logs" / "fetcher.log"

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")

def load_tokens():
    """Load token database"""
    if not TOKENS_FILE.exists():
        return {}
    try:
        with open(TOKENS_FILE) as f:
            return json.load(f)
    except:
        return {}

def save_tokens(tokens):
    """Save token database"""
    TOKENS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)

def fetch_latest_base_tokens():
    """Fetch latest token profiles from DexScreener"""
    try:
        # DexScreener API for latest token profiles
        url = "https://api.dexscreener.com/token-profiles/latest/v1"
        resp = requests.get(url, timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            profiles = data if isinstance(data, list) else data.get("profiles", [])
            
            # Filter for Base chain only
            base_tokens = []
            for profile in profiles:
                chain = profile.get("chainId", "").lower()
                if chain == "base":
                    token = {
                        "address": profile.get("tokenAddress"),
                        "symbol": profile.get("symbol", "UNKNOWN"),
                        "name": profile.get("name", "Unknown"),
                        "icon": profile.get("icon", ""),
                        "description": profile.get("description", ""),
                        "links": profile.get("links", {}),
                        "discovered_at": datetime.now().isoformat(),
                        "added_at": int(datetime.now().timestamp())
                    }
                    if token["address"]:
                        base_tokens.append(token)
            
            log(f"✅ Fetched {len(base_tokens)} Base tokens from DexScreener")
            return base_tokens
        else:
            log(f"❌ API error: {resp.status_code}")
    except Exception as e:
        log(f"❌ Error fetching: {e}")
    
    return []

def fetch_top_base_tokens():
    """Fetch top tokens on Base by volume"""
    try:
        # Use DexScreener search for Base
        url = "https://api.dexscreener.com/latest/dex/search?q=base"
        resp = requests.get(url, timeout=30)
        
        if resp.status_code == 200:
            data = resp.json()
            pairs = data.get("pairs", [])
            
            # Get unique base tokens
            seen = set()
            base_tokens = []
            
            for pair in pairs:
                if pair.get("chainId") != "base":
                    continue
                
                # Get base token (not WETH/USDC)
                base_token = pair.get("baseToken", {})
                address = base_token.get("address")
                
                if not address or address in seen:
                    continue
                seen.add(address)
                
                token = {
                    "address": address,
                    "symbol": base_token.get("symbol", "UNKNOWN"),
                    "name": base_token.get("name", "Unknown"),
                    "discovered_at": datetime.now().isoformat(),
                    "added_at": int(datetime.now().timestamp()),
                    "source": "dexscreener_search"
                }
                base_tokens.append(token)
            
            log(f"✅ Fetched {len(base_tokens)} Base tokens from search")
            return base_tokens[:50]  # Limit to top 50
        else:
            log(f"❌ API error: {resp.status_code}")
    except Exception as e:
        log(f"❌ Error fetching: {e}")
    
    return []

def main():
    log("="*50)
    log("LURKER Token Fetcher Started")
    log("="*50)
    
    # Load existing tokens
    tokens = load_tokens()
    log(f"📊 Loaded {len(tokens)} existing tokens")
    
    # Fetch new tokens
    new_tokens = fetch_latest_base_tokens()
    if not new_tokens:
        new_tokens = fetch_top_base_tokens()
    
    # Merge with existing
    added = 0
    for token in new_tokens:
        addr = token["address"].lower()
        if addr not in tokens:
            tokens[addr] = token
            added += 1
    
    # Save
    save_tokens(tokens)
    log(f"✅ Added {added} new tokens, total: {len(tokens)}")
    
    # Clean old tokens (>7 days)
    now = int(datetime.now().timestamp())
    cutoff = now - (7 * 24 * 3600)
    old_count = len(tokens)
    tokens = {k: v for k, v in tokens.items() if v.get("added_at", now) > cutoff}
    removed = old_count - len(tokens)
    if removed > 0:
        save_tokens(tokens)
        log(f"🧹 Removed {removed} old tokens")
    
    log("="*50)

if __name__ == "__main__":
    main()
