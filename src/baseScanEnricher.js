#!/usr/bin/env node
/**
 * LURKER BaseScan Enricher
 * Enrichit les tokens avec données BaseScan (holders, tx count, contrat vérifié)
 * API Key requise en read-only
 */

const https = require('https');
const fs = require('fs');

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || 'YourApiKeyToken';
const DATA_FILE = 'data/allClankerSignals.json';
const BATCH_SIZE = 5; // 5 calls max par run (rate limit)
const DELAY_MS = 200;

function log(msg) {
  console.log(`[BASESCAN] ${msg}`);
}

function baseScanCall(module, action, params = {}) {
  return new Promise((resolve) => {
    if (BASESCAN_API_KEY === 'YourApiKeyToken') {
      log('API key not configured');
      resolve(null);
      return;
    }
    
    const query = Object.entries({ ...params, module, action, apikey: BASESCAN_API_KEY })
      .map(([k, v]) => `${k}=${v}`)
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
            log(`API error: ${json.message || 'Unknown'}`);
            resolve(null);
          }
        } catch(e) {
          resolve(null);
        }
      });
    });
    
    req.on('error', (err) => {
      log(`Request error: ${err.message}`);
      resolve(null);
    });
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

async function getTokenInfo(address) {
  // 1. Token holder count (approx via token supply查询 workaround)
  // Note: BaseScan free tier doesn't have direct holder count, we estimate from transfers
  
  // 2. Transaction count (token transfers)
  const txList = await baseScanCall('account', 'tokentx', {
    contractaddress: address,
    page: 1,
    offset: 1
  });
  
  // 3. Contract verification status
  const contract = await baseScanCall('contract', 'getabi', {
    address: address
  });
  
  // 4. Total supply
  const supply = await baseScanCall('stats', 'tokensupply', {
    contractaddress: address
  });
  
  return {
    hasTransfers: Array.isArray(txList) && txList.length > 0,
    txSample: Array.isArray(txList) ? txList.length : 0,
    verified: contract !== null && contract !== 'Contract source code not verified',
    totalSupply: supply,
    enrichedAt: Date.now()
  };
}

async function main() {
  log('BaseScan Enricher');
  log(`API Key: ${BASESCAN_API_KEY === 'YourApiKeyToken' ? 'NOT SET' : '******'}`);
  
  if (BASESCAN_API_KEY === 'YourApiKeyToken') {
    log('');
    log('⚠️  Pour activer:');
    log('1. Créer compte sur https://basescan.org/apis');
    log('2. Exporter: export BASESCAN_API_KEY=votre_cle');
    log('');
    log('Le scanner continuera sans enrichissement BaseScan');
    return;
  }
  
  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE));
  } catch(e) {
    log('No data file found');
    return;
  }
  
  // Filtrer tokens qui n'ont pas encore été enrichis récemment
  const toEnrich = data
    .filter(t => {
      const needsEnrich = !t.baseScanEnriched || (Date.now() - (t.baseScanEnrichedAt || 0) > 3600000);
      return needsEnrich && t.contract_address;
    })
    .slice(0, BATCH_SIZE);
  
  log(`Enriching ${toEnrich.length} tokens...`);
  
  let enriched = 0;
  for (const token of toEnrich) {
    const addr = token.contract_address;
    log(`Checking ${token.symbol || addr.slice(0, 10)}...`);
    
    const info = await getTokenInfo(addr);
    
    if (info) {
      token.baseScanData = info;
      token.baseScanEnriched = true;
      token.baseScanEnrichedAt = Date.now();
      token.hasTransfers = info.hasTransfers;
      token.verifiedContract = info.verified;
      token.totalSupply = info.totalSupply;
      enriched++;
      log(`  ✓ Verified: ${info.verified}, Has activity: ${info.hasTransfers}`);
    }
    
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  log(`Enriched ${enriched} tokens`);
}

main().catch(err => {
  log(`Error: ${err.message}`);
  process.exit(1);
});
