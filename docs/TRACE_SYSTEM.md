# LURKER Trace System — 3-Stage Lifecycle

## Principe
> Tout ce qui a été repéré par LURKER ne disparaît pas. Il change de statut.

## Les 3 États

### 1️⃣ SIGNAL (0-72h)
- **Rôle** : Alerte, naissance, observation immédiate
- **UI** : Pulse / Live
- **Action** : Peut disparaître du feed principal après 72h
- **Badge** : 📡 SIGNAL

### 2️⃣ TRACE ACTIVE (72h+)
- **Rôle** : Token repéré, encore actif
- **UI** : Onglet "Traces" / "Seen by LURKER"
- **Règle** : Reste visible tant qu'il y a de l'activité (>10 tx/24h)
- **Badge** : 👁️ SEEN 3D AGO — Still active
- **Valeur** : Les "tabouchas" — ceux qui deviennent forts lentement

### 3️⃣ ARCHIVE (7j+ inactif)
- **Rôle** : Plus d'activité significative
- **UI** : Caché par défaut
- **Action** : Accessible via recherche uniquement
- **Badge** : 📦 ARCHIVE

## Règles de Transition

```
DÉTECTION → SIGNAL (0-72h)
    ↓ (si toujours actif après 72h)
TRACE (tant qu'actif)
    ↓ (si inactif 7j)
ARCHIVE
```

## Badge Display

| État | Badge | Couleur | Info |
|------|-------|---------|------|
| SIGNAL | 📡 SIGNAL | 🟢 Vert | Frais |
| TRACE | 👁️ SEEN X AGO | 🟡 Orange | Toujours actif |
| ARCHIVE | 📦 ARCHIVE | ⚫ Gris | Inactif |

## Valeur Produit

- ✅ Garde la rareté du signal frais
- ✅ Construit une mémoire du marché
- ✅ Analyse : quels signaux faibles deviennent forts
- ✅ Différenciation : on montre l'histoire

## Message Clé

> *"LURKER ne dit pas seulement 'j'ai vu'. Il dit : 'J'ai vu tôt, et je continue à observer.'"

**On ne tue pas les surprises lentes.** 👁️
