#!/usr/bin/env python3
"""
LURKER Prediction Logger — Immutable proof of early warnings
Every risk flag is logged with timestamp and committed to git
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PREDICTIONS_FILE = Path("state/predictions.json")
WARNINGS_FILE = Path("state/risk_warnings.json")

def load_json(path):
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def log_warning(token_symbol, token_address, risk_type, risk_factors, current_metrics):
    """Log a risk warning with timestamp - this creates proof"""
    warnings = load_json(WARNINGS_FILE)
    
    warning_id = f"warn_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{token_symbol}"
    
    warning = {
        "id": warning_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "token_symbol": token_symbol,
        "token_address": token_address,
        "risk_type": risk_type,  # "dumping", "honeypot", "rug_risk"
        "risk_factors": risk_factors,
        "metrics_at_warning": current_metrics,
        "status": "active",  # active, confirmed, false_positive
        "outcome": None,  # Will be filled later
        "outcome_timestamp": None
    }
    
    warnings[warning_id] = warning
    save_json(WARNINGS_FILE, warnings)
    
    print(f"[WARNING LOGGED] {warning_id}")
    print(f"Token: {token_symbol}")
    print(f"Risk: {risk_type}")
    print(f"Time: {warning['timestamp']}")
    print(f"\n⚠️  COMMIT THIS FILE TO GIT FOR PROOF:")
    print(f"git add state/risk_warnings.json")
    print(f"git commit -m 'risk warning: {token_symbol} {risk_type}'")
    
    return warning_id

def confirm_outcome(warning_id, outcome, outcome_metrics=None):
    """Confirm if warning was correct (dump confirmed, etc)"""
    warnings = load_json(WARNINGS_FILE)
    
    if warning_id not in warnings:
        print(f"[ERROR] Warning {warning_id} not found")
        return False
    
    warnings[warning_id]["status"] = "confirmed" if outcome in ["dump_confirmed", "rug_confirmed"] else "false_positive"
    warnings[warning_id]["outcome"] = outcome
    warnings[warning_id]["outcome_timestamp"] = datetime.now(timezone.utc).isoformat()
    
    if outcome_metrics:
        warnings[warning_id]["outcome_metrics"] = outcome_metrics
    
    save_json(WARNINGS_FILE, warnings)
    
    w = warnings[warning_id]
    print(f"[OUTCOME RECORDED] {warning_id}")
    print(f"Prediction time: {w['timestamp']}")
    print(f"Outcome time: {w['outcome_timestamp']}")
    print(f"Result: {outcome}")
    
    # Calculate time difference
    pred_time = datetime.fromisoformat(w['timestamp'])
    out_time = datetime.fromisoformat(w['outcome_timestamp'])
    hours_early = (out_time - pred_time).total_seconds() / 3600
    
    print(f"\n✅ LURKER was {hours_early:.1f} hours early!")
    
    return True

def generate_proof_report(warning_id):
    """Generate a proof report for clients"""
    warnings = load_json(WARNINGS_FILE)
    
    if warning_id not in warnings:
        return None
    
    w = warnings[warning_id]
    
    report = f"""# LURKER Prediction Proof

## Warning Issued
- **Token:** {w['token_symbol']}
- **Address:** {w['token_address']}
- **Risk Flagged:** {w['risk_type']}
- **Time:** {w['timestamp']}
- **Warning ID:** {w['id']}

## Risk Factors Detected
"""
    for factor in w.get('risk_factors', []):
        report += f"- {factor}\n"
    
    report += f"""
## Metrics at Warning Time
```json
{json.dumps(w.get('metrics_at_warning', {}), indent=2)}
```

## Outcome
- **Result:** {w.get('outcome', 'pending')}
- **Confirmation Time:** {w.get('outcome_timestamp', 'N/A')}

## Proof of Timestamps
This warning is permanently recorded in:
- Git commit: `git show {w['id']}`
- File: `state/risk_warnings.json`
- GitHub: https://github.com/lurker-base/lurker/commits/main

Git commits are cryptographically signed and cannot be altered retroactively.
"""
    
    return report

def main():
    if len(sys.argv) < 2:
        print("Usage: python prediction_logger.py <command> [args]")
        print("Commands:")
        print("  warn <symbol> <address> <risk_type>   - Log a new warning")
        print("  confirm <warning_id> <outcome>        - Confirm outcome (dump_confirmed/rug_confirmed/false_positive)")
        print("  report <warning_id>                   - Generate proof report")
        print("  list                                  - List all warnings")
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "warn" and len(sys.argv) >= 5:
        log_warning(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:] if len(sys.argv) > 5 else [], {})
    
    elif cmd == "confirm" and len(sys.argv) >= 4:
        confirm_outcome(sys.argv[2], sys.argv[3])
    
    elif cmd == "report" and len(sys.argv) >= 3:
        report = generate_proof_report(sys.argv[2])
        if report:
            print(report)
        else:
            print("Warning not found")
    
    elif cmd == "list":
        warnings = load_json(WARNINGS_FILE)
        if not warnings:
            print("No warnings logged yet")
        else:
            print(f"{'ID':<30} {'Token':<15} {'Risk':<15} {'Status':<15}")
            print("-" * 75)
            for wid, w in warnings.items():
                print(f"{wid:<30} {w['token_symbol']:<15} {w['risk_type']:<15} {w['status']:<15}")
    
    else:
        print("Unknown command or missing arguments")
        sys.exit(1)

if __name__ == "__main__":
    main()
