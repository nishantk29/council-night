// The Gilded Chamber FAQ: roles, rules disputes, house rules, play modes, host tools, joining, privacy.
// [group, [[question, answer-html], ...]]. The role sections are built from rules.js, so they cannot drift from the game;
// test/faq-drift.test.js also fails if a role, house rule or play mode is missing here (or named here but not in the game).
import { ROLES, SIDES } from './rules.js';

const roleSection = (side, title) => [title, Object.values(ROLES).filter((r) => r.side === side).map((r) => [r.name, r.blurb])];
export const FAQ_GAME = {
  roles: Object.values(ROLES).map((r) => r.name),
  houseRules: ['Rebalanced Tables', 'Exile Instead of Execution', 'Anonymous Votes', 'No-Claims Mode', 'Host Sits Out', 'Phase Timer', 'Vote Reveal Delay', 'First Speaker'],
  modes: ['Phones mode', 'Hybrid', 'Host-only mode'],
};
export const FAQ_COVERS = { roles: [], houseRules: [], modes: [] }; // filled below from the answers themselves

export const FAQ = [
  roleSection('reform', `Roles: ${SIDES.reform.short}`),
  roleSection('cabal', `Roles: ${SIDES.cabal.short}`),
  ['Rules disputes and edge cases', [
    ['Does a tied vote elect the government?', 'No. A government needs a strict majority of the players still voting. A tie fails and moves Unrest one step.'],
    ['Who is term-limited, exactly?', 'The last <b>elected</b> Chancellor can’t be nominated. The last elected Speaker can’t be nominated either, unless only five players are left in the game. Failed nominations don’t count. The Speaker who nominates is never limited from being Speaker.'],
    ['What happens on the third failed government?', 'The top policy is turned over and enacted at once. Any power on it is ignored, term limits are forgotten (anyone can be nominated next), and Unrest goes back to zero. The Speaker role moves on as normal.'],
    ['Does Unrest reset when a policy passes?', 'Yes. Unrest goes back to zero whenever any policy is enacted, by a government or by the Unrest itself.'],
    ['When are the discards shuffled back?', 'Right after a policy is enacted, if fewer than three policies are left in the draw pile, every discard is shuffled back in. The app does it for you; when policies are handled at the table, a reminder shows on the board.'],
    ['How does the veto work?', 'Only once five Decrees are on the board. After the Speaker passes two policies, the Chancellor may propose a veto. If the Speaker agrees, both are discarded, nothing is enacted, and Unrest moves one step. If the Speaker refuses, the Chancellor must enact one. A veto can be proposed once per session.'],
    ['After a snap election, who is next?', 'The chosen player serves one turn as Speaker. Then the gavel returns to the player to the left of the Speaker who called the snap election, as if it never happened. You can choose a term-limited player for Speaker.'],
    ['Can I Inquire into the same player twice?', 'No. Nobody can be looked into twice in one game. An Inquiry shows the party, not the role: the Boss’s party is Syndicate.'],
    ['What does the Boss know?', 'At 5 or 6 players, who the Syndicate are. At 7 or more, nothing: the Syndicate know the Boss, but the Boss doesn’t know them.'],
    ['When does electing the Boss win?', 'Once three or more Decrees are on the board, if the Boss is <b>elected</b> Chancellor the Syndicate win at once, before any policy is drawn. Being nominated isn’t enough; the vote has to pass. Any other Chancellor elected from then on is confirmed as not the Boss.'],
    ['Can executed players talk or vote?', 'In the classic rules, no: they can’t vote, speak about the game, or hold office, and they don’t reveal their role, except that executing the Boss ends the game at once. With the Exile house rule they stay and vote, but can’t be Speaker or Chancellor.'],
    ['Can I lie?', 'Yes, about anything, including what you discarded, what you saw with a power, and what you claim in the chat. The only thing you can’t lie about is whether you are the Boss when the game asks.'],
  ]],
  ['House rules', [
    ['Which house rules are there?', 'All are off unless the host turns them on: <b>Rebalanced Tables</b> (community variant for 6, 7 and 9 players), <b>Exile Instead of Execution</b>, <b>Anonymous Votes</b>, <b>No-Claims Mode</b>, <b>Host Sits Out</b>, a <b>Phase Timer</b>, a <b>Vote Reveal Delay</b>, and the <b>First Speaker</b> (random, or the host).'],
    ['What does “Rebalanced Tables” change?', 'At 6 players the game starts with one Decree on the board (it gives no power). At 7 players one Decree is left out of the policy pile; at 9 players two are. Other sizes are unchanged.'],
    ['Does the phase timer do anything at zero?', 'No. It beeps, vibrates and turns red. The host decides what to do: nudge, skip, or let them finish.'],
    ['Anonymous votes?', 'Only the count of Ayes and Nays is shown, never who voted which way, during the game or after.'],
  ]],
  ['Phones Mode', [
    ['What are the three play modes?', '<b>Phones mode</b>: roles, votes and policies all in the app (online play works too). <b>Hybrid</b>: choose for each piece (roles, votes, policy tiles) whether the table handles it out loud or the app does. <b>Host-only mode</b>: the table handles everything and the host’s phone is the board and the tracker.'],
    ['How do I look at my role without others seeing?', 'Press and hold your card to look, then let go to hide it again. A quick tap shows it for 5 seconds. Your role, your policies and any Inquiry result stay blurred until you reveal them, and every role looks the same while hidden.'],
    ['Does the Host see secrets in Hybrid or Host-only mode?', 'No. The host only enters what the whole table sees: who was nominated, who voted Aye, which policy was turned face up, and the answer to “are you the Boss?”. Seats without phones are allowed only when every piece is handled at the table.'],
  ]],
  ['Playing Offline', [
    ['Can I play without internet?', '<ol><li>Open The Gilded Chamber once while you’re online, or install it: on iPhone tap Share, then Add to Home Screen; on Android tap Install app.</li><li>After that it opens without internet.</li><li>Playing a game needs internet for now, because every mode connects through the room. Offline, you can still open the app and read the rules and FAQ.</li></ol><p>On iPhone, the Home Screen app and Safari keep separate copies, so open the one you’ll use while you’re online.</p><span hidden>offline wifi wi-fi install</span>'],
  ]],
  ['Host tools and Table Tools', [
    ['What can the host do?', '<h4>Game flow</h4><ul><li>Pause and resume</li><li>Undo the last step</li><li>Skip an idle player</li><li>Run timers and talk turns</li></ul><h4>Players</h4><ul><li>Nudge someone</li><li>Replace a player who left <span class="muted">(the newcomer takes the same seat and role)</span></li><li>Hand off the host role</li></ul><h4>Chat and table</h4><ul><li>Mute or remove chat messages</li><li>Read the Host script aloud</li><li>Open the table screen</li><li>Close the room <span class="muted">(ends the game for everyone)</span></li></ul><p class="muted">Everything is in the Host tab, or the right-hand panel on a laptop.</p>'],
    ['How do I close the room?', 'In the Host tab, press <b>Close room</b> and confirm. Everyone sees “The host ended the game”, the room is deleted and its code stops working. Rooms also close by themselves after 12 hours.'],
    ['What happens when the host skips?', 'A skipped vote counts as Nay. A skipped nomination passes the gavel on. A skipped Speaker or Chancellor in session has a policy chosen at random by the server; nobody sees which. A skipped power is lost. Every skip is in the log.'],
    ['What are Table Tools?', 'A coin flip, dice (d6 or d20, up to six at once), countdown timers with presets, a talk-turn timer that passes round the table, a random player picker, a vote tally with a random tiebreak, and score or round counters. Shared results are drawn by the server and written in the log; private rolls stay on your phone. While a timer runs the screen stays awake.'],
    ['What is the table screen?', 'Open it on a TV or laptop from the Host tab. It shows the board, the table, the chat and the log, and never anything secret.'],
  ]],
  ['Joining and reconnecting', [
    ['How do people join?', 'Share the 6-letter code or the invite link. Anyone who joins after the deal watches, unless the host opens a seat for them.'],
    ['My phone locked or the page closed.', 'Open the same link again on the same phone and you’re back in your seat with your role. Rooms last 12 hours.'],
    ['Someone has to leave mid-game.', 'The host taps “Replace” next to their name. The next person who joins takes over the same seat and secret role.'],
  ]],
  ['Chat and privacy', [
    ['Is there a team chat for the Syndicate?', 'No. The only chat is the public table chat, so everyone plays on the same footing. Post a <b>claim</b> (“I got two Decrees”) to put it in the claims log.'],
    ['What does the server keep?', 'Only the room: names, seats, the game state and the log, for 12 hours, then it is deleted. No accounts, no tracking, no ads.'],
    ['Who can see my role?', 'Only you, on your own phone, until the game ends. The Host (if they sit out with roles in the app) sees the deal on their phone. The table screen and the other players never do.'],
  ]],
];

// What the FAQ names, read back from its own text (used by the drift test).
const faqText = FAQ.flatMap(([, qs]) => qs.map(([q, a]) => `${q} ${a}`)).join(' ').replace(/<[^>]+>/g, ' ');
for (const k of Object.keys(FAQ_GAME)) FAQ_COVERS[k] = FAQ_GAME[k].filter((n) => faqText.includes(n));
