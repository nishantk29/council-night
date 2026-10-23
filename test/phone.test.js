import test from 'node:test';
import assert from 'node:assert/strict';
import { revealAfterRelease, wantsWake, screenKey, motionOk, TAP_REVEAL_MS, HOLD_MS } from '../public/js/phone.js';
import { encodeQR, qrSvg, joinUrl } from '../public/js/qr.js';
import { cardArt } from '../public/js/card_art.js';

test('a tap keeps the secret open briefly; a hold closes it on release', () => {
  assert.equal(revealAfterRelease(80), TAP_REVEAL_MS);
  assert.equal(revealAfterRelease(HOLD_MS), 0);
  assert.equal(revealAfterRelease(2000), 0);
});

test('wake lock is wanted only mid-game', () => {
  assert.equal(wantsWake(null), false);
  assert.equal(wantsWake({ phase: 'lobby', game: null }), false);
  assert.equal(wantsWake({ phase: 'vote', game: {} }), true);
  assert.equal(wantsWake({ phase: 'over', game: {} }), false);
});

test('screen key changes per step, not per re-render', () => {
  const v = { phase: 'legislate', game: { leg: 'speaker' } };
  assert.equal(screenKey('play', v), screenKey('play', { ...v }));
  assert.notEqual(screenKey('play', v), screenKey('play', { phase: 'legislate', game: { leg: 'chancellor' } }));
  assert.notEqual(screenKey('home', null), screenKey('faq', null));
});

test('motion is off for reduced motion and the Animations switch', () => {
  assert.equal(motionOk({ anim: true }, false), true);
  assert.equal(motionOk(null, false), true);
  assert.equal(motionOk({ anim: false }, false), false);
  assert.equal(motionOk({ anim: true }, true), false);
});

test('QR encodes the join link locally', () => {
  const url = joinUrl('https://example.com', 'ABCDEF');
  assert.equal(url, 'https://example.com/#/join/ABCDEF');
  const { size } = encodeQR(url);
  assert.ok(size >= 21 && (size - 17) % 4 === 0);
  assert.match(qrSvg(url, 'Join QR'), /^<svg[^>]*aria-label="Join QR"/);
});

test('every role card has the same outer shape so a glance leaks nothing', () => {
  const vb = (k) => cardArt(k).match(/viewBox="([^"]+)"/)[1];
  assert.equal(vb('loyalistRole'), vb('bossRole'));
  assert.equal(vb('back'), vb('syndicateRole'));
});
