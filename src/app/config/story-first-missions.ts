/**
 * Destinypedia-aligned “first playable story mission” per release (D1 expansions + D2 campaigns + listed seasons).
 * Each anchor lists every known activity hash variant (Normal/Legendary/etc.); earliest completion wins.
 *
 * MISSING MANUAL HASHES:
 * - Season of the Worthy — wiki first mission “Into the Mindlab” has no reliable DestinyActivityDefinition
 *   name match in automated scans. Add `referenceIds` after verifying from a PGCR or light.gg.
 *
 * Season of the Chosen: GM and Customize variants are excluded so “first story” isn’t skewed by playlist-only rows.
 */
export interface StoryReleaseAnchor {
  /** Stable id for dedup (per game) */
  releaseId: string;
  /** Short label shown in UI (usually mission name) */
  label: string;
  /** e.g. expansion or season name */
  subtitle: string;
  game: 'D1' | 'D2';
  /** Lower = earlier in timeline */
  sortOrder: number;
  referenceIds: string[];
}

export const STORY_RELEASE_ANCHORS: StoryReleaseAnchor[] = [
  // --- Destiny 1 ---
  {
    releaseId: 'd1-base',
    label: 'A Guardian Rises',
    subtitle: 'Destiny',
    game: 'D1',
    sortOrder: 10,
    referenceIds: ['1846390409', '1856964953'],
  },
  {
    releaseId: 'd1-tdb',
    label: 'Fist of Crota',
    subtitle: 'The Dark Below',
    game: 'D1',
    sortOrder: 20,
    referenceIds: ['2701768038', '3473815980', '3750289192'],
  },
  {
    releaseId: 'd1-how',
    label: 'A Kell Rising',
    subtitle: 'House of Wolves',
    game: 'D1',
    sortOrder: 30,
    referenceIds: ['91984044', '550186563', '2931947534'],
  },
  {
    releaseId: 'd1-ttk',
    label: 'The Coming War',
    subtitle: 'The Taken King',
    game: 'D1',
    sortOrder: 40,
    referenceIds: ['853774317', '2356723745', '2369296916', '2938090611', '3612436612'],
  },
  {
    releaseId: 'd1-roi',
    label: 'King of the Mountain',
    subtitle: 'Rise of Iron',
    game: 'D1',
    sortOrder: 50,
    referenceIds: ['10551956', '18715720', '103493304', '279121234'],
  },

  // --- Destiny 2 (chronological) ---
  {
    releaseId: 'd2-red-war',
    label: 'Homecoming',
    subtitle: 'Red War',
    game: 'D2',
    sortOrder: 200,
    referenceIds: ['877831883', '1658347443', '3679941640', '4034557395'],
  },
  {
    releaseId: 'd2-coo',
    label: 'The Gateway',
    subtitle: 'Curse of Osiris',
    game: 'D2',
    sortOrder: 210,
    referenceIds: ['1057017675', '1175770231', '1512980468', '2351745587'],
  },
  {
    releaseId: 'd2-warmind',
    label: 'Ice and Shadow',
    subtitle: 'Warmind',
    game: 'D2',
    sortOrder: 220,
    referenceIds: ['1021495354', '1194986370', '1202325606', '1202325607', '1967025365'],
  },
  {
    releaseId: 'd2-forsaken',
    label: 'Last Call',
    subtitle: 'Forsaken',
    game: 'D2',
    sortOrder: 230,
    referenceIds: ['666063689'],
  },
  {
    releaseId: 'd2-forge',
    label: 'Scourge of the Armory',
    subtitle: 'Season of the Forge',
    game: 'D2',
    sortOrder: 240,
    referenceIds: ['2639045396'],
  },
  {
    releaseId: 'd2-shadowkeep',
    label: 'A Mysterious Disturbance',
    subtitle: 'Shadowkeep',
    game: 'D2',
    sortOrder: 250,
    referenceIds: ['845208861', '2306231495', '2446907856', '2603051550'],
  },
  {
    releaseId: 'd2-dawn',
    label: 'Corridors of Time Part 1',
    subtitle: 'Season of Dawn',
    game: 'D2',
    sortOrder: 255,
    referenceIds: ['2163254576'],
  },
  {
    releaseId: 'd2-arrivals',
    label: 'A Shadow Overhead',
    subtitle: 'Season of Arrivals',
    game: 'D2',
    sortOrder: 260,
    referenceIds: ['3083820154'],
  },
  {
    releaseId: 'd2-beyond-light',
    label: "Darkness's Doorstep",
    subtitle: 'Beyond Light',
    game: 'D2',
    sortOrder: 265,
    referenceIds: ['683832156', '2344594060', '3270200327', '3927228301'],
  },
  {
    releaseId: 'd2-hunt',
    label: 'Trail of the Hunted',
    subtitle: 'Season of the Hunt',
    game: 'D2',
    sortOrder: 270,
    referenceIds: ['524493250'],
  },
  {
    releaseId: 'd2-chosen',
    label: 'Battleground: Behemoth',
    subtitle: 'Season of the Chosen',
    game: 'D2',
    sortOrder: 275,
    referenceIds: [
      '773708363',
      '925348811',
      '1469356655',
      '1622574111',
      '1784138624',
      '2439292398',
      '2578924608',
      '3486548245',
    ],
  },
  {
    releaseId: 'd2-splicer',
    label: 'The Lost Splicer',
    subtitle: 'Season of the Splicer',
    game: 'D2',
    sortOrder: 280,
    referenceIds: ['2421123184'],
  },
  {
    releaseId: 'd2-lost',
    label: 'Mission Cocoon',
    subtitle: 'Season of the Lost',
    game: 'D2',
    sortOrder: 285,
    referenceIds: ['3204147305', '3863662327'],
  },
  {
    releaseId: 'd2-witch-queen',
    label: 'The Arrival',
    subtitle: 'The Witch Queen',
    game: 'D2',
    sortOrder: 290,
    referenceIds: ['3774730113'],
  },
  {
    releaseId: 'd2-haunted',
    label: 'Operation: Midas',
    subtitle: 'Season of the Haunted',
    game: 'D2',
    sortOrder: 295,
    referenceIds: ['3886047149', '4291087534'],
  },
  {
    releaseId: 'd2-plunder',
    label: 'Salvage and Salvation',
    subtitle: 'Season of Plunder',
    game: 'D2',
    sortOrder: 300,
    referenceIds: ['2533949950', '2563167541'],
  },
  {
    releaseId: 'd2-seraph',
    label: 'Hierarchy',
    subtitle: 'Season of the Seraph',
    game: 'D2',
    sortOrder: 305,
    referenceIds: ['758739851', '2229153515'],
  },
  {
    releaseId: 'd2-lightfall',
    label: 'First Contact',
    subtitle: 'Lightfall',
    game: 'D2',
    sortOrder: 310,
    referenceIds: ['2456777453', '3377887753'],
  },
  {
    releaseId: 'd2-defiance',
    label: 'Mission: Jailbreak',
    subtitle: 'Season of Defiance',
    game: 'D2',
    sortOrder: 315,
    referenceIds: ['3562636616'],
  },
  {
    releaseId: 'd2-deep',
    label: 'The Descent',
    subtitle: 'Season of the Deep',
    game: 'D2',
    sortOrder: 320,
    referenceIds: ['971509017', '2609103236'],
  },
  {
    releaseId: 'd2-witch',
    label: 'Way of the Witch',
    subtitle: 'Season of the Witch',
    game: 'D2',
    sortOrder: 325,
    referenceIds: ['2239891035', '3938185410'],
  },
  {
    releaseId: 'd2-wish',
    label: 'Final Wish',
    subtitle: 'Season of the Wish',
    game: 'D2',
    sortOrder: 330,
    referenceIds: ['403543190'],
  },
  {
    releaseId: 'd2-reclamation',
    label: 'Ash & Iron: Initialize',
    subtitle: 'Season of Reclamation',
    game: 'D2',
    sortOrder: 335,
    referenceIds: ['2988539647'],
  },
  {
    releaseId: 'd2-final-shape',
    label: 'Transmigration',
    subtitle: 'The Final Shape',
    game: 'D2',
    sortOrder: 340,
    referenceIds: ['596541314', '2169925752'],
  },
  {
    releaseId: 'd2-edge-of-fate',
    label: 'Mission: The Invitation',
    subtitle: 'The Edge of Fate',
    game: 'D2',
    sortOrder: 345,
    referenceIds: ['22513938'],
  },
  {
    releaseId: 'd2-renegades',
    label: 'Imperium',
    subtitle: 'Renegades',
    game: 'D2',
    sortOrder: 350,
    referenceIds: ['4161783794', '4236109078'],
  },
  {
    releaseId: 'd2-echoes',
    label: 'Mission: Meteoric',
    subtitle: 'Episode: Echoes',
    game: 'D2',
    sortOrder: 355,
    referenceIds: ['4153218846'],
  },
  {
    releaseId: 'd2-revenant',
    label: 'Na-Veskirisk',
    subtitle: 'Episode: Revenant',
    game: 'D2',
    sortOrder: 360,
    referenceIds: ['2583958979'],
  },
  {
    releaseId: 'd2-heresy',
    label: 'Espial',
    subtitle: 'Episode: Heresy',
    game: 'D2',
    sortOrder: 365,
    referenceIds: ['1133240260'],
  },
];

function d1UnsignedHashKey(h: string): string {
  const t = h.trim();
  if (!t) return t;
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  return (n >>> 0).toString();
}

/** referenceId -> anchor (first wins if misconfigured duplicates) */
export function buildStoryHashToAnchorMap(game: 'D1' | 'D2'): Map<string, StoryReleaseAnchor> {
  const m = new Map<string, StoryReleaseAnchor>();
  for (const a of STORY_RELEASE_ANCHORS) {
    if (a.game !== game) continue;
    for (const h of a.referenceIds) {
      if (!m.has(h)) m.set(h, a);
      if (game === 'D1') {
        const u = d1UnsignedHashKey(h);
        if (u && u !== h && !m.has(u)) m.set(u, a);
      }
    }
  }
  return m;
}

/**
 * Manifest activity name (lowercase) -> anchor. Used when D1 history uses a hash variant
 * not listed in referenceIds but the manifest still resolves to the canonical mission name.
 */
export function buildStoryLabelToAnchorMap(game: 'D1' | 'D2'): Map<string, StoryReleaseAnchor> {
  const m = new Map<string, StoryReleaseAnchor>();
  for (const a of STORY_RELEASE_ANCHORS) {
    if (a.game !== game) continue;
    const key = a.label.trim().toLowerCase();
    if (!m.has(key)) m.set(key, a);
  }
  return m;
}

export function getStoryAnchorSortOrder(releaseId: string | undefined): number {
  if (!releaseId) return 999999;
  const found = STORY_RELEASE_ANCHORS.find((a) => a.releaseId === releaseId);
  return found?.sortOrder ?? 999999;
}
