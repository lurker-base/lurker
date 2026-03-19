#!/usr/bin/env python3
"""
LURKER Scanner Hybrid
Detects fresh contracts and generates alerts
"""

import json
import os
from datetime import datetime, timezone

LURKER_DIR = "/data/.openclaw/workspace/lurker-project"
STATE_FILE = f"{LURKER_DIR}/lurker_state.json"
SIGNALS_DIR = f"{LURKER_DIR}/signals"

def load_state():
    """Load lurker state"""
    if not os.path.exists(STATE_FILE):
        return {"tokens": {}, "last_update": datetime.now(timezone.utc).isoformat()}
    
    try:
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    except:
        return {"tokens": {}, "last_update": datetime.now(timezone.utc).isoformat()}

def save_signal(token, signal_type="NEW_TOKEN"):
    """Save signal to file"""
    os.makedirs(SIGNALS_DIR, exist_ok=True)
    
    signal = {
        "type": signal_type,
        "token": token,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    filename = f"{SIGNALS_DIR}/{signal_type}_{token['address'][:8]}.json"
    with open(filename, 'w') as f:
        json.dump(signal, f, indent=2)
    
    print(f"[{datetime.now()}] Signal saved: {filename}")

def scan_for_opportunities(state):
    """Scan for trading opportunities"""
    opportunities = []
    
    for address, token in state['tokens'].items():
        metrics = token.get('metrics', {})
        risk = token.get('risk', {})
        
        # Criteria for opportunity
        liq = metrics.get('liq_usd', 0)
        vol = metrics.get('vol_24h_usd', 0)
        risk_level = risk.get('level', 'high')
        
        if liq > 50000 and vol > 5000 and risk_level in ['low', 'medium']:
            opportunities.append(token)
            save_signal(token, "OPPORTUNITY")
    
    return opportunities

def main():
    print(f"[{datetime.now()}] Starting Hybrid Scanner...")
    
    state = load_state()
    opportunities = scan_for_opportunities(state)
    
    print(f"[{datetime.now()}] Found {len(opportunities)} opportunities")

if __name__ == "__main__":
    main()
