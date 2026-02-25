#!/usr/bin/env python3
"""
LURKER Core - Scanner
Détection unifiée des tokens sur Base
Combine la logique de : scanner_cio_ultra + scanner_cio_v3 + scanner_hybrid
"""

import requests
import json
import os
from datetime import datetime, timezone
from pathlib import Path

# Config (modifiable via config/lurker_config.yaml à terme)
CONFIG = {
    "min_liquidity": 300,      # Reduced to catch more tokens
    "min_volume_5m": 0,        # No 5m volume requirement
    "max_age_minutes": 10080,  # 7 jours
    "chain": "base"
}

STATE_FILE = Path(__file__).parent.parent / "state" / "lurker_state.json"

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {
        "schema": "lurker_v1.5",
        "meta": {
            "last_scan": None,
            "total_tokens": 0,
            "version": "1.5.0"
        },
        "tokens": {}
    }

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    state["meta"]["last_scan"] = datetime.now(timezone.utc).isoformat()
    state["meta"]["total_tokens"] = len(state["tokens"])
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def safe_num(x, default=0):
    try:
        return float(x) if x is not None else default
    except:
        return default

def get_token_profile(token_address):
    """Get full profile with socials for a token"""
    try:
        r = requests.get(f"https://api.dexscreener.com/token-profiles/latest/v1", timeout=15)
        r.raise_for_status()
        profiles = r.json()
        
        for profile in profiles:
            if profile.get("tokenAddress", "").lower() == token_address.lower():
                return {
                    "twitter": profile.get("twitterUrl", ""),
                    "website": profile.get("websiteUrl", ""),
                    "telegram": profile.get("telegramUrl", ""),
                    "discord": profile.get("discordUrl", ""),
                    "icon": profile.get("icon", ""),
                    "description": profile.get("description", ""),
                    "has_profile": bool(profile.get("icon") or profile.get("twitterUrl") or profile.get("websiteUrl"))
                }
        return None
    except Exception as e:
        print(f"[get_profile] Error: {e}")
        return None

def scan_dexscreener_profiles():
    """Tokens récemment créés (profils)"""
    try:
        r = requests.get("https://api.dexscreener.com/token-profiles/latest/v1", timeout=15)
        r.raise_for_status()
        data = r.json()
        tokens = []
        for profile in data:
            if profile.get("chainId") != CONFIG["chain"]:
                continue
            # Get badges if available
            badges = []
            if profile.get("isGood"):
                badges.append("✅ Good")
            if profile.get("isVerified"):
                badges.append("✓ Verified")
            if profile.get("isBoosted"):
                badges.append("🚀 Boosted")
            if profile.get("isNew"):
                badges.append("✨ New")
            
            tokens.append({
                "address": profile.get("tokenAddress"),
                "symbol": profile.get("symbol", "UNKNOWN"),
                "name": profile.get("name", "Unknown"),
                "source": "profiles",
                "icon": profile.get("icon", ""),
                "description": profile.get("description", ""),
                "twitter": profile.get("twitterUrl", ""),
                "website": profile.get("websiteUrl", ""),
                "telegram": profile.get("telegramUrl", ""),
                "has_profile": bool(profile.get("icon") or profile.get("twitterUrl") or profile.get("websiteUrl")),
                "badges": badges
            })
        return tokens
    except Exception as e:
        print(f"[scan_profiles] Error: {e}")
        return []

def scan_dexscreener_boosts():
    """Tokens boostés (momentum)"""
    try:
        r = requests.get("https://api.dexscreener.com/token-boosts/latest/v1", timeout=15)
        r.raise_for_status()
        data = r.json()
        tokens = []
        for boost in data:
            if boost.get("chainId") != CONFIG["chain"]:
                continue
            tokens.append({
                "address": boost.get("tokenAddress"),
                "symbol": boost.get("symbol", "UNKNOWN"),
                "name": boost.get("name", "Unknown"),
                "source": "boosts",
                "boost_amount": safe_num(boost.get("amount"))
            })
        return tokens
    except Exception as e:
        print(f"[scan_boosts] Error: {e}")
        return []

def scan_dexscreener_pairs(query="base"):
    """Pairs actives sur Base"""
    try:
        r = requests.get(f"https://api.dexscreener.com/latest/dex/search?q={query}", timeout=15)
        r.raise_for_status()
        data = r.json()
        tokens = []
        seen = set()
        
        for pair in data.get("pairs", []):
            if pair.get("chainId") != CONFIG["chain"]:
                continue
            
            liq = safe_num(pair.get("liquidity", {}).get("usd"))
            vol_5m = safe_num(pair.get("volume", {}).get("m5"))
            vol_1h = safe_num(pair.get("volume", {}).get("h1"))
            vol_24h = safe_num(pair.get("volume", {}).get("h24"))
            
            # Use total volume (5m + 1h + 24h) for filtering
            total_vol = vol_5m + vol_1h + vol_24h
            
            if liq < CONFIG["min_liquidity"]:
                continue
            # Check if any volume exists (relaxed requirement)
            if total_vol < 100:
                continue
            
            addr = pair.get("baseToken", {}).get("address")
            if not addr or addr in seen:
                continue
            seen.add(addr)
            
            # Calculer l'âge si possible
            pair_created = pair.get("pairCreatedAt", 0)
            age_min = 0
            if pair_created:
                age_min = (datetime.now(timezone.utc).timestamp() - pair_created/1000) / 60
            
            if age_min > CONFIG["max_age_minutes"]:
                continue
            
            tokens.append({
                "address": addr,
                "symbol": pair.get("baseToken", {}).get("symbol", "UNKNOWN"),
                "name": pair.get("baseToken", {}).get("name", "Unknown"),
                "pair_address": pair.get("pairAddress"),
                "dex": pair.get("dexId"),
                "source": "pairs",
                "age_minutes": round(age_min, 1),
                "metrics": {
                    "liq_usd": liq,
                    "price_usd": safe_num(pair.get("priceUsd")),
                    "vol_5m_usd": vol_5m,
                    "vol_1h_usd": vol_1h,
                    "vol_24h_usd": vol_24h,
                    "txns_5m": safe_num(pair.get("txns", {}).get("m5", {}).get("buys")) + 
                               safe_num(pair.get("txns", {}).get("m5", {}).get("sells")),
                    "price_change_24h": safe_num(pair.get("priceChange", {}).get("h24")),
                    "market_cap": safe_num(pair.get("marketCap"))
                }
            })
        return tokens
    except Exception as e:
        print(f"[scan_pairs] Error: {e}")
        return []

def calculate_risk_tags(token):
    """Tags de risque comme V1"""
    metrics = token.get("metrics", {})
    tags = []
    
    liq = metrics.get("liq_usd", 0)
    vol_5m = metrics.get("vol_5m_usd", 0)
    mcap = metrics.get("market_cap", 0)
    age = token.get("age_minutes", 0)
    
    if liq < 5000:
        tags.append("LOW_LIQUIDITY")
    if age < 10:
        tags.append("FRESH")
    if age < 60 and mcap > 100000:
        tags.append("FAST_GROWTH")
    if vol_5m > liq * 0.5:
        tags.append("HIGH_ACTIVITY")
    if mcap > 1000000:
        tags.append("ESTABLISHED")
    
    return tags

def enrich_tokens_with_pairs(all_tokens, pairs_data):
    """Enrichit les tokens profiles/boosts avec les données pairs ET ajoute les nouveaux pairs"""
    pairs_by_addr = {p.get("address"): p for p in pairs_data if p.get("address")}
    enriched = []
    seen_addrs = set()
    
    # First, add all pairs_data (new tokens from pairs scanning)
    for pair_token in pairs_data:
        addr = pair_token.get("address")
        if addr and addr not in seen_addrs:
            enriched.append(pair_token)
            seen_addrs.add(addr)
    
    # Then, enrich with profiles/boosts data if available
    for token in all_tokens:
        addr = token.get("address")
        if not addr or addr in seen_addrs:
            continue
        
        if addr in pairs_by_addr:
            # Merge avec les données pairs
            pair_data = pairs_by_addr[addr]
            token.update(pair_data)
            token["sources"] = list(set(token.get("sources", []) + [pair_data.get("source", "pairs")]))
            enriched.append(token)
            seen_addrs.add(addr)
        elif token.get("source") in ["profiles", "boosts"]:
            # Token from profiles/boosts without pair data
            enriched.append(token)
            seen_addrs.add(addr)
    
    return enriched

def detect_copycat(token, merged_tokens):
    """Detect if token is a copycat of an existing token with same symbol"""
    symbol = token.get("symbol", "").upper()
    addr = token.get("address", "").lower()
    liq = token.get("metrics", {}).get("liq_usd", 0) or 0
    has_socials = token.get("has_profile", False) or token.get("twitter", "") or token.get("website", "")
    
    for existing_addr, existing in merged_tokens.items():
        if existing.get("symbol", "").upper() == symbol:
            if existing_addr.lower() != addr:
                existing_liq = existing.get("metrics", {}).get("liq_usd", 0) or 0
                existing_has_socials = existing.get("has_profile", False) or existing.get("twitter", "") or existing.get("website", "")
                
                # If existing has much higher liquidity and socials, this is likely a copycat
                if existing_liq > liq * 10 and existing_has_socials and not has_socials:
                    return True, existing_addr, existing_liq
                
                # If existing has socials and this one doesn't, likely copycat
                if existing_has_socials and not has_socials:
                    return True, existing_addr, existing_liq
    
    return False, None, 0

def merge_tokens(sources, existing_tokens=None):
    """Merge les tokens de toutes les sources sans doublons"""
    merged = {}
    
    # Build lookup of existing symbols
    existing_by_symbol = {}
    if existing_tokens:
        for addr, t in existing_tokens.items():
            sym = t.get("symbol", "").upper()
            if sym:
                existing_by_symbol[sym] = (addr, t)
    
    # D'abord collecter tous les tokens
    all_tokens = []
    for source_tokens in sources:
        all_tokens.extend(source_tokens)
    
    # Build profile lookup
    profile_by_addr = {}
    for t in all_tokens:
        if t.get("source") in ["profiles", "boosts"]:
            addr = t.get("address", "").lower()
            if addr:
                profile_by_addr[addr] = t
    
    # Enrich pairs with profile data
    for t in all_tokens:
        if t.get("source") == "pairs":
            addr = t.get("address", "").lower()
            if addr in profile_by_addr:
                prof = profile_by_addr[addr]
                t["twitter"] = prof.get("twitter", "") or t.get("twitter", "")
                t["website"] = prof.get("website", "") or t.get("website", "")
                t["telegram"] = prof.get("telegram", "") or t.get("telegram", "")
                t["icon"] = prof.get("icon", "") or t.get("icon", "")
                t["has_profile"] = True
                # Merge badges
                existing_badges = t.get("badges", [])
                profile_badges = prof.get("badges", [])
                t["badges"] = list(set(existing_badges + profile_badges))
    
    # Enrichir avec les données pairs
    pairs_data = [t for t in all_tokens if t.get("source") == "pairs"]
    enriched = enrich_tokens_with_pairs(all_tokens, pairs_data)
    
    # First pass: add tokens with socials/profiles (likely legit)
    for token in enriched:
        addr = token.get("address")
        symbol = token.get("symbol", "").upper()
        if not addr:
            continue
        
        # Vérifier qu'on a des métriques valides
        metrics = token.get("metrics", {})
        if not metrics.get("liq_usd", 0) > 0:
            continue  # Skip si pas de liquidité
        
        # Check if address already exists in our database
        if addr in existing_tokens:
            print(f"  ⚠️ Skipping {symbol} - already in database")
            continue
        
        # Check if symbol already exists in our database
        if symbol in existing_by_symbol:
            existing_addr, existing = existing_by_symbol[symbol]
            existing_liq = existing.get("metrics", {}).get("liq_usd", 0) or 0
            new_liq = metrics.get("liq_usd", 0) or 0
            
            # If existing has much higher liquidity, skip this one (it's a copycat)
            if existing_liq > new_liq * 2:
                print(f"  ⚠️ Skipping {symbol} - copycat of {existing_addr[:10]}...")
                continue
        
        if addr in merged:
            # Fusionner les infos
            merged[addr].update(token)
            if "sources" not in merged[addr]:
                merged[addr]["sources"] = []
            if token.get("source") not in merged[addr]["sources"]:
                merged[addr]["sources"].append(token.get("source"))
        else:
            token["sources"] = list(set(token.get("sources", [token.get("source", "unknown")])))
            token["detected_at"] = datetime.now(timezone.utc).isoformat()
            token["category"] = "CIO"
            token["risk"] = {"level": "unknown", "factors": []}
            token["performance"] = {"max_gain": 0, "current_gain": 0, "status": "new"}
            token["risk_tags"] = calculate_risk_tags(token)
            merged[addr] = token
    
    # Second pass: detect copycats
    for addr, token in list(merged.items()):
        is_copycat, original_addr, original_liq = detect_copycat(token, merged)
        if is_copycat:
            token["is_copycat"] = True
            token["original_token"] = original_addr
            token["risk_tags"].append("⚠️ COPYCAT")
            print(f"  ⚠️ Copycat detected: {token['symbol']} (copy of {original_addr[:10]}...)")
    
    return merged

def main():
    print("="*60)
    print("LURKER Core Scanner v1.5")
    print("="*60)
    
    state = load_state()
    print(f"Tokens existants: {len(state['tokens'])}")
    
    # Scan multi-source
    print("\n[1/4] Scanning profiles...")
    profiles = scan_dexscreener_profiles()
    print(f"  → {len(profiles)} tokens from profiles")
    
    print("[2/4] Scanning boosts...")
    boosts = scan_dexscreener_boosts()
    print(f"  → {len(boosts)} tokens from boosts")
    
    print("[3/4] Scanning pairs with multiple queries...")
    all_pairs = []
    # Expanded queries to catch more tokens
    queries = ["base", "claw", "nook", "society", "ai", "wolf", "marty", "elon", "trump", "pepe"]
    for query in queries:
        pairs = scan_dexscreener_pairs(query)
        all_pairs.extend(pairs)
        print(f"  → {len(pairs)} from '{query}'")
    
    # Remove duplicates from pairs
    seen_addrs = set()
    unique_pairs = []
    for p in all_pairs:
        addr = p.get("address")
        if addr and addr not in seen_addrs:
            seen_addrs.add(addr)
            unique_pairs.append(p)
    print(f"  → {len(unique_pairs)} unique pairs total")
    
    # Build profile lookup by address
    profile_by_addr = {}
    for p in profiles:
        addr = p.get("tokenAddress", "").lower()
        if addr:
            profile_by_addr[addr] = p
    
    # Enrich pairs with profile data
    for pair in unique_pairs:
        addr = pair.get("address", "").lower()
        if addr in profile_by_addr:
            prof = profile_by_addr[addr]
            pair["twitter"] = prof.get("twitterUrl", "")
            pair["website"] = prof.get("websiteUrl", "")
            pair["telegram"] = prof.get("telegramUrl", "")
            pair["icon"] = prof.get("icon", "")
            pair["description"] = prof.get("description", "")
            pair["has_profile"] = True
            pair["badges"] = prof.get("badges", [])
    
    # Merge
    print("\n[4/4] Merging sources...")
    new_tokens = merge_tokens([profiles, boosts, unique_pairs], state['tokens'])
    
    # Update state
    added = 0
    for addr, token in new_tokens.items():
        if addr not in state["tokens"]:
            state["tokens"][addr] = token
            added += 1
            print(f"  + {token['symbol']} ({token['category']}) - {token.get('age_minutes', 0):.0f}min")
    
    # Update risk tags for existing tokens
    for addr, token in state["tokens"].items():
        if "metrics" in token:
            token["risk_tags"] = calculate_risk_tags(token)
    
    save_state(state)
    
    print(f"\n{'='*60}")
    print(f"Nouveaux tokens: {added}")
    print(f"Total: {len(state['tokens'])}")
    print("="*60)

if __name__ == "__main__":
    main()
