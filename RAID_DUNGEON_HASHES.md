# Complete List of Raid and Dungeon Hashes

## Destiny 2 Raids

### Leviathan
- `89727599` - Normal
- `287649202` - Normal
- `417231112` - Normal
- `508802457` - Normal
- `757116822` - Normal
- `771164842` - Normal
- `1685065161` - Normal
- `1699948563` - Normal
- `1800508819` - Normal
- `1875726950` - Normal
- `2693136600` - Normal
- `2693136601` - Normal
- `2693136602` - Normal
- `2693136603` - Normal
- `2693136604` - Normal
- `2693136605` - Normal
- `3916343513` - Normal
- `4039317196` - Normal
- `2449714930` - Normal
- `3857338478` - Normal
- `3446541099` - Normal

### Leviathan, Eater of Worlds
- `2164432138` - Normal
- `809170886` - Prestige
- `3089205900` - Prestige

### Leviathan, Spire of Stars
- `119944200` - Normal
- `3004605630` - Normal
- `3213556450` - Prestige

### Crown of Sorrow
- `3333172150` - Normal
- `960175301` - Normal

### Last Wish
- `2122313384` - Standard
- `1661734046` - Normal

### Scourge of the Past
- `548750096` - Normal
- `2812525063` - Normal

### Garden of Salvation
- `1042180643` - Normal
- `2497200493` - Normal
- `3458480158` - Normal
- `3845997235` - Normal
- `2659723068` - Normal

### Deep Stone Crypt
- `910380154` - Normal
- `3976949817` - Normal

### Vault of Glass (D2)
- `3711931140` - Normal
- `1485585878` - Normal
- `1681562271` - Master
- `3022541210` - Normal
- `3881495763` - Standard
- `1441982566` - Standard (also listed as Vow variant in some maps)

### Vow of the Disciple
- `1441982566` - Standard
- `4156879541` - Legend
- `3889634515` - Master

### King's Fall (D2)
- `1374392663` - Standard
- `2897223272` - Normal
- `3257594522` - Master
- `2964135793` - Master
- `1063970578` - Expert
- `2381413762` - Standard (variant)

### Root of Nightmares
- `2381413764` - Normal
- `2918919505` - Master
- `2381413763` - Standard (variant)

### Crota's End (D2)
- `107319834` - Standard
- `4179289725` - Normal
- `1507509200` - Master
- `1566480315` - Standard
- `156253568` - Legend
- `3711931140` - Normal (variant)

### Salvation's Edge
- `1541433876` - Standard
- `940375169` - Standard
- `4129614942` - Master

### The Pantheon (legacy, 2024)
- `4169648176` - Oryx Exalted
- `4169648177` - Rhulk Indomitable
- `4169648179` - Atraks Sovereign
- `4169648182` - Nezarec Sublime

### Monument of Triumph Pantheon 2.0 (2026+)
- `2530656885` - Morgeth Surpassing
- `1516551982` - Calus Resplendent

### Desert Perpetual ⚠️ NEW - NEEDS TO BE ADDED
**Note:** This raid is not yet in the codebase. You'll need to fetch its hashes from the Bungie API manifest.

To find the hashes:
1. Query the Bungie API manifest for activities with `activityTypeHash: 2043403989` (raid type)
2. Search for activities with names containing "Desert Perpetual"
3. Add all variants (Standard, Epic, Contest, Master, etc.) to the `ACTIVITY_FAMILY_MAP`

---

## Destiny 2 Dungeons

### The Shattered Throne
- `2032534090` - Standard
- `1347078175` - Standard

### Pit of Heresy
- `1375089621` - Normal
- `785700673` - Master
- `785700678` - Expert
- `2559374368` - Legend
- `2559374374` - Master
- `2559374375` - Master
- `2582501063` - Standard

### Prophecy
- `1077850348` - Normal
- `3637651331` - Explorer
- `2961030534` - Eternity
- `3193152350` - Ultimatum
- `4148187374` - Master

### Grasp of Avarice
- `1112917203` - Standard
- `4078656646` - Master

### Duality
- `2823159265` - Standard
- `3012587626` - Master

### Spire of the Watcher
- `1262462921` - Standard
- `1225969316` - Explorer
- `4046934917` - Eternity
- `3339002067` - Ultimatum
- `2296818662` - Master
- `1801496203` - Master

### Ghosts of the Deep
- `313828469` - Normal
- `1094262727` - Explorer
- `32961030534` - Eternity (Note: This hash looks unusually long - may need verification)
- `124340010` - Ultimatum
- `2716998124` - Master

### Warlord's Ruin
- `2004855007` - Standard
- `2534833093` - Master

### Vesper's Host
- `300092127` - Normal
- `4293676253` - Master

### Sundered Doctrine
- `3834447244` - Normal
- `3521648250` - Master

### Equilibrium ⚠️ NEW - NEEDS TO BE ADDED
**Note:** This dungeon is not yet in the codebase. You'll need to fetch its hashes from the Bungie API manifest.

To find the hashes:
1. Query the Bungie API manifest for activities with `activityTypeHash: 1375089621` or `activityModeTypes: [82]` (dungeon type)
2. Search for activities with names containing "Equilibrium" or "Cosmic Equilibrium"
3. Add all variants (Standard, Epic, Master, etc.) to the `ACTIVITY_FAMILY_MAP`

---

## Destiny 1 Raids

### Vault of Glass
- `3801607287`
- `708693006`
- `2659248071`
- `2659248068`
- `2659248069`
- `856898338`
- `4038697181`
- `4` (mode-based reference)

### Crota's End
- `898834093`
- `112157962`
- `3879860662`
- `1836893116`
- `1836893119`
- `2324706853`
- `4000873610`
- `5` (mode-based reference)

### King's Fall
- `1733556769`
- `3534581229`
- `1016659723`
- `3978884648`
- `421023204`
- `6` (mode-based reference)

### Wrath of the Machine
- `2578867903`
- `4007500989`
- `1099433614`
- `1342567280`
- `260765522`
- `1387993552` - Hard (380)
- `430160982`
- `3356249023`
- `7` (mode-based reference)

---

## How to Find New Activity Hashes

Since the codebase now has automatic detection, new activities should be detected automatically. However, if you want to manually add them to the fallback maps:

1. **Use the Bungie API Manifest:**
   - Endpoint: `https://www.bungie.net/Platform/Destiny2/Manifest/`
   - Get the `DestinyActivityDefinition` path
   - Filter activities by:
     - Raids: `activityTypeHash === 2043403989` OR `activityModeTypes.includes(4)`
     - Dungeons: `activityTypeHash === 1375089621` OR `activityModeTypes.includes(82)`

2. **Search by Name:**
   - Look for activities with display names containing "Desert Perpetual" or "Equilibrium"

3. **Add to Codebase:**
   - Add all variants to `ACTIVITY_FAMILY_MAP` in `activity-db.service.ts`
   - Format: `'hash': 'Activity Name: Variant'`
   - Example: `'1234567890': 'Desert Perpetual: Epic'`

4. **Verify:**
   - The automatic detection should pick them up, but having them in the map ensures proper grouping even if manifest data is unavailable

---

## Summary

- **Total D2 Raids:** 13 (excluding Pantheon, which is a special raid lair playlist)
- **Total D2 Dungeons:** 11
- **Total D1 Raids:** 4
- **Missing from Codebase:** Desert Perpetual Raid, Equilibrium Dungeon

**Note:** With the automatic detection system now in place, these new activities should be detected automatically when players complete them, but adding them to the hardcoded maps ensures they're properly grouped and displayed even before the manifest is fully loaded.

