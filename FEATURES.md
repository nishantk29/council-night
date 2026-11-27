# The Gilded Chamber: feature map

Read this before a change, then open only the files listed for the feature.

## Test commands

| Command | What it runs | When |
|---|---|---|
| `npm run test:quick` | all `node --test` suites in `test/` (about 40 s; the sim is most of it) | every change |
| `npm run check` | `scripts/guard.mjs`: repeat-mistake checks (names, paths, secrets, theme switch, root scripts) | every change |
| `npm run test:e2e` | multi-phone browser run (`test/e2e/multi-phone.e2e.mjs`, needs `npm run dev`) | UI changes |
| `npm run fuzz` | seeded whole-game invariants; `SIM_GAMES` and `SIM_SEED` raise and shift it | releases (CI on `v*` tags) |

## Features → files

| Feature (user's view) | Files | Tests |
|---|---|---|
| Create / join a room (code, QR), reconnect to the same seat | `src/worker.js` (`/api/create`, `/api/room/:code`, `/ws/:code`), `public/js/qr.js`, `public/js/app.js` | `room.test.js`, `hub-arrival.test.js` |
| Rules: elections, term limits, Unrest, deck, powers, veto, wins | `public/js/rules.js` | `rules.test.js`, `rules-gate.test.js` |
| Game flow and per-phone secrecy | `public/js/room.js` (reducer + views) | `room.test.js`, `game-invariants.test.js`, `sim-invariants.test.js` |
| Undo / Redo (never over a secret look), restart | `public/js/event-log.js`, `public/js/entropy.js` | `undo-redo.test.js`, `restart.test.js` |
| Host tools, chat and claims log, TV table screen | `public/js/table.js`, `public/js/table_ui.js`, `public/js/host-nav.js` | `table.test.js`, `host-no-dead-end.test.js` |
| Play modes (phones, host phone, hybrid), blur-to-reveal, low-light | `public/js/phone.js`, `public/js/app.js` | `phone.test.js`, `play-once.test.js` |
| Setup (Members, Table rules, Seating, Deal), presets, roles sheet | `public/js/setup_flow.js`, `setup_ui.js`, `presets.js`, `steppers.js`, `roles_sheet.js`, `config-defaults.js` | `setup-ui.test.js`, `presets.test.js`, `steppers.test.js`, `roles-sheet.test.js` |
| Menu pill, bottom sheets, Back closes sheets | `public/js/more-pill.js`, `sheets.js`, `back-sheet.js` | `back-sheet.test.js`, `back-nav-wiring.test.js` |
| FAQ and "Ask a rule" | `public/js/faq.js`, `src/ask.js`, `src/ai.js`, `src/rules-index.js` (generated) | `faq*.test.js`, `ask.test.js`, `rules-index.test.js` |
| Card art and printables | `public/js/card_art.js`, `print.js`, `print_data.js`, `cards.js`, `public/print.html`, `public/print/*.pdf` | `card-art.test.js`, `print*.test.js` |
| Motion and flair | `public/js/fx.js`, `flair.js`, `morph.js`, `public/motion.css` | `motion-budget.test.js`, `jank.test.js`, `table-jank.test.js` |
| Screen stays awake | `public/js/wake.js` | `wake.test.js`, `wake-wiring.test.js` |
| Install / offline (PWA) | `public/sw.js`, `public/pwa-install.js`, `pwa/pwa.json`, `scripts/stamp-sw.mjs` | `pwa-fresh.test.js`, `first-load.test.js` |
| Error pages | `src/error-page.js`, `public/404.html`, `public/js/error-screen.js` | `error-pages.test.js` |
| Deploy config | `wrangler.jsonc`, `scripts/build-deploy.mjs`, `scripts/deploy-config.mjs`, `src/embedded-assets.js` | `deploy-*.test.js`, `embedded-assets.test.js` |
