# Gilded Chamber house rules and the tests that guard them

`build-deploy` runs the whole suite first (`scripts/test-gate.mjs`) and writes nothing if any test fails. Every rule below has a row here and a named test.
"Since" is the `rulesVersion` that introduced the rule; a room keeps the version it was created with (rule R11). Latest is 2. A room with no field is version 1 and is never backfilled.
`rules-gate` = `test/rules-gate.test.js`: one `describe('house rule: ...')` per rule, which checks that every cited test still exists and adds direct checks where nothing else owns the rule.

| # | House rule (plain words) | Since | Test (file: name) |
|---|---|---|---|
| R1 | Team sizes: 5 to 10 players, the Syndicate is always a minority and includes the Boss (3/2, 4/2, 4/3, 5/3, 5/4, 6/4 Loyalists/Syndicate+Boss). | v1 | rules-gate `house rule: team sizes 5 to 10, Syndicate a minority with the Boss`; rules `team sizes for every table`; audit-v2 `audit: team sizes, deck and knowledge match the classic rules`; roles-sheet `counts sum to the seat count...` |
| R2 | The Syndicate see each other and the Boss; the Boss sees the Syndicate only at 5-6 players. Lists are in no seat order. | v1 | rules-gate `house rule: the Boss sees the Syndicate only at 5-6, and lists come in random order`; rules `who knows whom...`; audit-v2 `audit: nothing in the table order gives a role away`; roles-sheet `what each side knows...` |
| R3 | Term limits: the last elected Chancellor can never be nominated; the last Speaker only when more than five can hold office. Exiled players do not count toward the five. | v1 | rules-gate `house rule: term limits...`; rules `term limits: ...`; room `term limits are enforced on nomination`; audit-v2 `audit: term limits...`, `audit: exiled players do not count toward the five-or-fewer term-limit exception` |
| R4 | Three failed governments in a row enact the top policy, with no power, clear the term limits and reset the tracker. The tracker also resets after any enacted policy. | v1 | rules-gate `house rule: the third failed government...`; room `unrest: three failed governments...`, `the tracker resets whenever a policy is enacted`; audit-v2 `audit: third failure enacts the top policy...`, `audit: chaos at five Decrees ends the game...` |
| R5 | The Boss elected Chancellor after three Decrees: the Syndicate win at once. Before three, nothing happens. | v1 | rules-gate `house rule: the Boss elected Chancellor after three Decrees...`; room `win: the Boss elected Chancellor after three Decrees (and not before)`; audit-v2 `audit: the Boss elected at three Decrees wins before legislation; before three, not` |
| R6 | Executing the Boss: the Loyalists win at once. Executed players cannot vote or hold office. | v1 | rules-gate `house rule: executing the Boss wins for the Loyalists`; room `win: executing the Boss; ...`; audit-v2 `audit: six Decrees and five Reforms win; executing the Boss wins at once`, `audit: executed players: no vote, no office...` |
| R7 | Veto opens only at five Decrees; the Speaker must agree, and an agreed veto moves the tracker. | v1 | rules-gate `house rule: veto only at five Decrees`; room `veto unlocks at five Decrees; ...`; audit-v2 `audit: veto only at five Decrees, ...` |
| R8 | Inquiry shows the party only to the Speaker, the Boss shows as Syndicate, and nobody is inquired twice. | v1 | rules-gate `house rule: Inquiry shows the party...`; room `inquiry shows the party (the Boss shows as Syndicate)...`; audit-v2 `audit: powers by table size; Inquiry shows party...` |
| R9 | Executive powers follow the table size (the three classic boards): Inquiry, Snap election, Docket peek, Execution. | v1 | rules-gate `house rule: executive powers by table size`; rules `the powers table matches the three classic boards`; room `powers by table size fire on the right Decree`; audit-v2 `audit: powers by table size...`, `audit: Snap election returns to the left of the ORIGINAL Speaker...` |
| R10 | The roles sheet is static: the same for every viewer and phase, never names a player, and joiners see the same dealt setup. | v1 | rules-gate `house rule: the roles sheet is static and identical for everyone`; roles-sheet `identical for every viewer and every phase...`, `a watcher mid-game sees the same dealt setup` |
| R11 | Restart (Host) keeps the room, players, settings and Host, re-deals on the latest rules, bumps the game number and clears chat, log, board, votes, powers and timers. A room keeps the rulesVersion it was created with; only Restart, a fresh start and new rooms move to the latest. | v2 (pinning) | rules-gate `house rule: Restart keeps the room and re-deals on the latest rules`, `house rule: a room keeps the rulesVersion it was created with`; restart (all 11 tests, esp. `newRoom is on the latest rules...`, `a v1 room moves to the latest rules on restart...`, `Play again from the end screen leaves a v1 room on v1...`); audit-v2 `audit: Restart works in every phase...` |
| R12 | Every role gets the same reveal look and duration; the closed card never contains the role. | v1 | rules-gate `house rule: every role gets the same reveal look and duration`; phone `every role card has the same outer shape...`; audit-v2 `audit: reveal length is identical for every role` |
| R13 | Nothing leaks in any phase: no other role, hand, docket, Inquiry result, deck order, token or host key. Knowledge badges only while the card is open; moderator roles only for a sit-out Host. | v1 | rules-gate `house rule: no leaks in any phase`; table `secrecy: ...`; room `every table size deals, and nobody sees what they should not`; audit-v2 `audit: no view leaks ...`, `audit: knowledge badges show only while the role card is open`, `audit: moderator roles only for a sit-out host`; restart `after a restart every view is the fresh reveal...` |
| R14 | Reconnecting (or a kicked seat's new holder) gets the same private card; the old token no longer acts. | v1 | rules-gate `house rule: reconnecting to a living game gives the same view`; audit-v2 `audit: pause freezes play, ... a kicked seat's old token no longer acts ...` |
| R15 | The host flow never dead-ends: skip works on every phase it should; on a physical table the host enters the tile the third failure turns up. | v1 | rules-gate `house rule: the host flow never dead-ends`; audit-v2 `audit: skip works on every phase it should ...`, `audit: physical table, third failure: no skip, the host enters the tile`, `audit: physical and hybrid steps ...` |
| R16 | Error pages (404, 426, 500, expired or closed room) are styled, offer both buttons, are escaped, and never show an error message or stack. | v1 | rules-gate `house rule: error pages are styled and leak nothing`; error-pages (all) |
| R17 | The FAQ lists exactly the roles, settings, house rules and modes the game has. | v1 | rules-gate `house rule: the FAQ matches the game`; faq-drift (4 tests) |
| R18 | The service worker VERSION matches the content hash of `public/`, so installed phones pick up changes. | v1 | rules-gate `house rule: the service worker version is fresh`; pwa-fresh; `build-deploy` also refuses a stale one |
| R19 | The deploy gate blocks on a red test, never passes on a crash or no tests, and build-deploy has no bypass. Worker name, binding and compat date come from `wrangler.jsonc` (`council-night`, ROOM -> Room, migration v1 only). | v1 | deploy-gate (6 tests); deploy-config (5 tests) |

Not yet covered (the tests do not exist in this tree): the seeded whole-game simulation (Task D, `sim-invariants`) and the host-nav "never dead-ends" UI test (Task G). Add rows for them (and cite them in `rules-gate`) when they land.

## Logic audit fixes (AUDIT.md)

All in `test/audit-v2.test.js`. No fix changed play, so none is gated on `rulesVersion >= 2`; all are leak, display or crash fixes that apply to every room.

| Fix | Since | Test |
|---|---|---|
| Undo is refused after the game ended (it used to un-end it with every role shown). | all | `audit: no undo after game over` |
| Play again is host only; players see "Waiting for the host". | all | `audit: Play again is host only` |
| No undo past a secret look (Inquiry, docket, discard, enact). | all | `audit: no undo past a secret look` |
| Knowledge badges show only while the role card is open. | all | `audit: knowledge badges show only while the role card is open` |
| Moderator roles go only to a sit-out Host, never to a late watcher who claims host. | all | `audit: moderator roles only for a sit-out host` |
| An idle Speaker's skipped power stays lost (FAQ says so). | all | `audit: an idle Speaker’s skipped power stays lost (and the FAQ says so)` |
| Exiled players do not count toward the five-or-fewer term-limit exception. | all | `audit: exiled players do not count toward the five-or-fewer term-limit exception` |
| Physical chaos: skip is refused with a clear "enter the policy that was turned up" message. The same holds for a physical Chancellor tile and the Boss question (ruling 5; host-no-dead-end "ruling 5" test). | all | `audit: physical table, third failure: no skip, the host enters the tile` |
| Confirmed, no change: team sizes, deck and reshuffle, rotation, tracker, Boss win timing, six Decrees / five Reforms, execution, veto, powers, Snap election, chaos, ties and guards, restart in every phase, pause, kicked seats, claimHost, close, skip, leaks, reveal length. | all | the other `audit:` tests in `test/audit-v2.test.js` |

## How to add a rule

1. Write the rule in one line, in the words you would use at the table.
2. If it changes how a game plays (who sees what, win checks, legal moves), pin it to a new `rulesVersion`: bump `LATEST_RULES_VERSION` in `public/js/room.js` and gate the code with `(room.rulesVersion || 1) >= N`. Old rooms keep the old rule. Display-only and crash fixes need no pin.
3. Add a named test, and a `describe('house rule: <the line>')` in `test/rules-gate.test.js` that cites it (or checks it directly), plus one test showing the previous version is unchanged.
4. Add a row to this file with the exact test names and the "since" version; keep the FAQ in sync if players can see the rule (`faq-drift`).
5. Run make-pwa (or `node scripts/stamp-sw.mjs public`), then `node scripts/build-deploy.mjs <out>`: it runs every test first and refuses to write the deploy file until all pass. There is no bypass.

## Shared game-rules kit (test/kit/game-invariants.mjs)

`test/kit/game-invariants.mjs` is the shared invariant kit, copied unchanged from `/workspace/code-team/shared/invariants/`. The Gilded adapter is `test/game-invariants.test.js` (phone mode, table sizes 5 to 10, rebalance and exile on and off). It checks four properties: no step can block, game over stays final, no leaks (a view does not change when hidden roles are shuffled among the players who may not know them), and no Undo after game over. All four pass with no todo. The kit is not named `*.test.js`, so the gate does not run it on its own. Physical and hybrid modes are covered by `test/sim-invariants.test.js` (seeded whole games under invariant oracles).
