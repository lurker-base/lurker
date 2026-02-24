# LURKER Twitter - Checklist de Vérification

## ✅ Système en Place

### 1. Garde-fou Langue (English Only)
- Détection automatique accents français
- Détection mots français courants  
- **BLOCAGE** si français détecté

### 2. Vérification URLs
- Check HTTP 200 avant chaque tweet
- **BLOCAGE** si URL 404

### 3. Pre-flight Check Automatique
```
🔍 PRE-FLIGHT CHECK:
----------------------------------------
✅ Language: English only
✅ URL valid: github.com/... 
----------------------------------------
✅ ALL CHECKS PASSED
```

## 📋 À Vérifier AVANT Chaque Tweet

- [ ] Texte en anglais uniquement
- [ ] URLs GitHub accessibles (200)
- [ ] Pas de données sensibles
- [ ] Style LURKER respecté

## 🚫 Interdictions

- Jamais de français
- Jamais de lien mort
- Jamais "BUY/SELL"
- Jamais mention du token LURKER

---
Dernière vérif: 2026-02-24 - Tous systèmes OK
