# 🎯 Workflow de Validation des Signaux

## Comment ça marche

### 1. Détection (Automatique - Clara)
- Scanners tournent toutes les 5 minutes
- Je surveille CIO/WATCH/HOTLIST
- Je sélectionne les meilleurs setups (score élevé + risque faible)

### 2. Proposition (Telegram)
Quand je trouve un bon candidat, je t'envoie :

```
🎯 CANDIDAT DÉTECTÉ

Token: 0xABC/WETH
Score: 95/100 | Risk: LOW  
Liq: $45k | Vol 5m: $12k | Age: 23m

💡 Setup proposé:
   Entry: $0.042
   Target: $0.065 (+55%)
   Stop: $0.035 (-17%)
   
   Rationale: Forte activité récente, liquidité stable,
              pas de dumping détecté.

✅ GO pour poster sur signals.html ?
```

### 3. Validation (Toi - Boss)
**Option A: Répondre directement**
- Réponds **"GO"** ou **"Oui"** sur Telegram
- Je publie automatiquement

**Option B: GitHub Actions (contrôle total)**
- Va sur : https://github.com/lurker-base/lurker/actions
- Clique **"Publish Validated Signal"** → **"Run workflow"**
- Remplis les champs :
  - `symbol`: 0xABC
  - `pair`: 0xABC/WETH (optionnel)
  - `entry`: 0.042
  - `target`: 0.065
  - `stop`: 0.035
  - `confidence`: 95
  - `rationale`: Forte activité récente, liquidité stable

### 4. Publication (Automatique)
- Le signal apparaît sur https://lurker-base.github.io/lurker/signals.html
- Format : Entry / Target / Stop
- Validé par : Boss
- Timestamp : auto

## ⚠️ Règles

| Paramètre | Valeur |
|-----------|--------|
| Max signaux/jour | 5 |
| Confiance min | 70/100 |
| Language | English only |
| Validation requise | Oui (GO explicite) |

## 🎭 Rôles

| Qui | Responsabilité |
|-----|----------------|
| **Clara** | Détection, pré-analyse, exécution technique |
| **Boss** | Validation finale, décision go/no-go |

**Tu as le dernier mot. Toujours.**
