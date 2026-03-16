#!/usr/bin/env python3
"""
LURKER Token Importer
Importe les tokens du CIO feed vers lurker_state.json
Exécute toutes les 2 minutes
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from safe_state import StateFile

LURKER_DIR = Path("/data/.openclaw/workspace/lurker-project")
CIO_FILE = LURKER_DIR / "signals" / "cio_feed.json"
STATE_FILE = LURKER_DIR / "state" / "lurker_state.json"

def load_cio_feed():
    """Charge le CIO feed"""
    if not CIO_FILE.exists():
        print("[IMPORTER] CIO feed not found")
        return []
    
    with open(CIO_FILE) as f:
        data = json.load(f)
    return data.get("candidates", [])

def default_state():
    return {
        "schema": "lurker_v1.5",
        "meta": {
            "version": "1.5.0",
            "total_tokens": 0,
            "stats": {
                "by_category": {"NEW": 0, "WATCHING": 0, "TRENDING": 0, "ACTIVE": 0, "VERIFIED": 0, "RUGGED": 0},
                "pumps_24h": 0,
                "dumps_24h": 0
            }
        },
        "tokens": {}
    }


def load_state():
    """Charge l'état actuel"""
    if not STATE_FILE.exists():
        print("[IMPORTER] State file not found, creating new")
        return default_state()

    handler = StateFile(STATE_FILE, max_retries=5, retry_delay=0.2)
    state = handler.load(default=None)
    if state is None:
        backup_file = STATE_FILE.parent / "lurker_state_backup.json"
        if backup_file.exists():
            print("[IMPORTER] Primary state unreadable, trying backup")
            state = StateFile(backup_file, max_retries=2, retry_delay=0.1).load(default=default_state())
        else:
            print("[IMPORTER] Primary state unreadable, using default state")
            state = default_state()
    return state


def save_state(state):
    """Sauvegarde l'état"""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    state["meta"]["total_tokens"] = len(state["tokens"])
    state["meta"]["last_scan"] = datetime.now(timezone.utc).isoformat()
    handler = StateFile(STATE_FILE, max_retries=5, retry_delay=0.2)
    if not handler.save(state):
        raise RuntimeError("failed to save state atomically")

def generate_badges(risk, metrics):
    """Génère les badges colorés pour le dashboard"""
    badges = []
    risk_level = risk.get("level", "medium")
    factors = risk.get("factors", [])
    liq = metrics.get("liq_usd", 0)
    
    # Badge selon le niveau de risque
    if risk_level == "low":
        badges.append("✅ Low Risk")
    elif risk_level == "medium":
        badges.append("⚠️ Medium")
    elif risk_level == "high":
        badges.append("🚨 High Risk")
    
    # Badge liquidité
    if liq > 100000:
        badges.append("💧 High Liq")
    elif liq > 50000:
        badges.append("💧 Good Liq")
    elif liq > 10000:
        badges.append("⚡ Low Liq")
    
    # Badge selon les facteurs
    if "dumping" in factors:
        badges.append("📉 Dumping")
    if "fresh" in factors or "new" in factors:
        badges.append("✨ Fresh")
    
    return badges[:3]  # Max 3 badges

def convert_cio_to_state_format(cio_candidate):
    """Convertit un candidat CIO au format state"""
    token = cio_candidate.get("token", {})
    metrics = cio_candidate.get("metrics", {})
    risk = cio_candidate.get("risk", {})
    
    return {
        "address": token.get("address", ""),
        "symbol": token.get("symbol", "UNKNOWN"),
        "name": token.get("name", "Unknown Token"),
        "pair_address": cio_candidate.get("pair", {}).get("address", ""),
        "dex": cio_candidate.get("pair", {}).get("dexId", "uniswap"),
        "source": cio_candidate.get("source", "cio"),
        "sources": [cio_candidate.get("source", "cio")],
        "detected_at": cio_candidate.get("detected_at") or datetime.now(timezone.utc).isoformat(),
        "category": "NEW",  # IMPORTANT: catégorie NEW pour le dashboard
        "age_minutes": cio_candidate.get("age_hours", 0) * 60,
        "metrics": {
            "liq_usd": metrics.get("liq_usd", 0) or metrics.get("liquidity", 0),
            "price_usd": metrics.get("price_usd", 0) or metrics.get("priceUsd", 0),
            "vol_5m_usd": metrics.get("vol_5m_usd", 0) or metrics.get("volume", {}).get("m5", 0),
            "vol_1h_usd": metrics.get("vol_1h_usd", 0) or metrics.get("volume", {}).get("h1", 0),
            "vol_24h_usd": metrics.get("vol_24h_usd", 0) or metrics.get("volume", {}).get("h24", 0),
            "txns_5m": metrics.get("txns_5m", 0),
            "price_change_24h": metrics.get("price_change_24h", 0) or metrics.get("priceChange", {}).get("h24", 0),
            "market_cap": 0
        },
        "risk": {
            "level": risk.get("level", "medium"),
            "factors": risk.get("factors", [])
        },
        "risk_tags": generate_badges(risk, metrics),
        "score": cio_candidate.get("score", 0),
        "price_history": []
    }

def main():
    print("="*60)
    print("LURKER Token Importer")
    print("="*60)
    
    # Charger les données
    cio_candidates = load_cio_feed()
    state = load_state()
    
    if not cio_candidates:
        print("[IMPORTER] No candidates in CIO feed")
        return
    
    print(f"[IMPORTER] {len(cio_candidates)} candidates in CIO feed")
    print(f"[IMPORTER] {len(state['tokens'])} tokens in state")
    
    # Ajouter les nouveaux tokens
    added = 0
    for candidate in cio_candidates:
        token_addr = candidate.get("token", {}).get("address", "")
        if not token_addr:
            continue
        
        # Vérifier si déjà présent
        if token_addr in state["tokens"]:
            continue
        
        # Convertir et ajouter
        token_data = convert_cio_to_state_format(candidate)
        state["tokens"][token_addr] = token_data
        added += 1
        print(f"[IMPORTER] + NEW: {token_data['symbol']} ({token_addr[:20]}...)")
    
    # Mettre à jour les stats
    if added > 0:
        categories = {"NEW": 0, "WATCHING": 0, "TRENDING": 0, "ACTIVE": 0, "VERIFIED": 0, "RUGGED": 0}
        for token in state["tokens"].values():
            cat = token.get("category", "NEW")
            categories[cat] = categories.get(cat, 0) + 1
        
        state["meta"]["stats"]["by_category"] = categories
        save_state(state)
        print(f"\n[IMPORTER] Added {added} new tokens")
        print(f"[IMPORTER] Categories: {categories}")
    else:
        print("[IMPORTER] No new tokens to add")
    
    print("="*60)

if __name__ == "__main__":
    main()
