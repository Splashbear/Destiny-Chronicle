"""Extract breakdown UI methods into PlayerSearchBreakdownMixin."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMP = ROOT / "src/app/components/player-search/player-search.component.ts"
MIXIN = ROOT / "src/app/components/player-search/player-search-breakdown-mixin.ts"
FIRSTS = ROOT / "src/app/components/player-search/player-search-firsts-mixin.ts"

NAMES = {
    "hasBreakdownAccountFilter",
    "showBreakdownGameDropdown",
    "breakdownChartCategoryOptions",
    "breakdownChartData",
    "recomputeBreakdownChartData",
    "filteredActivityBreakdownSummaryCards",
    "setBreakdownChartType",
    "setBreakdownChartCategory",
    "setBreakdownChartGame",
    "activityBreakdownTotalTimeSeconds",
    "getBreakdownProfileTotalTimeSeconds",
    "logBreakdownDebug",
    "toggleBreakdownCardSelection",
    "isBreakdownCardSelected",
    "filteredActivityBreakdownGroups",
    "breakdownPlatformTabs",
    "getBreakdownMembershipIds",
    "onBreakdownAccountCardToggle",
    "getBreakdownSelectedGames",
    "activityBreakdownSummaryCards",
    "toggleBreakdownGroup",
    "showMoreBreakdownRows",
    "expandAllBreakdownGroups",
    "collapseAllBreakdownGroups",
    "visibleBreakdownRows",
    "breakdownGroupTotals",
    "onBreakdownTilesClick",
    "onBreakdownTilesKey",
    "onBreakdownRowsClick",
    "trackBreakdownGroup",
    "trackBreakdownRow",
    "trackBreakdownCard",
    "toggleBreakdownLastPlayedSort",
    "formatBreakdownLastPlayedDate",
    "formatBreakdownElapsedSince",
    "formatBreakdownLastPlayed",
    "openBreakdownPgcr",
    "noteActivitiesStored",
}

text = COMP.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)

# Find methods/getters by name
ranges: list[tuple[int, int, str]] = []
i = 0
while i < len(lines):
    line = lines[i]
    m = re.match(
        r"^  ((?:private |public |protected |async |readonly )*)(get )?([A-Za-z_][\w]*)",
        line,
    )
    if not m:
        i += 1
        continue
    name = m.group(3)
    is_get = bool(m.group(2))
    if name not in NAMES:
        i += 1
        continue
    # Must be getter or method (has ( or get )
    if not is_get and "(" not in line and not (
        i + 1 < len(lines) and "(" in lines[i + 1]
    ):
        i += 1
        continue
    start = i
    # include doc comment above
    k = i - 1
    while k >= 0 and lines[k].strip() == "":
        k -= 1
    if k >= 0 and lines[k].rstrip().endswith("*/"):
        while k >= 0:
            if "/**" in lines[k]:
                start = k
                if start > 0 and lines[start - 1].strip() == "":
                    start -= 1
                break
            k -= 1
    brace = 0
    started = False
    j = i
    while j < len(lines):
        brace += lines[j].count("{") - lines[j].count("}")
        if "{" in lines[j]:
            started = True
        if started and brace <= 0:
            break
        j += 1
    ranges.append((start, j, name))
    i = j + 1

# Deduplicate by name (keep first)
seen = set()
clean = []
for s, e, n in ranges:
    if n in seen:
        continue
    seen.add(n)
    clean.append((s, e, n))
print(f"extracted {len(clean)} methods, lines={sum(e-s+1 for s,e,_ in clean)}")

blocks = []
for s, e, _ in clean:
    block = "".join(lines[s : e + 1])
    block = re.sub(r"^  private ", "  protected ", block, flags=re.M)
    blocks.append(block.rstrip() + "\n")

mixin = f"""// @ts-nocheck
/** Breakdown-tab UI helpers for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {{ PlayerSearchFirstsMixin }} from './player-search-firsts-mixin';

export abstract class PlayerSearchBreakdownMixin extends PlayerSearchFirstsMixin {{
{"".join(blocks)}}}
"""
MIXIN.write_text(mixin, encoding="utf-8")

# Remove from component
for s, e, _ in sorted(clean, key=lambda t: t[0], reverse=True):
    del lines[s : e + 1]

new_text = "".join(lines)
new_text = new_text.replace(
    "import { PlayerSearchFirstsMixin } from './player-search-firsts-mixin';",
    "import { PlayerSearchBreakdownMixin } from './player-search-breakdown-mixin';",
)
new_text = new_text.replace(
    "export class PlayerSearchComponent extends PlayerSearchFirstsMixin implements OnInit, OnDestroy {",
    "export class PlayerSearchComponent extends PlayerSearchBreakdownMixin implements OnInit, OnDestroy {",
)
COMP.write_text(new_text, encoding="utf-8")
print("component lines", len(new_text.splitlines()))
print("wrote", MIXIN)
