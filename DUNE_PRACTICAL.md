# Dune Analytics - Guide Pratique LURKER

## Ta clé API sert à ça :
Exécuter des queries SQL que tu créés sur dune.com

---

## Étape 1: Créer une Query sur Dune (Interface Web)

1. Va sur https://dune.com/queries
2. Clique "New Query"
3. Sélectionne "Base" comme blockchain
4. Colle ce SQL:

### Query 1: Analyse Token
```sql
SELECT 
    t.token_bought_symbol as symbol,
    COUNT(*) as trades_1h,
    SUM(t.amount_usd) as volume_1h,
    COUNT(DISTINCT t.tx_from) as unique_buyers,
    MIN(t.block_time) as first_trade,
    MAX(t.block_time) as last_trade
FROM dex.trades t
WHERE t.blockchain = 'base'
    AND t.token_bought_address = {{token_address}}
    AND t.block_time >= now() - interval '1' hour
GROUP BY t.token_bought_symbol
```

5. Ajoute un paramètre `token_address` (type: text)
6. Sauvegarde la query
7. Note l'ID (ex: 4567890)

---

## Étape 2: Exécuter via API (ta clé)

```bash
curl -X POST https://api.dune.com/api/v1/query/4567890/execute \
  -H "X-Dune-API-Key: StAmNTvnKwEb7ue2Cto5IethDa3kunBj" \
  -H "Content-Type: application/json" \
  -d '{"query_parameters": {"token_address": "0xd423EEfd53067a65d50CD83AbD1f4aF11D6c3B07"}}'
```

---

## Queries à créer pour LURKER

### 1. Token Health Check
```sql
SELECT 
    '{{token_address}}' as token,
    COUNT(*) as total_trades_24h,
    SUM(amount_usd) as volume_24h,
    AVG(amount_usd) as avg_trade_size,
    COUNT(DISTINCT tx_from) as unique_traders
FROM dex.trades
WHERE blockchain = 'base'
    AND token_bought_address = {{token_address}}
    AND block_time >= now() - interval '24' hour
```

### 2. Creator Wallet Analysis
```sql
SELECT 
    '{{wallet}}' as creator,
    COUNT(DISTINCT token_address) as tokens_created,
    MIN(block_time) as first_creation,
    MAX(block_time) as last_creation
FROM tokens.erc20
WHERE blockchain = 'base'
    AND creator_address = {{wallet}}
```

### 3. Fresh Tokens Ranking
```sql
SELECT 
    token_bought_symbol as symbol,
    token_bought_address as address,
    SUM(amount_usd) as volume_1h,
    COUNT(*) as trades,
    MIN(block_time) as first_seen
FROM dex.trades
WHERE blockchain = 'base'
    AND block_time >= now() - interval '1' hour
GROUP BY token_bought_symbol, token_bought_address
HAVING SUM(amount_usd) > 1000
ORDER BY volume_1h DESC
LIMIT 50
```

---

## Script Node.js pour LURKER

```javascript
const axios = require('axios');

const API_KEY = 'StAmNTvnKwEb7ue2Cto5IethDa3kunBj';

async function analyzeToken(queryId, tokenAddress) {
    // Execute
    const exec = await axios.post(
        `https://api.dune.com/api/v1/query/${queryId}/execute`,
        { query_parameters: { token_address: tokenAddress } },
        { headers: { 'X-Dune-API-Key': API_KEY } }
    );
    
    // Poll for results
    const executionId = exec.data.execution_id;
    let status = 'PENDING';
    while (status === 'PENDING' || status === 'EXECUTING') {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await axios.get(
            `https://api.dune.com/api/v1/execution/${executionId}/status`,
            { headers: { 'X-Dune-API-Key': API_KEY } }
        );
        status = statusRes.data.state;
    }
    
    // Get results
    const results = await axios.get(
        `https://api.dune.com/api/v1/execution/${executionId}/results`,
        { headers: { 'X-Dune-API-Key': API_KEY } }
    );
    
    return results.data.result?.rows;
}

// Usage
analyzeToken(4567890, '0xd423EEfd53067a65d50CD83AbD1f4aF11D6c3B07')
    .then(console.log);
```

---

## Coûts (Free Tier)

| Action | Crédits |
|--------|---------|
| Exécuter query simple | ~5-10 |
| Exécuter query complexe | ~20-50 |
| 2500 crédits/mois | ~250-500 analyses |

---

## Prochaines étapes

1. Créer les 3 queries ci-dessus sur dune.com
2. Tester avec ta clé
3. Intégrer dans le scanner LURKER
4. Si ça marche bien → upgrade payant ($300/mois = illimité)

Tu veux que je te guide pour créer la première query ? 👁️
