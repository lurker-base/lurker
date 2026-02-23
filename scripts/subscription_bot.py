#!/usr/bin/env python3
"""
LURKER Subscription Bot — Telegram bot for managing subscriptions
Handles: /subscribe, /paid, /status, /renew, auto-expire
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))
from payment_system import (
    create_payment, verify_payment, check_subscription,
    expire_subscriptions, SUBSCRIPTION_TIERS, format_payment_message,
    format_subscription_status
)

# Telegram Bot Token from env
BOT_TOKEN = os.getenv("LURKER_SUB_BOT_TOKEN")
if not BOT_TOKEN:
    print("[ERROR] LURKER_SUB_BOT_TOKEN not set")
    sys.exit(1)

# Channel/group IDs
TELEGRAM_GROUP_ID = os.getenv("LURKER_PAID_GROUP_ID")  # Private group for paid members

def send_telegram_message(chat_id: str, text: str, parse_mode: str = "HTML"):
    """Send message via Telegram Bot API"""
    import urllib.request
    import urllib.parse
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        'chat_id': chat_id,
        'text': text,
        'parse_mode': parse_mode,
        'disable_web_page_preview': 'true'
    }).encode()
    
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            return result.get('ok', False)
    except Exception as e:
        print(f"[ERROR] Failed to send message: {e}")
        return False

def create_invite_link():
    """Create invite link for private group (bot must be admin)"""
    import urllib.request
    import urllib.parse
    
    if not BOT_TOKEN or not TELEGRAM_GROUP_ID:
        return None
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/createChatInviteLink"
    data = urllib.parse.urlencode({
        'chat_id': TELEGRAM_GROUP_ID,
        'member_limit': 1,  # Single-use link
        'expires_at': int((datetime.now(timezone.utc) + timedelta(hours=24)).timestamp())
    }).encode()
    
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            if result.get('ok'):
                return result['result']['invite_link']
    except Exception as e:
        print(f"[ERROR] Failed to create invite link: {e}")
    
    return None

def invite_to_paid_group(telegram_username: str, user_chat_id: str = None):
    """Send invite link to paid user"""
    invite_link = create_invite_link()
    
    if invite_link and user_chat_id:
        # Send invite link directly to user
        welcome_msg = f"""🎉 <b>Welcome to LURKER Pro!</b>

Your payment is confirmed. Join the private signals group:

👉 <a href='{invite_link}'>Click here to join</a>

⚠️ This link expires in 24 hours and can only be used once.

See you inside. 👁️"""
        
        send_telegram_message(user_chat_id, welcome_msg)
        return True
    else:
        # Fallback: notify admin
        admin_message = f"""🔔 <b>New Paid Member</b>

User: @{telegram_username}
Action: Send invite link manually
Time: {datetime.now(timezone.utc).isoformat()}

Use /invite @{telegram_username}"""
        
        admin_chat = os.getenv("LURKER_ADMIN_CHAT_ID")
        if admin_chat:
            send_telegram_message(admin_chat, admin_message)
    
    return False

def remove_from_paid_group(telegram_username: str):
    """Remove expired member from paid group"""
    admin_message = f"""⚠️ <b>Expired Member</b>

User: @{telegram_username}
Action: Remove from paid group
Time: {datetime.now(timezone.utc).isoformat()}

Subscription expired, please remove from group."""
    
    admin_chat = os.getenv("LURKER_ADMIN_CHAT_ID")
    if admin_chat:
        send_telegram_message(admin_chat, admin_message)
    
    return True

def handle_command(command: str, args: list, username: str, chat_id: str) -> str:
    """Process bot commands"""
    
    if command == "start":
        return """👁️ <b>LURKER Subscription Bot</b>

Commands:
/subscribe [tier] - Create payment for subscription
/status - Check your subscription status
/paid [payment_id] [tx_hash] - Confirm payment
/tiers - Show available tiers
/help - Show this message

Tiers: pro_signals ($19/mo), api_basic ($29/mo), api_pro ($79/mo)"""
    
    elif command == "tiers":
        tiers_text = []
        for tier_id, tier in SUBSCRIPTION_TIERS.items():
            features = "\n".join([f"  • {f.replace('_', ' ').title()}" for f in tier['features']])
            tiers_text.append(f"<b>{tier['name']}</b> — ${tier['price_usd']}/month\n{features}\n")
        
        return "📋 <b>Available Tiers</b>\n\n" + "\n".join(tiers_text) + "\nUse /subscribe [tier_name] to start"
    
    elif command == "subscribe":
        if not args:
            return "❌ Usage: /subscribe [tier]\n\nAvailable tiers:\n" + "\n".join([f"  • {k}" for k in SUBSCRIPTION_TIERS.keys()])
        
        tier = args[0].lower()
        if tier not in SUBSCRIPTION_TIERS:
            return f"❌ Unknown tier: {tier}\n\nAvailable: {', '.join(SUBSCRIPTION_TIERS.keys())}"
        
        try:
            payment = create_payment(tier, username)
            return format_payment_message(payment)
        except Exception as e:
            return f"❌ Error creating payment: {e}"
    
    elif command == "paid":
        if len(args) < 2:
            return "❌ Usage: /paid [payment_id] [tx_hash]\n\nExample:\n/paid abc123 0xdef456..."
        
        payment_id = args[0]
        tx_hash = args[1]
        
        result = verify_payment(payment_id, tx_hash)
        
        if "error" in result:
            return f"❌ {result['error']}"
        
        # Send invite link directly to user
        invite_sent = invite_to_paid_group(username, chat_id)
        
        sub = result['subscription']
        
        if invite_sent:
            return f"""✅ <b>Payment Confirmed!</b>

Welcome to LURKER {sub['tier_name']}.

Your subscription is active until:
<b>{datetime.fromisoformat(sub['expires_at']).strftime('%Y-%m-%d')}</b>

🔑 Check your messages for the private group invite link!

Use /status anytime to check your subscription."""
        else:
            return f"""✅ <b>Payment Confirmed!</b>

Welcome to LURKER {sub['tier_name']}.

Your subscription is active until:
<b>{datetime.fromisoformat(sub['expires_at']).strftime('%Y-%m-%d')}</b>

⏳ You'll receive your invite link shortly (manual verification in progress).

Use /status anytime to check your subscription."""
    
    elif command == "status":
        sub = check_subscription(username)
        
        if sub:
            return format_subscription_status(sub)
        else:
            return """❌ <b>No Active Subscription</b>

You don't have an active subscription.

Use /tiers to see available options
Use /subscribe [tier] to purchase"""
    
    elif command == "expire_check":
        # Admin only - check and expire overdue subscriptions
        expired = expire_subscriptions()
        
        if expired:
            for sub in expired:
                remove_from_paid_group(sub['telegram_username'])
            
            return f"⚠️ Expired {len(expired)} subscriptions. Users notified for removal."
        else:
            return "✅ No subscriptions to expire."
    
    elif command == "help":
        return handle_command("start", [], username, chat_id)
    
    else:
        return f"❌ Unknown command: {command}\n\nUse /help for available commands."

def main():
    """CLI for testing commands"""
    import argparse
    
    parser = argparse.ArgumentParser(description='LURKER Subscription Bot')
    parser.add_argument('command', help='Command to test')
    parser.add_argument('--user', default='test_user', help='Telegram username')
    parser.add_argument('--args', nargs='*', default=[], help='Command arguments')
    parser.add_argument('--chat', default='123456', help='Chat ID')
    
    args = parser.parse_args()
    
    result = handle_command(args.command, args.args, args.user, args.chat)
    print(result)

if __name__ == "__main__":
    main()
