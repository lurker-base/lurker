#!/usr/bin/env python3
"""
LURKER Signal Distributor v2.0
Distribue les signaux de trading via Telegram et autres canaux
"""

import os
import sys
import json
import time
import requests
from pathlib import Path
from datetime import datetime

# Charger les variables d'environnement depuis .env.telegram
LURKER_DIR = Path("/data/.openclaw/workspace/lurker-project")
env_file = LURKER_DIR / ".env.telegram"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key] = value

# Configuration
CONFIG = {
    "telegram_token": os.getenv("TELEGRAM_BOT_TOKEN", ""),
    "telegram_chat": os.getenv("TELEGRAM_CHANNEL", ""),
    "base_url": "https://api.telegram.org/bot",
    "min_signal_score": 0.6,
}

# Chemins
LURKER_DIR = Path("/data/.openclaw/workspace/lurker-project")
SIGNALS_DIR = LURKER_DIR / "signals"
LOGS_DIR = Path("/data/.openclaw/logs")

def log(msg):
    """Log message avec timestamp"""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")
    
    # Écrire dans le log
    log_file = LOGS_DIR / "lurker_distributor.log"
    with open(log_file, "a") as f:
        f.write(f"[{ts}] {msg}\n")

def send_telegram_alert(signal_data):
    """Envoyer une alerte Telegram"""
    token = CONFIG["telegram_token"]
    chat_id = CONFIG["telegram_chat"]
    
    if not token or not chat_id:
        log("⚠️ Telegram non configuré")
        return False
    
    try:
        # Construire le message
        signal_type = signal_data.get("type", "UNKNOWN")
        token_symbol = signal_data.get("token_symbol", "Unknown")
        token_name = signal_data.get("token_name", "Unknown Token")
        price = signal_data.get("price", 0)
        score = signal_data.get("score", 0)
        reasons = signal_data.get("reasons", [])
        
        # Emoji selon le type
        emoji = "🚀" if signal_type == "PUMP" else "💥" if signal_type == "DUMP" else "📊"
        
        message = f"""{emoji} *LURKER SIGNAL - {signal_type}* {emoji}

*Token:* {token_name} ({token_symbol})
*Prix:* ${price:.6f}
*Score:* {score:.2f}/1.0

*Signaux détectés:*
"""
        
        for reason in reasons[:5]:
            message += f"• {reason}\n"
        
        # Envoyer via Telegram API
        url = f"{CONFIG['base_url']}{token}/sendMessage"
        
        import urllib.request
        import urllib.parse
        
        data = urllib.parse.urlencode({
            'chat_id': chat_id,
            'text': message,
            'parse_mode': 'Markdown'
        }).encode()
        
        try:
            req = urllib.request.Request(url, data=data, method='POST')
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode())
                if result.get('ok'):
                    log(f"✅ Alert Telegram envoyée: {token_symbol}")
                    return True
                else:
                    log(f"❌ Erreur Telegram: {result.get('description', 'Unknown')}")
                    return False
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()
            log(f"❌ Erreur Telegram HTTP {e.code}: {error_body[:100]}")
            return False
        except Exception as e:
            log(f"❌ Exception Telegram: {str(e)[:100]}")
            return False
            
    except Exception as e:
        log(f"❌ Exception Telegram: {str(e)[:100]}")
        return False

def send_alert_via_openclaw(signal_data):
    """Envoyer une alerte via le système OpenClaw (contournement Telegram)"""
    try:
        signal_type = signal_data.get("type", "UNKNOWN")
        token_symbol = signal_data.get("token_symbol", "Unknown")
        token_name = signal_data.get("token_name", "Unknown Token")
        price = signal_data.get("price", 0)
        score = signal_data.get("score", 0)
        reasons = signal_data.get("reasons", [])
        
        emoji = "🚀" if signal_type == "PUMP" else "💥" if signal_type == "DUMP" else "📊"
        
        # Créer un fichier de notification pour OpenClaw
        notification = {
            "type": "lurker_signal",
            "priority": "high" if score > 0.8 else "normal",
            "timestamp": datetime.now().isoformat(),
            "title": f"LURKER {signal_type}: {token_symbol}",
            "message": f"{emoji} {token_name} ({token_symbol}) - ${price:.6f} - Score: {score:.2f}",
            "signal": signal_data
        }
        
        # Sauvegarder dans un fichier de notification
        notif_file = SIGNALS_DIR / "openclaw_notifications.json"
        notifications = []
        if notif_file.exists():
            with open(notif_file) as f:
                notifications = json.load(f)
        
        notifications.append(notification)
        
        # Garder seulement les 100 dernières notifications
        notifications = notifications[-100:]
        
        with open(notif_file, "w") as f:
            json.dump(notifications, f, indent=2)
        
        log(f"   📬 Notification OpenClaw créée")
        return True
        
    except Exception as e:
        log(f"   ❌ Erreur notification OpenClaw: {str(e)[:50]}")
        return False

def archive_signal(signal_data):
    """Archiver un signal envoyé"""
    archive_file = SIGNALS_DIR / "archive" / f"signals_{datetime.now().strftime('%Y%m')}.json"
    archive_file.parent.mkdir(parents=True, exist_ok=True)
    
    signals = []
    if archive_file.exists():
        with open(archive_file) as f:
            signals = json.load(f)
    
    signal_data["sent_at"] = datetime.now().isoformat()
    signals.append(signal_data)
    
    with open(archive_file, "w") as f:
        json.dump(signals, f, indent=2)

def generate_signals_from_cio():
    """Générer des signaux depuis le CIO feed"""
    cio_file = SIGNALS_DIR / "cio_feed.json"
    
    if not cio_file.exists():
        log("ℹ️ CIO feed non trouvé")
        return []
    
    try:
        with open(cio_file) as f:
            cio_data = json.load(f)
        
        candidates = cio_data.get("candidates", [])
        if not candidates:
            log("ℹ️ Aucun candidat dans le CIO feed")
            return []
        
        signals = []
        for candidate in candidates:
            token = candidate.get("token", {})
            metrics = candidate.get("metrics", {})
            risk = candidate.get("risk", {})
            
            token_symbol = token.get("symbol", "Unknown")
            token_name = token.get("name", "Unknown Token")
            token_address = token.get("address", "")
            
            # Calculer un score basé sur les risques
            risk_level = risk.get("level", "medium")
            risk_factors = risk.get("factors", [])
            
            # Score inversé - moins de risque = meilleur score
            if risk_level == "low":
                score = 0.8
            elif risk_level == "medium":
                score = 0.6
            else:
                score = 0.4
            
            # Déterminer le type de signal
            if "dumping" in risk_factors:
                signal_type = "DUMP"
                score = 0.7  # Priorité aux dumps
            elif "low_liquidity" in risk_factors and "low_volume" in risk_factors:
                signal_type = "RISKY"
                score = 0.5
            else:
                signal_type = "NEW"
                score = 0.6
            
            signal = {
                "timestamp": datetime.now().isoformat(),
                "token_id": token_address,
                "token_symbol": token_symbol,
                "token_name": token_name,
                "type": signal_type,
                "price": metrics.get("priceUsd", 0),
                "score": score,
                "reasons": [f"Risk: {risk_level}"] + risk_factors[:3],
                "metrics": metrics,
                "source": "cio_feed"
            }
            
            signals.append(signal)
        
        log(f"📊 {len(signals)} signaux générés depuis CIO feed")
        return signals
        
    except Exception as e:
        log(f"❌ Erreur lecture CIO feed: {str(e)[:100]}")
        return []

def process_pending_signals():
    """Traiter les signaux en attente"""
    # D'abord, générer des signaux depuis le CIO feed
    signals = generate_signals_from_cio()
    
    # Ensuite, lire les signaux en attente (legacy)
    pending_file = SIGNALS_DIR / "pending_signals.json"
    if pending_file.exists():
        try:
            with open(pending_file) as f:
                pending = json.load(f)
                signals.extend(pending)
            # Vider le fichier pending
            with open(pending_file, "w") as f:
                json.dump([], f)
        except Exception as e:
            log(f"⚠️ Erreur lecture pending: {str(e)[:50]}")
    
    if not signals:
        log("ℹ️ Aucun signal à traiter")
        return 0
    
    log(f"📨 {len(signals)} signaux à traiter")
    
    sent_count = 0
    
    for signal in signals:
        score = signal.get("score", 0)
        
        if score >= CONFIG["min_signal_score"]:
            telegram_ok = send_telegram_alert(signal)
            openclaw_ok = send_alert_via_openclaw(signal)
            
            if telegram_ok or openclaw_ok:
                sent_count += 1
                # Archiver le signal envoyé
                archive_signal(signal)
        else:
            log(f"⏸️ Signal ignoré (score {score:.2f} < {CONFIG['min_signal_score']})")
    
    log(f"✅ {sent_count}/{len(signals)} signaux distribués")
    return sent_count

def main():
    """Fonction principale"""
    log("="*50)
    log("🚀 LURKER Signal Distributor v2.0")
    log("="*50)
    
    # Créer les répertoires
    SIGNALS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    (SIGNALS_DIR / "archive").mkdir(exist_ok=True)
    
    # Vérifier la config Telegram
    if not CONFIG["telegram_token"] or not CONFIG["telegram_chat"]:
        log("⚠️ Configuration Telegram incomplète")
        log("   Variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID")
    else:
        log(f"✅ Telegram configuré (chat: {CONFIG['telegram_chat']})")
    
    # Traiter les signaux
    count = process_pending_signals()
    
    log(f"✅ Distribution terminée: {count} signaux envoyés")
    log("="*50)

if __name__ == "__main__":
    main()
