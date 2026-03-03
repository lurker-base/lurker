#!/usr/bin/env python3
"""
LURKER Scanner V2 - GeckoTerminal API pour Base
Remplace DexScreener qui ne retourne plus de tokens frais
"""
import json
import sys
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

# CONFIG
BASE_URL = "https://api.geckoterminal.com/api/v2/networks/base"
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
STATE_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"
SEEN_FILE = Path(__file__).parent.parent / "state" / "seen_tokens.json"

# SEUILS - Ultra permissifs pour Base
MIN_LIQ_USD = 5000         # $5k minimum
MIN_VOLUME_24H = 1000      # $1k volume 24h
MIN_TX_24H = 5             # 5 transactions min
MAX_AGE_HOURS = 48         # 48h max (tokens très frais)

TIMEOUT = 20

# DexScreener validation
DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/tokens"

def validate_token_dexscreener(address):
    """
    Cross-check token with DexScreener to validate liquidity and detect rugs
    Returns: (is_valid, reason, dex_data)
    """
    try:
        resp = requests.get(f"{DEXSCREENER_API}/{address}", timeout=10)
        if resp.status_code != 200:
            return True, None, None  # Allow if API fails
        
        data = resp.json()
        pairs = data.get('pairs', [])
        
        if not pairs:
            return False, "no_pairs", None
        
        # Get the best pair (highest liquidity)
        best_pair = max(pairs, key=lambda p: p.get('liquidity', {}).get('usd', 0))
        liquidity = best_pair.get('liquidity', {}).get('usd', 0)
        price_change = best_pair.get('priceChange', {}).get('h24', 0)
        
        # Reject if liquidity too low on DexScreener (even if GeckoTerminal says different)
        if liquidity < 1000:
            return False, f"low_liq_dexscreener_${liquidity:.0f}", best_pair
        
        # Reject if massive dump (>80% in 24h) - potential rug
        if price_change < -80:
            return False, f"dump_{price_change}%", best_pair
        
        return True, None, best_pair
        
    except Exception as e:
        print(f"[WARN] DexScreener validation failed: {e}")
        return True, None, None  # Allow if validation fails

def now_ms():
    return int(time.time() * 1000)

def iso(ts=None):
    if ts is None:
        ts = datetime.now(timezone.utc)
    return ts.isoformat()

def load_json(fpath, default=None):
    if default is None:
        default = {}
    try:
        if fpath.exists():
            return json.loads(fpath.read_text())
    except:
        pass
    return default

def save_json(fpath, data):
    fpath.parent.mkdir(parents=True, exist_ok=True)
    fpath.write_text(json.dumps(data, indent=2))

def get_new_pools():
    """Récupère les nouveaux pools Base depuis GeckoTerminal"""
    pools = []
    try:
        # New pools
        resp = requests.get(f"{BASE_URL}/new_pools?page=1", timeout=TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            pools.extend(data.get('data', []))
        
        # Trending pools
        resp = requests.get(f"{BASE_URL}/trending_pools", timeout=TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            pools.extend(data.get('data', []))
            
    except Exception as e:
        print(f"[ERROR] API GeckoTerminal: {e}")
    
    return pools

def parse_pool(pool_data):
    """Extrait les infos pertinentes d'un pool"""
    attrs = pool_data.get('attributes', {})
    
    # Token info
    name = attrs.get('name', '')
    tokens = name.split(' / ') if ' / ' in name else [name]
    base_token = tokens[0] if tokens else 'UNKNOWN'
    quote_token = tokens[1] if len(tokens) > 1 else 'UNKNOWN'
    
    # Skip si pas un bon pair (on veut des tokens contre WETH/USDC)
    if quote_token not in ['WETH', 'USDC', 'USDbC']:
        return None, 'bad_quote'
    
    # Metrics
    liq_usd = float(attrs.get('reserve_in_usd', 0) or 0)
    vol_24h = float(attrs.get('volume_usd', {}).get('h24', 0) or 0)
    tx_data = attrs.get('transactions', {})
    tx_24h = tx_data.get('h24', {}).get('buys', 0) + tx_data.get('h24', {}).get('sells', 0) if isinstance(tx_data, dict) else 0
    
    # Age
    created_str = attrs.get('pool_created_at', '')
    age_hours = 999
    if created_str:
        try:
            created = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
            age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
        except:
            pass
    
    # Token address
    relationships = pool_data.get('relationships', {})
    base_token_data = relationships.get('base_token', {}).get('data', {})
    token_address = base_token_data.get('id', '').replace('base_', '')
    
    return {
        'token_symbol': base_token,
        'token_address': token_address,
        'quote_token': quote_token,
        'liquidity_usd': liq_usd,
        'volume_24h': vol_24h,
        'tx_24h': tx_24h,
        'age_hours': age_hours,
        'pool_address': attrs.get('address', ''),
        'created_at': created_str
    }, None

def score_token(token_data, dex_data=None):
    """Calcule un score 0-100"""
    score = 50  # Base
    
    # Age (plus jeune = mieux)
    age = token_data['age_hours']
    if age < 1:
        score += 30
    elif age < 6:
        score += 20
    elif age < 24:
        score += 10
    
    # Liquidité
    liq = token_data['liquidity_usd']
    if liq > 50000:
        score += 20
    elif liq > 20000:
        score += 15
    elif liq > 10000:
        score += 10
    
    # Volume
    vol = token_data['volume_24h']
    if vol > 100000:
        score += 15
    elif vol > 50000:
        score += 10
    elif vol > 10000:
        score += 5
    
    # Price action bonus (from DexScreener)
    if dex_data:
        # DexScreener returns priceChange as dict with h24 key
        pc = 0
        if isinstance(dex_data.get('priceChange'), dict):
            pc = dex_data.get('priceChange', {}).get('h24', 0)
        elif isinstance(dex_data.get('priceChange'), (int, float)):
            pc = dex_data.get('priceChange', 0)
        
        if pc > 50:  # Strong pump
            score += 15
        elif pc > 20:
            score += 10
        elif pc < -50:  # Dump
            score -= 20
        elif pc < -20:
            score -= 10
    
    return min(100, max(0, score))

def calculate_risk(token_data, dex_data=None):
    """Calcule le niveau de risque"""
    risks = []
    
    if token_data['age_hours'] < 1:
        risks.append('ultra_new')
    if token_data['liquidity_usd'] < 10000:
        risks.append('low_liq')
    if token_data['tx_24h'] < 20:
        risks.append('low_activity')
    
    # Check DexScreener for dumps/rugs
    if dex_data:
        # Check liquidity (already validated but double check)
        liquidity = dex_data.get('liquidity', {}).get('usd', 0)
        if liquidity < 1000:
            risks.append('rugged')
        
        # Check price change
        pc = 0
        if isinstance(dex_data.get('priceChange'), dict):
            pc = dex_data.get('priceChange', {}).get('h24', 0)
        elif isinstance(dex_data.get('priceChange'), (int, float)):
            pc = dex_data.get('priceChange', 0)
        
        if pc < -80:
            risks.append('heavy_dump')
    
    if 'rugged' in risks or len(risks) >= 3:
        return 'high'
    elif len(risks) >= 2:
        return 'medium'
    return 'low'

def calculate_badges(token_data, dex_data=None):
    """
    Calcule les badges pour un token
    Returns: list of badge strings
    """
    badges = []
    
    # Age badges
    age = token_data['age_hours']
    if age < 0.1:
        badges.append('🔥 SUPER FRESH')
    elif age < 1:
        badges.append('🔥 FRESH')
    elif age < 6:
        badges.append('🆕 NEW')
    
    # Liquidity badges
    liq = token_data['liquidity_usd']
    if liq >= 100000:
        badges.append('💰 WHALE')
    elif liq >= 50000:
        badges.append('💧 DEEP LIQ')
    elif liq >= 20000:
        badges.append('💧 LIQ')
    
    # Volume badges  
    vol = token_data['volume_24h']
    if vol >= 100000:
        badges.append('📈 MOON')
    elif vol >= 50000:
        badges.append('📈 HOT')
    elif vol >= 20000:
        badges.append('📈 ACTIVE')
    
    # Tx badges
    tx = token_data['tx_24h']
    if tx >= 100:
        badges.append('⚡ VIRAL')
    elif tx >= 50:
        badges.append('⚡ BUZZ')
    
    # Price action badges (from DexScreener)
    if dex_data:
        # DexScreener returns priceChange as dict with h24 key
        pc = 0
        if isinstance(dex_data.get('priceChange'), dict):
            pc = dex_data.get('priceChange', {}).get('h24', 0)
        elif isinstance(dex_data.get('priceChange'), (int, float)):
            pc = dex_data.get('priceChange', 0)
        
        if pc > 100:
            badges.append('🚀 MEGA PUMP')
        elif pc > 50:
            badges.append('🚀 PUMP')
        elif pc > 20:
            badges.append('📗 PUMPING')
        elif pc < -80:
            badges.append('💀 RUG')
        elif pc < -50:
            badges.append('📕 HEAVY DUMP')
        elif pc < -20:
            badges.append('📙 DUMPING')
    
    # Premium badges (high score + good metrics)
    score = token_data.get('score', 0)
    if score >= 95 and liq >= 30000 and vol >= 20000:
        badges.append('💎 PREMIUM')
    elif score >= 90 and liq >= 20000:
        badges.append('⭐ GEM')
    
    return badges

def main():
    print("=" * 60)
    print("[LURKER V2] Scanner GeckoTerminal - Base")
    print(f"Seuils: liq>${MIN_LIQ_USD}, vol24h>${MIN_VOLUME_24H}, tx>{MIN_TX_24H}, age<{MAX_AGE_HOURS}h")
    print("=" * 60)
    
    # Load state
    registry = load_json(SEEN_FILE, {'tokens': {}})
    
    # Get pools
    pools = get_new_pools()
    print(f"\n📊 {len(pools)} pools récupérés")
    
    candidates = []
    rejected = {'too_old': 0, 'low_liq': 0, 'low_vol': 0, 'low_tx': 0, 'bad_quote': 0, 'known': 0}
    
    for pool in pools:
        token_data, error = parse_pool(pool)
        
        if error:
            rejected[error] = rejected.get(error, 0) + 1
            continue
        
        # Filtres
        if token_data['age_hours'] > MAX_AGE_HOURS:
            rejected['too_old'] += 1
            continue
        if token_data['liquidity_usd'] < MIN_LIQ_USD:
            rejected['low_liq'] += 1
            continue
        if token_data['volume_24h'] < MIN_VOLUME_24H:
            rejected['low_vol'] += 1
            continue
        if token_data['tx_24h'] < MIN_TX_24H:
            rejected['low_tx'] += 1
            continue
        
        # Check si déjà vu
        addr = token_data['token_address']
        if addr in registry['tokens']:
            first_seen = registry['tokens'][addr].get('first_seen', 0)
            if (now_ms() - first_seen) / 3600000 < 48:  # Vu dans les 48h
                rejected['known'] += 1
                continue
        
        # DexScreener validation - cross-check liquidity and detect rugs FIRST
        is_valid, reject_reason, dex_data = validate_token_dexscreener(addr)
        if not is_valid:
            rejected[reject_reason] = rejected.get(reject_reason, 0) + 1
            print(f"  ⚠️ {token_data['token_symbol']}: REJECTED by DexScreener - {reject_reason}")
            continue
        
        # Calculate score & risk WITH DexScreener data
        token_data['score'] = score_token(token_data, dex_data)
        token_data['risk'] = calculate_risk(token_data, dex_data)
        token_data['detected_at'] = iso()
        
        # Calculate badges
        token_data['badges'] = calculate_badges(token_data, dex_data)
        
        # Mark as seen
        if addr not in registry['tokens']:
            registry['tokens'][addr] = {'first_seen': now_ms(), 'first_seen_iso': iso()}
        
        candidates.append(token_data)
    
    # Save registry
    save_json(SEEN_FILE, registry)
    
    # Sort by score
    candidates.sort(key=lambda x: x['score'], reverse=True)
    
    # Affichage
    print(f"\n✅ Candidates: {len(candidates)}")
    for c in candidates:
        badges_str = ' | '.join(c.get('badges', [])) if c.get('badges') else ''
        print(f"  • {c['token_symbol']}: score={c['score']}, age={c['age_hours']:.1f}h, "
              f"liq=${c['liquidity_usd']:,.0f}, risk={c['risk']} {f'[{badges_str}]' if badges_str else ''}")
    
    print(f"\n❌ Rejected: {rejected}")
    
    # Save to CIO feed (format compatible avec token_importer.py)
    if candidates:
        cio_candidates = []
        for c in candidates:
            cio_candidates.append({
                'token': {
                    'address': c['token_address'],
                    'symbol': c['token_symbol'],
                    'name': c['token_symbol']
                },
                'metrics': {
                    'liq_usd': c['liquidity_usd'],
                    'vol_24h_usd': c['volume_24h'],
                    'txns_24h': c['tx_24h'],
                    'price_usd': 0
                },
                'risk': {
                    'level': c['risk'],
                    'factors': ['new_token'] if c['age_hours'] < 1 else []
                },
                'score': c['score'],
                'age_hours': c['age_hours'],
                'detected_at': c['detected_at'],
                'source': 'geckoterminal_v2',
                'badges': c.get('badges', [])
            })
        
        cio_data = {
            'timestamp': iso(),
            'source': 'geckoterminal_v2',
            'candidates': cio_candidates
        }
        save_json(CIO_FILE, cio_data)
        print(f"\n💾 {len(candidates)} tokens sauvegardés dans CIO feed")
    
    print("\n" + "=" * 60)
    return len(candidates)

if __name__ == '__main__':
    count = main()
    
    # Générer le live feed après le scan
    try:
        import subprocess
        subprocess.run(['node', str(Path(__file__).parent.parent / 'src' / 'generateLiveFeed.js')], 
                      capture_output=True, timeout=10)
    except Exception as e:
        print(f"⚠️ Live feed generation skipped: {e}")
    
    sys.exit(0 if count > 0 else 1)
