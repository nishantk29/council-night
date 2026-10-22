// Council Night FAQ: rules disputes, house rules, play modes and cards, host tools, joining, privacy.
// [group, [[question, answer-html], ...]]
export const FAQ = [
  ['Rules disputes and edge cases', [
    ['Does a tied vote elect the government?', 'No. A government needs a strict majority of the players still voting. A tie fails and moves Unrest one step.'],
    ['Who is term-limited, exactly?', 'The last <b>elected</b> Chancellor can’t be nominated. The last elected Speaker can’t be nominated either, unless only five players are left in the game. Failed nominations don’t count. The Speaker who nominates is never limited from being Speaker.'],
    ['What happens on the third failed government?', 'The top policy is turned over and enacted at once. Any power on it is ignored, term limits are forgotten (anyone can be nominated next), and Unrest goes back to zero. The Speaker role moves on as normal.'],
    ['Does Unrest reset when a policy passes?', 'Yes. Unrest goes back to zero whenever any policy is enacted, by a government or by the Unrest itself.'],
    ['When are the discards shuffled back?', 'Right after a policy is enacted, if fewer than three policies are left in the draw pile, every discard is shuffled back in. The app does it for you; with physical tiles a reminder shows on the board.'],
    ['How does the veto work?', 'Only once five Decrees are on the board. After the Speaker passes two policies, the Chancellor may propose a veto. If the Speaker agrees, both are discarded, nothing is enacted, and Unrest moves one step. If the Speaker refuses, the Chancellor must enact one. A veto can be proposed once per session.'],
    ['After a snap election, who is next?', 'The chosen player serves one turn as Speaker. Then the gavel returns to the player to the left of the Speaker who called the snap election, as if it never happened. You can choose a term-limited player for Speaker.'],
    ['Can I Inquire into the same player twice?', 'No. Nobody can be looked into twice in one game. An Inquiry shows the party, not the role: the Pretender’s party is Cabal.'],
    ['What does the Pretender know?', 'At 5 or 6 players, who the Cabal are. At 7 or more, nothing: the Cabal know the Pretender, but the Pretender doesn’t know them.'],
    ['When does electing the Pretender win?', 'Once three or more Decrees are on the board, if the Pretender is <b>elected</b> Chancellor the Cabal win at once, before any policy is drawn. Being nominated isn’t enough; the vote has to pass. Any other Chancellor elected from then on is confirmed as not the Pretender.'],
    ['Can executed players talk or vote?', 'In the classic rules, no: they can’t vote, speak about the game, or hold office, and they don’t reveal their role, except that executing the Pretender ends the game at once. With the Exile house rule they stay and vote, but can’t be Speaker or Chancellor.'],
    ['Can I lie?', 'Yes, about anything, including what you discarded, what you saw with a power, and what you claim in the chat. The only thing you can’t lie about is whether you are the Pretender when the game asks.'],
  ]],
  ['House rules', [
    ['Which house rules are there?', 'All are off unless the host turns them on: <b>Rebalanced tables</b> (community variant for 6, 7 and 9 players), <b>Exile instead of execution</b>, <b>anonymous votes</b>, <b>no-claims mode</b>, <b>moderator sits out</b>, a <b>phase timer</b>, a <b>vote reveal delay</b>, and who is the <b>first Speaker</b>.'],
    ['What does “Rebalanced tables” change?', 'At 6 players the game starts with one Decree on the board (it gives no power). At 7 players one Decree is left out of the deck; at 9 players two are. Other sizes are unchanged.'],
    ['Does the phase timer do anything at zero?', 'No. It beeps, vibrates and turns red. The host decides what to do: nudge, skip, or let them finish.'],
    ['Anonymous votes?', 'Only the count of Ayes and Nays is shown, never who voted which way, during the game or after.'],
  ]],
  ['Play modes and the deck of cards', [
    ['What are the three play modes?', '<b>Phones only</b>: roles, votes and policies all in the app (online play works too). <b>Hybrid</b>: choose for each piece (roles, votes, policy tiles) whether it is physical or in the app. <b>All physical</b>: a deck of cards on the table; the host’s phone is the board, the tracker and the moderator.'],
    ['How do I play with a regular deck?', 'Print the <a href="/print.html" target="_blank" rel="noopener">card guide</a>. Roles: hearts 7 to Q are Reformers, clubs J/Q/K are the Cabal, the K♠ is the Pretender. Policies: A♥–6♥ are Reforms, A♠–J♠ are Decrees. Party cards (for an Inquiry): diamonds A–6 for Reform, clubs A–4 for Cabal. The red joker is the Speaker’s placard, the black joker the Chancellor’s. Vote with thumbs, on three.'],
    ['Does the host see secrets in physical or hybrid mode?', 'No. The host only enters what the whole table sees: who was nominated, who voted Aye, which policy was turned face up, and the answer to “are you the Pretender?”. Seats without phones are allowed only when every piece is physical.'],
    ['Can I print my own cards?', 'Yes: the <a href="/print.html#cards" target="_blank" rel="noopener">Council Night cards</a> sheet has role cards, party cards, policy tiles, Aye/Nay cards and the two placards, nine to a page, poker size.'],
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
    ['Is there a team chat for the Cabal?', 'No. The only chat is the public table chat, so everyone plays on the same footing. Post a <b>claim</b> (“I got two Decrees”) to put it in the claims log.'],
    ['What does the server keep?', 'Only the room: names, seats, the game state and the log, for 12 hours, then it is deleted. No accounts, no tracking, no ads.'],
    ['Who can see my role?', 'Only you, on your own phone, until the game ends. The moderator (if the host sits out with roles in the app) sees the deal on their phone. The table screen and the other players never do.'],
  ]],
];
