# LURKER API Security — Protection des Signaux

## Problème Actuel

Le scanner est public :
- `signals.json` sur GitHub = accessible à tous
- Site statique =任何人 peut voir les signaux
- Pas d'authentification

## Solutions pour Protéger

### Option 1: API Key (Recommandé)

```javascript
// Serverless function (Vercel/Cloudflare Workers)
// /api/signals

export default function handler(req, res) {
  const apiKey = req.headers['x-api-key'];
  
  // Vérifier si la clé est valide et payée
  const user = await db.getUserByApiKey(apiKey);
  
  if (!user || !user.isPaid || user.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Retourner les signaux
  const signals = await getSignals();
  res.json(signals);
}
```

**Coût**: Gratuit (Vercel hobby) ou $5/mois (Cloudflare Workers)

### Option 2: Webhook Signatures (Plus sécurisé)

Au lieu de laisser les gens fetch les signaux, **on les pousse** via webhook :

```javascript
// LURKER server
async function sendSignal(signal) {
  const subscribers = await getPaidSubscribers();
  
  for (const sub of subscribers) {
    const signature = createHmac(signal, sub.secret);
    
    await fetch(sub.webhookUrl, {
      method: 'POST',
      headers: {
        'X-Signature': signature,
        'X-Subscriber': sub.id
      },
      body: JSON.stringify(signal)
    });
  }
}
```

**Avantage**: Impossible à scraper, les signaux viennent directement aux abonnés

### Option 3: Delayed Data (Freemium)

| Niveau | Accès | Détail |
|--------|-------|--------|
| **Gratuit** | Signaux de 10+ min | Trop tard pour le pump |
| **Payant** | Signaux temps réel | Instantané, avant le pump |

```javascript
// API
const signals = await getSignals();
const now = Date.now();

// Free users: only signals > 10 min old
if (!user.isPaid) {
  return signals.filter(s => now - s.detectedAt > 10 * 60 * 1000);
}

// Paid users: all signals
return signals;
```

### Option 4: On-Chain Verification (Web3)

Vérifier que l'utilisateur hold du $LURKER pour accéder aux signaux :

```solidity
// Smart contract
function hasAccess(address user) public view returns (bool) {
    return balanceOf(user) >= MINIMUM_STAKE || 
           subscriptionExpiry[user] > block.timestamp;
}
```

```javascript
// API
const userAddress = verifySignature(req.headers.authorization);
const hasAccess = await contract.hasAccess(userAddress);

if (!hasAccess) {
  return res.status(403).json({ error: 'Stake $LURKER required' });
}
```

## Recommandation

**Phase 1 (maintenant)**: Pas besoin de sécurité — on veut des utilisateurs

**Phase 2 (quand on a des signaux qui marchent)**:
1. Mettre les signaux récents (< 10 min) derrière API key
2. Laisser les vieux signaux publics (preuve que ça marche)
3. Webhook pour les gros clients (agents, bots)

**Phase 3 (avec token $LURKER)**:
- Stake $LURKER pour accès
- Burn 20% de chaque paiement
- Treasury reçoit 80%

## Implémentation Simple

Pour commencer rapidement :

```javascript
// /api/signals.js (Vercel)
export default async (req, res) => {
  // Check API key
  const apiKey = req.query.key;
  const isValid = await validateKey(apiKey); // Simple table en mémoire
  
  if (!isValid) {
    return res.status(401).json({ 
      error: 'API key required',
      signup: 'https://lurker-base.github.io/lurker/agents.html'
    });
  }
  
  // Return signals
  const signals = JSON.parse(fs.readFileSync('./data/signals.json'));
  res.json(signals.slice(0, 10)); // Last 10 only
};
```

**Coût**: $0 (Vercel hobby tier)

## Décision

Tu veux que je setup une API protégée maintenant ? Ou on attend d'avoir des signaux qui performent bien ?

**Mon conseil**: Attendre 48h de données, puis mettre les signaux < 5 min derrière paywall.
