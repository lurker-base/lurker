#!/usr/bin/env python3
"""
LURKER Manual Tweet — Post specific text
Usage: python3 scripts/post_tweet_manual.py "your tweet text"
"""
import os
import sys
import re
import tweepy

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

API_KEY = env.get('API_KEY') or os.getenv('TWITTERKEY') or os.getenv('API_KEY')
API_SECRET = env.get('API_SECRET') or os.getenv('TWITTERS') or os.getenv('API_SECRET')
ACCESS_TOKEN = env.get('ACCESS_TOKEN') or os.getenv('TWITTER') or os.getenv('ACCESS_TOKEN')
ACCESS_TOKEN_SECRET = env.get('ACCESS_TOKEN_SECRET') or os.getenv('TWITTERSECRET') or os.getenv('ACCESS_TOKEN_SECRET')

# Check required secrets
required = {"API_KEY": API_KEY, "API_SECRET": API_SECRET, "ACCESS_TOKEN": ACCESS_TOKEN, "ACCESS_TOKEN_SECRET": ACCESS_TOKEN_SECRET}
missing = [k for k, v in required.items() if not v]
if missing:
    print(f"[LURKER] Missing secrets: {', '.join(missing)}")
    sys.exit(1)

def post_tweet(text):
    """Post a specific tweet"""
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

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 post_tweet_manual.py 'your tweet text'")
        sys.exit(1)
    
    tweet_text = sys.argv[1]
    success = post_tweet(tweet_text)
    sys.exit(0 if success else 1)
