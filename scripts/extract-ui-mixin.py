"""Extract anniversary / loading / archive UI methods into PlayerSearchUiMixin."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMP = ROOT / "src/app/components/player-search/player-search.component.ts"
MIXIN = ROOT / "src/app/components/player-search/player-search-ui-mixin.ts"

NAMES = {
    # anniversary
    "loadDismissedAnniversaries",
    "saveDismissedAnniversaries",
    "getAnniversaryDismissKey",
    "checkAndShowAnniversaryBanner",
    "computeAnniversariesForSelectedDate",
    "displayedRaidDungeonFirsts",
    "onDismissAnniversaryBanner",
    "onNavigateToAnniversary",
    "onShareAnniversaryMemory",
    "closeShareMemoryCard",
    # store sync + summary getters
    "accountStatsPending",
    "displayTotalActivityCount",
    "displayActivityTimeSeconds",
    "syncActivityStore",
    "syncProfileStore",
    "totalTimeForSelectedDate",
    "formatSelectedDateLabel",
    # heatmap / offline getters
    "playedWithAccounts",
    "heatmapMembershipIds",
    "heatmapCharacterMeta",
    "isOfflineArchiveMode",
    "isArchiveSyncing",
    "showInstallAppHint",
    "offlineFrozenLabel",
    # loading / decrypting
    "decryptingCaption",
    "decryptingSubline",
    "decryptingYearHint",
    "ensureArchiveWatermark",
    "maybeSendLookupAnalytics",
    "updateAccountLoadingStatus",
    "removeAccountLoadingStatus",
    "markAccountLoadCancelled",
    "formatStatusDisplay",
    "closeLoadingModal",
    "getCompletedCount",
    "getOverallProgress",
    "getCurrentLoadingProfile",
    "continueInBackground",
    "scheduleBatchedUpdate",
    "performBatchedUpdate",
    # archive offline
    "hydrateFromOfflineArchive",
    "saveForOfflineOnDevice",
    "buildOfflineArchive",
    "buildHtmlArchiveReport",
    "updateOfflineArchive",
    "onArchiveFileSelected",
    "exitOfflineArchive",
    "dismissOfflineReadyBanner",
    "toggleArchiveBackupOptions",
    "triggerArchiveImport",
    "checkForArchiveUpdates",
    "pgcrPrefetchProgress$",
    "noteArchiveCoverage",
    "beginLookupAnalytics",
    "noteLookupDataSource",
}

text = COMP.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)

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
    if not is_get and "(" not in line and not (
        i + 1 < len(lines) and "(" in lines[i + 1]
    ):
        # getter without get keyword shouldn't match field
        if "$" not in name:
            i += 1
            continue
    start = i
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

seen = set()
clean = []
for s, e, n in ranges:
    if n in seen:
        continue
    seen.add(n)
    clean.append((s, e, n))
print(f"extracted {len(clean)} methods lines={sum(e-s+1 for s,e,_ in clean)}")
missing = NAMES - seen
if missing:
    print("missing:", sorted(missing))

blocks = []
for s, e, _ in clean:
    block = "".join(lines[s : e + 1])
    block = re.sub(r"^  private ", "  protected ", block, flags=re.M)
    blocks.append(block.rstrip() + "\n")

mixin = f"""// @ts-nocheck
/** Anniversary / loading / archive UI helpers (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {{ PlayerSearchBreakdownMixin }} from './player-search-breakdown-mixin';

export abstract class PlayerSearchUiMixin extends PlayerSearchBreakdownMixin {{
{"".join(blocks)}}}
"""
MIXIN.write_text(mixin, encoding="utf-8")

for s, e, _ in sorted(clean, key=lambda t: t[0], reverse=True):
    del lines[s : e + 1]

new_text = "".join(lines)
new_text = new_text.replace(
    "import { PlayerSearchBreakdownMixin } from './player-search-breakdown-mixin';",
    "import { PlayerSearchUiMixin } from './player-search-ui-mixin';",
)
new_text = new_text.replace(
    "export class PlayerSearchComponent extends PlayerSearchBreakdownMixin implements OnInit, OnDestroy {",
    "export class PlayerSearchComponent extends PlayerSearchUiMixin implements OnInit, OnDestroy {",
)
COMP.write_text(new_text, encoding="utf-8")
print("component lines", len(new_text.splitlines()))
