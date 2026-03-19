#!/usr/bin/env python3
"""
LURKER CIO Ultra Scanner
Scans GeckoTerminal for new token opportunities
"""

import json
import requests
import time
from datetime import datetime, timezone
import os

DATA_DIR = "/data/.openclaw/workspace/lurker-project/data"
FEED_FILE = f"{DATA_DIR}/cio_feed.json"

def fetch_geckoterminal():
    """Fetch trending pools from GeckoTerminal"""
    url = "https://api.geckoterminal.com/api/v2/networks/base/trending_pools"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[{datetime.now()}] Error fetching: {e}")
        return None

def process_data(data):
    """Process API data into candidate tokens"""
    candidates = []
    if not data or 'data' not in data:
        return candidates
    
    for pool in data['data']:
        attrs = pool.get('attributes', {})
        token_data = pool.get('relationships', {}).get('base_token', {}).get('data', {})
        
        if not token_data:
            continue
            
        address = token_data.get('id', '').replace('base_', '')
        symbol = attrs.get('base_token_symbol', 'UNKNOWN')
        name = attrs.get('name', symbol)
        
        liq_usd = float(attrs.get('reserve_in_usd', 0) or 0)
        vol_24h = float(attrs.get('volume_usd', {}).get('h24', 0) or 0)
        txns_24h = int(attrs.get('transactions', {}).get('h24', 0) or 0)
        price_usd = float(attrs.get('base_token_price_usd', 0) or 0)
        
        # Risk assessment
        risk_level = "low"
        risk_factors = []
        
        if liq_usd < 50000:
            risk_level = "high"
            risk_factors.append("low_liquidity")
        elif liq_usd < 100000:
            risk_level = "medium"
            risk_factors.append("moderate_liquidity")
            
        if vol_24h < 1000:
            risk_factors.append("low_volume")
            
        if txns_24h < 10:
            risk_factors.append("low_activity")
            
        candidates.append({
            "token": {
                "address": address,
                "symbol": symbol,
                "name": name
            },
            "metrics": {
                "liq_usd": liq_usd,
                "vol_24h_usd": vol_24h,
                "txns_24h": txns_24h,
                "price_usd": price_usd
            },
            "risk": {
                "level": risk_level,
                "factors": risk_factors
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    return candidates

def save_feed(candidates):
    """Save feed to JSON file"""
    os.makedirs(DATA_DIR, exist_ok=True)
    
    feed = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "geckoterminal_v2",
        "candidates": candidates
    }
    
    with open(FEED_FILE, 'w') as f:
        json.dump(feed, f, indent=2)
    
    print(f"[{datetime.now()}] Saved {len(candidates)} candidates to {FEED_FILE}")

def main():
    print(f"[{datetime.now()}] Starting CIO Ultra Scanner...")
    
    data = fetch_geckoterminal()
    if data:
        candidates = process_data(data)
        save_feed(candidates)
        print(f"[{datetime.now()}] Scan complete: {len(candidates)} tokens found")
    else:
        print(f"[{datetime.now()}] Scan failed: no data received")

if __name__ == "__main__":
    main()
