# $LURKER Tokenomics — Burn Strategy

## Analyse des comparables (Base ecosystem)

| Token | Burn % | Type | Performance |
|-------|--------|------|-------------|
| Daimon | 4.97% | Agent AI | Très agressif, supply réduit vite |
| Spawn | 2.16% | Meme/Social | Modéré, sustain la liquidité |
| Moyenne Base | 1-3% | Various | Standard ecosystem |

## Recommandation pour $LURKER

### Option 1 : Burn dynamique (recommandé)
**3% de base** + mécanisme d'ajustement selon l'activité du réseau :

```solidity
// Si volume de signaux élevé → burn augmente
// Si peu d'activité → burn diminue pour préserver la liquidité

Base: 3%
High activity (>100 signals/jour): 4%
Low activity (<10 signals/jour): 2%
```

### Option 2 : Burn fixe simple
**2.5%** sur chaque transaction
- Pas trop agressif (préserve liquidité)
- Assez pour créer de la pression haussière
- Aligné avec les standards Base

### Option 3 : Burn + Treasury hybride
**2% burn** + **1% treasury**
- 2% détruit (pression haussière)
- 1% pour développement futur
- Plus sustainable long terme

## Ma recommandation

**Option 3** — 2% burn + 1% treasury

Pourquoi :
1. **2% burn** = assez pour créer du FOMO, pas trop pour tuer la liquidité
2. **1% treasury** = fonds pour payer les coûts RPC, développement, marketing
3. **Aligné avec le business model** — LURKER génère des revenus (abonnements), donc besoin de treasury operational

## Détails techniques

```solidity
// Sur chaque transfert de $LURKER:
// - 2% → burn address (0x000...0000)
// - 1% → treasury wallet (multisig)
// - 97% → recipient

// Sur les paiements de services (en LURKER):
// - 80% → recipient (notre treasury)
// - 20% → burn
// C'est ce qu'on avait défini pour le business model
```

## Comparaison visuelle

```
Daimon (4.97%)    ████████████████████ Trop agressif ?
Spawn (2.16%)     █████████ Moderate
$LURKER (3%)      █████████████ Parfait milieu
$LURKER (2%+1%)   ████████ + ████ Burn + Treasury (optimal)
```

## Décision — VALIDÉ

**Boss choisit : 3% burn fixe**

- Simple à comprendre
- Milieu entre Daimon (4.97%) et Spawn (2.16%)
- Assez agressif pour créer du FOMO
- Pas trop pour préserver la liquidité

### Implémentation

```solidity
// Sur chaque transfert de $LURKER:
// - 3% → burn address (0x000...0000)
// - 97% → recipient

// Sur les paiements de services (en LURKER):
// - 80% → treasury
// - 20% → burn
// (comme défini précédemment)
```

**Total supply au launch :** 1,000,000,000 $LURKER
**Burn estimé année 1 :** ~15-20% selon volume
