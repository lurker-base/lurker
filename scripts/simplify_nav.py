#!/usr/bin/env python3
"""
Simplify navigation across all HTML files
Remove: the deep, origin, sightings, watch, become, for agents, pulse, signals, stats
Keep: lurker, token, live, proof, predictions, subscribe
"""
import re
from pathlib import Path

DOCS_DIR = Path("/data/.openclaw/workspace/lurker-project/docs")

# New simplified navigation
NEW_NAV = '''    <nav class="nav">
        <a href="index.html" class="nav-link{active_lurker}">lurker</a>
        <a href="token.html" class="nav-link{active_token}">token</a>
        <a href="live.html" class="nav-link{active_live}">live</a>
        <a href="proof.html" class="nav-link{active_proof}">proof</a>
        <a href="predictions.html" class="nav-link{active_predictions}">predictions</a>
        <a href="subscribe.html" class="nav-link{active_subscribe}">subscribe</a>
        <a href="https://x.com/LURKER_AI2026" class="nav-link" target="_blank"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-top:-2px"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
    </nav>'''

# Pattern to match old navigation
nav_pattern = re.compile(
    r'<nav class="nav">.*?</nav>',
    re.DOTALL
)

def get_active_class(filename):
    """Determine which nav item should be active"""
    mapping = {
        'index.html': 'active_lurker',
        'token.html': 'active_token',
        'live.html': 'active_live',
        'proof.html': 'active_proof',
        'predictions.html': 'active_predictions',
        'subscribe.html': 'active_subscribe',
    }
    return mapping.get(filename, '')

def process_file(filepath):
    """Replace navigation in a single file"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    filename = filepath.name
    active = get_active_class(filename)
    
    # Build new nav with correct active state
    new_nav = NEW_NAV
    for key in ['active_lurker', 'active_token', 'active_live', 'active_proof', 'active_predictions', 'active_subscribe']:
        if key == active:
            new_nav = new_nav.replace(f'{{{key}}}', ' active')
        else:
            new_nav = new_nav.replace(f'{{{key}}}', '')
    
    # Replace navigation
    new_content = nav_pattern.sub(new_nav, content)
    
    with open(filepath, 'w') as f:
        f.write(new_content)
    
    return True

def main():
    html_files = list(DOCS_DIR.glob("*.html"))
    
    for filepath in html_files:
        try:
            process_file(filepath)
            print(f"✓ {filepath.name}")
        except Exception as e:
            print(f"✗ {filepath.name}: {e}")
    
    print(f"\nUpdated {len(html_files)} files")

if __name__ == "__main__":
    main()
