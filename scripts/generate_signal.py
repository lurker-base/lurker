#!/usr/bin/env python3
"""
LURKER Signal Generator — Mode Manuel Assisté
Usage: python3 generate_signal.py

Génère un signal formaté prêt pour GitHub-Only pipeline.
Le signal reste en "draft" jusqu'à validation manuelle (status -> "ready").
"""
import json
from datetime import datetime, timezone
from pathlib import Path

def get_input(prompt, default=""):
    """Input avec valeur par défaut"""
    if default:
        result = input(f"{prompt} [{default}]: ").strip()
        return result if result else default
    return input(f"{prompt}: ").strip()

def generate_signal():
    print("=" * 50)
    print("🔔 LURKER SIGNAL GENERATOR — Mode Manuel Assisté")
    print("=" * 50)
    print()
    
    # Token info
    print("📋 INFORMATIONS TOKEN")
    name = get_input("Nom du token", "TOKEN")
    symbol = get_input("Symbol (ex: $TOKEN)", f"${name.upper()}")
    address = get_input("Contract Address (0x...)")
    
    print()
    print("📊 MÉTRIQUES (depuis DexScreener ou ta source)")
    mcap = get_input("Market Cap USD", "0")
    liq = get_input("Liquidité USD", "0")
    vol_5m = get_input("Volume 5min USD", "0")
    buyers = get_input("Nombre d'acheteurs 5min", "0")
    sellers = get_input("Nombre de vendeurs 5min", "0")
    age = get_input("Âge du token (minutes)", "0")
    
    print()
    print("🎯 SCORING")
    confidence = int(get_input("Confiance (0-100)", "75"))
    risk = get_input("Niveau de risque (low/medium/high)", "high")
    
    print()
    print("📈 SIGNAL ENTRY/TARGET/STOP")
    entry = get_input("Prix d'entrée (USD)", "0.00")
    target1 = get_input("Target 1 (USD)", "0.00")
    target2 = get_input("Target 2 (USD)", "0.00")
    stop = get_input("Stop loss (USD)", "0.00")
    
    # Générer le message formaté
    message = f"""🔔 LURKER SIGNAL — {symbol} (Base)

Conf: {confidence}/100 | MC: ${int(mcap):,} | Liq: ${int(liq):,}
Vol 5m: ${int(vol_5m):,} | Buyers/Sellers: {buyers}/{sellers}

📈 Entry: ${entry}
🎯 Target 1: ${target1} | Target 2: ${target2}
🛑 Stop: ${stop}

🔗 Dex: https://dexscreener.com/base/{address}
⚠️ Risk: {risk.upper()} — DYOR

Signal {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC"""
    
    # Construire le signal
    signal = {
        "kind": "LURKER_SIGNAL",
        "version": "1.0",
        "ts_utc": datetime.now(timezone.utc).isoformat(),
        "signal_id": f"LURK-{datetime.now().strftime('%y%m%d')}-XXX",
        "chain": "base",
        "token": {
            "name": name,
            "symbol": symbol,
            "address": address,
            "pair_url": f"https://dexscreener.com/base/{address}"
        },
        "scores": {
            "confidence": confidence,
            "rarity": "3-5/day",
            "risk": risk
        },
        "metrics": {
            "mcap_usd": int(mcap) if mcap.isdigit() else 0,
            "liq_usd": int(liq) if liq.isdigit() else 0,
            "vol_5m_usd": int(vol_5m) if vol_5m.isdigit() else 0,
            "buyers_5m": int(buyers) if buyers.isdigit() else 0,
            "sellers_5m": int(sellers) if sellers.isdigit() else 0,
            "age_minutes": int(age) if age.isdigit() else 0
        },
        "entry": {
            "price_usd": float(entry) if entry else 0,
            "target_1": float(target1) if target1 else 0,
            "target_2": float(target2) if target2 else 0,
            "stop": float(stop) if stop else 0
        },
        "message": message,
        "source": "manual_assist",
        "status": "draft"  # ← Reste en draft jusqu'à ta validation
    }
    
    # Sauvegarder
    signals_dir = Path(__file__).parent.parent / "signals"
    signals_dir.mkdir(exist_ok=True)
    
    output_file = signals_dir / "latest.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(signal, f, indent=2, ensure_ascii=False)
    
    print()
    print("=" * 50)
    print(f"✅ Signal généré: {output_file}")
    print()
    print("📋 PROCHAINES ÉTAPES:")
    print("1. Review le signal dans signals/latest.json")
    print("2. Change 'status' de 'draft' à 'ready'")
    print("3. git add . && git commit -m 'signal: NAME' && git push")
    print("4. GitHub Actions valide et poste automatiquement")
    print()
    print("🛡️ Garde-fous actifs:")
    print(f"   • Min confidence: 70 (actuel: {confidence})")
    print("   • Max 5 signaux/jour")
    print("   • Anti-doublon: 7 jours")
    print()

if __name__ == "__main__":
    try:
        generate_signal()
    except KeyboardInterrupt:
        print("\n\n❌ Annulé.")
        exit(0)
