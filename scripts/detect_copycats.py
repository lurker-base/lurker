#!/usr/bin/env python3
"""
LURKER Core - Copycat Detector
Détecte et marque automatiquement les tokens copycat
"""

import json
from datetime import datetime, timezone
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

def detect_copycats(state):
    """Détecte les copycats et les marque comme RUGGED"""
    tokens = state.get("tokens", {})
    copycats_found = []
    
    # Grouper par symbole
    by_symbol = {}
    for addr, token in tokens.items():
        symbol = token.get("symbol", "").upper()
        if symbol:
            if symbol not in by_symbol:
                by_symbol[symbol] = []
            by_symbol[symbol].append((addr, token))
    
    # Pour chaque groupe avec doublons
    for symbol, group in by_symbol.items():
        if len(group) < 2:
            continue
        
        # Trier par liquidité décroissante
        group.sort(key=lambda x: x[1].get("metrics", {}).get("liq_usd", 0) or 0, reverse=True)
        
        # Le premier est le legit (plus haute liquidité)
        legit_addr, legit_token = group[0]
        legit_liq = legit_token.get("metrics", {}).get("liq_usd", 0) or 0
        legit_has_socials = bool(
            legit_token.get("twitter") or 
            legit_token.get("website") or 
            legit_token.get("has_profile")
        )
        
        # Les autres sont potentiellement des copycats
        for addr, token in group[1:]:
            liq = token.get("metrics", {}).get("liq_usd", 0) or 0
            has_socials = bool(
                token.get("twitter") or 
                token.get("website") or 
                token.get("has_profile")
            )
            
            # Critères de copycat
            is_copycat = False
            reasons = []
            
            # 1. Liquidité < 10% du legit
            if legit_liq > 0 and liq < (legit_liq * 0.1):
                is_copycat = True
                reasons.append(f"low_liq ({liq/legit_liq*100:.1f}% of legit)")
            
            # 2. Pas de socials alors que le legit en a
            if legit_has_socials and not has_socials:
                is_copycat = True
                reasons.append("no_socials")
            
            # 3. Très faible liquidité (< $5k)
            if liq < 5000:
                is_copycat = True
                reasons.append(f"very_low_liq (${liq:,.0f})")
            
            # 4. Déjà marqué comme copycat manuellement
            if token.get("is_copycat"):
                is_copycat = True
                reasons.append("manual_mark")
            
            if is_copycat:
                old_category = token.get("category", "CIO")
                
                # Marquer comme RUGGED
                token["category"] = "RUGGED"
                token["is_copycat"] = True
                token["original_token"] = legit_addr
                token["risk"] = {
                    "level": "critical",
                    "factors": ["copycat_scam"] + reasons
                }
                
                # Nettoyer les badges positifs
                old_tags = token.get("risk_tags", [])
                new_tags = [tag for tag in old_tags if any(x in tag for x in ['💀', '⚠️', 'DUMP', 'RUG'])]
                if '💀 RUGGED' not in new_tags:
                    new_tags.append('💀 RUGGED')
                if '⚠️ COPYCAT' not in new_tags:
                    new_tags.append('⚠️ COPYCAT')
                token["risk_tags"] = new_tags
                
                copycats_found.append({
                    "symbol": symbol,
                    "address": addr[:15] + "...",
                    "old_category": old_category,
                    "liq": liq,
                    "legit_liq": legit_liq,
                    "reasons": reasons
                })
    
    return copycats_found

def update_stats(state):
    """Met à jour les statistiques"""
    categories = {"CIO": 0, "WATCH": 0, "HOTLIST": 0, "FAST": 0, "CERTIFIED": 0, "RUGGED": 0}
    
    for token in state["tokens"].values():
        cat = token.get("category", "CIO")
        categories[cat] = categories.get(cat, 0) + 1
    
    state["meta"]["stats"]["by_category"] = categories
    state["meta"]["stats"]["rugged"] = categories.get("RUGGED", 0)
    state["meta"]["last_scan"] = datetime.now(timezone.utc).isoformat()
    
    return state

def main():
    print("="*60)
    print("LURKER Core - Copycat Detector")
    print("="*60)
    
    state = load_state()
    print(f"Tokens loaded: {len(state['tokens'])}")
    
    copycats = detect_copycats(state)
    
    if copycats:
        print(f"\n🚫 {len(copycats)} copycat(s) detected and moved to RUGGED:")
        for c in copycats:
            print(f"\n  {c['symbol']} ({c['address']})")
            print(f"    {c['old_category']} → RUGGED")
            print(f"    Liq: ${c['liq']:,.0f} (vs legit ${c['legit_liq']:,.0f})")
            print(f"    Reasons: {', '.join(c['reasons'])}")
        
        state = update_stats(state)
        save_state(state)
        
        print(f"\n{'='*60}")
        print(f"Total RUGGED: {state['meta']['stats']['rugged']}")
    else:
        print("\n✅ No new copycats detected")
    
    print("="*60)

if __name__ == "__main__":
    main()
