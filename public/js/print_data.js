// The designed card set for printing (Phones mode), as data: [card kind (card_art.js), name, copies per deck].
// Copies are the full deck: 59 faces, plus one back on every card. print.js lays these out; the tests check the counts.
export const DESIGNED = [['reform', 'Reform policy', 6], ['decree', 'Decree policy', 11], ['loyalistRole', 'Loyalist role', 6], ['syndicateRole', 'Syndicate role', 3], ['bossRole', 'The Boss role', 1],
  ['loyalistParty', 'Loyalist party card', 6], ['syndicateParty', 'Syndicate party card', 4], ['aye', 'Aye ballot', 10], ['nay', 'Nay ballot', 10], ['speaker', 'Speaker placard', 1], ['chancellor', 'Chancellor placard', 1], ['back', 'Card back', 0]];

// Faces to print (the back is printed on its own sheets, one per card).
export const designedFaces = () => DESIGNED.reduce((sum, [, , n]) => sum + n, 0);

// Cards per printed sheet: 3 columns × 3 rows of 63 × 88 mm, which fits Letter and A4 with the page margins.
export const PER_SHEET = 9;
export const sheetCount = (cards) => Math.ceil(cards / PER_SHEET);
