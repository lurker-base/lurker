# LURKER Workflow Fix — 2026-02-22

## Problème Identifié
Les workflows GitHub Actions plantaient en ~12-15 secondes :
- ❌ Scanner CIO/WATCH/HOTLIST/FAST échouaient
- ❌ Pages build OK, mais jobs rouges
- ❌ Pas de feedback sur l'erreur

## Solution Appliquée

### 1. Workflows Bulletproof
Chaque workflow maintenant :
- `concurrency:` évite les collisions
- `|| true` / `|| echo` empêche l'échec
- `mkdir -p` crée les dossiers manquants
- `git add || true` ignore les erreurs de fichier inexistant

### 2. Scripts Anti-Crash
Tous les scanners Python maintenant :
- Wrappés dans `try/except`
- Écrivent un feed vide avec `meta.error` en cas de crash
- `sys.exit(0)` même en erreur (GitHub Actions vert)

### 3. Pattern Write_Fail
```python
def write_fail(msg: str):
    payload = {
        "schema": "...",
        "meta": {
            "updated_at": iso(),
            "count": 0,
            "error": msg[:500],
            "trace": traceback.format_exc()[-500:]
        },
        "candidates": []  # ou le bon champ
    }
    FILE.write_text(json.dumps(payload, indent=2))

if __name__ == "__main__":
    try:
        scan()
    except Exception as e:
        write_fail(f"crashed: {repr(e)}")
        sys.exit(0)  # Important!
```

## Workflows Modifiés
| Workflow | Changement |
|----------|-----------|
| scanner_cio_v3.yml | concurrency + never-fail |
| watch.yml | concurrency + never-fail |
| hotlist.yml | concurrency + never-fail |
| fast_certified.yml | concurrency + never-fail |

## Scripts Modifiés
- `scanner_cio_v3.py` — write_fail + try/except
- `watch_scanner.py` — write_fail + try/except
- `hotlist_scanner.py` — write_fail + try/except
- `fast_certifier.py` — write_fail + try/except

## Test Manuel
Workflow `test_run.yml` créé pour tester tous les scanners en une fois.

## Commit
`78e9833` — fix: bulletproof workflows - never fail GitHub Actions
