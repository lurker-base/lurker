#!/usr/bin/env python3
"""
V2 Scanner - Détection simplifiée des tokens sur Base
"""

import requests
import json
import os
from datetime import datetime, timezone
from pathlib import Path

# Configuration
DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/search"
BASE_CHAIN_ID = "base"
MIN_LIQUIDITY = 1000  # $1k minimum
MIN_VOLUME_5M = 100   # $100 volume 5min minimum

STATE_FILE = Path(__file__).parent.parent / "state" / "tokens.json"

def load_state():
    """Charge l'état actuel des tokens"""
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {
        "schema": "lurker_v2",
        "meta": {
            "last_scan": None,
            "last_analyze": None,
            "total_tokens": 0
        },
        "tokens": {}
    }

def save_state(state):
    """Sauvegarde l'état des tokens"""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    state["meta"]["last_scan"] = datetime.now(timezone.utc).isoformat()
    state["meta"]["total_tokens"] = len(state["tokens"])
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)
    print(f"✅ State saved: {len(state['tokens'])} tokens")

def scan_base_tokens():
    """Scan les tokens sur Base via DexScreener"""
    print("🔍 Scanning Base chain...")
    
    try:
        # Recherche générale sur Base
        response = requests.get(
            f"{DEXSCREENER_API}?q=base",
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        new_tokens = []
        
        for pair in data.get("pairs", []):
            # Filtrer uniquement Base
            if pair.get("chainId") != BASE_CHAIN_ID:
                continue
            
            # Vérifier critères minimum
            liq = float(pair.get("liquidity", {}).get("usd", 0))
            vol_5m = float(pair.get("volume", {}).get("m5", 0))
            
            if liq < MIN_LIQUIDITY:
                continue
            if vol_5m < MIN_VOLUME_5M:
                continue
            
            token_address = pair.get("baseToken", {}).get("address")
            if not token_address:
                continue
            
            new_tokens.append({
                "address": token_address,
                "symbol": pair.get("baseToken", {}).get("symbol", "UNKNOWN"),
                "name": pair.get("baseToken", {}).get("name", "Unknown"),
                "pair_address": pair.get("pairAddress"),
                "dex": pair.get("dexId"),
                "metrics": {
                    "liq_usd": liq,
                    "price_usd": float(pair.get("priceUsd", 0)),
                    "vol_5m_usd": vol_5m,
                    "vol_1h_usd": float(pair.get("volume", {}).get("h1", 0)),
                    "txns_5m": int(pair.get("txns", {}).get("m5", {}).get("buys", 0)) + 
                               int(pair.get("txns", {}).get("m5", {}).get("sells", 0))
                },
                "detected_at": datetime.now(timezone.utc).isoformat(),
                "category": "CIO",
                "risk": {"level": "unknown", "factors": []},
                "performance": {"max_gain": 0, "current_gain": 0, "status": "new"}
            })
        
        print(f"📊 Found {len(new_tokens)} new tokens on Base")
        return new_tokens
        
    except Exception as e:
        print(f"❌ Error scanning: {e}")
        return []

def update_state(state, new_tokens):
    """Met à jour l'état avec les nouveaux tokens"""
    added = 0
    
    for token in new_tokens:
        addr = token["address"]
        if addr not in state["tokens"]:
            state["tokens"][addr] = token
            added += 1
            print(f"  + New: {token['symbol']} (${token['metrics']['liq_usd']:,.0f} liq)")
    
    print(f"\n✅ Added {added} new tokens")
    return state

def main():
    print("="*60)
    print("LURKER V2 - Scanner")
    print("="*60)
    
    # Charger état actuel
    state = load_state()
    print(f"Current tokens: {len(state['tokens'])}")
    
    # Scanner
    new_tokens = scan_base_tokens()
    
    # Mettre à jour
    state = update_state(state, new_tokens)
    
    # Sauvegarder
    save_state(state)
    
    print("="*60)

if __name__ == "__main__":
    main()
