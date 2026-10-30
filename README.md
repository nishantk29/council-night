# The Gilded Chamber

A hidden-role policy game for 5 to 10 players: on phones. Sister app to
[Mafia Night](https://mafia.hatethespurs.com) and [Quest Night](https://avalon.hatethespurs.com):
same stack, same components, its own game, names, wording and art.

Live: https://secrethitler.hatethespurs.com

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

## Setup (host)
Four steps in a carousel (Members, Table rules, Seating, Deal), one per screen, remembered on refresh (`council.setup.v1`). Table rules is a
preset (`public/js/presets.js`, six built in plus the host's own saved ones): the role mix is fixed by table size, so a preset only sets the play
mode and the house rules rebalance, exile, anonymous votes and the turn clock. Seating maps Own phones / One phone / Mixed to Phones / Host-only /
Hybrid. Every default is one named constant in `public/js/config-defaults.js`. Before anyone sees their role, every phone shows "Roles in this game"
(the same list for every viewer) and a `Roles · N` chip stays in the header. Browser test: `node test/e2e/setup.e2e.mjs`.

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
- `npm run dev -- --port 8862 --ip 127.0.0.1` (wrangler dev --local, no Cloudflare login), then `BASE=http://127.0.0.1:8862 GAMES=60 node scripts/sim-games.mjs`
  plays whole games with scripted players and checks every view for leaks and every win against the rules.
- `node scripts/contrast.mjs` checks every colour pair in both themes (WCAG AA).

## Deploy
- `npm run deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, or the manual Deploy action once those
  repo secrets exist. Workers.dev only: no custom domain, no DNS.
- Without a wrangler token: `node scripts/build-embedded.mjs` builds `dist-embedded/worker.js` (every file inlined),
  uploaded through the Cloudflare API (script `council-night`, Durable Object migration tag `v1`).

> The GitHub Actions files live in `docs/github-workflows/`: the box’s GitHub login has no `workflow` scope.

## Deploy file
`node scripts/build-deploy.mjs <outFile>` writes the Cloudflare-API deploy function (worker name, Durable Object binding and
compatibility date come from `wrangler.jsonc` only; no migrations are sent). It first runs the whole suite through
`scripts/test-gate.mjs` and prints `Deploy file NOT written: N test(s) failed` (exit 1, out file untouched) on any failure.
There is no bypass. It also refuses a stale `public/sw.js` VERSION (re-stamp with make-pwa or `scripts/stamp-sw.mjs`).
Every house rule and the test that guards it is listed in `RULES.md`.

## Credits
Original game in the hidden-role policy family; names, wording and art are its own. Fonts: Big Shoulders
Display, Alegreya and Alegreya Sans (SIL OFL 1.1), Special Elite (Apache 2.0). Interface icons: Phosphor (MIT).

## Look
Transit-app style (see `public/transit.css`): a dark page, every section a bold full-colour rounded card (orange panels,
blue Loyalists, deep red Syndicate), heavy Rubik titles, big numbers, and the main action as a full-width pill fixed at the
bottom. `public/js/tilt.js` adds the 3D tilt and lift (pointer and device tilt, rAF only, idle-free). Liquid Glass is only
for pop-outs and overlays (`fx.css`). Reduced motion and low-end phones get flat cards.
