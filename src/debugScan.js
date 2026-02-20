#!/usr/bin/env node
// Debug - voir quels tokens sont disponibles

const https = require('https');

const now = Date.now();

function fetchSearch(q) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.dexscreener.com',
      path: `/latest/dex/search?q=${q}`,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.pairs || []);
        } catch(e) { resolve([]); }
      });
    });
    
    req.on('error', () => resolve([]));
    req.setTimeout(10000, () => { req.destroy(); resolve([]); });
  });
}

async function main() {
  console.log('[DEBUG] Checking what tokens exist on Base...\n');
  
  const pairs = await fetchSearch('base');
  console.log(`Found ${pairs.length} pairs for "base" search`);
  
  const basePairs = pairs.filter(p => p.chainId === 'base');
  console.log(`${basePairs.length} are actually on Base chain\n`);
  
  // Montrer les plus récents avec liquidité
  const withLiq = basePairs
    .map(p => ({
      symbol: p.baseToken?.symbol || '?',
      name: p.baseToken?.name || '?',
      liq: parseFloat(p.liquidity?.usd || 0),
      vol5m: parseFloat(p.volume?.m5 || 0),
      age: p.pairCreatedAt ? Math.round((now - p.pairCreatedAt) / (1000 * 60)) : '?',
      ageHours: p.pairCreatedAt ? ((now - p.pairCreatedAt) / (1000 * 60 * 60)).toFixed(1) : '?',
      address: p.baseToken?.address
    }))
    .filter(t => t.liq > 0)
    .sort((a, b) => b.liq - a.liq);
  
  console.log('Tokens with liquidity (sorted by liq):');
  console.log('Symbol       | Liq      | Vol5m    | Age      | Address');
  console.log('-------------|----------|----------|----------|------------------------------------------');
  
  withLiq.slice(0, 15).forEach(t => {
    const ageStr = typeof t.age === 'number' ? `${t.age}min (${t.ageHours}h)` : t.age;
    console.log(
      `${t.symbol.padEnd(12)} | ${('$'+Math.round(t.liq).toLocaleString()).padEnd(8)} | ${('$'+Math.round(t.vol5m).toLocaleString()).padEnd(8)} | ${ageStr.padEnd(8)} | ${t.address}`
    );
  });
  
  console.log(`\nTotal with >$5k liq: ${withLiq.filter(t => t.liq >= 5000).length}`);
  console.log(`Total with >$10k liq: ${withLiq.filter(t => t.liq >= 10000).length}`);
  console.log(`Total with >$5k liq AND >30min age: ${withLiq.filter(t => t.liq >= 5000 && typeof t.age === 'number' && t.age >= 30).length}`);
}

main();
