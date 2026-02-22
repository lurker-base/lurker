// LURKER Launch Mode Configuration
// TEMPORARY - ULTRA DISCOVERY for token launch window

const LAUNCH_MODE = {
  // Mode flag
  enabled: true,
  validUntil: Date.now() + (6 * 60 * 60 * 1000), // 6 hours from now
  
  // CIO (0-60m) - ULTRA WIDE NET for discovery
  cio: {
    minLiquidityUSD: 1000,      // ULTRA: $1k (was $2k, originally $5k)
    maxAgeMinutes: 60,          // Extended window
    minVolume5m: 50,            // ULTRA: $50 min
    minTx5m: 2,                 // ULTRA: 2 tx minimum
    sources: ['search', 'profiles', 'boosts', 'top_boosts'],
    riskTagging: true,          // Tag instead of filter
  },
  
  // WATCH (10-30m) - Critical buffer
  watch: {
    minLiquidityUSD: 2500,      // ULTRA: $2.5k (was $4k)
    minTx5m: 5,                 // ULTRA: 5 tx (was 8)
    maxAgeMinutes: 30,
    minAgeMinutes: 10,
    retestCount: 2
  },
  
  // HOTLIST (30-60m) - Permissive but visible
  hotlist: {
    minLiquidityUSD: 5000,      // ULTRA: $5k (was $7k)
    minTx15m: 12,               // ULTRA: 12 (was 15)
    minTx1h: 30,                // ULTRA: 30 (was 40)
    maxAgeMinutes: 60,
    minAgeMinutes: 30,
    showRiskBias: true
  },
  
  // FAST-CERTIFIED (1-24h)
  fast: {
    minLiquidityUSD: 15000,
    minTx6h: 50,
    minAgeHours: 1,
    maxAgeHours: 24
  },
  
  // CERTIFIED (24h+)
  certified: {
    minLiquidityUSD: 25000,
    minHolders: 100,
    minAgeHours: 24
  }
};

// Risk bias calculation
function calculateRiskBias(signal) {
  const liq = signal.liquidityUsd || 0;
  const vol5m = signal.volume5m || 0;
  const tx5m = signal.txns5m || 0;
  
  // Low risk: good liq + volume
  if (liq > 20000 && vol5m > 5000 && tx5m > 20) {
    return { level: 'low', emoji: '🟢', text: 'momentum + structure OK' };
  }
  
  // Medium risk: acceptable but fragile
  if (liq > 10000 && vol5m > 2000 && tx5m > 10) {
    return { level: 'medium', emoji: '🟡', text: 'momentum OK, structure fragile' };
  }
  
  // High risk: speculation only
  return { level: 'high', emoji: '🔴', text: 'pure speculation, scalp only' };
}

module.exports = { LAUNCH_MODE, calculateRiskBias };
