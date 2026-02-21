#!/usr/bin/env node
/**
 * LURKER BaseScan Enricher v2 - Secure & Monitored
 * Enrichit les tokens avec données BaseScan (holders, tx count, contrat vérifié)
 * 
 * Config: .env.local BASESCAN_API_KEY
 * Logs: 1 ligne par tick (ok/fail + stats)
 * Fallback: Silencieux si clé absente
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env.local if present
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, '');
    }
  });
}

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
const DATA_FILE = path.join(__dirname, '..', 'data', 'allClankerSignals.json');
const BATCH_SIZE = 5;
const DELAY_MS = 200;

const startTime = Date.now();
let enrichedCount = 0;
let apiCalls = 0;

function baseScanCall(module, action, params = {}) {
  return new Promise((resolve) => {
    apiCalls++;
    
    const query = Object.entries({ ...params, module, action, apikey: BASESCAN_API_KEY })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    
    const options = {
      hostname: 'api.basescan.org',
      path: `/api?${query}`,
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === '1' && json.result) {
            resolve(json.result);
          } else {
            resolve(null);
          }
        } catch(e) { resolve(null); }
      });
    });
    
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

async function getTokenInfo(address) {
  const [txList, contract, supply] = await Promise.all([
    baseScanCall('account', 'tokentx', { contractaddress: address, page: 1, offset: 1 }),
    baseScanCall('contract', 'getabi', { address }),
    baseScanCall('stats', 'tokensupply', { contractaddress: address })
  ]);
  
  return {
    hasTransfers: Array.isArray(txList) && txList.length > 0,
    verified: contract !== null && contract !== 'Contract source code not verified',
    totalSupply: supply,
    enrichedAt: Date.now()
  };
}

async function main() {
  // Fallback: pas de clé = mode silencieux
  if (!BASESCAN_API_KEY || BASESCAN_API_KEY === 'YourApiKeyToken') {
    console.log(`[BASESCAN] SKIP - No API key configured (.env.local BASESCAN_API_KEY)`);
    return;
  }

  // Masquer la clé dans les logs (show first 4 + ***)
  const keyPreview = BASESCAN_API_KEY.slice(0, 4) + '***';

  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE));
  } catch(e) {
    console.log(`[BASESCAN] FAIL - No data file (${Date.now() - startTime}ms)`);
    return;
  }
  
  const toEnrich = data
    .filter(t => {
      const needsEnrich = !t.baseScanEnriched || (Date.now() - (t.baseScanEnrichedAt || 0) > 3600000);
      return needsEnrich && t.contract_address;
    })
    .slice(0, BATCH_SIZE);
  
  if (toEnrich.length === 0) {
    console.log(`[BASESCAN] OK - Nothing to enrich (key:${keyPreview}, 0 calls)`);
    return;
  }
  
  for (const token of toEnrich) {
    const addr = token.contract_address;
    const info = await getTokenInfo(addr);
    
    if (info) {
      token.baseScanData = info;
      token.baseScanEnriched = true;
      token.baseScanEnrichedAt = Date.now();
      token.verifiedContract = info.verified;
      token.hasTransfers = info.hasTransfers;
      enrichedCount++;
    }
    
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  
  // Log minimal: 1 ligne
  const duration = Date.now() - startTime;
  console.log(`[BASESCAN] OK - Enriched:${enrichedCount}/${toEnrich.length} | Calls:${apiCalls} | Key:${keyPreview} | ${duration}ms`);
}

main().catch(err => {
  console.log(`[BASESCAN] FAIL - ${err.message} (${Date.now() - startTime}ms)`);
  process.exit(1);
});
