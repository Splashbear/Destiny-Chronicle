// Thin /otd command handler. It returns the reply payload and holds no Discord client or token.
// The bot runner (discord.js, DISCORD_TOKEN, command registration) is set up by the owner and calls this.
import { buildOtdForAccount } from './otd.mjs';

export const otdCommandDefinition = {
  name: 'otd',
  description: 'Everything you played on this day, across the years',
  options: [{ type: 3, name: 'player', description: 'Linked player', required: false }],
};

/** `accountLink` is the pinned account of the player to look up, e.g. "2-4611686018465122437-d2". */
export async function handleOtd(accountLink, { timeZone } = {}) {
  // Log the account looked up. Never log who asked.
  console.log(`[otd] account=${accountLink}`);
  try {
    const { card } = await buildOtdForAccount(accountLink, { timeZone });
    return { embeds: [card.embed] };
  } catch (err) {
    console.log(`[otd] failed account=${accountLink} ${err instanceof Error ? err.message : err}`);
    return { content: 'Could not load that player right now. Try again in a moment.', ephemeral: true };
  }
}
