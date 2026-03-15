#!/usr/bin/env python3
"""
LURKER Boost Scanner - Catches more tokens by relaxing filters
"""
import json
import requests
import time
from datetime import datetime, timezone
from pathlib import Path

CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"

def scan():
    print("[BOOST] Running boost scanner...")
    new_candidates = []
    
    # Use multiple search terms to find more tokens
    terms = ["new", "BASE", "fresh", "just launched"]
    
    for term in terms:
        try:
            url = f"https://api.geckoterminal.com/api/v2/dexes/search?q={term}&networks=base"
            resp = requests.get(url, timeout=10)
            data = resp.json()
            pairs = data.get('data', [])
            for p in pairs:
                attrs = p.get('attributes', {})
                token = attrs.get('base_token', {})
                addr = token.get('address', '').lower()
                if addr and not any(c.get('token', {}).get('address', '').lower() == addr for c in new_candidates):
                    # Relaxed filters - just check liquidity exists
                    liq = float(attrs.get('reserve_in_usd', 0) or 0)
                    if liq > 5000:  # Much lower threshold
                        new_candidates.append({
                            "token": {
                                "address": token.get('address', ''),
                                "symbol": token.get('symbol', '?'),
                                "name": token.get('name', '?')
                            },
                            "metrics": {
                                "liq_usd": liq,
                                "vol_24h_usd": float(attrs.get('volume_usd', {}).get('h24', 0) or 0)
                            },
                            "risk": {"level": "low"},
                            "score": min(100, int(liq / 1000)),
                            "age_hours": 1.0,
                            "detected_at": datetime.now(timezone.utc).isoformat(),
                            "source": "boost_scanner",
                            "badges": ["⚡ ACTIVE"]
                        })
        except Exception as e:
            print(f"[BOOST] {term}: {e}")
        time.sleep(0.3)
    
    print(f"[BOOST] Found {len(new_candidates)} candidates")
    
    if new_candidates:
        # Merge with existing CIO
        if CIO_FILE.exists():
            cio = json.load(open(CIO_FILE))
        else:
            cio = {"candidates": []}
        
        existing = {c['token']['address'].lower() for c in cio.get('candidates', [])}
        for c in new_candidates:
            if c['token']['address'].lower() not in existing:
                cio['candidates'].append(c)
        
        # Keep last 30
        cio['candidates'] = cio['candidates'][-30:]
        cio['meta'] = {"updated_at": datetime.now(timezone.utc).isoformat(), "source": "boost"}
        
        json.dump(cio, open(CIO_FILE, 'w'), indent=2)
        print(f"[BOOST] Updated CIO: {len(cio['candidates'])} total")
    
    # Regenerate feeds
    import subprocess
    subprocess.run(["node", "scripts/generateFeeds.js"], cwd=CIO_FILE.parent.parent, capture_output=True)

if __name__ == "__main__":
    scan()
