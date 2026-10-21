from pathlib import Path
import re

path = Path(r"src/app/components/player-search/player-search.component.ts")
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

hosts = []
i = 0
while i < len(lines):
    m = re.match(r"^(\s+)private (as[A-Za-z]+Host)\([^)]*\)[^{]*\{", lines[i])
    if m:
        name = m.group(2)
        start = i
        depth = 0
        started = False
        j = i
        while j < len(lines):
            depth += lines[j].count("{") - lines[j].count("}")
            if "{" in lines[j]:
                started = True
            if started and depth <= 0:
                hosts.append((name, start, j))
                i = j + 1
                break
            j += 1
        else:
            i += 1
    else:
        i += 1

print(f"Found {len(hosts)} hosts")
for name, s, e in hosts:
    print(f"  {name}: {s+1}-{e+1} ({e-s+1} lines)")

replacements = []
for name, s, e in hosts:
    body_lines = lines[s : e + 1]
    first = body_lines[0]
    first2 = re.sub(
        r"^\s+private (as[A-Za-z]+Host)\(",
        r"export function build_\1(c: any, ",
        first,
    )
    first2 = first2.replace("(c: any, )", "(c: any)")
    first2 = first2.replace("(c: any, ):", "(c: any):")
    converted = [first2]
    for bl in body_lines[1:]:
        converted.append(bl.replace("this.", "c."))
    dedented = []
    for cl in converted:
        if cl.startswith("  "):
            dedented.append(cl[2:])
        else:
            dedented.append(cl)
    replacements.append((name, s, e, "".join(dedented)))

host_path = Path(r"src/app/components/player-search/player-search-host-adapters.ts")
host_body = (
    "/** Host adapter factories extracted from PlayerSearchComponent (CODE_CLEANUP_SPEC). */\n"
    "/* eslint-disable @typescript-eslint/no-explicit-any */\n\n"
)
for name, s, e, text in replacements:
    host_body += text
    if not text.endswith("\n"):
        host_body += "\n"
    host_body += "\n"
host_path.write_text(host_body, encoding="utf-8")
print(f"Wrote {host_path} ({len(host_body)} chars)")

new_lines = list(lines)
for name, s, e, text in reversed(replacements):
    first = lines[s]
    m = re.match(
        r"^(\s+)private (as[A-Za-z]+Host)\(([^)]*)\)(:[^{]+)?\s*\{",
        first,
    )
    ret = (m.group(4) or "").rstrip() if m else ""
    indent = m.group(1) if m else "  "
    oneliner_lines = [
        f"{indent}private {name}(){ret} {{\n",
        f"{indent}  return build_{name}(this);\n",
        f"{indent}}}\n",
    ]
    new_lines[s : e + 1] = oneliner_lines

import_names = ", ".join(f"build_{n}" for n, _, _ in hosts)
import_line = f"import {{ {import_names} }} from './player-search-host-adapters';\n"
last_import = 0
for i, l in enumerate(new_lines):
    if l.startswith("import "):
        last_import = i
new_lines.insert(last_import + 1, import_line)

path.write_text("".join(new_lines), encoding="utf-8")
print(f"Component lines now: {len(new_lines)}")
