#!/usr/bin/env python3
"""
LURKER Signal Diagnostic — Check why tokens aren't flowing
"""
import json
from pathlib import Path
from datetime import datetime, timezone

BASE = Path(__file__).parent.parent

def check_feed(path, name):
    """Check a feed file status"""
    full_path = BASE / path
    if not full_path.exists():
        return {"name": name, "status": "MISSING", "count": 0, "age_min": None}
    
    try:
        with open(full_path) as f:
            data = json.load(f)
        
        meta = data.get("meta", {})
        updated = meta.get("updated_at", "")
        count = meta.get("count", 0)
        status = meta.get("status", "unknown")
        
        # Calculate age
        try:
            updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            age_min = (datetime.now(timezone.utc) - updated_dt).total_seconds() / 60
        except:
            age_min = None
        
        return {
            "name": name,
            "status": status.upper(),
            "count": count,
            "age_min": round(age_min, 1) if age_min else None,
            "updated": updated
        }
    except Exception as e:
        return {"name": name, "status": f"ERROR: {e}", "count": 0, "age_min": None}

def main():
    print("=" * 60)
    print("LURKER SIGNAL DIAGNOSTIC")
    print("=" * 60)
    
    feeds = [
        ("signals/cio_feed.json", "CIO (0-60min)"),
        ("signals/watch_feed.json", "WATCH (10-30min)"),
        ("signals/hotlist_feed.json", "HOTLIST (30-60min)"),
        ("signals/fast_certified_feed.json", "FAST (1-24h)"),
        ("signals/live_feed.json", "LIVE (DexScreener)"),
    ]
    
    results = []
    for path, name in feeds:
        result = check_feed(path, name)
        results.append(result)
        
        status = result["status"]
        if status in ["OK", "CALM"]:
            status_icon = "✅"
        elif status == "DEGRADED":
            status_icon = "⚠️"
        elif status in ["ERROR", "MISSING"]:
            status_icon = "❌"
        else:
            status_icon = "❓"
        
        age_str = f"({result['age_min']}m ago)" if result["age_min"] else ""
        print(f"{status_icon} {result['name']}: {status} | {result['count']} tokens {age_str}")
        
        if status == "ERROR":
            print(f"   🔴 {result['status']} — check logs")
    
    print("\n" + "=" * 60)
    print("ANALYSIS")
    print("=" * 60)
    
    # Check statuses
    errors = [r for r in results if r["status"] == "ERROR"]
    degraded = [r for r in results if r["status"] == "DEGRADED"]
    missing = [r for r in results if r["status"] == "MISSING"]
    stale = [r for r in results if r.get("age_min", 0) > 30]
    
    if errors:
        print(f"🔴 ERRORS: {len(errors)} feed(s) in error state")
        for r in errors:
            print(f"   → {r['name']}")
    
    if degraded:
        print(f"⚠️  DEGRADED: {len(degraded)} feed(s) — dependencies unavailable")
        for r in degraded:
            print(f"   → {r['name']}")
    
    if missing:
        print(f"❌ MISSING: {len(missing)} feed(s) not found")
        for r in missing:
            print(f"   → {r['name']}")
    
    if stale:
        print(f"⏱️  STALE: {len(stale)} feed(s) >30min old")
        for r in stale:
            print(f"   → {r['name']} ({r['age_min']:.0f}m)")
    
    # Check total tokens
    total = sum(r["count"] for r in results if r["status"] in ["OK", "CALM", "DEGRADED"])
    if total == 0 and not errors:
        print("\n⚠️  ZERO tokens but no errors — possible causes:")
        print("     1. No new token launches on Base right now")
        print("     2. ULTRA LAUNCH thresholds too restrictive")
        print("     3. Market is calm (normal)")
    elif total < 3:
        print(f"\n⚠️  Only {total} token(s) — low activity period")
    else:
        print(f"\n✅ {total} tokens tracked — normal activity")

if __name__ == "__main__":
    main()
