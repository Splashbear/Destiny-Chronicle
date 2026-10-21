/**
 * Detect Bungie service-down / SystemDisabled and build user-visible notices (CODE_CLEANUP_SPEC).
 */
export function resolveBungieApiIssueNotices(
  game: 'D1' | 'D2' | 'both',
  error: unknown
): { d1ApiIssue?: string; d2ApiIssue?: string; apiAvailable: boolean } | null {
  const err = error as
    | {
        message?: string;
        status?: number;
        errorStatus?: string;
        ErrorStatus?: string;
      }
    | null;
  const message = String(err?.message ?? error ?? '');
  const statusText = String(err?.errorStatus ?? err?.ErrorStatus ?? '');
  const combined = `${message} ${statusText}`;
  const httpStatus = err?.status;

  const isSystemDisabled =
    /SystemDisabled|temporarily disabled|maintenance/i.test(combined);
  const isServiceDown =
    isSystemDisabled ||
    httpStatus === 503 ||
    httpStatus === 0 ||
    /DestinyServiceOffline|ServiceUnavailable|ThrottleExceeded/i.test(combined);

  if (!isServiceDown) {
    return null;
  }

  const result: {
    d1ApiIssue?: string;
    d2ApiIssue?: string;
    apiAvailable: boolean;
  } = { apiAvailable: false };

  if (game === 'D1' || game === 'both') {
    result.d1ApiIssue = isSystemDisabled
      ? 'Destiny 1 stats are temporarily disabled by Bungie (SystemDisabled). D1 activity history and character stats cannot be loaded until Bungie restores that service.'
      : 'Destiny 1 API is unreachable or returning errors. D1 activity history may be missing until Bungie recovers.';
  }
  if (game === 'D2' || game === 'both') {
    result.d2ApiIssue = isSystemDisabled
      ? 'Destiny 2 stats are temporarily disabled by Bungie (SystemDisabled). D2 activity history cannot be loaded until Bungie restores that service.'
      : 'Destiny 2 API is unreachable or returning errors. D2 activity history may be missing until Bungie recovers.';
  }
  return result;
}
