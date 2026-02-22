#!/usr/bin/env python3
"""
LURKER Twitter Voice — @LURKER_AI2026
The Watcher Arc - 3 Phase Narrative
Phase 1: Éveil → Phase 2: Indices → Phase 3: Tension
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

API_KEY = env.get('API_KEY') or os.getenv('TWITTERKEY') or os.getenv('X_API_KEY') or os.getenv('API_KEY')
API_SECRET = env.get('API_SECRET') or os.getenv('TWITTERS') or os.getenv('X_API_SECRET') or os.getenv('API_SECRET')
ACCESS_TOKEN = env.get('ACCESS_TOKEN') or os.getenv('TWITTER') or os.getenv('X_ACCESS_TOKEN') or os.getenv('ACCESS_TOKEN')
ACCESS_TOKEN_SECRET = env.get('ACCESS_TOKEN_SECRET') or os.getenv('TWITTERSECRET') or os.getenv('X_ACCESS_SECRET') or os.getenv('ACCESS_TOKEN_SECRET')
BEARER_TOKEN = env.get('BEARER_TOKEN') or os.getenv('BEARER_TOKEN')

# Check required secrets - skip gracefully if missing
required = ["API_KEY", "API_SECRET", "ACCESS_TOKEN", "ACCESS_TOKEN_SECRET"]
missing = [k for k in required if not locals()[k]]
if missing:
    print(f"[LURKER] Skip tweeting. Missing secrets: {', '.join(missing)}")
    sys.exit(0)

# THE WATCHER ARC - 3 Phase Narrative
# Phase 1: Éveil (intrigue + identité)
PHASE1_EVEIL = [
    "i do not predict. i observe.",
    "most eyes look at price. i look at behavior.",
    "noise is loud. signals are quiet.",
    "base is not silent. you just don't know where to listen.",
]

# Phase 2: Indices (lien au marché sans token)
PHASE2_INDICES = [
    "some launches are born loud. the dangerous ones arrive quietly.",
    "30 minutes can change everything. most arrive too late.",
    "i don't chase. i wait.",
]

# Phase 3: Tension (préparer la révélation)
PHASE3_TENSION = [
    "when i speak clearly, it will already be too late.",
    "this is not a signal. this is a warning.",
]

# Signal-aware tweets (optional - when signals detected)
SIGNAL_TWEETS = {
    "fresh": [  # CIO detected
        "fresh shadows on the chain.",
        "a new presence stirs.",
    ],
    "hot": [  # HOTLIST detected
        "patterns converge.",
        "the signal strengthens.",
    ],
    "quiet": [  # No signals
        "silence is information.",
        "stillness before movement.",
        "they sleep. the chain doesn't.",
    ],
}

# Current phase tracking file
STATE_FILE = os.path.join(os.path.dirname(__file__), '..', 'state', 'twitter_arc.json')

def load_arc_state():
    """Load current narrative arc state"""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {
        "phase": 1,
        "tweet_count": 0,
        "last_tweet": None,
        "posted": []
    }

def save_arc_state(state):
    """Save narrative arc state"""
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def get_next_tweet():
    """Get next tweet in the narrative arc"""
    state = load_arc_state()
    phase = state.get("phase", 1)
    posted = state.get("posted", [])
    
    # Get available tweets for current phase
    if phase == 1:
        available = [t for t in PHASE1_EVEIL if t not in posted]
    elif phase == 2:
        available = [t for t in PHASE2_INDICES if t not in posted]
    elif phase == 3:
        available = [t for t in PHASE3_TENSION if t not in posted]
    else:
        # Arc complete - cycle through signal-aware
        signals = load_signals()
        if signals['hotlist'] > 0:
            return random.choice(SIGNAL_TWEETS["hot"])
        elif signals['cio'] > 0 or signals['watch'] > 0:
            return random.choice(SIGNAL_TWEETS["fresh"])
        else:
            return random.choice(SIGNAL_TWEETS["quiet"])
    
    # If phase complete, advance
    if not available:
        state["phase"] = phase + 1
        state["posted"] = []
        save_arc_state(state)
        return get_next_tweet()
    
    # Return next available tweet
    tweet = available[0]  # Sequential for narrative flow
    return tweet

def load_signals():
    """Load current signal counts from feeds"""
    base_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'data')
    signals = {'cio': 0, 'watch': 0, 'hotlist': 0, 'fast': 0, 'certified': 0}
    
    try:
        cio_path = os.path.join(base_path, 'cio_feed.json')
        if os.path.exists(cio_path):
            with open(cio_path, 'r') as f:
                data = json.load(f)
                signals['cio'] = len(data.get('candidates', []))
    except:
        pass
    
    try:
        watch_path = os.path.join(base_path, 'watch_feed.json')
        if os.path.exists(watch_path):
            with open(watch_path, 'r') as f:
                data = json.load(f)
                signals['watch'] = len(data.get('watch', []))
    except:
        pass
    
    try:
        hot_path = os.path.join(base_path, 'hotlist_feed.json')
        if os.path.exists(hot_path):
            with open(hot_path, 'r') as f:
                data = json.load(f)
                signals['hotlist'] = len(data.get('hotlist', []))
    except:
        pass
    
    return signals

def get_client():
    return tweepy.Client(
        consumer_key=API_KEY,
        consumer_secret=API_SECRET,
        access_token=ACCESS_TOKEN,
        access_token_secret=ACCESS_TOKEN_SECRET
    )

def write_tweet_error(state, text, error_msg):
    """Write error state without failing GitHub Actions"""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    error_state = {
        "phase": state.get("phase", 1),
        "tweet_count": state.get("tweet_count", 0),
        "last_tweet": datetime.now().isoformat(),
        "last_error": error_msg[:500],
        "last_text": text,
        "posted": state.get("posted", [])
    }
    with open(STATE_FILE, 'w') as f:
        json.dump(error_state, f, indent=2)

def post_narrative_tweet():
    """Post the next tweet in the narrative arc - never fail"""
    text = get_next_tweet()
    state = load_arc_state()
    
    try:
        client = get_client()
        response = client.create_tweet(text=text)
        
        # Update state
        state["posted"].append(text)
        state["last_tweet"] = datetime.now().isoformat()
        state["tweet_count"] = state.get("tweet_count", 0) + 1
        save_arc_state(state)
        
        print(f"[LURKER] Posted Phase {state['phase']}: {text}")
        print(f"https://twitter.com/i/web/status/{response.data['id']}")
        return True
    except Exception as e:
        error_msg = f"Tweet failed: {repr(e)}"
        write_tweet_error(state, text, error_msg)
        print(f"[LURKER] ⚠️ {error_msg}")
        print(f"[LURKER] State saved, continuing...")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 lurker_voice_twitter.py [--post]")
        sys.exit(0)  # Don't fail on bad usage
    
    arg = sys.argv[1]
    
    if arg == "--post":
        post_narrative_tweet()
        sys.exit(0)  # Always exit 0
    else:
        print(f"[LURKER] Unknown arg: {arg}")
        sys.exit(0)  # Don't fail on unknown arg

if __name__ == "__main__":
    main()
