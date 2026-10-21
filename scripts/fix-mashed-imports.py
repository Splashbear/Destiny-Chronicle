"""Unmash '; import {' chains and fix comment-swallowed imports."""
from pathlib import Path
import re

p = Path("src/app/components/player-search/player-search.component.ts")
t = p.read_text(encoding="utf-8")

t = t.replace(
    "// Removed new summary/list components to revert to previous display import {",
    "// Removed new summary/list components to revert to previous display\nimport {",
)

# Expand mashed same-line imports
t = re.sub(r"\} from ('[^']+'); import \{", r"} from \1;\nimport {", t)
t = re.sub(r'\} from ("[^"]+"); import \{', r"} from \1;\nimport {", t)

p.write_text(t, encoding="utf-8")
print("lines", len(t.splitlines()))
for i, line in enumerate(t.splitlines()):
    if "StatsService" in line or "DestinyLoader" in line or "previous display" in line:
        print(f"{i+1}: {line[:140]}")
