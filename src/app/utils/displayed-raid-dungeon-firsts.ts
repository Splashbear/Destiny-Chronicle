import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import type { FirstsVariantGroup } from './firsts-variant-grouping';

/**
 * Collect first clears shown on Firsts raid/dungeon variant cards (CODE_CLEANUP_SPEC).
 */
export function collectDisplayedRaidDungeonFirsts(
  variantGroups: FirstsVariantGroup[]
): ActivityFirstCompletion[] {
  const shown: ActivityFirstCompletion[] = [];
  for (const group of variantGroups) {
    for (const variant of group.variants || []) {
      if (variant.hasClear && variant.first) {
        shown.push(variant.first);
      }
    }
  }
  return shown;
}
