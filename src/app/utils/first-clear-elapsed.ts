import { lookupActivityReleaseDate } from './activity-release-lookup';
import { formatReleaseElapsed } from './release-elapsed';

/**
 * Days/months/years from the activity's release to this first clear (not "ago from today").
 */
export function getFirstClearElapsedLabel(
  first: {
    game?: string;
    completionDate?: string;
    period?: string;
    name?: string;
    storySubtitle?: string;
  } | null | undefined,
  opts?: {
    baseName?: string;
    resolveActivityName?: (first: any, isD1: boolean) => string;
  }
): string | null {
  if (!first) return null;
  const game: 'D1' | 'D2' = first.game === 'D1' ? 'D1' : 'D2';
  const when = first.completionDate || first.period;
  if (!when) return null;

  const names: string[] = [];
  const push = (v?: string) => {
    const t = String(v || '').trim();
    if (t && !names.includes(t)) names.push(t);
  };
  push(first.name);
  if (!first.name && opts?.resolveActivityName) {
    push(String(opts.resolveActivityName(first, game === 'D1') || ''));
  }
  push(first.storySubtitle);
  push(opts?.baseName);
  for (const n of [...names]) {
    const stripped = n.replace(/: .*$/, '').trim();
    if (stripped && stripped !== n) push(stripped);
  }

  for (const name of names) {
    const release = lookupActivityReleaseDate(name, game);
    if (release) return formatReleaseElapsed(release, when);
  }
  return null;
}

/** Short fireteam names from the first-clear PGCR, joined like the spreadsheet. */
export function formatFirstClearFireteam(first: {
  fireteamNames?: string[];
} | null | undefined): string | null {
  const names = first?.fireteamNames?.filter(Boolean);
  if (!names?.length) return null;
  return names.join(', ');
}
