#!/usr/bin/env python3
"""
LURKER Hall of Fame — Track performance of certified tokens
Records tokens that were detected early and later performed well
"""
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Files
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
HALL_OF_FAME_FILE = Path(__file__).parent.parent / "signals" / "hall_of_fame.json"
REGISTRY_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"

# Performance thresholds
MIN_GAIN_PCT = 50  # 50% gain to enter Hall of Fame
MIN_AGE_HOURS = 6  # Track after at least 6h for meaningful data

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def load_hall_of_fame():
    """Load existing Hall of Fame"""
    if HALL_OF_FAME_FILE.exists():
        with open(HALL_OF_FAME_FILE) as f:
            return json.load(f)
    return {
        "schema": "lurker_hall_of_fame_v1",
        "meta": {
            "updated_at": now_iso(),
            "total_tracked": 0,
            "total_certified": 0,
            "win_rate": 0.0
        },
        "certified": [],  # Tokens that performed well
        "tracking": [],    # Tokens being tracked
        "rejected": []     # Tokens that failed
    }

def save_hall_of_fame(data):
    """Save Hall of Fame"""
    HALL_OF_FAME_FILE.parent.mkdir(parents=True, exist_ok=True)
    data["meta"]["updated_at"] = now_iso()
    with open(HALL_OF_FAME_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_registry():
    """Load token registry with all seen tokens"""
    if REGISTRY_FILE.exists():
        with open(REGISTRY_FILE) as f:
            return json.load(f)
    return {"tokens": {}}

def calculate_performance(token_data):
    """Calculate performance metrics for a token"""
    history = token_data.get("price_history", [])
    if len(history) < 2:
        return None
    
    first_price = history[0].get("price", 0)
    last_price = history[-1].get("price", 0)
    
    if first_price == 0:
        return None
    
    gain_pct = ((last_price - first_price) / first_price) * 100
    
    # Find max gain (peak)
    max_price = max(h.get("price", 0) for h in history)
    max_gain_pct = ((max_price - first_price) / first_price) * 100 if first_price > 0 else 0
    
    return {
        "gain_pct": round(gain_pct, 2),
        "max_gain_pct": round(max_gain_pct, 2),
        "first_price": first_price,
        "last_price": last_price,
        "max_price": max_price
    }

def update_tracking(hof, registry):
    """Update tokens being tracked"""
    tracking = []
    
    for token_addr, token_data in registry.get("tokens", {}).items():
        # Skip if already certified or rejected
        if any(c["token"]["address"].lower() == token_addr for c in hof["certified"]):
            continue
        if any(r["token"]["address"].lower() == token_addr for r in hof["rejected"]):
            continue
        
        # Check if eligible for tracking
        first_seen = token_data.get("first_seen")
        if not first_seen:
            continue
        
        try:
            first_seen_dt = datetime.fromisoformat(first_seen.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - first_seen_dt).total_seconds() / 3600
        except:
            continue
        
        # Only track if has price history
        perf = calculate_performance(token_data)
        if perf is None:
            continue
        
        # Get token info
        token_info = token_data.get("token", {})
        
        entry = {
            "token": {
                "address": token_addr,
                "symbol": token_info.get("symbol", "UNKNOWN"),
                "name": token_info.get("name", "Unknown")
            },
            "first_seen": first_seen,
            "age_hours": round(age_hours, 1),
            "performance": perf,
            "status": "tracking",
            "added_at": now_iso()
        }
        
        tracking.append(entry)
    
    return tracking

def certify_winners(hof):
    """Move tokens to certified if they performed well"""
    new_certified = []
    still_tracking = []
    
    for t in hof.get("tracking", []):
        perf = t.get("performance", {})
        gain_pct = perf.get("gain_pct", 0)
        max_gain_pct = perf.get("max_gain_pct", 0)
        
        # Certified if achieved MIN_GAIN_PCT
        if gain_pct >= MIN_GAIN_PCT or max_gain_pct >= MIN_GAIN_PCT * 2:
            t["certified_at"] = now_iso()
            t["certified_gain"] = max(gain_pct, max_gain_pct / 2)  # Use realized or half of max
            t["status"] = "certified"
            new_certified.append(t)
        # Reject if failed (< -50%)
        elif gain_pct <= -50:
            t["rejected_at"] = now_iso()
            t["status"] = "rejected"
            hof["rejected"].append(t)
        else:
            still_tracking.append(t)
    
    # Add new certified
    hof["certified"].extend(new_certified)
    hof["tracking"] = still_tracking
    
    return len(new_certified)

def update_stats(hof):
    """Update Hall of Fame statistics"""
    certified = hof.get("certified", [])
    rejected = hof.get("rejected", [])
    tracking = hof.get("tracking", [])
    
    total = len(certified) + len(rejected)
    
    hof["meta"]["total_tracked"] = total + len(tracking)
    hof["meta"]["total_certified"] = len(certified)
    
    if total > 0:
        hof["meta"]["win_rate"] = round(len(certified) / total * 100, 1)
    else:
        hof["meta"]["win_rate"] = 0.0
    
    # Calculate average gain
    if certified:
        avg_gain = sum(c.get("certified_gain", 0) for c in certified) / len(certified)
        hof["meta"]["average_gain_pct"] = round(avg_gain, 1)
    else:
        hof["meta"]["average_gain_pct"] = 0.0

def main():
    print("=" * 60)
    print("[HALL OF FAME] LURKER Performance Tracker")
    print("=" * 60)
    
    # Load data
    hof = load_hall_of_fame()
    registry = load_registry()
    
    print(f"[HOF] Loaded: {len(hof['certified'])} certified, {len(hof['tracking'])} tracking")
    
    # Update tracking from registry
    hof["tracking"] = update_tracking(hof, registry)
    print(f"[HOF] Updated tracking: {len(hof['tracking'])} tokens")
    
    # Certify winners
    new_certified = certify_winners(hof)
    print(f"[HOF] New certified: {new_certified}")
    
    # Update stats
    update_stats(hof)
    print(f"[HOF] Win rate: {hof['meta']['win_rate']}%")
    print(f"[HOF] Avg gain: {hof['meta'].get('average_gain_pct', 0)}%")
    
    # Save
    save_hall_of_fame(hof)
    print(f"[HOF] ✅ Saved")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
