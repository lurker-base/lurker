#!/usr/bin/env python3
"""
LURKER On-Chain Scanner — MVP for Base
Scans Factory events (PoolCreated) and builds CIO feed
"""
import json
import os
import time
from datetime import datetime
from pathlib import Path

# Try to import web3, fallback to mock if not available
try:
    from web3 import Web3
    WEB3_AVAILABLE = True
except ImportError:
    WEB3_AVAILABLE = False
    print("[SCANNER] web3 not available, using mock mode")

# Try to import requests for DexScreener
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

# Config
STATE_FILE = Path(__file__).parent.parent / "state" / "scan_state.json"
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"

# Aerodrome Factory on Base
AERODROME_FACTORY = "0x420DD381b31aEf6683db6b902084cB0FFECe40Da"
UNISWAP_V3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"

# Base RPC endpoints (public)
BASE_RPCS = [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://base.llamarpc.com",
]

# ABI for PoolCreated event (Solidly/Aerodrome style)
POOL_CREATED_ABI = [{
    "anonymous": False,
    "inputs": [
        {"indexed": True, "internalType": "address", "name": "token0", "type": "address"},
        {"indexed": True, "internalType": "address", "name": "token1", "type": "address"},
        {"indexed": False, "internalType": "bool", "name": "stable", "type": "bool"},
        {"indexed": False, "internalType": "address", "name": "pool", "type": "address"},
    ],
    "name": "PoolCreated",
    "type": "event",
}]

def load_state():
    """Load scan state"""
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {
        "schema": "lurker_scan_state_v1",
        "chain": "base",
        "last_scanned_block": 0,
        "last_scan_time": datetime.now().isoformat(),
        "factories": {
            "aerodrome": {"last_block": 0}
        },
        "stats": {"total_pools_detected": 0}
    }

def save_state(state):
    """Save scan state"""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def load_cio():
    """Load CIO feed"""
    if CIO_FILE.exists():
        with open(CIO_FILE) as f:
            return json.load(f)
    return {
        "schema": "lurker_cio_v1",
        "last_updated": datetime.now().isoformat(),
        "count": 0,
        "candidates": []
    }

def save_cio(cio):
    """Save CIO feed"""
    CIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    cio["last_updated"] = datetime.now().isoformat()
    cio["count"] = len(cio["candidates"])
    with open(CIO_FILE, 'w') as f:
        json.dump(cio, f, indent=2)

def get_web3():
    """Get web3 connection"""
    if not WEB3_AVAILABLE:
        return None
    for rpc in BASE_RPCS:
        try:
            w3 = Web3(Web3.HTTPProvider(rpc))
            if w3.is_connected():
                return w3
        except Exception as e:
            print(f"[SCANNER] RPC {rpc} failed: {e}")
    return None

def scan_aerodrome(w3, from_block, to_block):
    """Scan Aerodrome factory for PoolCreated events"""
    pools = []
    try:
        factory = w3.eth.contract(address=AERODROME_FACTORY, abi=POOL_CREATED_ABI)
        
        # Get PoolCreated events
        event_filter = factory.events.PoolCreated().create_filter(
            fromBlock=from_block,
            toBlock=to_block
        )
        events = event_filter.get_all_entries()
        
        for event in events:
            args = event.args
            block = event.blockNumber
            tx_hash = event.transactionHash.hex()
            
            pools.append({
                "factory": "aerodrome",
                "pool_address": args.pool,
                "token0": args.token0,
                "token1": args.token1,
                "stable": args.stable,
                "block_number": block,
                "tx_hash": tx_hash,
                "detected_at": datetime.now().isoformat()
            })
        
        print(f"[SCANNER] Aerodrome: {len(pools)} pools from blocks {from_block}-{to_block}")
        
    except Exception as e:
        print(f"[SCANNER] Error scanning Aerodrome: {e}")
    
    return pools

def enrich_pool(w3, pool):
    """Enrich pool data with token info"""
    try:
        # Simple ERC20 ABI for symbol/name
        erc20_abi = [
            {"inputs": [], "name": "symbol", "outputs": [{"type": "string"}], "stateMutability": "view", "type": "function"},
            {"inputs": [], "name": "name", "outputs": [{"type": "string"}], "stateMutability": "view", "type": "function"},
            {"inputs": [], "name": "decimals", "outputs": [{"type": "uint8"}], "stateMutability": "view", "type": "function"},
        ]
        
        # Get token0 info
        t0 = w3.eth.contract(address=pool["token0"], abi=erc20_abi)
        pool["token0_symbol"] = t0.functions.symbol().call()
        pool["token0_name"] = t0.functions.name().call()
        
        # Get token1 info
        t1 = w3.eth.contract(address=pool["token1"], abi=erc20_abi)
        pool["token1_symbol"] = t1.functions.symbol().call()
        pool["token1_name"] = t1.functions.name().call()
        
    except Exception as e:
        print(f"[SCANNER] Error enriching pool: {e}")
        pool["token0_symbol"] = "UNKNOWN"
        pool["token1_symbol"] = "UNKNOWN"
    
    return pool

def is_quote_whitelist(symbol):
    """Check if symbol is in quote whitelist"""
    whitelist = {"WETH", "ETH", "USDC", "USDBC", "cbBTC", "CBETH"}
    return symbol.upper() in whitelist

def enrich_from_dexscreener(pool_address):
    """Fetch pool data from DexScreener"""
    if not REQUESTS_AVAILABLE:
        return None
    
    try:
        url = f"https://api.dexscreener.com/latest/dex/pairs/base/{pool_address}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            pair = data.get("pair") or (data.get("pairs", [])[0] if data.get("pairs") else None)
            if pair:
                return {
                    "price_usd": float(pair.get("priceUsd", 0) or 0),
                    "liq_usd": float(pair.get("liquidity", {}).get("usd", 0) or 0),
                    "vol_24h_usd": float(pair.get("volume", {}).get("h24", 0) or 0),
                    "vol_1h_usd": float(pair.get("volume", {}).get("h1", 0) or 0),
                    "txns_24h": int(pair.get("txns", {}).get("h24", {}).get("buys", 0) or 0) + int(pair.get("txns", {}).get("h24", {}).get("sells", 0) or 0),
                    "txns_1h": int(pair.get("txns", {}).get("h1", {}).get("buys", 0) or 0) + int(pair.get("txns", {}).get("h1", {}).get("sells", 0) or 0),
                    "fdv": float(pair.get("fdv", 0) or 0),
                    "mcap": float(pair.get("marketCap", 0) or 0),
                    "dex_id": pair.get("dexId", "unknown"),
                    "pair_url": pair.get("url", "")
                }
    except Exception as e:
        print(f"[SCANNER] DexScreener error for {pool_address}: {e}")
    return None

def calculate_cio_score(metrics, age_hours):
    """Calculate CIO score based on freshness, liq, vol, txns"""
    import math
    
    # Freshness (0-1): newer is better
    freshness = max(0, 1 - (age_hours / 48))
    
    # Liquidity score (0-1): log scale, ~1M = 1.0
    liq = metrics.get("liq_usd", 0)
    liq_score = min(math.log10(liq + 1) / 6, 1.0) if liq > 0 else 0
    
    # Volume score (0-1): log scale
    vol = metrics.get("vol_24h_usd", 0)
    vol_score = min(math.log10(vol + 1) / 6, 1.0) if vol > 0 else 0
    
    # Transaction score (0-1): 200 tx = 1.0
    tx = metrics.get("txns_24h", 0)
    tx_score = min(tx / 200, 1.0)
    
    # Weighted score
    score = 100 * (0.45 * freshness + 0.25 * liq_score + 0.20 * vol_score + 0.10 * tx_score)
    return round(score, 1)

def pool_to_candidate(pool, block_timestamp=None):
    """Convert pool to CIO candidate format with enrichment"""
    # Determine base vs quote
    if is_quote_whitelist(pool["token1_symbol"]):
        base_token = {"symbol": pool["token0_symbol"], "address": pool["token0"], "name": pool.get("token0_name", "")}
        quote_token = {"symbol": pool["token1_symbol"], "address": pool["token1"], "name": pool.get("token1_name", "")}
    elif is_quote_whitelist(pool["token0_symbol"]):
        base_token = {"symbol": pool["token1_symbol"], "address": pool["token1"], "name": pool.get("token1_name", "")}
        quote_token = {"symbol": pool["token0_symbol"], "address": pool["token0"], "name": pool.get("token0_name", "")}
    else:
        return None
    
    # Skip stables as base
    if base_token["symbol"] in ["USDC", "USDT", "DAI", "USDBC"]:
        return None
    
    age_hours = 0
    
    # Enrich from DexScreener
    enriched = enrich_from_dexscreener(pool["pool_address"])
    
    metrics = {
        "liq_usd": enriched.get("liq_usd", 0) if enriched else 0,
        "vol_24h_usd": enriched.get("vol_24h_usd", 0) if enriched else 0,
        "vol_1h_usd": enriched.get("vol_1h_usd", 0) if enriched else 0,
        "txns_24h": enriched.get("txns_24h", 0) if enriched else 0,
        "txns_1h": enriched.get("txns_1h", 0) if enriched else 0,
        "price_usd": enriched.get("price_usd", 0) if enriched else 0,
        "fdv": enriched.get("fdv", 0) if enriched else 0,
        "mcap": enriched.get("mcap", 0) if enriched else 0
    }
    
    # Calculate score
    cio_score = calculate_cio_score(metrics, age_hours)
    
    # Risk flags
    risk_tags = []
    if metrics["liq_usd"] < 10000:
        risk_tags.append("low_liquidity")
    if metrics["vol_24h_usd"] < 5000:
        risk_tags.append("low_volume")
    
    return {
        "kind": "CIO_CANDIDATE",
        "created_at": pool["detected_at"],
        "age_hours": age_hours,
        "chain": "base",
        "dex": enriched.get("dex_id", pool["factory"]) if enriched else pool["factory"],
        "pool_address": pool["pool_address"],
        "token": base_token,
        "quote_token": quote_token,
        "block_number": pool["block_number"],
        "tx_hash": pool["tx_hash"],
        "metrics": metrics,
        "scores": {
            "cio_score": cio_score,
            "freshness": round(1.0, 2)
        },
        "risk_tags": risk_tags,
        "status": "observing",
        "next_check": datetime.now().isoformat(),
        "enriched": enriched is not None
    }

def scan():
    """Main scan function"""
    print("[SCANNER] LURKER On-Chain Scanner MVP")
    print("=" * 50)
    
    w3 = get_web3()
    if not w3:
        print("[SCANNER] ERROR: No RPC connection available")
        print("[SCANNER] Please install web3: pip install web3")
        return
    
    # Load state
    state = load_state()
    current_block = w3.eth.block_number
    last_block = state.get("last_scanned_block", current_block - 1000)
    
    # Don't scan more than 2000 blocks at once (rate limit)
    scan_to = min(current_block, last_block + 2000)
    
    print(f"[SCANNER] Current block: {current_block}")
    print(f"[SCANNER] Scanning from {last_block} to {scan_to}")
    
    # Scan factories
    all_pools = []
    
    # Aerodrome
    aerodrome_pools = scan_aerodrome(w3, last_block, scan_to)
    all_pools.extend(aerodrome_pools)
    
    print(f"[SCANNER] Total pools found: {len(all_pools)}")
    
    # Enrich and convert to CIO
    cio = load_cio()
    existing_pools = {c["pool_address"].lower() for c in cio["candidates"]}
    
    new_count = 0
    for pool in all_pools:
        # Skip if already in CIO
        if pool["pool_address"].lower() in existing_pools:
            continue
        
        # Enrich with token info
        pool = enrich_pool(w3, pool)
        
        # Convert to candidate
        candidate = pool_to_candidate(pool)
        if candidate:
            cio["candidates"].insert(0, candidate)  # Newest first
            new_count += 1
            print(f"[SCANNER] New candidate: {candidate['token']['symbol']} / {candidate['quote_token']['symbol']}")
    
    # Trim to max 100 candidates
    cio["candidates"] = cio["candidates"][:100]
    
    # Save
    state["last_scanned_block"] = scan_to
    state["last_scan_time"] = datetime.now().isoformat()
    state["stats"]["total_pools_detected"] += len(all_pools)
    
    save_state(state)
    save_cio(cio)
    
    print(f"[SCANNER] New candidates added: {new_count}")
    print(f"[SCANNER] Total CIO candidates: {len(cio['candidates'])}")
    print("[SCANNER] Done")

if __name__ == "__main__":
    scan()
