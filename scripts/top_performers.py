#!/usr/bin/env python3
"""
LURKER Top Performers — Real-time winners tracking
Tracks tokens with rapid gains (no 6h wait)
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

TOP_FILE = Path(__file__).parent.parent / "signals" / "top_performers.json"
REGISTRY_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"

def load_top_performers():
    if TOP_FILE.exists():
        with open(TOP_FILE) as f:
            return json.load(f)
    return {
        "schema": "lurker_top_performers_v1",
        "meta": {"updated_at": datetime.now(timezone.utc).isoformat()},
        "performers": []  # Tokens with +20% in last hour
    }

def save_top_performers(data):
    TOP_FILE.parent.mkdir(parents=True, exist_ok=True)
    data["meta"]["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(TOP_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def calculate_hourly_gain(token_data):
    """Calculate gain over last hour"""
    history = token_data.get("price_history", [])
    if len(history) < 2:
        return None
    
    # Get price 1h ago vs current
    now = datetime.now(timezone.utc).timestamp() * 1000
    one_hour_ago = now - 3600000
    
    current_price = history[-1].get("price", 0)
    
    # Find price ~1h ago
    price_1h_ago = None
    for h in reversed(history):
        if h.get("timestamp", 0) <= one_hour_ago:
            price_1h_ago = h.get("price", 0)
            break
    
    if not price_1h_ago or price_1h_ago == 0:
        return None
    
    gain_pct = ((current_price - price_1h_ago) / price_1h_ago) * 100
    return {
        "gain_pct": round(gain_pct, 2),
        "price_1h_ago": price_1h_ago,
        "current_price": current_price
    }

def update_top_performers():
    registry = json.load(open(REGISTRY_FILE)) if REGISTRY_FILE.exists() else {"tokens": {}}
    top = load_top_performers()
    
    performers = []
    
    for addr, token_data in registry.get("tokens", {}).items():
        symbol = token_data.get("token", {}).get("symbol", "UNKNOWN")
        
        # Calculate hourly performance
        perf = calculate_hourly_gain(token_data)
        if perf and perf["gain_pct"] >= 20:  # +20% in 1h
            performers.append({
                "token": token_data.get("token", {}),
                "gain_1h_pct": perf["gain_pct"],
                "price_1h_ago": perf["price_1h_ago"],
                "current_price": perf["current_price"],
                "detected_at": token_data.get("first_seen_iso"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
    
    # Sort by gain (highest first)
    performers.sort(key=lambda x: x["gain_1h_pct"], reverse=True)
    
    # Keep top 10
    top["performers"] = performers[:10]
    top["meta"]["count"] = len(top["performers"])
    
    save_top_performers(top)
    
    print(f"✅ Top Performers: {len(performers)} tokens with +20%/1h")
    for p in performers[:5]:
        print(f"   🚀 {p['token']['symbol']}: +{p['gain_1h_pct']}%")

if __name__ == "__main__":
    print("="*60)
    print("LURKER Top Performers Tracker")
    print("="*60)
    update_top_performers()
