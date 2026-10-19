# Changelog

Newest first. One note per merged pull request. Older work is grouped by week.

## 2026-10-19

- **#53** The anniversary banner uses the same raid or dungeon clear the Firsts card shows, and it prints that full date.
- **#52** Text view covers Firsts, Played With, and Activity Breakdown. Firsts keep the game switch and the account. Reports open in the game that was actually played.
- **#51** A selected Activity Breakdown tile stays highlighted, and Chart by follows that type.
- **#50** Played With is one Destiny 2 account at a time, with a First played column next to Last played.

## 2026-10-18

- **#49** The live site reads Destiny 1 history from the archive, then still fills gaps from live Bungie.
- **#48** Destiny 1 archive reads were added behind a flag before they were turned on for the live site.
- **#47** Activity Breakdown uses less memory, and leaving the tab drops its DOM.
- **#46** Idle tabs drop their DOM, and activity cards are not rebuilt on every refresh.
- **#45** Activity Breakdown memory use was cut.
- **#44** The heatmap and saved-activity reads do fewer passes and do not duplicate rows.

## 2026-10-17

- **#43** Removing duplicate activities after a load no longer freezes the tab.
- **#42** On this Day has a text view.

## 2026-10-16

- **#41** Destiny 1 periods stay on the correct calendar day, and coverage can be marked complete.
- **#40** The API can read Destiny 1. It shipped off until the site flag was turned on.

## 2026-10-12 to 2026-10-15

- **#39** Flagged-report lookup accepts the combined rule and a sharp filter.
- **#38** Flagged Destiny 2 reports can be corrected when they are opened.
- **#37** Activity loading no longer stalls when the browser tab is in the background.
- **#36** The site is served at its public domain.
- **#35** Saved games are keyed by game plus instance id. The heatmap year list for Destiny 1 starts in 2014.
- **#34** A thin Destiny 1 archive row no longer hides the real Bungie history for that game.
- **#33** Played With can build one summary per account and fill games past the archive from Bungie.
- **#32** Played With renders again, with a timeout and real build progress.
- **#31** Played With is on for the live site, with a queued-build message for cold accounts.
- **#30** Usage events do not include account identifiers.
- **#29** The live site calls the public archive API.
- **#28** Sparrow Racing League races that Bungie marks as mode 32 are grouped under that name.
- **#27** Played With can read the smaller index for both instance-id ranges, plus a name table.
- **#26** Rate limits use the visitor behind the tunnel, with a per-visitor cap and a global cap.
- **#25** Usage logs, retention, a weekly summary, and a nightly health check.

## 2026-10-07 to 2026-10-11

- **#24** Played With summaries are built by a background queue.
- **#23** Played With reads the older index and the compact index.
- **#22** Activity lists include Destiny 1 mode 0 rows, drop duplicates, and Chart by filters again.
- **#21** Destiny 2 catch-up from Bungie stops at the archive-complete line instead of skipping holes.
- **#20** A staging server can read the slim archive index. Local use is logged.
- **#19** First Ever prefers the named story start (Homecoming or A Guardian Rises) when that is the earliest clear.
- **#18** Six saved accounts no longer drop, and the combined First Ever is the earliest across them.
- **#17** Launch prep for the home archive API, and a banner when the archive is the source.

## 2026-09

- **#16** Gap-fill archive reads, honest coverage, and Bungie catch-up, with those switches off.
- **#15** Destiny 2 reports are requested from the stats host.
- **#14** Destiny 1 and Destiny 2 reports are routed apart, and the period is taken from the report.
- **#13** Player history can be read from more than one archive tier.
- **#12** Cold start can load a player's activities from the archive.
- **#11** Report reads follow a watermark so new games stay on Bungie.
- **#10** Activity heatmap, report fallback, and an HTML archive report.
- **#9** Anniversary banner for Guardian Firsts on the selected calendar day.

## 2025

- **#6** Grasp of Avarice solo clears are detected.
- **#5** Activity names fall back to the full string when a short name is missing.
- **#4** Account loads run with a concurrency limit.
- **#3** Rebuild toward the day-by-day chronicle layout.
- **#2** Titles: seasonal names, holder icons, and order.
- **#1** Per-platform stats and platform labels on Guardian Firsts.
