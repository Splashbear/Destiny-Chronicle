# Automatic Raid/Dungeon Detection - Status: ✅ LIVE

## Overview

The codebase is now fully configured to **automatically detect and add new raids and dungeons** to the Guardian Firsts area, including all variants (Normal, Master, Epic, Contest, etc.).

## How It Works

### 1. **Automatic Type Detection**
- Uses Bungie's manifest data to detect raids and dungeons based on:
  - `activityTypeHash` (2043403989 for raids, 1375089621/608898761 for dungeons)
  - `activityModeTypes` (4 for raids, 82 for dungeons)
- **No hardcoded lists needed** - any activity with these properties is automatically detected

### 2. **Automatic Variant Grouping**
- Uses `DestinyActivityFamilyDefinition` from the manifest to group variants
- Automatically groups activities like:
  - "Desert Perpetual: Standard"
  - "Desert Perpetual: Epic"  
  - "Desert Perpetual: Contest"
  - "Desert Perpetual: Master"
- All variants are grouped under the base name "Desert Perpetual"

### 3. **Contest Mode Detection**
- Automatically detects Contest mode from:
  - Activity modifiers in manifest
  - Display name containing "contest" or "day one"
- Tracks Contest mode completions separately from normal completions

### 4. **Fallback System**
- If manifest isn't loaded yet, falls back to hardcoded maps
- If family data isn't available, uses name normalization
- Ensures the system works even if manifest data is temporarily unavailable

## Implementation Details

### Key Files Modified

1. **`src/app/services/destiny-manifest.service.ts`**
   - ✅ Loads `DestinyActivityFamilyDefinition` from manifest
   - ✅ `getActivityFamilyName()` - Automatic grouping
   - ✅ `isContestMode()` - Contest mode detection
   - ✅ `getActivityType()` - Automatic type detection from manifest

2. **`src/app/services/activity-db.service.ts`**
   - ✅ `getFirstCompletions()` - Uses automatic manifest-based grouping
   - ✅ Tracks Contest mode separately
   - ✅ Falls back to hardcoded maps if needed

3. **`src/app/components/player-search/player-search.component.ts`**
   - ✅ `getBaseActivityName()` - Handles any variant naming convention

## What This Means

### ✅ **Fully Automatic**
- New raids and dungeons are detected automatically when:
  - Players complete them
  - The manifest is loaded (which happens on app startup)
  - Activities match Bungie's standard type definitions

### ✅ **All Variants Supported**
- Works with any variant naming:
  - Standard, Normal, Master, Epic, Contest, Day One, etc.
  - No code changes needed for new variant names

### ✅ **Contest Mode Tracking**
- First Contest mode completions are tracked separately
- Shows up in Guardian Firsts as a distinct completion

### ✅ **Backward Compatible**
- Existing hardcoded maps still work as fallbacks
- D1 activities still use hardcoded maps (D1 manifest doesn't have family definitions)

## Testing

The system will automatically work when:
1. A player completes a new raid/dungeon
2. The app loads their activity history
3. The manifest is loaded (automatic on startup)

## Example: Desert Perpetual & Equilibrium

When these activities are released:
- ✅ They will be **automatically detected** as raid/dungeon
- ✅ All variants will be **automatically grouped** together
- ✅ Contest mode will be **automatically tracked** separately
- ✅ They will appear in **Guardian Firsts** without any code changes

## Status: 🟢 LIVE

The automatic detection system is **active and ready**. No additional configuration needed. The system will automatically handle:
- Desert Perpetual Raid (when released)
- Equilibrium Dungeon (when released)
- Any future raids/dungeons Bungie adds

---

**Note:** While the system is automatic, you can still manually add hashes to `ACTIVITY_FAMILY_MAP` for faster lookup or to ensure proper grouping before the manifest fully loads. However, this is **optional** - the automatic system will handle it.

