#!/bin/bash
# Script to simplify navigation across all HTML files

NAV_OLD='        <a href="index.html" class="nav-link">lurker</a>
        <a href="token.html" class="nav-link">token</a>
        <a href="deep.html" class="nav-link">the deep</a>
        <a href="origin.html" class="nav-link">origin</a>
        <a href="sightings.html" class="nav-link">sightings</a>
        <a href="proof.html" class="nav-link">proof</a>
        <a href="hall-of-fame.html" class="nav-link">hall of fame</a>
        <a href="watch.html" class="nav-link">watch</a>
        <a href="become.html" class="nav-link">become</a>
        <a href="live.html" class="nav-link">live</a>
        <a href="agents.html" class="nav-link">for agents</a>
        <a href="pulse.html" class="nav-link">pulse</a>
        <a href="signals.html" class="nav-link">signals</a>
        <a href="stats.html" class="nav-link">stats</a>'

NAV_NEW='        <a href="index.html" class="nav-link">lurker</a>
        <a href="token.html" class="nav-link">token</a>
        <a href="live.html" class="nav-link">live</a>
        <a href="proof.html" class="nav-link">proof</a>
        <a href="predictions.html" class="nav-link">predictions</a>
        <a href="subscribe.html" class="nav-link">subscribe</a>'

for file in /data/.openclaw/workspace/lurker-project/docs/*.html; do
    if [ -f "$file" ]; then
        # Replace navigation
        sed -i 's|<a href="index.html" class="nav-link">lurker</a>.*<a href="https://x.com/LURKER_AI2026"|<a href="index.html" class="nav-link">lurker</a>\n        <a href="token.html" class="nav-link">token</a>\n        <a href="live.html" class="nav-link">live</a>\n        <a href="proof.html" class="nav-link">proof</a>\n        <a href="predictions.html" class="nav-link">predictions</a>\n        <a href="subscribe.html" class="nav-link">subscribe</a>\n        <a href="https://x.com/LURKER_AI2026"|g' "$file"
        echo "Updated: $file"
    fi
done

echo "Navigation simplified!"
