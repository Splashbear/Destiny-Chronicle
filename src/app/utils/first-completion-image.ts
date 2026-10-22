import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { baseActivityNameFromVersioned } from './date-activity-grouping';

/**
 * Resolve a PGCR / family image for a raid/dungeon variant group.
 * Prefers a cleared variant's first; falls back to ACTIVITY_FAMILY_MAP hashes.
 */
export function resolveFirstCompletionImageForRaid(opts: {
  raid: {
    baseName: string;
    variants: Array<{ hasClear: boolean; first?: ActivityFirstCompletion }>;
  };
  getFirstCompletionImage: (first: ActivityFirstCompletion) => any;
  activityFamilyMap?: Record<string, string>;
  d1FamilyMap?: Record<string, string>;
  getPgcrImage: (refId: string, isD1: boolean) => string | null | undefined;
  resolveAssetUrl: (path: string) => any;
}): any {
  const firstWithClear = opts.raid.variants.find((v) => v.hasClear);
  if (firstWithClear?.first) {
    return opts.getFirstCompletionImage(firstWithClear.first);
  }

  let refId: string | undefined;
  let isD1 = false;

  if (opts.activityFamilyMap) {
    for (const [hash, family] of Object.entries(opts.activityFamilyMap)) {
      if (baseActivityNameFromVersioned(family) === opts.raid.baseName) {
        refId = hash;
        break;
      }
    }
  }

  if (!refId && opts.d1FamilyMap) {
    for (const [hash, family] of Object.entries(opts.d1FamilyMap)) {
      if (baseActivityNameFromVersioned(family) === opts.raid.baseName) {
        refId = hash;
        isD1 = true;
        break;
      }
    }
  }

  if (refId) {
    const pgcrImage = opts.getPgcrImage(refId, isD1);
    if (pgcrImage) {
      return opts.resolveAssetUrl(pgcrImage);
    }
  }

  return null;
}
