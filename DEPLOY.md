# LURKER Deployment Guide

## 1. Create Anonymous GitHub Account

- Use ProtonMail or Tutanota for email
- Username: `lurker-ai` or similar (check availability)
- No personal info in bio
- Avatar: use generated image from assets/

## 2. Setup Supabase

1. Create new project on supabase.com
2. Run SQL from `database/schema.sql`
3. Copy URL and anon key to secrets

## 3. Create Telegram Bot

1. Message @BotFather on Telegram
2. Create new bot, get token
3. Create channel/group for alerts
4. Add bot to channel, get chat ID

## 4. Configure GitHub Secrets

Add these secrets to your repo:
- `BASE_RPC_URL` - https://mainnet.base.org
- `SUPABASE_URL` - from step 2
- `SUPABASE_KEY` - from step 2
- `TELEGRAM_BOT_TOKEN` - from step 3
- `TELEGRAM_CHAT_ID` - from step 3

## 5. Deploy Website

1. Go to Settings > Pages
2. Source: GitHub Actions
3. Push code, deployment happens automatically

## 6. Monitor

Check Actions tab for cycle runs.
Alerts sent to Telegram channel.
