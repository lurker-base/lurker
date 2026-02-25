#!/usr/bin/env python3
"""
LURKER Core - Lifecycle Manager
Gestion des tokens CIO → WATCH → HOTLIST → CERTIFIED → RUGGED
Logique simplifiée de lifecycle_manager.py
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

STATE_FILE = Path(__file__).parent.parent / "state" / "lurker_state.json"

# Seuils (à externaliser dans config.yaml)
THRESHOLDS = {
    "cio_max_age": 10,        # minutes
    "watch_max_age": 30,      # minutes
    "hotlist_max_age": 60,    # minutes
    "fast_max_age": 1440,     # minutes (24h)
    "certified_min_age": 1440, # minutes (24h)
    "rug_liq": 0,             # $0 = rug
    "min_liq_active": 3000,   # <$3k = suspect
}

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return None

def save_state(state):
    state["meta"]["last_lifecycle"] = datetime.now(timezone.utc).isoformat()
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def calculate_age_minutes(detected_at):
    try:
        dt = datetime.fromisoformat(detected_at.replace('Z', '+00:00'))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 60
    except:
        return 0

def calculate_performance(token):
    """Calcule gain max et actuel"""
    current_price = token.get("metrics", {}).get("price_usd", 0)
    history = token.get("price_history", [])
    
    if history:
        first_price = history[0].get("price", current_price)
        max_price = max(p.get("price", 0) for p in history)
    else:
        first_price = current_price
        max_price = current_price
    
    if first_price == 0:
        return {"max_gain": 0, "current_gain": 0, "status": "unknown"}
    
    max_gain = ((max_price - first_price) / first_price) * 100
    current_gain = ((current_price - first_price) / first_price) * 100
    
    # Status
    if max_gain >= 100 and current_gain < max_gain * 0.75:
        status = "pump_dump"
    elif max_gain >= 50:
        status = "pumping"
    elif current_gain <= -30:
        status = "dumping"
    else:
        status = "stable"
    
    return {
        "max_gain": round(max_gain, 1),
        "current_gain": round(current_gain, 1),
        "status": status
    }

def determine_category(token):
    """Détermine la catégorie selon l'âge et les métriques"""
    age = calculate_age_minutes(token.get("detected_at"))
    metrics = token.get("metrics", {})
    liq = metrics.get("liq_usd", 0)
    performance = token.get("performance", {})
    status = performance.get("status", "")
    
    # RUGGED si liquidité = 0 ou pattern pump&dump
    if liq == 0 or status == "pump_dump":
        return "RUGGED"
    
    # CIO: < 10 min
    if age < THRESHOLDS["cio_max_age"]:
        return "CIO"
    
    # WATCH: 10-30 min
    if age < THRESHOLDS["watch_max_age"]:
        return "WATCH"
    
    # HOTLIST: 30-60 min
    if age < THRESHOLDS["hotlist_max_age"]:
        return "HOTLIST"
    
    # FAST: 1h-24h
    if age < THRESHOLDS["fast_max_age"]:
        return "FAST"
    
    # CERTIFIED: > 24h et encore actif
    if liq >= THRESHOLDS["min_liq_active"]:
        return "CERTIFIED"
    
    return "ARCHIVED"

def assess_risk(token):
    """Évalue le risque"""
    metrics = token.get("metrics", {})
    liq = metrics.get("liq_usd", 0)
    performance = token.get("performance", {})
    current_gain = performance.get("current_gain", 0)
    
    factors = []
    level = "low"
    
    # Critical
    if liq == 0:
        level = "critical"
        factors.append("rug_detected")
    elif liq < 1000:
        level = "critical"
        factors.append("very_low_liquidity")
    
    # High
    elif liq < THRESHOLDS["min_liq_active"]:
        level = "high"
        factors.append("low_liquidity")
    
    # Medium
    elif current_gain <= -20:
        level = "medium"
        factors.append("declining")
    
    return {"level": level, "factors": factors}

def update_price_history(token):
    """Ajoute le prix actuel à l'historique"""
    if "price_history" not in token:
        token["price_history"] = []
    
    current_price = token.get("metrics", {}).get("price_usd", 0)
    if current_price > 0:
        token["price_history"].append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "price": current_price
        })
        # Garder max 100 points
        token["price_history"] = token["price_history"][-100:]

def process_token(addr, token):
    """Traite un token : maj historique, perf, catégorie, risque"""
    # Update price history
    update_price_history(token)
    
    # Calculate performance
    token["performance"] = calculate_performance(token)
    
    # Determine category
    old_category = token.get("category", "CIO")
    new_category = determine_category(token)
    
    if old_category != new_category:
        print(f"  → {token['symbol']}: {old_category} → {new_category}")
    
    token["category"] = new_category
    
    # Assess risk
    token["risk"] = assess_risk(token)
    
    return token

def generate_stats(state):
    """Génère les stats globales"""
    tokens = state.get("tokens", {})
    categories = {"CIO": 0, "WATCH": 0, "HOTLIST": 0, "FAST": 0, "CERTIFIED": 0, "RUGGED": 0, "ARCHIVED": 0}
    
    for token in tokens.values():
        cat = token.get("category", "CIO")
        categories[cat] = categories.get(cat, 0) + 1
    
    # Pumps/dumps 24h
    pumps = sum(1 for t in tokens.values() if t.get("performance", {}).get("status") == "pumping")
    dumps = sum(1 for t in tokens.values() if t.get("performance", {}).get("status") == "dumping")
    
    state["meta"]["stats"] = {
        "by_category": categories,
        "pumps_24h": pumps,
        "dumps_24h": dumps,
        "rugged": categories.get("RUGGED", 0)
    }
    
    return state

def main():
    print("="*60)
    print("LURKER Core Lifecycle v1.5")
    print("="*60)
    
    state = load_state()
    if not state:
        print("No state found. Run scanner first.")
        return
    
    print(f"Processing {len(state['tokens'])} tokens...")
    
    moved = 0
    for addr, token in state["tokens"].items():
        old_cat = token.get("category")
        state["tokens"][addr] = process_token(addr, token)
        if state["tokens"][addr]["category"] != old_cat:
            moved += 1
    
    # Generate stats
    state = generate_stats(state)
    
    save_state(state)
    
    print(f"\n{'='*60}")
    print(f"Tokens moved: {moved}")
    print(f"Categories: {state['meta']['stats']['by_category']}")
    print("="*60)

if __name__ == "__main__":
    main()
