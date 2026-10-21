"""Extract firsts-display methods into player-search-firsts-methods.ts."""
from pathlib import Path
import re

path = Path("src/app/components/player-search/player-search.component.ts")
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

# Method names to extract (firsts display / grouping / sort / variants)
FIRSTS_NAMES = {
    "rebuildAggregateGuardianFirstsFromMap",
    "getFirstsForPlayer",
    "getPlayerRaids",
    "getPlayerDungeons",
    "getPlayerPantheonRaids",
    "getPlayerRegularRaids",
    "getGroupedPantheonEvent",
    "getGroupedLegacyPantheonRaids",
    "getGroupedMotPantheonRaids",
    "getGroupedPantheonRaidsForPlayer",
    "getGroupedPantheonRaids",
    "getAggregateRaids",
    "getAggregateDungeons",
    "getAggregateStoryMilestones",
    "getPlayerStoryMilestones",
    "getGroupedRaids",
    "getGroupedDungeons",
    "groupActivitiesByBaseNamePublic",
    "getGroupedRegularRaids",
    "getGroupedRegularRaidsMulti",
    "getRegularRaidSingleCards",
    "getGroupedD1RaidsMulti",
    "getD1RaidSingleCards",
    "getAllD2RaidVariants",
    "getAllD2RaidVariantsForPlayer",
    "getFirstCompletionImageForRaid",
    "getAllD2DungeonVariants",
    "getAllD2DungeonVariantsForPlayer",
    "getAllD1RaidVariants",
    "getAllD1RaidVariantsForPlayer",
    "getPlayerD2RaidVariants",
    "getPlayerD2DungeonVariants",
    "getPlayerD1RaidVariants",
    "getPlayerPantheonVariants",
    "getD1RaidVariantName",
    "sortRaids",
    "sortDungeons",
    "groupActivitiesByBaseName",
    "getActivityVersion",
    "getGuardianFirstsForGame",
    "getGuardianFirstRaidsForGame",
    "getGuardianFirstDungeonsForGame",
    "hasGuardianFirstsForGame",
    "getAggregateRaidsByPlatform",
    "getAggregateDungeonsByPlatform",
    "getAggregateFirstEver",
    "getAggregateFirstEverByPlatform",
    "getFirstEverForPlayer",
    "getFirstCompletionImage",
    "getFirstClearFireteam",
    "getFirstClearElapsed",
    "getPerCharacterFirsts",
    "isPerCharacterExpanded",
    "togglePerCharacter",
    "onClickPerCharacterFirst",
    "getPlatformIconForFirst",
    "getPlatformNameForFirst",
    "getPlatformShortName",
    "formatDateSolo",
    "getDungeonSoloFirstForPlayer",
    "getRiteOfTheNineDungeons",
    "getRiteOfTheNineDungeonGroups",
    "getPlayerRiteOfTheNineVariants",
    "groupRaidsByBaseName",
    "getGroupedMotPantheon",
    "getPlayerMotPantheonVariants",
    "getGroupedLegacyPantheon",
    "getPlayerLegacyPantheonVariants",
    "syncActiveFirstsGameWithPlayers",
    "setActiveFirstsGame",
    "showFirstsSection",
    "get firstsSectionFilterOptions",  # getter - skip
    "getFirstsComparisonGroups",
    "getFirstsWeightForPlayer",
    "getFirstsPrimaryAndSecondary",
    "getFirstsFilteredPlayers",
    "onFirstsAccountCardToggle",
    "deriveFirstEverFromLoadedFirsts",
    "firstCompletionToActivityHistory",
    "computeFirstEverActivityForPlayer",
    "loadDungeonSoloFirsts",
}

# Find all methods
methods = []
i = 0
while i < len(lines):
    m = re.match(
        r"^(\s+)(?:async\s+)?(private\s+|public\s+)?(get\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(\([^)]*\))?\s*(?::\s*[^{]+)?\{",
        lines[i],
    )
    if m and m.group(4):
        name = m.group(4)
        is_get = bool(m.group(3))
        full_name = f"get {name}" if is_get else name
        start = i
        depth = 0
        started = False
        j = i
        while j < len(lines):
            depth += lines[j].count("{") - lines[j].count("}")
            if "{" in lines[j]:
                started = True
            if started and depth <= 0:
                methods.append((full_name, name, start, j, bool(m.group(2) and "private" in m.group(2)), is_get))
                i = j + 1
                break
            j += 1
        else:
            i += 1
    else:
        i += 1

to_extract = [x for x in methods if x[1] in FIRSTS_NAMES or x[0] in FIRSTS_NAMES]
print(f"Matched {len(to_extract)} methods to extract")
for full, name, s, e, priv, is_get in to_extract:
    print(f"  {full}: {s+1}-{e+1} ({e-s+1})")

# Also pick getters for firstsSectionFilterOptions
extra = [x for x in methods if x[1] == "firstsSectionFilterOptions"]
to_extract = to_extract + extra
# dedupe by start line
seen = set()
uniq = []
for x in to_extract:
    if x[2] not in seen:
        seen.add(x[2])
        uniq.append(x)
to_extract = sorted(uniq, key=lambda x: x[2])

replacements = []
out_funcs = []
for full, name, s, e, priv, is_get in to_extract:
    body = lines[s : e + 1]
    first = body[0]
    # Build export function
    if is_get:
        # get foo(): Type { -> export function build_get_foo(c: any): Type {
        fn = re.sub(
            r"^\s+get\s+([a-zA-Z_][a-zA-Z0-9_]*)",
            r"export function build_get_\1(c: any)",
            first,
        )
        fn = re.sub(r"\(c: any\)(\s*:[^{]+)?\s*\{", r"(c: any)\1 {", fn)
        call_name = f"build_get_{name}"
    else:
        fn = re.sub(
            r"^\s+(?:async\s+)?(?:private\s+|public\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(",
            r"export function build_\1(c: any, ",
            first,
        )
        fn = fn.replace("(c: any, )", "(c: any)")
        fn = fn.replace("(c: any, ):", "(c: any):")
        # async
        if "async " in first:
            fn = fn.replace("export function", "export async function")
        call_name = f"build_{name}"

    converted = [fn]
    for bl in body[1:]:
        converted.append(bl.replace("this.", "c."))
    dedented = []
    for cl in converted:
        if cl.startswith("  "):
            dedented.append(cl[2:])
        else:
            dedented.append(cl)
    text = "".join(dedented)
    out_funcs.append((call_name, text))
    replacements.append((name, s, e, is_get, priv, "async" in first, call_name, first))

host_path = Path("src/app/components/player-search/player-search-firsts-methods.ts")
header = """// @ts-nocheck
/** Firsts-tab display / grouping helpers extracted from PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

"""
host_path.write_text(header + "\n".join(t for _, t in out_funcs) + "\n", encoding="utf-8")
print(f"Wrote {host_path} ({sum(len(t) for _, t in out_funcs)} chars)")

# Replace in component with thin wrappers (bottom-up)
new_lines = list(lines)
for name, s, e, is_get, priv, is_async, call_name, first in reversed(replacements):
    indent_m = re.match(r"^(\s+)", first)
    indent = indent_m.group(1) if indent_m else "  "
    # Extract params from original
    pm = re.search(r"\(([^)]*)\)", first)
    params = pm.group(1) if pm else ""
    # Return type
    rm = re.search(r"\)\s*(:\s*[^{]+)?\s*\{", first)
    ret = (rm.group(1) or "").rstrip() if rm else ""
    vis = "private " if priv else ""
    async_kw = "async " if is_async else ""

    if is_get:
        wrapper = [
            f"{indent}get {name}(){ret} {{\n",
            f"{indent}  return {call_name}(this);\n",
            f"{indent}}}\n",
        ]
    else:
        # Strip types from params for call args
        args = []
        if params.strip():
            for part in params.split(","):
                part = part.strip()
                if not part:
                    continue
                # name: Type or name?: Type or ...name
                am = re.match(r"(\.\.\.)?(\w+)", part)
                if am:
                    args.append((am.group(1) or "") + am.group(2))
        arglist = ", ".join(args)
        call_args = f"this, {arglist}" if arglist else "this"
        wrapper = [
            f"{indent}{vis}{async_kw}{name}({params}){ret} {{\n",
            f"{indent}  return {call_name}({call_args});\n",
            f"{indent}}}\n",
        ]
    new_lines[s : e + 1] = wrapper

# Add import
import_names = ", ".join(cn for cn, _ in out_funcs)
import_line = f"import {{ {import_names} }} from './player-search-firsts-methods';\n"
# Insert after host-adapters import
inserted = False
for i, l in enumerate(new_lines):
    if "player-search-host-adapters" in l:
        # find end of that import
        j = i
        while j < len(new_lines) and not (
            new_lines[j].rstrip().endswith(";") and "from" in "".join(new_lines[i : j + 1])
        ):
            j += 1
        new_lines.insert(j + 1, import_line)
        inserted = True
        break
if not inserted:
    last_import = max(i for i, l in enumerate(new_lines) if l.startswith("import "))
    new_lines.insert(last_import + 1, import_line)

path.write_text("".join(new_lines), encoding="utf-8")
print(f"Component lines now: {len(new_lines)}")
