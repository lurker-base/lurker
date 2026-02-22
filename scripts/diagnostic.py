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
        
        # Calculate age
        try:
            updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            age_min = (datetime.now(timezone.utc) - updated_dt).total_seconds() / 60
        except:
            age_min = None
        
        return {
            "name": name,
            "status": "OK",
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
        
        status_icon = "✅" if result["status"] == "OK" else "❌"
        age_str = f"({result['age_min']}m ago)" if result["age_min"] else ""
        print(f"{status_icon} {result['name']}: {result['count']} tokens {age_str}")
        
        if result["status"] not in ["OK", "MISSING"]:
            print(f"   ⚠️  {result['status']}")
    
    print("\n" + "=" * 60)
    print("ANALYSIS")
    print("=" * 60)
    
    # Check if CIO is stale
    cio = next((r for r in results if r["name"] == "CIO (0-60min)"), None)
    if cio and cio.get("age_min", 999) > 30:
        print("⚠️  CIO feed is STALE (>30min old)")
        print("   → Check if scanner_cio_v3.yml is running")
    
    # Check total tokens
    total = sum(r["count"] for r in results if r["status"] == "OK")
    if total == 0:
        print("⚠️  ZERO tokens across all feeds")
        print("   → Possible causes:")
        print("     1. No new token launches on Base right now")
        print("     2. ULTRA LAUNCH thresholds too restrictive")
        print("     3. API rate limits blocking scanners")
        print("     4. GitHub Actions not running")
    elif total < 3:
        print(f"⚠️  Only {total} token(s) — low activity period")
    else:
        print(f"✅ {total} tokens tracked — normal activity")
    
    # Check for missing feeds
    missing = [r["name"] for r in results if r["status"] == "MISSING"]
    if missing:
        print(f"\n⚠️  Missing feeds: {', '.join(missing)}")
        print("   → These workflows may not have run yet")

if __name__ == "__main__":
    main()
