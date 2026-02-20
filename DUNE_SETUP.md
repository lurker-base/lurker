# Dune Analytics Integration

## Status
Dune API v1 is deprecated. New system requires different approach.

## Alternative: Create Queries in Dune Interface

### Step 1: Create Account
Go to https://dune.com and sign up

### Step 2: Create These Queries

#### Query 1: New Tokens on Base (Last 24h)
```sql
SELECT 
    date_trunc('hour', block_time) as hour,
    COUNT(DISTINCT token_bought_address) as new_tokens,
    SUM(amount_usd) as volume_usd
FROM dex.trades 
WHERE blockchain = 'base'
    AND block_time >= now() - interval '24' hour
GROUP BY 1
ORDER BY 1 DESC
```

#### Query 2: Fresh Launches (< 1 hour)
```sql
SELECT 
    token_bought_symbol as symbol,
    token_bought_address as address,
    COUNT(*) as trades,
    SUM(amount_usd) as volume_1h,
    MIN(block_time) as first_trade
FROM dex.trades 
WHERE blockchain = 'base'
    AND block_time >= now() - interval '1' hour
GROUP BY 1, 2
HAVING COUNT(*) >= 3
ORDER BY volume_1h DESC
LIMIT 50
```

#### Query 3: Clanker Factory Analysis
```sql
SELECT 
    '0xE85A59c628F7d27878ACeB4bf3b35733630083a9' as factory,
    COUNT(*) as tokens_created,
    date_trunc('day', block_time) as day
FROM ethereum.transactions 
WHERE to = 0xE85A59c628F7d27878ACeB4bf3b35733630083a9
    AND block_time >= now() - interval '7' day
GROUP BY 3
ORDER BY 3 DESC
```

### Step 3: Create Dashboard
1. Go to Create → Dashboard
2. Add your queries as visualizations
3. Set dashboard to public
4. Share URL

## LURKER Data Upload (Future)
When Dune opens data uploads for free tier:

```bash
# Upload our signals
node src/duneUploader.js
```

## Recommended Free Queries to Start

| Query | Purpose | Credits |
|-------|---------|---------|
| Base new tokens/hour | Market activity | ~5/run |
| Top gainers 24h | Alpha signals | ~10/run |
| Fresh liquidity pools | Early detection | ~8/run |

## Dune API Limits (Free Tier)
- 2500 credits/month
- ~40 API calls/minute
- 100 MB data storage

## Next Steps
1. Create Dune account
2. Run queries above
3. Build public dashboard
4. Link from LURKER website
