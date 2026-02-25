#!/usr/bin/env python3
"""
V2 Notifier - Envoi des alertes Twitter et Telegram
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ajouter src au path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from lurker_twitter import LurkerTwitter

STATE_FILE = Path(__file__).parent.parent / "state" / "tokens.json"
ALERTS_FILE = Path(__file__).parent.parent / "state" / "alerts.json"

# Seuils d'alerte
PUMP_ALERT_THRESHOLD = 50   # +50%
DUMP_ALERT_THRESHOLD = -30  # -30%

class Notifier:
    def __init__(self):
        self.twitter = LurkerTwitter()
        self.sent_alerts = self.load_sent_alerts()
    
    def load_sent_alerts(self):
        """Charge les alertes déjà envoyées"""
        if ALERTS_FILE.exists():
            with open(ALERTS_FILE) as f:
                return json.load(f)
        return {"alerts": []}
    
    def save_sent_alerts(self):
        """Sauvegarde les alertes envoyées"""
        ALERTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(ALERTS_FILE, 'w') as f:
            json.dump(self.sent_alerts, f, indent=2)
    
    def was_alert_sent(self, token_addr, alert_type):
        """Vérifie si une alerte a déjà été envoyée"""
        for alert in self.sent_alerts["alerts"]:
            if alert.get("token") == token_addr and alert.get("type") == alert_type:
                return True
        return False
    
    def mark_alert_sent(self, token_addr, symbol, alert_type, performance):
        """Marque une alerte comme envoyée"""
        self.sent_alerts["alerts"].append({
            "token": token_addr,
            "symbol": symbol,
            "type": alert_type,
            "performance": performance,
            "sent_at": datetime.now(timezone.utc).isoformat()
        })
        self.save_sent_alerts()
    
    def send_twitter_alert(self, token, alert_type):
        """Envoie une alerte Twitter"""
        symbol = token.get("symbol", "UNKNOWN")
        addr_short = token.get("address", "")[:6] + "..." + token.get("address", "")[-4:]
        perf = token.get("performance", {})
        gain = perf.get("max_gain" if alert_type == "PUMP" else "current_gain", 0)
        
        if alert_type == "PUMP":
            tweet = f"""🚀 PUMP DETECTED

${symbol} +{gain:.0f}% since detection
Early momentum confirmed

Proof: github.com/lurker-base/lurker/blob/v2-refonte/state/tokens.json

The chain confirms. 👁"""
        else:
            tweet = f"""📉 DUMP CONFIRMED

${symbol} {gain:.0f}% since detection
Risk signaled early

Proof: github.com/lurker-base/lurker/blob/v2-refonte/state/tokens.json

Patterns don't lie. 👁"""
        
        try:
            result = self.twitter.post_tweet(tweet)
            print(f"  ✅ Tweet sent: {result}")
            return True
        except Exception as e:
            print(f"  ❌ Twitter error: {e}")
            return False
    
    def send_telegram_alert(self, token, alert_type):
        """Envoie une alerte Telegram (pour toi)"""
        try:
            bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
            chat_id = os.getenv("TELEGRAM_CHAT_ID")
            
            if not bot_token or not chat_id:
                print("  ⚠️ Telegram credentials not set")
                return False
            
            symbol = token.get("symbol", "UNKNOWN")
            perf = token.get("performance", {})
            gain = perf.get("max_gain" if alert_type == "PUMP" else "current_gain", 0)
            metrics = token.get("metrics", {})
            
            import urllib.request
            import urllib.parse
            
            emoji = "🚀" if alert_type == "PUMP" else "📉"
            message = f"""{emoji} <b>{alert_type} ALERT</b> {emoji}

<b>Token:</b> ${symbol}
<b>Performance:</b> {'+' if alert_type == 'PUMP' else ''}{gain:.0f}%
<b>Liquidité:</b> ${metrics.get('liq_usd', 0):,.0f}

<i>V2 Notifier - LURKER</i>"""
            
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            data = urllib.parse.urlencode({
                'chat_id': chat_id,
                'text': message,
                'parse_mode': 'HTML'
            }).encode()
            
            req = urllib.request.Request(url, data=data, method='POST')
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    print(f"  ✅ Telegram sent")
                    return True
        except Exception as e:
            print(f"  ⚠️ Telegram error: {e}")
        return False
    
    def process_alerts(self):
        """Traite toutes les alertes"""
        print("="*60)
        print("LURKER V2 - Notifier")
        print("="*60)
        
        if not STATE_FILE.exists():
            print("❌ No state found")
            return
        
        with open(STATE_FILE) as f:
            state = json.load(f)
        
        alerts_sent = 0
        
        for addr, token in state["tokens"].items():
            perf = token.get("performance", {})
            status = perf.get("status", "")
            
            # Détecter pump
            if status == "pumping":
                if not self.was_alert_sent(addr, "PUMP"):
                    print(f"\n🚀 PUMP: {token.get('symbol')} (+{perf.get('max_gain', 0):.0f}%)")
                    if self.send_twitter_alert(token, "PUMP"):
                        self.send_telegram_alert(token, "PUMP")
                        self.mark_alert_sent(addr, token.get('symbol'), "PUMP", perf.get('max_gain'))
                        alerts_sent += 1
            
            # Détecter dump
            elif status == "dumping":
                if not self.was_alert_sent(addr, "DUMP"):
                    print(f"\n📉 DUMP: {token.get('symbol')} ({perf.get('current_gain', 0):.0f}%)")
                    if self.send_twitter_alert(token, "DUMP"):
                        self.send_telegram_alert(token, "DUMP")
                        self.mark_alert_sent(addr, token.get('symbol'), "DUMP", perf.get('current_gain'))
                        alerts_sent += 1
        
        print(f"\n✅ Total alerts sent: {alerts_sent}")
        print("="*60)

def main():
    notifier = Notifier()
    notifier.process_alerts()

if __name__ == "__main__":
    main()
