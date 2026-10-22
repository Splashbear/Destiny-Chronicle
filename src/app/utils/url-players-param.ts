/**
 * Parse ?players= / path players param (tolerates 1–2× URI encoding).
 * Returns the first valid non-empty JSON array, or null.
 */
export function parsePlayersParamFromUrl(playersParam: string): any[] | null {
  if (!playersParam) return null;
  const attempts = [
    playersParam,
    (() => {
      try {
        return decodeURIComponent(playersParam);
      } catch {
        return playersParam;
      }
    })(),
  ];
  try {
    attempts.push(decodeURIComponent(attempts[1]));
  } catch {
    /* ignore */
  }
  for (const candidate of attempts) {
    try {
      const playerData = JSON.parse(candidate);
      if (Array.isArray(playerData) && playerData.length > 0) {
        return playerData;
      }
    } catch {
      // try next encoding level
    }
  }
  return null;
}
