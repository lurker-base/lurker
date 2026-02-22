#!/usr/bin/env python3
"""
LURKER Payment System — Crypto subscriptions with Telegram integration
Handles payments, validates subscriptions, manages Telegram access
"""
import json
import os
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Dict, List

# Config
PAYMENTS_FILE = Path("state/payments.json")
SUBSCRIPTIONS_FILE = Path("state/subscriptions.json")
WALLET_CONFIG = Path("config/wallet.json")

# Payment settings
SUBSCRIPTION_TIERS = {
    "pro_signals": {
        "name": "Pro Signals",
        "price_usd": 19,
        "duration_days": 30,
        "features": ["real_time_signals", "telegram_alerts", "early_access"]
    },
    "api_basic": {
        "name": "API Basic", 
        "price_usd": 29,
        "duration_days": 30,
        "features": ["api_access", "1000_requests_day", "basic_support"]
    },
    "api_pro": {
        "name": "API Pro",
        "price_usd": 79,
        "duration_days": 30,
        "features": ["api_access", "unlimited_requests", "priority_support", "webhooks"]
    }
}

# Supported chains
SUPPORTED_CHAINS = {
    "base": {
        "name": "Base",
        "currency": "USDC",
        "tokens": ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],  # USDC on Base
        "confirmations": 10
    },
    "ethereum": {
        "name": "Ethereum",
        "currency": "USDT",
        "tokens": ["0xdAC17F958D2ee523a2206206994597C13D831ec7"],  # USDT
        "confirmations": 12
    }
}

def load_json(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}

def save_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def generate_payment_id() -> str:
    """Generate unique payment ID"""
    timestamp = datetime.now(timezone.utc).isoformat()
    random_component = os.urandom(16).hex()
    return hashlib.sha256(f"{timestamp}{random_component}".encode()).hexdigest()[:16]

def create_payment(tier_id: str, telegram_username: str, chain: str = "base") -> dict:
    """Create a new payment request"""
    tier = SUBSCRIPTION_TIERS.get(tier_id)
    if not tier:
        raise ValueError(f"Unknown tier: {tier_id}")
    
    if chain not in SUPPORTED_CHAINS:
        raise ValueError(f"Unsupported chain: {chain}")
    
    payment_id = generate_payment_id()
    
    # Load wallet config
    wallets = load_json(WALLET_CONFIG)
    wallet_address = wallets.get(chain, {}).get("address")
    if not wallet_address:
        raise ValueError(f"No wallet configured for {chain}")
    
    payment = {
        "id": payment_id,
        "tier_id": tier_id,
        "tier_name": tier["name"],
        "price_usd": tier["price_usd"],
        "telegram_username": telegram_username.lower().replace("@", ""),
        "chain": chain,
        "currency": SUPPORTED_CHAINS[chain]["currency"],
        "wallet_address": wallet_address,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        "tx_hash": None,
        "confirmed_at": None,
        "notes": []
    }
    
    # Save payment
    payments = load_json(PAYMENTS_FILE)
    payments[payment_id] = payment
    save_json(PAYMENTS_FILE, payments)
    
    return payment

def verify_payment(payment_id: str, tx_hash: str) -> dict:
    """Mark payment as paid (to be called by webhook or manual check)"""
    payments = load_json(PAYMENTS_FILE)
    
    if payment_id not in payments:
        return {"error": "Payment not found"}
    
    payment = payments[payment_id]
    
    if payment["status"] != "pending":
        return {"error": f"Payment already {payment['status']}"}
    
    # Update payment
    payment["status"] = "paid"
    payment["tx_hash"] = tx_hash
    payment["paid_at"] = datetime.now(timezone.utc).isoformat()
    
    # Create subscription
    tier = SUBSCRIPTION_TIERS[payment["tier_id"]]
    subscription = {
        "id": f"sub_{payment_id}",
        "payment_id": payment_id,
        "telegram_username": payment["telegram_username"],
        "tier_id": payment["tier_id"],
        "tier_name": tier["name"],
        "features": tier["features"],
        "status": "active",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=tier["duration_days"])).isoformat(),
        "chain": payment["chain"],
        "tx_hash": tx_hash,
        "auto_renew": False,
        "renewal_payment_id": None
    }
    
    # Save subscription
    subscriptions = load_json(SUBSCRIPTIONS_FILE)
    subscriptions[subscription["id"]] = subscription
    save_json(SUBSCRIPTIONS_FILE, subscriptions)
    save_json(PAYMENTS_FILE, payments)
    
    return {
        "success": True,
        "payment": payment,
        "subscription": subscription
    }

def check_subscription(telegram_username: str) -> Optional[dict]:
    """Check if user has active subscription"""
    subscriptions = load_json(SUBSCRIPTIONS_FILE)
    username = telegram_username.lower().replace("@", "")
    
    for sub_id, sub in subscriptions.items():
        if sub["telegram_username"] == username:
            if sub["status"] == "active":
                # Check expiration
                expires = datetime.fromisoformat(sub["expires_at"])
                if expires > datetime.now(timezone.utc):
                    return sub
                else:
                    # Auto-expire
                    sub["status"] = "expired"
                    save_json(SUBSCRIPTIONS_FILE, subscriptions)
    
    return None

def expire_subscriptions() -> List[dict]:
    """Check and expire all overdue subscriptions"""
    subscriptions = load_json(SUBSCRIPTIONS_FILE)
    expired = []
    
    now = datetime.now(timezone.utc)
    
    for sub_id, sub in subscriptions.items():
        if sub["status"] == "active":
            expires = datetime.fromisoformat(sub["expires_at"])
            if expires <= now:
                sub["status"] = "expired"
                expired.append(sub)
    
    if expired:
        save_json(SUBSCRIPTIONS_FILE, subscriptions)
    
    return expired

def format_payment_message(payment: dict) -> str:
    """Format payment instructions for Telegram/email"""
    return f"""<b>🔔 LURKER Payment Request</b>

<b>Tier:</b> {payment['tier_name']}
<b>Price:</b> ${payment['price_usd']} ({payment['currency']})
<b>Payment ID:</b> <code>{payment['id']}</code>

<b>Send {payment['currency']} to:</b>
<code>{payment['wallet_address']}</code>

<b>Chain:</b> {SUPPORTED_CHAINS[payment['chain']]['name']}

⚠️ <b>Important:</b>
• Send exact amount (or more)
• Include your Payment ID in memo if possible
• Payment expires in 24 hours

After sending, reply with:
<code>/paid {payment['id']} TX_HASH</code>

Example:
<code>/paid {payment['id']} 0xabc123...</code>"""

def format_subscription_status(sub: dict) -> str:
    """Format subscription status for user"""
    expires = datetime.fromisoformat(sub['expires_at'])
    days_left = (expires - datetime.now(timezone.utc)).days
    
    features_text = "\n".join([f"  • {f.replace('_', ' ').title()}" for f in sub['features']])
    
    return f"""<b>✅ LURKER Subscription Active</b>

<b>Tier:</b> {sub['tier_name']}
<b>Status:</b> {sub['status'].upper()}
<b>Expires:</b> {expires.strftime('%Y-%m-%d')} ({days_left} days left)

<b>Features:</b>
{features_text}

To renew, use <code>/subscribe</code>"""

# CLI interface
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python payment_system.py <command> [args]")
        print("Commands: create, verify, check, expire")
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "create":
        if len(sys.argv) < 4:
            print("Usage: python payment_system.py create <tier> <telegram_username> [chain]")
            print(f"Tiers: {', '.join(SUBSCRIPTION_TIERS.keys())}")
            sys.exit(1)
        
        tier = sys.argv[2]
        username = sys.argv[3]
        chain = sys.argv[4] if len(sys.argv) > 4 else "base"
        
        try:
            payment = create_payment(tier, username, chain)
            print(f"Payment created: {payment['id']}")
            print(f"Amount: ${payment['price_usd']} {payment['currency']}")
            print(f"Wallet: {payment['wallet_address']}")
            print(f"\nInstructions:\n{format_payment_message(payment)}")
        except ValueError as e:
            print(f"Error: {e}")
            sys.exit(1)
    
    elif cmd == "verify":
        if len(sys.argv) < 4:
            print("Usage: python payment_system.py verify <payment_id> <tx_hash>")
            sys.exit(1)
        
        result = verify_payment(sys.argv[2], sys.argv[3])
        if "error" in result:
            print(f"Error: {result['error']}")
            sys.exit(1)
        print(f"Payment verified! Subscription active until {result['subscription']['expires_at']}")
    
    elif cmd == "check":
        if len(sys.argv) < 3:
            print("Usage: python payment_system.py check <telegram_username>")
            sys.exit(1)
        
        sub = check_subscription(sys.argv[2])
        if sub:
            print(format_subscription_status(sub))
        else:
            print("No active subscription found.")
    
    elif cmd == "expire":
        expired = expire_subscriptions()
        if expired:
            print(f"Expired {len(expired)} subscriptions:")
            for sub in expired:
                print(f"  - @{sub['telegram_username']} ({sub['tier_name']})")
        else:
            print("No subscriptions to expire.")
    
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
