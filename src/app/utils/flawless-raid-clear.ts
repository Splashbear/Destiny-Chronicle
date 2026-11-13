import { flawlessFamilyMatches } from './flawless-family-match';

/** One fireteam-flawless raid/Pantheon clear used to light the Firsts banner. */
export interface FlawlessRaidClear {
  baseName: string;
  instanceId: string;
  period?: string;
  membershipId?: string;
}

/** Keep the earliest flawless clear per raid family base name. */
export function mergeEarliestFlawlessRaidClear(
  byBase: Map<string, FlawlessRaidClear>,
  clear: FlawlessRaidClear
): void {
  const baseName = String(clear.baseName || '').trim();
  const instanceId = String(clear.instanceId || '').trim();
  if (!baseName || !instanceId) return;
  const next: FlawlessRaidClear = {
    baseName,
    instanceId,
    period: clear.period ? String(clear.period) : undefined,
    membershipId: clear.membershipId ? String(clear.membershipId) : undefined,
  };
  const prev = byBase.get(baseName);
  if (!prev) {
    byBase.set(baseName, next);
    return;
  }
  const prevMs = prev.period ? Date.parse(prev.period) : Number.POSITIVE_INFINITY;
  const nextMs = next.period ? Date.parse(next.period) : Number.POSITIVE_INFINITY;
  if (nextMs < prevMs) {
    byBase.set(baseName, next);
  }
}

/** Find the earliest scanned flawless clear that matches a Firsts card label. */
export function findFlawlessRaidClearForLabel(
  cardLabel: string,
  clears: FlawlessRaidClear[]
): FlawlessRaidClear | null {
  if (!cardLabel || !clears?.length) return null;
  let best: FlawlessRaidClear | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const clear of clears) {
    if (!flawlessFamilyMatches(cardLabel, clear.baseName)) continue;
    const ms = clear.period ? Date.parse(clear.period) : Number.POSITIVE_INFINITY;
    if (!best || ms < bestMs) {
      best = clear;
      bestMs = ms;
    }
  }
  return best;
}
