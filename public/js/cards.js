// Playing a game of The Gilded Chamber with one standard 52-card deck plus its two jokers.
import { TEAMS, startingDeck } from './rules.js';
export const MAP = {
  reformRoles: ['7♥', '8♥', '9♥', '10♥', 'J♥', 'Q♥'],
  cabalRoles: ['J♣', 'Q♣', 'K♣'],
  pretender: 'K♠',
  reformParty: ['A♦', '2♦', '3♦', '4♦', '5♦', '6♦'],
  cabalParty: ['A♣', '2♣', '3♣', '4♣'],
  reformPolicy: ['A♥', '2♥', '3♥', '4♥', '5♥', '6♥'],
  decreePolicy: ['A♠', '2♠', '3♠', '4♠', '5♠', '6♠', '7♠', '8♠', '9♠', '10♠', 'J♠'],
  speaker: 'Red joker', chancellor: 'Black joker',
};
// Cards for one table size: role cards, party cards (for Inquiry), and the policy pile.
export function roleCards(n, rebalance = false) {
  const [r, c] = TEAMS[n];
  const sd = startingDeck(n, rebalance);
  const decrees = sd.deck.filter((x) => x === 'D').length;
  return {
    roles: [...MAP.reformRoles.slice(0, r).map((card) => ({ card, role: 'reformer' })), ...MAP.cabalRoles.slice(0, c).map((card) => ({ card, role: 'cabal' })), { card: MAP.pretender, role: 'pretender' }],
    party: [...MAP.reformParty.slice(0, r), ...MAP.cabalParty.slice(0, c + 1)],
    reform: MAP.reformPolicy, decree: MAP.decreePolicy.slice(0, decrees), startDecrees: sd.decree,
  };
}
