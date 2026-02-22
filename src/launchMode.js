// LURKER Launch Mode Configuration
// TEMPORARY - Aggressive thresholds for token launch window

const LAUNCH_MODE = {
  // Mode flag
  enabled: true,
  validUntil: Date.now() + (6 * 60 * 60 * 1000), // 6 hours from now
  
  // CIO (0-10m) - Wide net
  cio: {
    minLiquidityUSD: 2000,      // Was $5k → $2k
    maxAgeMinutes: 10,
    minVolume5m: 0,             // No volume filter (fresh launches)
    sources: ['clanker', 'bankr', 'uniswap', 'aerodrome', 'baseswap', 'trending']
  },
  
  // WATCH (10-30m) - Critical buffer
  watch: {
    minLiquidityUSD: 4000,      // Was $8k → $4k
    minTx5m: 8,                 // Was 15 → 8
    maxAgeMinutes: 30,
    minAgeMinutes: 10,
    retestCount: 2              // Was 3 → 2
  },
  
  // HOTLIST (30-60m) - Permissive but visible
  hotlist: {
    minLiquidityUSD: 7000,      // Was $15k → $7k
    minTx15m: 15,               // Was 25 → 15
    minTx1h: 40,                // Was 80 → 40
    maxAgeMinutes: 60,
    minAgeMinutes: 30,
    showRiskBias: true          // 🟢🟡🔴 mandatory
  },
  
  // FAST-CERTIFIED (1-24h)
  fast: {
    minLiquidityUSD: 15000,     // Was $20k → $15k
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
