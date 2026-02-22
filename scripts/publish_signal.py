#!/usr/bin/env python3
"""
LURKER Signal Publisher
Posts validated signals to signals.html
Usage: python3 scripts/publish_signal.py --symbol TOKEN --entry 0.042 --target 0.065 --stop 0.035 --confidence 95 --rationale "..."
"""
import json
import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SIGNALS_FILE = Path(__file__).parent.parent / "docs" / "signals.html"

def create_signal_html(symbol, pair, entry, target, stop, confidence, rationale, validated_by="Boss"):
    """Generate HTML for a signal"""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    
    return f"""
                <div class="signal-item" data-confidence="{confidence}">
                    <div class="signal-header">
                        <span class="signal-symbol">{symbol}</span>
                        <span class="signal-pair">{pair}</span>
                        <span class="signal-confidence">{confidence}/100</span>
                    </div>
                    <div class="signal-setup">
                        <div class="setup-line">
                            <span class="setup-label">entry</span>
                            <span class="setup-value">{entry}</span>
                        </div>
                        <div class="setup-line">
                            <span class="setup-label">target</span>
                            <span class="setup-value target">{target}</span>
                        </div>
                        <div class="setup-line">
                            <span class="setup-label">stop</span>
                            <span class="setup-value stop">{stop}</span>
                        </div>
                    </div>
                    <div class="signal-rationale">
                        {rationale}
                    </div>
                    <div class="signal-meta">
                        <span class="signal-time">{now}</span>
                        <span class="signal-validator">✓ {validated_by}</span>
                    </div>
                </div>
"""

def publish_signal(args):
    """Add signal to signals.html"""
    if not SIGNALS_FILE.exists():
        print(f"❌ Error: {SIGNALS_FILE} not found")
        return False
    
    # Read current content
    with open(SIGNALS_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Generate signal HTML
    signal_html = create_signal_html(
        symbol=args.symbol,
        pair=args.pair or f"{args.symbol}/WETH",
        entry=args.entry,
        target=args.target,
        stop=args.stop,
        confidence=args.confidence,
        rationale=args.rationale,
        validated_by=args.validator
    )
    
    # Find the signal-list div and insert after the opening tag
    # Pattern to find: <div class="signal-list"> followed by content
    pattern = r'(<div class="signal-list">)(.*?)(</div>)'
    
    def replace_signal_list(match):
        opening = match.group(1)
        existing = match.group(2)
        closing = match.group(3)
        
        # Remove empty placeholder if present
        existing = re.sub(r'<div class="signal-empty[^"]*">.*?</div>', '', existing, flags=re.DOTALL)
        existing = re.sub(r'<p[^>]*>signals appear here.*?</p>', '', existing, flags=re.DOTALL)
        
        # Add new signal at the top
        return opening + signal_html + existing + closing
    
    new_content = re.sub(pattern, replace_signal_list, content, flags=re.DOTALL, count=1)
    
    # Write back
    with open(SIGNALS_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"✅ Signal published: {args.symbol}")
    print(f"   Entry: {args.entry} | Target: {args.target} | Stop: {args.stop}")
    print(f"   Confidence: {args.confidence}/100")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publish a validated signal")
    parser.add_argument("--symbol", required=True, help="Token symbol (e.g., 0xABC)")
    parser.add_argument("--pair", help="Trading pair (e.g., 0xABC/WETH)")
    parser.add_argument("--entry", required=True, help="Entry price")
    parser.add_argument("--target", required=True, help="Target price")
    parser.add_argument("--stop", required=True, help="Stop loss")
    parser.add_argument("--confidence", type=int, default=70, help="Confidence score (0-100)")
    parser.add_argument("--rationale", required=True, help="Why this signal")
    parser.add_argument("--validator", default="Boss", help="Who validated")
    
    args = parser.parse_args()
    success = publish_signal(args)
    sys.exit(0 if success else 1)
