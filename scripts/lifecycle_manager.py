#!/usr/bin/env python3
"""
LURKER Token Lifecycle Manager
Gère les tokens sur 72h avec badges et catégories évolutives
"""
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional

# Fichiers
CIO_FEED = Path("signals/cio_feed.json")
WATCH_FEED = Path("signals/watch_feed.json")  
LIFECYCLE_FEED = Path("signals/lifecycle_feed.json")
ALERTS_FILE = Path("state/volume_alerts.json")

def load_json(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {"candidates": [], "meta": {}}

def save_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def distribute_to_category_feeds(tokens: list):
    """Distribue les tokens dans les feeds de catégories appropriés"""
    feeds = {
        "CIO": {"candidates": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat(), "count": 0}},
        "WATCH": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        "HOTLIST": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        "FAST_CERTIFIED": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        "CERTIFIED": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    }
    
    for token in tokens:
        cat = token.get('category', 'UNKNOWN')
        
        # Mapping des catégories vers les noms de fichiers
        if cat == "CIO":
            feeds["CIO"]["candidates"].append(token)
        elif cat == "WATCH":
            feeds["WATCH"]["tokens"].append(token)
        elif cat == "HOTLIST":
            feeds["HOTLIST"]["tokens"].append(token)
        elif cat in ["ACTIVE", "MONITORING"]:
            # 24-72h → fast_certified
            feeds["FAST_CERTIFIED"]["tokens"].append(token)
        elif cat in ["MATURE", "ARCHIVED"]:
            # 72h+ → certified
            feeds["CERTIFIED"]["tokens"].append(token)
    
    # Update meta counts
    feeds["CIO"]["meta"]["count"] = len(feeds["CIO"]["candidates"])
    
    # Sauvegarder chaque feed
    for cat_name, data in feeds.items():
        if cat_name == "CIO":
            # Save to both locations for compatibility
            save_json(Path("data/signals/cio_feed.json"), data)
            save_json(Path("signals/cio_feed.json"), data)  # For dashboard
        elif cat_name == "WATCH":
            save_json(Path("data/signals/watch_feed.json"), data)
            save_json(Path("signals/watch_feed.json"), data)
        elif cat_name == "HOTLIST":
            save_json(Path("data/signals/hotlist_feed.json"), data)
            save_json(Path("signals/hotlist_feed.json"), data)
        elif cat_name == "FAST_CERTIFIED":
            save_json(Path("data/signals/fast_certified_feed.json"), data)
            save_json(Path("signals/fast_certified_feed.json"), data)
        elif cat_name == "CERTIFIED":
            save_json(Path("data/signals/certified_feed.json"), data)
            save_json(Path("signals/certified_feed.json"), data)
        
        count = len(data.get('candidates', data.get('tokens', [])))
        print(f"   📁 {cat_name}: {count} tokens")

def recalculate_age(token_data: dict) -> float:
    """Recalcule l'âge du token en heures depuis maintenant"""
    timestamps = token_data.get('timestamps', {})
    first_seen = timestamps.get('token_first_seen')
    
    if first_seen:
        try:
            # Parse ISO timestamp
            first_dt = datetime.fromisoformat(first_seen.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            age_hours = (now - first_dt).total_seconds() / 3600
            
            # Met à jour les timestamps
            timestamps['age_hours'] = round(age_hours, 2)
            timestamps['age_minutes'] = round(age_hours * 60, 1)
            
            return age_hours
        except:
            pass
    
    return timestamps.get('age_hours', 0)

def calculate_badges(token_data: dict) -> List[str]:
    """Calcule les badges selon les métriques"""
    badges = []
    metrics = token_data.get('metrics', {})
    
    # Recalculer l'âge dynamiquement
    age_hours = recalculate_age(token_data)
    
    # Âge
    if age_hours < 2:
        badges.append("🆕 NEW")
    elif age_hours < 6:
        badges.append("🔥 HOT")
    elif age_hours < 24:
        badges.append("⚡ TRENDING")
    else:
        badges.append("🌊 ESTABLISHED")
    
    # Performance volume
    vol_1h = metrics.get('vol_1h_usd', 0)
    liq = metrics.get('liq_usd', 1)
    vol_ratio = vol_1h / liq if liq > 0 else 0
    
    if vol_ratio > 2.0:
        badges.append("📈 HIGH_VOLUME")
    elif vol_ratio > 1.0:
        badges.append("💫 ACTIVE")
    
    # Liquidité
    if liq > 100000:
        badges.append("💎 HIGH_LIQ")
    elif liq > 50000:
        badges.append("💧 GOOD_LIQ")
    
    # Risque
    risk = token_data.get('risk_level', 'low')
    if risk == 'high':
        badges.append("⚠️ HIGH_RISK")
    elif risk == 'medium':
        badges.append("🔍 WATCH")
    
    return badges

def calculate_category(token_data: dict) -> str:
    """Détermine la catégorie du token sur 7 jours"""
    age_hours = token_data.get('timestamps', {}).get('age_hours', 0)
    metrics = token_data.get('metrics', {})
    liq = metrics.get('liq_usd', 0)
    vol_1h = metrics.get('vol_1h_usd', 0)
    
    # CIO: 0-2h (ultra fresh)
    if age_hours < 2:
        return "CIO"
    
    # WATCH: 2-6h
    if age_hours < 6:
        return "WATCH"
    
    # HOTLIST: 6-24h
    if age_hours < 24:
        return "HOTLIST"
    
    # ACTIVE: 24-72h avec volume
    if age_hours < 72:
        if vol_1h > 1000:
            return "ACTIVE"
        else:
            return "MONITORING"
    
    # MATURE: 3-7 jours
    if age_hours < 168:
        return "MATURE"
    
    return "ARCHIVED"

def check_volume_spike(old_data: dict, new_data: dict) -> Optional[dict]:
    """Détecte un spike de volume entre deux scans"""
    old_vol = old_data.get('metrics', {}).get('vol_1h_usd', 0)
    new_vol = new_data.get('metrics', {}).get('vol_1h_usd', 0)
    
    if old_vol > 0 and new_vol > 0:
        spike_ratio = new_vol / old_vol
        if spike_ratio > 2.0:  # +100% de volume
            return {
                "type": "volume_spike",
                "token": new_data['token']['symbol'],
                "old_volume": old_vol,
                "new_volume": new_vol,
                "spike_ratio": spike_ratio,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
    return None

def check_dump_warning(token_data: dict) -> Optional[dict]:
    """Détecte un dump potentiel"""
    metrics = token_data.get('metrics', {})
    risks = token_data.get('risks', [])
    
    if 'dumping' in risks or 'rapid_price_drop' in risks:
        return {
            "type": "dump_warning",
            "token": token_data['token']['symbol'],
            "risk_factors": risks,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    return None

def update_lifecycle():
    """Met à jour le feed lifecycle avec tous les tokens actifs"""
    cio = load_json(CIO_FEED)
    lifecycle = load_json(LIFECYCLE_FEED)
    
    # Tokens actuels
    current_tokens = {t['token']['address']: t for t in cio.get('candidates', [])}
    
    # Charger l'historique
    old_lifecycle = {t['token']['address']: t for t in lifecycle.get('candidates', [])}
    
    updated = []
    alerts = []
    
    for addr, token in current_tokens.items():
        # Calculer badges et catégorie
        token['badges'] = calculate_badges(token)
        token['category'] = calculate_category(token)
        
        # Vérifier changements
        if addr in old_lifecycle:
            old = old_lifecycle[addr]
            
            # Check volume spike
            spike = check_volume_spike(old, token)
            if spike:
                alerts.append(spike)
                token['alert'] = "VOLUME_SPIKE"
            
            # Check changement de catégorie
            old_cat = old.get('category', '')
            new_cat = token['category']
            if old_cat != new_cat:
                token['category_change'] = f"{old_cat} → {new_cat}"
        
        # Check dump
        dump = check_dump_warning(token)
        if dump:
            alerts.append(dump)
            token['alert'] = "DUMP_WARNING"
        
        updated.append(token)
    
    # Sauvegarder
    lifecycle['candidates'] = updated
    lifecycle['meta'] = {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'count': len(updated),
        'alerts_count': len(alerts)
    }
    
    save_json(LIFECYCLE_FEED, lifecycle)
    
    # Sauvegarder alertes
    if alerts:
        existing = load_json(ALERTS_FILE)
        if 'alerts' not in existing:
            existing['alerts'] = []
        existing['alerts'].extend(alerts)
        save_json(ALERTS_FILE, existing)
        
        print(f"🚨 {len(alerts)} alertes générées")
        for a in alerts:
            print(f"   - {a['type']}: {a.get('token', 'N/A')}")
    
    print(f"✅ Lifecycle mis à jour: {len(updated)} tokens")
    
    # Afficher répartition
    cats = {}
    for t in updated:
        cat = t.get('category', 'UNKNOWN')
        cats[cat] = cats.get(cat, 0) + 1
    
    print("\n📊 Répartition:")
    for cat, count in sorted(cats.items()):
        print(f"   {cat}: {count}")
    
    # Distribuer dans les feeds de catégories
    print("\n🔄 Distribution dans les feeds:")
    distribute_to_category_feeds(updated)

if __name__ == "__main__":
    print("="*60)
    print("LURKER Token Lifecycle Manager")
    print("="*60)
    update_lifecycle()
