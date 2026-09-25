// Пульт ведущего. Единственный экран, который пишет состояние игры и считает баллы.

import {
  QUIZ, STEPS, R, db, ref, onValue, set, update, remove, onConnection, serverNow,
  stepAt, roundOf, questionOf, roundLabel, keyOf, stepTitle,
  autoVerdicts, deltaFor, fmtClock, sortedTeams, ranked, el, ROOM, path
} from './shared.js';

const root = document.getElementById('root');
const offlineBar = document.getElementById('offline');
const LETTERS = ['A', 'B', 'C', 'D'];

let data = {};
let verdictKey = null;
let verdicts = {};
let clockNode = null;

onConnection((ok) => { offlineBar.hidden = ok; });

onValue(R(), (snap) => {
  data = snap.val() || {};
  render();
});

const state = () => data.state || { stepIdx: 0 };
const curStep = () => stepAt(state().stepIdx || 0);

function timeLeft() {
  const st = state();
  if (!st.timerEnd) return null;
  return Math.max(0, st.timerEnd - serverNow());
}

function tick() {
  if (clockNode) {
    const l = timeLeft();
    clockNode.textContent = l == null ? 'таймер не запущен' : fmtClock(l);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- действия ----------

function go(delta) {
  const next = Math.max(0, Math.min(STEPS.length - 1, (state().stepIdx || 0) + delta));
  update(R('state'), { stepIdx: next, timerEnd: null, timerDur: null, locked: false });
}

function startTimer() {
  const step = curStep();
  const r = roundOf(step);
  if (!r) return;
  update(R('state'), {
    timerEnd: serverNow() + r.seconds * 1000,
    timerDur: r.seconds,
    locked: false
  });
}

function addTime(sec) {
  const st = state();
  const base = st.timerEnd && st.timerEnd > serverNow() ? st.timerEnd : serverNow();
  update(R('state'), {
    timerEnd: base + sec * 1000,
    timerDur: (st.timerDur || 0) + sec
  });
}

function stopTimer() {
  update(R('state'), { timerEnd: serverNow(), locked: true });
}

function toggleLock() {
  update(R('state'), { locked: !state().locked });
}

function ensureVerdicts(step) {
  const key = keyOf(step);
  if (verdictKey === key) return;
  const r = roundOf(step);
  const q = questionOf(step);
  const ids = sortedTeams(data.teams).map((t) => t.id);
  const answers = (data.answers || {})[key] || {};
  verdicts = autoVerdicts(r, q, ids, answers);
  verdictKey = key;
}

function applyScores(step) {
  const key = keyOf(step);
  const r = roundOf(step);
  const teams = sortedTeams(data.teams);
  const bets = (data.bets || {})[key] || {};

  const deltas = {};
  const updates = {};
  teams.forEach((t) => {
    const d = deltaFor(r, verdicts[t.id] === true, bets[t.id]);
    deltas[t.id] = d;
    updates['teams/' + t.id + '/score'] = Math.max(0, t.score + d);
  });
  updates['applied/' + key] = true;
  updates['lastKey'] = key;
  updates['lastDeltas'] = deltas;
  updates['lastVerdicts'] = verdicts;
  update(R(), updates);
}

function undoScores(step) {
  const key = keyOf(step);
  const deltas = data.lastDeltas || {};
  const teams = sortedTeams(data.teams);
  const updates = {};
  teams.forEach((t) => {
    const d = deltas[t.id] || 0;
    updates['teams/' + t.id + '/score'] = Math.max(0, t.score - d);
  });
  updates['applied/' + key] = null;
  updates['lastKey'] = null;
  updates['lastDeltas'] = null;
  updates['lastVerdicts'] = null;
  update(R(), updates);
}

function resetGame() {
  if (!confirm('Обнулить счёт и вернуть игру в начало? Команды останутся.')) return;
  const updates = { state: { stepIdx: 0, timerEnd: null, timerDur: null, locked: false }, answers: null, bets: null, applied: null, lastKey: null, lastDeltas: null, lastVerdicts: null };
  sortedTeams(data.teams).forEach((t) => { updates['teams/' + t.id + '/score'] = 0; });
  update(R(), updates);
  verdictKey = null;
}

function clearTeams() {
  if (!confirm('Удалить все команды? Капитанам придётся подключиться заново.')) return;
  update(R(), { teams: null, answers: null, bets: null, applied: null, lastKey: null, lastDeltas: null, lastVerdicts: null });
}

function removeTeam(t) {
  if (!confirm('Удалить команду «' + t.name + '»? Её счёт, ответы и ставки пропадут, капитан сможет подключиться заново.')) return;
  const updates = { ['teams/' + t.id]: null };
  ['answers', 'bets'].forEach((kind) => {
    Object.entries(data[kind] || {}).forEach(([key, byTeam]) => {
      if (byTeam && t.id in byTeam) updates[kind + '/' + key + '/' + t.id] = null;
    });
  });
  if (data.lastDeltas && t.id in data.lastDeltas) updates['lastDeltas/' + t.id] = null;
  if (data.lastVerdicts && t.id in data.lastVerdicts) updates['lastVerdicts/' + t.id] = null;
  update(R(), updates);
}

function setScore(id, value) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  set(ref(db, path('teams/' + id + '/score')), v);
}

// ---------- блоки интерфейса ----------

function blockNav() {
  const step = curStep();
  const idx = state().stepIdx || 0;
  return el('div', { class: 'panel' }, [
    el('h2', { text: 'ШАГ ' + (idx + 1) + ' ИЗ ' + STEPS.length }),
    el('div', { class: 'stepbox' }, [
      el('button', { class: 'btn', text: '← Назад', disabled: idx === 0 ? 'disabled' : null, onclick: () => go(-1) }),
      el('div', { class: 'stepnow' }, [
        el('b', { text: stepTitle(step) }),
        el('span', { text: idx + 1 < STEPS.length ? 'дальше: ' + stepTitle(stepAt(idx + 1)) : 'это последний экран' })
      ]),
      el('button', { class: 'btn primary', text: 'Вперёд →', disabled: idx >= STEPS.length - 1 ? 'disabled' : null, onclick: () => go(1) })
    ])
  ]);
}

function blockTimer() {
  const step = curStep();
  const r = roundOf(step);
  if (!r || (step.type !== 'question' && step.type !== 'bet')) return null;

  clockNode = el('b', { style: 'font-size:28px;font-variant-numeric:tabular-nums' });

  return el('div', { class: 'panel' }, [
    el('h2', { text: 'ТАЙМЕР' }),
    el('div', { class: 'row', style: 'margin-bottom:12px' }, [clockNode]),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn teal', text: 'Старт ' + r.seconds + ' сек', onclick: startTimer }),
      el('button', { class: 'btn', text: '+15 сек', onclick: () => addTime(15) }),
      el('button', { class: 'btn', text: 'Стоп', onclick: stopTimer }),
      el('button', {
        class: 'btn ' + (state().locked ? 'danger' : 'ghost'),
        text: state().locked ? 'Приём закрыт — открыть' : 'Закрыть приём',
        onclick: toggleLock
      })
    ])
  ]);
}

function blockLive() {
  const step = curStep();
  if (step.type !== 'question' && step.type !== 'bet') return null;
  const key = keyOf(step);
  const teams = sortedTeams(data.teams);
  const answers = (data.answers || {})[key] || {};
  const bets = (data.bets || {})[key] || {};
  const isBetStep = step.type === 'bet';
  const src = isBetStep ? bets : answers;
  const r = roundOf(step);

  const rows = teams.map((t) => {
    const v = src[t.id];
    let txt = '—';
    if (v != null) txt = isBetStep ? 'ставка ' + v : (r.kind === 'mc' ? LETTERS[Number(v)] : String(v));
    return el('div', { class: 'trow' }, [
      el('div', { class: 'nm', text: t.name }),
      el('div', { class: 'ans', style: v != null ? 'color:var(--teal)' : '', text: txt }),
      el('div', { class: 'sc', text: String(t.score) })
    ]);
  });

  return el('div', { class: 'panel' }, [
    el('h2', { text: (isBetStep ? 'СТАВКИ' : 'ОТВЕТЫ') + ' — ' + Object.keys(src).length + ' ИЗ ' + teams.length }),
    el('div', { class: 'tlist' }, rows.length ? rows : [el('div', { class: 'muted', text: 'Команды ещё не подключились' })])
  ]);
}

function blockJudge() {
  const step = curStep();
  if (step.type !== 'reveal') return null;

  ensureVerdicts(step);
  const key = keyOf(step);
  const r = roundOf(step);
  const q = questionOf(step);
  const teams = sortedTeams(data.teams);
  const answers = (data.answers || {})[key] || {};
  const bets = (data.bets || {})[key] || {};
  const applied = !!((data.applied || {})[key]);

  const rows = teams.map((t) => {
    const a = answers[t.id];
    const shown = a == null ? '—' : (r.kind === 'mc' ? LETTERS[Number(a)] : String(a));
    const ok = verdicts[t.id] === true;
    const d = deltaFor(r, ok, bets[t.id]);
    return el('div', { class: 'trow' }, [
      el('div', { class: 'nm', text: t.name }),
      el('div', { class: 'ans', text: shown + (r.kind === 'bet' ? ' · ст. ' + (bets[t.id] != null ? bets[t.id] : '—') : '') }),
      el('button', {
        class: 'toggle ' + (ok ? 'yes' : 'no'),
        text: ok ? 'верно' : 'мимо',
        disabled: applied ? 'disabled' : null,
        onclick: () => { verdicts[t.id] = !ok; render(); }
      }),
      el('div', { class: 'dl ' + (d > 0 ? 'up' : d < 0 ? 'down' : ''), text: d === 0 ? '0' : (d > 0 ? '+' : '') + d }),
      el('div', { class: 'sc', text: String(t.score) })
    ]);
  });

  const answerLine = r.kind === 'mc'
    ? 'Правильный ответ: ' + LETTERS[q.correct] + ' — ' + q.options[q.correct]
    : 'Правильный ответ: ' + q.answerLabel;

  return el('div', { class: 'panel' }, [
    el('h2', { text: 'НАЧИСЛЕНИЕ' }),
    el('div', { style: 'font-size:14px;margin-bottom:12px;color:var(--teal);font-weight:600', text: answerLine }),
    q.hostHint ? el('div', { class: 'hint', style: 'margin-top:0;margin-bottom:12px', text: q.hostHint }) : null,
    el('div', { class: 'tlist' }, rows.length ? rows : [el('div', { class: 'muted', text: 'Команд нет' })]),
    el('div', { class: 'row', style: 'margin-top:14px' }, [
      applied
        ? el('button', { class: 'btn danger', text: 'Отменить начисление', onclick: () => undoScores(step) })
        : el('button', { class: 'btn primary', text: 'Начислить баллы', disabled: teams.length ? null : 'disabled', onclick: () => applyScores(step) }),
      applied ? el('div', { class: 'muted', text: 'Баллы начислены' }) : el('div', { class: 'muted', text: 'Проверьте вердикты и нажмите' })
    ])
  ]);
}

function blockTeams() {
  const list = ranked(data.teams);
  const rows = list.map((t, i) => {
    const input = el('input', { type: 'number', value: String(t.score), style: 'width:86px;padding:8px' });
    return el('div', { class: 'trow' }, [
      el('div', { class: 'ans', style: 'min-width:24px', text: String(i + 1) }),
      el('div', { class: 'nm', text: t.name }),
      input,
      el('button', { class: 'btn ghost', style: 'padding:8px 12px;font-size:13px', text: 'ОК', onclick: () => setScore(t.id, input.value) }),
      el('button', { class: 'btn danger', style: 'padding:8px 12px;font-size:13px', title: 'Удалить команду', text: '✕', onclick: () => removeTeam(t) })
    ]);
  });

  return el('div', { class: 'panel' }, [
    el('h2', { text: 'КОМАНДЫ И СЧЁТ' }),
    el('div', { class: 'tlist' }, rows.length ? rows : [el('div', { class: 'muted', text: 'Пока никто не подключился' })]),
    el('div', { class: 'row', style: 'margin-top:14px' }, [
      el('button', { class: 'btn ghost', text: 'Сбросить игру', onclick: resetGame }),
      el('button', { class: 'btn danger', text: 'Удалить все команды', onclick: clearTeams })
    ])
  ]);
}

function blockLinks() {
  const base = location.href.replace(/control\.html.*$/, '');
  const suffix = ROOM !== 'ARBI' ? '?room=' + ROOM : '';
  return el('div', { class: 'panel' }, [
    el('h2', { text: 'ССЫЛКИ' }),
    el('div', { class: 'muted', style: 'line-height:1.8' }, [
      'Табло на проектор: ', el('a', { href: base + 'board.html' + suffix, target: '_blank', style: 'color:var(--orange)', text: base + 'board.html' + suffix }),
      el('br', {}),
      'Капитанам: ', el('a', { href: base + 'play.html' + suffix, target: '_blank', style: 'color:var(--orange)', text: base + 'play.html' + suffix })
    ])
  ]);
}

// ---------- сборка ----------

function render() {
  clockNode = null;
  const step = curStep();

  const nodes = [
    el('h1', { text: 'Пульт ведущего' }),
    el('div', { class: 'muted', text: 'Комната ' + ROOM + ' · ' + roundLabel(roundOf(step)) }),
    blockNav(),
    blockTimer(),
    blockLive(),
    blockJudge(),
    blockTeams(),
    blockLinks(),
    el('div', { class: 'warnbox' }, [
      'Начисление баллов происходит только отсюда. Если что-то посчиталось не так — правьте счёт руками в блоке «Команды и счёт», это надёжнее, чем пересчитывать раунд.'
    ])
  ];

  root.textContent = '';
  nodes.filter(Boolean).forEach((n) => root.appendChild(n));
}

render();
