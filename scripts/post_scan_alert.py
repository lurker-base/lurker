#!/usr/bin/env python3
"""Alert on new CIO tokens via Telegram"""
import json
import os
import requests
from pathlib import Path

TELEGRAM_BOT_TOKEN = '7845188490:AAHdqTcvF1D1N6TzCcY0KWKu-9Xg6K9mR1E'
TELEGRAM_CHAT_ID = '7473322586'
DATA_FILE = '/data/.openclaw/workspace/lurker-project/data/signals/cio_feed.json'
LAST_FILE = '/data/.openclaw/workspace/lurker-project/.last_cio_alert.json'

def send_telegram(msg):
    try:
        requests.post(f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage',
                     data={'chat_id': TELEGRAM_CHAT_ID, 'text': msg, 'parse_mode': 'Markdown'})
    except Exception as e:
        print(f"Telegram error: {e}")

def load_last():
    try:
        return json.load(open(LAST_FILE))
    except:
        return []

def save_last(tokens):
    json.dump(tokens, open(LAST_FILE, 'w'))

def main():
    if not os.path.exists(DATA_FILE):
        print("No data file")
        return
    
    data = json.load(open(DATA_FILE))
    candidates = data.get('candidates', [])
    
    if not candidates:
        print("No candidates")
        return
    
    # Get addresses already alerted
    last_alerted = load_last()
    current_addresses = [c.get('address', '') for c in candidates]
    
    new_tokens = [c for c in candidates if c.get('address', '') not in last_alerted]
    
    if new_tokens:
        msg = "🚀 *NOUVEAUX SIGNAUX LURKER*\n\n"
        
        for c in new_tokens:
            symbol = c.get('symbol', '?')
            address = c.get('address', '')
            liq = c.get('liquidityUsd', 0)
            age = c.get('ageMinutes', 0)
            badges = c.get('badges', [])
            score = c.get('score', c.get('scores', {}).get('cio_score', 0))
            risk = c.get('risk', 'unknown')
            
            # Signal type based on badges and score
            if any('PUMP' in b for b in badges) or score >= 95:
                signal_type = "📈 PUMP"
            elif any('DUMP' in b for b in badges) or score < 50:
                signal_type = "📉 DUMP"  
            elif any('FRESH' in b for b in badges):
                signal_type = "🆕 NEW"
            else:
                signal_type = "⚡ ACTIVITY"
            
            msg += f"{signal_type} ${symbol}\n"
            msg += f"  💧 Liquidity: ${liq:,.0f}\n"
            msg += f"  ⏱️ Age: {age:.1f}min\n"
            msg += f"  🎯 Score: {score}\n"
            msg += f"  ⚠️ Risk: {risk}\n"
            if badges:
                msg += f"  🏷️ {' '.join(badges)}\n"
            msg += f"  🔗 [DexScreener](https://dexscreener.com/base/{address})\n\n"
        
        msg += "🔗 https://lurker-base.github.io/lurker/"
        send_telegram(msg)
        print(f"✅ Alert sent for {len(new_tokens)} tokens")
        
        save_last(current_addresses)
    else:
        print("No new tokens")

if __name__ == "__main__":
    main()
