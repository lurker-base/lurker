#!/usr/bin/env python3
"""
LURKER Core - Migration V1 → V1.5
Migre les tokens des anciens feeds vers le nouveau state unique
"""

import json
from datetime import datetime, timezone
from pathlib import Path

FEEDS = [
    "signals/cio_feed.json",
    "signals/watch_feed.json", 
    "signals/hotlist_feed.json",
    "signals/fast_certified_feed.json",
    "signals/certified_feed.json",
    "signals/rugged_feed.json"
]

def load_feed(path):
    """Charge un feed, gère différents formats"""
    if not Path(path).exists():
        return []
    
    with open(path) as f:
        data = json.load(f)
    
    # Différents formats possibles
    if "candidates" in data:
        return data["candidates"]
    elif "items" in data:
        return data["items"]
    elif "tokens" in data:
        return data["tokens"]
    elif isinstance(data, list):
        return data
    return []

def map_category_from_feed(feed_name):
    """Map le nom du feed vers la catégorie"""
    mapping = {
        "cio_feed": "CIO",
        "watch_feed": "WATCH",
        "hotlist_feed": "HOTLIST",
        "fast_certified_feed": "FAST",
        "certified_feed": "CERTIFIED",
        "rugged_feed": "RUGGED"
    }
    for key, val in mapping.items():
        if key in feed_name:
            return val
    return "CIO"

def convert_token(token, category):
    """Convertit un token au format v1.5"""
    # Gérer structure imbriquée V1: token.token.address
    token_data = token.get("token", token)
    pair_data = token.get("pair", {})
    timestamps = token.get("timestamps", {})
    
    # Détecter les métriques
    metrics = token.get("metrics", {})
    liq = metrics.get("liq_usd", metrics.get("liquidity", 0))
    price = metrics.get("price_usd", metrics.get("price", 0))
    vol_5m = metrics.get("vol_5m_usd", metrics.get("volume_5m", 0))
    vol_1h = metrics.get("vol_1h_usd", metrics.get("volume_1h", 0))
    vol_24h = metrics.get("vol_24h_usd", metrics.get("volume_24h", 0))
    price_change = metrics.get("price_change_24h", 0)
    mcap = metrics.get("market_cap", metrics.get("mcap", 0))
    
    # Détecter performance
    perf = token.get("performance", {})
    if not perf:
        # Calculer depuis price_history si disponible
        history = token.get("price_history", [])
        if history and len(history) >= 2:
            first_price = history[0].get("price", price)
            max_price = max(p.get("price", price) for p in history)
            if first_price > 0:
                max_gain = ((max_price - first_price) / first_price) * 100
                current_gain = ((price - first_price) / first_price) * 100
            else:
                max_gain = 0
                current_gain = 0
        else:
            max_gain = 0
            current_gain = price_change
        
        # Déterminer status
        if max_gain >= 50:
            status = "pumping"
        elif current_gain <= -30:
            status = "dumping"
        else:
            status = "stable"
        
        perf = {
            "max_gain": round(max_gain, 1),
            "current_gain": round(current_gain, 1),
            "status": status
        }
    
    # Détecter risque
    risk = token.get("risk", {})
    if not risk:
        risk_level = token.get("risk_level", "low")
        risk_factors = token.get("risks", [])
        if liq == 0:
            risk_level = "critical"
            risk_factors.append("rug_detected")
        elif liq < 3000:
            risk_level = "high"
            risk_factors.append("low_liquidity")
        risk = {"level": risk_level, "factors": risk_factors}
    
    # Détecter detected_at
    detected = timestamps.get("token_first_seen", 
                 token.get("detected_at", 
                 token.get("timestamp", 
                 token.get("created_at", datetime.now(timezone.utc).isoformat()))))
    
    # Nettoyer symbol
    symbol = token_data.get("symbol", "UNKNOWN")
    if isinstance(symbol, str):
        symbol = symbol.replace('$', '').upper()
    
    # Calculer age
    age_min = timestamps.get("age_minutes", token.get("age_minutes", 0))
    
    return {
        "address": token_data.get("address", ""),
        "symbol": symbol,
        "name": token_data.get("name", symbol),
        "pair_address": pair_data.get("address", pair_data.get("pairAddress", "")),
        "dex": pair_data.get("dex", pair_data.get("dexId", "uniswap")),
        "source": token.get("source", "migrated"),
        "sources": [token.get("source", "migration")],
        "detected_at": detected,
        "category": category,
        "age_minutes": age_min,
        "metrics": {
            "liq_usd": float(liq) if liq else 0,
            "price_usd": float(price) if price else 0,
            "vol_5m_usd": float(vol_5m) if vol_5m else 0,
            "vol_1h_usd": float(vol_1h) if vol_1h else 0,
            "vol_24h_usd": float(vol_24h) if vol_24h else 0,
            "txns_5m": token.get("txns_5m", 0),
            "price_change_24h": float(price_change) if price_change else 0,
            "market_cap": float(mcap) if mcap else 0
        },
        "risk": risk,
        "risk_tags": token.get("badges", token.get("risk_tags", token.get("tags", []))),
        "performance": perf,
        "price_history": token.get("price_history", [])
    }

def is_valid_token(token):
    """Vérifie si le token a les champs minimaux"""
    # Gérer structure imbriquée
    token_data = token.get("token", token)
    addr = token_data.get("address", "")
    symbol = token_data.get("symbol", "")
    return (
        addr and 
        len(addr) > 10 and
        symbol
    )

def is_rugged(token):
    """Détermine si un token devrait être RUGGED"""
    liq = token.get("metrics", {}).get("liq_usd", 0) or 0
    perf = token.get("performance", {})
    current_gain = perf.get("current_gain", 0) or 0
    max_gain = perf.get("max_gain", 0) or 0
    
    if liq == 0:
        return True
    if current_gain <= -90:
        return True
    if max_gain >= 100 and current_gain < max_gain * 0.3:
        return True
    return False

def migrate():
    """Migre tous les feeds"""
    print("="*70)
    print("Migration V1 → V1.5")
    print("="*70)
    
    all_tokens = {}
    stats = {"total_read": 0, "valid": 0, "invalid": 0, "merged": 0, "rugged": 0}
    
    for feed_path in FEEDS:
        category = map_category_from_feed(feed_path)
        tokens = load_feed(feed_path)
        
        print(f"\n{feed_path}: {len(tokens)} tokens")
        stats["total_read"] += len(tokens)
        
        for token in tokens:
            if not is_valid_token(token):
                stats["invalid"] += 1
                continue
            
            converted = convert_token(token, category)
            addr = converted["address"].lower()  # Normaliser l'adresse
            
            # Si déjà vu, fusionner
            if addr in all_tokens:
                # Garder la catégorie la plus élevée si différente
                existing_cat = all_tokens[addr]["category"]
                cat_priority = {"RUGGED": 6, "CERTIFIED": 5, "FAST": 4, "HOTLIST": 3, "WATCH": 2, "CIO": 1}
                if cat_priority.get(category, 0) > cat_priority.get(existing_cat, 0):
                    all_tokens[addr]["category"] = category
                
                # Fusionner les sources
                all_tokens[addr]["sources"] = list(set(all_tokens[addr].get("sources", []) + ["migration"]))
                stats["merged"] += 1
            else:
                all_tokens[addr] = converted
                stats["valid"] += 1
    
    # Post-traitement: vérifier les rugs
    for addr, token in all_tokens.items():
        if is_rugged(token):
            if token["category"] != "RUGGED":
                print(f"  Rug détecté: {token['symbol']} → RUGGED")
                token["category"] = "RUGGED"
                token["risk"] = {"level": "critical", "factors": ["auto_detected"]}
                stats["rugged"] += 1
    
    # Créer le state
    categories = {"CIO": 0, "WATCH": 0, "HOTLIST": 0, "FAST": 0, "CERTIFIED": 0, "RUGGED": 0}
    for token in all_tokens.values():
        cat = token.get("category", "CIO")
        categories[cat] = categories.get(cat, 0) + 1
    
    state = {
        "schema": "lurker_v1.5",
        "meta": {
            "last_scan": datetime.now(timezone.utc).isoformat(),
            "last_lifecycle": datetime.now(timezone.utc).isoformat(),
            "total_tokens": len(all_tokens),
            "version": "1.5.0",
            "migrated_from": "v1_feeds",
            "migration_date": datetime.now(timezone.utc).isoformat(),
            "stats": {
                "by_category": categories,
                "pumps_24h": 0,
                "dumps_24h": 0,
                "rugged": categories.get("RUGGED", 0)
            }
        },
        "tokens": all_tokens
    }
    
    # Sauvegarder
    output_path = Path("state/lurker_state.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(state, f, indent=2)
    
    # Rapport
    print("\n" + "="*70)
    print("Résultat de la migration:")
    print(f"  Tokens lus: {stats['total_read']}")
    print(f"  Validés: {stats['valid']}")
    print(f"  Invalides: {stats['invalid']}")
    print(f"  Fusionnés: {stats['merged']}")
    print(f"  Rugs détectés: {stats['rugged']}")
    print(f"  Total unique: {len(all_tokens)}")
    print("\nRépartition:")
    for cat, count in categories.items():
        if count > 0:
            print(f"  {cat}: {count}")
    print(f"\nFichier créé: {output_path}")
    print("="*70)

if __name__ == "__main__":
    migrate()
