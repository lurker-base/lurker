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
    "new_max_age": 30,        # minutes (increased from 10)
    "watching_max_age": 60,   # minutes (increased from 30)
    "trending_max_age": 180,  # minutes (increased from 60)
    "active_max_age": 1440,   # minutes (24h)
    "verified_min_age": 1440, # minutes (24h)
    "rug_liq": 0,             # $0 = rug
    "min_liq_active": 3000,   # <$3k = suspect
    "max_inactive_time": 180, # minutes - archive si pas de volume depuis 3h (increased from 60)
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
    current_price = float(token.get("metrics", {}).get("price_usd", 0) or 0)
    history = token.get("price_history", [])
    
    if history:
        first_price = float(history[0].get("price", current_price) or 0)
        max_price = max(float(p.get("price", 0) or 0) for p in history)
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

def clean_badges_for_category(token, new_category):
    """Nettoie les badges selon la catégorie"""
    risk_tags = token.get("risk_tags", [])
    
    if new_category == "RUGGED":
        # Garder seulement badges négatifs
        risk_tags = [tag for tag in risk_tags if any(x in str(tag) for x in ['💀', '⚠️', '📉', 'RUG', 'DUMP', 'COPYCAT'])]
        if '💀 RUGGED' not in risk_tags:
            risk_tags.append('💀 RUGGED')
    
    elif new_category in ["DUMPING"]:
        # Retirer badges positifs pour tokens qui dumpent
        risk_tags = [tag for tag in risk_tags if not any(x in str(tag) for x in ['⚡', '📈', '💧', '💎', '🌊', '💫'])]
        if '📉 DUMPING' not in risk_tags:
            risk_tags.append('📉 DUMPING')
    
    token["risk_tags"] = risk_tags

def get_minutes_since_last_volume(token):
    """Calcule minutes depuis dernier volume significatif"""
    metrics = token.get("metrics", {})
    vol_24h = metrics.get("vol_24h_usd", 0) or 0
    vol_1h = metrics.get("vol_1h_usd", 0) or 0
    
    # Si vol_1h existe et est 0, cela fait 1h qu'il n'y a pas eu de volume
    if "vol_1h_usd" in metrics and vol_1h == 0:
        return 60  # au moins 1h
    
    # Vérifier last_trade_timestamp si disponible
    last_trade = token.get("last_trade_at") or token.get("dexscreener", {}).get("last_trade")
    if last_trade:
        try:
            dt = datetime.fromisoformat(str(last_trade).replace('Z', '+00:00'))
            return (datetime.now(timezone.utc) - dt).total_seconds() / 60
        except:
            pass
    
    return 0  # inconnu, considérer comme actif

def determine_category(token):
    """Détermine la catégorie selon l'âge et les métriques"""
    current_category = token.get("category", "CIO")
    
    # Si déjà RUGGED, ne jamais changer
    if current_category == "RUGGED" or token.get("is_copycat"):
        return "RUGGED"
    
    # Si déjà ARCHIVED, rester ARCHIVED (le scanner peut le re-détecter)
    if current_category == "ARCHIVED":
        return "ARCHIVED"
    
    age = calculate_age_minutes(token.get("detected_at"))
    metrics = token.get("metrics", {})
    liq = metrics.get("liq_usd", 0)
    performance = token.get("performance", {})
    status = performance.get("status", "")
    current_gain = performance.get("current_gain", 0) or 0
    
    # RUGGED si liquidité = 0 ou pattern pump&dump
    if liq == 0 or status == "pump_dump":
        return "RUGGED"
    
    # RUGGED si dumping sévère
    if status == "dumping" and current_gain <= -50:
        return "RUGGED"
    
    # ARCHIVER si pas de volume depuis 1h (pas RUG, juste inactif)
    minutes_since_vol = get_minutes_since_last_volume(token)
    if minutes_since_vol >= THRESHOLDS["max_inactive_time"]:
        return "ARCHIVED"
    
    # NEW: < 10 min
    if age < THRESHOLDS["new_max_age"]:
        return "NEW"
    
    # WATCHING: 10-30 min
    if age < THRESHOLDS["watching_max_age"]:
        return "WATCHING"
    
    # TRENDING: 30-60 min
    if age < THRESHOLDS["trending_max_age"]:
        return "TRENDING"
    
    # ACTIVE: 1h-24h
    if age < THRESHOLDS["active_max_age"]:
        return "ACTIVE"
    
    # VERIFIED: > 24h et encore actif
    if liq >= THRESHOLDS["min_liq_active"]:
        return "VERIFIED"
    
    return "INACTIVE"

def assess_risk(token):
    """Évalue le risque"""
    metrics = token.get("metrics", {})
    liq = metrics.get("liq_usd", 0)
    performance = token.get("performance", {})
    current_gain = performance.get("current_gain", 0)
    age = calculate_age_minutes(token.get("detected_at", datetime.now(timezone.utc).isoformat()))
    
    factors = []
    level = "low"
    
    # Critical - mais pas pour les tokens frais (< 30 min) pour éviter faux positifs
    if liq == 0 and age > 30:
        level = "critical"
        factors.append("rug_detected")
    elif liq < 1000 and age > 10:
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
    
    current_price = float(token.get("metrics", {}).get("price_usd", 0) or 0)
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
        # Nettoyer les badges quand la catégorie change
        clean_badges_for_category(token, new_category)
    
    # Also clean badges if token is dumping (even if category didn't change)
    perf = token.get("performance", {})
    if perf.get("status") == "dumping" or perf.get("current_gain", 0) <= -20:
        clean_badges_for_category(token, "DUMPING")
    
    token["category"] = new_category
    
    # Assess risk
    token["risk"] = assess_risk(token)
    
    return token

def generate_stats(state):
    """Génère les stats globales"""
    tokens = state.get("tokens", {})
    categories = {"NEW": 0, "WATCHING": 0, "TRENDING": 0, "ACTIVE": 0, "VERIFIED": 0, "RUGGED": 0, "ARCHIVED": 0}
    
    for token in tokens.values():
        cat = token.get("category", "NEW")
        categories[cat] = categories.get(cat, 0) + 1
    
    # Pumps/dumps 24h (uniquement tokens actifs)
    active_tokens = [t for t in tokens.values() if t.get("category") not in ["RUGGED", "ARCHIVED"]]
    pumps = sum(1 for t in active_tokens if t.get("performance", {}).get("status") == "pumping")
    dumps = sum(1 for t in active_tokens if t.get("performance", {}).get("status") == "dumping")
    
    state["meta"]["stats"] = {
        "by_category": categories,
        "pumps_24h": pumps,
        "dumps_24h": dumps,
        "rugged": categories.get("RUGGED", 0),
        "archived": categories.get("ARCHIVED", 0),
        "active_total": sum(v for k, v in categories.items() if k not in ["RUGGED", "ARCHIVED"])
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
