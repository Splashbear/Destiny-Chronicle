// Thin /titles command handler. It returns the reply payload and holds no Discord client or token.
import { buildTitlesForAccount } from './titles.mjs';

export const titlesCommandDefinition = {
  name: 'titles',
  description: 'Titles earned and still missing, with gilded counts',
  options: [{ type: 3, name: 'player', description: 'Linked player', required: false }],
};

/** `accountLink` is the pinned account of the player to look up, e.g. "2-4611686018465122437-d2". */
export async function handleTitles(accountLink) {
  // Log the account looked up. Never log who asked.
  console.log(`[titles] account=${accountLink}`);
  try {
    const { card } = await buildTitlesForAccount(accountLink);
    return { embeds: [card.embed] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[titles] failed account=${accountLink} ${msg}`);
    return {
      content: /Destiny 2 only/.test(msg)
        ? 'Titles are for Destiny 2 accounts.'
        : 'Could not load that player right now. Try again in a moment.',
      ephemeral: true,
    };
  }
}
