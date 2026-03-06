# INTÉGRATION TELEGRAM NOTIFIER - Guide

Ce guide explique comment intégrer `telegram_notifier.py` dans les 3 fichiers du projet LURKER.

## Structure des alertes

| Type | Déclencheur | Fichier source |
|------|-------------|----------------|
| 🆕 New PREMIUM | Nouveau token avec score ≥ 40 | scanner_cio_ultra.py |
| 🚀 Pump | +20% en 1h | premium_tracker.py |
| 📉 Dump | -15% en 1h | premium_tracker.py |
| ❌ Removed | Token premium sort du top | lifecycle_core.py |

---

## 1. Intégration dans `scanner_cio_ultra.py`

### Ajout 1: Import en haut du fichier
```python
# Après les imports existants
import sys
import time
import requests
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

# AJOUTER CETTE LIGNE:
try:
    import telegram_notifier
    TELEGRAM_NOTIFIER_AVAILABLE = True
except ImportError:
    TELEGRAM_NOTIFIER_AVAILABLE = False
    print("[SCANNER] Telegram notifier not available")
```

### Ajout 2: Dans la fonction `scan()` - après le tri des candidates

Cherchez cette section:
```python
# Sort by score (freshness prioritized)
candidates.sort(key=lambda x: (x["scores"]["cio_score"], -x["timestamps"]["age_minutes"]), reverse=True)

# Keep top 50 (more than before)
candidates = candidates[:50]
```

Ajoutez APRÈS:
```python
    # Send Telegram alerts for new PREMIUM tokens (score >= 40)
    if TELEGRAM_NOTIFIER_AVAILABLE:
        for c in candidates:
            score = c.get("scores", {}).get("cio_score", 0)
            if score >= 40 and c.get("source") in ["boosts", "community", "ads"]:
                # This is a "new" premium token from high-activity sources
                telegram_notifier.notify_new_premium({
                    "symbol": c["token"]["symbol"],
                    "address": c["token"]["address"],
                    "price": c["metrics"]["price_usd"],
                    "liquidity": c["metrics"]["liq_usd"],
                    "volume": c["metrics"]["vol_1h_usd"],
                    "score": score,
                    "metrics": c["metrics"]
                })
```

---

## 2. Intégration dans `premium_tracker.py`

### Ajout 1: Import en haut du fichier
```python
# Après les imports existants
import json
import time
import requests
from datetime import datetime, timezone
from pathlib import Path
import os

# AJOUTER CETTE LIGNE:
try:
    import telegram_notifier
    TELEGRAM_NOTIFIER_AVAILABLE = True
except ImportError:
    TELEGRAM_NOTIFIER_AVAILABLE = False
    print("[PREMIUM] Telegram notifier not available")
```

### Ajout 2: Dans `generate_premium_alerts()` - envoyer les notifications Telegram

Cherchez la fonction `generate_premium_alerts()` et ajoutez à la fin (après le logging fichier):

```python
def generate_premium_alerts(pumps, dumps, state):
    """Generate premium alert files"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    if pumps:
        pump_file = SIGNALS_DIR / f"PREMIUM_PUMP_{timestamp}.json"
        with open(pump_file, 'w') as f:
            json.dump({
                "schema": "lurker_premium_alert",
                "type": "PUMP",
                "count": len(pumps),
                "alerts": pumps,
                "generated_at": iso()
            }, f, indent=2)
        print(f"  ✅ Saved premium pump alert: {pump_file}")
        state["pump_alerts"].append(str(pump_file))
        
        # AJOUTER: Envoyer notifications Telegram pour chaque pump
        if TELEGRAM_NOTIFIER_AVAILABLE:
            for pump in pumps:
                telegram_notifier.notify_pump({
                    "symbol": pump.get("token"),
                    "address": pump.get("address"),
                    "price": pump.get("price"),
                    "liquidity": pump.get("liquidity"),
                    "volume_24h": pump.get("volume_24h"),
                    "score": 70,  # Default score for pumps
                    "change_pct": pump.get("change_pct")
                })
    
    if dumps:
        dump_file = SIGNALS_DIR / f"PREMIUM_DUMP_{timestamp}.json"
        with open(dump_file, 'w') as f:
            json.dump({
                "schema": "lurker_premium_alert",
                "type": "DUMP",
                "count": len(dumps),
                "alerts": dumps,
                "generated_at": iso()
            }, f, indent=2)
        print(f"  ✅ Saved premium dump alert: {dump_file}")
        state["dump_alerts"].append(str(dump_file))
        
        # AJOUTER: Envoyer notifications Telegram pour chaque dump
        if TELEGRAM_NOTIFIER_AVAILABLE:
            for dump in dumps:
                telegram_notifier.notify_dump({
                    "symbol": dump.get("token"),
                    "address": dump.get("address"),
                    "price": dump.get("price"),
                    "liquidity": dump.get("liquidity"),
                    "volume_24h": dump.get("volume_24h"),
                    "score": 30,  # Lower score for dumps
                    "change_pct": dump.get("change_pct")
                })
    
    save_tracker_state(state)
```

---

## 3. Intégration dans `lifecycle_core.py`

### Ajout 1: Import en haut du fichier
```python
# Après les imports existants
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

# AJOUTER CETTE LIGNE:
try:
    import telegram_notifier
    TELEGRAM_NOTIFIER_AVAILABLE = True
except ImportError:
    TELEGRAM_NOTIFIER_AVAILABLE = False
    print("[LIFECYCLE] Telegram notifier not available")
```

### Ajout 2: Dans `process_token()` - détecter quand un token premium sort du top

Cherchez la fonction `determine_category()` et ajoutez une détection de changement de catégorie:

Dans `process_token()`, après la détermination de la nouvelle catégorie:
```python
def process_token(addr, token):
    """Traite un token : maj historique, perf, catégorie, risque"""
    # Update price history
    update_price_history(token)
    
    # Calculate performance
    token["performance"] = calculate_performance(token)
    
    # Determine category
    old_category = token.get("category", "CIO")
    new_category = determine_category(token)
    
    if old_category != new_category:
        print(f"  → {token['symbol']}: {old_category} → {new_category}")
        # Nettoyer les badges quand la catégorie change
        clean_badges_for_category(token, new_category)
        
        # AJOUTER:Notifier si un token PREMIUM sort du top
        # (Premium categories: WATCHING, TRENDING, ACTIVE, VERIFIED)
        premium_categories = ["WATCHING", "TRENDING", "ACTIVE", "VERIFIED"]
        if old_category in premium_categories and new_category in ["RUGGED", "ARCHIVED", "INACTIVE"]:
            if TELEGRAM_NOTIFIER_AVAILABLE:
                performance = token.get("performance", {})
                telegram_notifier.notify_premium_removed({
                    "symbol": token.get("symbol"),
                    "address": addr,
                    "last_price": token.get("metrics", {}).get("price_usd"),
                    "change_pct": performance.get("current_gain", 0)
                })
    
    # Also clean badges if token is dumping (even if category didn't change)
    perf = token.get("performance", {})
    if perf.get("status") == "dumping" or perf.get("current_gain", 0) <= -20:
        clean_badges_for_category(token, "DUMPING")
    
    token["category"] = new_category
    
    # Assess risk
    token["risk"] = assess_risk(token)
    
    return token
```

---

## Variables d'environnement requises

Ajoutez ces variables dans votre `.env`:

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
LURKER_ALERTS_CHAT_ID=your_chat_id_here
```

Pour obtenir le chat ID:
1. Créez un channel/groupe
2. Ajoutez votre bot au groupe
3. Faites `/start` dans le groupe
4. Appelez `https://api.telegram.org/bot<TOKEN>/getUpdates` pour obtenir le chat_id

---

## Tester l'intégration

```bash
cd /data/.openclaw/workspace/lurker-project/scripts
python telegram_notifier.py
```

Cela enverra des messages de test pour chaque type d'alerte.
