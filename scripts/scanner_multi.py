#!/usr/bin/env python3
"""
LURKER Multi-Source Scanner
Uses multiple free sources to find new Base tokens
"""
import json
import requests
import time
from datetime import datetime, timezone
from pathlib import Path

CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"

# Known dex IDs on GeckoTerminal
DEXES = [
    "aerodrome-base",
    "uniswap-v3-base", 
    "sushiswap-v3-base",
    "dackieswap-v3-base",
    "leetswap-base",
    "baseswap",
    "alien-base",
    "rocketswap"
]

def calculate_action_badge(age_hours, liq_usd, vol_24h_usd):
    """Calcule le badge d'action recommandée"""
    vol_1h_estimate = vol_24h_usd / 24
    
    # 🟢 ACHETER: Token frais + bon volume + bonne liquidité
    if age_hours < 2 and vol_1h_estimate > 5000 and liq_usd > 30000:
        return "🟢 ACHETER"
    
    # 🔴 ÉVITER: Token vieux + faible volume
    if age_hours > 12 and vol_1h_estimate < 1000:
        return "🔴 ÉVITER"
    
    # 🟡 SURVEILLER: Cas intermédiaires
    return "🟡 SURVEILLER"

def calculate_action_reason(age_hours, liq_usd, vol_24h_usd):
    """Explique la raison du badge"""
    vol_1h_estimate = vol_24h_usd / 24
    
    if age_hours < 2 and vol_1h_estimate > 5000 and liq_usd > 30000:
        return f"Token frais ({age_hours:.1f}h), volume élevé (${vol_1h_estimate:,.0f}/h), bonne liquidité (${liq_usd:,.0f})"
    
    if age_hours > 12 and vol_1h_estimate < 1000:
        return f"Token mature ({age_hours:.1f}h), volume faible (${vol_1h_estimate:,.0f}/h) - risque de sortie"
    
    reasons = []
    if age_hours < 6:
        reasons.append("token récent")
    if vol_1h_estimate > 3000:
        reasons.append("volume intéressant")
    if liq_usd > 20000:
        reasons.append("liquidité correcte")
    
    if reasons:
        return f"{', '.join(reasons).capitalize()} - attendre confirmation"
    return "Attendre un signal de momentum plus fort"

def get_gecko_pools(dex_id, limit=20):
    """Get pools from a specific dex"""
    try:
        url = f"https://api.geckoterminal.com/api/v2/networks/base/dexes/{dex_id}/pools?page=1&limit={limit}"
        resp = requests.get(url, timeout=15)
        data = resp.json()
        return data.get("data", []) or []
    except Exception as e:
        return []

def get_dexscreener_tokens():
    """Try DexScreener orderbook endpoint"""
    try:
        # Try the trending endpoint
        url = "https://api.dexscreener.com/token-profiles/latest/v1?chain=base"
        resp = requests.get(url, timeout=10)
        return resp.json() if resp.status_code == 200 else []
    except:
        return []

def main():
    print("[MULTI] Scanning multiple sources...")
    
    all_pools = []
    seen = set()
    
    # Source 1: GeckoTerminal pools from multiple dexes
    print("[MULTI] GeckoTerminal pools...")
    for dex in DEXES[:5]:
        pools = get_gecko_pools(dex, 20)
        for p in pools:
            addr = p.get("attributes", {}).get("address", "")
            if addr and addr not in seen:
                seen.add(addr)
                all_pools.append({"pool": p, "source": "geckoterminal"})
        time.sleep(0.3)
    
    print(f"[MULTI] Total pools: {len(all_pools)}")
    
    # Convert to candidates
    candidates = []
    now = datetime.now(timezone.utc).isoformat()
    
    for p in all_pools[:30]:
        attrs = p["pool"].get("attributes", {})
        base = attrs.get("base_token", {})
        quote = attrs.get("quote_token", {})
        
        addr = base.get("address", "")
        symbol = base.get("symbol", "?")
        name = base.get("name", "?")
        
        if not addr:
            continue
        
        # Get metrics
        liq = float(attrs.get("reserve_in_usd", 0) or 0)
        vol = float(attrs.get("volume_usd", {}).get("h24", 0) or 0)
        created = attrs.get("pool_created_at", "")
        
        # Calculate age
        age_hours = 0
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - dt.replace(tzinfo=timezone.utc)).total_seconds() / 3600
            except:
                pass
        
        # Relaxed filters - include more tokens
        if liq > 1000:  # Lower threshold
            candidates.append({
                "token": {
                    "address": addr,
                    "symbol": symbol,
                    "name": name
                },
                "metrics": {
                    "liq_usd": liq,
                    "vol_24h_usd": vol
                },
                "age_hours": age_hours,
                "detected_at": now,
                "source": "multi_scanner",
                "score": min(100, int(liq / 500)),
                "risk": {"level": "medium" if age_hours < 1 else "low"},
                "badges": ["🔥 SUPER FRESH"] if age_hours < 1 else ["⚡ ACTIVE"],
                "action_badge": calculate_action_badge(age_hours, liq, vol),
                "action_reason": calculate_action_reason(age_hours, liq, vol)
            })
    
    print(f"[MULTI] Candidates: {len(candidates)}")
    
    if candidates:
        # Load existing
        if CIO_FILE.exists():
            cio = json.load(open(CIO_FILE))
        else:
            cio = {"candidates": []}
        
        existing = {c["token"]["address"].lower() for c in cio.get("candidates", [])}
        
        for c in candidates:
            if c["token"]["address"].lower() not in existing:
                cio["candidates"].append(c)
        
        # Keep last 50
        cio["candidates"] = cio["candidates"][-50:]
        cio["meta"] = {"updated_at": now, "source": "multi_scanner"}
        
        json.dump(cio, open(CIO_FILE, "w"), indent=2)
        print(f"[MULTI] Updated CIO: {len(cio['candidates'])} total")
    
    # Regenerate feeds
    import subprocess
    subprocess.run(["node", "scripts/generateFeeds.js"], cwd=CIO_FILE.parent.parent, capture_output=True)
    print("[MULTI] Feeds regenerated")

if __name__ == "__main__":
    main()
