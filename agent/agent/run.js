const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * LURKER Cycle Orchestrator
 * Inspired by Daimon (daimon111/daimon)
 * 
 * Every cycle:
 * 1. Read memory (self, learnings, state)
 * 2. Gather context (signals, stats)
 * 3. Run scanner if not already running
 * 4. Update state
 * 5. Commit changes
 */

const CONFIG = {
  memoryDir: path.join(__dirname, '../memory'),
  dataDir: path.join(__dirname, '../data'),
  proofDir: path.join(__dirname, '../proofs'),
};

// Ensure directories
[CONFIG.memoryDir, CONFIG.dataDir, CONFIG.proofDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Read memory files
function loadMemory() {
  const memory = {};
  
  try {
    memory.self = fs.readFileSync(path.join(CONFIG.memoryDir, 'self.md'), 'utf8');
  } catch(e) { memory.self = ''; }
  
  try {
    memory.learnings = fs.readFileSync(path.join(CONFIG.memoryDir, 'learnings.md'), 'utf8');
  } catch(e) { memory.learnings = ''; }
  
  try {
    memory.state = JSON.parse(fs.readFileSync(path.join(CONFIG.memoryDir, 'state.json'), 'utf8'));
  } catch(e) { memory.state = { cycleCount: 0, signalsGenerated: 0 }; }
  
  return memory;
}

// Gather context
function gatherContext() {
  const context = {
    timestamp: Date.now(),
    signals: [],
    stats: {}
  };
  
  // Load signals
  try {
    const signalsFile = path.join(CONFIG.dataDir, 'realtimeSignals.json');
    if (fs.existsSync(signalsFile)) {
      context.signals = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));
    }
  } catch(e) {}
  
  // Calculate stats
  const now = Date.now();
  context.stats = {
    total: context.signals.length,
    last1h: context.signals.filter(s => now - s.detectedAt < 3600000).length,
    last24h: context.signals.filter(s => now - s.detectedAt < 86400000).length,
    highScore: context.signals.filter(s => s.score >= 60).length
  };
  
  return context;
}

// Update state
function updateState(memory, context) {
  const state = memory.state;
  state.cycleCount++;
  state.signalsGenerated = context.stats.total;
  state.highScoreSignals = context.stats.highScore;
  state.lastCycle = new Date().toISOString();
  
  fs.writeFileSync(
    path.join(CONFIG.memoryDir, 'state.json'),
    JSON.stringify(state, null, 2)
  );
  
  return state;
}

// Write daily journal
function writeDailyJournal(context, state) {
  const today = new Date().toISOString().split('T')[0];
  const journalPath = path.join(CONFIG.memoryDir, `${today}.md`);
  
  let journal = '';
  if (fs.existsSync(journalPath)) {
    journal = fs.readFileSync(journalPath, 'utf8');
  } else {
    journal = `# ${today} — LURKER Daily Journal\n\n`;
  }
  
  // Append cycle summary
  const cycleEntry = `\n## Cycle #${state.cycleCount}\n\n`;
  const statsEntry = `- **Signals (1h):** ${context.stats.last1h}\n`;
  const totalEntry = `- **Total signals:** ${context.stats.total}\n`;
  const timeEntry = `- **Time:** ${new Date().toUTCString()}\n\n`;
  
  if (!journal.includes(`Cycle #${state.cycleCount}`)) {
    journal += cycleEntry + statsEntry + totalEntry + timeEntry;
    fs.writeFileSync(journalPath, journal);
  }
}

// Save proof
function saveProof(memory, context, state) {
  const today = new Date().toISOString().split('T')[0];
  const proofDir = path.join(CONFIG.proofDir, today);
  
  if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
  
  const proof = {
    cycle: state.cycleCount,
    timestamp: new Date().toISOString(),
    context: {
      signalsCount: context.stats.total,
      signalsLast1h: context.stats.last1h,
      highScoreCount: context.stats.highScore
    },
    topSignals: context.signals
      .slice(0, 5)
      .map(s => ({
        symbol: s.token?.symbol,
        score: s.score,
        age: s.token?.age,
        liquidityUSD: s.token?.liquidityUSD
      }))
  };
  
  const proofFile = path.join(proofDir, `${Date.now()}.json`);
  fs.writeFileSync(proofFile, JSON.stringify(proof, null, 2));
}

// Main cycle
async function runCycle() {
  console.log('[LURKER] Starting cycle...\n');
  
  // 1. Load memory
  const memory = loadMemory();
  console.log(`[LURKER] Memory loaded: ${memory.state.cycleCount} previous cycles`);
  
  // 2. Gather context
  const context = gatherContext();
  console.log(`[LURKER] Context: ${context.stats.total} signals, ${context.stats.last1h} in last hour`);
  
  // 3. Update state
  const state = updateState(memory, context);
  console.log(`[LURKER] State updated: cycle #${state.cycleCount}`);
  
  // 4. Write journal
  writeDailyJournal(context, state);
  console.log('[LURKER] Daily journal updated');
  
  // 5. Save proof
  saveProof(memory, context, state);
  console.log('[LURKER] Proof saved');
  
  // 6. Check if scanner is running
  try {
    execSync('pgrep -f fastScanner', { stdio: 'pipe' });
    console.log('[LURKER] Scanner is active');
  } catch(e) {
    console.log('[LURKER] ⚠️ Scanner not running — should restart');
  }
  
  console.log('\n[LURKER] Cycle complete. Going back to sleep.\n');
}

// Run
runCycle().catch(err => {
  console.error('[LURKER] Cycle failed:', err.message);
  process.exit(1);
});
