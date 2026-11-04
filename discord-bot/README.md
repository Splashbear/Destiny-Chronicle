# Discord cards (step 2: /otd)

No Discord SDK or token lives here. Pieces:

- `src/app/utils/discord-otd-card.ts`: pure card builder (tested with `npm run test:utils`).
- `discord-bot/otd.mjs`: data pipeline (Destiny Chronicle API rows, then Bungie rows newer than the API's latest period for D2, Bungie definitions for names and icons). Needs `BUNGIE_API_KEY` in the environment (sent as a header only).
- `discord-bot/otd-command.mjs`: `handleOtd(accountLink)` returns `{ embeds: [...] }`. Logs the account looked up, never who asked.
- `discord-bot/render-card.mjs`: renders a card JSON to a phone-width PNG (approximation of Discord's look).
- `discord-bot/verify-links.mjs`: spot-checks report links against Bungie.

Try it: `node discord-bot/otd.mjs 2-<membershipId>-d2 --json card.json && CHROME=/usr/bin/google-chrome node discord-bot/render-card.mjs card.json card.png`

To run as a bot the owner must set `DISCORD_TOKEN` (and the application id), install `discord.js`, and register the command from `otdCommandDefinition`.
Per-line icons in a real Discord embed need application emojis uploaded from the Bungie icons (`emojiFor` option); without them lines have no icon text.
