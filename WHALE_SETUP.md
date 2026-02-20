# Configuration Whale Detector

## 1. Obtenir BaseScan API Key (GRATUIT)

1. Aller sur https://basescan.org/apis
2. Créer un compte
3. Copier la API Key
4. L'ajouter au fichier `.env`:

```bash
BASESCAN_API_KEY=YourApiKeyHere
```

## 2. Ajouter des Whales à suivre

Éditer `src/whaleDetector.js`:

```javascript
trackedWallets: [
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', // Whale 1
    '0x...', // Whale 2
    '0x...', // Whale 3
]
```

**Où trouver les whales ?**
- Nansen: https://nansen.ai (payant)
- DeBank: https://debank.com (gratuit, regarder les portfolios > $1M)
- Arkham: https://arkhamintelligence.com (gratuit)
- Etherscan/BaseScan: Top holders des gros tokens

## 3. Démarrer

```bash
cd /data/.openclaw/workspace/lurker-project
node src/whaleDetector.js
```

## Alertes Telegram (Optionnel)

Pour recevoir sur Telegram, ajouter au fichier `.env`:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## Test sans API Key

Sans API key, le scanner génère des données de test.
Pour voir le résultat, vérifier `data/whaleAlerts.json`.

## Seuils configurables

Dans `src/whaleDetector.js`, modifier `thresholds`:

```javascript
thresholds: {
    accumulation: {
        minBought: 5,        // Nombre d'achats
        minEthSpent: 10,     // ETH minimum
        timeWindow: 3600000  // Fenêtre temps (ms)
    },
    distribution: {
        minSold: 3,
        minEthMoved: 20
    },
    awakening: {
        dormantDays: 30,
        minValue: 5
    }
}
```
