# The Gilded Chamber

A hidden-role policy game for 5 to 10 players: on phones. Sister app to
[Mafia Night](https://mafia-app.hatethespurs.workers.dev) and [Quest Night](https://quest-night.hatethespurs.workers.dev):
same stack, same components, its own game, names, wording and art.

Live: https://council-night.hatethespurs.workers.dev

## How it plays (the classic rules, unchanged)
- **Loyalists** (the majority) against **the Syndicate** and their hidden leader, **the Boss**.
  Teams: 5 = 3/1+B, 6 = 4/1+B, 7 = 4/2+B, 8 = 5/2+B, 9 = 5/3+B, 10 = 6/3+B. The Syndicate know each other and the
  Boss; the Boss knows the Syndicate only at 5–6 players.
- The **Speaker** moves left each round and nominates a **Chancellor**; everyone alive votes Aye/Nay (strict majority).
  Term limits: last elected Chancellor always; last elected Speaker too unless 5 or fewer are alive.
- **Unrest** (election tracker): the third failed government in a row enacts the top policy with no power, resets the
  tracker and clears term limits. Any enacted policy resets the tracker.
- **Session:** the Speaker draws 3, discards 1, the Chancellor discards 1 and enacts 1. Deck: 6 Reform + 11 Decree,
  reshuffled with the discards when fewer than 3 remain.
- **Powers** on Decrees 1–5: 5–6 players `– – peek execute execute`; 7–8 `– inquiry snap-election execute execute`;
  9–10 `inquiry inquiry snap-election execute execute`. Inquiry shows the party (the Boss shows Syndicate), never
  the same player twice. A snap election returns the gavel to the left of the caller afterwards.
- **Veto** from 5 Decrees: the Chancellor proposes, the Speaker agrees (both discarded, Unrest +1) or refuses
  (the Chancellor must enact).
- **Wins:** Loyalists with 5 Reforms or by executing the Boss. Syndicate with 6 Decrees, or by electing the
  Boss as Chancellor once 3 Decrees are down (any other Chancellor elected then is confirmed “not the Boss”).

## Extras (all off or optional by default)
- Play modes: Phones mode; Hybrid (roles / votes / policy tiles each “at the table” or “in the app”); Host-only mode, with
  the host’s phone as board, tracker and moderator. The host only ever enters public facts.
- House rules: rebalanced 6/7/9, exile instead of execution, anonymous votes, no-claims mode, moderator sits out,
  phase timer, vote reveal delay, first Speaker.
- Host dashboard: pause/resume, undo, skip, nudge, replace a player (same seat and role), hand off host, mute or
  remove chat, phase script to read aloud. Table Tools: coin, dice, timers, talk turns, picker, tally, counters.
- Public table chat with a claims log (no team chat), a game log, a TV “table screen” with no secrets, a desktop
  three-column layout, a low-light mode and an FAQ.

## Code
- `public/js/rules.js` pure rules; `public/js/room.js` the reducer plus `viewForPlayer`/`viewForScreen` (all secrecy);
  `public/js/table.js` + `table_ui.js` the shared table layer (chat, log, tools, host tools, play modes).
- `public/js/cards.js` the 52-card mapping; `public/js/print.js` the printable guide and card sheet.
- `src/worker.js` Cloudflare Worker + one SQLite Durable Object per room (WebSocket hibernation).

## Run and test (Node 22+)
- `npm test` (rules, every table size, powers table, deck/reshuffle, veto, term limits, unrest, all four win paths,
  physical/hybrid modes, host tools, secrecy).
- `npx wrangler dev --port 8862 --ip 127.0.0.1`, then `BASE=http://127.0.0.1:8862 GAMES=60 node scripts/sim-games.mjs`
  plays whole games with scripted players and checks every view for leaks and every win against the rules.
- `node scripts/contrast.mjs` checks every colour pair in both themes (WCAG AA).

## Deploy
- `npm run deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, or the manual Deploy action once those
  repo secrets exist. Workers.dev only: no custom domain, no DNS.
- Without a wrangler token: `node scripts/build-embedded.mjs` builds `dist-embedded/worker.js` (every file inlined),
  uploaded through the Cloudflare API (script `council-night`, Durable Object migration tag `v1`).

> The GitHub Actions files live in `docs/github-workflows/`: the box’s GitHub login has no `workflow` scope.

## Credits
Original game in the hidden-role policy family; names, wording and art are its own. Fonts: Limelight, Poiret One, Big Shoulders
Display, Alegreya and Alegreya Sans (SIL OFL 1.1), Special Elite (Apache 2.0). Interface icons: Phosphor (MIT).

## Look
Transit-app style (see `public/transit.css`): a dark page, every section a bold full-colour rounded card (orange panels,
blue Loyalists, deep red Syndicate), heavy Rubik titles, big numbers, and the main action as a full-width pill fixed at the
bottom. `public/js/tilt.js` adds the 3D tilt and lift (pointer and device tilt, rAF only, idle-free). Liquid Glass is only
for pop-outs and overlays (`fx.css`). Reduced motion and low-end phones get flat cards.
