#!/usr/bin/env python3
"""
LURKER CIO Scanner - ULTRA LAUNCH MODE
Discovery-first: catch everything, tag risk, filter later
"""
import json
import sys
import time
import requests
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

BASE_URL = "https://api.dexscreener.com"
CHAIN = "base"
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
STATE_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"

# ULTRA LAUNCH MODE - Discovery thresholds (more permissive)
MIN_LIQ_USD = 100          # $100 - very low threshold for discovery mode
MIN_VOLUME_5M = 10         # $10 - very low threshold for discovery  
MIN_TX_5M = 1              # 1 tx minimum
MAX_AGE_MINUTES = 10080    # 7 days - ULTRA LAUNCH mode: be more lenient
TIMEOUT = 15

def now_ms():
    return int(time.time() * 1000)

def iso(ts_ms=None):
    if ts_ms is None:
        ts_ms = now_ms()
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()

def safe_num(x, default=0):
    try:
        return float(x) if x is not None else default
    except:
        return default

def get_json(url):
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"Accept": "application/json"})
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[SCANNER] Error {url}: {e}")
        return None

def load_token_registry():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"schema": "lurker_token_registry_v1", "tokens": {}}

def save_token_registry(registry):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(registry, f, indent=2)

def calculate_risk_tags(pair):
    """Tag risks based on 1h activity (not 5m to avoid false positives)"""
    risks = []
    liq = safe_num((pair.get("liquidity") or {}).get("usd"), 0)
    vol_1h = safe_num((pair.get("volume") or {}).get("h1"), 0)
    tx_1h = (pair.get("txns") or {}).get("h1") or {}
    tx_count = (tx_1h.get("buys") or 0) + (tx_1h.get("sells") or 0)
    
    if liq < 5000:
        risks.append("low_liquidity")
    if liq < 2000:
        risks.append("very_low_liquidity")
    if tx_count < 10:  # 10 tx sur 1h = seuil plus réaliste
        risks.append("low_activity")
    if vol_1h < 1000:  # $1k sur 1h au lieu de $100 sur 5m
        risks.append("low_volume")
    
    price_change = safe_num(pair.get("priceChange", {}).get("h1"), 0)
    if price_change < -10:
        risks.append("dumping")
    
    return risks


def generate_signal_explanation(candidate, source, risks, dex_quality):
    """Generate a credible explanation of WHY this token was selected.
    
    Returns a dict with structured reasoning that can be displayed in the UI.
    """
    metrics = candidate.get("metrics", {})
    
    # Build explanation based on what metrics triggered the signal
    reasons = []
    key_metrics = []
    
    # Source-based explanation
    source_reasons = {
        "boosts": "Token is actively promoted with boost visibility",
        "profiles": "Complete DexScreener profile with verified info",
        "community": "Community takeover detected - organic momentum",
        "ads": "High activity placement - advertiser confidence",
        "search": "Caught in discovery sweep - early detection",
    }
    
    if source in source_reasons:
        reasons.append(source_reasons[source])
    
    # Metrics-based explanation
    vol_1h = metrics.get("vol_1h_usd", 0)
    liq = metrics.get("liq_usd", 0)
    tx_5m = metrics.get("txns_5m", 0)
    age_hours = candidate.get("timestamps", {}).get("age_hours", 0)
    
    # Volume velocity explanation
    if vol_1h > 100000:
        reasons.append("High 1h volume indicates strong trading interest")
        key_metrics.append({"metric": "volume_1h", "value": f"${vol_1h:,.0f}", "significance": "high"})
    elif vol_1h > 50000:
        reasons.append("Solid hourly volume above $50K threshold")
        key_metrics.append({"metric": "volume_1h", "value": f"${vol_1h:,.0f}", "significance": "medium"})
    
    # Liquidity explanation
    if liq > 50000:
        reasons.append("Strong liquidity depth reduces slippage risk")
        key_metrics.append({"metric": "liquidity", "value": f"${liq:,.0f}", "significance": "high"})
    elif liq > 30000:
        reasons.append("Adequate liquidity for position entry/exit")
        key_metrics.append({"metric": "liquidity", "value": f"${liq:,.0f}", "significance": "medium"})
    elif liq < 5000:
        reasons.append("Low liquidity - high risk, potential for large moves")
        key_metrics.append({"metric": "liquidity", "value": f"${liq:,.0f}", "significance": "risk"})
    
    # Transaction activity
    if tx_5m > 50:
        reasons.append("High transaction frequency - active market participation")
        key_metrics.append({"metric": "tx_5m", "value": f"{tx_5m} txs", "significance": "high"})
    elif tx_5m > 20:
        reasons.append("Healthy transaction flow indicating organic interest")
        key_metrics.append({"metric": "tx_5m", "value": f"{tx_5m} txs", "significance": "medium"})
    
    # Freshness explanation
    if age_hours < 1:
        reasons.append("Very fresh token - early entry opportunity")
        key_metrics.append({"metric": "age", "value": f"{age_hours*60:.0f} min", "significance": "high"})
    elif age_hours < 6:
        reasons.append("Recent launch - still in early price discovery")
        key_metrics.append({"metric": "age", "value": f"{age_hours:.1f}h", "significance": "medium"})
    elif age_hours > 24:
        reasons.append("Mature token with established trading history")
        key_metrics.append({"metric": "age", "value": f"{age_hours:.1f}h", "significance": "neutral"})
    
    # Profile quality explanation
    if dex_quality.get("quality_score", 0) >= 75:
        reasons.append("Verified profile with image, socials and website")
        key_metrics.append({"metric": "profile", "value": f"{dex_quality['quality_score']}/100", "significance": "high"})
    elif dex_quality.get("has_image") and dex_quality.get("has_socials"):
        reasons.append("Social presence detected - community building")
        key_metrics.append({"metric": "profile", "value": "partial", "significance": "medium"})
    
    # Risk caveats
    risk_caveats = []
    if "very_low_liquidity" in risks:
        risk_caveats.append("Extremely low liquidity - high risk of loss")
    if "low_activity" in risks:
        risk_caveats.append("Low transaction count - possible bot activity")
    if "dumping" in risks:
        risk_caveats.append("Price declining - potential sell pressure")
    if candidate.get("recycled"):
        risk_caveats.append("Token recycled from previous scan - not truly new")
    
    # Confidence score explanation
    cio_score = candidate.get("scores", {}).get("cio_score", 0)
    if cio_score >= 80:
        confidence_desc = "High confidence - multiple positive indicators aligned"
    elif cio_score >= 60:
        confidence_desc = "Moderate confidence - some positive signals present"
    else:
        confidence_desc = "Low confidence - speculative entry"
    
    return {
        "summary": reasons[0] if reasons else "Standard scan detection",
        "reasons": reasons,
        "key_metrics": key_metrics,
        "risk_caveats": risk_caveats,
        "confidence_description": confidence_desc,
        "signal_quality": "high" if cio_score >= 80 else "medium" if cio_score >= 60 else "low"
    }

def check_dexscreener_quality(pair):
    """Check if DexScreener profile is complete (info, image, socials)"""
    quality = {
        "has_profile": False,
        "has_image": False,
        "has_socials": False,
        "has_website": False,
        "quality_score": 0
    }
    
    info = pair.get("info", {})
    
    # Check for profile image
    if info.get("imageUrl"):
        quality["has_image"] = True
        quality["quality_score"] += 25
    
    # Check for socials
    socials = info.get("socials", [])
    if socials and len(socials) > 0:
        quality["has_socials"] = True
        quality["quality_score"] += 25
    
    # Check for website
    websites = info.get("websites", [])
    if websites and len(websites) > 0:
        quality["has_website"] = True
        quality["quality_score"] += 25
    
    # Check if overall profile exists
    if quality["has_image"] or quality["has_socials"] or quality["has_website"]:
        quality["has_profile"] = True
        quality["quality_score"] += 25
    
    return quality

def fetch_search_pairs():
    """Source 1: Search popular pairs (the 'rake')"""
    print("[SCANNER] Source 1: Search rake...")
    
    # Popular search terms that catch new pairs - expanded for more coverage
    # Use "new" to get latest pairs across all chains, then filter for Base
    search_terms = ["new", "trending", "WETH", "USDC", "ETH", "1000000", "0x", "BASE", "AERO", "CLANKER", "VIRTUAL", "DEGEN", "BRETT", "MIGGLES", "BARNEY", "TOSHI", "GIGA"]
    all_pairs = []
    
    for term in search_terms[:8]:  # Increased for more coverage
        results = get_json(f"{BASE_URL}/latest/dex/search?q={term}")
        if results and isinstance(results, dict):
            pairs = results.get("pairs", [])
            # Filter Base chain
            base_pairs = [p for p in pairs if (p.get("chainId") or "").lower() == CHAIN]
            if base_pairs:
                print(f"[SCANNER]   '{term}' -> {len(base_pairs)} Base pairs")
            all_pairs.extend(base_pairs)
        time.sleep(0.2)
    
    # Deduplicate by pair address
    seen = set()
    unique = []
    for p in all_pairs:
        addr = p.get("pairAddress", "").lower()
        if addr and addr not in seen:
            seen.add(addr)
            unique.append({"pair": p, "source": "search"})
    
    print(f"[SCANNER] Source 1: {len(unique)} unique pairs")
    return unique

def fetch_token_profiles():
    """Source 2: Token profiles"""
    print("[SCANNER] Source 2: Token profiles...")
    profiles = get_json(f"{BASE_URL}/token-profiles/latest/v1")
    if not profiles:
        return []
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles") or profiles.get("data") or []
    
    base_profiles = [p for p in profiles if (p.get("chainId") or "").lower() == CHAIN][:50]
    results = []
    
    for p in base_profiles:
        token = p.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list) and len(pairs) > 0:
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "profiles", "profile": p})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 2: {len(results)} pairs")
    return results

def fetch_boosted():
    """Source 3: Boosted tokens"""
    print("[SCANNER] Source 3: Boosted tokens...")
    boosts = get_json(f"{BASE_URL}/token-boosts/latest/v1")
    if not boosts:
        return []
    if isinstance(boosts, dict):
        boosts = boosts.get("boosts") or boosts.get("data") or []
    
    base_boosts = [b for b in boosts if (b.get("chainId") or "").lower() == CHAIN][:30]
    results = []
    
    for b in base_boosts:
        token = b.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list) and len(pairs) > 0:
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "boosts", "boost": b})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 3: {len(results)} pairs")
    return results

def fetch_community_takeovers():
    """Source 4: Community takeovers (trending)"""
    print("[SCANNER] Source 4: Community takeovers...")
    ctos = get_json(f"{BASE_URL}/community-takeovers/latest/v1")
    if not ctos:
        return []
    if isinstance(ctos, dict):
        ctos = ctos.get("takeovers") or ctos.get("data") or []
    
    base_ctos = [c for c in ctos if (c.get("chainId") or "").lower() == CHAIN][:20]
    results = []
    
    for c in base_ctos:
        token = c.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list) and len(pairs) > 0:
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "community", "cto": c})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 4: {len(results)} pairs")
    return results

def fetch_ads():
    """Source 5: Advertised tokens (high activity)"""
    print("[SCANNER] Source 5: Advertised tokens...")
    ads = get_json(f"{BASE_URL}/ads/latest/v1")
    if not ads:
        return []
    if isinstance(ads, dict):
        ads = ads.get("ads") or ads.get("data") or []
    
    base_ads = [a for a in ads if (a.get("chainId") or "").lower() == CHAIN][:20]
    results = []
    
    for a in base_ads:
        token = a.get("tokenAddress")
        if not token:
            continue
        pairs = get_json(f"{BASE_URL}/token-pairs/v1/{CHAIN}/{token}")
        if pairs and isinstance(pairs, list) and len(pairs) > 0:
            best = max(pairs, key=lambda x: safe_num((x.get("liquidity") or {}).get("usd"), 0))
            results.append({"pair": best, "source": "ads", "ad": a})
        time.sleep(0.1)
    
    print(f"[SCANNER] Source 5: {len(results)} pairs")
    return results


# GeckoTerminal API integration
GECKO_API = "https://api.geckoterminal.com/api/v2"
GECKO_HEADERS = {"Accept": "application/json;version=20230203"}

def get_gecko_json(url, max_retries=2):
    """Fetch from GeckoTerminal API with rate limit handling"""
    for attempt in range(max_retries + 1):
        try:
            r = requests.get(url, timeout=TIMEOUT, headers=GECKO_HEADERS)
            
            if r.status_code == 429:
                wait = 2 * (attempt + 1)
                print(f"[SCANNER]   GeckoTerminal rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
                
            r.raise_for_status()
            return r.json()
        except requests.exceptions.HTTPError as e:
            if r.status_code == 429:
                wait = 2 * (attempt + 1)
                print(f"[SCANNER]   GeckoTerminal rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"[SCANNER] GeckoTerminal error {url}: {e}")
            return None
        except Exception as e:
            print(f"[SCANNER] GeckoTerminal error {url}: {e}")
            return None
    return None

def fetch_geckoterminal_trending():
    """Source 6: GeckoTerminal trending pools (FALLBACK)"""
    print("[SCANNER] Source 6: GeckoTerminal trending pools (fallback)...")
    
    url = f"{GECKO_API}/networks/base/trending_pools?page=1&limit=30"
    data = get_gecko_json(url)
    
    if not data or "data" not in data:
        print("[SCANNER]   No data from GeckoTerminal")
        return []
    
    results = []
    
    for pool in data.get("data", []):
        attrs = pool.get("attributes", {})
        relationships = pool.get("relationships", {})
        
        # Get base token info
        base_token_data = relationships.get("base_token", {}).get("data", {})
        token_addr = base_token_data.get("id", "").replace("base_", "")
        
        if not token_addr:
            continue
        
        # Get quote token info
        quote_token_data = relationships.get("quote_token", {}).get("data", {})
        quote_addr = quote_token_data.get("id", "").replace("base_", "")
        
        # Build normalized pair structure matching DexScreener format
        pool_name = attrs.get("name", "")
        symbol = pool_name.split(" / ")[0] if " / " in pool_name else "UNKNOWN"
        quote_symbol = pool_name.split(" / ")[1] if " / " in pool_name else ""
        
        # Normalize liquidity
        liq = float(attrs.get("reserve_in_usd", 0) or 0)
        
        # Skip bluechips (quote token is not a known bluechip)
        bluechips = {"USDC", "USDT", "WETH", "WBTC", "DAI"}
        if quote_symbol.upper() in bluechips:
            # Only include if liquidity is reasonable for memecoin
            pass  # Accept it
        
        # Get volumes - GeckoTerminal provides different timeframes
        vol_5m = float(attrs.get("volume_usd", {}).get("m5", 0) or 0)
        vol_1h = float(attrs.get("volume_usd", {}).get("h1", 0) or 0)
        vol_24h = float(attrs.get("volume_usd", {}).get("h24", 0) or 0)
        
        # Get transactions
        tx_5m_data = attrs.get("transactions", {}).get("m5", {})
        tx_5m = (tx_5m_data.get("buys", 0) or 0) + (tx_5m_data.get("sells", 0) or 0)
        
        tx_1h_data = attrs.get("transactions", {}).get("h1", {})
        tx_1h = (tx_1h_data.get("buys", 0) or 0) + (tx_1h_data.get("sells", 0) or 0)
        
        # Get price data
        price_usd = float(attrs.get("base_token_price_usd", 0) or 0)
        price_change_1h = float(attrs.get("price_change_percentage", {}).get("h1", 0) or 0)
        
        # Pool creation time
        pool_created = attrs.get("pool_created_at", "")
        pair_created_ms = 0
        if pool_created:
            try:
                from datetime import datetime
                pair_created_ms = int(datetime.fromisoformat(pool_created.replace("Z", "+00:00")).timestamp() * 1000)
            except:
                pair_created_ms = now_ms()
        
        # Build normalized pair structure
        normalized_pair = {
            "pairAddress": attrs.get("address", ""),
            "chainId": "base",
            "dexId": relationships.get("dex", {}).get("data", {}).get("id", ""),
            "baseToken": {
                "address": token_addr,
                "symbol": symbol,
                "name": symbol  # GeckoTerminal doesn't provide full name separately
            },
            "quoteToken": {
                "address": quote_addr,
                "symbol": quote_symbol
            },
            "liquidity": {
                "usd": liq
            },
            "volume": {
                "m5": vol_5m,
                "h1": vol_1h,
                "h24": vol_24h
            },
            "txns": {
                "m5": {"buys": tx_5m_data.get("buys", 0), "sells": tx_5m_data.get("sells", 0)},
                "h1": {"buys": tx_1h_data.get("buys", 0), "sells": tx_1h_data.get("sells", 0)}
            },
            "priceUsd": price_usd,
            "priceChange": {
                "h1": price_change_1h
            },
            "pairCreatedAt": pair_created_ms,
            "info": {
                "imageUrl": None,
                "socials": [],
                "websites": []
            },
            "_geckoterminal": True  # Marker for source identification
        }
        
        results.append({"pair": normalized_pair, "source": "geckoterminal_trending"})
    
    print(f"[SCANNER] Source 6: {len(results)} pairs from GeckoTerminal")
    return results

def fetch_geckoterminal_new():
    """Source 7: GeckoTerminal new pools (FALLBACK)"""
    print("[SCANNER] Source 7: GeckoTerminal new pools (fallback)...")
    
    url = f"{GECKO_API}/networks/base/new_pools?page=1&limit=30"
    data = get_gecko_json(url)
    
    if not data or "data" not in data:
        print("[SCANNER]   No data from GeckoTerminal new pools")
        return []
    
    results = []
    
    for pool in data.get("data", []):
        attrs = pool.get("attributes", {})
        relationships = pool.get("relationships", {})
        
        base_token_data = relationships.get("base_token", {}).get("data", {})
        token_addr = base_token_data.get("id", "").replace("base_", "")
        
        if not token_addr:
            continue
        
        quote_token_data = relationships.get("quote_token", {}).get("data", {})
        quote_addr = quote_token_data.get("id", "").replace("base_", "")
        
        pool_name = attrs.get("name", "")
        symbol = pool_name.split(" / ")[0] if " / " in pool_name else "UNKNOWN"
        quote_symbol = pool_name.split(" / ")[1] if " / " in pool_name else ""
        
        liq = float(attrs.get("reserve_in_usd", 0) or 0)
        vol_5m = float(attrs.get("volume_usd", {}).get("m5", 0) or 0)
        vol_1h = float(attrs.get("volume_usd", {}).get("h1", 0) or 0)
        vol_24h = float(attrs.get("volume_usd", {}).get("h24", 0) or 0)
        
        tx_5m_data = attrs.get("transactions", {}).get("m5", {})
        tx_5m = (tx_5m_data.get("buys", 0) or 0) + (tx_5m_data.get("sells", 0) or 0)
        
        tx_1h_data = attrs.get("transactions", {}).get("h1", {})
        tx_1h = (tx_1h_data.get("buys", 0) or 0) + (tx_1h_data.get("sells", 0) or 0)
        
        price_usd = float(attrs.get("base_token_price_usd", 0) or 0)
        price_change_1h = float(attrs.get("price_change_percentage", {}).get("h1", 0) or 0)
        
        pool_created = attrs.get("pool_created_at", "")
        pair_created_ms = 0
        if pool_created:
            try:
                from datetime import datetime
                pair_created_ms = int(datetime.fromisoformat(pool_created.replace("Z", "+00:00")).timestamp() * 1000)
            except:
                pair_created_ms = now_ms()
        
        normalized_pair = {
            "pairAddress": attrs.get("address", ""),
            "chainId": "base",
            "dexId": relationships.get("dex", {}).get("data", {}).get("id", ""),
            "baseToken": {
                "address": token_addr,
                "symbol": symbol,
                "name": symbol
            },
            "quoteToken": {
                "address": quote_addr,
                "symbol": quote_symbol
            },
            "liquidity": {
                "usd": liq
            },
            "volume": {
                "m5": vol_5m,
                "h1": vol_1h,
                "h24": vol_24h
            },
            "txns": {
                "m5": {"buys": tx_5m_data.get("buys", 0), "sells": tx_5m_data.get("sells", 0)},
                "h1": {"buys": tx_1h_data.get("buys", 0), "sells": tx_1h_data.get("sells", 0)}
            },
            "priceUsd": price_usd,
            "priceChange": {
                "h1": price_change_1h
            },
            "pairCreatedAt": pair_created_ms,
            "info": {
                "imageUrl": None,
                "socials": [],
                "websites": []
            },
            "_geckoterminal": True
        }
        
        results.append({"pair": normalized_pair, "source": "geckoterminal_new"})
    
    print(f"[SCANNER] Source 7: {len(results)} pairs from GeckoTerminal new pools")
    return results

def process_candidate(item, registry):
    """Process a candidate - ULTRA LAUNCH MODE (permissive)"""
    pair = item["pair"]
    source = item.get("source", "unknown")
    
    # Get basic info
    pair_addr = pair.get("pairAddress", "").lower()
    token = pair.get("baseToken") or pair.get("token") or {}
    token_addr = (token.get("address") or "").lower()
    token_symbol = token.get("symbol", "UNKNOWN")
    
    if not token_addr:
        return None, "no_token"
    
    # Check quote token (permissive - allow more pairs)
    quote = pair.get("quoteToken") or {}
    quote_symbol = quote.get("symbol", "")
    
    # Get pair creation time
    pair_created = pair.get("pairCreatedAt") or 0
    
    # Debug: print pair_created if it's 0
    if not pair_created:
        # Try to estimate from registry
        token_meta = registry["tokens"].get(token_addr, {})
        pair_created = token_meta.get("first_seen", now_ms())
    
    # Calculate age - use token_first_seen from registry if available (when LURKER first saw this token)
    # Otherwise use pair_created. This prevents rejecting tokens that were just discovered but have old pairs
    token_meta = registry["tokens"].get(token_addr, {})
    first_seen_ms = token_meta.get("first_seen", pair_created)
    
    age_ms = now_ms() - first_seen_ms
    age_min = age_ms / 60000
    age_h = age_ms / 3600000
    
    # ULTRA LAUNCH: be more permissive with age
    # Accept tokens up to 7 days (much more lenient for Base ecosystem)
    MAX_AGE_ULTRA = 10080  # 7 days in minutes
    liq = safe_num((pair.get("liquidity") or {}).get("usd"), 0)
    
    if age_min > MAX_AGE_ULTRA:
        # Exception: keep tokens with $3k+ liquidity even if older (Base ecosystem is mature)
        if liq >= 3000 and age_min <= 525600:  # Up to 1 year if liq >= $3k
            pass  # Accept it
        else:
            return None, "too_old"
    
    # Check if truly new (anti-relist) - RELAXED for ULTRA LAUNCH
    # Extended from 48h to 168h (7 days) to allow rediscovery of older tokens
    # This prevents missing opportunities in the mature Base ecosystem
    is_new, token_meta = True, {"first_seen": now_ms(), "first_seen_iso": iso()}
    if token_addr in registry["tokens"]:
        first_seen = registry["tokens"][token_addr]["first_seen"]
        token_age_h = (now_ms() - first_seen) / 3600000
        # RELAXED: Allow tokens seen up to 7 days ago to be rediscovered
        # This is critical for Base where many tokens are already known
        if token_age_h > 168:  # Seen more than 7 days ago = truly known
            return None, "known_token"
        # Partial recycle: tokens 48h-168h old get "recycled" status
        if token_age_h > 48:
            token_meta = registry["tokens"][token_addr]
            token_meta["recycled"] = True
            token_meta["recycled_at"] = iso()
            is_new = False  # Not truly new, but recycled
        else:
            is_new = False
            token_meta = registry["tokens"][token_addr]
    else:
        registry["tokens"][token_addr] = token_meta
    
    # Get metrics
    liq = safe_num((pair.get("liquidity") or {}).get("usd"), 0)
    vol_5m = safe_num((pair.get("volume") or {}).get("m5"), 0)
    vol_1h = safe_num((pair.get("volume") or {}).get("h1"), 0)
    tx_5m = (pair.get("txns") or {}).get("m5") or {}
    tx_count_5m = (tx_5m.get("buys") or 0) + (tx_5m.get("sells") or 0)
    price_usd = safe_num(pair.get("priceUsd"), 0)
    
    # Track price history for Hall of Fame
    if "price_history" not in token_meta:
        token_meta["price_history"] = []
    
    # Add price point (limit to 100 points to avoid bloat)
    token_meta["price_history"].append({
        "timestamp": now_ms(),
        "price": price_usd,
        "liq": liq,
        "vol_5m": vol_5m
    })
    if len(token_meta["price_history"]) > 100:
        token_meta["price_history"] = token_meta["price_history"][-100:]
    
    # Store token info
    token_meta["token"] = {
        "address": token_addr,
        "symbol": token_symbol,
        "name": token.get("name", "")
    }
    
    # ULTRA LAUNCH thresholds (more permissive)
    if liq < MIN_LIQ_USD:
        return None, "low_liq"
    if vol_5m < MIN_VOLUME_5M and vol_1h < MIN_VOLUME_5M:
        return None, "low_volume"
    if tx_count_5m < MIN_TX_5M:
        return None, "low_tx"
    
    # Calculate risk tags
    risks = calculate_risk_tags(pair)
    
    # Check DexScreener profile quality
    dex_quality = check_dexscreener_quality(pair)
    
    # Score (higher = better)
    score = 50  # Base
    if age_h < 1: score += 30
    elif age_h < 10: score += 20
    elif age_h < 30: score += 10
    
    if liq > 10000: score += 15
    elif liq > 5000: score += 10
    elif liq > 2000: score += 5
    
    if vol_5m > 1000: score += 10
    if tx_count_5m > 10: score += 10
    
    if source == "boosts": score += 5
    
    # Bonus for complete DexScreener profile (quality indicator)
    score += dex_quality["quality_score"] // 4  # Up to +25 points
    
    # Build candidate dict (without explanation first - will be added after)
    candidate = {
        "token": {
            "address": token_addr,
            "symbol": token_symbol,
            "name": token.get("name", ""),
        },
        "pair": {
            "address": pair_addr,
            "dex": pair.get("dexId", ""),
            "quote": quote_symbol,
        },
        "metrics": {
            "liq_usd": liq,
            "vol_5m_usd": vol_5m,
            "vol_1h_usd": vol_1h,
            "txns_5m": tx_count_5m,
            "price_usd": price_usd,
        },
        "timestamps": {
            "pair_created_at": iso(pair_created),
            "token_first_seen": token_meta["first_seen_iso"],
            "age_minutes": round(age_min, 1),
            "age_hours": round(age_h, 2),
        },
        "scores": {
            "cio_score": min(score, 100),
            "freshness": round(max(0, 1 - age_h/60), 2),
        },
        "risks": risks,
        "risk_level": "high" if len(risks) >= 3 else "medium" if len(risks) >= 1 else "low",
        "source": source,
        "status": "observing",
        "quality": dex_quality,  # DexScreener profile quality
        "is_recycled": token_meta.get("recycled", False),
    }
    
    # Generate explanation of WHY this token was selected
    candidate["explanation"] = generate_signal_explanation(candidate, source, risks, dex_quality)
    
    return candidate, None

def scan():
    """Main scan - ULTRA LAUNCH MODE"""
    print("=" * 60)
    print("[SCANNER] LURKER CIO Scanner - ULTRA LAUNCH MODE")
    print(f"[SCANNER] Thresholds: liq>${MIN_LIQ_USD}, vol>${MIN_VOLUME_5M}, tx>{MIN_TX_5M}")
    print("=" * 60)
    
    t0 = now_ms()
    registry = load_token_registry()
    
    # Fetch all sources (5 sources for maximum coverage)
    all_items = []
    all_items.extend(fetch_search_pairs())           # Source 1: Search
    all_items.extend(fetch_token_profiles())         # Source 2: Profiles
    all_items.extend(fetch_boosted())                # Source 3: Boosted
    all_items.extend(fetch_community_takeovers())    # Source 4: CTOs
    all_items.extend(fetch_ads())                    # Source 5: Ads
    
    print(f"\n[SCANNER] Total raw from DexScreener: {len(all_items)} items")
    
    # FALLBACK: Use GeckoTerminal if DexScreener returns limited results
    # Trigger fallback if we have less than 15 raw items (indicates rate limiting or calm market)
    if len(all_items) < 15:
        print(f"[SCANNER] ⚠️ Low DexScreener results ({len(all_items)}), activating GeckoTerminal fallback...")
        gecko_items = []
        gecko_items.extend(fetch_geckoterminal_trending())  # Source 6
        gecko_items.extend(fetch_geckoterminal_new())       # Source 7
        
        # Merge GeckoTerminal results, avoiding duplicates
        existing_tokens = set()
        for item in all_items:
            token = item["pair"].get("baseToken") or item["pair"].get("token") or {}
            token_addr = (token.get("address") or "").lower()
            if token_addr:
                existing_tokens.add(token_addr)
        
        added_count = 0
        for item in gecko_items:
            token = item["pair"].get("baseToken") or item["pair"].get("token") or {}
            token_addr = (token.get("address") or "").lower()
            if token_addr and token_addr not in existing_tokens:
                all_items.append(item)
                existing_tokens.add(token_addr)
                added_count += 1
        
        print(f"[SCANNER]   Added {added_count} unique tokens from GeckoTerminal")
    
    print(f"[SCANNER] Total raw (after fallback): {len(all_items)} items")
    
    # Process and dedupe
    candidates = []
    rejected = defaultdict(int)
    seen_tokens = set()
    
    for item in all_items:
        pair = item["pair"]
        token = pair.get("baseToken") or pair.get("token") or {}
        token_addr = (token.get("address") or "").lower()
        
        if not token_addr or token_addr in seen_tokens:
            rejected["duplicate" if token_addr else "no_token"] += 1
            continue
        
        candidate, reason = process_candidate(item, registry)
        if candidate:
            candidates.append(candidate)
            seen_tokens.add(token_addr)
        else:
            rejected[reason] += 1
    
    # Save registry
    save_token_registry(registry)
    
    # Sort by score (freshness prioritized)
    candidates.sort(key=lambda x: (x["scores"]["cio_score"], -x["timestamps"]["age_minutes"]), reverse=True)
    
    # Keep top 50 (more than before)
    candidates = candidates[:50]
    
    # Count by risk
    risk_counts = defaultdict(int)
    for c in candidates:
        risk_counts[c["risk_level"]] += 1
    
    # Send Telegram alerts for high-risk tokens
    try:
        import risk_alerts
        for c in candidates:
            if c["risk_level"] == "high":
                risk_alerts.check_and_alert(c)
    except Exception as e:
        print(f"[SCANNER] Alert error: {e}")
    
    # Determine status
    if len(candidates) > 0:
        status = "ok"
    elif len(all_items) == 0:
        status = "degraded"  # No raw data from any source
    else:
        status = "calm"  # Data available but no candidates passed filters
    
    # Check if we used fallback
    used_fallback = any(item.get("source", "").startswith("geckoterminal") for item in all_items)
    gecko_count = sum(1 for item in all_items if item.get("source", "").startswith("geckoterminal"))
    
    # Build feed
    feed = {
        "schema": "lurker_cio_ultra_launch",
        "meta": {
            "updated_at": iso(),
            "generated_at": iso(),  # For health check freshness validation
            "status": status,
            "count": len(candidates),
            "thresholds": {
                "min_liq_usd": MIN_LIQ_USD,
                "min_vol_5m": MIN_VOLUME_5M,
                "min_tx_5m": MIN_TX_5M,
                "max_age_min": MAX_AGE_MINUTES,
            },
            "risk_distribution": dict(risk_counts),
            "rejected": dict(rejected),
            "source": "ultra_launch_scanner",
            "fallback": {
                "used": used_fallback,
                "geckoterminal_items": gecko_count,
                "trigger": "low_dexscreener_results" if used_fallback else None
            }
        },
        "candidates": candidates,
    }
    
    # Save CIO feed
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CIO_FILE, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    
    # ALSO save live_feed.json for dashboard with proper filtering and mapping
    LIVE_FEED = CIO_FILE.parent / "live_feed.json"
    live_signals = []
    
    # Filter: only include tokens with recent activity (volume in last 1h > $0)
    # Sort by quality score (descending) to show top performers
    valid_candidates = [c for c in candidates if c['metrics'].get('vol_1h_usd', 0) > 0]
    valid_candidates.sort(key=lambda x: x['scores']['cio_score'], reverse=True)
    
    # Keep only top 20 performers
    top_candidates = valid_candidates[:20]
    
    for c in top_candidates:
        vol_1h = c['metrics'].get('vol_1h_usd', 0)
        live_signals.append({
            'address': c['token']['address'],
            'symbol': c['token']['symbol'],
            'name': c['token'].get('name', ''),
            'liquidity_usd': c['metrics']['liq_usd'],
            'volume_1h': vol_1h,
            'volume_5m': c['metrics'].get('vol_5m_usd', 0),
            'quality_score': c['scores']['cio_score'],
            'age_minutes': c['timestamps']['age_minutes'],
            'age_hours': round(c['timestamps']['age_minutes'] / 60, 1),
            'detected_at': c['timestamps'].get('token_first_seen', c['timestamps'].get('pair_created_at', iso())),
            'risk_level': c['risk_level'],
            'source': c.get('source', 'unknown')
        })
    
    live_feed = {
        'meta': {
            'updated_at': iso(),
            'source': 'cio_scanner',
            'chain': CHAIN,
            'count': len(live_signals),
            'filters': {
                'min_volume_1h': 0,
                'max_results': 20,
                'sort_by': 'quality_score'
            },
            'errors': []
        },
        'signals': live_signals
    }
    with open(LIVE_FEED, 'w') as f:
        json.dump(live_feed, f, indent=2)
    
    print(f"\n[SCANNER] ✅ Candidates: {len(candidates)}")
    print(f"[SCANNER] Risk: {dict(risk_counts)}")
    print(f"[SCANNER] Rejected: {dict(rejected)}")
    print(f"[SCANNER] Time: {(now_ms()-t0)/1000:.1f}s")
    
    for c in candidates[:5]:
        print(f"  • {c['token']['symbol']}: score={c['scores']['cio_score']}, "
              f"age={c['timestamps']['age_minutes']:.0f}m, "
              f"liq=${c['metrics']['liq_usd']:,.0f}, "
              f"risk={c['risk_level']}, source={c['source']}")

def write_fail(msg: str):
    import traceback
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "lurker_cio_ultra_launch",
        "meta": {
            "updated_at": iso(),
            "status": "error",
            "count": 0,
            "error": msg[:500],
            "trace": traceback.format_exc()[-500:],
        },
        "candidates": [],
    }
    CIO_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[SCANNER] ⚠️ Error handled: {msg[:200]}")

if __name__ == "__main__":
    try:
        scan()
    except Exception as e:
        write_fail(f"scanner crashed: {repr(e)}")
        sys.exit(1)  # Exit 1 for total crash
