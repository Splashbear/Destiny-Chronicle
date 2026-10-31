/** Human mode labels for Unknown-activity fallback (Bungie DestinyActivityModeType-ish). */
const MODE_LABELS: Record<number, string> = {
  2: 'Story',
  3: 'Strike',
  4: 'Raid',
  5: 'Crucible',
  6: 'Patrol',
  7: 'PvE',
  16: 'Nightfall',
  17: 'Heroic Nightfall',
  18: 'Strike',
  19: 'Iron Banner',
  37: 'Survival',
  38: 'Countdown',
  39: 'Trials of the Nine',
  46: 'Scored Nightfall Strikes',
  47: 'Scored Heroic Nightfall',
  48: 'Rumble',
  63: 'Gambit',
  75: 'Gambit Prime',
  82: 'Dungeon',
  84: 'Trials of Osiris',
};

export interface ActivityDisplayProperties {
  name?: string;
  description?: string;
}

export interface ActivityDefLike {
  displayProperties?: ActivityDisplayProperties;
}

/** Bungie PGCR style: description - name when both differ. */
export function formatActivityPgcrTitle(def: ActivityDefLike | null | undefined): string | null {
  const name = def?.displayProperties?.name?.trim();
  if (!name) return null;
  const description = def?.displayProperties?.description?.trim();
  if (description && description !== name) {
    return `${description} - ${name}`;
  }
  return name;
}

export function modeLabelForUnknown(mode: number | null | undefined): string {
  if (mode == null || Number.isNaN(Number(mode))) return 'unknown mode';
  const n = Number(mode);
  return MODE_LABELS[n] || `mode ${n}`;
}

/** e.g. Unknown activity (Scored Nightfall Strikes, Oct 2019) */
export function formatUnknownActivityTitle(
  mode: number | null | undefined,
  period: string | null | undefined
): string {
  const modePart = modeLabelForUnknown(mode);
  let when = 'unknown date';
  if (period) {
    const d = new Date(period);
    if (!Number.isNaN(d.getTime())) {
      when = d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
  }
  return `Unknown activity (${modePart}, ${when})`;
}
