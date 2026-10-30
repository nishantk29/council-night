// What the big button at the bottom of a phone does in each phase. Pure: no DOM, no state. app.js renders it and sends
// what it says, so tests can drive a whole game through it. Every step that needs a choice shows a greyed button that
// names the missing choice, and the Host always has a skip that takes the most neutral way on.
// hostNav(view, ui) -> null (nothing for this phone to decide) or
//   { label, disabled, missing, send, skip }
//   missing: what is still needed ('speaker', 'nominee', 'votes', 'tally', 'card', 'policy', 'veto', 'target', 'answer') or null
//   send:    the room message Next sends when enabled (null while disabled)
//   skip:    { label, action, msgs } or null; msgs are the room messages the chip sends, in order
// ui: { nominee: id|null, target: id|null, tally: {id: bool}, card: 0|1|2|null, policy: 'R'|'D'|null, answer: bool|null, veto: bool|null }
// Three steps never have a skip (Fennel ruling 5): the physical policy entry (Unrest tile, or what the Chancellor
// turned up) and the Boss question. They are facts at the table; the Host can always enter them, so nothing is stuck.
const nameOf = (v, id) => v.players.find((p) => p.id === id)?.name || 'someone';
const plural = (n, one, many) => (n === 1 ? one : many);
const POWER_VERB = { investigate: 'look into', special: 'make the next Speaker', execute: 'execute' };

export function hostNav(view, uiIn = {}) {
  const g = view.game; const me = view.me;
  if (!g || !me || view.kind === 'screen' || !['reveal', 'nominate', 'vote', 'legislate', 'power', 'check', 'chaos'].includes(view.phase)) return null;
  const ui = { nominee: null, target: null, tally: {}, card: null, policy: null, answer: null, veto: null, ...uiIn };
  const host = !!me.host;
  const isPhys = (id) => view.mode.play === 'physical' || !!view.players.find((p) => p.id === id)?.phoneless;
  const skipMsg = (id) => (id ? { type: 'skip', id } : { type: 'skip' });
  const chip = (label, msgs) => ({ label, action: msgs[0].type, msgs });
  const need = (label, missing, skip) => ({ label, disabled: true, missing, send: null, skip: host ? skip : null });
  const ready = (label, send) => ({ label, disabled: false, missing: null, send, skip: null });
  const voters = [...g.alive, ...g.exiled];

  if (view.phase === 'reveal') return host ? ready('Start game', { type: 'skipReveal' }) : null;

  if (view.phase === 'nominate') {
    const mine = g.speaker === me.id; const forS = host && !mine && isPhys(g.speaker);
    const pass = chip('Pass the Gavel', [skipMsg()]);
    if (!mine && !forS) return host ? need(`Waiting for ${nameOf(view, g.speaker)} to nominate`, 'speaker', pass) : null;
    const t = ui.nominee && g.alive.includes(ui.nominee) && ui.nominee !== g.speaker && !g.ineligible.includes(ui.nominee) ? ui.nominee : null;
    if (!t) return need('Choose a Chancellor', 'nominee', pass);
    return ready(`Nominate ${nameOf(view, t)}`, { type: 'nominate', id: t });
  }

  if (view.phase === 'vote') {
    if (view.mode.votes === 'physical') {
      if (!host) return null;
      const yes = voters.filter((id) => ui.tally[id]);
      const none = chip('No one voted Aye', [{ type: 'tally', ayes: [] }]);
      if (!yes.length) return need('Tap who voted Aye', 'tally', none);
      return ready(`Record: ${yes.length} Aye, ${voters.length - yes.length} Nay`, { type: 'tally', ayes: yes });
    }
    const idle = voters.filter((id) => !g.voted.includes(id));
    if (!host || !idle.length) return null;
    return need(`Waiting for ${idle.length} ${plural(idle.length, 'vote', 'votes')}`, 'votes', chip('Skip the Rest (Nay)', idle.map(skipMsg)));
  }

  if (view.phase === 'legislate') {
    if (!g.cardsApp) {
      if (!host) return null;
      const rand = null; // a fact at the table: entered, never skipped (ruling 5)
      if (!ui.policy) return need('Enter what was enacted', 'policy', rand);
      return ready(`Record: a ${ui.policy === 'R' ? 'Reform' : 'Decree'} was enacted`, { type: 'hostEnact', policy: ui.policy });
    }
    const sp = g.speaker === me.id; const ch = g.nominee === me.id;
    if (g.leg === 'speaker') {
      const rand = chip('Random Discard', [skipMsg()]);
      if (!sp) return host ? need(`Waiting for ${nameOf(view, g.speaker)} to discard`, 'speaker', rand) : null;
      if (!Number.isInteger(ui.card) || ui.card < 0 || ui.card > 2) return need('Pick a policy to discard', 'card', rand);
      return ready('Discard this policy', { type: 'discard', i: ui.card });
    }
    if (g.leg === 'veto') {
      const refuse = chip('Refuse the Veto', [skipMsg()]);
      if (!sp) return host ? need(`Waiting for ${nameOf(view, g.speaker)} to answer the veto`, 'speaker', refuse) : null;
      if (ui.veto == null) return need('Agree to the veto, or refuse it', 'veto', refuse);
      return ready(ui.veto ? 'Agree to the veto' : 'Refuse the veto', { type: 'vetoReply', accept: !!ui.veto });
    }
    const rand = chip('Random Enact', [skipMsg()]);
    if (!ch) return host ? need(`Waiting for ${nameOf(view, g.nominee)} to enact`, 'speaker', rand) : null;
    if (!Number.isInteger(ui.card) || ui.card < 0 || ui.card > 1) return need('Pick a policy to enact', 'card', rand);
    return ready('Enact this policy', { type: 'enact', i: ui.card });
  }

  if (view.phase === 'power') {
    const pw = g.power; const mine = g.speaker === me.id; const forS = host && !mine && isPhys(g.speaker);
    const skip = chip('Skip the Power', [skipMsg()]);
    if (!mine && !forS) return host ? need(`Waiting for ${nameOf(view, g.speaker)} to use the power`, 'speaker', skip) : null;
    if (pw === 'peek') return ready('Done looking', { type: 'peekDone' });
    const ok = (id) => g.alive.includes(id) && id !== g.speaker && !(pw === 'investigate' && g.investigated.includes(id)) && !(pw === 'special' && g.exiled.includes(id));
    const t = ui.target && ok(ui.target) ? ui.target : null;
    if (!t) return need(`Choose who to ${POWER_VERB[pw]}`, 'target', skip);
    return ready(`${pw === 'special' ? 'Make' : pw === 'investigate' ? 'Look into' : 'Execute'} ${nameOf(view, t)}${pw === 'special' ? ' Speaker' : ''}`, { type: 'power', id: t });
  }

  if (view.phase === 'check') {
    if (!host) return null;
    const c = g.check;
    const no = null; // the Yes/No answer is the choice; a default "No" could hide a Boss win
    if (ui.answer == null) return need(c.kind === 'chancellor' ? 'Answer: is the Chancellor the Boss?' : 'Answer: was the executed player the Boss?', 'answer', no);
    return ready(ui.answer ? 'Record: it was the Boss' : 'Record: not the Boss', { type: 'check', yes: !!ui.answer });
  }

  // chaos: the Unrest tile
  if (!host) return null;
  const rand = null; // a fact at the table: entered, never skipped (ruling 5)
  if (!ui.policy) return need('Enter what was enacted', 'policy', rand);
  return ready(`Record: a ${ui.policy === 'R' ? 'Reform' : 'Decree'} was enacted`, { type: 'hostEnact', policy: ui.policy });
}
