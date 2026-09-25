// Телефон капитана. Пульт для одной команды: выбрать ответ и поставить ставку.

import {
  QUIZ, TEAM_NAMES, R, db, ref, onValue, get, set, onConnection, serverNow,
  stepAt, roundOf, questionOf, roundLabel, keyOf, fmtClock, clampBet, el, ROOM, path,
  cleanTeamName, nameTaken, MAX_TEAMS, NAME_MAX
} from './shared.js';

const root = document.getElementById('root');
const offlineBar = document.getElementById('offline');
const LETTERS = ['A', 'B', 'C', 'D'];
const STORE_KEY = 'arbi-quiz:' + ROOM + ':team';

let data = {};
let myId = null;
let clockNode = null;
let busy = false;
let loaded = false; // пришёл ли хоть один ответ от базы

try { myId = localStorage.getItem(STORE_KEY); } catch (e) { myId = null; }

onConnection((ok) => { offlineBar.hidden = ok; });

onValue(R(), (snap) => {
  data = snap.val() || {};
  loaded = true;
  render();
});

function me() {
  return myId && data.teams ? data.teams[myId] : null;
}

function timeLeft() {
  const st = data.state || {};
  if (!st.timerEnd) return null;
  return Math.max(0, st.timerEnd - serverNow());
}

function canAnswer() {
  const st = data.state || {};
  if (st.locked) return false;
  const left = timeLeft();
  return left == null || left > 0;
}

function tick() {
  if (clockNode) {
    const left = timeLeft();
    clockNode.textContent = left == null ? '' : fmtClock(left);
    clockNode.classList.toggle('warn', left != null && left <= 10000);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- вход в команду ----------

async function claim(raw) {
  if (busy) return;
  const name = cleanTeamName(raw);
  if (!name) { pickError('Введите название команды'); return; }
  busy = true;
  try {
    const snap = await get(ref(db, path('teams')));
    const teams = snap.val() || {};
    if (Object.keys(teams).length >= MAX_TEAMS) {
      pickError('Все ' + MAX_TEAMS + ' мест заняты. Подойдите к ведущему.');
      busy = false;
      return;
    }
    if (nameTaken(teams, name)) {
      pickError('Такое название уже есть. Придумайте другое.');
      busy = false;
      return;
    }
    const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const team = { name, score: 0, joinedAt: Date.now() };
    await set(ref(db, path('teams/' + id)), team);
    // не ждём, пока база пришлёт обновление: иначе render() не найдёт команду и забудет её
    data = { ...data, teams: { ...(data.teams || {}), [id]: team } };
    myId = id;
    try { localStorage.setItem(STORE_KEY, id); } catch (e) { /* приватный режим */ }
    pick = null;
  } catch (e) {
    pickError('Не удалось подключиться. Проверьте интернет и попробуйте ещё раз.');
  }
  busy = false;
  render();
}

// Экран ввода строится один раз и дальше только обновляется:
// иначе любое изменение в базе стирало бы набранный текст и закрывало клавиатуру.
let pick = null;

function pickError(text) {
  if (pick) pick.err.textContent = text || '';
}

function buildPick() {
  const input = el('input', {
    type: 'text', maxlength: String(NAME_MAX), placeholder: 'Название команды',
    autocomplete: 'off', enterkeyhint: 'go'
  });
  input.addEventListener('input', () => pickError(''));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') claim(input.value); });
  const err = el('div', { class: 'play-ctx', style: 'color:var(--danger);letter-spacing:0;min-height:1.2em' });
  const ideas = el('div', { class: 'namegrid' });
  const ideasBox = el('div', {}, [
    el('div', { class: 'play-ctx', style: 'margin:8px 0', text: 'ИЛИ ВОЗЬМИТЕ ГОТОВОЕ' }),
    ideas
  ]);
  const full = el('div', { class: 'big-msg', text: 'Все места заняты. Подойдите к ведущему.' });
  const form = el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
    input,
    el('button', { class: 'btn primary wide big', text: 'Войти в игру', onclick: () => claim(input.value) }),
    err,
    ideasBox
  ]);
  const node = el('div', { class: 'play-body' }, [
    el('div', { class: 'play-ctx', text: 'ОДИН ТЕЛЕФОН НА КОМАНДУ' }),
    form,
    full
  ]);
  pick = { node, input, err, ideas, ideasBox, form, full };
}

function refreshPick() {
  const teams = data.teams || {};
  const isFull = Object.keys(teams).length >= MAX_TEAMS;
  pick.form.style.display = isFull ? 'none' : 'flex';
  pick.full.style.display = isFull ? '' : 'none';
  const free = TEAM_NAMES.filter((n) => !nameTaken(teams, n));
  pick.ideas.textContent = '';
  free.forEach((n) => pick.ideas.appendChild(el('button', {
    text: n,
    onclick: () => { pick.input.value = n; pickError(''); }
  })));
  pick.ideasBox.style.display = free.length ? '' : 'none';
}

function screenPick() {
  if (!pick) buildPick();
  refreshPick();
  return [
    el('div', { class: 'play-head' }, [el('div', { class: 'nm', text: 'Как назовётесь?' })]),
    pick.node
  ];
}

// ---------- ответы и ставки ----------

async function sendAnswer(step, value) {
  if (!canAnswer() || busy) return;
  busy = true;
  try {
    await set(ref(db, path('answers/' + keyOf(step) + '/' + myId)), value);
  } catch (e) {
    alert('Ответ не ушёл. Проверьте интернет.');
  }
  busy = false;
  render();
}

async function sendBet(step, value) {
  if (busy) return;
  const st = data.state || {};
  if (st.locked) return;
  busy = true;
  try {
    await set(ref(db, path('bets/' + keyOf(step) + '/' + myId)), value);
  } catch (e) {
    alert('Ставка не ушла. Проверьте интернет.');
  }
  busy = false;
  render();
}

function head(t) {
  return el('div', { class: 'play-head' }, [
    el('div', { class: 'nm', text: t.name }),
    el('div', { class: 'sc', text: t.score + ' б.' })
  ]);
}

function bodyLobby() {
  return [
    el('div', { class: 'play-ctx', text: 'ВЫ В ИГРЕ' }),
    el('div', { class: 'big-msg', text: 'Ждём остальные команды' }),
    el('div', { class: 'play-ctx', text: 'СМОТРИТЕ НА БОЛЬШОЙ ЭКРАН' })
  ];
}

function bodyRound(step) {
  const r = roundOf(step);
  return [
    el('div', { class: 'play-ctx', text: 'РАУНД ' + r.n }),
    el('div', { class: 'big-msg', text: r.name }),
    el('div', { class: 'play-ctx', text: 'ПРИГОТОВЬТЕСЬ' })
  ];
}

function bodyBet(step) {
  const r = roundOf(step);
  const t = me();
  const key = keyOf(step);
  const mine = ((data.bets || {})[key] || {})[myId];
  const st = data.state || {};

  const out = [el('div', { class: 'play-ctx', text: 'СТАВКА ДО ВОПРОСА' })];

  if (r.betMax != null) {
    const picks = [];
    for (let v = r.betMin; v <= r.betMax; v++) {
      const vv = v;
      picks.push(el('button', {
        class: mine === vv ? 'picked' : '',
        text: String(vv),
        disabled: st.locked ? 'disabled' : null,
        onclick: () => sendBet(step, vv)
      }));
    }
    out.push(el('div', { class: 'big-msg', text: 'Сколько баллов ставим?' }));
    out.push(el('div', { class: 'betpick' }, picks));
  } else {
    const max = t.score;
    if (max <= 0) {
      out.push(el('div', { class: 'big-msg', text: 'У команды 0 баллов — ставить нечего' }));
      out.push(el('div', { class: 'play-ctx', text: 'ИГРАЕМ НА ИНТЕРЕС' }));
      return out;
    }
    const input = el('input', { type: 'number', min: String(r.betMin), max: String(max), value: String(mine || r.betMin) });
    out.push(el('div', { class: 'big-msg', text: 'Ставка: от 1 до ' + max }));
    out.push(input);
    out.push(el('button', {
      class: 'btn primary wide big',
      text: 'Поставить',
      disabled: st.locked ? 'disabled' : null,
      onclick: () => sendBet(step, clampBet(r, input.value, max))
    }));
  }

  if (mine != null) out.push(el('div', { class: 'ok-msg', text: 'Ставка принята: ' + mine }));
  return out;
}

function bodyQuestion(step) {
  const r = roundOf(step);
  const q = questionOf(step);
  const key = keyOf(step);
  const mine = ((data.answers || {})[key] || {})[myId];
  const open = canAnswer();

  clockNode = el('div', { class: 'play-clock' });
  const out = [
    el('div', { class: 'play-ctx', text: q.tag || roundLabel(r) }),
    clockNode
  ];

  if (r.kind === 'mc') {
    out.push(el('div', { class: 'namegrid' },
      q.options.map((o, i) => el('button', {
        class: 'letterbtn' + (Number(mine) === i ? ' picked' : ''),
        text: LETTERS[i],
        disabled: open ? null : 'disabled',
        onclick: () => sendAnswer(step, i)
      }))
    ));
    out.push(el('div', { class: 'play-ctx', text: 'ТЕКСТ ВАРИАНТОВ — НА БОЛЬШОМ ЭКРАНЕ' }));
  } else {
    const input = q.freeText
      ? el('input', { type: 'text', value: mine != null ? String(mine) : '', placeholder: 'например: 2 недели' })
      : el('input', { type: 'number', step: 'any', value: mine != null ? String(mine) : '', placeholder: 'число' });
    out.push(el('div', { class: 'play-ctx', text: (q.inputLabel || 'ОТВЕТ') + (q.unit ? ', ' + q.unit : '') }));
    out.push(input);
    out.push(el('button', {
      class: 'btn primary wide big',
      text: 'Ответить',
      disabled: open ? null : 'disabled',
      onclick: () => {
        const v = q.freeText ? input.value.trim() : input.value;
        if (v === '') return;
        sendAnswer(step, v);
      }
    }));
  }

  if (mine != null) {
    out.push(el('div', { class: 'ok-msg', text: 'Ответ принят' + (r.kind === 'mc' ? ': ' + LETTERS[Number(mine)] : ': ' + mine) }));
  }
  if (!open) out.push(el('div', { class: 'play-ctx', text: 'ПРИЁМ ОТВЕТОВ ЗАКРЫТ' }));
  return out;
}

function bodyReveal(step) {
  const r = roundOf(step);
  const q = questionOf(step);
  const key = keyOf(step);
  const mine = ((data.answers || {})[key] || {})[myId];
  const verdicts = (data.lastVerdicts || {});
  const applied = data.lastKey === key;
  const ok = applied ? verdicts[myId] === true : null;
  const d = applied ? (data.lastDeltas || {})[myId] : null;

  const out = [el('div', { class: 'play-ctx', text: 'ОТВЕТ' })];
  out.push(el('div', { class: 'big-msg', text: r.kind === 'mc' ? LETTERS[q.correct] + ' — ' + q.options[q.correct] : q.answerLabel }));
  if (mine != null && r.kind === 'mc') {
    out.push(el('div', { class: 'play-ctx', text: 'ВЫ ОТВЕТИЛИ: ' + LETTERS[Number(mine)] }));
  }
  if (ok != null) {
    out.push(el('div', {
      class: 'big-msg',
      style: 'color:' + (ok ? 'var(--teal)' : 'var(--danger)'),
      text: (ok ? 'Верно' : 'Мимо') + (d ? '  ' + (d > 0 ? '+' : '') + d : '')
    }));
  }
  return out;
}

function bodyScores() {
  const t = me();
  return [
    el('div', { class: 'play-ctx', text: 'ВАШ СЧЁТ' }),
    el('div', { class: 'play-clock', text: String(t.score) }),
    el('div', { class: 'play-ctx', text: 'ТАБЛО — НА БОЛЬШОМ ЭКРАНЕ' })
  ];
}

function bodyEnd() {
  const t = me();
  return [
    el('div', { class: 'play-ctx', text: 'ИГРА ОКОНЧЕНА' }),
    el('div', { class: 'play-clock', text: String(t.score) }),
    el('div', { class: 'big-msg', text: 'Спасибо за игру' })
  ];
}

// ---------- сборка ----------

function render() {
  clockNode = null;
  const st = data.state || {};
  const step = stepAt(st.stepIdx || 0);

  let nodes;
  if (!loaded) {
    // до первого ответа базы ничего не решаем: иначе при перезагрузке
    // телефон потеряет сохранённую команду
    nodes = [
      el('div', { class: 'play-head' }, [el('div', { class: 'nm', text: 'Финансовый квиз' })]),
      el('div', { class: 'play-body' }, [
        el('div', { class: 'big-msg', text: 'Подключаемся…' }),
        el('div', { class: 'play-ctx', text: 'ЭТО ЗАЙМЁТ СЕКУНДУ' })
      ])
    ];
  } else if (!me()) {
    if (myId) { try { localStorage.removeItem(STORE_KEY); } catch (e) {} myId = null; }
    if (pick && pick.node.isConnected) { refreshPick(); return; }
    nodes = screenPick();
  } else {
    let body;
    switch (step.type) {
      case 'lobby': body = bodyLobby(); break;
      case 'round': body = bodyRound(step); break;
      case 'bet': body = bodyBet(step); break;
      case 'question': body = bodyQuestion(step); break;
      case 'reveal': body = bodyReveal(step); break;
      case 'scoreboard': body = bodyScores(); break;
      case 'end': body = bodyEnd(); break;
      case 'transition':
      case 'partner': body = [el('div', { class: 'big-msg', text: 'Смотрите на большой экран' })]; break;
      default: body = bodyLobby();
    }
    nodes = [head(me()), el('div', { class: 'play-body' }, body)];
  }

  root.textContent = '';
  nodes.filter(Boolean).forEach((n) => root.appendChild(n));
}

render();
