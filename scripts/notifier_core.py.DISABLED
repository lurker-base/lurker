#!/usr/bin/env python3
"""
LURKER Core - Notifier
Alertes Twitter + Telegram pour pumps/dumps
Logique simplifiée de pump_dump_detector.py
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

# Ajouter src au path pour lurker_twitter
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from lurker_twitter import post_tweet

STATE_FILE = Path(__file__).parent.parent / "state" / "lurker_state.json"
SENT_ALERTS_FILE = Path(__file__).parent.parent / "state" / "sent_alerts.json"

# Seuils
PUMP_THRESHOLD = 50    # +50%
DUMP_THRESHOLD = -30   # -30%

class Notifier:
    def __init__(self):
        self.sent_alerts = self.load_sent_alerts()
        
        # Telegram config
        self.telegram_token = os.getenv("TELEGRAM_BOT_TOKEN")
        self.telegram_chat = os.getenv("TELEGRAM_CHAT_ID")
    
    def load_sent_alerts(self):
        if SENT_ALERTS_FILE.exists():
            with open(SENT_ALERTS_FILE) as f:
                return json.load(f)
        return {"alerts": []}
    
    def save_sent_alerts(self):
        SENT_ALERTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SENT_ALERTS_FILE, 'w') as f:
            json.dump(self.sent_alerts, f, indent=2)
    
    def was_alert_sent(self, token_addr, alert_type):
        for alert in self.sent_alerts["alerts"]:
            if alert.get("token") == token_addr and alert.get("type") == alert_type:
                # Ne pas renvoyer si alerte < 24h
                sent_at = datetime.fromisoformat(alert.get("sent_at", "2000-01-01"))
                if (datetime.now(timezone.utc) - sent_at).total_seconds() < 86400:
                    return True
        return False
    
    def mark_alert_sent(self, token_addr, symbol, alert_type, performance):
        self.sent_alerts["alerts"].append({
            "token": token_addr,
            "symbol": symbol,
            "type": alert_type,
            "performance": performance,
            "sent_at": datetime.now(timezone.utc).isoformat()
        })
        self.save_sent_alerts()
    
    def get_symbol_with_address(self, token):
        """Return symbol with shortened address to avoid duplicates"""
        symbol = token.get("symbol", "UNKNOWN")
        addr = token.get("address", "")
        if addr:
            short_addr = addr[:6] + "..." + addr[-4:]
            return f"${symbol} ({short_addr})"
        return f"${symbol}"
    
    def check_for_duplicate_symbols(self, state, current_token):
        """Check if another token has the same symbol"""
        current_symbol = current_token.get("symbol", "").upper()
        current_addr = current_token.get("address", "").lower()
        
        duplicates = []
        for addr, token in state.get("tokens", {}).items():
            if token.get("symbol", "").upper() == current_symbol:
                if addr.lower() != current_addr:
                    duplicates.append(token)
        
        return duplicates
    
    def send_twitter_alert(self, token, alert_type, state):
        symbol_with_addr = self.get_symbol_with_address(token)
        perf = token.get("performance", {})
        
        # Check for duplicates
        duplicates = self.check_for_duplicate_symbols(state, token)
        if duplicates:
            print(f"    ⚠️ WARNING: {len(duplicates)} other token(s) with same symbol found")
        
        if alert_type == "PUMP":
            gain = perf.get("max_gain", 0)
            tweet = f"""🚀 PUMP DETECTED

{symbol_with_addr} +{gain:.0f}% since detection
Early momentum confirmed

Proof: github.com/lurker-base/lurker/blob/main/state/lurker_state.json

The chain confirms. 👁"""
        else:
            gain = perf.get("current_gain", 0)
            tweet = f"""📉 DUMP CONFIRMED

{symbol_with_addr} {gain:.0f}% since detection
Risk signaled early

Proof: github.com/lurker-base/lurker/blob/main/state/lurker_state.json

Patterns don't lie. 👁"""
        
        try:
            result = post_tweet(tweet)
            print(f"    ✅ Tweet: {result}")
            return True
        except Exception as e:
            print(f"    ❌ Twitter error: {e}")
            return False
    
    def send_telegram_alert(self, token, alert_type):
        if not self.telegram_token or not self.telegram_chat:
            print("    ⚠️ Telegram not configured")
            return False
        
        import requests
        
        symbol = token.get("symbol", "UNKNOWN")
        addr_short = token.get("address", "")[:6] + "..." + token.get("address", "")[-4:]
        perf = token.get("performance", {})
        metrics = token.get("metrics", {})
        
        if alert_type == "PUMP":
            title = f"🚀 PUMP: ${symbol}"
            gain = perf.get("max_gain", 0)
        else:
            title = f"📉 DUMP: ${symbol}"
            gain = perf.get("current_gain", 0)
        
        message = f"""{title}

📊 Performance: {gain:+.1f}%
💧 Liquidity: ${metrics.get('liq_usd', 0):,.0f}
💰 Market Cap: ${metrics.get('market_cap', 0):,.0f}
📍 Address: {addr_short}
⏱ Age: {self.calculate_age_hours(token.get('detected_at')):.1f}h

🔗 github.com/lurker-base/lurker/blob/main/state/lurker_state.json"""
        
        try:
            url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
            r = requests.post(url, json={
                "chat_id": self.telegram_chat,
                "text": message,
                "disable_web_page_preview": True
            }, timeout=10)
            r.raise_for_status()
            print(f"    ✅ Telegram sent")
            return True
        except Exception as e:
            print(f"    ❌ Telegram error: {e}")
            return False
    
    def calculate_age_hours(self, detected_at):
        try:
            dt = datetime.fromisoformat(detected_at.replace('Z', '+00:00'))
            return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        except:
            return 0
    
    def is_likely_scam(self, token, state):
        """Check if token is likely a scam/copycat"""
        symbol = token.get("symbol", "").upper()
        addr = token.get("address", "").lower()
        liq = token.get("metrics", {}).get("liq_usd", 0) or 0
        
        # Check if there's another token with same symbol and higher liquidity
        for other_addr, other_token in state.get("tokens", {}).items():
            if other_token.get("symbol", "").upper() == symbol:
                if other_addr.lower() != addr:
                    other_liq = other_token.get("metrics", {}).get("liq_usd", 0) or 0
                    # If this token has < 5% liquidity of the other, likely a copycat
                    if liq > 0 and other_liq > 0 and liq < (other_liq * 0.05):
                        return True, f"copycat (liq ${liq:,.0f} vs ${other_liq:,.0f})"
        
        # Very low liquidity = likely scam
        if liq < 5000:
            return True, f"low liquidity (${liq:,.0f})"
        
        return False, None
    
    def process_alerts(self, state):
        tokens = state.get("tokens", {})
        alerts_sent = {"pump": 0, "dump": 0, "skipped": 0, "scam_filtered": 0}
        total_sent = 0
        MAX_ALERTS_PER_RUN = 2  # Limit to avoid spam
        
        # Collect all pending alerts first
        pending_alerts = []
        for addr, token in tokens.items():
            perf = token.get("performance", {})
            status = perf.get("status", "")
            max_gain = perf.get("max_gain", 0)
            current_gain = perf.get("current_gain", 0)
            
            # Déterminer type d'alerte
            alert_type = None
            if status == "pumping" and max_gain >= PUMP_THRESHOLD:
                alert_type = "PUMP"
            elif status == "dumping" and current_gain <= DUMP_THRESHOLD:
                alert_type = "DUMP"
            
            if not alert_type:
                continue
            
            # Vérifier si déjà envoyé
            if self.was_alert_sent(addr, alert_type):
                alerts_sent["skipped"] += 1
                continue
            
            # Vérifier si c'est un scam/copycat
            is_scam, reason = self.is_likely_scam(token, state)
            if is_scam:
                print(f"\n  🚫 {token['symbol']} filtered: {reason}")
                alerts_sent["scam_filtered"] += 1
                # Mark as sent to avoid future alerts
                self.mark_alert_sent(addr, f"{token['symbol']} (SCAM)", alert_type, perf)
                continue
            
            pending_alerts.append((addr, token, alert_type, perf))
        
        # Sort by severity (highest gains/losses first)
        pending_alerts.sort(key=lambda x: abs(x[3].get("max_gain" if x[2] == "PUMP" else "current_gain", 0)), reverse=True)
        
        # Process only top alerts (respecting limit)
        for addr, token, alert_type, perf in pending_alerts[:MAX_ALERTS_PER_RUN]:
            if total_sent >= MAX_ALERTS_PER_RUN:
                print(f"\n  ⏸️ Rate limit: {len(pending_alerts) - total_sent} more alerts pending for next run")
                break
            
            print(f"\n  📢 {token['symbol']} → {alert_type}")
            
            # Envoyer
            twitter_ok = self.send_twitter_alert(token, alert_type, state)
            telegram_ok = self.send_telegram_alert(token, alert_type)
            
            if twitter_ok or telegram_ok:
                self.mark_alert_sent(addr, token['symbol'], alert_type, perf)
                if alert_type == "PUMP":
                    alerts_sent["pump"] += 1
                else:
                    alerts_sent["dump"] += 1
                total_sent += 1
        
        return alerts_sent

def main():
    print("="*60)
    print("LURKER Core Notifier v1.5")
    print("="*60)
    
    if not STATE_FILE.exists():
        print("No state found. Run scanner + lifecycle first.")
        return
    
    with open(STATE_FILE) as f:
        state = json.load(f)
    
    print(f"Checking {len(state['tokens'])} tokens...")
    
    notifier = Notifier()
    results = notifier.process_alerts(state)
    
    print(f"\n{'='*60}")
    print(f"Pumps alerted: {results['pump']}")
    print(f"Dumps alerted: {results['dump']}")
    print(f"Skipped (already sent): {results['skipped']}")
    print("="*60)

if __name__ == "__main__":
    main()
