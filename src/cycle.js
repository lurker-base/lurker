require('dotenv').config();
const { scanLatest } = require('./indexer');
const { scanForWhales } = require('./detector');
const { sendPendingAlerts } = require('./alerts');

async function cycle() {
  console.log('\\n[LURKER] === Cycle started ===');
  console.log(`[LURKER] Time: ${new Date().toISOString()}`);

  try {
    // 1. Scan for new transactions
    const signals = await scanLatest();
    console.log(`[LURKER] Found ${signals.length} signals`);

    // 2. Detect patterns
    const patterns = await scanForWhales();
    console.log(`[LURKER] Detected ${patterns.length} patterns`);

    // 3. Send alerts
    const alerts = await sendPendingAlerts();
    console.log(`[LURKER] Sent ${alerts.length} alerts`);

    console.log('[LURKER] === Cycle complete ===\\n');
    return { signals: signals.length, patterns: patterns.length, alerts: alerts.length };
  } catch (err) {
    console.error('[LURKER] Cycle error:', err);
    throw err;
  }
}

module.exports = { cycle };

if (require.main === module) {
  cycle()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
