#!/usr/bin/env python3
"""
LURKER Lifecycle Core
Manages token lifecycle categories
"""

import json
import os
from datetime import datetime, timezone, timedelta

LURKER_DIR = "/data/.openclaw/workspace/lurker-project"
STATE_FILE = f"{LURKER_DIR}/lurker_state.json"

def load_state():
    """Load lurker state"""
    if not os.path.exists(STATE_FILE):
        return {"tokens": {}, "last_update": datetime.now(timezone.utc).isoformat()}
    
    try:
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[{datetime.now()}] Error loading state: {e}")
        return {"tokens": {}, "last_update": datetime.now(timezone.utc).isoformat()}

def save_state(state):
    """Save lurker state"""
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def update_categories(state):
    """Update token categories based on age and metrics"""
    now = datetime.now(timezone.utc)
    updated = 0
    
    for address, token in state['tokens'].items():
        first_seen = datetime.fromisoformat(token.get('first_seen', now.isoformat()))
        age_hours = (now - first_seen).total_seconds() / 3600
        
        old_status = token.get('status', 'NEW')
        new_status = old_status
        
        # Category logic
        if age_hours < 1:
            new_status = 'NEW'
        elif age_hours < 24:
            new_status = 'ACTIVE'
        elif age_hours < 72:
            new_status = 'MATURE'
        else:
            new_status = 'LEGACY'
        
        # Risk-based adjustments
        risk_level = token.get('risk', {}).get('level', 'medium')
        if risk_level == 'high' and age_hours > 6:
            new_status = 'RISK'
        
        if new_status != old_status:
            token['status'] = new_status
            updated += 1
            print(f"[{datetime.now()}] {token.get('symbol', 'UNKNOWN')}: {old_status} → {new_status}")
    
    return updated

def main():
    print(f"[{datetime.now()}] Starting Lifecycle Core...")
    
    state = load_state()
    updated = update_categories(state)
    save_state(state)
    
    print(f"[{datetime.now()}] Updated {updated} tokens, total: {len(state['tokens'])}")

if __name__ == "__main__":
    main()
