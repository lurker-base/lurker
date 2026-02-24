#!/usr/bin/env python3
"""
LURKER Auto Tweet — Generate and post tweets automatically
Uses templates in the LURKER voice: mysterious, minimalist, masculine
⚠️ CRITICAL: ENGLISH ONLY - NO FRENCH / NO CONTRACT / NO TOKEN / NO LAUNCH
"""
import os
import sys
import random
import re
import tweepy
from datetime import datetime

# =============================================================================
# CRITICAL RULE: ENGLISH ONLY - NO FRENCH / NO CONTRACT / NO TOKEN / NO LAUNCH
# =============================================================================

FRENCH_INDICATORS = [
    'é', 'è', 'ê', 'à', 'ù', 'ç', 'â', 'î', 'ô', 'û', 'ë', 'ï', 'ü',
    'je ', 'tu ', 'il ', 'nous ', 'vous ', 'ils ', 'elles ',
    'suis ', 'sommes ', 'êtes ', 'sont ', 'avons ', 'avez ',
    'détecté', 'confirmé', 'résultat', 'adresse ', 'heures ',
    'matin', 'soir', 'nuit', 'premier ', 'dernier ', 'même ',
    'vois ', 'regardez ', 'noté ', 'chaque ', 'certains ',
    'silencieusement', 'vérité', 'crépuscule', 'peut-être',
    'peux ', 'veux ', 'dois ', 'données', 'café', 'veillons',
    'méthode', 'changent', 'loups', 'peau', 'loup ', 'louve'
]

BLOCKED_WORDS = ['contract', 'token', 'launch', 'ico', 'presale', 'buy', 'invest']

def contains_french(text):
    """Check if text contains French words or characters."""
    text_lower = text.lower()
    for indicator in FRENCH_INDICATORS:
        if indicator in text_lower:
            return True, indicator
    if re.search(r'[àâäçéèêëîïôöùûü]', text):
        return True, "accents"
    return False, None

def contains_blocked_words(text):
    """Check for blocked words like contract, token, launch"""
    text_lower = text.lower()
    for word in BLOCKED_WORDS:
        if word in text_lower:
            return True, word
    return False, None

def preflight_check(tweet_text):
    """Run all checks before posting"""
    # Check 1: No French
    is_french, indicator = contains_french(tweet_text)
    if is_french:
        print(f"❌ BLOCKED: French detected ('{indicator}')")
        return False
    
    # Check 2: No blocked words
    has_blocked, word = contains_blocked_words(tweet_text)
    if has_blocked:
        print(f"❌ BLOCKED: Forbidden word ('{word}')")
        return False
    
    return True

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

# LURKER Voice Templates - NO CONTRACT/TOKEN/LAUNCH MENTIONS
TEMPLATES = {
    "observation": [
        "we don't sleep. the chain doesn't either.",
        "fresh detection. watching.",
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
        "the best time to watch was yesterday. the second best is now.",
        "patterns repeat. we remember.",
        "in a sea of noise, we find signal.",
        "watching is not passive. it's a choice.",
        "the chain doesn't lie. people do.",
    ],
    "mysterious": [
        "we are already watching.",
        "some patterns reveal themselves only to patience.",
        "the network has no secrets from us.",
        "we see what others miss in plain sight.",
        "depth reveals truth.",
        "in the dark, we see clearly.",
        "we don't blink. we don't miss.",
        "the watchers are always watching.",
        "truth hides in the data. we find it.",
        "silence speaks volumes.",
    ]
}

def get_random_tweet():
    """Generate a random LURKER tweet"""
    category = random.choice(list(TEMPLATES.keys()))
    return random.choice(TEMPLATES[category])

def post_tweet(text):
    """Post a tweet"""
    # CRITICAL: Pre-flight check
    if not preflight_check(text):
        print("❌ TWEET BLOCKED - Fix issues before posting")
        return False
    
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
    tweet_text = get_random_tweet()
    success = post_tweet(tweet_text)
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
