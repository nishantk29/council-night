# The Gilded Chamber v4: logic audit (Task C)

## Scope
`public/js/rules.js`, `room.js` (reducer and views), `table.js` (undo, kick, claimHost, pause), the Worker's socket handling, the
FAQ, the print script, and the client's private marks. Areas: spec vs FAQ, pairwise cases, look-alike roles, phases and timing,
leaks. Everything is tested in `test/audit-v2.test.js` (33 tests).

## Method
Read each area narrowly, wrote a test per rule or edge case, ran the new file against the old code (7 of the new tests fail
there: the six bugs below and the chaos-skip message), then fixed. Fixes that only close leaks or crashes apply to every
`rulesVersion`. No play-changing fix was needed, so nothing is gated on `rulesVersion >= 2`.

## Findings
| Area | Finding | Fix | rulesVersion | Test |
|---|---|---|---|---|
| Phases / leaks | Undo after the game ended resumed it with every role already shown. `finish()` did not clear the stack and `reduce` pushed a snapshot after it. | Undo refused at `over` ("Can’t undo once the game is over"); the stack is cleared when a game finishes; Restart and Play again still work. | all | audit: no undo after game over |
| Phases | "Play again" was open to every player. | `again` is host only; players see "Waiting for the host" (pop-up and end screen). | all | audit: Play again is host only |
| Leaks | Undo went back past an Inquiry, docket look, discard or enact, so the Speaker could look again or inquire a second player. | Those steps clear the stack and set a barrier; Undo says "Can't undo past a secret look". Public steps (nominate, vote, tally, check, hostEnact, hostVeto) stay undoable up to the barrier. A new deal forgets the barrier. | all | audit: no undo past a secret look |
| Leaks | Knowledge badges ("The Boss", "Syndicate", "Inquiry: …") were drawn on the round table even with the role card closed. | Marks appear only while the role card is open. | all | audit: knowledge badges show only while the role card is open |
| Leaks | `moderator.roles` went to any host who watches, including a late watcher who claims host. | Also requires `house.sitOut`. | all | audit: moderator roles only for a sit-out host |
| Rule choice 3 | An idle Speaker's skipped power is lost. FAQ now says so in the host-skip answer. | Locked with a test, FAQ line. | all | audit: an idle Speaker’s skipped power stays lost |
| Rule choice 4 | Exiled players do not count toward "five or fewer players" (only players who can hold office do). | Locked with a test, FAQ line in the term-limit answer. | all | audit: exiled players do not count toward the five-or-fewer term-limit exception |
| Rule choice 5 | Physical chaos: `skip` already refused, but with the generic "Nothing to skip now." | Clear message "Enter the policy that was turned up. It can’t be skipped."; FAQ line. | all | audit: physical table, third failure: no skip, the host enters the tile |
| Spec | Team sizes, knowledge (Boss sees Syndicate only at 5-6), 6R/11D deck, reshuffle below three, term limits, rotation, tracker, Boss win timing, 6 Decrees / 5 Reforms, execution, veto, powers, Inquiry, docket, rebalance and exile | Checked, no bug | n/a | the `audit:` tests for each, in order |
| Pairwise | Snap election returns to the left of the original Speaker and may pick a term-limited player; executing the next Speaker or the Chancellor; chaos at five Decrees; veto into the third failure; physical `check`/`hostEnact`/`hostVeto` | Checked, no bug | n/a | the pairwise `audit:` tests |
| Look-alikes | Boss and Syndicate positions are uniform across seats and in knowledge lists; the print script calls groups, never seats or numbers; both thumbs steps are present | Checked, no bug | n/a | audit: nothing in the table order gives a role away |
| Phases | Ties fail, double votes, out-of-turn actions, actions after game over, Restart in every phase, pause, kicked seats, claimHost, close room, skip on each phase | Checked, no bug (refused actions leave the state byte-for-byte unchanged) | n/a | the phase `audit:` tests |
| Leaks | Per phase, no view carries other roles, hands, docket, Inquiry, deck, discards, tokens, host key or rng; the screen carries nothing private | Checked, no bug | n/a | audit: no view leaks … |
| Timing | Reveal length is one shared constant; the closed card has role-free markup | Checked, no bug | n/a | audit: reveal length is identical for every role |

## Not covered
- A passing vote deals the Speaker's hand (app cards) and shows the docket on phones at once. Per ruling 2 the vote and tally stay
  undoable, so a host who undoes a passed vote gives the Speaker a second look at the same three policies before the nomination
  changes. The cards are identical after the undo (the deck is restored), so this was accepted, not fixed.
- Real sockets and the Durable Object (stale sockets are covered by token rotation in the reducer and by `socketsToDrop`).
- Pixel and animation timing in a browser; the round-table marks are tested against the source, because `app.js` needs a DOM.
- Task D (many-games simulation), Task E (deploy gate), Task G (host nav labels, including "Enter the policy turned up").

## Rule choices for Nishant
All five were DECIDED by Fennel on 2026-10-25 and are implemented; none is open.
1. DECIDED (Fennel, 2026-10-25): "Play again" is host only. Players see "Waiting for the host".
2. DECIDED (Fennel, 2026-10-25): no Undo past a secret look (Inquiry, docket, policy hand). Undo stops there.
3. DECIDED (Fennel, 2026-10-25): an idle Speaker's skipped power stays lost.
4. DECIDED (Fennel, 2026-10-25): exiled players do not count toward the "five or fewer players" term-limit exception.
5. DECIDED (Fennel, 2026-10-25): at a physical table the third failure cannot be skipped; the host enters the tile turned up.
