#!/usr/bin/env python3
"""
LURKER Certifier — Evaluate CIO candidates at 48h and 72h
Promotes survivors to CERTIFIED feed
"""
import json
import requests
import math
from datetime import datetime, timedelta
from pathlib import Path

# Config
CIO_FILE = Path(__file__).parent.parent / "signals" / "cio_feed.json"
PULSE_FILE = Path(__file__).parent.parent / "signals" / "pulse_feed.json"

# Certification thresholds
CERT_48H = {
    "min_holders": 200,
    "max_top10_pct": 40,
    "min_liq_usd": 30000,
    "min_vol_24h": 20000,
    "min_txns_24h": 100,
    "max_drawdown_pct": 70
}

CERT_72H = {
    "min_holders": 500,
    "max_top10_pct": 30,
    "min_liq_usd": 50000,
    "min_vol_24h": 50000,
    "min_txns_24h": 200,
    "max_drawdown_pct": 50
}

# Bluechip symbols to exclude from top10 calculation
EXCLUDE_FROM_TOP10 = {"LP", "POOL", "BURN", "DEAD", "ZERO", "ROUTER"}

def load_cio():
    """Load CIO feed"""
    if CIO_FILE.exists():
        with open(CIO_FILE) as f:
            return json.load(f)
    return {"candidates": []}

def load_pulse():
    """Load CERTIFIED feed"""
    if PULSE_FILE.exists():
        with open(PULSE_FILE) as f:
            return json.load(f)
    return {"schema": "lurker_certified_v1", "certified": []}

def save_pulse(pulse):
    """Save CERTIFIED feed"""
    PULSE_FILE.parent.mkdir(parents=True, exist_ok=True)
    pulse["last_updated"] = datetime.now().isoformat()
    pulse["count"] = len(pulse["certified"])
    with open(PULSE_FILE, 'w') as f:
        json.dump(pulse, f, indent=2)

def fetch_holders(token_address):
    """Fetch holder data — MVP placeholder, returns mock data"""
    # TODO: Integrate with Covalent/Moralis/Alchemy API
    # For now, return None to indicate data not available
    return None

def calculate_certified_score(metrics, stage="48h"):
    """Calculate certification health score"""
    liq = metrics.get("liq_usd", 0)
    vol = metrics.get("vol_24h_usd", 0)
    txns = metrics.get("txns_24h", 0)
    
    # Liquidity score
    liq_target = 50000 if stage == "72h" else 30000
    liq_score = min(liq / liq_target, 1.0)
    
    # Volume score
    vol_target = 50000 if stage == "72h" else 20000
    vol_score = min(vol / vol_target, 1.0)
    
    # Transaction score
    tx_target = 200 if stage == "72h" else 100
    tx_score = min(txns / tx_target, 1.0)
    
    # Health score (composite)
    score = 100 * (0.4 * liq_score + 0.35 * vol_score + 0.25 * tx_score)
    return round(score, 1)

def evaluate_for_certification(candidate):
    """Evaluate if candidate qualifies for certification"""
    created = datetime.fromisoformat(candidate["created_at"].replace('Z', '+00:00'))
    age_hours = (datetime.now() - created).total_seconds() / 3600
    
    metrics = candidate.get("metrics", {})
    current_stage = candidate.get("cert_stage", None)
    
    result = {
        "qualified": False,
        "stage": None,
        "score": 0,
        "checks": {},
        "reasons": []
    }
    
    # Check 48h certification
    if age_hours >= 48 and current_stage is None:
        checks = CERT_48H
        stage = "48h"
        
        # Evaluate criteria
        passed = 0
        total = 6
        
        # Liquidity check
        if metrics.get("liq_usd", 0) >= checks["min_liq_usd"]:
            passed += 1
        else:
            result["reasons"].append(f"liq_too_low_${metrics.get('liq_usd', 0):,.0f}")
        
        # Volume check
        if metrics.get("vol_24h_usd", 0) >= checks["min_vol_24h"]:
            passed += 1
        else:
            result["reasons"].append(f"vol_too_low")
        
        # Transaction check
        if metrics.get("txns_24h", 0) >= checks["min_txns_24h"]:
            passed += 1
        else:
            result["reasons"].append(f"txns_too_low")
        
        # Holders check (if available)
        holders = candidate.get("holders", {})
        if holders.get("count", 0) >= checks["min_holders"]:
            passed += 1
        else:
            if holders:
                result["reasons"].append(f"holders_too_low")
        
        # Need at least 4/6 for 48h certification (holders optional)
        if passed >= 4:
            result["qualified"] = True
            result["stage"] = "48h"
            result["score"] = calculate_certified_score(metrics, "48h")
    
    # Check 72h certification
    elif age_hours >= 72 and current_stage == "48h":
        checks = CERT_72H
        stage = "72h"
        
        passed = 0
        
        # Stricter checks
        if metrics.get("liq_usd", 0) >= checks["min_liq_usd"]:
            passed += 1
        else:
            result["reasons"].append(f"liq_too_low_72h")
        
        if metrics.get("vol_24h_usd", 0) >= checks["min_vol_24h"]:
            passed += 1
        else:
            result["reasons"].append(f"vol_too_low_72h")
        
        if metrics.get("txns_24h", 0) >= checks["min_txns_24h"]:
            passed += 1
        else:
            result["reasons"].append(f"txns_too_low_72h")
        
        if passed >= 3:
            result["qualified"] = True
            result["stage"] = "72h"
            result["score"] = calculate_certified_score(metrics, "72h")
    
    return result

def certify():
    """Main certification function"""
    print("[CERTIFIER] Starting certification evaluation...")
    print("=" * 50)
    
    cio = load_cio()
    pulse = load_pulse()
    
    existing_certified = {c["pool_address"].lower() for c in pulse["certified"]}
    
    new_certified = 0
    upgraded = 0
    
    for candidate in cio.get("candidates", []):
        pool_addr = candidate["pool_address"].lower()
        
        # Evaluate
        result = evaluate_for_certification(candidate)
        
        if result["qualified"]:
            stage = result["stage"]
            
            # Create certified entry
            certified_entry = {
                "kind": "CERTIFIED_SIGNAL",
                "created_at": candidate["created_at"],
                "certified_at": datetime.now().isoformat(),
                "cert_stage": stage,
                "age_hours": candidate["age_hours"],
                "chain": candidate["chain"],
                "dex": candidate["dex"],
                "pool_address": candidate["pool_address"],
                "token": candidate["token"],
                "quote_token": candidate["quote_token"],
                "metrics": candidate["metrics"],
                "scores": {
                    "certified_score": result["score"],
                    "health_score": result["score"]  # Same for now
                },
                "status": f"certified_{stage}"
            }
            
            if pool_addr in existing_certified:
                # Update existing
                for i, c in enumerate(pulse["certified"]):
                    if c["pool_address"].lower() == pool_addr:
                        if stage == "72h" and c.get("cert_stage") == "48h":
                            pulse["certified"][i] = certified_entry
                            upgraded += 1
                            print(f"[CERTIFIER] Upgraded to 72h: {candidate['token']['symbol']}")
                        break
            else:
                # New certification
                pulse["certified"].insert(0, certified_entry)
                existing_certified.add(pool_addr)
                new_certified += 1
                print(f"[CERTIFIER] New 48h certified: {candidate['token']['symbol']} (score: {result['score']})")
            
            # Update candidate status
            candidate["cert_stage"] = stage
            candidate["status"] = f"certified_{stage}"
        else:
            # Log why rejected (for debugging)
            if result["reasons"]:
                candidate["cert_rejection"] = result["reasons"]
    
    # Save
    save_pulse(pulse)
    
    # Update CIO file with cert stages
    with open(CIO_FILE, 'w') as f:
        json.dump(cio, f, indent=2)
    
    print(f"[CERTIFIER] New certified: {new_certified}")
    print(f"[CERTIFIER] Upgraded to 72h: {upgraded}")
    print(f"[CERTIFIER] Total certified: {len(pulse['certified'])}")
    print("[CERTIFIER] Done")

if __name__ == "__main__":
    certify()
