/**
 * Map archive PgcrLite into the Bungie PGCR body shape prunePgcr / pgcr-lite expect.
 * Does not invent period or class; copies what the archive returned.
 */
export function pgcrLiteToBungieShape(lite: {
  game?: 'D1' | 'D2';
  _source?: string;
  activityDetails?: {
    period?: string | null;
    instanceId?: string;
    referenceId?: number;
    directorActivityHash?: number;
    mode?: number;
    isPrivate?: boolean;
  };
  entries?: unknown[];
}): Record<string, unknown> | null {
  if (!lite?.activityDetails?.instanceId || !Array.isArray(lite.entries)) {
    return null;
  }
  const period = lite.activityDetails.period ?? null;
  return {
    period,
    game: lite.game,
    _source: lite._source,
    activityDetails: {
      ...lite.activityDetails,
      period: period ?? undefined,
      instanceId: String(lite.activityDetails.instanceId),
    },
    entries: lite.entries,
  };
}
