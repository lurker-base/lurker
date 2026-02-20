require('dotenv').config();
const { ethers } = require('ethers');
const { loadSignals, saveSignals } = require('./storage');

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');

// Whale thresholds
const WHALE_THRESHOLD_ETH = 10; // 10 ETH minimum
const TARGET_TOKENS = ['WETH', 'USDC', 'USDT', 'DAI'];

async function scanBlock(blockNumber) {
  console.log(`[LURKER] Scanning block ${blockNumber}...`);
  
  const block = await provider.getBlock(blockNumber, true);
  if (!block) return [];

  const signals = [];

  for (const tx of block.prefetchedTransactions || []) {
    const value = ethers.formatEther(tx.value);
    
    if (parseFloat(value) >= WHALE_THRESHOLD_ETH) {
      signals.push({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: value,
        blockNumber: blockNumber,
        timestamp: new Date(block.timestamp * 1000).toISOString(),
        type: 'large_transfer'
      });
    }
  }

  return signals;
}

async function scanLatest() {
  const latestBlock = await provider.getBlockNumber();
  const signals = await scanBlock(latestBlock);
  
  if (signals.length > 0) {
    console.log(`[LURKER] Detected ${signals.length} large transfers`);
    
    // Store in JSON file
    const db = loadSignals();
    db.signals.push(...signals);
    // Keep only last 1000 signals to prevent file bloat
    if (db.signals.length > 1000) {
      db.signals = db.signals.slice(-1000);
    }
    db.lastBlock = blockNumber;
    saveSignals(db);
    console.log(`[LURKER] Saved ${signals.length} signals to storage`);
  }
  
  return signals;
}

module.exports = { scanBlock, scanLatest };

// Run if called directly
if (require.main === module) {
  scanLatest()
    .then(signals => {
      console.log(`[LURKER] Cycle complete. Signals: ${signals.length}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[LURKER] Error:', err);
      process.exit(1);
    });
}
