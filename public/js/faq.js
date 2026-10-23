// The Gilded Chamber FAQ: rules disputes, house rules, play modes, host tools, joining, privacy.
// [group, [[question, answer-html], ...]]
export const FAQ = [
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
    ['Which house rules are there?', 'All are off unless the host turns them on: <b>Rebalanced tables</b> (community variant for 6, 7 and 9 players), <b>Exile instead of execution</b>, <b>anonymous votes</b>, <b>no-claims mode</b>, <b>moderator sits out</b>, a <b>phase timer</b>, a <b>vote reveal delay</b>, and who is the <b>first Speaker</b>.'],
    ['What does “Rebalanced tables” change?', 'At 6 players the game starts with one Decree on the board (it gives no power). At 7 players one Decree is left out of the policy pile; at 9 players two are. Other sizes are unchanged.'],
    ['Does the phase timer do anything at zero?', 'No. It beeps, vibrates and turns red. The host decides what to do: nudge, skip, or let them finish.'],
    ['Anonymous votes?', 'Only the count of Ayes and Nays is shown, never who voted which way, during the game or after.'],
  ]],
  ['Play modes', [
    ['What are the three play modes?', '<b>Phones only</b>: roles, votes and policies all in the app (online play works too). <b>Hybrid</b>: choose for each piece (roles, votes, policy tiles) whether the table handles it out loud or the app does. <b>All at the table</b>: the table handles everything and the host’s phone is the board, the tracker and the moderator.'],
    ['Does the host see secrets in hybrid or all-at-the-table mode?', 'No. The host only enters what the whole table sees: who was nominated, who voted Aye, which policy was turned face up, and the answer to “are you the Boss?”. Seats without phones are allowed only when every piece is handled at the table.'],
  ]],
  ['Playing Offline', [
    ['Can I play without internet?', '<ol><li>Open The Gilded Chamber once while you’re online, or install it: on iPhone tap Share, then Add to Home Screen; on Android tap Install app.</li><li>After that it opens without internet.</li><li>For play without internet, use Host-only mode on one phone. Phones mode needs internet for now.</li></ol><p>On iPhone, the Home Screen app and Safari keep separate copies, so open the one you’ll use while you’re online.</p><span hidden>offline wifi wi-fi install</span>'],
  ]],
  ['Host tools and Table Tools', [
    ['What can the host do?', 'From the Host tab (or the right-hand panel on a laptop): pause and resume, undo the last step, skip an idle player, nudge someone, mute or remove chat messages, replace a player who left (the newcomer takes the same seat and role), hand off the host role, run timers and talk turns, and read the moderator script aloud.'],
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
    ['Who can see my role?', 'Only you, on your own phone, until the game ends. The moderator (if the host sits out with roles in the app) sees the deal on their phone. The table screen and the other players never do.'],
  ]],
];
