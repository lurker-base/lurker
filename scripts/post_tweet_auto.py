#!/usr/bin/env python3
"""
LURKER Auto Tweet — Generate and post tweets automatically
Uses templates in the LURKER voice: mysterious, minimalist, masculine
"""
import os
import sys
import random
import tweepy
from datetime import datetime

# Load credentials
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

env_path = os.path.join(os.path.dirname(__file__), '..', '.env.twitter')
env = load_env_file(env_path)

API_KEY = env.get('API_KEY') or os.getenv('TWITTERKEY') or os.getenv('API_KEY')
API_SECRET = env.get('API_SECRET') or os.getenv('TWITTERS') or os.getenv('API_SECRET')
ACCESS_TOKEN = env.get('ACCESS_TOKEN') or os.getenv('TWITTER') or os.getenv('ACCESS_TOKEN')
ACCESS_TOKEN_SECRET = env.get('ACCESS_TOKEN_SECRET') or os.getenv('TWITTERSECRET') or os.getenv('ACCESS_TOKEN_SECRET')

# LURKER Voice Templates
TEMPLATES = {
    "observation": [
        "we don't sleep. the chain doesn't either.",
        "fresh detection. {age} old. watching.",
        "the quiet hours reveal the most.",
        "patterns don't announce themselves. we track them.",
        "while you sleep, we watch.",
        "every transaction leaves a trace.",
        "silence is information too.",
        "the depths don't hide from us.",
        "we see the ripples before the waves.",
        "early detection is the only edge.",
    ],
    "philosophy": [
        "most watch price. we watch behavior.",
        "predictions are noise. patterns are signal.",
        "the chain remembers everything.",
        "information is the only true alpha.",
        "we don't predict. we detect.",
        "those who watch longest see clearest.",
        "every wallet tells a story.",
        "the best time to watch was yesterday. the second best is now.",
        "behavior doesn't lie. narratives do.",
        "we're not early. everyone else is late.",
    ],
    "mysterious": [
        "we see you.",
        "the network is talking. are you listening?",
        "something moves in the deep.",
        "they think they're hidden.",
        "the watch continues.",
        "we never blink.",
        "information wants to be found.",
        "the chain whispers. we hear it.",
        "there's always someone watching.",
        "you're not alone in the dark.",
    ],
    "engagement": [
        "build your own watcher. or watch ours. either way — now you know.",
        "your edge is only as good as your information.",
        "the difference between early and late is everything.",
        "most arrive when the story is over. we catch the first page.",
        "scanning. detecting. alerting. this is what we do.",
        "the market has patterns. we find them.",
        "every second of delay costs.",
        "we don't sell signals. we sell time.",
        "become the watcher. not the watched.",
        "knowledge isn't power. timely knowledge is.",
    ],
    "minimal": [
        "watching.",
        "scanning.",
        "detected.",
        "alerted.",
        "verified.",
        "tracking.",
        "observing.",
        "lurking.",
    ],
    "momentum": [
        "volume rising. liquidity locked. we're watching.",
        "the whales are moving. we see the wake.",
        "accumulation patterns detected. early stage.",
        "smart money leaves footprints. we follow them.",
        "when they buy silently, we notice loudly.",
        "before the pump, there's always a signal.",
        "the quiet accumulation is the loudest signal.",
    ]
}

def get_random_tweet():
    """Generate a random LURKER tweet"""
    category = random.choice(list(TEMPLATES.keys()))
    template = random.choice(TEMPLATES[category])
    
    # Replace placeholders
    age = random.choice(["2m", "5m", "12m", "23m", "37m"])
    tweet = template.format(age=age)
    
    return tweet

def post_tweet(text):
    """Post tweet via Tweepy"""
    try:
        client = tweepy.Client(
            consumer_key=API_KEY,
            consumer_secret=API_SECRET,
            access_token=ACCESS_TOKEN,
            access_token_secret=ACCESS_TOKEN_SECRET
        )
        
        response = client.create_tweet(text=text)
        print(f"[LURKER] Posted: {text}")
        print(f"https://twitter.com/i/web/status/{response.data['id']}")
        return True
    except Exception as e:
        print(f"[LURKER] Error: {e}")
        return False

def main():
    # Generate tweet
    tweet_text = get_random_tweet()
    
    # Post it
    success = post_tweet(tweet_text)
    
    if success:
        # Log to file
        log_file = os.path.join(os.path.dirname(__file__), '..', 'logs', 'tweets.log')
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        with open(log_file, 'a') as f:
            f.write(f"{datetime.now().isoformat()} | {tweet_text}\n")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
