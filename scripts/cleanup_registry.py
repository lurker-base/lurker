#!/usr/bin/env python3
"""
LURKER Token Registry Cleanup
Removes stale/old tokens from registry to prevent bloat and improve discovery
"""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

REGISTRY_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"
BACKUP_DIR = Path(__file__).parent.parent / "state" / "backups"

# Cleanup thresholds
MAX_AGE_DAYS = 14  # Remove tokens older than 14 days with no activity
MIN_LIQ_FOR_RETENTION = 1000  # Keep tokens with at least $1k liq
INACTIVE_THRESHOLD_DAYS = 7  # Consider inactive if no updates for 7 days


def load_registry():
    try:
        with open(REGISTRY_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[CLEANUP] Error loading registry: {e}")
        return None


def save_backup(registry):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup_file = BACKUP_DIR / f"token_registry_backup_{timestamp}.json"
    with open(backup_file, 'w') as f:
        json.dump(registry, f, indent=2)
    print(f"[CLEANUP] Backup saved: {backup_file}")
    return backup_file


def calculate_age_days(timestamp_str):
    try:
        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 86400
    except:
        return 9999  # Very old if can't parse


def get_last_activity(token_data):
    """Get the last activity timestamp for a token"""
    # Check price history
    price_history = token_data.get("price_history", [])
    if price_history:
        last_price = price_history[-1].get("timestamp", "")
        if last_price:
            try:
                return datetime.fromisoformat(last_price.replace('Z', '+00:00'))
            except:
                pass
    
    # Check first_seen
    first_seen = token_data.get("first_seen_iso", "")
    if first_seen:
        try:
            return datetime.fromisoformat(first_seen.replace('Z', '+00:00'))
        except:
            pass
    
    return None


def should_remove_token(token_addr, token_data):
    """Determine if a token should be removed from registry"""
    
    # Keep if it has significant liquidity
    liq = 0
    price_history = token_data.get("price_history", [])
    if price_history:
        liq = price_history[-1].get("liq", 0)
    
    if liq >= MIN_LIQ_FOR_RETENTION:
        return False, "has_liquidity"
    
    # Check last activity
    last_activity = get_last_activity(token_data)
    if not last_activity:
        return True, "no_activity_data"
    
    days_inactive = (datetime.now(timezone.utc) - last_activity).total_seconds() / 86400
    
    # Remove if inactive for too long
    if days_inactive > INACTIVE_THRESHOLD_DAYS:
        return True, f"inactive_{days_inactive:.0f}d"
    
    # Check total age
    first_seen = token_data.get("first_seen_iso", "")
    if first_seen:
        age_days = calculate_age_days(first_seen)
        if age_days > MAX_AGE_DAYS:
            return True, f"too_old_{age_days:.0f}d"
    
    return False, "active"


def cleanup_registry(registry):
    """Clean up the token registry"""
    if not registry or "tokens" not in registry:
        return None, {}
    
    tokens = registry["tokens"]
    original_count = len(tokens)
    
    to_remove = []
    reasons = {}
    
    for addr, token_data in tokens.items():
        should_remove, reason = should_remove_token(addr, token_data)
        if should_remove:
            to_remove.append(addr)
            reasons[reason] = reasons.get(reason, 0) + 1
    
    # Remove stale tokens
    for addr in to_remove:
        del tokens[addr]
    
    removed_count = len(to_remove)
    remaining_count = len(tokens)
    
    # Update metadata
    registry["meta"] = registry.get("meta", {})
    registry["meta"]["last_cleanup"] = datetime.now(timezone.utc).isoformat()
    registry["meta"]["cleanup_stats"] = {
        "original_count": original_count,
        "removed_count": removed_count,
        "remaining_count": remaining_count,
        "removal_reasons": reasons
    }
    
    return registry, {
        "original_count": original_count,
        "removed_count": removed_count,
        "remaining_count": remaining_count,
        "removal_reasons": reasons
    }


def save_registry(registry):
    """Save the cleaned registry"""
    with open(REGISTRY_FILE, 'w') as f:
        json.dump(registry, f, indent=2)
    print(f"[CLEANUP] Registry saved to {REGISTRY_FILE}")


def main():
    print("=" * 60)
    print("LURKER Token Registry Cleanup")
    print("=" * 60)
    print()
    
    # Load registry
    registry = load_registry()
    if not registry:
        print("[CLEANUP] Failed to load registry. Exiting.")
        return
    
    original_count = len(registry.get("tokens", {}))
    print(f"[CLEANUP] Loaded registry with {original_count} tokens")
    print()
    
    # Save backup first
    backup_file = save_backup(registry)
    print()
    
    # Clean up
    cleaned_registry, stats = cleanup_registry(registry)
    
    if cleaned_registry is None:
        print("[CLEANUP] Nothing to clean up")
        return
    
    # Show stats
    print("Cleanup Results:")
    print(f"  Original count:  {stats['original_count']}")
    print(f"  Removed:         {stats['removed_count']}")
    print(f"  Remaining:       {stats['remaining_count']}")
    print()
    
    print("Removal reasons:")
    for reason, count in stats['removal_reasons'].items():
        print(f"  - {reason}: {count}")
    print()
    
    # Save cleaned registry
    save_registry(cleaned_registry)
    
    # Calculate size reduction
    original_size = REGISTRY_FILE.stat().st_size / (1024 * 1024) if REGISTRY_FILE.exists() else 0
    print(f"[CLEANUP] Registry size: {original_size:.2f} MB")
    print()
    print(f"[CLEANUP] Backup saved at: {backup_file}")
    print("=" * 60)


if __name__ == "__main__":
    main()
