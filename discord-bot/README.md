# Discord cards (/otd, /titles, /firsts)

No Discord SDK or token lives here. Pieces:

- `src/app/utils/discord-otd-card.ts`: pure card builder (tested with `npm run test:utils`).
- `discord-bot/otd.mjs`: data pipeline (Destiny Chronicle API rows, then Bungie rows newer than the API's latest period for D2, Bungie definitions for names and icons). Needs `BUNGIE_API_KEY` in the environment (sent as a header only).
- `discord-bot/otd-command.mjs`: `handleOtd(accountLink)` returns `{ embeds: [...] }`. Logs the account looked up, never who asked.
- `src/app/utils/discord-titles-card.ts` + `discord-bot/titles.mjs`, `titles-command.mjs`: `/titles` (site title groups, Raid and Dungeon first, gilded counts, Missing list, `tab=seals` link). Titles are D2 only.
- `src/app/utils/discord-firsts-card.ts` + `discord-bot/firsts.mjs`, `firsts-command.mjs`: `/firsts raids|dungeons` (first-clear date and clears per family, newest first, D1 labelled, `tab=firsts` link). A date appears only when Bungie's own report (PGCR) for that clear confirmed it.
- `discord-bot/render-card.mjs`: renders a card JSON to a phone-width PNG (approximation of Discord's look).
- `discord-bot/verify-links.mjs`: spot-checks report links against Bungie.

Try it: `node discord-bot/titles.mjs 2-<membershipId>-d2`, `node discord-bot/firsts.mjs 2-<membershipId>-d2 raids`, or `node discord-bot/otd.mjs 2-<membershipId>-d2 --json card.json && CHROME=/usr/bin/google-chrome node discord-bot/render-card.mjs card.json card.png`

To run as a bot the owner must set `DISCORD_TOKEN` (and the application id), install `discord.js`, and register the commands from `otdCommandDefinition`, `titlesCommandDefinition` and `firstsCommandDefinition`.
Per-line icons in a real Discord embed need application emojis uploaded from the Bungie icons (`emojiFor` option); without them lines have no icon text.
