/**
 * Parse the `players` query/path param from a permalink.
 *
 * Writers historically double-encoded (`encodeURIComponent` + `URLSearchParams`);
 * Angular/`URLSearchParams` already decode once on read. Try raw JSON first,
 * then one decode, then two — so both old and new links load.
 */
export function parsePlayersParam(raw: string | null | undefined): unknown[] | null {
  if (raw == null || raw === '') {
    return null;
  }

  const attempts = [raw];
  try {
    attempts.push(decodeURIComponent(raw));
  } catch {
    /* ignore */
  }
  try {
    attempts.push(decodeURIComponent(decodeURIComponent(raw)));
  } catch {
    /* ignore */
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      /* try next */
    }
  }

  return null;
}
