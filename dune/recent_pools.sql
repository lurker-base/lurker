-- Dune Query: Recent Token Pools on Base
-- Detects new Uniswap V3 pools created in last 24h

SELECT 
    evt_block_time as created_at,
    evt_block_number as block_number,
    token0,
    token1,
    fee,
    pool,
    'uniswap-v3' as source
FROM uniswap_v3_base.Factory_evt_PoolCreated
WHERE evt_block_time > now() - INTERVAL '24' hour
ORDER BY evt_block_time DESC
LIMIT 100
