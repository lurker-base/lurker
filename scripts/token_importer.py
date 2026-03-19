#!/usr/bin/env python3
"""
LURKER Token Importer
Imports CIO feed data to lurker_state.json
"""

import json
import os
from datetime import datetime, timezone

LURKER_DIR = "/data/.openclaw/workspace/lurker-project"
DATA_DIR = f"{LURKER_DIR}/data"
FEED_FILE = f"{DATA_DIR}/cio_feed.json"
STATE_FILE = f"{LURKER_DIR}/lurker_state.json"

def load_feed():
    """Load CIO feed"""
    if not os.path.exists(FEED_FILE):
        return None
    
    try:
        with open(FEED_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[{datetime.now()}] Error loading feed: {e}")
        return None

def load_state():
    """Load or create lurker state"""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    
    return {
        "tokens": {},
        "last_update": datetime.now(timezone.utc).isoformat()
    }

def save_state(state):
    """Save lurker state"""
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def import_tokens(feed, state):
    """Import tokens from feed to state"""
    if not feed or 'candidates' not in feed:
        return 0
    
    imported = 0
    for candidate in feed['candidates']:
        token = candidate['token']
        address = token['address']
        
        if address not in state['tokens']:
            state['tokens'][address] = {
                **token,
                'metrics': candidate['metrics'],
                'risk': candidate['risk'],
                'first_seen': candidate['timestamp'],
                'status': 'NEW'
            }
            imported += 1
            print(f"[{datetime.now()}] New token: {token['symbol']} ({address[:8]}...)")
        else:
            # Update existing token
            state['tokens'][address]['metrics'] = candidate['metrics']
            state['tokens'][address]['risk'] = candidate['risk']
    
    state['last_update'] = datetime.now(timezone.utc).isoformat()
    return imported

def main():
    print(f"[{datetime.now()}] Starting Token Importer...")
    
    feed = load_feed()
    state = load_state()
    
    if feed:
        imported = import_tokens(feed, state)
        save_state(state)
        print(f"[{datetime.now()}] Imported {imported} new tokens, total: {len(state['tokens'])}")
    else:
        print(f"[{datetime.now()}] No feed to import")

if __name__ == "__main__":
    main()
