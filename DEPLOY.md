# LURKER Deployment Guide

## 1. Create Anonymous GitHub Account

- Use ProtonMail or Tutanota for email
- Username: `lurker-base` (already created)
- No personal info in bio
- Avatar: use generated image from assets/lurker-mascot-logo.png

## 2. Create Telegram Bot (Optional)

1. Message @BotFather on Telegram
2. Create new bot, get token
3. Create channel/group for alerts
4. Add bot to channel, get chat ID

## 3. Configure GitHub Secrets

Add these secrets to your repo (Settings → Secrets):
- `BASE_RPC_URL` - https://mainnet.base.org (or leave empty for default)
- `TELEGRAM_BOT_TOKEN` - from step 2 (optional)
- `TELEGRAM_CHAT_ID` - from step 2 (optional)

## 4. Deploy Website

1. Go to Settings > Pages
2. Source: GitHub Actions
3. Push code, deployment happens automatically

## 5. Enable GitHub Actions

1. Go to Actions tab
2. Enable workflows
3. The cycle will run every 5 minutes automatically

## 6. Monitor

- Check Actions tab for cycle runs
- Data stored in `data/signals.json`
- Alerts sent to Telegram (if configured)

**Note:** No database required! All data stored in JSON files committed to the repo.
