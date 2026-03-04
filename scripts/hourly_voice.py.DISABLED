#!/usr/bin/env python3
"""
LURKER Hourly Voice - Enigmatic tweets every hour
Mysterious, minimal, masculine voice
⚠️ DUPLICATE PROTECTION: Same tweet cannot be posted within 24h
"""

import sys
import random
import json
import os
from datetime import datetime
sys.path.insert(0, 'src')
from lurker_twitter import post_tweet

HOURLY_TEMPLATES = [
    "the chain doesn't sleep.\n\ni don't either.",
    
    "they move.\n\ni see.",
    
    "block {block}.\n\nanother transaction. another truth.",
    
    "patterns repeat.\n\npeople forget.\n\ni remember.",
    
    "silence is data too.",
    
    "whale wakes.\n\nripple starts.",
    
    "some watch prices.\n\ni watch wallets.",
    
    "the early hours are honest.",
    
    "velocity never lies.",
    
    "i see you.",
    
    "fresh block.\n\nfresh data.\n\nfresh eyes.",
    
    "they think they're hidden.\n\nthey're not.",
    
    "accumulation has a sound.\n\ni hear it.",
    
    "pressure builds.\n\nslowly. then all at once.",
    
    "i don't predict.\n\ni perceive.",
    
    "the network remembers everything.\n\nso do i.",
    
    "while you sleep, i sort.",
    
    "displacement = signal.",
    
    "some patterns only show at 3am.",
    
    "i was made for this.",
    
    "truth lives in the mempool.",
    
    "every transaction leaves a shadow.",
    
    "they can't hide the flow.",
    
    "watching. always watching.",
]

HISTORY_FILE = os.path.join(os.path.dirname(__file__), '..', 'logs', 'hourly_tweet_history.json')

def load_history():
    """Load tweet history"""
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_history(history):
    """Save tweet history (keep last 200)"""
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history[-200:], f)

def is_duplicate(tweet_text, history, hours=24):
    """Check if tweet was posted recently"""
    now = datetime.now()
    for entry in history:
        if entry.get('text') == tweet_text:
            posted_at = datetime.fromisoformat(entry.get('time', '2000-01-01'))
            if (now - posted_at).total_seconds() < (hours * 3600):
                return True
    return False

def get_unique_tweet(history):
    """Get a tweet that hasn't been posted recently"""
    available = [t for t in HOURLY_TEMPLATES if not is_duplicate(t, history)]
    if not available:
        # All tweets used recently, pick random anyway
        available = HOURLY_TEMPLATES
    return random.choice(available)

def post_hourly():
    history = load_history()
    tweet = get_unique_tweet(history)
    
    # Add block number if needed
    if '{block}' in tweet:
        tweet = tweet.format(block=random.randint(42384127, 42385127))
    
    # Check duplicate again (in case of block number collision)
    if is_duplicate(tweet, history):
        print("❌ Duplicate detected, selecting another tweet...")
        tweet = get_unique_tweet(history)
    
    try:
        result = post_tweet(tweet)
        if result:
            # Save to history
            history.append({
                'text': tweet,
                'time': datetime.now().isoformat()
            })
            save_history(history)
            print(f"✅ Hourly tweet posted")
            return True
        else:
            print("❌ Tweet blocked or failed")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    post_hourly()
