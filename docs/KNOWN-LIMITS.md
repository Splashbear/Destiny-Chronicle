# Known limits

- Destiny 1 in the archive is billion 1 only: instance ids 1 through 1 billion, about 30 August 2014 through 9 December 2014. Billions 2 through 8 are not in the archive. Later Destiny 1 games depend on live Bungie, and coverage stays partial.
- Destiny 1 is never marked `full`.
- Some rows in the compact index (instance ids from 10 billion to 16 billion) have no period. They still count as a shared game in Played With. They do not set First played or Last played, because those dates need a period.
- Played With on the site is Destiny 2 only. A Destiny 1-only account is not sent to the summary API.
- Played With drops raid rosters over 18 rows and dungeon rosters over 9, except during the February–March 2021 glitch window. A real raid that was stored with a larger roster will be missing from the partner list.
- Games that include a known checkpoint bot are left out of Played With.
- The anniversary banner celebrates one clear per raid or dungeon version, the one the Firsts card shows. It does not celebrate every activity hash of that raid.
- Text view does not draw the activity tables under Activity Breakdown.
- First played and last played open the report for that shared game. The archive API sends the instance id for each date.
- Social hubs are omitted from partner lists. They can still appear in the activity history when the site asks for them.
- Rate limits can delay a cold Played With build or a large history load. The page should say it is still building rather than show an empty list as if the player had no games.
