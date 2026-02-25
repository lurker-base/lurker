#!/usr/bin/env python3
"""
V2 Analyzer - Analyse des tokens et détection pump/dump
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

STATE_FILE = Path(__file__).parent.parent / "state" / "tokens.json"

# Seuils
PUMP_THRESHOLD = 50      # +50%
DUMP_THRESHOLD = -30     # -30%
RUG_LIQUIDITY = 0        # $0 = rug
MIN_LIQUIDITY_ACTIVE = 3000  # <$3k = suspect

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return None

def save_state(state):
    state["meta"]["last_analyze"] = datetime.now(timezone.utc).isoformat()
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def calculate_age_hours(detected_at):
    """Calcule l'âge en heures"""
    try:
        dt = datetime.fromisoformat(detected_at.replace('Z', '+00:00'))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    except:
        return 0

def calculate_performance(token):
    """Calcule la performance depuis la détection"""
    current_price = token.get("metrics", {}).get("price_usd", 0)
    
    # Historique des prix si disponible
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
    if max_gain >= PUMP_THRESHOLD:
        status = "pumping"
    elif current_gain <= DUMP_THRESHOLD:
        status = "dumping"
    else:
        status = "stable"
    
    return {
        "max_gain": round(max_gain, 1),
        "current_gain": round(current_gain, 1),
        "status": status
    }

def determine_category(token):
    """Détermine la catégorie selon l'âge"""
    age = calculate_age_hours(token.get("detected_at"))
    
    if age < 0.17:      # < 10 min
        return "CIO"
    elif age < 0.5:    # < 30 min
        return "WATCH"
    elif age < 1:      # < 1h
        return "HOTLIST"
    elif age < 24:     # < 24h
        return "FAST"
    else:              # > 24h
        return "CERTIFIED"

def assess_risk(token):
    """Évalue le risque du token"""
    metrics = token.get("metrics", {})
    liq = metrics.get("liq_usd", 0)
    performance = token.get("performance", {})
    current_gain = performance.get("current_gain", 0)
    max_gain = performance.get("max_gain", 0)
    
    factors = []
    level = "low"
    
    # Rug = liquidité 0
    if liq == 0:
        level = "critical"
        factors.append("rug_detected")
    elif liq < MIN_LIQUIDITY_ACTIVE:
        level = "high"
        factors.append("low_liquidity")
    
    # Dump sévère
    if current_gain <= -85:
        level = "critical"
        factors.append("severe_dump")
    elif current_gain <= DUMP_THRESHOLD:
        level = "medium"
        factors.append("dumping")
    
    # Pump & Dump
    if max_gain > 100 and current_gain < -25:
        level = "high"
        factors.append("pump_and_dump")
    
    return {"level": level, "factors": factors}

def analyze_token(token):
    """Analyse complète d'un token"""
    # Calculer performance
    token["performance"] = calculate_performance(token)
    
    # Déterminer catégorie
    token["category"] = determine_category(token)
    
    # Évaluer risque
    token["risk"] = assess_risk(token)
    
    return token

def main():
    print("="*60)
    print("LURKER V2 - Analyzer")
    print("="*60)
    
    state = load_state()
    if not state:
        print("❌ No state found")
        return
    
    total = len(state["tokens"])
    print(f"Analyzing {total} tokens...")
    
    categories = {"CIO": 0, "WATCH": 0, "HOTLIST": 0, "FAST": 0, "CERTIFIED": 0, "RUGGED": 0}
    
    for addr, token in state["tokens"].items():
        # Analyser
        token = analyze_token(token)
        
        # Si rug, forcer catégorie
        if token["risk"]["level"] == "critical":
            token["category"] = "RUGGED"
            categories["RUGGED"] += 1
        else:
            categories[token["category"]] += 1
        
        state["tokens"][addr] = token
    
    # Sauvegarder
    save_state(state)
    
    print("\n📊 Distribution:")
    for cat, count in categories.items():
        if count > 0:
            print(f"  {cat}: {count}")
    
    print("="*60)

if __name__ == "__main__":
    main()
