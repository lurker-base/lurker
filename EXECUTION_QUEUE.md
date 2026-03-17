# LURKER Execution Queue - 2026-03-17

## Track 1: Passive Income Recovery
**Status:** No passive income system found - .pi directory empty

**Recovered Tasks:**
- None found in memory/files - system not yet implemented

**Next Steps:**
- Awaiting Boss clarification on what passive-income tasks were requested

---

## Track 2: LURKER Product Gaps

### CRITICAL ISSUES (Data Staleness)
| Issue | Status | Data Age |
|-------|--------|----------|
| signals.json | STALE | Feb 24 (22 days old) |
| live_feed.json | EMPTY | count: 0 |
| premium_tracker | STALE | March 10 (7 days old) |

### HIGH IMPACT FIXES (Execution Queue)

#### 1. 🔴 Restart Scanner Pipeline
- Run `lurker-project/full_auto.sh` or `generateLiveFeed.js`
- Target: populate live_feed.json with fresh signals
- Priority: CRITICAL

#### 2. 🟠 Enable Quality Scorer in UI
- Badge grades (S/A/B/C/D/F) not showing in dashboard
- Need: integrate `signal_quality_scorer.py` output into live.html
- From SIGNAL_QUALITY_IMPROVEMENTS.md: scorer exists but not wired

#### 3. 🟡 Fix Badge/Category Display
- Add visual badges for: quality grade, risk level, source credibility
- Missing from: live.html, signals.html
- Need: map scores to visual badges

#### 4. 🟡 Add Vol/Liq Ratio Display
- Key pump indicator (0.5-10x sweet spot)
- Missing from current dashboard

#### 5. 🟢 Token Lifecycle Display Fix
- Many tokens show "UNKNOWN" symbol (was 117, likely still high)
- Need: resolve via DexScreener or skip

---

## Notes
- SIGNAL_QUALITY_IMPROVEMENTS.md documents fixes already made (precision 5%→16.7%)
- Quality scorer exists at `scripts/signal_quality_scorer.py` - needs integration
- Filters v2 at `filters_v2.json` (48h max age) - may not be active
