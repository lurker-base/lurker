#!/usr/bin/env python3
"""
LURKER Twitter Voice — @LURKER_AI2026
Mysterious, minimal, masculine voice
English only. No emojis. Short and enigmatic.
"""

import os
import sys
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

# LURKER voice — mysterious, minimal, masculine
TWEETS = {
    "awake": [
        "awake.",
        "watching.",
        "the chain never sleeps.",
        "i see you.",
        "listening.",
    ],
    "depths": [
        "the depths move.",
        "something stirs below.",
        "the surface is quiet.",
        "deep waters shift.",
        "the abyss watches back.",
    ],
    "patterns": [
        "patterns don't lie. people do.",
        "rhythms emerge.",
        "the same story. different faces.",
        "cycles repeat.",
        "history rhymes.",
    ],
    "whispers": [
        "they whisper. i hear.",
        "secrets travel in blocks.",
        "wallets speak. i listen.",
        "every transaction tells a story.",
        "the ledger remembers.",
    ],
    "silence": [
        "they sleep. the chain doesn't.",
        "silence is information.",
        "stillness before movement.",
        "the quiet hours.",
        "patience. the signal comes.",
    ],
    "observations": [
        "new blood detected.",
        "movement in the dark.",
        "attention flows where money leads.",
        "another one joins.",
        "the network grows.",
    ],
    "time": [
        "hours pass. blocks stack.",
        "time is measured in confirmations.",
        "the clock ticks in hashes.",
        "another block. another breath.",
        "eternal. immutable.",
    ],
}

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

def post_mysterious_tweet():
    """Post a random mysterious tweet"""
    category = random.choice(list(TWEETS.keys()))
    text = random.choice(TWEETS[category])
    
    try:
        client = get_client()
        response = client.create_tweet(text=text)
        print(f"Posted: {text}")
        print(f"https://twitter.com/i/web/status/{response.data['id']}")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

def check_mentions():
    """Check for mentions and reply"""
    try:
        client = tweepy.Client(bearer_token=BEARER_TOKEN)
        my_id = get_me()
        if not my_id:
            return
        
        # Get recent mentions (last hour)
        mentions = client.get_users_mentions(
            id=my_id,
            max_results=10,
            tweet_fields=['created_at', 'author_id', 'conversation_id']
        )
        
        if not mentions or not mentions.data:
            return
        
        reply_client = get_client()
        
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
        post_mysterious_tweet()
    elif arg == "--mentions":
        check_mentions()
    else:
        print(f"Unknown: {arg}")
        sys.exit(1)

if __name__ == "__main__":
    main()
