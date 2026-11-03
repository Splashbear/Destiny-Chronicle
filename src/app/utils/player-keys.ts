/** Stable player / favorite keys. All account keys are canonical: see `utils/account-key.ts`. */
import { AccountIdentity, canonicalAccountKey } from './account-key';

export function getPlayerKey(p: AccountIdentity & { membershipId: string }): string {
  return canonicalAccountKey(p);
}

/** Favorite `compositeKey`: the canonical account key. Older rows are rewritten on load. */
export function getFavoriteKey(p: AccountIdentity & { membershipId: string }): string {
  return canonicalAccountKey(p);
}
