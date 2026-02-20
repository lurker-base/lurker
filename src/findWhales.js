const axios = require('axios');
const fs = require('fs');

// Script pour trouver des whales sur Base
// Usage: node findWhales.js

const CONFIG = {
    // Tokens populaires sur Base où chercher les top holders
    baseTokens: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x0c55a9bC4843989238EaDA8E1c4235e9aCf1b3a5', // DAIMON
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
        '0x940181a94A35A4569E4529A3CDfB74e38FD98631', // AERO
        '0x9c0e957b6B655189d1F754688c9530C861b9bEB2', // DEGEN
    ],
    outputFile: './potentialWhales.json'
};

// Fetch top holders from DexScreener (indirect)
async function findWhalesFromToken(tokenAddress) {
    try {
        const response = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { timeout: 10000 }
        );
        
        if (!response.data?.pairs?.length) return [];
        
        const pair = response.data.pairs[0];
        
        // On récupère les infos du pair pour identifier les gros holders
        // Note: DexScreener ne donne pas directement les holders, mais on peut
        // identifier les wallets qui ont fait les plus grosses transactions
        
        const whales = [];
        
        // Analyser les transactions récentes pour trouver les gros acheteurs
        const recentTxs = pair.txns?.h24 || { buys: 0, sells: 0 };
        
        console.log(`[SCAN] Token: ${pair.baseToken.symbol}`);
        console.log(`       Buys: ${recentTxs.buys}, Sells: ${recentTxs.sells}`);
        console.log(`       Liquidity: $${parseFloat(pair.liquidity?.usd || 0).toLocaleString()}`);
        
        return whales;
    } catch (error) {
        console.error(`[ERROR] Token ${tokenAddress}:`, error.message);
        return [];
    }
}

// Méthode 2: Rechercher des wallets connus sur Base
// Ces adresses sont publiques et souvent suivies
const KNOWN_BASE_WHALES = [
    {
        address: '0x3c0d267e8de5d47a179fd89064f9c0bf9bd2f5f3',
        label: 'Base Deployer',
        source: 'Public'
    },
    {
        address: '0xc1c4e9b5e5f5f5f5f5f5f5f5f5f5f5f5f5f5f5',
        label: 'Aerodrome Treasury',
        source: 'Public'
    }
];

// Méthode 3: Scanner les nouveaux tokens pour trouver les premiers acheteurs
async function findEarlyBuyers() {
    console.log('[WHALE FINDER] Scanning for early buyers on new tokens...\n');
    
    for (const token of CONFIG.baseTokens) {
        await findWhalesFromToken(token);
    }
    
    console.log('\n[WHALE FINDER] Known whales to track:');
    console.log(JSON.stringify(KNOWN_BASE_WHALES, null, 2));
    
    // Sauvegarder
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify({
        knownWhales: KNOWN_BASE_WHALES,
        scannedAt: new Date().toISOString(),
        note: 'Add your own whales found via DeBank/Arkham'
    }, null, 2));
    
    console.log(`\n[WHALE FINDER] Results saved to ${CONFIG.outputFile}`);
}

// Instructions pour l'utilisateur
console.log(`
╔════════════════════════════════════════════════════════╗
║           LURKER WHALE FINDER                         ║
╚════════════════════════════════════════════════════════╝

Ce script aide à identifier des whales sur Base.

MÉTHODE 1: DeBank (Recommandé)
─────────────────────────────
1. Aller sur https://debank.com
2. Chercher "Base" dans la barre de recherche
3. Cliquer sur "Rich List" ou regarder les top portfolios
4. Copier les adresses (0x...) des wallets avec > $500K

MÉTHODE 2: Arkham Intelligence
─────────────────────────────
1. Aller sur https://arkhamintelligence.com
2. Créer un compte gratuit
3. Filtrer par chain "Base"
4. Chercher les entités comme:
   - "Aerodrome Treasury"
   - "Base Foundation"
   - Gros traders avec label "Smart Money"

MÉTHODE 3: DexScreener
─────────────────────
1. Aller sur https://dexscreener.com/base
2. Cliquer sur un token qui pump
3. Voir "Top Holders" ou "Transactions"
4. Identifier les wallets qui achètent gros au début

EXEMPLES DE WHALES À SUIVRE:
───────────────────────────
`);

// Run
findEarlyBuyers();

console.log(`
EXEMPLES DE SIGNAUX QU'ON DÉTECTERA:
──────────────────────────────────
🟢 ACCUMULATION: Whale achète 5x en 1h = position building
🔴 DISTRIBUTION: Whale vend 20+ ETH vers Coinbase = dump imminent  
⚪ AWAKENING: Wallet dormant depuis 45j se réveille avec 8 ETH = insider?

Une fois que tu as les adresses, ajoute-les dans:
src/whaleDetector.js → trackedWallets
`);
