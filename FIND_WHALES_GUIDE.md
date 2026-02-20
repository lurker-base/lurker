# 🐋 Guide: Trouver des Whales sur Base

## Méthode 1: DeBank (Le plus simple)

### Étape 1: Aller sur DeBank
1. Ouvrir https://debank.com
2. Se connecter (gratuit, juste wallet ou email)

### Étape 2: Trouver les Rich Lists
1. Dans la barre de recherche, taper "Base"
2. Cliquer sur l'onglet "Rankings" ou "Rich List"
3. Filtrer par "Base" chain

### Étape 3: Identifier les whales
Chercher des wallets avec:
- **> $500K** de valeur totale
- **Activité récente** (dernières 24-48h)
- **Gros trades** sur des tokens récents

### Étape 4: Copier l'adresse
1. Cliquer sur le wallet
2. Copier l'adresse (0x...)
3. La coller dans `src/whaleDetector.js`

---

## Méthode 2: Arkham Intelligence (Le plus précis)

### Étape 1: Créer un compte
1. Aller sur https://arkhamintelligence.com
2. Sign up gratuit

### Étape 2: Filtrer par Base
1. Dans le dashboard, filtrer "Chain" → "Base"
2. Chercher les entités labellisées:
   - "Aerodrome Treasury"
   - "Base Foundation" 
   - "Smart Money"
   - "Market Maker"

### Étape 3: Explorer les transactions
1. Cliquer sur une entité
2. Voir "Portfolio" et "Transactions"
3. Si tu vois des gros mouvements récents → C'est un bon candidat

### Étape 4: Copier l'adresse
L'adresse est affichée en haut, copier le 0x...

---

## Méthode 3: DexScreener (Pour les early buyers)

### Étape 1: Trouver un token récent
1. Aller sur https://dexscreener.com/base
2. Chercher un token créé il y a < 24h avec volume

### Étape 2: Voir les transactions
1. Cliquer sur le token
2. Onglet "Transactions" ou "Holders"

### Étape 3: Identifier les gros acheteurs
Chercher les wallets qui ont:
- Acheté **tôt** (dans les 30 premières minutes)
- Mis **> 5 ETH** d'un coup
- Pas vendu depuis

---

## ⚠️ Quels whales éviter

| Type | Pourquoi éviter |
|------|-----------------|
| Exchanges (Coinbase, Binance) | Pas des vrais whales, juste des hot wallets |
| Contrats (staking, bridges) | Mouvements automatiques, pas des décisions |
| Dev wallets | Souvent verrouillés ou manipulent le marché |

**Focus sur**: Wallets EOA (externally owned accounts) avec activité de trading.

---

## 🎯 Exemple de whales idéaux

### Whale A: L'accumulateur
- Valeur: $2M+
- Pattern: Achète progressivement sur plusieurs jours
- Signaux: 🟢 Accumulation

### Whale B: Le smart money
- Valeur: $800K
- Pattern: Entre tôt sur les nouveaux tokens
- Signaux: ⚪ Awakening quand il bouge

### Whale C: Le distributeur
- Valeur: $1.5M
- Pattern: Vend souvent vers les tops
- Signaux: 🔴 Distribution = top signal

---

## 📝 Format pour LURKER

Une fois trouvés, ajoute dans `src/whaleDetector.js`:

```javascript
trackedWallets: [
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', // Whale Accumulateur
    '0x8ba17Cc6634C0532925a3b844Bc9e7595f0bEc', // Smart Money
    '0x9ca28Cc6634C0532925a3b844Bc9e7595f0bEd', // Distributeur
]
```

---

## 🔍 Outils complémentaires

| Outil | Lien | Usage |
|-------|------|-------|
| DeBank | debank.com | Portfolios, rich list |
| Arkham | arkhamintelligence.com | Entity tracking |
| Nansen | nansen.ai | Smart money (payant) |
| Zerion | zerion.io | Wallet explorer |
| Zapper | zapper.fi | Portfolio tracking |

---

## 💡 Astuce Pro

Commence par **3-5 whales maximum**. Trop = bruit. 

Choisis:
1. **1 accumulateur** (achète sur plusieurs jours)
2. **1 smart money** (entre tôt sur les bons tokens)
3. **1 distributeur** (vend aux tops)

Ça donne un bon panel de signaux !
