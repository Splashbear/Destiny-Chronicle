"""
Extract field declarations (not methods/getters) from PlayerSearchComponent
into PlayerSearchState base class.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMP = ROOT / "src/app/components/player-search/player-search.component.ts"
STATE = ROOT / "src/app/components/player-search/player-search-state.ts"
HOST = ROOT / "src/app/components/player-search/player-search-host-adapters-mixin.ts"

lines = COMP.read_text(encoding="utf-8").splitlines(keepends=True)

class_idx = next(i for i, l in enumerate(lines) if l.startswith("export class PlayerSearchComponent"))
ctor_idx = next(i for i, l in enumerate(lines) if re.match(r"^\s+constructor\(", l))

# Walk props region; collect field blocks, leave methods/getters in place
field_ranges: list[tuple[int, int]] = []  # inclusive
i = class_idx + 1
while i < ctor_idx:
    line = lines[i]
    # skip blanks and pure comments (keep with following field if possible)
    if line.strip() == "" or line.strip().startswith("//") or line.strip().startswith("/*") or line.strip().startswith("*"):
        i += 1
        continue
    # getter / method / setter — skip whole block
    if re.match(r"^\s+(get |set |private |public |protected |async |readonly )?[a-zA-Z_][\w]*\s*\(", line) or re.match(
        r"^\s+get [a-zA-Z_]", line
    ):
        # method or getter
        if " get " in f" {line}" or line.lstrip().startswith("get "):
            brace = 0
            started = False
            j = i
            while j < ctor_idx:
                brace += lines[j].count("{") - lines[j].count("}")
                if "{" in lines[j]:
                    started = True
                if started and brace <= 0:
                    break
                j += 1
            i = j + 1
            continue
        if re.search(r"\)\s*(:\s*[^{]+)?\s*\{", line) or (
            i + 1 < len(lines) and "{" in lines[i + 1]
        ) or line.rstrip().endswith("{"):
            brace = 0
            started = False
            j = i
            while j < ctor_idx:
                brace += lines[j].count("{") - lines[j].count("}")
                if "{" in lines[j]:
                    started = True
                if started and brace <= 0:
                    break
                j += 1
            i = j + 1
            continue
        i += 1
        continue

    # Field: starts with optional modifier, name, then : or =
    if re.match(
        r"^\s+(private |public |protected |readonly )*[a-zA-Z_][\w]*(\??)?\s*(:|=)",
        line,
    ):
        start = i
        # include preceding doc comment / blank
        k = i - 1
        while k > class_idx and (lines[k].strip().startswith("*") or lines[k].strip().startswith("/*") or lines[k].strip().startswith("//") or lines[k].strip() == "" or lines[k].strip().endswith("*/")):
            if lines[k].strip().startswith("/**") or (lines[k].strip().startswith("//") and "Removed" not in lines[k]):
                start = k
                # continue for multi-line doc
                while start > class_idx + 1 and (
                    lines[start - 1].strip().startswith("*")
                    or lines[start - 1].strip().startswith("/**")
                    or lines[start - 1].strip() == ""
                ):
                    if lines[start - 1].strip().startswith("/**"):
                        start -= 1
                        break
                    start -= 1
                break
            if lines[k].strip().endswith("*/"):
                # walk up to /**
                t = k
                while t > class_idx and "/**" not in lines[t]:
                    t -= 1
                if "/**" in lines[t]:
                    start = t
                break
            k -= 1

        # find end of field (handle multi-line object/array init)
        brace = 0
        bracket = 0
        j = i
        while j < ctor_idx:
            brace += lines[j].count("{") - lines[j].count("}")
            bracket += lines[j].count("[") - lines[j].count("]")
            # field ends when braces balanced and line has ; or ends assignment
            if brace <= 0 and bracket <= 0 and (
                lines[j].rstrip().endswith(";")
                or lines[j].rstrip().endswith(",}")
                or (j > i and lines[j].strip() == "};")
                or (j > i and lines[j].strip() == "];")
            ):
                # also handle `= inject(...)` single line without needing more
                break
            # simple single-line field without braces already ended
            if j == i and brace == 0 and bracket == 0 and (
                ";" in lines[j] or lines[j].rstrip().endswith("= []") or "= new " in lines[j]
            ):
                break
            j += 1
            if j - i > 40:
                break
        end = j
        field_ranges.append((start, end))
        i = end + 1
        continue

    i += 1

# Merge overlapping
field_ranges.sort()
merged: list[tuple[int, int]] = []
for s, e in field_ranges:
    if merged and s <= merged[-1][1] + 1:
        merged[-1] = (merged[-1][0], max(merged[-1][1], e))
    else:
        merged.append((s, e))

print(f"field ranges: {len(merged)} lines={sum(e-s+1 for s,e in merged)}")

# Build state class body from extracted fields (make private -> protected where subclass needs)
blocks = []
for s, e in merged:
    block = "".join(lines[s : e + 1])
    # private fields stay private on base — subclass methods can access private of base? NO in TS.
    # Must use protected for private fields accessed by subclass methods.
    block = re.sub(r"^  private ", "  protected ", block, flags=re.M)
    blocks.append(block.rstrip() + "\n")

state = f"""// @ts-nocheck
/** Field state for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {{ inject }} from '@angular/core';
import {{ BehaviorSubject, Subject }} from 'rxjs';
import {{ type ChartConfiguration, type ChartData, type ChartType }} from 'chart.js';
import {{ TextViewService }} from '../../services/text-view.service';
import {{ environment }} from '../../../environments/environment';
import {{ ACTIVITY_TYPE_OPTIONS, ActivityTypeOption }} from '../../models/activity-types';
import {{ ActivityHistory }} from '../../models/activity-history.model';
import {{ ActivityWithMembership }} from '../../models/activity-with-membership.model';
import {{ PlayerSearchDisplay }} from '../../models/player-search-display.model';
import {{ ActivityFirstCompletion }} from '../../models/guardian-firsts.model';
import {{ FavoriteAccount }} from '../../services/activity-db.service';
import {{ LoadingProgress }} from '../../models/loading-progress.model';
import {{ AccountStats }} from '../../services/stats.service';
import {{ ActivityCountRow }} from '../../services/activity-breakdown.service';
import {{ AnniversaryFirst }} from '../anniversary-celebration-banner/anniversary-celebration-banner.component';
import {{ PlayedWithAccountChoice }} from '../../utils/played-with-accounts';
import {{ HeatmapCharacterLookup }} from '../../utils/heatmap-filters';
import {{
  type ActivitiesViewMode,
  type ActivitiesChronologicalSort,
}} from '../../utils/activities-view-prefs';
import {{ BREAKDOWN_CATEGORY_DISPLAY_NAMES, buildBreakdownPieChartOptions, buildBreakdownBarChartOptions }} from '../../utils/breakdown-chart';
import {{ AccountLoadingStatus }} from '../../models/account-loading-status.model';

interface ActivityCache {{
  activities: ActivityHistory[];
  timestamp: number;
  type: string;
  game: string;
}}

/**
 * Owns search-page instance fields so the component class stays orchestration-focused.
 */
export abstract class PlayerSearchState {{
{"".join(blocks)}}}
"""

STATE.write_text(state, encoding="utf-8")
print(f"wrote {STATE} lines={len(state.splitlines())}")

# Delete fields from component (reverse)
for s, e in sorted(merged, reverse=True):
    del lines[s : e + 1]

text = "".join(lines)
# Wire inheritance: HostAdapters extends State
host = HOST.read_text(encoding="utf-8")
if "PlayerSearchState" not in host:
    host = host.replace(
        "from './player-search-activity-history-host';",
        "from './player-search-activity-history-host';\nimport { PlayerSearchState } from './player-search-state';",
    )
    host = host.replace(
        "export abstract class PlayerSearchHostAdaptersMixin {",
        "export abstract class PlayerSearchHostAdaptersMixin extends PlayerSearchState {",
    )
    HOST.write_text(host, encoding="utf-8")

COMP.write_text(text, encoding="utf-8")
print("component lines", len(text.splitlines()))
