#!/usr/bin/env python3
"""
LURKER Manual Tweet — Post specific text
Usage: python3 scripts/post_tweet_manual.py "your tweet text"
"""
import os
import sys
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

API_KEY = env.get('API_KEY') or os.getenv('TWITTERKEY') or os.getenv('API_KEY')
API_SECRET = env.get('API_SECRET') or os.getenv('TWITTERS') or os.getenv('API_SECRET')
ACCESS_TOKEN = env.get('ACCESS_TOKEN') or os.getenv('TWITTER') or os.getenv('ACCESS_TOKEN')
ACCESS_TOKEN_SECRET = env.get('ACCESS_TOKEN_SECRET') or os.getenv('TWITTERSECRET') or os.getenv('ACCESS_TOKEN_SECRET')

# Check required secrets
required = ["API_KEY", "API_SECRET", "ACCESS_TOKEN", "ACCESS_TOKEN_SECRET"]
missing = [k for k in required if not locals()[k]]
if missing:
    print(f"[LURKER] Missing secrets: {', '.join(missing)}")
    sys.exit(1)

def post_tweet(text):
    """Post a specific tweet"""
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
