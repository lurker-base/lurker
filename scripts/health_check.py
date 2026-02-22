#!/usr/bin/env python3
"""
LURKER Health Check - Streak-based validation
Fails on consecutive empty feeds (schedule) or immediately (manual)
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

FEED_FILE = Path("signals/cio_feed.json")
STATE_FILE = Path("state/health_state.json")
MAX_EMPTY_STREAK = 2  # Fail after 2 consecutive empty feeds

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {
        "schema": "lurker_health_v1",
        "empty_streak": 0,
        "last_check": None,
        "last_count": 0
    }

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def validate_feed(is_manual=False):
    """Validate feed with streak logic"""
    state = load_state()
    
    print("=== LURKER Health Check ===")
    
    # Check 1: File exists
    if not FEED_FILE.exists():
        print("❌ FAIL: Feed file not found")
        state["empty_streak"] += 1
        save_state(state)
        return False
    
    # Check 2: Valid JSON
    try:
        with open(FEED_FILE) as f:
            feed = json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ FAIL: Invalid JSON - {e}")
        state["empty_streak"] += 1
        save_state(state)
        return False
    
    # Check 3: Required fields
    if "meta" not in feed or "candidates" not in feed:
        print("❌ FAIL: Missing required fields (meta/candidates)")
        state["empty_streak"] += 1
        save_state(state)
        return False
    
    # Check 4: Timestamp freshness
    updated_at = feed.get("meta", {}).get("updated_at")
    if not updated_at:
        print("⚠️ WARNING: No updated_at timestamp")
    else:
        print(f"📅 Feed timestamp: {updated_at}")
    
    # Check 5: Count
    count = len(feed.get("candidates", []))
    print(f"📊 Candidate count: {count}")
    
    # Check 6: Error in feed (scanner crash)
    error = feed.get("meta", {}).get("error")
    if error:
        print(f"⚠️ Scanner reported error: {error[:200]}")
    
    # Streak logic
    if count == 0:
        state["empty_streak"] += 1
        print(f"⚠️ Empty feed detected (streak: {state['empty_streak']})")
        
        if is_manual:
            print("❌ FAIL: Manual run with empty feed")
            save_state(state)
            return False
        elif state["empty_streak"] >= MAX_EMPTY_STREAK:
            print(f"❌ FAIL: {MAX_EMPTY_STREAK} consecutive empty feeds")
            save_state(state)
            return False
        else:
            print("✅ WARNING only (schedule mode, streak < max)")
            state["last_check"] = datetime.now(timezone.utc).isoformat()
            state["last_count"] = count
            save_state(state)
            return True  # Allow to continue
    else:
        # Reset streak on success
        state["empty_streak"] = 0
        state["last_check"] = datetime.now(timezone.utc).isoformat()
        state["last_count"] = count
        save_state(state)
        print(f"✅ Feed healthy: {count} candidates")
        return True

if __name__ == "__main__":
    # Detect if manual (workflow_dispatch) or scheduled
    is_manual = "--manual" in sys.argv
    
    if is_manual:
        print("Mode: MANUAL (strict)")
    else:
        print("Mode: SCHEDULE (streak-based)")
    
    success = validate_feed(is_manual)
    sys.exit(0 if success else 1)
