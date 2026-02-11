# Activity Breakdown – Curated Lists (Draft)

Draft lists for name-based subcategorization. Source: **live test site data** (Jan 2025). Matching uses `baseName.toLowerCase().trim()` from manifest family name.

---

## Verified: What Appears Where (from test site)

| Mode | Section | Sample activities from test site |
|------|---------|----------------------------------|
| 2 | Story | Encore, Kell's Fall, Sever, Pirate Hideout, Battleground, Exotic missions (Whisper, Zero Hour, Presage, etc.), campaign missions |
| 3 | Strike | Battleground, Defiant/Heist/PsiOps Battleground, Presage, Whisper, Vox Obscura, Avalon, standard strikes |
| 16 | Nightfall | The Coil, Contest of Elders, Guardian Games, regular Nightfall strikes |
| 18 | AllStrikes | (same types as Strike) |
| 46 | ScoredNightfall | Lost Sectors (Legend/Master), Nightfall variants, Legendary Lost Sectors |
| 86 | Offensive | Battleground (Conduit, Core, Delve), The Coil, Kell's Grave, Ketchcrash, Tomb of Elders, etc. |

---

## 1. Battlegrounds

**Detection:** Pattern (no curated list needed)

```ts
baseName.toLowerCase().includes('battleground')
```

**Scope:** Pull from **both** mode 2 (Story) and mode 3/18/46/47 (Strike/Nightfall). Test site shows Battleground in Story and Strike.

**Base names seen in test data:**
- Battleground (Behemoth, Foothold, Hailstone, Oracle)
- Defiant Battleground (Cosmodrome, EDZ, Orbital Prison)
- Heist Battleground (Europa, Mars, Moon)
- Legend PsiOps Battleground, Legendary PsiOps Battleground
- Legend Heist Battleground
- PsiOps Battleground (Cosmodrome, EDZ, Moon)

**Also in Offensive (86):** Battleground Conduit/Core/Delve – already matched by pattern.

---

## 2. Story Strikes (Narrative-Focused Story Missions)

**Definition:** Story-mode (2) activities that are strike-like narrative missions (Pirate Hideout, Sever). **These appear under Story (2) in the API**, not Strike.

**Detection:** Pattern-based

```ts
baseName.toLowerCase().includes('pirate hideout')
// or
baseName.toLowerCase().startsWith('sever - ') || baseName.toLowerCase() === 'sever'
```

**Scope:** Only when mode is Story (2).

**Base names from test site (Story – D2):**
- Pirate Hideout (The Beast Tamer, The Blademasters, The Brute, The Bully, The Coward, The Lucent Brood, The Scrapworker, The Sharpshooter)
- Sever - Forgiveness
- Sever - Grief
- Sever - Rage
- Sever - Reconciliation
- Sever - Resolve
- Sever - Shame
- Shattered Realm (Debris of Dreams, Forest of Echoes, Ruins of Wrath)
- Override (Europa, Last City, Tangled Shore, The Moon)
- Operation (Archimedes, Diocles, Midas, Seraph's Shield, etc.)
- The Verdant Forest
- Haunted Forest (and Firewalled Verdant Forest, Firewalled Haunted Forest)

**Exclude:** "Severance", "The Severance" (triumphs/titles, not activities).

---

## 3. Exotic Story Missions

**Definition:** Story-mode (2) activities that are replayable exotic missions. **All of these appear under Story (2) in the test site.**

**Curated list (from test data):**

| baseName (lowercase) | Seen in test site |
|----------------------|-------------------|
| encore | Encore (Standard, Coda, Concerto, Overture variants) |
| kell's fall | Kell's Fall (Diffraction, Distortion, Reflection, Expert) |
| exotic mission "derealize" | Exotic mission "Derealize" |
| //node.ovrd.avalon// | Avalon (also as //node.ovrd.AVALON//) |
| a hollow coronation | ✓ |
| harbinger | ✓ |
| presage | Exotic Quest – Presage |
| starcrossed | Starcrossed (Normal), Starcrossed (Legend) |
| the whisper | The Whisper, The Whisper (Expert), The Whisper (Heroic) |
| zero hour | Zero Hour, Zero Hour (Heroic), Zero Hour (Standard) |
| vox obscura | Vox Obscura (Normal), Vox Obscura (Master) |
| operation: seraph's shield | Operation – Seraph's Shield (Legend, Normal, Standard) |
| seraph's shield | (alternate form) |

**Pattern option for Avalon:** `baseName.toLowerCase().includes('avalon')` or `baseName.toLowerCase().includes('node.ovrd')`

**Exclude:** Kell's Grave (different activity – Onslaught/seasonal, mode 86). Match `kell's fall` only, not `kell's grave`.

---

## 4. Seasonal Arena (Optional – New Section)

**Definition:** Seasonal/rotator activities that appear under various modes (Nightfall 16, Offensive 86, etc.) but should be grouped together.

**Curated list (from test site):**

| baseName (lowercase) | Mode in test site |
|----------------------|-------------------|
| the coil | Nightfall (16), Offensive (86) |
| contest of elders | Nightfall (16) |
| guardian games | Nightfall (16) |
| deep dives | Story (2) |
| enigma protocol | Story (2) |
| european aerial zone | Story (2) |
| tomb of elders | Offensive (86) |
| haunted altars of sorrow | Offensive (86) |
| salvage | Offensive (86) |
| the wellspring | Offensive (86) |
| ketchcrash | Offensive (86) |
| savathûn's spire | Offensive (86) |
| the nether | Nightfall (16) – episode activity |

**Note:** Some of these (Deep Dives, Enigma Protocol, The Coil) may warrant their own section vs. a catch-all "Seasonal Arena." The Coil appearing under Nightfall (16) is notable.

---

## 5. Edge Cases & Exclusions

| Do NOT match | Reason |
|--------------|--------|
| Severance | Triumph/title |
| The Severance | Title |
| Severed Salvation | Title |
| Severing | Triumph |
| Kell's Grave | Different activity (Onslaught, mode 86) – only match Kell's Fall |

---

## 6. Implementation Summary

| Section | Source modes | Detection |
|---------|--------------|-----------|
| Battlegrounds | 2, 3, 18, 46, 47, 86 | `baseName.includes('battleground')` |
| Story Strikes | 2 | `baseName.includes('pirate hideout')` OR `baseName.startsWith('sever - ')` |
| Exotic Story Missions | 2 | Curated list (encore, kell's fall, whisper, zero hour, etc.) |
| Seasonal Arena (optional) | 2, 16, 86 | Curated list (the coil, tomb of elders, etc.) |

**Order of checks:** Battlegrounds → Story Strikes → Exotic Story Missions → (Seasonal Arena). First match wins.
