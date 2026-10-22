import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { ActivityHistory } from '../models/activity-history.model';

export type PerCharacterFirstRow = {
  characterId: string;
  className?: string;
  platformIcon: string;
  first: ActivityHistory | ActivityFirstCompletion;
};

/** Earliest first-ever / raid / dungeon per character for one player. */
export function buildPerCharacterFirsts(opts: {
  type: 'first-ever' | 'raid' | 'dungeon';
  characterIds: string[];
  getActivitiesForCharacter: (characterId: string) => ActivityHistory[];
  firstsForPlayer: ActivityFirstCompletion[];
  playerGame: string;
  playerMembershipType: number;
  getPlatformIconUrl: (membershipType: number) => string;
}): PerCharacterFirstRow[] {
  const results: PerCharacterFirstRow[] = [];

  if (opts.type === 'first-ever') {
    for (const cid of opts.characterIds) {
      const list = opts.getActivitiesForCharacter(cid);
      if (!list.length) continue;
      const earliest = [...list].sort(
        (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime()
      )[0];
      results.push({
        characterId: cid,
        className: earliest.characterClass,
        platformIcon: opts.getPlatformIconUrl(opts.playerMembershipType),
        first: earliest,
      });
    }
  } else {
    const list = opts.firstsForPlayer.filter(
      (f) =>
        f.game === opts.playerGame &&
        (opts.type === 'raid' ? f.type === 'raid' : f.type === 'dungeon')
    );
    const perChar = new Map<string, ActivityFirstCompletion>();
    for (const f of list) {
      const existing = perChar.get(f.characterId);
      if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
        perChar.set(f.characterId, f);
      }
    }
    perChar.forEach((f) => {
      results.push({
        characterId: f.characterId,
        className: f.characterClass,
        platformIcon: opts.getPlatformIconUrl(f.membershipType ?? opts.playerMembershipType),
        first: f,
      });
    });
  }

  return results.sort(
    (a, b) => a.className?.localeCompare(b.className || '') || 0
  );
}
