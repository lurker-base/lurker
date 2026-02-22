#!/usr/bin/env python3
"""
LURKER Twitter Voice — @LURKER_AI2026
Mysterious, minimal, masculine voice
Tweets based on REAL signals from the scanner
"""

import os
import sys
import json
import random
from datetime import datetime
import tweepy

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

# Load credentials
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.twitter')
env = load_env_file(env_path)

API_KEY = env.get('API_KEY')
API_SECRET = env.get('API_SECRET')
ACCESS_TOKEN = env.get('ACCESS_TOKEN')
ACCESS_TOKEN_SECRET = env.get('ACCESS_TOKEN_SECRET')
BEARER_TOKEN = env.get('BEARER_TOKEN')

if not all([API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_TOKEN_SECRET]):
    print("Missing credentials")
    sys.exit(1)

# Signal-based mysterious tweets
# Each category corresponds to a signal tier
SIGNAL_TWEETS = {
    "fresh": [  # CIO - fresh detection
        "new blood detected.",
        "something emerges from the void.",
        "the depths birth another.",
        "fresh shadows on the chain.",
        "a new presence stirs.",
    ],
    "watching": [  # WATCH - observing
        "watching closely.",
        "eyes fixed. patience.",
        "the trial begins.",
        "under observation.",
        "not yet. but soon.",
    ],
    "hot": [  # HOTLIST - interesting
        "patterns converge.",
        "momentum whispers.",
        "the signal strengthens.",
        "attention gathers.",
        "rhythms align.",
    ],
    "fast": [  # FAST-CERTIFIED
        "movement confirmed.",
        "the pattern holds.",
        "validation complete.",
        "survivor identified.",
        "time proves quality.",
    ],
    "certified": [  # CERTIFIED
        "proven.",
        "verified by time.",
        "the ledger remembers the worthy.",
        "survivors speak truth.",
        "only the strong remain.",
    ],
    "quiet": [  # No signals
        "silence is information.",
        "the quiet hours.",
        "patience. the signal comes.",
        "stillness before movement.",
        "they sleep. the chain doesn't.",
    ],
    "whispers": [  # General mysterious
        "they whisper. i hear.",
        "secrets travel in blocks.",
        "wallets speak. i listen.",
        "every transaction tells a story.",
        "the depths move.",
    ],
}

def load_signals():
    """Load current signal counts from feeds"""
    base_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'data')
    signals = {
        'cio': 0,
        'watch': 0,
        'hotlist': 0,
        'fast': 0,
        'certified': 0
    }
    
    # Try to load from various feed files
    try:
        # CIO feed
        cio_path = os.path.join(base_path, 'cio_feed.json')
        if os.path.exists(cio_path):
            with open(cio_path, 'r') as f:
                data = json.load(f)
                signals['cio'] = len(data.get('candidates', []))
    except:
        pass
    
    try:
        # Watch feed
        watch_path = os.path.join(base_path, 'watch_feed.json')
        if os.path.exists(watch_path):
            with open(watch_path, 'r') as f:
                data = json.load(f)
                signals['watch'] = len(data.get('watch', []))
    except:
        pass
    
    try:
        # Hotlist feed
        hot_path = os.path.join(base_path, 'hotlist_feed.json')
        if os.path.exists(hot_path):
            with open(hot_path, 'r') as f:
                data = json.load(f)
                signals['hotlist'] = len(data.get('hotlist', []))
    except:
        pass
    
    try:
        # Fast certified
        fast_path = os.path.join(base_path, 'fast_certified_feed.json')
        if os.path.exists(fast_path):
            with open(fast_path, 'r') as f:
                data = json.load(f)
                signals['fast'] = len(data.get('fast_certified', []))
    except:
        pass
    
    return signals

def get_tweet_for_signals(signals):
    """Choose appropriate tweet based on signal activity"""
    # Priority: hotlist > cio > watch > fast > certified > quiet
    if signals['hotlist'] > 0:
        return random.choice(SIGNAL_TWEETS["hot"])
    elif signals['cio'] > 0:
        return random.choice(SIGNAL_TWEETS["fresh"])
    elif signals['watch'] > 0:
        return random.choice(SIGNAL_TWEETS["watching"])
    elif signals['fast'] > 0:
        return random.choice(SIGNAL_TWEETS["fast"])
    elif signals['certified'] > 0:
        return random.choice(SIGNAL_TWEETS["certified"])
    else:
        return random.choice(SIGNAL_TWEETS["quiet"])

def get_client():
    return tweepy.Client(
        consumer_key=API_KEY,
        consumer_secret=API_SECRET,
        access_token=ACCESS_TOKEN,
        access_token_secret=ACCESS_TOKEN_SECRET
    )

def get_me():
    """Get user ID for mention checking"""
    client = tweepy.Client(bearer_token=BEARER_TOKEN)
    me = client.get_me()
    return me.data.id if me else None

def post_signal_tweet():
    """Post a tweet based on current signals"""
    signals = load_signals()
    text = get_tweet_for_signals(signals)
    
    try:
        client = get_client()
        response = client.create_tweet(text=text)
        print(f"Posted: {text}")
        print(f"Signals: CIO={signals['cio']}, WATCH={signals['watch']}, HOT={signals['hotlist']}")
        print(f"https://twitter.com/i/web/status/{response.data['id']}")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

def check_mentions():
    """Check for mentions and reply with signal-aware responses"""
    try:
        client = tweepy.Client(bearer_token=BEARER_TOKEN)
        my_id = get_me()
        if not my_id:
            return
        
        # Get recent mentions (last 30 min)
        mentions = client.get_users_mentions(
            id=my_id,
            max_results=10,
            tweet_fields=['created_at', 'author_id', 'conversation_id']
        )
        
        if not mentions or not mentions.data:
            return
        
        reply_client = get_client()
        signals = load_signals()
        
        # Signal-aware replies
        replies = {
            "hello": ["hello.", "watching.", "i see you."],
            "hi": ["hello.", "watching.", "observing."],
            "what": ["observing the chain.", "watching base.", "patterns."],
            "how": ["silently.", "patiently.", "always."],
            "when": ["now.", "soon.", "in time."],
            "why": ["someone must watch.", "the depths need eyes.", "information is edge."],
            "token": ["i observe. i do not shill.", "judge for yourself.", "data, not advice."],
            "buy": ["i do not advise.", "your decision.", "watch. learn. decide."],
            "price": ["numbers change. patterns persist.", "i watch movement.", "the market speaks."],
            "lurker": ["present.", "always here.", "in the depths."],
            "signal": ["the signal comes.", "patience reveals.", "when the time is right."] if signals['hotlist'] == 0 else ["patterns converge.", "the moment approaches.", "watch closely."],
            "hot": ["heat detected." if signals['hotlist'] > 0 else "not yet. soon.", "momentum builds." if signals['hotlist'] > 0 else "patience.", "the fire grows." if signals['hotlist'] > 0 else "waiting."],
        }
        
        for mention in mentions.data:
            text_lower = mention.text.lower()
            
            # Check for keywords
            for keyword, responses in replies.items():
                if keyword in text_lower:
                    reply_text = random.choice(responses)
                    try:
                        reply_client.create_tweet(
                            text=reply_text,
                            in_reply_to_tweet_id=mention.id
                        )
                        print(f"Replied to {mention.id}: {reply_text}")
                    except:
                        pass
                    break
    
    except Exception as e:
        print(f"Mention check error: {e}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 lurker_voice_twitter.py [--post | --mentions]")
        sys.exit(1)
    
    arg = sys.argv[1]
    
    if arg == "--post":
        post_signal_tweet()
    elif arg == "--mentions":
        check_mentions()
    else:
        print(f"Unknown: {arg}")
        sys.exit(1)

if __name__ == "__main__":
    main()
