#!/usr/bin/env python3
"""
LURKER Chat ID Recovery - Get channel ID from successful messages
"""
import os
import json
import requests

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8455628045:AAGb6Q2PdkPHpobhTAcmMK3SFqJm1QlM6bY")

def get_chat_id_from_updates():
    """Get chat ID from recent successful messages"""
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?limit=100"
        r = requests.get(url, timeout=30)
        data = r.json()
        
        if not data.get('ok'):
            return None
        
        # Look for channel posts or successful messages
        for update in data.get('result', []):
            # Check for channel_post
            if 'channel_post' in update:
                chat = update['channel_post']['chat']
                chat_id = chat['id']
                title = chat.get('title', '')
                print(f"Found channel: {title} (ID: {chat_id})")
                if 'LURKER' in title or 'Alpha' in title:
                    return str(chat_id)
            
            # Check for my_chat_member (bot added to group/channel)
            if 'my_chat_member' in update:
                chat = update['my_chat_member']['chat']
                chat_id = chat['id']
                title = chat.get('title', '')
                print(f"Found chat: {title} (ID: {chat_id})")
                if 'LURKER' in title or 'Alpha' in title:
                    return str(chat_id)
        
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    chat_id = get_chat_id_from_updates()
    if chat_id:
        print(f"\n✅ Chat ID found: {chat_id}")
        # Save to file
        with open('/tmp/recovered_chat_id.txt', 'w') as f:
            f.write(chat_id)
    else:
        print("\n❌ Chat ID not found in recent updates")
        print("Send a message in the channel to make it appear in updates")
