#!/bin/bash
# LURKER Liquidity-First Scanner
# Détecte les tokens qui ONT déjà de la liquidité (pas juste les fresh launches)

cd /data/.openclaw/workspace/lurker-project

echo "[LIQ-SCAN] LURKER Liquidity-First Scanner"
echo "[LIQ-SCAN] $(date '+%H:%M:%S') - Fetching tokens with confirmed liquidity..."

# Appel DexScreener pour les tokens récents avec liquidité
curl -s "https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006" \
  -H "User-Agent: Mozilla/5.0" | node -e '
const fs = require("fs");
const data = JSON.parse(require("fs").readFileSync(0, "utf-8"));
const now = Date.now();

// Fichier existant
const existingFile = "data/allClankerSignals.json";
let existing = [];
try {
  existing = JSON.parse(fs.readFileSync(existingFile));
} catch(e) {}

const existingMap = new Map(existing.map(t => [t.contract_address || t.address, t]));

// Récupérer les paires WETH sur Base
const pairs = data.pairs || [];
const basePairs = pairs.filter(p => 
  p.chainId === "base" && 
  (p.dexId === "uniswap" || p.dexId === "aerodrome" || p.dexId === "baseswap")
);

let newTokens = 0;
let updatedTokens = 0;

basePairs.forEach(pair => {
  const token = pair.baseToken;
  const quote = pair.quoteToken;
  
  // Ignorer WETH comme base
  if (token.address === "0x4200000000000000000000000000000000000006") return;
  
  // Calculer l\'âge du pair
  const pairCreated = pair.pairCreatedAt || now;
  const ageHours = (now - pairCreated) / (1000 * 60 * 60);
  
  // SEULEMENT si < 2h et liquidité > 10k
  const liq = parseFloat(pair.liquidity?.usd || 0);
  const mcap = parseFloat(pair.fdv || pair.marketCap || 0);
  const vol24h = parseFloat(pair.volume?.h24 || 0);
  
  if (ageHours < 2 && liq > 10000) {
    const addr = token.address;
    const existingToken = existingMap.get(addr);
    
    const tokenData = {
      symbol: token.symbol,
      name: token.name,
      contract_address: addr,
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      ageHours: Math.round(ageHours * 100) / 100,
      liquidityUsd: Math.round(liq * 100) / 100,
      marketCap: Math.round(mcap * 100) / 100,
      volume24h: Math.round(vol24h * 100) / 100,
      priceUsd: pair.priceUsd,
      priceChange24h: pair.priceChange?.h24,
      detectedAt: existingToken?.detectedAt || now,
      enrichedAt: now,
      source: "liquidity-scan",
      hasLiquidity: true,
      txns24h: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0)
    };
    
    if (existingToken) {
      // Mettre à jour avec nouvelles données
      Object.assign(existingToken, tokenData);
      updatedTokens++;
    } else {
      // Nouveau token avec liquidité
      existing.push(tokenData);
      newTokens++;
      console.log(`[NEW-LIQ] ${token.symbol} - $${Math.round(liq).toLocaleString()} liq - ${Math.round(ageHours * 60)}min old`);
    }
    
    existingMap.set(addr, tokenData);
  }
});

// Sauvegarder
fs.writeFileSync(existingFile, JSON.stringify(existing, null, 2));
console.log(`[LIQ-SCAN] Added: ${newTokens} | Updated: ${updatedTokens} | Total: ${existing.length}`);
'

echo "[LIQ-SCAN] Done"
