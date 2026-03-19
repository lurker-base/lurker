#!/usr/bin/env python3
"""
LURKER Feed Sentinel
Monitors feed freshness and alerts on stale data
"""

import json
import os
import time
from datetime import datetime, timezone

DATA_DIR = "/data/.openclaw/workspace/lurker-project/data"
FEED_FILE = f"{DATA_DIR}/cio_feed.json"
ALERT_FILE = f"{DATA_DIR}/.last_cio_alert.json"

def check_feed_freshness():
    """Check if feed is fresh (less than 10 minutes old)"""
    if not os.path.exists(FEED_FILE):
        print(f"[{datetime.now()}] No feed file found")
        return False
    
    try:
        with open(FEED_FILE, 'r') as f:
            feed = json.load(f)
        
        feed_time = datetime.fromisoformat(feed['timestamp'])
        now = datetime.now(timezone.utc)
        age_minutes = (now - feed_time).total_seconds() / 60
        
        print(f"[{datetime.now()}] Feed age: {age_minutes:.1f} minutes")
        
        if age_minutes > 10:
            print(f"[{datetime.now()}] WARNING: Feed is stale ({age_minutes:.1f} min)")
            return False
        
        return True
        
    except Exception as e:
        print(f"[{datetime.now()}] Error checking feed: {e}")
        return False

def main():
    print(f"[{datetime.now()}] Feed Sentinel checking...")
    
    is_fresh = check_feed_freshness()
    
    if is_fresh:
        print(f"[{datetime.now()}] Feed is fresh ✓")
    else:
        print(f"[{datetime.now()}] Feed needs attention ⚠")

if __name__ == "__main__":
    main()
