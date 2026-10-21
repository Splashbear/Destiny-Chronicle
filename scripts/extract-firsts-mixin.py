"""Move thin build_* firsts wrappers into PlayerSearchFirstsMixin."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMP = ROOT / "src/app/components/player-search/player-search.component.ts"
MIXIN = ROOT / "src/app/components/player-search/player-search-firsts-mixin.ts"

text = COMP.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)

import_re = re.compile(r"import \{([^}]+)\} from '\./player-search-firsts-methods';")
m = import_re.search(text)
if not m:
    raise SystemExit("no firsts import")
imports = [x.strip() for x in m.group(1).split(",") if x.strip()]

wrappers: list[tuple[int, int, str]] = []
i = 0
while i < len(lines):
    line = lines[i]
    # Compact: name(){ return build_...(this);
    mm2 = re.match(
        r"^  ((?:private |public |protected |async )*)([A-Za-z_][\w]*)(\([^;]*\))"
        r"(\s*:\s*[^{]+)?\s*\{\s*return (build_[A-Za-z_][\w]*)\(this",
        line,
    )
    if mm2:
        j = i
        while j < len(lines) and lines[j].count("{") <= lines[j].count("}") and j == i:
            # same-line close
            if line.rstrip().endswith("}") or line.rstrip().endswith("};"):
                wrappers.append((i, i, mm2.group(2)))
                break
            j += 1
        else:
            j = i
            brace = 0
            started = False
            while j < len(lines):
                brace += lines[j].count("{") - lines[j].count("}")
                if "{" in lines[j]:
                    started = True
                if started and brace <= 0:
                    wrappers.append((i, j, mm2.group(2)))
                    break
                j += 1
        i = wrappers[-1][1] + 1 if wrappers and wrappers[-1][0] == i else i + 1
        continue

    mm = re.match(
        r"^  ((?:private |public |protected |async )*)([A-Za-z_][\w]*)(\([^;]*\))"
        r"(\s*:\s*[^{]+)?\s*\{\s*$",
        line,
    )
    if not mm:
        i += 1
        continue
    start = i
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
    end = j
    body = "".join(lines[start + 1 : end]).strip()
    if (
        re.match(r"^return (build_[A-Za-z_][\w]*)\(this[\s\S]*;\s*$", body)
        and (end - start) <= 6
        and any(fn in body for fn in imports)
    ):
        wrappers.append((start, end, mm.group(2)))
        i = end + 1
        continue
    i += 1

# Deduplicate overlapping (keep first)
clean: list[tuple[int, int, str]] = []
seen_ranges: set[tuple[int, int]] = set()
for s, e, n in wrappers:
    if (s, e) in seen_ranges:
        continue
    seen_ranges.add((s, e))
    clean.append((s, e, n))
wrappers = clean

print(f"wrappers: {len(wrappers)}  lines: {sum(e - s + 1 for s, e, _ in wrappers)}")

# Build mixin from extracted method text; bump private -> public where needed for subclass... keep modifiers
method_blocks: list[str] = []
for s, e, _name in wrappers:
    block = "".join(lines[s : e + 1])
    # Keep as-is (private methods stay private on mixin; subclass can call them)
    method_blocks.append(block.rstrip() + "\n")

mixin = f"""// @ts-nocheck
/** Thin firsts-tab wrappers for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {{
  {", ".join(imports)}
}} from './player-search-firsts-methods';

/**
 * Mixin holding firsts display wrappers so the search component stays focused
 * on search/selection orchestration.
 */
export abstract class PlayerSearchFirstsMixin {{
{"".join(method_blocks)}}}
"""

MIXIN.write_text(mixin, encoding="utf-8")
print(f"wrote {MIXIN}")

# Remove wrappers from component (reverse order)
for s, e, _n in sorted(wrappers, key=lambda t: t[0], reverse=True):
    # also drop preceding blank / doc comment block attached to the method
    start = s
    # include JSDoc immediately above
    k = s - 1
    while k >= 0 and lines[k].strip() == "":
        k -= 1
    # walk up doc comment
    if k >= 0 and lines[k].rstrip().endswith("*/"):
        while k >= 0:
            if "/**" in lines[k] or lines[k].strip().startswith("/**"):
                start = k
                # also drop one blank above doc
                if start > 0 and lines[start - 1].strip() == "":
                    start -= 1
                break
            k -= 1
    elif k >= 0 and lines[k].strip().startswith("//"):
        while k >= 0 and (lines[k].strip().startswith("//") or lines[k].strip() == ""):
            start = k
            k -= 1
        if start > 0 and lines[start - 1].strip() == "":
            start -= 1
    else:
        if s > 0 and lines[s - 1].strip() == "":
            start = s - 1
    del lines[start : e + 1]

new_text = "".join(lines)
# Replace firsts import with mixin import
new_text = import_re.sub(
    "import { PlayerSearchFirstsMixin } from './player-search-firsts-mixin';",
    new_text,
    count=1,
)
# Extend mixin
new_text = new_text.replace(
    "export class PlayerSearchComponent implements OnInit, OnDestroy {",
    "export class PlayerSearchComponent extends PlayerSearchFirstsMixin implements OnInit, OnDestroy {",
)

COMP.write_text(new_text, encoding="utf-8")
print(f"component lines now: {len(new_text.splitlines())}")
