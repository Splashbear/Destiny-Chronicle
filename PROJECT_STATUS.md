# Project Status Report

## Current State (January 2026)

### Overview
Destiny Chronicle is an activity history and tracking app for Destiny 1 and Destiny 2. Users search by Bungie Name or membership ID, view daily activity history, Guardian Firsts (first raid/dungeon completions and solo/solo flawless), and Titles & Seals. Account summary shows total time and total seals from Bungie data. Export to Excel/CSV is available for offline archiving.

### Recent Iteration: Titles Ordering & Export (Jan 2026)
- **Titles release order**: Titles sort by release date (newest first) using a chronological release-order map aligned with a canonical list. Same-date titles are ordered alphabetically.
- **Hash-based title ordering**: Moments of Triumph (MMX*) titles use completion-record hash → release rank mapping so they sort correctly regardless of API name format.
- **Export**: Multi-sheet export includes Export Info, Activities, Guardian Firsts, Titles & Seals, and Account Summary. Guardian Firsts and Activities export logic fixed; title count in summary matches Titles tab (Bungie-only, no third-party).

### Previous Iteration: Account Stats Calculation and Summary UI (May 2025)

### Overview (Account Stats)
That iteration introduced calculation and display of total account statistics: total time played, total activity time, total activity count, and per-type breakdown (Raid, Dungeon, Strike, PvP, Gambit, Other), with a loading indicator during calculation.

### Steps Implemented
1. **Data Aggregation**
   - For each selected player and their characters, fetch:
     - Total time played (from character profile)
     - Total activity count (from Bungie API per character)
     - All activities for each character (from local DB)
   - Sum totals across all characters for the account.
   - Group and sum activities by type (Raid, Dungeon, Strike, PvP, Gambit, Other).
2. **UI Integration**
   - Added a loading indicator (spinner) while stats are being calculated.
   - Displayed a summary section with:
     - Total time in Destiny (all characters)
     - Total time in activities (sum of durations)
     - Total activity count
     - Per-type activity times (total duration per activity type)
3. **Performance**
   - Stats calculation is triggered after all activities are loaded.
   - Uses async/await to avoid UI blocking.

### Benefits
- **User Experience:** Users see a clear, concise summary of their Destiny account activity.
- **Performance:** Efficient aggregation and display of stats after data is loaded.
- **Clarity:** Visual feedback during loading, and organized stats by type.

### Integration Points
- Stats calculation is triggered after all activities are loaded for selected players.
- The summary UI is displayed above the activity history section.
- The loading indicator is shown while stats are being calculated.

### Next Steps
- Optionally, add streak calculations and display.
- Allow filtering or drill-down by activity type.
- Add error handling for API failures during stats calculation.
- Integrate D1/D2 Raids and D2 Dungeons reference data (e.g. from spreadsheet) into Guardian Firsts view if desired.

### Recent Major Changes (Summary)
- **Titles ordering:** Chronological release-order map (name + hash-based for MMX*); "Newest First" and "Alphabetical" sort options.
- **Account summary:** Total time and total seals derived from Bungie character and title data; titles loaded in background so summary updates without visiting Titles tab.
- **Export:** Export Info sheet, expanded columns for Activities/Guardian Firsts/Titles, Account Summary aligned with UI; Guardian Firsts export fixed to use correct API shape.
- **Player search:** Chip-style input for multiple usernames; membership ID lookup; full-string-then-split search for names with commas.
- **Real-Time Loading Status Modal:** Progress tracking, platform/game icons, auto-hide.
- **Date Filtering and Timezone Handling:** Activities grouped by date using local timezone.
- **Guardian Firsts:** First completion per raid/dungeon (and variants), solo/solo flawless where applicable; PGCR linking.

---
*Last updated: January 2026* 