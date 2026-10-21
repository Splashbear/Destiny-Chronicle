"""Move thin as*Host wrappers into PlayerSearchHostAdaptersMixin."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMP = ROOT / "src/app/components/player-search/player-search.component.ts"
MIXIN = ROOT / "src/app/components/player-search/player-search-host-adapters-mixin.ts"
FIRSTS = ROOT / "src/app/components/player-search/player-search-firsts-mixin.ts"

text = COMP.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)

# Collect build_as* and related activity-history helpers imported from host-adapters
import_re = re.compile(
    r"import \{\n?(?P<body>.*?)\n?\} from '\./player-search-host-adapters';",
    re.S,
)
m = import_re.search(text)
if not m:
    raise SystemExit("no host-adapters import")
imports = [x.strip() for x in m.group("body").replace("\n", " ").split(",") if x.strip()]
print("imports", len(imports))

wrappers: list[tuple[int, int, str]] = []
i = 0
while i < len(lines):
    line = lines[i]
    mm = re.match(
        r"^  ((?:private |public |protected |async )*)(as\w+Host)(\([^;]*\))"
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
    if re.match(r"^return build_as\w+\(this\);\s*$", body) and (end - start) <= 4:
        wrappers.append((start, end, mm.group(2)))
        i = end + 1
        continue
    i += 1

print(f"wrappers: {len(wrappers)} lines={sum(e-s+1 for s,e,_ in wrappers)}")

blocks = []
for s, e, _ in wrappers:
    block = "".join(lines[s : e + 1]).replace("  private ", "  protected ")
    blocks.append(block.rstrip() + "\n")

# Keep only build_as* imports needed by mixin (not activity-history helpers used elsewhere)
as_imports = [x for x in imports if x.startswith("build_as")]
mixin = f"""// @ts-nocheck
/** Thin host-adapter wrappers for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {{
  {", ".join(as_imports)}
}} from './player-search-host-adapters';

export abstract class PlayerSearchHostAdaptersMixin {{
{"".join(blocks)}}}
"""
MIXIN.write_text(mixin, encoding="utf-8")

# Remove from component
for s, e, _ in sorted(wrappers, key=lambda t: t[0], reverse=True):
    start = s
    if s > 0 and lines[s - 1].strip() == "":
        start = s - 1
    del lines[start : e + 1]

new_text = "".join(lines)
# Trim build_as* from host-adapters import in component (keep other build_ helpers)
remaining = [x for x in imports if not x.startswith("build_as")]
if remaining:
    new_import = (
        "import {\n  "
        + ",\n  ".join(remaining)
        + "\n} from './player-search-host-adapters';"
    )
else:
    new_import = ""
new_text = import_re.sub(new_import, new_text, count=1)
# Ensure blank line cleanup if empty
new_text = re.sub(r"\n{3,}", "\n\n", new_text)

COMP.write_text(new_text, encoding="utf-8")

# Chain: FirstsMixin extends HostAdaptersMixin
ft = FIRSTS.read_text(encoding="utf-8")
if "PlayerSearchHostAdaptersMixin" not in ft:
    ft = ft.replace(
        "from './player-search-firsts-methods';",
        "from './player-search-firsts-methods';\nimport { PlayerSearchHostAdaptersMixin } from './player-search-host-adapters-mixin';",
    )
    ft = ft.replace(
        "export abstract class PlayerSearchFirstsMixin {",
        "export abstract class PlayerSearchFirstsMixin extends PlayerSearchHostAdaptersMixin {",
    )
    FIRSTS.write_text(ft, encoding="utf-8")

print("component lines", len(new_text.splitlines()))
print("wrote", MIXIN)
