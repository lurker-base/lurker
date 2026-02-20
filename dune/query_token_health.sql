-- LURKER: Token Health Check
-- Analyse un token fraîchement détecté sur Base

SELECT 
    '{{token_address}}' as token_address,
    t.token_bought_symbol as symbol,
    COUNT(*) as total_trades,
    COUNT(DISTINCT t.tx_from) as unique_buyers,
    COUNT(DISTINCT t.tx_to) as unique_sellers,
    SUM(t.amount_usd) as volume_usd,
    AVG(t.amount_usd) as avg_trade_size,
    MIN(t.block_time) as first_trade,
    MAX(t.block_time) as last_trade,
    DATE_DIFF('minute', MIN(t.block_time), MAX(t.block_time)) as active_minutes,
    
    -- Score simple: volume élevé + nombreux buyers = intéressant
    CASE 
        WHEN SUM(t.amount_usd) > 50000 AND COUNT(DISTINCT t.tx_from) > 100 THEN '🔥 HOT'
        WHEN SUM(t.amount_usd) > 10000 AND COUNT(DISTINCT t.tx_from) > 30 THEN '⚡ WARM'  
        WHEN SUM(t.amount_usd) > 1000 THEN '📊 LOW'
        ELSE '💀 DUST'
    END as lurker_signal

FROM dex.trades t
WHERE t.blockchain = 'base'
    AND (t.token_bought_address = {{token_address}} OR t.token_sold_address = {{token_address}})
    AND t.block_time >= now() - interval '1' hour
GROUP BY t.token_bought_symbol
