#!/usr/bin/env python3
"""
LURKER Signal Quality Scorer v1.0
Multi-factor quality scoring to reduce noise and improve signal precision.

Replaces the simple liq+age filter with a composite score that captures:
1. Volume/Liquidity ratio (pump/dump indicator)
2. Buy/Sell pressure ratio
3. Holder diversity proxy (tx count spread)
4. Freshness decay (newer = higher score, but not immediate rugs)
5. Source credibility boost
6. Risk penalty (bundle farming, low liq, etc.)

Usage:
  from signal_quality_scorer import score_signal, filter_signals
  
  scored = score_signal(signal_data)  # Returns signal with 'quality_score' added
  filtered = filter_signals(signals, min_score=40)  # Only quality signals
"""

import math
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

# === SCORING WEIGHTS ===
WEIGHTS = {
    "vol_liq_ratio": 0.20,      # Volume relative to liquidity (pump indicator)
    "buy_sell_pressure": 0.15,   # Net buying pressure
    "tx_density": 0.15,         # Transaction count density (activity quality)
    "freshness": 0.15,          # Age sweet spot (not too new, not too old)
    "liquidity_health": 0.15,   # Absolute liquidity level
    "source_credibility": 0.10, # Source boost (profiles/boosts/top_boosts)
    "risk_penalty": 0.10,       # Negative scoring for red flags
}

# === THRESHOLDS ===
# Volume/Liquidity ratio sweet spot for Base memecoins
VOL_LIQ_OPTIMAL_MIN = 0.5   # Below this = low interest
VOL_LIQ_OPTIMAL_MAX = 10.0  # Above this = possibly wash trading
VOL_LIQ_SUSPICIOUS = 50.0   # Almost certainly fake volume

# Freshness sweet spots (hours)
FRESHNESS_TOO_NEW = 0.5     # < 30 min = likely rug setup
FRESHNESS_SWEET_MIN = 1.0   # 1h = early but proven viable
FRESHNESS_SWEET_MAX = 12.0  # 12h = still fresh
FRESHNESS_STALE = 48.0      # > 48h = not a "fresh signal" anymore

# Liquidity tiers (USD)
LIQ_MIN_VIABLE = 5_000      # Below = too risky
LIQ_HEALTHY = 30_000        # Good baseline
LIQ_STRONG = 100_000        # Very healthy
LIQ_SUSPICIOUS = 25_000_000 # Probably not a new token

# Buy/Sell pressure
MIN_TX_FOR_PRESSURE = 5     # Need at least 5 txs to calculate pressure

# Blacklist patterns in symbol
SYMBOL_BLACKLIST = {
    "UNKNOWN", "TEST", "TOKEN", "SCAM", "RUG", "FAKE", 
    "HONEYPOT", "HONEY", "AIRDROP", "FREE",
}

# Known rug patterns
RUG_PATTERNS = {
    "zero_liquidity",
    "bundle_farming",
    "suspicious_balances",
    "bot_wallets",
    "dumping",
    "very_low_liquidity",
}


def _score_vol_liq_ratio(metrics: Dict) -> float:
    """Score based on volume/liquidity ratio — key pump indicator.
    
    Sweet spot: 0.5-10x (healthy interest without wash trading)
    """
    liq = metrics.get("liq_usd", 0)
    vol = metrics.get("vol_1h_usd", 0) or metrics.get("vol_5m_usd", 0) * 12
    
    if liq <= 0:
        return 0.0
    
    ratio = vol / liq
    
    if ratio < VOL_LIQ_OPTIMAL_MIN:
        # Low interest — score proportional to ratio
        return max(0, ratio / VOL_LIQ_OPTIMAL_MIN) * 50
    elif ratio <= VOL_LIQ_OPTIMAL_MAX:
        # Sweet spot — high score
        # Peak at ~3x
        peak_distance = abs(ratio - 3.0) / 7.0
        return 80 + (1 - peak_distance) * 20
    elif ratio <= VOL_LIQ_SUSPICIOUS:
        # Getting suspicious — declining score
        decay = (ratio - VOL_LIQ_OPTIMAL_MAX) / (VOL_LIQ_SUSPICIOUS - VOL_LIQ_OPTIMAL_MAX)
        return max(20, 80 * (1 - decay))
    else:
        # Almost certainly wash trading
        return 10


def _score_buy_sell_pressure(metrics: Dict) -> float:
    """Score based on buy vs sell ratio.
    
    More buys than sells = accumulation phase = good signal.
    """
    buys = metrics.get("buyers_5m", 0) or metrics.get("txns_1h_buys", 0) or 0
    sells = metrics.get("sellers_5m", 0) or metrics.get("txns_1h_sells", 0) or 0
    
    total_tx = buys + sells
    if total_tx < MIN_TX_FOR_PRESSURE:
        return 40  # Not enough data, neutral score
    
    buy_ratio = buys / total_tx
    
    if buy_ratio > 0.8:
        return 95  # Strong accumulation
    elif buy_ratio > 0.65:
        return 80  # Healthy buying
    elif buy_ratio > 0.5:
        return 60  # Slight buy pressure
    elif buy_ratio > 0.35:
        return 40  # Slight sell pressure
    elif buy_ratio > 0.2:
        return 25  # Sell pressure
    else:
        return 10  # Heavy dumping


def _score_tx_density(metrics: Dict, age_hours: float) -> float:
    """Score based on transaction density (tx/hour).
    
    Higher density = more organic interest.
    """
    tx_1h = metrics.get("txns_1h", 0)
    tx_24h = metrics.get("txns_24h", 0)
    
    # Use best available
    if tx_1h > 0:
        density = tx_1h
    elif tx_24h > 0 and age_hours > 0:
        density = tx_24h / min(age_hours, 24)
    else:
        return 20  # No tx data
    
    if density >= 50:
        return 95  # Very active
    elif density >= 20:
        return 80
    elif density >= 10:
        return 65
    elif density >= 5:
        return 50
    elif density >= 2:
        return 35
    else:
        return 15


def _score_freshness(age_hours: float) -> float:
    """Score based on token age sweet spot.
    
    Too new (< 30min) = risky, could be setup
    Sweet spot (1-12h) = fresh enough to catch early
    Stale (> 48h) = no longer a discovery signal
    """
    if age_hours < FRESHNESS_TOO_NEW:
        return 30  # Too new — could be rug setup
    elif age_hours < FRESHNESS_SWEET_MIN:
        # Ramping up
        return 30 + 60 * ((age_hours - FRESHNESS_TOO_NEW) / (FRESHNESS_SWEET_MIN - FRESHNESS_TOO_NEW))
    elif age_hours <= FRESHNESS_SWEET_MAX:
        # Sweet spot — peak score
        # Peak at ~4h
        peak = 4.0
        dist = abs(age_hours - peak) / (FRESHNESS_SWEET_MAX - FRESHNESS_SWEET_MIN)
        return 80 + (1 - dist) * 20
    elif age_hours <= FRESHNESS_STALE:
        # Declining
        decay = (age_hours - FRESHNESS_SWEET_MAX) / (FRESHNESS_STALE - FRESHNESS_SWEET_MAX)
        return max(20, 80 * (1 - decay))
    else:
        return 10  # Very stale


def _score_liquidity_health(liq_usd: float) -> float:
    """Score based on absolute liquidity level."""
    if liq_usd < LIQ_MIN_VIABLE:
        return max(0, (liq_usd / LIQ_MIN_VIABLE) * 20)
    elif liq_usd < LIQ_HEALTHY:
        return 20 + 50 * ((liq_usd - LIQ_MIN_VIABLE) / (LIQ_HEALTHY - LIQ_MIN_VIABLE))
    elif liq_usd < LIQ_STRONG:
        return 70 + 25 * ((liq_usd - LIQ_HEALTHY) / (LIQ_STRONG - LIQ_HEALTHY))
    elif liq_usd < LIQ_SUSPICIOUS:
        return 95
    else:
        return 50  # Suspiciously high for a "new" token


def _score_source_credibility(source: str, scores: Dict) -> float:
    """Score based on signal source and scanner credibility."""
    source_scores = {
        "top_boosts": 90,
        "boosts": 75,
        "profiles": 60,
        "hybrid_trending": 80,
        "hybrid_boosts": 75,
        "hybrid_profiles": 60,
        "hybrid_rpc": 30,
        "manual_assist": 70,
        "cio": 65,
    }
    
    base = source_scores.get(source, 40)
    
    # Add CIO score bonus if available
    cio_score = scores.get("cio_score", 0)
    if cio_score > 0:
        base = base * 0.7 + (cio_score / 100) * 100 * 0.3
    
    return min(100, base)


def _score_risk_penalty(signal: Dict) -> float:
    """Score PENALTY based on risk factors (higher = more risk = lower final score).
    
    Returns 0-100 where 0=no risk and 100=maximum risk.
    """
    penalty = 0
    
    risk = signal.get("risk", {})
    risk_factors = risk.get("factors", [])
    risk_level = risk.get("level", "unknown")
    
    # Risk level base penalty
    if risk_level == "high":
        penalty += 40
    elif risk_level == "medium":
        penalty += 15
    
    # Specific risk factor penalties
    for factor in risk_factors:
        if factor in RUG_PATTERNS:
            if factor == "bundle_farming":
                penalty += 50  # Instant disqualifier
            elif factor == "dumping":
                penalty += 30
            elif factor in ("suspicious_balances", "bot_wallets"):
                penalty += 25
            else:
                penalty += 15
    
    # Symbol blacklist
    symbol = signal.get("token", {}).get("symbol", "").upper().lstrip("$")
    if symbol in SYMBOL_BLACKLIST:
        penalty += 40
    
    # No name resolution = sketchy
    name = signal.get("token", {}).get("name", "")
    if name in ("Unknown", "UNKNOWN", "", "Fresh Contract"):
        penalty += 20
    
    # Zero market cap with high volume = suspicious
    metrics = signal.get("metrics", {})
    mcap = metrics.get("mcap_usd", 0) or metrics.get("marketCap", 0)
    vol = metrics.get("vol_1h_usd", 0) or metrics.get("vol_24h_usd", 0)
    if mcap == 0 and vol > 50000:
        penalty += 15
    
    return min(100, penalty)


def get_age_hours(signal: Dict) -> float:
    """Extract age in hours from various signal formats."""
    # Direct age field
    age = signal.get("age", {})
    if isinstance(age, dict):
        minutes = age.get("minutes", 0)
        hours = age.get("hours", 0)
        days = age.get("days", 0)
        return minutes / 60 + hours + days * 24
    
    # Timestamps
    timestamps = signal.get("timestamps", {})
    age_h = timestamps.get("pair_age_hours", 0) or timestamps.get("token_age_hours", 0)
    if age_h:
        return age_h
    
    # age_hours direct field
    if "age_hours" in signal:
        return signal["age_hours"]
    
    # Calculate from ts_utc
    ts = signal.get("ts_utc") or signal.get("detected_at") or signal.get("first_seen")
    if ts:
        try:
            if isinstance(ts, str):
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            else:
                dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
            return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        except:
            pass
    
    return 0


def get_metrics(signal: Dict) -> Dict:
    """Normalize metrics from various signal formats."""
    m = signal.get("metrics", {})
    
    # Also look in dexscreener data
    dex = signal.get("dexscreener", {})
    if dex:
        if not m.get("liq_usd"):
            m["liq_usd"] = (dex.get("liquidity") or {}).get("usd", 0)
        if not m.get("vol_1h_usd"):
            m["vol_1h_usd"] = (dex.get("volume") or {}).get("h1", 0)
        if not m.get("txns_1h"):
            txns = (dex.get("txns") or {}).get("h1", {})
            m["txns_1h"] = (txns.get("buys") or 0) + (txns.get("sells") or 0)
            m["txns_1h_buys"] = txns.get("buys", 0)
            m["txns_1h_sells"] = txns.get("sells", 0)
    
    # metrics_at_cert from fast_certified
    cert = signal.get("metrics_at_cert", {})
    if cert:
        for key in ["liq_usd", "vol_1h_usd", "vol_24h_usd", "txns_1h", "txns_24h"]:
            if not m.get(key) and cert.get(key):
                m[key] = cert[key]
    
    return m


def score_signal(signal: Dict) -> Dict:
    """Score a signal on quality (0-100). Higher = better quality.
    
    Returns the signal dict with added fields:
    - quality_score: int (0-100)
    - quality_breakdown: dict of component scores
    - quality_grade: str (S/A/B/C/D/F)
    """
    metrics = get_metrics(signal)
    age_hours = get_age_hours(signal)
    source = signal.get("source", signal.get("scores", {}).get("source", "unknown"))
    scores_data = signal.get("scores", {})
    
    # Calculate component scores (each 0-100)
    components = {
        "vol_liq_ratio": _score_vol_liq_ratio(metrics),
        "buy_sell_pressure": _score_buy_sell_pressure(metrics),
        "tx_density": _score_tx_density(metrics, age_hours),
        "freshness": _score_freshness(age_hours),
        "liquidity_health": _score_liquidity_health(metrics.get("liq_usd", 0)),
        "source_credibility": _score_source_credibility(source, scores_data),
        "risk_penalty": _score_risk_penalty(signal),
    }
    
    # Weighted composite (risk_penalty is subtracted)
    positive_score = 0
    for key, weight in WEIGHTS.items():
        if key == "risk_penalty":
            continue
        positive_score += components[key] * weight
    
    # Subtract risk penalty
    risk_penalty = components["risk_penalty"] * WEIGHTS["risk_penalty"]
    final_score = max(0, min(100, positive_score - risk_penalty))
    
    # Grade
    if final_score >= 85:
        grade = "S"
    elif final_score >= 70:
        grade = "A"
    elif final_score >= 55:
        grade = "B"
    elif final_score >= 40:
        grade = "C"
    elif final_score >= 25:
        grade = "D"
    else:
        grade = "F"
    
    # Add to signal
    signal["quality_score"] = round(final_score, 1)
    signal["quality_breakdown"] = {k: round(v, 1) for k, v in components.items()}
    signal["quality_grade"] = grade
    
    return signal


def filter_signals(signals: List[Dict], min_score: float = 40) -> List[Dict]:
    """Score and filter signals by quality threshold.
    
    Args:
        signals: List of signal dicts
        min_score: Minimum quality score to include (default 40 = grade C or better)
    
    Returns:
        List of scored signals above threshold, sorted by quality_score desc.
    """
    scored = [score_signal(s) for s in signals]
    filtered = [s for s in scored if s["quality_score"] >= min_score]
    filtered.sort(key=lambda x: x["quality_score"], reverse=True)
    return filtered


def analyze_signal_quality(signals: List[Dict]) -> Dict:
    """Analyze quality distribution of a signal set. Returns stats."""
    if not signals:
        return {"count": 0, "avg_score": 0, "grade_distribution": {}}
    
    scored = [score_signal(s) for s in signals]
    scores = [s["quality_score"] for s in scored]
    grades = [s["quality_grade"] for s in scored]
    
    grade_dist = {}
    for g in grades:
        grade_dist[g] = grade_dist.get(g, 0) + 1
    
    return {
        "count": len(scored),
        "avg_score": round(sum(scores) / len(scores), 1),
        "min_score": round(min(scores), 1),
        "max_score": round(max(scores), 1),
        "median_score": round(sorted(scores)[len(scores) // 2], 1),
        "grade_distribution": grade_dist,
        "above_40": sum(1 for s in scores if s >= 40),
        "above_55": sum(1 for s in scores if s >= 55),
        "above_70": sum(1 for s in scores if s >= 70),
    }


if __name__ == "__main__":
    """Run quality analysis on current signals."""
    import json
    from pathlib import Path
    
    SIGNALS_DIR = Path(__file__).parent.parent / "signals"
    
    print("=" * 60)
    print("LURKER Signal Quality Analyzer")
    print("=" * 60)
    
    # Load all available signal sources
    all_signals = []
    
    for feed_name in ["signals.json", "cio_feed.json", "lifecycle_feed.json", "hybrid_feed.json"]:
        feed_path = SIGNALS_DIR / feed_name
        if not feed_path.exists():
            continue
        try:
            with open(feed_path) as f:
                data = json.load(f)
            
            if isinstance(data, list):
                signals = data
            elif "signals" in data:
                signals = data["signals"]
            elif "candidates" in data:
                signals = data["candidates"]
            else:
                continue
            
            for s in signals:
                s["_source_feed"] = feed_name
            all_signals.extend(signals)
            print(f"  Loaded {len(signals)} from {feed_name}")
        except Exception as e:
            print(f"  Error loading {feed_name}: {e}")
    
    print(f"\nTotal signals to analyze: {len(all_signals)}")
    print()
    
    # Analyze
    stats = analyze_signal_quality(all_signals)
    print(f"Average quality score: {stats['avg_score']}")
    print(f"Score range: {stats['min_score']} - {stats['max_score']}")
    print(f"Median: {stats['median_score']}")
    print(f"\nGrade distribution:")
    for grade in ["S", "A", "B", "C", "D", "F"]:
        count = stats["grade_distribution"].get(grade, 0)
        bar = "█" * count
        print(f"  {grade}: {count:3d} {bar}")
    
    print(f"\nPassing signals (score >= 40): {stats['above_40']}")
    print(f"Good signals (score >= 55):    {stats['above_55']}")
    print(f"Excellent signals (score >= 70): {stats['above_70']}")
    
    # Show top 10 and bottom 5
    scored = [score_signal(s) for s in all_signals]
    scored.sort(key=lambda x: x["quality_score"], reverse=True)
    
    print(f"\n{'='*60}")
    print("TOP 10 SIGNALS")
    print(f"{'='*60}")
    for s in scored[:10]:
        sym = s.get("token", {}).get("symbol", "?")
        score = s["quality_score"]
        grade = s["quality_grade"]
        liq = get_metrics(s).get("liq_usd", 0)
        src = s.get("_source_feed", "?")
        breakdown = s.get("quality_breakdown", {})
        print(f"  [{grade}] {score:5.1f}  {sym:<16s} liq=${liq:>12,.0f}  {src}")
        print(f"       vol_liq={breakdown.get('vol_liq_ratio',0):.0f} "
              f"pressure={breakdown.get('buy_sell_pressure',0):.0f} "
              f"fresh={breakdown.get('freshness',0):.0f} "
              f"risk={breakdown.get('risk_penalty',0):.0f}")
    
    print(f"\n{'='*60}")
    print("BOTTOM 5 (NOISE)")
    print(f"{'='*60}")
    for s in scored[-5:]:
        sym = s.get("token", {}).get("symbol", "?")
        score = s["quality_score"]
        grade = s["quality_grade"]
        src = s.get("_source_feed", "?")
        breakdown = s.get("quality_breakdown", {})
        print(f"  [{grade}] {score:5.1f}  {sym:<16s}  {src}")
        print(f"       vol_liq={breakdown.get('vol_liq_ratio',0):.0f} "
              f"pressure={breakdown.get('buy_sell_pressure',0):.0f} "
              f"fresh={breakdown.get('freshness',0):.0f} "
              f"risk={breakdown.get('risk_penalty',0):.0f}")
