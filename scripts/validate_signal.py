#!/usr/bin/env python3
"""
LURKER Signal Validator
Garde-fous: anti-doublon + rarity gate + min confidence
Usage: python3 validate_signal.py signals/latest.json
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

STATE_DIR = Path(__file__).parent.parent / "state"
SIGNALS_FILE = Path(__file__).parent.parent / "signals" / "latest.json"
POSTED_FILE = STATE_DIR / "posted.json"
DAILY_FILE = STATE_DIR / "daily_count.json"

# Configuration
MIN_CONFIDENCE = 70
MAX_PER_DAY = 5
DUPLICATE_EXPIRY_DAYS = 7

def load_json(path):
    if not path.exists():
        return {}
    with open(path, 'r') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def check_duplicate(token_address):
    """Vérifie si le token a déjà été posté (expires après 7 jours)"""
    posted = load_json(POSTED_FILE)
    tokens = posted.get("tokens", {})
    
    if token_address in tokens:
        posted_date = datetime.fromisoformat(tokens[token_address])
        if datetime.now() - posted_date < timedelta(days=DUPLICATE_EXPIRY_DAYS):
            return False, f"Token {token_address[:10]}... already posted on {tokens[token_address]}"
    
    return True, None

def check_daily_limit():
    """Vérifie le plafond 5 signaux/jour"""
    daily = load_json(DAILY_FILE)
    today = datetime.now().strftime("%Y-%m-%d")
    
    if daily.get("date_utc") != today:
        # Reset pour nouveau jour
        daily = {"date_utc": today, "count": 0, "max_per_day": MAX_PER_DAY}
        save_json(DAILY_FILE, daily)
    
    if daily.get("count", 0) >= MAX_PER_DAY:
        return False, f"Daily limit reached: {daily['count']}/{MAX_PER_DAY}"
    
    return True, daily

def validate_signal(signal_data):
    """Valide un signal selon les règles LURKER"""
    
    # 1. Check kind
    if signal_data.get("kind") != "LURKER_SIGNAL":
        return False, "Invalid kind (expected: LURKER_SIGNAL)"
    
    # 2. Check status
    if signal_data.get("status") != "ready":
        return False, f"Status is '{signal_data.get('status')}' (expected: 'ready')"
    
    # 3. Check confidence
    confidence = signal_data.get("scores", {}).get("confidence", 0)
    if confidence < MIN_CONFIDENCE:
        return False, f"Confidence {confidence} < minimum {MIN_CONFIDENCE}"
    
    # 4. Check duplicate
    token_addr = signal_data.get("token", {}).get("address", "")
    if token_addr and token_addr != "0x...":
        ok, err = check_duplicate(token_addr)
        if not ok:
            return False, err
    
    # 5. Check daily limit
    ok, daily = check_daily_limit()
    if not ok:
        return False, daily
    
    return True, daily

def update_state(signal_data, daily):
    """Met à jour les state files après validation réussie"""
    
    # Update posted tokens
    posted = load_json(POSTED_FILE)
    token_addr = signal_data.get("token", {}).get("address", "")
    if token_addr and token_addr != "0x...":
        if "tokens" not in posted:
            posted["tokens"] = {}
        posted["tokens"][token_addr] = datetime.now().isoformat()
        save_json(POSTED_FILE, posted)
    
    # Update daily count
    daily["count"] = daily.get("count", 0) + 1
    save_json(DAILY_FILE, daily)
    
    # Update signal status
    signal_data["status"] = "posted"
    signal_data["posted_at"] = datetime.now().isoformat()
    signal_data["signal_number"] = f"#{daily['count']}"
    with open(SIGNALS_FILE, 'w') as f:
        json.dump(signal_data, f, indent=2)

def main():
    signal_file = Path(sys.argv[1]) if len(sys.argv) > 1 else SIGNALS_FILE
    
    if not signal_file.exists():
        print("[LURKER] ℹ️ SKIP: Signal file not found")
        sys.exit(0)
    
    with open(signal_file, 'r') as f:
        signal = json.load(f)
    
    print(f"[LURKER] Checking signal: {signal.get('token', {}).get('symbol', 'UNKNOWN')}")
    print(f"[LURKER] Confidence: {signal.get('scores', {}).get('confidence', 0)}")
    
    ok, result = validate_signal(signal)
    
    if not ok:
        print(f"[LURKER] ⏭️ SIGNAL REJECTED (normal)")
        print(f"[LURKER] Reason: {result}")
        print(f"[LURKER] Guardrail triggered — signal skipped")
        print(f"[LURKER] This is EXPECTED behavior. No error.")
        print(f"[LURKER] Current limits: max {MAX_PER_DAY}/day, min confidence {MIN_CONFIDENCE}, 7-day anti-dup")
        sys.exit(0)  # ← Exit 0 = SUCCESS (pas de ❌ rouge)
    
    # Update state
    update_state(signal, result)
    
    print(f"[LURKER] ✅ VALIDATED — Signal {signal.get('signal_number')} will be posted")
    print(f"[LURKER] Daily count: {result['count']}/{MAX_PER_DAY}")
    sys.exit(0)

if __name__ == "__main__":
    main()
