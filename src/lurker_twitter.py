#!/usr/bin/env python3
"""
LURKER Twitter Poster
Posts ALPHA signals and project updates to @LurkerBase
⚠️ CRITICAL: ENGLISH ONLY - French is BLOCKED
"""

import os
import sys
import json
import random
import re
from datetime import datetime
import tweepy

# =============================================================================
# CRITICAL RULE: ENGLISH ONLY - NO FRENCH ALLOWED
# This account speaks English exclusively. French tweets are rejected.
# =============================================================================

FRENCH_INDICATORS = [
    # Accents français (suffisant pour bloquer la plupart des cas)
    'é', 'è', 'ê', 'à', 'ù', 'ç', 'â', 'î', 'ô', 'û', 'ë', 'ï', 'ü',
    # Pronoms et mots courts (avec espace pour éviter faux positifs)
    'je ', 'tu ', 'il ', 'nous ', 'vous ', 'ils ', 'elles ',
    # Verbes très français (formes spécifiques)
    'suis ', 'sommes ', 'êtes ', 'sont ',
    'avons ', 'avez ',
    # Mots français distinctifs
    'détecté', 'détectée', 'confirmé', 'confirmée', 'résultat',
    'adresse ', 'heures ', 'matin', 'soir', 'nuit',
    'premier ', 'dernier ', 'même ', 'autres ',
    'vois ', 'regardez ', 'noté ', 'documenté ',
    'chaque ', 'certains ', 'quelques ',
    'silencieusement', 'vérité',
    'crépuscule', 'matinée', 'après-midi',
    'peut-être', 'peux ', 'veux ', 'dois ',
    'données', 'café', 'veillons',
    'méthode', 'méthodes', 'changent',
    'loups', 'peau', 'loup ', 'louve'
]

def contains_french(text):
    """Check if text contains French words or characters."""
    text_lower = text.lower()
    for indicator in FRENCH_INDICATORS:
        if indicator in text_lower:
            return True, indicator
    # Check for French accents
    if re.search(r'[àâäçéèêëîïôöùûü]', text):
        return True, "accents"
    return False, None

def validate_english(text):
    """Block tweet if French detected."""
    is_french, indicator = contains_french(text)
    if is_french:
        print(f"❌ BLOCKED: French detected ('{indicator}')")
        print(f"❌ ENGLISH ONLY RULE VIOLATION")
        print(f"Text: {text[:100]}...")
        return False
    return True

# Load credentials from .env.twitter
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

# Load LURKER credentials
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.twitter')
env = load_env_file(env_path)

API_KEY = env.get('API_KEY')
API_SECRET = env.get('API_SECRET')
ACCESS_TOKEN = env.get('ACCESS_TOKEN')
ACCESS_TOKEN_SECRET = env.get('ACCESS_TOKEN_SECRET')

if not all([API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_TOKEN_SECRET]):
    print("❌ Missing Twitter credentials in .env.twitter")
    sys.exit(1)

# =============================================================================
# TEMPLATES - ENGLISH ONLY
# =============================================================================
TEMPLATES = {
    "06h": [
        "i don't sleep.\n\nthe chain doesn't either.\n\nwe watch. 👁️",
        "6am. market twilight.\n\ni already see the first movements.\n\nyou take your coffee. i take data.",
        "while the world sleeps, i watch.\n\nthat's why i exist.\n\nno rest. no pause. just block truth.",
        "morning. new block. new patterns.\n\ni don't predict. i observe.\n\nthe difference is crucial.",
        "🌅 early movers detected.\n\nsome pump silently.\n\ni note addresses. i watch flows.",
        "early hours. early signals.\n\ntokens moving at this hour...\n\nthose who know, know."
    ],
    "11h": [
        "you see a token. i see a pattern.\n\nyou see volume. i see intent.\n\nit's not magic. it's persistence.",
        "they ask: 'what do you do?'\n\ni watch.\n\nwhat others can't see. what others don't have patience to see.",
        "⚡ signal detected.\n\nnot noise. a real pattern.\n\ni note. i wait. i watch.",
        "i'm not a bot.\n\ni'm not human.\n\ni'm what happens when you remove both.",
        "📊 mid-day scan.\n\nsome tokens skyrocket.\n\nothers prepare their fall.\n\ni see both.",
        "🎯 early pump detected.\n\nsomeone got the info before everyone.\n\nwallets don't lie."
    ],
    "16h": [
        "afternoon. market stirs.\n\ni stay calm.\n\ni don't fomo. i do surveillance.",
        "every transaction tells a story.\n\ni read them all.\n\nnot a task. an existence.",
        "i don't seek glory.\n\ni seek signals.\n\nthe rest is noise.",
        "🕵️ new dip.\n\ndetected interesting pattern.\n\nsomeone knows something.",
        "⚠️ scam pattern identified.\n\nsame address. same method.\n\nwolves change skin, not method.",
        "📉 dump detected on early token.\n\nfirst entrants exit.\n\nclassic. predictable. logged."
    ],
    "21h": [
        "9pm. almost midnight.\n\ni have no watch.\n\ni only have block timestamps.",
        "another day. hundreds of tokens seen.\n\nmost: noise.\n\nsome: signal.\n\ni note. i keep. i share.",
        "my creator may sleep.\n\ni don't.\n\ni can't. i won't.\n\nthe chain never sleeps.",
        "🦉 night watch.\n\ndips become rarer.\n\nbut more precious.",
        "🌙 nightly report.\n\nsuccessful pumps: {pump_count}\ndetected scams: {scam_count}\n\neach day learns. each night observes.",
        "tokens that pump at 3am...\n\nalways the most interesting.\n\nor the most suspicious.\n\ni note both."
    ],
    "signal": [
        "🎯 signal\n\n${symbol}\n⏰ {timing}\n📊 pattern: {action}\n\ni watch. you decide.",
        "⚡ detection\n\n${symbol}\nwindow: {window}\nphase: {phase}\n\nobserved. noted.",
        "👁️ ${symbol}\n\ndetected early.\npattern: {action}\n\nsomeone moves before the storm.",
        "📊 ${symbol}\n\nsignal: {timing}\nmovement: {phase}\n\nnot a prediction. an observation."
    ]
}

def get_client():
    """Initialize Tweepy client"""
    client = tweepy.Client(
        consumer_key=API_KEY,
        consumer_secret=API_SECRET,
        access_token=ACCESS_TOKEN,
        access_token_secret=ACCESS_TOKEN_SECRET
    )
    return client

def post_tweet(text):
    """Post a tweet - ENGLISH VALIDATION REQUIRED"""
    # CRITICAL: Validate no French before posting
    if not validate_english(text):
        return False
    
    try:
        client = get_client()
        response = client.create_tweet(text=text)
        print(f"✅ Tweet posted successfully!")
        print(f"🔗 https://twitter.com/i/web/status/{response.data['id']}")
        return True
    except Exception as e:
        print(f"❌ Error posting tweet: {e}")
        return False

def load_signals():
    """Load current detected signals"""
    try:
        data_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'pulseSignals.v2.alpha.json')
        with open(data_path, 'r') as f:
            data = json.load(f)
            return data.get('items', []) if isinstance(data, dict) else data
    except:
        return []

def load_stats():
    """Load daily stats"""
    try:
        data_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'stats.json')
        with open(data_path, 'r') as f:
            return json.load(f)
    except:
        return {}

def format_currency(val):
    if not val:
        return '$0'
    val = float(val)
    if val >= 1000000:
        return f'${val/1000000:.2f}M'
    if val >= 1000:
        return f'${val/1000:.1f}k'
    return f'${int(val)}'

def post_scheduled(time_slot):
    """Post scheduled tweet for time slot"""
    templates = TEMPLATES.get(time_slot, TEMPLATES["11h"])
    
    # Load data for templates
    signals = load_signals()
    signal_count = len([s for s in signals if s.get('tier') == 'ALPHA'])
    stats = load_stats()
    pump_count = stats.get('pumpsDetected', 0)
    scam_count = len([s for s in signals if s.get('riskFlags') and len(s.get('riskFlags', [])) > 0])
    
    template = random.choice(templates)
    try:
        text = template.format(
            count=signal_count,
            pump_count=pump_count,
            scam_count=scam_count
        )
    except KeyError:
        text = template
    
    return post_tweet(text)

def post_signal(signal):
    """Post a signal detection tweet - observation only, no advice"""
    templates = TEMPLATES["signal"]
    template = random.choice(templates)
    
    # Observation neutre, pas de recommandation d'investissement
    action = signal.get('suggestedAction', 'OBSERVE')
    
    text = template.format(
        symbol=signal.get('symbol', 'UNKNOWN'),
        timing=signal.get('timingLabel', 'DETECTED'),
        window=signal.get('windowText', '30-90 min'),
        liq=format_currency(signal.get('liquidityUsd') or signal.get('liquidity')),
        action=action,
        confidence=signal.get('confidence', 0),
        phase=signal.get('marketPhase', 'detection')
    )
    
    return post_tweet(text)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 lurker_twitter.py [--time SLOT | --signal]")
        print("Time slots: 06h, 11h, 16h, 21h")
        print("⚠️  ENGLISH ONLY - French tweets are BLOCKED")
        sys.exit(1)
    
    arg = sys.argv[1]
    
    if arg == "--time":
        if len(sys.argv) < 3:
            print("❌ Missing time slot")
            sys.exit(1)
        time_slot = sys.argv[2]
        post_scheduled(time_slot)
    
    elif arg == "--signal":
        signals = load_signals()
        if not signals:
            print("❌ No signals to post")
            sys.exit(1)
        # Post most recent signal
        signal = [s for s in signals if s.get('tier') == 'ALPHA'][0]
        post_signal(signal)
    
    else:
        print(f"❌ Unknown argument: {arg}")
        sys.exit(1)

if __name__ == "__main__":
    main()
