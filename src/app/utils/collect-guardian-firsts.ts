import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { dedupeFirstCompletionsEarliest } from './guardian-firsts-dedupe';

/** Minimal IDB surface used to collect per-player Firsts. */
export interface GuardianFirstsDb {
  getFirstCompletions(
    membershipId: string,
    characterId: string,
    game: 'D1' | 'D2'
  ): Promise<{ firstCompletions: ActivityFirstCompletion[] }>;
  getStoryMilestoneFirstCompletionsForMembership(
    membershipId: string,
    game: 'D1' | 'D2'
  ): Promise<ActivityFirstCompletion[]>;
}

export interface CollectPlayerFirstsOptions {
  membershipId: string;
  characterIds: string[];
  game: 'D1' | 'D2';
  /** loadGuardianFirsts merges membership-level D1 story milestones; stats path does not. */
  includeD1MembershipStoryFirsts?: boolean;
  /** Stats path only keeps completed rows when deduping. */
  requireCompleted?: boolean;
  trace?: boolean;
}

/**
 * Per-character getFirstCompletions (+ optional D1 membership story merge), then earliest dedupe.
 * Shared by loadGuardianFirsts and calculateAccountStats (CODE_CLEANUP_SPEC).
 */
export async function collectPlayerFirstCompletions(
  db: GuardianFirstsDb,
  opts: CollectPlayerFirstsOptions
): Promise<ActivityFirstCompletion[]> {
  const allFirsts: ActivityFirstCompletion[] = [];

  for (const characterId of opts.characterIds) {
    const firsts = await db.getFirstCompletions(opts.membershipId, characterId, opts.game);
    if (opts.trace) {
      const story = firsts.firstCompletions.filter(x => x.type === 'story');
      console.log('[Firsts·trace]', 'ui:after_character_getFirstCompletions', {
        characterIdTail: characterId.slice(-8),
        totalRows: firsts.firstCompletions.length,
        storyCount: story.length,
        storyReleases: story.map(s => s.storyReleaseId),
      });
    }
    allFirsts.push(...firsts.firstCompletions);
  }

  if (opts.includeD1MembershipStoryFirsts && opts.game === 'D1' && opts.membershipId) {
    const membershipStoryFirsts = await db.getStoryMilestoneFirstCompletionsForMembership(
      opts.membershipId,
      'D1'
    );
    if (opts.trace) {
      console.log('[Firsts·trace]', 'ui:membership_story_firsts_merge', {
        membershipIdTail: opts.membershipId.slice(-8),
        storyCount: membershipStoryFirsts.length,
        storyReleases: membershipStoryFirsts.map(s => s.storyReleaseId),
      });
    }
    allFirsts.push(...membershipStoryFirsts);
  }

  return dedupeFirstCompletionsEarliest(allFirsts, {
    requireCompleted: opts.requireCompleted,
  });
}
