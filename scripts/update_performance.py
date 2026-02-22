#!/usr/bin/env python3
"""
Update performance tracker with intraday data from DexScreener
Fetches current prices and updates performance metrics
"""
import json
import requests
from datetime import datetime
from pathlib import Path

# Config
TRACKER_FILE = Path("state/performance_tracker.json")
SIGNALS_FILE = Path("signals/latest.json")

def load_json(path):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def fetch_dexscreener_data(token_address, chain="base"):
    """Fetch token data from DexScreener API"""
    if not token_address or token_address.startswith("0xDRYRUN") or token_address == "0x...":
        return None
    
    try:
        url = f"https://api.dexscreener.com/latest/dex/tokens/{token_address}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            pairs = data.get("pairs", [])
            if pairs:
                # Get the best pair by liquidity
                best = max(pairs, key=lambda x: float(x.get("liquidity", {}).get("usd", 0) or 0))
                return {
                    "price_usd": float(best.get("priceUsd", 0)),
                    "price_change_24h": float(best.get("priceChange", {}).get("h24", 0)),
                    "volume_24h": float(best.get("volume", {}).get("h24", 0)),
                    "liquidity": float(best.get("liquidity", {}).get("usd", 0)),
                    "timestamp": datetime.now().isoformat()
                }
    except Exception as e:
        print(f"Error fetching {token_address}: {e}")
    return None

def calculate_performance(signal_data, current_data):
    """Calculate performance since signal"""
    if not current_data:
        return None
    
    entry_price = signal_data.get("metrics", {}).get("price_usd", 0)
    current_price = current_data.get("price_usd", 0)
    
    if entry_price > 0 and current_price > 0:
        perf_pct = ((current_price - entry_price) / entry_price) * 100
        return {
            "perf_percent": round(perf_pct, 2),
            "current_price": current_price,
            "entry_price": entry_price,
            "updated_at": datetime.now().isoformat()
        }
    return None

def determine_verdict(perf_data):
    """Determine signal verdict based on performance"""
    if not perf_data:
        return "PENDING"
    
    perf = perf_data.get("perf_percent", 0)
    
    # Simple rules for DRY-RUN phase
    if perf >= 10:
        return "WIN"
    elif perf <= -15:
        return "LOSS"
    else:
        return "NEUTRAL"

def update_tracker():
    """Main update function"""
    tracker = load_json(TRACKER_FILE)
    signal = load_json(SIGNALS_FILE)
    
    # Initialize if empty
    if not tracker:
        tracker = {
            "tracking_schema": "lurker_performance_v1",
            "phase": "DRY-RUN",
            "start_date": datetime.now().strftime("%Y-%m-%d"),
            "target_signals": 20,
            "validation_threshold": {
                "win_rate_percent": 60,
                "min_profit_percent": 10,
                "max_drawdown_percent": 30
            },
            "signals": [],
            "daily_summary": {},
            "decision": {
                "status": "pending",
                "date": None,
                "verdict": None
            }
        }
    
    # Check if we have a posted signal to track
    if signal.get("status") == "posted":
        token = signal.get("token", {})
        token_addr = token.get("address", "")
        
        # Skip dry-run tokens for real tracking
        if token_addr not in ["0xDRYRUN", "0x...", "", None]:
            # Fetch current data
            dex_data = fetch_dexscreener_data(token_addr, signal.get("chain", "base"))
            
            if dex_data:
                # Calculate performance
                perf = calculate_performance(signal, dex_data)
                
                if perf:
                    verdict = determine_verdict(perf)
                    
                    # Check if signal already in tracker
                    existing = next(
                        (s for s in tracker["signals"] if s.get("token") == token.get("symbol")),
                        None
                    )
                    
                    signal_entry = {
                        "date": signal.get("ts_utc", datetime.now().isoformat()),
                        "token": token.get("symbol", "UNKNOWN"),
                        "address": token_addr,
                        "entry_price": perf["entry_price"],
                        "current_price": perf["current_price"],
                        "perf_percent": perf["perf_percent"],
                        "verdict": verdict,
                        "confidence": signal.get("scores", {}).get("confidence", 0),
                        "updated_at": perf["updated_at"]
                    }
                    
                    if existing:
                        # Update existing
                        idx = tracker["signals"].index(existing)
                        tracker["signals"][idx] = signal_entry
                        print(f"[TRACKER] Updated {token['symbol']}: {perf['perf_percent']:+.2f}% ({verdict})")
                    else:
                        # Add new
                        tracker["signals"].append(signal_entry)
                        print(f"[TRACKER] Added {token['symbol']}: {perf['perf_percent']:+.2f}% ({verdict})")
                    
                    # Update summary stats
                    signals = tracker["signals"]
                    wins = sum(1 for s in signals if s.get("verdict") == "WIN")
                    losses = sum(1 for s in signals if s.get("verdict") == "LOSS")
                    total = len(signals)
                    
                    tracker["daily_summary"] = {
                        "total_signals": total,
                        "wins": wins,
                        "losses": losses,
                        "win_rate": round((wins / total * 100), 1) if total > 0 else 0,
                        "avg_perf": round(sum(s.get("perf_percent", 0) for s in signals) / total, 2) if total > 0 else 0,
                        "last_updated": datetime.now().isoformat()
                    }
                    
                    # Check if we've hit target for decision
                    if total >= tracker["target_signals"] and tracker["decision"]["status"] == "pending":
                        win_rate = tracker["daily_summary"]["win_rate"]
                        threshold = tracker["validation_threshold"]["win_rate_percent"]
                        
                        if win_rate >= threshold:
                            tracker["decision"] = {
                                "status": "ready_to_launch",
                                "date": datetime.now().isoformat(),
                                "verdict": f"Win rate {win_rate}% >= {threshold}%. Token LURKER validated for launch."
                            }
                            print(f"[DECISION] ✅ READY TO LAUNCH: {win_rate}% win rate achieved!")
                        else:
                            tracker["decision"] = {
                                "status": "needs_improvement",
                                "date": datetime.now().isoformat(),
                                "verdict": f"Win rate {win_rate}% < {threshold}%. Continue testing or adjust strategy."
                            }
                            print(f"[DECISION] ⚠️ NEEDS IMPROVEMENT: {win_rate}% win rate below threshold.")
            else:
                print(f"[TRACKER] No DexScreener data for {token.get('symbol', 'UNKNOWN')}")
        else:
            print(f"[TRACKER] Skipping dry-run token {token.get('symbol', 'UNKNOWN')}")
    else:
        print("[TRACKER] No posted signal to track")
    
    # Save tracker
    save_json(TRACKER_FILE, tracker)
    print("[TRACKER] Saved successfully")

if __name__ == "__main__":
    update_tracker()
