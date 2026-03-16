#!/usr/bin/env python3
"""
LURKER PREMIUM TRACKER
Tracks consistent tokens and monitors for pump/dump patterns
Generates premium signals for paid subscribers
"""
import json
import time
import requests
from datetime import datetime, timezone
from pathlib import Path
import os
from safe_state import StateFile

# Config
BASE_DIR = Path("/data/.openclaw/workspace/lurker-project")
STATE_DIR = BASE_DIR / "state"
SIGNALS_DIR = BASE_DIR / "signals"

# Thresholds for "consistent" tokens
MIN_LIQ = 10000       # $10k minimum liquidity
MIN_VOL_24H = 50000   # $50k 24h volume
MIN_HOLDERS = 10      # Minimum holders
MIN_AGE_HOURS = 2     # At least 2 hours old (survived initial volatility)

# Tracking intervals (in seconds)
SCAN_INTERVAL = 300   # 5 minutes
PRICE_CHECK_INTERVAL = 60  # 1 minute for price monitoring

# Price change thresholds
PUMP_THRESHOLD = 0.20  # 20% increase = pump alert
DUMP_THRESHOLD = -0.15  # 15% decrease = dump alert

def now_ms():
    return int(time.time() * 1000)

def iso(ts_ms=None):
    if ts_ms is None:
        ts_ms = now_ms()
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()

def default_tracker_state():
    return {
        "schema": "lurker_premium_tracker_v1",
        "tracked_tokens": {},
        "pump_alerts": [],
        "dump_alerts": [],
        "last_scan": None
    }


def load_tracker_state():
    """Load or create premium tracker state"""
    STATE_FILE = STATE_DIR / "premium_tracker.json"
    if not STATE_FILE.exists():
        return default_tracker_state()
    return StateFile(STATE_FILE, max_retries=5, retry_delay=0.2).load(default=default_tracker_state())


def save_tracker_state(state):
    """Save premium tracker state"""
    STATE_FILE = STATE_DIR / "premium_tracker.json"
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not StateFile(STATE_FILE, max_retries=5, retry_delay=0.2).save(state):
        raise RuntimeError("failed to save premium tracker state atomically")

def get_token_data_from_dexscreener(token_address):
    """Fetch token data from DexScreener"""
    try:
        url = f"https://api.dexscreener.com/tokens/base/{token_address}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "pair" in data:
                return data["pair"]
    except Exception as e:
        print(f"Error fetching {token_address}: {e}")
    return None

def check_token_price(token_address, last_price):
    """Check current price and detect pump/dump"""
    pair = get_token_data_from_dexscreener(token_address)
    if not pair or "priceUsd" not in pair:
        return None, None
    
    try:
        current_price = float(pair["priceUsd"])
    except:
        return None, None
    
    if last_price and last_price > 0:
        change_pct = (current_price - last_price) / last_price
        
        # Get volume and liquidity
        try:
            vol_24h = float(pair.get("volume", {}).get("h24", 0))
            liq = float(pair.get("liquidity", {}).get("usd", 0))
            txns = pair.get("txns", {})
            buys = txns.get("h24", {}).get("buys", 0)
            sells = txns.get("h24", {}).get("sells", 0)
        except:
            vol_24h = liq = buys = sells = 0
        
        if change_pct >= PUMP_THRESHOLD:
            return current_price, {
                "type": "PUMP",
                "change_pct": round(change_pct * 100, 2),
                "price": current_price,
                "volume_24h": vol_24h,
                "liquidity": liq,
                "buys": buys,
                "sells": sells,
                "time": iso()
            }
        elif change_pct <= DUMP_THRESHOLD:
            return current_price, {
                "type": "DUMP",
                "change_pct": round(change_pct * 100, 2),
                "price": current_price,
                "volume_24h": vol_24h,
                "liquidity": liq,
                "buys": buys,
                "sells": sells,
                "time": iso()
            }
    
    return current_price, None

def scan_consistent_tokens():
    """Scan for consistent tokens to add to premium tracking"""
    print("[PREMIUM TRACKER] Scanning for consistent tokens...")
    
    # Check hall of fame for proven performers
    hof_file = SIGNALS_DIR / "hall_of_fame.json"
    if hof_file.exists():
        with open(hof_file) as f:
            hof_data = json.load(f)
    
    # Check lifecycle for established tokens
    state_file = STATE_DIR / "lurker_state.json"
    if state_file.exists():
        state_data = StateFile(state_file, max_retries=5, retry_delay=0.2).load(default={"tokens": {}})
        tokens = state_data.get("tokens", {})

        # Find consistent tokens
        for addr, token in tokens.items():
            age_hours = token.get("age_hours", 0)
            liq = token.get("liquidity_usd", 0)
            vol = token.get("volume_24h", 0)

            # Check if meets criteria
            if age_hours >= MIN_AGE_HOURS and liq >= MIN_LIQ and vol >= MIN_VOL_24H:
                # Add to tracking if not already tracked
                print(f"  Found consistent: {token.get('symbol', 'unknown')} - ${liq:.0f} liq, ${vol:.0f} vol")
    
    # Also check the live feed
    live_file = SIGNALS_DIR / "live_feed.json"
    if live_file.exists():
        with open(live_file) as f:
            live = json.load(f)
            pairs = live.get("pairs", [])
            for pair in pairs:
                try:
                    liq = float(pair.get("liquidity", {}).get("usd", 0))
                    vol = float(pair.get("volume", {}).get("h24", 0))
                    age = pair.get("age", "")
                    
                    # Parse age (simplified - would need proper parsing)
                    if liq >= MIN_LIQ and vol >= MIN_VOL_24H:
                        addr = pair.get("baseToken", {}).get("address", "")
                        if addr:
                            print(f"  Live feed candidate: {pair.get('baseToken', {}).get('symbol')} - ${liq:.0f}")
                except:
                    pass

def run_tracker_cycle():
    """Run one cycle of premium tracking"""
    state = load_tracker_state()
    tracked = state.get("tracked_tokens", {})
    
    print(f"[PREMIUM TRACKER] Checking {len(tracked)} tracked tokens...")
    
    new_pumps = []
    new_dumps = []
    
    for addr, token_data in tracked.items():
        last_price = token_data.get("last_price")
        
        current_price, alert = check_token_price(addr, last_price)
        
        if current_price:
            token_data["last_price"] = current_price
            token_data["last_check"] = iso()
        
        if alert:
            alert["token"] = token_data.get("symbol", addr)
            alert["address"] = addr
            
            if alert["type"] == "PUMP":
                new_pumps.append(alert)
                print(f"  🚀 PUMP: {alert['token']} +{alert['change_pct']}%")
            elif alert["type"] == "DUMP":
                new_dumps.append(alert)
                print(f"  📉 DUMP: {alert['token']} {alert['change_pct']}%")
    
    # Save updated state
    state["tracked_tokens"] = tracked
    state["last_scan"] = iso()
    save_tracker_state(state)
    
    # Generate alerts
    if new_pumps or new_dumps:
        generate_premium_alerts(new_pumps, new_dumps, state)
    
    return len(new_pumps), len(new_dumps)

def generate_premium_alerts(pumps, dumps, state):
    """Generate premium alert files"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    if pumps:
        pump_file = SIGNALS_DIR / f"PREMIUM_PUMP_{timestamp}.json"
        with open(pump_file, 'w') as f:
            json.dump({
                "schema": "lurker_premium_alert",
                "type": "PUMP",
                "count": len(pumps),
                "alerts": pumps,
                "generated_at": iso()
            }, f, indent=2)
        print(f"  ✅ Saved premium pump alert: {pump_file}")
        state["pump_alerts"].append(str(pump_file))
    
    if dumps:
        dump_file = SIGNALS_DIR / f"PREMIUM_DUMP_{timestamp}.json"
        with open(dump_file, 'w') as f:
            json.dump({
                "schema": "lurker_premium_alert",
                "type": "DUMP",
                "count": len(dumps),
                "alerts": dumps,
                "generated_at": iso()
            }, f, indent=2)
        print(f"  ✅ Saved premium dump alert: {dump_file}")
        state["dump_alerts"].append(str(dump_file))
    
    save_tracker_state(state)

def main():
    """Main premium tracker loop"""
    print("=" * 60)
    print("LURKER PREMIUM TRACKER - Starting")
    print("=" * 60)
    
    # Initial scan for consistent tokens
    scan_consistent_tokens()
    
    # Run tracking cycles
    while True:
        try:
            pumps, dumps = run_tracker_cycle()
            
            if pumps > 0 or dumps > 0:
                print(f"[PREMIUM] {pumps} pumps, {dumps} dumps detected")
            else:
                print(f"[PREMIUM] No significant price movements")
            
            time.sleep(SCAN_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n[PREMIUM TRACKER] Stopping...")
            break
        except Exception as e:
            print(f"[PREMIUM TRACKER] Error: {e}")
            time.sleep(60)

if __name__ == "__main__":
    main()
