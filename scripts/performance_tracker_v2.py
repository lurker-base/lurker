#!/usr/bin/env python3
"""
LURKER Post-Signal Performance Tracker v2.0
Tracks performance of all signaled tokens over time
"""
import json
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional

# Config
PERFORMANCE_DIR = Path(__file__).parent.parent / "signals" / "performance"
CIO_FEED_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
REGISTRY_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"

# Performance tracking settings
TRACKING_DURATION_HOURS = 72  # Track for 3 days
PRICE_CHECK_INTERVAL_MINUTES = 30  # Check price every 30 min


def load_json(path: Path, default=None):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def fetch_token_price(token_address: str, chain: str = "base") -> Optional[Dict]:
    """Fetch current token price and metrics from DexScreener"""
    if not token_address or len(token_address) < 10:
        return None
    
    try:
        url = f"https://api.dexscreener.com/latest/dex/tokens/{token_address}"
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            return None
        
        data = resp.json()
        pairs = data.get("pairs", [])
        if not pairs:
            return None
        
        # Get best pair by liquidity
        best = max(pairs, key=lambda x: float(x.get("liquidity", {}).get("usd", 0) or 0))
        
        return {
            "price_usd": float(best.get("priceUsd", 0) or 0),
            "price_change_24h": float(best.get("priceChange", {}).get("h24", 0) or 0),
            "volume_24h": float(best.get("volume", {}).get("h24", 0) or 0),
            "liquidity": float(best.get("liquidity", {}).get("usd", 0) or 0),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "pair_address": best.get("pairAddress", ""),
            "dex": best.get("dexId", ""),
        }
    except Exception as e:
        print(f"[PERF] Error fetching {token_address}: {e}")
        return None


def calculate_performance_metrics(price_history: List[Dict]) -> Dict:
    """Calculate performance metrics from price history"""
    if not price_history or len(price_history) < 1:
        return {}
    
    entry_price = price_history[0].get("price_usd", 0)
    if entry_price == 0:
        return {}
    
    current_price = price_history[-1].get("price_usd", 0)
    prices = [p.get("price_usd", 0) for p in price_history if p.get("price_usd", 0) > 0]
    
    if not prices:
        return {}
    
    max_price = max(prices)
    min_price = min(prices)
    
    # Calculate gains
    current_gain = ((current_price - entry_price) / entry_price) * 100
    max_gain = ((max_price - entry_price) / entry_price) * 100
    min_gain = ((min_price - entry_price) / entry_price) * 100
    
    # Determine status
    if max_gain >= 50 and current_gain < max_gain * 0.5:
        status = "pump_dump"
    elif max_gain >= 100:
        status = "mooned"
    elif current_gain >= 50:
        status = "pumping"
    elif current_gain <= -50:
        status = "rugged"
    elif current_gain <= -30:
        status = "dumping"
    elif current_gain >= 10:
        status = "profitable"
    elif current_gain <= -10:
        status = "losing"
    else:
        status = "stable"
    
    # Calculate time since signal
    first_ts = datetime.fromisoformat(price_history[0].get("timestamp", "").replace('Z', '+00:00'))
    hours_since_signal = (datetime.now(timezone.utc) - first_ts).total_seconds() / 3600
    
    return {
        "entry_price": entry_price,
        "current_price": current_price,
        "max_price": max_price,
        "min_price": min_price,
        "current_gain_pct": round(current_gain, 2),
        "max_gain_pct": round(max_gain, 2),
        "min_gain_pct": round(min_gain, 2),
        "status": status,
        "hours_tracked": round(hours_since_signal, 1),
        "price_checks": len(price_history),
    }


def get_verdict(metrics: Dict) -> str:
    """Determine signal verdict based on performance"""
    status = metrics.get("status", "")
    current_gain = metrics.get("current_gain_pct", 0)
    max_gain = metrics.get("max_gain_pct", 0)
    hours = metrics.get("hours_tracked", 0)
    
    # Early exit conditions
    if status == "rugged" and current_gain <= -70:
        return "RUG"  # Confirmed rug
    
    if status == "mooned" and current_gain >= 100:
        return "MOON"  # 100%+ gain
    
    if hours < 6:
        return "TRACKING"  # Too early to call
    
    # Mid-tracking verdicts
    if current_gain >= 20:
        return "WINNING"
    elif current_gain >= 10:
        return "PROFIT"
    elif current_gain <= -30:
        return "FAIL"
    elif current_gain <= -15:
        return "LOSING"
    
    return "NEUTRAL"


def track_signal_performance(token_data: Dict) -> Optional[Dict]:
    """Track performance for a single token signal"""
    token = token_data.get("token", {})
    token_addr = token.get("address", "").lower()
    symbol = token.get("symbol", "UNKNOWN")
    
    if not token_addr or token_addr in ["0x...", "0xdryrun"]:
        return None
    
    # Load existing tracking data
    perf_file = PERFORMANCE_DIR / f"{token_addr}.json"
    tracking = load_json(perf_file, {
        "token_address": token_addr,
        "symbol": symbol,
        "name": token.get("name", ""),
        "first_seen": token_data.get("timestamps", {}).get("token_first_seen", datetime.now(timezone.utc).isoformat()),
        "price_history": [],
        "metrics": {},
    })
    
    # Check if tracking expired (>72h)
    first_seen = datetime.fromisoformat(tracking["first_seen"].replace('Z', '+00:00'))
    age_hours = (datetime.now(timezone.utc) - first_seen).total_seconds() / 3600
    
    if age_hours > TRACKING_DURATION_HOURS:
        tracking["status"] = "expired"
        save_json(perf_file, tracking)
        return tracking
    
    # Fetch current price
    current_data = fetch_token_price(token_addr)
    if not current_data:
        tracking["last_error"] = "price_fetch_failed"
        tracking["last_error_at"] = datetime.now(timezone.utc).isoformat()
        save_json(perf_file, tracking)
        return tracking
    
    # Add to price history
    tracking["price_history"].append(current_data)
    
    # Limit history size
    if len(tracking["price_history"]) > 200:
        tracking["price_history"] = tracking["price_history"][-200:]
    
    # Calculate metrics
    tracking["metrics"] = calculate_performance_metrics(tracking["price_history"])
    tracking["metrics"]["verdict"] = get_verdict(tracking["metrics"])
    tracking["last_updated"] = datetime.now(timezone.utc).isoformat()
    tracking["status"] = "tracking"
    
    # Save
    save_json(perf_file, tracking)
    
    return tracking


def generate_performance_summary() -> Dict:
    """Generate summary of all tracked signals"""
    if not PERFORMANCE_DIR.exists():
        return {"count": 0, "signals": []}
    
    all_signals = []
    verdicts = {"WINNING": 0, "PROFIT": 0, "MOON": 0, "NEUTRAL": 0, "LOSING": 0, "FAIL": 0, "RUG": 0, "TRACKING": 0}
    
    for perf_file in PERFORMANCE_DIR.glob("*.json"):
        try:
            tracking = load_json(perf_file)
            if not tracking or "metrics" not in tracking:
                continue
            
            metrics = tracking["metrics"]
            verdict = metrics.get("verdict", "TRACKING")
            verdicts[verdict] = verdicts.get(verdict, 0) + 1
            
            summary = {
                "token_address": tracking["token_address"],
                "symbol": tracking["symbol"],
                "verdict": verdict,
                "current_gain_pct": metrics.get("current_gain_pct", 0),
                "max_gain_pct": metrics.get("max_gain_pct", 0),
                "status": metrics.get("status", ""),
                "hours_tracked": metrics.get("hours_tracked", 0),
                "entry_price": metrics.get("entry_price", 0),
                "current_price": metrics.get("current_price", 0),
            }
            all_signals.append(summary)
        except Exception as e:
            print(f"[PERF] Error processing {perf_file}: {e}")
    
    # Calculate win rate (excluding tracking)
    decided = verdicts["WINNING"] + verdicts["PROFIT"] + verdicts["MOON"] + verdicts["NEUTRAL"] + verdicts["LOSING"] + verdicts["FAIL"] + verdicts["RUG"]
    wins = verdicts["WINNING"] + verdicts["PROFIT"] + verdicts["MOON"]
    win_rate = (wins / decided * 100) if decided > 0 else 0
    
    # Sort by current gain
    all_signals.sort(key=lambda x: x["current_gain_pct"], reverse=True)
    
    summary = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "total_tracked": len(all_signals),
        "verdicts": verdicts,
        "win_rate": round(win_rate, 1),
        "decided_signals": decided,
        "top_performers": [s for s in all_signals if s["current_gain_pct"] > 0][:10],
        "worst_performers": [s for s in all_signals if s["current_gain_pct"] < 0][-5:],
        "recent_signals": sorted(all_signals, key=lambda x: x["hours_tracked"])[:10],
        "all_signals": all_signals,
    }
    
    return summary


def update_performance_feed():
    """Main function to update performance tracking"""
    print("=" * 60)
    print("LURKER Post-Signal Performance Tracker v2.0")
    print("=" * 60)
    
    # Load current CIO feed to get active signals
    cio_feed = load_json(CIO_FEED_FILE, {"candidates": []})
    candidates = cio_feed.get("candidates", [])
    
    print(f"[PERF] Processing {len(candidates)} candidates from CIO feed...")
    
    tracked_count = 0
    for candidate in candidates:
        result = track_signal_performance(candidate)
        if result:
            tracked_count += 1
            metrics = result.get("metrics", {})
            verdict = metrics.get("verdict", "TRACKING")
            gain = metrics.get("current_gain_pct", 0)
            print(f"  [{verdict:8s}] {result['symbol']:12s} {gain:+7.1f}% ({metrics.get('hours_tracked', 0):.1f}h)")
    
    print(f"\n[PERF] Tracked {tracked_count} signals")
    
    # Generate and save summary
    summary = generate_performance_summary()
    summary_file = PERFORMANCE_DIR.parent / "performance_summary.json"
    save_json(summary_file, summary)
    
    print(f"\n[PERF] Summary saved ({summary['total_tracked']} total tracked)")
    print(f"[PERF] Win rate: {summary['win_rate']:.1f}% ({summary['verdicts'].get('WINNING', 0) + summary['verdicts'].get('PROFIT', 0) + summary['verdicts'].get('MOON', 0)} wins / {summary['decided_signals']} decided)")
    print(f"[PERF] Top performer: {summary['top_performers'][0]['symbol'] if summary['top_performers'] else 'N/A'} ({summary['top_performers'][0]['current_gain_pct']:.1f}%)")
    print("=" * 60)
    
    return summary


if __name__ == "__main__":
    update_performance_feed()
