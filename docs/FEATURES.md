# Features

Destiny Chronicle shows one calendar day across the years of Destiny 1 and Destiny 2, plus longer views of the same history. After a search, the page opens on today's date. You can change the date.

Text view is a switch, not its own tab. It replaces heavy charts and cards with plain lines. Account buttons stay on the page.

## Tabs

**Activities.** Games on the selected month and day, every year, grouped by game and then by year. Each row has the time, name, type, whether it was completed, and a report link. An anniversary banner lists Firsts whose calendar day matches, using the same one-clear-per-version record as the Firsts cards.

**Activity Heatmap.** How much was played on each day of the year. Filters can limit the year, the game, and the accounts. Choosing a day opens that date on Activities.

**Guardian Firsts.** The first completion of raids, dungeons, stories, and the earliest activity overall. Destiny 1 and Destiny 2 stay separate. A raid or dungeon card shows one date per difficulty, the earliest clear of that version. Solo on a dungeon means any character soloed that activity, not only the earliest game.

**Titles.** Seals and titles earned on the selected accounts.

**Activity Breakdown.** Share of time by activity type, for the selected accounts or for every loaded account. Chart by switches the grouping. Text view draws a text bar and a percentage instead of a chart.

**Played With.** Destiny 2 accounts only. One account is selected at a time. The list is people who shared games with that account: how many games, time together, first played, and last played. Those two dates open the report when the activity id is known. A name that cannot be shown is **Private Guardian**.

## Where the rows come from

The archive is the fast history at `<API_ROOT>`. Live Bungie fills games the archive does not have, including Destiny 2 games past the archive-complete line and Destiny 1 games outside the archived slice. The page merges them by game and instance id so the same game is not listed twice.

Coverage on an archive response is `full`, `partial`, or `absent`.

- **full** means a Destiny 2 list that was not cut off and does not sit on a known hole in the archive.
- **partial** means some games may be missing. Destiny 1 is always partial. The Destiny 1 archive slice is billion 1 only (instance ids 1 through 1 billion, late August through early December 2014). Newer Destiny 1 games come from Bungie when that fill is on.
- **absent** means the archive has no rows for that account. That does not mean the player never played.

## Played With rules

Shared games are counted from the archive index, then from Bungie for games past that index.

- Raids keep a roster of at most 18 rows (6 players, up to 3 characters each). Dungeons keep at most 9 rows (3 players, up to 3 characters).
- From 2021-02-26 through 2021-03-16 UTC, a known lobby glitch is allowed: raids up to 36 rows and dungeons up to 18.
- Larger raid or dungeon rosters are dropped. Those are treated as checkpoint-bot lobbies or broken reports.
- Games that include a known checkpoint bot are dropped.
- Social hub rows are not partners.
- The looked-up account is not listed as its own partner.
- **First played** is the earliest shared game that has a period. **Last played** is the latest. A row with no period still counts as a game together, but it does not move those dates.
