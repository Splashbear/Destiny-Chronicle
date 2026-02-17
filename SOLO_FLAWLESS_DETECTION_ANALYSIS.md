# Solo / Solo Flawless Detection

## Status

Solo and solo flawless dungeon firsts are detected using PGCR (Post Game Carnage Report) data: fireteam size and death counts. The logic lives in the activity-db and player-search flow that builds Guardian Firsts.

## References

- **Activity DB**: `getFirstCompletions()` and PGCR processing in `activity-db.service.ts`
- **UI**: Guardian Firsts section in player-search (D2 Dungeons, Rite of the Nine) shows solo and solo flawless links per variant where available

## Notes

- Some dungeon families (e.g. Equilibrium) may rely on manifest/family maps for correct grouping; hashes in `ACTIVITY_FAMILY_MAP` drive which activities count toward firsts.
- This file can be expanded with detailed analysis of edge cases or manifest coverage as needed.

*Last updated: January 2026*
