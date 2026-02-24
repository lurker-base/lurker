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
HOTLIST_FEED = Path("signals/hotlist_feed.json")
FAST_CERT_FEED = Path("signals/fast_certified_feed.json")
CERTIFIED_FEED = Path("signals/certified_feed.json")
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

def is_token_dead(token: dict) -> bool:
    """Détecte si un token est mort (rug ou abandonné)"""
    metrics = token.get('metrics', {})
    liq = metrics.get('liq_usd', 0)
    vol_1h = metrics.get('vol_1h_usd', 0)
    price_change = metrics.get('price_change_24h', 0)
    
    # Critères de mort/rug
    if liq == 0 and vol_1h == 0:
        return True  # Plus de liquidité, plus de volume
    if liq < 1000 and vol_1h == 0:
        return True  # Liquidité quasi-nulle, mort
    if price_change < -85:  # -85% ou plus
        return True  # Rug confirmé
    
    return False

def distribute_to_category_feeds(tokens: list):
    """Distribue les tokens dans les feeds de catégories appropriés"""
    feeds = {
        "CIO": {"candidates": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat(), "count": 0}},
        "WATCH": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        "HOTLIST": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        "FAST_CERTIFIED": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        "CERTIFIED": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        "ARCHIVED": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        "RUGGED": {"tokens": [], "meta": {"updated_at": datetime.now(timezone.utc).isoformat(), "description": "Tokens with -85% dump or zero liquidity"}},
    }
    
    for token in tokens:
        # Vérifier d'abord si le token est mort/rug
        if is_token_dead(token):
            token['badges'] = token.get('badges', []) + ['💀 RUGGED']
            feeds["RUGGED"]["tokens"].append(token)
            continue
        
        cat = token.get('category', 'UNKNOWN')
        
        # Mapping direct des catégories
        if cat == "CIO":
            feeds["CIO"]["candidates"].append(token)
        elif cat == "WATCH":
            feeds["WATCH"]["tokens"].append(token)
        elif cat == "HOTLIST":
            feeds["HOTLIST"]["tokens"].append(token)
        elif cat == "FAST_CERTIFIED":
            feeds["FAST_CERTIFIED"]["tokens"].append(token)
        elif cat == "CERTIFIED":
            feeds["CERTIFIED"]["tokens"].append(token)
        elif cat == "ARCHIVED":
            feeds["ARCHIVED"]["tokens"].append(token)
    
    # Update meta counts
    feeds["CIO"]["meta"]["count"] = len(feeds["CIO"]["candidates"])
    
    # Sauvegarder chaque feed dans data/signals/ ET signals/ (compatibilité)
    save_locations = {
        "CIO": ["data/signals/cio_feed.json", "signals/cio_feed.json"],
        "WATCH": ["data/signals/watch_feed.json", "signals/watch_feed.json"],
        "HOTLIST": ["data/signals/hotlist_feed.json", "signals/hotlist_feed.json"],
        "FAST_CERTIFIED": ["data/signals/fast_certified_feed.json", "signals/fast_certified_feed.json"],
        "CERTIFIED": ["data/signals/certified_feed.json", "signals/certified_feed.json"],
        "ARCHIVED": ["data/signals/archived_feed.json", "signals/archived_feed.json"],
        "RUGGED": ["data/signals/rugged_feed.json", "signals/rugged_feed.json"],
    }
    
    for cat_name, data in feeds.items():
        for location in save_locations.get(cat_name, []):
            save_json(Path(location), data)
        
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
    # Recalculer l'âge dynamiquement
    age_hours = recalculate_age(token_data)
    metrics = token_data.get('metrics', {})
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
    
    # FAST_CERTIFIED: 24-72h (tous les survivants)
    if age_hours < 72:
        return "FAST_CERTIFIED"
    
    # CERTIFIED: 3-7 jours (72h-168h)
    if age_hours < 168:
        return "CERTIFIED"
    
    # ARCHIVED: 7+ jours
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

REGISTRY_FILE = Path("state/token_registry.json")

def load_registry():
    """Charge le token registry avec tous les tokens vus"""
    if REGISTRY_FILE.exists():
        with open(REGISTRY_FILE) as f:
            return json.load(f)
    return {"tokens": {}}

def registry_to_token_format(registry_data):
    """Convertit les données du registry au format token des feeds"""
    tokens = []
    for addr, data in registry_data.get("tokens", {}).items():
        token_info = data.get("token", {})
        price_history = data.get("price_history", [])
        
        if not token_info or not price_history:
            continue
        
        # Calculer l'âge
        first_seen = data.get("first_seen_iso", "")
        age_hours = 0
        if first_seen:
            try:
                first_dt = datetime.fromisoformat(first_seen.replace('Z', '+00:00'))
                age_hours = (datetime.now(timezone.utc) - first_dt).total_seconds() / 3600
            except:
                pass
        
        # Dernier prix et métriques
        latest = price_history[-1] if price_history else {}
        first = price_history[0] if price_history else {}
        
        # Calculer la performance
        first_price = first.get("price", 0)
        current_price = latest.get("price", 0)
        price_change = ((current_price - first_price) / first_price * 100) if first_price > 0 else 0
        
        token = {
            "token": {
                "address": addr,
                "symbol": token_info.get("symbol", "UNKNOWN"),
                "name": token_info.get("name", "Unknown")
            },
            "metrics": {
                "liq_usd": latest.get("liq", 0),
                "vol_1h_usd": latest.get("vol_5m", 0) * 12,  # Approximation
                "price_usd": current_price,
                "price_change_24h": price_change
            },
            "timestamps": {
                "token_first_seen": first_seen,
                "age_hours": round(age_hours, 2),
                "age_minutes": round(age_hours * 60, 1)
            },
            "price_history": price_history
        }
        tokens.append(token)
    
    return tokens

def update_lifecycle():
    """Met à jour le feed lifecycle avec tous les tokens actifs"""
    # Charger TOUS les feeds pour ne pas perdre de tokens
    cio = load_json(CIO_FEED)
    watch = load_json(WATCH_FEED)
    hotlist = load_json(HOTLIST_FEED)
    fast_cert = load_json(FAST_CERT_FEED)
    certified = load_json(CERTIFIED_FEED)
    lifecycle = load_json(LIFECYCLE_FEED)
    
    # Charger aussi le registry complet
    registry = load_registry()
    registry_tokens = registry_to_token_format(registry)
    
    # Union de tous les tokens de tous les feeds
    all_tokens = {}
    
    # CIO (structure: candidates)
    for t in cio.get('candidates', []):
        addr = t.get('token', {}).get('address')
        if addr:
            all_tokens[addr] = t
    
    # WATCH, HOTLIST, FAST_CERTIFIED, CERTIFIED (structure: tokens)
    for feed in [watch, hotlist, fast_cert, certified]:
        for t in feed.get('tokens', []):
            addr = t.get('token', {}).get('address')
            if addr:
                all_tokens[addr] = t
    
    # Ajouter aussi les tokens du lifecycle précédent
    for t in lifecycle.get('candidates', []):
        addr = t.get('token', {}).get('address')
        if addr and addr not in all_tokens:
            all_tokens[addr] = t
    
    # Ajouter les tokens du registry qui ne sont pas déjà chargés
    for t in registry_tokens:
        addr = t.get('token', {}).get('address')
        if addr and addr not in all_tokens:
            all_tokens[addr] = t
    
    print(f"📊 Total tokens chargés: {len(all_tokens)}")
    print(f"   - CIO: {len(cio.get('candidates', []))}")
    print(f"   - WATCH: {len(watch.get('tokens', []))}")
    print(f"   - HOTLIST: {len(hotlist.get('tokens', []))}")
    print(f"   - Lifecycle précédent: {len(lifecycle.get('candidates', []))}")
    print(f"   - Registry: {len(registry_tokens)}")
    
    current_tokens = all_tokens
    
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
