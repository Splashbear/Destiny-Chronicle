import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import {
  getPantheonConfig,
  isLegacyPantheonActivity,
  isMotPantheonActivity,
  type PantheonEventId,
} from '../config/pantheon.config';

/** Filter firsts to one Pantheon event card. */
export function filterPantheonEventFirsts(
  list: ActivityFirstCompletion[],
  eventId: PantheonEventId
): ActivityFirstCompletion[] {
  const match = eventId === 'mot-pantheon' ? isMotPantheonActivity : isLegacyPantheonActivity;
  return list.filter(
    (f) => f.type === 'raid' && f.game === 'D2' && match(f.referenceId, f.name)
  );
}

/** Sort Pantheon firsts by config version order (newest-first index). */
export function sortPantheonEventRaids(
  list: ActivityFirstCompletion[],
  eventId: PantheonEventId
): ActivityFirstCompletion[] {
  const order = getPantheonConfig(eventId).versionSortOrder;
  if (!order.length) {
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return list.slice().sort((a, b) => {
    const ia = order.findIndex((p) => a.name.includes(p));
    const ib = order.findIndex((p) => b.name.includes(p));
    return (ib === -1 ? 999 : ib) - (ia === -1 ? 999 : ia);
  });
}

/** Sort grouped Pantheon cards by config order. */
export function sortPantheonEventGroupsByReleaseOrder(
  groups: Array<{ baseName: string; versions: ActivityFirstCompletion[] }>,
  eventId: PantheonEventId
): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  const order = getPantheonConfig(eventId).versionSortOrder;
  if (!order.length) {
    return [...groups].sort((a, b) => a.baseName.localeCompare(b.baseName));
  }
  return [...groups].sort((a, b) => {
    const ia = order.findIndex((p) => a.baseName.includes(p));
    const ib = order.findIndex((p) => b.baseName.includes(p));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

export type PantheonGroupedCard = {
  baseName: string;
  versions: ActivityFirstCompletion[];
  cardTitle: string;
};

/**
 * Build Pantheon event cards: filter → sort → group → order → attach cardTitle.
 */
export function buildGroupedPantheonEventCards(
  list: ActivityFirstCompletion[],
  eventId: PantheonEventId,
  groupByBaseName: (
    activities: ActivityFirstCompletion[]
  ) => Array<{ baseName: string; versions: ActivityFirstCompletion[] }>
): PantheonGroupedCard[] {
  const config = getPantheonConfig(eventId);
  const pantheonRaids = filterPantheonEventFirsts(list, eventId);
  if (!pantheonRaids.length) {
    return [];
  }
  const sorted = sortPantheonEventRaids(pantheonRaids, eventId);
  const groups = groupByBaseName(sorted);
  const ordered = sortPantheonEventGroupsByReleaseOrder(groups, eventId);
  return ordered.map((g) => ({ ...g, cardTitle: config.cardTitle }));
}
