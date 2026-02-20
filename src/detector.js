require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Detection patterns
const PATTERNS = {
  ACCUMULATION: 'accumulation',
  DISTRIBUTION: 'distribution',
  WHALE_BUY: 'whale_buy',
  WHALE_SELL: 'whale_sell'
};

async function detectPatterns(walletAddress, hoursBack = 24) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  
  const { data: txs, error } = await supabase
    .from('signals')
    .select('*')
    .or(`from.eq.${walletAddress},to.eq.${walletAddress}`)
    .gte('timestamp', since)
    .order('timestamp', { ascending: false });

  if (error || !txs || txs.length === 0) return [];

  const patterns = [];
  const incoming = txs.filter(tx => tx.to === walletAddress);
  const outgoing = txs.filter(tx => tx.from === walletAddress);
  
  const totalIn = incoming.reduce((sum, tx) => sum + parseFloat(tx.value), 0);
  const totalOut = outgoing.reduce((sum, tx) => sum + parseFloat(tx.value), 0);

  // Accumulation pattern
  if (totalIn > totalOut * 2 && totalIn > 50) {
    patterns.push({
      type: PATTERNS.ACCUMULATION,
      wallet: walletAddress,
      confidence: Math.min(totalIn / 100, 0.95),
      details: { totalIn, totalOut, txCount: txs.length }
    });
  }

  // Distribution pattern
  if (totalOut > totalIn * 2 && totalOut > 50) {
    patterns.push({
      type: PATTERNS.DISTRIBUTION,
      wallet: walletAddress,
      confidence: Math.min(totalOut / 100, 0.95),
      details: { totalIn, totalOut, txCount: txs.length }
    });
  }

  return patterns;
}

async function scanForWhales() {
  console.log('[LURKER] Scanning for whale patterns...');
  
  // Get unique wallets from recent signals
  const { data: recentSignals, error } = await supabase
    .from('signals')
    .select('from, to')
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (error || !recentSignals) return [];

  const wallets = [...new Set([
    ...recentSignals.map(s => s.from),
    ...recentSignals.map(s => s.to)
  ])].filter(Boolean);

  const allPatterns = [];
  for (const wallet of wallets.slice(0, 50)) { // Limit to top 50
    const patterns = await detectPatterns(wallet);
    allPatterns.push(...patterns);
  }

  // Store patterns
  if (allPatterns.length > 0) {
    await supabase.from('patterns').insert(allPatterns);
  }

  return allPatterns;
}

module.exports = { detectPatterns, scanForWhales, PATTERNS };

if (require.main === module) {
  scanForWhales()
    .then(patterns => {
      console.log(`[LURKER] Detected ${patterns.length} patterns`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[LURKER] Error:', err);
      process.exit(1);
    });
}
