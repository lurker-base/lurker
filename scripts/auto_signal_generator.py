#!/usr/bin/env python3
"""
LURKER Auto Signal Generator
Génère automatiquement des signaux quand des tokens en base montent ou baissent fortement
"""

import json
import time
import requests
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path("/data/.openclaw/workspace/lurker-project")
TOKENS_FILE = BASE_DIR / "tokens" / "base.json"
SIGNALS_DIR = BASE_DIR / "signals"
LOG_FILE = BASE_DIR / "logs" / "auto_signals.log"

# Seuils pour les signaux
PUMP_THRESHOLD = 0.20      # +20%
DUMP_THRESHOLD = -0.15     # -15%
VOLUME_MULTIPLIER = 2.0    # Volume 2x moyenne

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{timestamp}] {msg}"
    print(log_msg)
    with open(LOG_FILE, "a") as f:
        f.write(log_msg + "\n")

def load_tokens():
    """Load token database"""
    if not TOKENS_FILE.exists():
        return {}
    try:
        with open(TOKENS_FILE) as f:
            return json.load(f)
    except:
        return {}

def save_token(token_id, data):
    """Save token data"""
    TOKENS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tokens = load_tokens()
    tokens[token_id] = data
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)

def get_token_price(token_address):
    """Get current price from DexScreener — also resolves symbol/name"""
    try:
        url = f"https://api.dexscreener.com/latest/dex/tokens/{token_address}"
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            pairs = data.get("pairs", [])
            if pairs:
                # Get best pair by volume
                best = max(pairs, key=lambda x: float(x.get("volume", {}).get("h24", 0) or 0))
                
                # Resolve token symbol and name from pair data
                base_token = best.get("baseToken", {})
                resolved_symbol = base_token.get("symbol", "UNKNOWN")
                resolved_name = base_token.get("name", "Unknown")
                
                # Buy/Sell data for pressure analysis
                txns_1h = best.get("txns", {}).get("h1", {})
                buys_1h = txns_1h.get("buys", 0) or 0
                sells_1h = txns_1h.get("sells", 0) or 0
                
                liq = float(best.get("liquidity", {}).get("usd", 0) or 0)
                vol_1h = float(best.get("volume", {}).get("h1", 0) or 0)
                
                return {
                    "price": float(best.get("priceUsd", 0) or 0),
                    "volume24h": float(best.get("volume", {}).get("h24", 0) or 0),
                    "volume1h": vol_1h,
                    "liquidity": liq,
                    "priceChange": float(best.get("priceChange", {}).get("h24", 0) or 0),
                    "pair": best.get("pairAddress"),
                    "symbol": resolved_symbol,
                    "name": resolved_name,
                    "buys_1h": buys_1h,
                    "sells_1h": sells_1h,
                    "vol_liq_ratio": round(vol_1h / liq, 3) if liq > 0 else 0,
                }
    except Exception as e:
        log(f"Error fetching price: {e}")
    return None

def generate_signal(token_id, token_data, current_data, signal_type):
    """Generate signal file"""
    # Use resolved symbol from DexScreener if available, fallback to stored
    symbol = current_data.get("symbol") or token_data.get("symbol", "UNKNOWN")
    name = current_data.get("name") or token_data.get("name", "Unknown")
    
    # Skip signals for unresolved tokens — reduces noise
    if symbol in ("UNKNOWN", "Unknown", ""):
        log(f"⏭️ Skipping {signal_type} for unresolved token {token_id[:16]}...")
        return
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    signal_file = SIGNALS_DIR / f"{signal_type}_{symbol}_{timestamp}.json"
    
    SIGNALS_DIR.mkdir(parents=True, exist_ok=True)
    
    signal = {
        "type": signal_type,  # PUMP ou DUMP
        "token_id": token_id,
        "symbol": symbol,
        "name": name,
        "price_usd": current_data["price"],
        "price_change_24h": current_data["priceChange"],
        "volume_24h": current_data["volume24h"],
        "volume_1h": current_data.get("volume1h", 0),
        "liquidity_usd": current_data["liquidity"],
        "vol_liq_ratio": current_data.get("vol_liq_ratio", 0),
        "buys_1h": current_data.get("buys_1h", 0),
        "sells_1h": current_data.get("sells_1h", 0),
        "detected_at": datetime.now().isoformat(),
        "dexscreener_url": f"https://dexscreener.com/base/{token_id}",
        "alert_message": f"🚨 {signal_type} ALERT: ${symbol} "
                        f"${current_data['price']:.6f} "
                        f"({current_data['priceChange']:+.1f}%)"
    }
    
    with open(signal_file, "w") as f:
        json.dump(signal, f, indent=2)
    
    log(f"✅ {signal_type} SIGNAL: {token_data.get('symbol', 'TOKEN')} "
        f"${current_data['price']:.6f} ({current_data['priceChange']:+.1f}%)")
    
    # Telegram alert (if configured)
    try:
        import sys
        sys.path.insert(0, str(BASE_DIR / ".." / "polymarket" / "bin"))
        from pm_scout_pro import telegram_send
        telegram_send({}, signal["alert_message"], is_important=True)
    except:
        pass  # Telegram not critical

def check_all_tokens():
    """Check all tokens for pump/dump signals"""
    tokens = load_tokens()
    
    if not tokens:
        log("No tokens in database")
        return
    
    log(f"Checking {len(tokens)} tokens...")
    
    for token_id, token_data in tokens.items():
        try:
            # Skip if checked recently (last 1 hour)
            last_check = token_data.get("last_check", 0)
            if time.time() - last_check < 3600:
                continue
            
            # Get current data
            current = get_token_price(token_id)
            if not current:
                continue
            
            # Update last check and resolve symbol if missing
            token_data["last_check"] = time.time()
            if current.get("symbol") and token_data.get("symbol") in ("UNKNOWN", None, ""):
                token_data["symbol"] = current["symbol"]
                token_data["name"] = current.get("name", token_data.get("name", "Unknown"))
                log(f"📝 Resolved symbol: {current['symbol']} for {token_id[:16]}...")
            token_data["price_history"] = token_data.get("price_history", [])
            token_data["price_history"].append({
                "timestamp": time.time(),
                "price": current["price"],
                "change": current["priceChange"]
            })
            # Keep only last 24h
            token_data["price_history"] = [
                h for h in token_data["price_history"]
                if time.time() - h["timestamp"] < 86400
            ]
            
            save_token(token_id, token_data)
            
            # Check for signals
            price_change = current["priceChange"]
            
            if price_change >= PUMP_THRESHOLD * 100:  # DexScreener returns %
                if not token_data.get("pump_signal_sent"):
                    generate_signal(token_id, token_data, current, "PUMP")
                    token_data["pump_signal_sent"] = True
                    save_token(token_id, token_data)
                    
            elif price_change <= DUMP_THRESHOLD * 100:
                if not token_data.get("dump_signal_sent"):
                    generate_signal(token_id, token_data, current, "DUMP")
                    token_data["dump_signal_sent"] = True
                    save_token(token_id, token_data)
            
            # Reset signals if price stabilizes
            elif abs(price_change) < 5:
                token_data["pump_signal_sent"] = False
                token_data["dump_signal_sent"] = False
                save_token(token_id, token_data)
                
        except Exception as e:
            log(f"Error checking {token_id}: {e}")
    
    log("Check complete")

if __name__ == "__main__":
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    log("=" * 50)
    log("LURKER Auto Signal Generator Started")
    log("=" * 50)
    
    while True:
        try:
            check_all_tokens()
        except Exception as e:
            log(f"Main loop error: {e}")
        
        log("Sleeping 10 minutes...")
        time.sleep(600)  # Check every 10 minutes
