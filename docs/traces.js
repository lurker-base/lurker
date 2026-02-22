// LURKER Trace System — 3-State Token Lifecycle
// SIGNAL → TRACE ACTIVE → ARCHIVE

const TRACE_CONFIG = {
  // State transitions
  SIGNAL_MAX_AGE_HOURS: 72,      // 0-72h = SIGNAL
  TRACE_CHECK_INTERVAL_HOURS: 24, // Check activity every 24h
  TRACE_MIN_ACTIVITY_TX: 10,      // Min 10 tx/24h to stay TRACE
  ARCHIVE_AFTER_DAYS: 7           // 7 days inactive = ARCHIVE
};

// Token lifecycle states
const TOKEN_STATES = {
  SIGNAL: 'signal',      // Fresh detection, 0-72h
  TRACE: 'trace',        // Seen by LURKER, still active
  ARCHIVE: 'archive'     // No activity, hidden by default
};

class TraceManager {
  constructor() {
    this.traces = new Map(); // tokenAddress -> traceData
  }
  
  // When scanner detects a token
  onDetection(token) {
    const existing = this.traces.get(token.address);
    
    if (existing) {
      // Update existing trace
      existing.lastSeen = Date.now();
      existing.detectCount++;
      existing.activityLog.push({
        timestamp: Date.now(),
        liq: token.liquidity,
        vol: token.volume,
        tx: token.txCount
      });
      
      // Check if should upgrade to SIGNAL again
      if (this.isSignificantChange(existing, token)) {
        existing.state = TOKEN_STATES.SIGNAL;
        existing.signalReason = 'significant_change';
      }
    } else {
      // New trace
      this.traces.set(token.address, {
        address: token.address,
        symbol: token.symbol,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        detectCount: 1,
        state: TOKEN_STATES.SIGNAL,
        activityLog: [{
          timestamp: Date.now(),
          liq: token.liquidity,
          vol: token.volume,
          tx: token.txCount
        }]
      });
    }
    
    this.saveTraces();
  }
  
  // Check all traces for state transitions
  async updateStates() {
    const now = Date.now();
    
    for (const [addr, trace] of this.traces) {
      const ageHours = (now - trace.firstSeen) / 3600000;
      const hoursSinceLastSeen = (now - trace.lastSeen) / 3600000;
      
      // SIGNAL (0-72h) → TRACE (if still active)
      if (trace.state === TOKEN_STATES.SIGNAL && ageHours > TRACE_CONFIG.SIGNAL_MAX_AGE_HOURS) {
        const isActive = await this.checkActivity(addr);
        trace.state = isActive ? TOKEN_STATES.TRACE : TOKEN_STATES.ARCHIVE;
      }
      
      // TRACE → ARCHIVE (if dead)
      if (trace.state === TOKEN_STATES.TRACE && hoursSinceLastSeen > TRACE_CONFIG.ARCHIVE_AFTER_DAYS * 24) {
        trace.state = TOKEN_STATES.ARCHIVE;
      }
    }
    
    this.saveTraces();
  }
  
  // Check if token is still active on-chain
  async checkActivity(tokenAddress) {
    // Query Base RPC for recent transactions
    // Return true if > TRACE_MIN_ACTIVITY_TX in last 24h
  }
  
  // Get traces for display
  getTraces(state = null, limit = 100) {
    const traces = Array.from(this.traces.values());
    
    if (state) {
      return traces.filter(t => t.state === state).slice(0, limit);
    }
    
    // Default: SIGNAL first, then active TRACE
    return traces
      .filter(t => t.state !== TOKEN_STATES.ARCHIVE)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }
  
  // Get "LURKER saw it early" stories
  getSuccessStories() {
    return this.getTraces(TOKEN_STATES.TRACE)
      .filter(t => t.detectCount > 3) // Seen multiple times
      .filter(t => this.growthSinceFirst(t) > 2) // 2x growth
      .slice(0, 10);
  }
  
  growthSinceFirst(trace) {
    if (!trace.activityLog.length) return 0;
    const first = trace.activityLog[0];
    const last = trace.activityLog[trace.activityLog.length - 1];
    return last.liq / first.liq;
  }
  
  saveTraces() {
    // Persist to JSON
  }
}

// Badge generator
function generateTraceBadge(trace) {
  const ageDays = Math.floor((Date.now() - trace.firstSeen) / 86400000);
  
  if (trace.state === TOKEN_STATES.SIGNAL) {
    return { text: 'SIGNAL', color: '#00ff00', icon: '📡' };
  }
  
  if (trace.state === TOKEN_STATES.TRACE) {
    return { 
      text: `SEEN ${ageDays}D AGO`, 
      color: '#ffaa00', 
      icon: '👁️',
      subtitle: 'Still active'
    };
  }
  
  return { text: 'ARCHIVE', color: '#666', icon: '📦' };
}

// Export
window.LURKER_TRACES = new TraceManager();
