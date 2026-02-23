#!/usr/bin/env python3
"""
Alerte spéciale pour tokens à fort volume (comme ClawdINT)
"""
import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone

BOT_TOKEN = "8455628045:AAGb6Q2PdkPHpobhTAcmMK3SFqJm1QlM6bY"
ALERT_CHAT_ID = "@LurkerAlphaSignals"

def send_alert(token, metrics):
    """Envoie alerte volume anormal"""
    symbol = token['symbol']
    liq = metrics.get('liq_usd', 0)
    vol_1h = metrics.get('vol_1h_usd', 0)
    vol_5m = metrics.get('vol_5m_usd', 0)
    age = token.get('timestamps', {}).get('age_minutes', 0)
    
    # Ratio volume/liquidité
    ratio = vol_1h / liq if liq > 0 else 0
    
    if ratio > 0.5:  # Si volume 1h > 50% de la liquidité = anormal
        alert_text = f"""🚨 HIGH VOLUME ALERT: ${symbol}

⚠️ Anormal volume detected!

📊 Metrics:
💧 Liquidity: ${liq/1000:.1f}k
📈 Volume 1h: ${vol_1h/1000:.1f}k
🔥 Volume 5m: ${vol_5m/1000:.1f}k
📊 Vol/Liq ratio: {ratio:.1f}x
⏱️ Age: {age:.0f}m

🎯 Action: Monitor closely - possible pump/dump

<a href="https://dexscreener.com/base/{token['address']}">View on DexScreener →</a>

👁️ LURKER High Volume Alert"""
        
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        data = urllib.parse.urlencode({
            'chat_id': ALERT_CHAT_ID,
            'text': alert_text,
            'parse_mode': 'HTML',
            'disable_web_page_preview': 'true'
        }).encode()
        
        try:
            urllib.request.urlopen(urllib.request.Request(url, data=data, method='POST'), timeout=30)
            print(f"[ALERT] High volume alert sent for {symbol}")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to send alert: {e}")
            return False
    
    return False

def check_feed():
    """Check current feed for high volume tokens"""
    try:
        with open('signals/cio_feed.json') as f:
            data = json.load(f)
        
        for candidate in data.get('candidates', []):
            token = candidate['token']
            metrics = candidate['metrics']
            
            # Check high volume
            send_alert(token, metrics)
            
    except Exception as e:
        print(f"[ERROR] Check failed: {e}")

if __name__ == "__main__":
    check_feed()
