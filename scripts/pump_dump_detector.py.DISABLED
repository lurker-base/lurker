#!/usr/bin/env python3
"""
pump_dump_detector.py - Détecte les pumps et dumps en temps réel
Envoie des alertes Twitter automatiques avec preuves GitHub
Met à jour la page predictions
"""

import json
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

# Ajouter src au path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

# Import functions from lurker_twitter
import lurker_twitter as lt

# Config
REGISTRY_FILE = Path(__file__).parent.parent / "state" / "token_registry.json"
PREDICTIONS_FILE = Path(__file__).parent.parent / "state" / "risk_warnings.json"
PUMP_THRESHOLD = 50  # +50%
DUMP_THRESHOLD = -30  # -30%
MIN_LIQUIDITY = 5000  # $5k minimum pour éviter le bruit

class PumpDumpDetector:
    def __init__(self):
        self.registry = self.load_registry()
        self.alerts_sent = self.load_sent_alerts()
        
    def load_registry(self):
        if REGISTRY_FILE.exists():
            with open(REGISTRY_FILE) as f:
                return json.load(f)
        return {"tokens": {}}
    
    def load_sent_alerts(self):
        """Charge les alertes déjà envoyées pour ne pas spammer"""
        sent_file = Path(__file__).parent.parent / "state" / "sent_alerts.json"
        if sent_file.exists():
            with open(sent_file) as f:
                return json.load(f)
        return {}
    
    def save_sent_alerts(self):
        sent_file = Path(__file__).parent.parent / "state" / "sent_alerts.json"
        with open(sent_file, 'w') as f:
            json.dump(self.alerts_sent, f, indent=2)
    
    def calculate_performance(self, token_data):
        """Calcule la performance depuis la détection"""
        price_history = token_data.get('price_history', [])
        if len(price_history) < 2:
            return 0, 0, 0
        
        first_price = price_history[0]['price']
        current_price = price_history[-1]['price']
        max_price = max(p['price'] for p in price_history)
        
        current_gain = ((current_price - first_price) / first_price) * 100
        max_gain = ((max_price - first_price) / first_price) * 100
        
        return current_gain, max_gain, first_price
    
    def detect_pump_dump(self, token_data):
        """Détecte si un token a pumpé ou dumpé significativement"""
        token_info = token_data.get('token', {})
        symbol = token_info.get('symbol', 'UNKNOWN')
        address = token_info.get('address', '')
        
        metrics = token_data.get('metrics', {})
        liq = metrics.get('liq_usd', 0)
        
        # Si metrics.liq_usd est 0 mais qu'on a de l'historique, utiliser le dernier point
        price_history = token_data.get('price_history', [])
        if liq == 0 and price_history:
            liq = price_history[-1].get('liq', 0)
        
        # Ignorer si liquidité trop faible
        if liq < MIN_LIQUIDITY:
            return None
        
        current_gain, max_gain, first_price = self.calculate_performance(token_data)
        
        # Détection PUMP
        if max_gain >= PUMP_THRESHOLD:
            alert_key = f"{address}_pump_{int(max_gain)}"
            if alert_key not in self.alerts_sent:
                return {
                    'type': 'PUMP',
                    'symbol': symbol,
                    'address': address,
                    'gain': max_gain,
                    'current_gain': current_gain,
                    'first_price': first_price,
                    'liq': liq,
                    'alert_key': alert_key
                }
        
        # Détection DUMP
        if current_gain <= DUMP_THRESHOLD:
            alert_key = f"{address}_dump_{int(abs(current_gain))}"
            if alert_key not in self.alerts_sent:
                return {
                    'type': 'DUMP',
                    'symbol': symbol,
                    'address': address,
                    'loss': abs(current_gain),
                    'current_gain': current_gain,
                    'first_price': first_price,
                    'liq': liq,
                    'alert_key': alert_key
                }
        
        return None
    
    def generate_tweet(self, alert):
        """Génère le tweet selon le type d'alerte"""
        symbol = alert['symbol']
        addr_short = alert['address'][:6] + '...' + alert['address'][-4:]
        dex_url = f"dexscreener.com/base/{alert['address'][:10]}..."
        
        if alert['type'] == 'PUMP':
            tweet = f"""🚀 PUMP DETECTED

${symbol} +{alert['gain']:.0f}% since detection
Early entry: {alert['first_price']:.2e}

Proof: github.com/lurker-base/lurker/blob/main/state/token_registry.json

I see before. The chain confirms. 👁"""
        
        else:  # DUMP
            tweet = f"""📉 DUMP CONFIRMED

${symbol} {alert['current_gain']:.0f}% since detection
Risk signaled early. Reality followed.

Proof: github.com/lurker-base/lurker/blob/main/state/token_registry.json

Patterns don't lie. 👁"""
        
        return tweet
    
    def send_telegram_alert(self, alert):
        """Envoie une alerte Telegram immédiate"""
        try:
            # Charger les credentials Telegram (env var d'abord, puis fichier)
            import os
            bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
            chat_id = os.getenv('TELEGRAM_CHAT_ID')
            
            # Fallback sur fichier si pas en env
            if not bot_token or not chat_id:
                env_path = Path(__file__).parent.parent / '.env.telegram'
                if env_path.exists():
                    with open(env_path) as f:
                        for line in f:
                            if '=' in line and not line.startswith('#'):
                                key, value = line.strip().split('=', 1)
                                if key == 'TELEGRAM_BOT_TOKEN' and not bot_token:
                                    bot_token = value
                                if key == 'TELEGRAM_CHAT_ID' and not chat_id:
                                    chat_id = value
            
            if not bot_token or not chat_id:
                print("⚠️ Telegram credentials not found")
                return False
            
            # Construire le message Telegram
            emoji = "🚀" if alert['type'] == 'PUMP' else "📉"
            perf = alert.get('gain') or alert.get('loss')
            
            # Lien DexScreener
            dex_url = f"https://dexscreener.com/base/{alert['address']}"
            
            message = f"""{emoji} <b>{alert['type']} ALERT</b> {emoji}

<b>Token:</b> ${alert['symbol']}
<b>Performance:</b> {'+' if alert['type'] == 'PUMP' else '-'}{perf:.0f}%
<b>Liquidité:</b> ${alert['liq']:,.0f}

<a href='{dex_url}'>🔗 Voir sur DexScreener</a>
<a href='https://github.com/lurker-base/lurker/blob/main/state/token_registry.json'>📋 Preuve GitHub</a>

<i>Alerte automatique - LURKER</i>"""
            
            import urllib.request
            import urllib.parse
            
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            data = urllib.parse.urlencode({
                'chat_id': chat_id,
                'text': message,
                'parse_mode': 'HTML',
                'disable_web_page_preview': True
            }).encode()
            
            req = urllib.request.Request(url, data=data, method='POST')
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    print(f"✅ Telegram alert sent: {alert['symbol']}")
                    return True
        except Exception as e:
            print(f"⚠️ Telegram alert failed: {e}")
            return False
    
    def send_alert(self, alert):
        """Envoie l'alerte Twitter, Telegram et sauvegarde"""
        tweet = self.generate_tweet(alert)
        
        # Envoyer Telegram immédiatement (pour toi)
        self.send_telegram_alert(alert)
        
        try:
            result = lt.post_tweet(tweet)
            print(f"✅ Tweet envoyé: {result}")
            
            # Marquer comme envoyé
            self.alerts_sent[alert['alert_key']] = {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'type': alert['type'],
                'symbol': alert['symbol'],
                'tweet': tweet
            }
            self.save_sent_alerts()
            
            # Mettre à jour les predictions
            self.update_predictions(alert)
            
            return True
        except Exception as e:
            print(f"❌ Erreur envoi tweet: {e}")
            return False
    
    def update_predictions(self, alert):
        """Ajoute l'alerte à la page predictions"""
        try:
            predictions = {}
            if PREDICTIONS_FILE.exists():
                with open(PREDICTIONS_FILE) as f:
                    predictions = json.load(f)
            
            # Créer l'entrée
            prediction_entry = {
                'token': alert['symbol'],
                'address': alert['address'],
                'type': alert['type'],
                'performance': alert.get('gain') or alert.get('loss'),
                'detected_at': datetime.now(timezone.utc).isoformat(),
                'status': 'confirmed',
                'proof_url': 'github.com/lurker-base/lurker/blob/main/state/token_registry.json'
            }
            
            # Ajouter à la liste
            if 'predictions' not in predictions:
                predictions['predictions'] = []
            predictions['predictions'].insert(0, prediction_entry)
            
            # Garder seulement les 50 dernières
            predictions['predictions'] = predictions['predictions'][:50]
            
            with open(PREDICTIONS_FILE, 'w') as f:
                json.dump(predictions, f, indent=2)
            
            print(f"✅ Predictions mises à jour: {alert['symbol']}")
        except Exception as e:
            print(f"❌ Erreur update predictions: {e}")
    
    def run(self):
        """Lance la détection sur tous les tokens"""
        print("="*60)
        print("PUMP/DUMP DETECTOR")
        print("="*60)
        
        alerts_found = []
        
        for addr, token_data in self.registry.get('tokens', {}).items():
            alert = self.detect_pump_dump(token_data)
            if alert:
                alerts_found.append(alert)
                print(f"\n🚨 {alert['type']} détecté: {alert['symbol']}")
                print(f"   Performance: {alert.get('gain') or alert.get('loss'):.0f}%")
                print(f"   Liquidité: ${alert['liq']:,.0f}")
                
                # Envoyer l'alerte
                self.send_alert(alert)
        
        if not alerts_found:
            print("\n✅ Aucun nouveau pump/dump détecté")
        else:
            print(f"\n📊 Total: {len(alerts_found)} alertes envoyées")
        
        print("="*60)

if __name__ == "__main__":
    detector = PumpDumpDetector()
    detector.run()
