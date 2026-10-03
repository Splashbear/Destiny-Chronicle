# W13 — Mode-0 extras not in Bungie ActivityHistory

Bot asked to resolve hashes that appear in the hubless archive list but not in Bungie's character ActivityHistory (~1.5%: Splashbear 242 / Kaiser 205 mode-0 rows overall; this note covers the five hashes Bot listed).

Source: local `DestinyActivityDefinition.json` + `:3002` counts with `includeSocialHubs=1`, then excluding W6 hubs.

## Verdict table

| Hash | Manifest name | Classification | Splash rows | Kaiser rows | Action |
|------|---------------|----------------|-------------|-------------|--------|
| 643631237 | Arena: Breach Executable: Standard | Real activity (Episode Echoes arena) | 12 | 15 | **Keep** |
| 1148989311 | Arena: Breach Executable (Expert) | Real activity | 16 | 1 | **Keep** |
| 390283971 | Guardian Games: Competitive Nightfall: Advanced | Real activity (GG NF playlist) | 12 | 14 | **Keep** |
| 1019949956 | Forge Ignition | Real activity (Black Armory forge) | 22 | 3 | **Keep** |
| 1202765834 | *(blank name / missing icon)* | **Social hub-like** — `directActivityModeType=40`, `activityModeHashes` includes Social `1589650888` | 5 | 10 | **Add to W6** |

## Notes
- Four of five are real matchmade/playlist activities that Bungie simply omits from `Stats/Activities` (same class of “archive more complete than history” as social hubs, but they are not social spaces).
- `1202765834` has empty `displayProperties.name` but is typed as Social (mode 40). Archive often stores it as `mode=0`; W6 mode-40 rule alone misses those rows — hash must be on the hub list.
- Bot’s ~735 Splashbear extras on **deleted characters** remain legitimate archive-only data (keep).
- Other mode-0 hashes exist beyond this list (e.g. Splash `4206916275`×14); out of W13 scope unless Splashear expands the list.

## Splashear decision needed
Confirm: add `1202765834` to hub filter (done in code pending approval); leave the four named activities in player lists.
