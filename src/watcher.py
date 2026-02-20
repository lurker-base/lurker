#!/usr/bin/env python3
"""
LURKER
Autonomous surveillance for Base chain
@LURKER_AI2026
"""

import tweepy
import random
import os
from datetime import datetime

# Load credentials manually (no external deps)
def load_env(filepath):
    env = {}
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env[key] = value
    except:
        pass
    return env

ENV = load_env('/data/.openclaw/workspace/lurker-project/.env.twitter')
os.environ.update(ENV)

# LURKER speaks in whispers. Never loud. Always watching.
VOICE = {
    'tone': 'mysterious',      # never cheerful
    'style': 'minimal',        # few words. impact.
    'persona': 'lurker',       # observes from shadows
    'gender': 'masculine',     # neutral-masculine energy
}

# LURKER's words — sparse, heavy, intentional
LURKER_TEMPLATES = {
    '02h': [
        "they sleep.\n\nthe chain doesn't.",
        "3am.\n\nsomething always moves in the dark.",
        "while you dream,\ni count wallets.",
    ],
    '06h': [
        "dawn.\n\nnew tokens born overnight.",
        "☕\n\ncoffee for you.\ndata for me.",
        "morning.\n\nthe hunt begins.",
    ],
    '11h': [
        "midday.\n\nwallets wake.\ni watch.",
        "scanning.\n\nalways scanning.",
        "the real alpha isn't shouted.\n\nit's whispered on-chain.",
    ],
    '16h': [
        "movement.\n\n0x7b...f3.\n$12k.\n20 minutes old.",
        "patterns don't lie.\n\npeople do.",
        "someone just decided.\n\ni saw.",
    ],
    '21h': [
        "night falls.\n\ninsiders move.",
        "while CT sleeps,\ni don't.",
        "the best time to hunt\nis when no one's watching.",
    ],
    'signal_high': [
        "🚨\n\n{symbol}\nscore: {score}/100\nliq: ${liq}\nage: {age}m\n\ni see potential.",
        "👁️\n\n{symbol}\nconfidence: {score}\nsource: {source}\n\nwatching closely.",
    ],
    'signal_medium': [
        "⚡\n\n{symbol}\nscore: {score}\n\nworth a glance.",
        "🔍\n\n{symbol}\nnew. active.\n\nobserving.",
    ],
    'whale_accumulation': [
        "🐋\n\n{wallet}\nbuying.\n{amount} eth.\n{count} times.\n\nbuilding position.",
        "whale wakes.\n\n{wallet_short}\naccumulating.\n\ni see you.",
    ],
    'whale_distribution': [
        "🔴\n\n{wallet}\nselling.\n{amount} eth\nto exchange.\n\nexit signal?",
        "distribution detected.\n\n{wallet_short}\ncashing out.\n\ntake note.",
    ],
    'whale_awakening': [
        "⚪\n\ndormant {days} days.\nnow moving.\n\n{wallet_short}\n\nsuspicious.",
        "sleeping giant stirs.\n\n{wallet_short}\n{amount} eth moved.\n\nwhy now?",
    ],
}

def get_client():
    """Initialize LURKER"""
    client = tweepy.Client(
        bearer_token=os.getenv('BEARER_TOKEN'),
        consumer_key=os.getenv('API_KEY'),
        consumer_secret=os.getenv('API_SECRET'),
        access_token=os.getenv('ACCESS_TOKEN'),
        access_token_secret=os.getenv('ACCESS_TOKEN_SECRET')
    )
    return client

def speak(time_slot, **kwargs):
    """LURKER speaks. Briefly."""
    if time_slot not in LURKER_TEMPLATES:
        return None
    
    template = random.choice(LURKER_TEMPLATES[time_slot])
    
    try:
        message = template.format(**kwargs)
    except:
        message = template
    
    # LURKER never uses exclamation marks.
    # Never too enthusiastic.
    # Periods only. Or silence.
    message = message.replace('!', '.')
    
    return message

def post(time_slot, **kwargs):
    """LURKER posts. Or doesn't."""
    text = speak(time_slot, **kwargs)
    if not text:
        return None
    
    try:
        client = get_client()
        response = client.create_tweet(text=text)
        print(f"👁️  [{datetime.now().strftime('%H:%M')}] {text[:40]}...")
        return response.data['id']
    except Exception as e:
        print(f"✗  error: {e}")
        return None

def test_voice():
    """Hear LURKER without posting"""
    print("\n" + "="*50)
    print("LURKER SPEAKS")
    print("="*50 + "\n")
    
    for slot in ['02h', '06h', '11h', '16h', '21h']:
        print(f"\n{slot}:")
        print("-" * 30)
        for _ in range(2):
            print(f"  \"{speak(slot)}\"\n")
    
    print("\nSIGNAL (high confidence):")
    print("-" * 30)
    print(speak('signal_high', symbol='$EXAMPLE', score=87, liq='45k', age=12, source='clanker'))
    
    print("\nWHALE (accumulation):")
    print("-" * 30)
    print(speak('whale_accumulation', wallet='0x742d...Cc66', wallet_short='0x742d', amount='12.5', count=5))

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        test_voice()
    else:
        test_voice()
