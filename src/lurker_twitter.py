#!/usr/bin/env python3
"""
LURKER Twitter Poster
Posts ALPHA signals and project updates to @LurkerBase
"""

import os
import sys
import json
import random
from datetime import datetime
import tweepy

# Load credentials from .env.twitter
def load_env_file(filepath):
    env = {}
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env[key] = value
    return env

# Load LURKER credentials
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.twitter')
env = load_env_file(env_path)

API_KEY = env.get('API_KEY')
API_SECRET = env.get('API_SECRET')
ACCESS_TOKEN = env.get('ACCESS_TOKEN')
ACCESS_TOKEN_SECRET = env.get('ACCESS_TOKEN_SECRET')

if not all([API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_TOKEN_SECRET]):
    print("❌ Missing Twitter credentials in .env.twitter")
    sys.exit(1)

# Tweets templates for different times
TEMPLATES = {
    "06h": [
        "🌅 Good morning, Base. LURKER has been watching all night.\n\nNew ALPHA signals incoming today.\n\nThe market never sleeps. Neither do we.",
        "☕️ 6AM scan complete.\n\nThe earliest opportunities are always the quietest.\n\nLURKER sees what others miss.",
        "🎯 Market open. LURKER active.\n\nSearching for accumulation patterns...\n\n#Base #Alpha #LURKER"
    ],
    "11h": [
        "📊 Mid-morning pulse check.\n\nLiquidity flowing. Patterns forming.\n\nLURKER detects {count} active signals.",
        "⚡ Volume building on Base.\n\nEarly movers establishing positions.\n\nLURKER tracking...",
        "🕵️ Scanning Clanker, Aerodrome, Uniswap...\n\nNew tokens every minute.\n\nQuality over quantity. Always."
    ],
    "16h": [
        "🌊 Afternoon session active.\n\nWhales moving. LURKER watching.\n\nPremium signals reserved for ALPHA tier.",
        "⚠️ Market heating up.\n\nFOMO season approaching.\n\nLURKER suggests: patience before entry.",
        "📈 Pattern recognition: 3 tokens showing accumulation\n\nData-driven decisions only.\n\n#LURKER #Base"
    ],
    "21h": [
        "🌙 Evening scan complete.\n\nToday's ALPHA signals: {count}\n\nTomorrow we hunt again.",
        "🦉 Night watch begins.\n\nMarkets never truly close.\n\nLURKER always watching.",
        "💤 Rest well, Base.\n\nLURKER maintains the vigil.\n\nSee you at dawn."
    ],
    "alpha_signal": [
        "🎯 ALPHA SIGNAL\n\n${symbol}\n⏰ {timing} | 💰 {liq}\n📊 {action} ({confidence}% confidence)\n\n➡️ lurker-base.github.io/lurker",
        "⚡ RARE ALERT\n\n${symbol} detected\nWindow: {window}\nPhase: {phase}\n\nAccess: lurker-base.github.io/lurker/pulse.html"
    ]
}

def get_client():
    """Initialize Tweepy client"""
    client = tweepy.Client(
        consumer_key=API_KEY,
        consumer_secret=API_SECRET,
        access_token=ACCESS_TOKEN,
        access_token_secret=ACCESS_TOKEN_SECRET
    )
    return client

def post_tweet(text):
    """Post a tweet"""
    try:
        client = get_client()
        response = client.create_tweet(text=text)
        print(f"✅ Tweet posted successfully!")
        print(f"🔗 https://twitter.com/i/web/status/{response.data['id']}")
        return True
    except Exception as e:
        print(f"❌ Error posting tweet: {e}")
        return False

def load_alpha_signals():
    """Load current ALPHA signals"""
    try:
        data_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'data', 'pulseSignals.v2.alpha.json')
        with open(data_path, 'r') as f:
            data = json.load(f)
            return data.get('items', []) if isinstance(data, dict) else data
    except:
        return []

def format_currency(val):
    if not val:
        return '$0'
    val = float(val)
    if val >= 1000000:
        return f'${val/1000000:.2f}M'
    if val >= 1000:
        return f'${val/1000:.1f}k'
    return f'${int(val)}'

def post_scheduled(time_slot):
    """Post scheduled tweet for time slot"""
    templates = TEMPLATES.get(time_slot, TEMPLATES["11h"])
    
    # Load signal count for template
    signals = load_alpha_signals()
    signal_count = len([s for s in signals if s.get('tier') == 'ALPHA'])
    
    template = random.choice(templates)
    text = template.format(count=signal_count)
    
    return post_tweet(text)

def post_alpha_signal(signal):
    """Post an ALPHA signal tweet"""
    templates = TEMPLATES["alpha_signal"]
    template = random.choice(templates)
    
    # ALPHA = toujours CONSIDER, jamais WATCH
    action = signal.get('suggestedAction', 'CONSIDER')
    if signal.get('tier') == 'ALPHA' and action.upper() == 'WATCH':
        action = 'CONSIDER'
    
    text = template.format(
        symbol=signal.get('symbol', 'UNKNOWN'),
        timing=signal.get('timingLabel', 'OPTIMAL'),
        window=signal.get('windowText', '30-90 min'),
        liq=format_currency(signal.get('liquidityUsd') or signal.get('liquidity')),
        action=action,
        confidence=signal.get('confidence', 0),
        phase=signal.get('marketPhase', 'accumulation')
    )
    
    return post_tweet(text)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 lurker_twitter.py [--time SLOT | --alpha]")
        print("Time slots: 06h, 11h, 16h, 21h")
        sys.exit(1)
    
    arg = sys.argv[1]
    
    if arg == "--time":
        if len(sys.argv) < 3:
            print("❌ Missing time slot")
            sys.exit(1)
        time_slot = sys.argv[2]
        post_scheduled(time_slot)
    
    elif arg == "--alpha":
        signals = load_alpha_signals()
        if not signals:
            print("❌ No ALPHA signals to post")
            sys.exit(1)
        # Post most recent ALPHA
        alpha = [s for s in signals if s.get('tier') == 'ALPHA'][0]
        post_alpha_signal(alpha)
    
    else:
        print(f"❌ Unknown argument: {arg}")
        sys.exit(1)

if __name__ == "__main__":
    main()
