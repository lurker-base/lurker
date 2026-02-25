#!/usr/bin/env python3
"""
LURKER Core - Token Cleanup
Nettoie les feeds : retire les rugs des catégories actives, élimine les doublons
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

STATE_FILE = Path(__file__).parent.parent / "state" / "lurker_state.json"

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"tokens": {}}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def is_token_rugged(token):
    """Détermine si un token est RUGGED"""
    metrics = token.get("metrics", {})
    performance = token.get("performance", {})
    
    liq = metrics.get("liq_usd", 0) or 0
    current_gain = performance.get("current_gain", 0) or 0
    max_gain = performance.get("max_gain", 0) or 0
    status = performance.get("status", "")
    
    # Critère 1: Liquidité = 0
    if liq == 0:
        return True, "zero_liquidity"
    
    # Critère 2: Pump & Dump (pumpé +100% puis dumpé -50% depuis le max)
    if max_gain >= 100 and current_gain < max_gain * 0.5:
        return True, f"pump_dump ({max_gain:.0f}%→{current_gain:.0f}%)"
    
    # Critère 3: Dump sévère -90% ou plus
    if current_gain <= -90:
        return True, f"severe_dump ({current_gain:.0f}%)"
    
    # Critère 4: Status explicitement dumping avec grosse perte
    if status == "dumping" and current_gain <= -50:
        return True, f"dumping ({current_gain:.0f}%)"
    
    return False, None

def calculate_age_hours(detected_at):
    try:
        dt = datetime.fromisoformat(detected_at.replace('Z', '+00:00'))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    except:
        return 9999

def is_token_stale(token, max_hours=48):
    """Token sans mise à jour depuis longtemps"""
    age = calculate_age_hours(token.get("detected_at"))
    return age > max_hours

def cleanup_tokens(state):
    """Nettoie tous les tokens"""
    tokens = state.get("tokens", {})
    
    stats = {
        "total_before": len(tokens),
        "moved_to_rugged": 0,
        "removed_duplicates": 0,
        "removed_stale": 0,
        "fixed_category": 0,
        "details": []
    }
    
    # Pass 1: Identifier et déplacer les rugs
    for addr, token in list(tokens.items()):
        is_rug, reason = is_token_rugged(token)
        current_cat = token.get("category", "CIO")
        
        if is_rug:
            if current_cat != "RUGGED":
                old_cat = current_cat
                token["category"] = "RUGGED"
                token["risk"] = {"level": "critical", "factors": [reason]}
                stats["moved_to_rugged"] += 1
                stats["details"].append(f"{token.get('symbol', '?')}: {old_cat} → RUGGED ({reason})")
            else:
                # Déjà RUGGED, s'assurer que le risk est correct
                if token.get("risk", {}).get("level") != "critical":
                    token["risk"] = {"level": "critical", "factors": [reason]}
    
    # Pass 2: Vérifier la cohérence des catégories
    for addr, token in list(tokens.items()):
        cat = token.get("category", "CIO")
        perf = token.get("performance", {})
        status = perf.get("status", "")
        
        # Si RUGGED mais pas dans les critères, vérifier
        if cat == "RUGGED":
            is_rug, reason = is_token_rugged(token)
            if not is_rug:
                # Faux positif, recalculer la catégorie
                age_hours = calculate_age_hours(token.get("detected_at"))
                if age_hours < 0.17:
                    new_cat = "CIO"
                elif age_hours < 0.5:
                    new_cat = "WATCH"
                elif age_hours < 1:
                    new_cat = "HOTLIST"
                elif age_hours < 24:
                    new_cat = "FAST"
                else:
                    new_cat = "CERTIFIED"
                
                token["category"] = new_cat
                token["risk"] = {"level": "low", "factors": []}
                stats["fixed_category"] += 1
                stats["details"].append(f"{token.get('symbol', '?')}: RUGGED → {new_cat} (faux positif corrigé)")
    
    # Pass 3: Supprimer les tokens trop vieux et inactifs (>7 jours, pas de liquidité)
    to_remove = []
    for addr, token in list(tokens.items()):
        age_days = calculate_age_hours(token.get("detected_at")) / 24
        liq = token.get("metrics", {}).get("liq_usd", 0) or 0
        cat = token.get("category", "CIO")
        
        # Supprimer si >7 jours ET liquidité faible ET pas certifié
        if age_days > 7 and liq < 5000 and cat != "CERTIFIED":
            to_remove.append(addr)
            stats["removed_stale"] += 1
    
    for addr in to_remove:
        del tokens[addr]
    
    # Pass 4: Vérifier les doublons par adresse (normalement impossible avec dict)
    # Mais vérifier qu'un même symbol n'a pas plusieurs entrées sauf si legit
    symbols = {}
    for addr, token in tokens.items():
        sym = token.get("symbol", '')
        if sym in symbols:
            # Garder celui avec le plus de données
            existing = tokens[symbols[sym]]
            if len(token.get("metrics", {})) > len(existing.get("metrics", {})):
                tokens[symbols[sym]] = token
                del tokens[addr]
                stats["removed_duplicates"] += 1
        else:
            symbols[sym] = addr
    
    # Recalculer les stats
    categories = {"CIO": 0, "WATCH": 0, "HOTLIST": 0, "FAST": 0, "CERTIFIED": 0, "RUGGED": 0, "ARCHIVED": 0}
    for token in tokens.values():
        cat = token.get("category", "CIO")
        categories[cat] = categories.get(cat, 0) + 1
    
    pumps = sum(1 for t in tokens.values() if t.get("performance", {}).get("status") == "pumping")
    dumps = sum(1 for t in tokens.values() if t.get("performance", {}).get("status") == "dumping")
    
    state["meta"]["stats"] = {
        "by_category": categories,
        "pumps_24h": pumps,
        "dumps_24h": dumps,
        "rugged": categories.get("RUGGED", 0),
        "cleanup": {
            "last_run": datetime.now(timezone.utc).isoformat(),
            "tokens_before": stats["total_before"],
            "tokens_after": len(tokens),
            "moved_to_rugged": stats["moved_to_rugged"],
            "removed_stale": stats["removed_stale"]
        }
    }
    
    stats["total_after"] = len(tokens)
    state["tokens"] = tokens
    
    return state, stats

def main():
    print("="*70)
    print("LURKER Core - Token Cleanup")
    print("="*70)
    
    state = load_state()
    print(f"Tokens avant cleanup: {len(state.get('tokens', {}))}")
    print()
    
    state, stats = cleanup_tokens(state)
    
    print(f"Résultats:")
    print(f"  - Tokens avant: {stats['total_before']}")
    print(f"  - Tokens après: {stats['total_after']}")
    print(f"  - Déplacés vers RUGGED: {stats['moved_to_rugged']}")
    print(f"  - Catégories corrigées: {stats['fixed_category']}")
    print(f"  - Supprimés (stale): {stats['removed_stale']}")
    print()
    
    if stats['details']:
        print("Détails des changements:")
        for detail in stats['details'][:20]:  # Limiter l'affichage
            print(f"  • {detail}")
        if len(stats['details']) > 20:
            print(f"  ... et {len(stats['details']) - 20} autres")
        print()
    
    save_state(state)
    
    print(f"Catégories finales:")
    for cat, count in state["meta"]["stats"]["by_category"].items():
        if count > 0:
            print(f"  {cat}: {count}")
    print("="*70)

if __name__ == "__main__":
    main()
