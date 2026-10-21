from pathlib import Path
import re

p = Path("src/app/components/player-search/player-search.component.ts")
t = p.read_text(encoding="utf-8")

# ) { foo: ... }> {  ->  ): Array<{ foo: ... }> {
t2, n = re.subn(
    r"\)\s*\{\s*([a-zA-Z_][\s\S]*?\})\s*>\s*\{",
    r"): Array<{\1> {",
    t,
)
print(f"restored {n} Array return types")

t2 = t2.replace(
    "get firstsSectionFilterOptions(): {\n    return build_get_firstsSectionFilterOptions(this);\n  }",
    "get firstsSectionFilterOptions() {\n    return build_get_firstsSectionFilterOptions(this);\n  }",
)
t2 = t2.replace(
    "getFirstsPrimaryAndSecondary(): {\n    return build_getFirstsPrimaryAndSecondary(this);\n  }",
    "getFirstsPrimaryAndSecondary() {\n    return build_getFirstsPrimaryAndSecondary(this);\n  }",
)

p.write_text(t2, encoding="utf-8")

for i, line in enumerate(t2.splitlines(), 1):
    if re.search(r"\)\s*\{\s*[a-zA-Z_].*>\s*\{", line) or (
        re.search(r"\)\s*:\s*\{\s*$", line)
    ):
        print(f"still {i}: {line[:140]}")

# Fix firsts-methods
fp = Path("src/app/components/player-search/player-search-firsts-methods.ts")
ft = fp.read_text(encoding="utf-8")
ft = ft.replace(
    "export function build_get_firstsSectionFilterOptions(c: any)(): { value: string; label: string }[] {",
    "export function build_get_firstsSectionFilterOptions(c: any): { value: string; label: string }[] {",
)

imports = """import { getFirstClearElapsedLabel, formatFirstClearFireteam } from '../../utils/first-clear-elapsed';
import { aggregateGuardianFirstsFromLists } from '../../utils/guardian-firsts-dedupe';
import { resolveActivityPgcrImage } from '../../utils/activity-pgcr-image';
import { buildGroupedPantheonEventCards, filterPantheonEventFirsts } from '../../utils/pantheon-firsts';
import { earliestFirstsByName } from '../../utils/earliest-firsts-by-name';
import { getStoryAnchorSortOrder } from '../../config/story-first-missions';
import { isAnyPantheonActivity } from '../../config/pantheon.config';
import {
  earliestFirstEverForPlatformPlayers,
  earliestFirstsForPlatformPlayers,
} from '../../utils/aggregate-firsts-by-platform';
import { findDungeonSoloFirstForLabel } from '../../utils/dungeon-solo-lookup';
import { platformShortName } from '../../utils/platform-display';
import { baseActivityNameFromVersioned } from '../../utils/date-activity-grouping';
import { filterBySelectedAccountKeys, toggleInSet } from '../../utils/selection-set';
import { pickFirstEverFromFirsts } from '../../utils/first-ever-from-firsts';
import {
  buildD2VariantGroups,
  D2_DUNGEON_VARIANT_DEFS,
  D2_RAID_VARIANT_DEFS,
  isRiteOfTheNineDungeonName,
  normalizeDesertPerpetualName,
} from '../../utils/d2-activity-variants';
import {
  buildRiteOfTheNineCard,
  filterRiteOfTheNineFirsts,
  groupActivitiesByBaseName as groupFirstsByBaseName,
  groupRaidsByBaseName as groupFirstsRaidsByBaseName,
  groupRiteOfTheNineDungeonGroups,
  sortDungeonsByReleaseOrder,
  sortRaidsByReleaseOrder,
} from '../../utils/firsts-variant-grouping';
import {
  buildD1RaidVariantGroups,
  d1RaidVariantName,
  D1_RAID_VARIANT_DEFS_AGGREGATE,
  D1_RAID_VARIANT_DEFS_PER_PLAYER,
} from '../../utils/d1-raid-variants';
import { sortGroupsByReleaseOrder } from '../../config/raid-dungeon-release-order';

"""

if "from '../../utils/first-clear-elapsed'" not in ft:
    ft = ft.replace(
        "/* eslint-disable @typescript-eslint/no-explicit-any */\n\n",
        "/* eslint-disable @typescript-eslint/no-explicit-any */\n\n" + imports + "\n",
    )
fp.write_text(ft, encoding="utf-8")
print("firsts-methods imports ok")
