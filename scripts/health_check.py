#!/usr/bin/env python3
"""
LURKER Health Check - Streak-based validation with freshness checks
Fails on consecutive empty feeds (schedule) or immediately (manual)
Also fails if feed is stale (>15 min old) even if non-empty
"""
import json
import sys
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

FEED_FILE = Path("signals/cio_feed.json")
STATE_FILE = Path("state/health_state.json")
STATE_TEMP = Path("state/health_state.json.tmp")
MAX_EMPTY_STREAK = 2  # Fail after 2 consecutive empty feeds
MAX_FEED_AGE_MINUTES = 15  # Feed must be fresher than this

def load_state():
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except:
            pass
    return {
        "schema": "lurker_health_v1",
        "empty_streak": 0,
        "last_check": None,
        "last_count": 0,
        "last_successful_scan": None,
        "last_non_empty_scan": None
    }

def save_state(state):
    """Atomic write to prevent race conditions"""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_TEMP, 'w') as f:
        json.dump(state, f, indent=2)
    os.replace(STATE_TEMP, STATE_FILE)  # Atomic rename

def parse_timestamp(ts_str):
    """Parse ISO timestamp"""
    if not ts_str:
        return None
    try:
        # Handle various ISO formats
        ts_str = ts_str.replace('Z', '+00:00')
        return datetime.fromisoformat(ts_str)
    except:
        return None

def validate_feed(is_manual=False):
    """Validate feed with streak logic and freshness checks"""
    state = load_state()
    now = datetime.now(timezone.utc)
    
    print("=== LURKER Health Check ===")
    print(f"Current time: {now.isoformat()}")
    
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
    
    # Check 4: Timestamp freshness (CRITICAL)
    generated_at = feed.get("meta", {}).get("generated_at") or feed.get("meta", {}).get("updated_at")
    generated_ts = parse_timestamp(generated_at)
    
    if not generated_ts:
        print("❌ FAIL: No valid timestamp in feed")
        state["empty_streak"] += 1
        save_state(state)
        return False
    
    age_minutes = (now - generated_ts).total_seconds() / 60
    print(f"📅 Feed timestamp: {generated_at}")
    print(f"⏱️  Feed age: {age_minutes:.1f} minutes")
    
    # CRITICAL: Fail if feed is stale (even if non-empty!)
    if age_minutes > MAX_FEED_AGE_MINUTES:
        print(f"❌ FAIL: Feed is stale ({age_minutes:.1f}min > {MAX_FEED_AGE_MINUTES}min max)")
        print("   This means the scanner hasn't updated the feed recently")
        state["empty_streak"] += 1
        save_state(state)
        return False
    
    print(f"✅ Feed is fresh (<{MAX_FEED_AGE_MINUTES}min)")
    
    # Check 5: Count
    count = len(feed.get("candidates", []))
    print(f"📊 Candidate count: {count}")
    
    # Check 6: Error in feed (scanner crash)
    error = feed.get("meta", {}).get("error")
    if error:
        print(f"⚠️ Scanner reported error: {error[:200]}")
    
    # Streak logic with freshness validation
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
            state["last_check"] = now.isoformat()
            state["last_count"] = count
            state["last_successful_scan"] = now.isoformat()  # Scan succeeded, just empty
            save_state(state)
            return True  # Allow to continue
    else:
        # Reset streak ONLY if feed is fresh (verified above) and count > 0
        state["empty_streak"] = 0
        state["last_check"] = now.isoformat()
        state["last_count"] = count
        state["last_generated_at"] = generated_at
        state["last_successful_scan"] = now.isoformat()
        if count > 0:
            state["last_non_empty_scan"] = now.isoformat()
        save_state(state)
        print(f"✅ Feed healthy: {count} candidates, streak reset to 0")
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
