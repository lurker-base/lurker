# Tokens de Référence — LURKER

## Exemple de Réussite à Détecter

### Daimon (DAIMON)
- **Adresse**: `0x0c55a9bC4843989238EaDA8E1c4235e9aCf1b3a5`
- **Lancé**: Récent (février 2026)
- **Performance**: Pump continu depuis le launch
- **Score LURKER estimé**: 85-95/100

**Pourquoi il aurait été détecté:**
- ✅ Liquidité montante rapidement ($50K+ → $500K+)
- ✅ Volume 24h élevé dès le début
- ✅ Transactions actives (buy/sell ratio sain)
- ✅ Source: Clanker launch

**Ce qu'on aurait vu:**
```
🟢 DAIMON détecté
Score: 92/100
Liquidité: $87K (en croissance)
Volume 24h: $245K
Age: 3h
→ Pump +45% dans les 6h suivantes
```

---

## Tokens Établis (Blacklist)

Ces tokens ne doivent PAS être signalés car ils existent depuis longtemps:

| Token | Adresse | Age |
|-------|---------|-----|
| WETH | 0x4200...0006 | Établi |
| USDC | 0x8335...9113 | Établi |
| cbETH | 0x2Ae3...Ec22 | Établi |
| DAI | 0x50c5...0Cb | Établi |
| AERO | 0x9401...8631 | Établi |
| DEGEN | 0x9c0e...bEB2 | Établi |
| BRETT | 0x4EAf...2F4c | Établi |
| DAIMON | 0x0c55...b3a5 | Maintenant établi |

---

## Stratégie de Détection

**Objectif**: Détecter les tokens comme Daimon à T+0 (dans la première heure)

**Signaux à surveiller:**
1. Liquidité qui entre rapidement ($10K → $50K en < 1h)
2. Volume anormal sur un nouveau pair
3. Transactions répétées (pas juste 1-2 txns)
4. Mint/Deploy récent + activité immédiate

**Filtres actuels:**
- Age: 0.5h - 24h
- Liquidité: > $5K
- Volume: > $5K/24h

**À améliorer:**
- [ ] Détecter les pumps rapides de liquidité
- [ ] Intégrer Clanker API directement
- [ ] Surveiller les factory events (nouveaux pairs)
