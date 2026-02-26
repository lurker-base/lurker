#!/usr/bin/env python3
"""Test LURKER alerts"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))

from signal_distributor import send_telegram_alert, log

test_signal = {
    "type": "PUMP",
    "token_symbol": "TEST",
    "token_name": "Test Token",
    "price": 0.001234,
    "score": 0.85,
    "reasons": ["Test alert LURKER", "Vérification du système"]
}

log("="*50)
log("🧪 TEST ALERTE LURKER")
log("="*50)

result = send_telegram_alert(test_signal)

if result:
    log("✅ Alert test envoyée avec succès")
else:
    log("❌ Échec de l'envoi de l'alert test")
