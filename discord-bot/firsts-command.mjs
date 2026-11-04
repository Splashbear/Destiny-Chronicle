// Thin /firsts command handler. It returns the reply payload and holds no Discord client or token.
import { buildFirstsForAccount } from './firsts.mjs';

export const firstsCommandDefinition = {
  name: 'firsts',
  description: 'First clear date and clears for each raid or dungeon',
  options: [
    {
      type: 3, name: 'kind', description: 'Raids, dungeons or Pantheon events', required: true,
      choices: [{ name: 'raids', value: 'raids' }, { name: 'dungeons', value: 'dungeons' }, { name: 'pantheon events', value: 'pantheon' }],
    },
    { type: 3, name: 'player', description: 'Linked player', required: false },
  ],
};

/** `accountLink` is the pinned account of the player to look up, e.g. "2-4611686018465122437-d2". */
export async function handleFirsts(accountLink, kind) {
  // Log the account looked up. Never log who asked.
  console.log(`[firsts] account=${accountLink} kind=${kind}`);
  try {
    const { card } = await buildFirstsForAccount(accountLink, kind);
    return { embeds: [card.embed] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[firsts] failed account=${accountLink} kind=${kind} ${msg}`);
    return {
      content: /raids only/.test(msg)
        ? 'Destiny 1 has raids only.'
        : 'Could not load that player right now. Try again in a moment.',
      ephemeral: true,
    };
  }
}
