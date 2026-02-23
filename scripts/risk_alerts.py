#!/usr/bin/env python3
"""
LURKER Risk Alert System — Telegram alerts for detected risks
Sends immediate alerts when dumping/honeypot/scam is detected
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Telegram config
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ALERT_CHAT_ID = os.getenv("LURKER_ALERTS_CHAT_ID")  # Channel/group for risk alerts

RISK_ICONS = {
    "dumping": "🔴",
    "honeypot": "🪤", 
    "rug_pull": "💀",
    "whale_dump": "🐋",
    "suspicious": "⚠️"
}

def send_telegram_alert(text):
    """Send alert to Telegram"""
    import urllib.request
    import urllib.parse
    
    if not BOT_TOKEN or not ALERT_CHAT_ID:
        print("[ALERT] Missing Telegram credentials")
        return False
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        'chat_id': ALERT_CHAT_ID,
        'text': text,
        'parse_mode': 'HTML',
        'disable_web_page_preview': 'true'
    }).encode()
    
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            return result.get('ok', False)
    except Exception as e:
        print(f"[ALERT] Failed: {e}")
        return False

def format_risk_alert(token_data, risk_type, risk_factors, confidence):
    """Format risk alert message"""
    symbol = token_data.get('token', {}).get('symbol', 'UNKNOWN')
    address = token_data.get('token', {}).get('address', '')
    metrics = token_data.get('metrics', {})
    
    icon = RISK_ICONS.get(risk_type, "⚠️")
    liq = metrics.get('liq_usd', 0)
    vol = metrics.get('vol_1h_usd', 0)
    age = token_data.get('timestamps', {}).get('age_minutes', 0)
    
    factors_text = "\n".join([f"  • {f}" for f in risk_factors])
    
    msg = f"""<b>{icon} RISK ALERT: {symbol}</b>

<b>Type:</b> {risk_type.upper()}
<b>Confidence:</b> {confidence}%

<b>Token:</b> <code>{address}</code>

<b>Metrics:</b>
💧 Liquidity: ${liq/1000:.1f}k
📈 Volume 1h: ${vol/1000:.1f}k
⏱️ Age: {age:.0f}m

<b>Risk Factors:</b>
{factors_text}

<a href="https://dexscreener.com/base/{address}">View on DexScreener →</a>

⚠️ <b>DO NOT BUY</b> — This token shows high risk patterns.
👁️ LURKER Detection"""
    
    return msg

def check_and_alert(token_data):
    """Check token for risks and send alert if detected"""
    risk_level = token_data.get('risk_level', 'unknown')
    risks = token_data.get('risks', [])
    
    # Only alert for high risk
    if risk_level != 'high' or not risks:
        return False
    
    # Determine risk type
    risk_type = "suspicious"
    if any('dump' in r.lower() for r in risks):
        risk_type = "dumping"
    elif any('honeypot' in r.lower() for r in risks):
        risk_type = "honeypot"
    elif any('rug' in r.lower() for r in risks):
        risk_type = "rug_pull"
    elif any('whale' in r.lower() for r in risks):
        risk_type = "whale_dump"
    
    # Calculate confidence based on number of risk factors
    confidence = min(50 + len(risks) * 15, 95)
    
    # Format and send alert
    alert_text = format_risk_alert(token_data, risk_type, risks, confidence)
    success = send_telegram_alert(alert_text)
    
    if success:
        print(f"[ALERT SENT] {token_data['token']['symbol']} - {risk_type}")
        # Log to file
        log_alert(token_data, risk_type, confidence)
    
    return success

def log_alert(token_data, risk_type, confidence):
    """Log alert to file"""
    log_file = Path("logs/risk_alerts.json")
    log_file.parent.mkdir(exist_ok=True)
    
    alerts = {}
    if log_file.exists():
        with open(log_file) as f:
            alerts = json.load(f)
    
    alert_id = f"alert_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    alerts[alert_id] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "token": token_data['token'],
        "risk_type": risk_type,
        "confidence": confidence,
        "metrics": token_data.get('metrics', {})
    }
    
    with open(log_file, 'w') as f:
        json.dump(alerts, f, indent=2)

def main():
    """Test with sample data"""
    test_token = {
        "token": {
            "symbol": "TEST",
            "address": "0x123..."
        },
        "metrics": {
            "liq_usd": 50000,
            "vol_1h_usd": 100000
        },
        "timestamps": {
            "age_minutes": 30
        },
        "risk_level": "high",
        "risks": ["rapid dump detected", "concentrated wallets"]
    }
    
    check_and_alert(test_token)

if __name__ == "__main__":
    main()
