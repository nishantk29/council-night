import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardArt, CARD_KINDS, ROLE_CARD, PARTY_CARD, POLICY_CARD } from '../public/js/card_art.js';

const EXPECTED = ['reform', 'decree', 'loyalistRole', 'syndicateRole', 'bossRole', 'loyalistParty', 'syndicateParty', 'aye', 'nay', 'speaker', 'chancellor', 'back'];

// A small well-formedness check: balanced, properly nested tags and quoted attributes.
function wellFormed(svg) {
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+=(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), name, `unbalanced </${name}>`); else stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed tags');
  assert.equal(svg.replace(/<[^>]*>/g, '').includes('<'), false);
}

test('every designed card kind returns valid inline SVG', () => {
  assert.deepEqual([...CARD_KINDS].sort(), [...EXPECTED].sort());
  for (const k of CARD_KINDS) {
    const svg = cardArt(k);
    assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*viewBox="0 0 252 352"/, k);
    assert.ok(svg.endsWith('</svg>'), k);
    assert.match(svg, /aria-label="[^"]+"/, k);
    wellFormed(svg);
    assert.ok(!/<image|href=|url\(http/.test(svg), `${k}: no external images`);
  }
});

test('no playing-card suit glyphs in any app-mode card', () => {
  for (const k of CARD_KINDS) assert.ok(!/[♠♥♦♣♤♡♢♧]/u.test(cardArt(k)), k);
  assert.ok(!/[♠♥♦♣]/.test(readFileSync(new URL('../public/js/card_art.js', import.meta.url), 'utf8')));
});

test('game ids map to designed cards', () => {
  for (const k of [...Object.values(ROLE_CARD), ...Object.values(PARTY_CARD), ...Object.values(POLICY_CARD)]) assert.ok(cardArt(k), k);
  assert.equal(cardArt('nope'), '');
});

test('card_art.js is precached by the service worker', () => {
  assert.ok(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8').includes("'/js/card_art.js'"));
});
