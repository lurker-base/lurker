#!/usr/bin/env python3
"""
LURKER Hourly Voice - Enigmatic tweets every hour
Mysterious, minimal, masculine voice
"""

import sys
import random
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

def post_hourly():
    import random as rnd
    tweet = random.choice(HOURLY_TEMPLATES)
    # Add block number if needed
    if '{block}' in tweet:
        tweet = tweet.format(block=rnd.randint(42384127, 42385127))
    
    try:
        result = post_tweet(tweet)
        print(f"✅ Hourly tweet posted")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    post_hourly()
