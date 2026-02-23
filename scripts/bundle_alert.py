#!/usr/bin/env python3
"""
LURKER Bundle Farming Alert - Telegram notifications for suspicious patterns
"""
import os
import json
import requests
from datetime import datetime, timezone

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

def now():
    return datetime.now(timezone.utc)

def send_telegram_alert(token_symbol, token_address, risk_factors, metrics):
    """Send Telegram alert for bundle farming detection"""
    
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[ALERT] Telegram credentials not configured")
        return False
    
    # Build alert message
    emoji = "🚨"
    title = f"{emoji} BUNDLE FARMING DETECTED"
    
    message = f"""{title}

<b>Token:</b> {token_symbol}
<b>Address:</b> <code>{token_address}</code>

<b>Risk Factors:</b>
"""
    
    for factor in risk_factors:
        factor_display = factor.replace('_', ' ').upper()
        if factor == 'bundle_farming':
            message += f"  🔴 <b>{factor_display}</b>\n"
        elif factor in ['suspicious_balances', 'bot_wallets']:
            message += f"  🟠 {factor_display}\n"
        else:
            message += f"  ⚠️ {factor_display}\n"
    
    message += f"""
<b>Metrics:</b>
  💧 Liquidity: ${metrics.get('liquidity', 0):,.0f}
  📊 Volume 24h: ${metrics.get('volume_24h', 0):,.0f}
  ⏱️ Age: {metrics.get('age_hours', 0):.1f}h

<b>Warning:</b> This token shows signs of artificial volume manipulation. High risk of rug pull.

<a href="https://dexscreener.com/base/{token_address}">View on DexScreener</a>
<a href="https://basescan.org/address/{token_address}">View on BaseScan</a>

<i>LURKER Watchdog — {now().strftime('%H:%M UTC')}</i>
"""
    
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
        
        response = requests.post(url, json=payload, timeout=30)
        
        if response.status_code == 200:
            print(f"[ALERT] ✅ Telegram alert sent for {token_symbol}")
            return True
        else:
            print(f"[ALERT] ❌ Failed to send alert: {response.text}")
            return False
            
    except Exception as e:
        print(f"[ALERT] ❌ Error sending alert: {e}")
        return False

def check_and_alert(token_data):
    """Check if token has bundle farming and send alert"""
    
    risk = token_data.get('risk', {})
    risk_level = risk.get('level', 'low')
    risk_factors = risk.get('factors', [])
    
    # Only alert for high risk with bundle farming
    if risk_level != 'high':
        return False
    
    if 'bundle_farming' not in risk_factors and len(risk_factors) < 3:
        return False
    
    # Check if we already alerted for this token
    alert_file = '/tmp/bundle_alerts.json'
    alerted = {}
    
    if os.path.exists(alert_file):
        with open(alert_file) as f:
            alerted = json.load(f)
    
    token_address = token_data.get('token', {}).get('address', '')
    
    if token_address in alerted:
        print(f"[ALERT] Already alerted for {token_address[:16]}...")
        return False
    
    # Send alert
    token_symbol = token_data.get('token', {}).get('symbol', 'UNKNOWN')
    
    dex = token_data.get('dexscreener', {})
    metrics = {
        'liquidity': dex.get('liquidity', {}).get('usd', 0),
        'volume_24h': dex.get('volume', {}).get('h24', 0),
        'age_hours': token_data.get('age_hours', 0)
    }
    
    success = send_telegram_alert(token_symbol, token_address, risk_factors, metrics)
    
    if success:
        alerted[token_address] = {
            'alerted_at': now().isoformat(),
            'symbol': token_symbol
        }
        
        with open(alert_file, 'w') as f:
            json.dump(alerted, f, indent=2)
    
    return success

if __name__ == "__main__":
    # Test with example data
    test_token = {
        "token": {
            "address": "0x1234...",
            "symbol": "TEST"
        },
        "risk": {
            "level": "high",
            "factors": ["bundle_farming", "suspicious_balances"]
        },
        "dexscreener": {
            "liquidity": {"usd": 37500},
            "volume": {"h24": 150000}
        },
        "age_hours": 2.5
    }
    
    check_and_alert(test_token)
