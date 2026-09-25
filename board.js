// Табло на проекторе. Только показывает состояние, ничего не пишет.

import {
  QUIZ, MAX_TEAMS, R, onValue, onConnection, serverNow,
  stepAt, roundOf, questionOf, roundLabel, keyOf,
  fmtClock, sortedTeams, ranked, el, ROOM
} from './shared.js';

const root = document.getElementById('root');
const offlineBar = document.getElementById('offline');
const LETTERS = ['A', 'B', 'C', 'D'];

let data = {};
let clockNodes = [];

onConnection((ok) => { offlineBar.hidden = ok; });

onValue(R(), (snap) => {
  data = snap.val() || {};
  render();
});

// ---------- каркас ----------

function head(ctx) {
  return el('div', { class: 'bhead' }, [
    el('div', { class: 'blogo', text: 'A' }),
    el('div', { class: 'bbrand', text: 'ARBI' }),
    el('div', { class: 'bx', text: '✕' }),
    el('div', {}, [
      el('div', { class: 'bins', text: 'INSIGHT' }),
      el('div', { class: 'bsub', text: 'PHUKET · INSIGHT PLACE' })
    ]),
    el('div', { class: 'grow' }),
    el('div', { class: 'bctx', text: ctx || 'ФИНАНСОВЫЙ КВИЗ' })
  ]);
}

function foot(right) {
  return el('div', { class: 'bfoot' }, [
    el('span', { text: 'arbi-ex.com' }),
    el('span', { class: 'mid', text: 'INSIGHT PLACE · ПХУКЕТ, ТАИЛАНД' }),
    el('div', { class: 'grow' }),
    el('span', { class: 'right', text: right || 'ФИНАНСОВЫЕ ВОЗМОЖНОСТИ БЛИЖЕ' })
  ]);
}

function timerBar() {
  const bar = el('div', { class: 'bbar' }, [el('i', {})]);
  clockNodes.push({ kind: 'bar', node: bar });
  return bar;
}

function timerClock() {
  const c = el('div', { class: 'clock', text: '—' });
  clockNodes.push({ kind: 'clock', node: c });
  return c;
}

// ---------- звук таймера ----------
// Браузер не даёт сайту играть звук, пока по странице не кликнули,
// поэтому звук включается кнопкой в углу табло — один раз после открытия.

const SOUND_KEY = 'arbi-quiz:board-sound';
let audio = null;
let soundOn = false;
let lastTickSec = null;
try { soundOn = localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { soundOn = false; }

const soundBtn = el('button', { class: 'sound-btn', onclick: toggleSound });
document.body.appendChild(soundBtn);

function soundReady() {
  return soundOn && audio && audio.state === 'running';
}

function paintSoundBtn() {
  soundBtn.textContent = soundReady() ? '🔊 Звук' : soundOn ? '🔈 Нажмите для звука' : '🔇 Звук';
  soundBtn.classList.toggle('on', soundReady());
}

function toggleSound() {
  if (soundOn && soundReady()) {
    soundOn = false;
  } else {
    soundOn = true;
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    audio.resume().then(paintSoundBtn);
  }
  try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) { /* приватный режим */ }
  paintSoundBtn();
}
paintSoundBtn();

let noise = null;
function playTick(tock, loud) {
  if (!soundReady()) return;
  if (!noise) {
    noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.05), audio.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = noise;
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = tock ? 2200 : 3200;
  bp.Q.value = 6;
  const g = audio.createGain();
  g.gain.setValueAtTime(loud ? 1.6 : 0.8, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  src.connect(bp).connect(g).connect(audio.destination);
  src.start(t);
  src.stop(t + 0.05);
}

function tickClocks() {
  const st = data.state || {};
  const end = st.timerEnd || 0;
  const dur = (st.timerDur || 0) * 1000;
  const left = end ? Math.max(0, end - serverNow()) : 0;
  const warn = end > 0 && left <= 10000 && left > 0;

  // тик раз в секунду, пока идёт таймер; последние 10 секунд — громче
  const running = end > 0 && left > 0 && !st.locked;
  const sec = running ? Math.ceil(left / 1000) : null;
  if (sec !== lastTickSec) {
    if (sec != null && lastTickSec != null) playTick(sec % 2 === 0, sec <= 10);
    lastTickSec = sec;
  }

  clockNodes.forEach(({ kind, node }) => {
    if (kind === 'clock') {
      node.textContent = end ? fmtClock(left) : '—';
      node.classList.toggle('warn', warn);
    } else {
      const pct = end && dur ? Math.max(0, Math.min(100, (left / dur) * 100)) : 0;
      node.firstChild.style.width = pct + '%';
      node.classList.toggle('warn', warn);
    }
  });
  requestAnimationFrame(tickClocks);
}
requestAnimationFrame(tickClocks);

// ---------- экраны ----------

function screenLobby() {
  const teams = sortedTeams(data.teams);
  const joinUrl = location.href.replace(/board\.html.*$/, 'play.html') + (ROOM !== 'ARBI' ? '?room=' + ROOM : '');

  const rows = [];
  teams.forEach((t) => {
    rows.push(el('div', { class: 'join-row' }, [el('i', {}), el('span', { text: t.name })]));
  });
  if (teams.length < MAX_TEAMS) {
    rows.push(el('div', { class: 'join-row empty' }, [el('i', {}), el('span', { text: 'ждём капитана…' })]));
  }

  const qrImg = el('img', { alt: '', src: './qr.png' });
  qrImg.onerror = () => { qrImg.style.display = 'none'; };

  return [
    head('ФИНАНСОВЫЙ КВИЗ'),
    el('div', { class: 'lobby' }, [
      el('div', { class: 'lobby-left' }, [
        el('h1', { class: 'lobby-title serif', text: QUIZ.title }),
        el('p', { class: 'lobby-sub', text: QUIZ.subtitle })
      ]),
      el('div', { class: 'lobby-right' }, [
        el('div', { class: 'qr-card' }, [qrImg, el('div', { class: 'qr-url', text: joinUrl })]),
        el('div', { class: 'join-card' }, [
          el('div', { class: 'join-head' }, [
            el('div', { class: 'lbl', text: 'ПОДКЛЮЧИЛИСЬ' }),
            el('div', { class: 'grow' }),
            el('b', { text: String(teams.length) }),
            el('span', { text: '/ ' + MAX_TEAMS })
          ]),
          el('div', { class: 'join-list' }, rows)
        ])
      ])
    ]),
    foot()
  ];
}

function screenRound(step) {
  const r = roundOf(step);
  const stats = r.stats.map((s) =>
    el('div', { class: 'rstat' }, [el('b', { text: s.v }), el('span', { text: s.l })])
  );
  stats.push(el('div', { class: 'rnote' }, [
    el('b', { text: r.note.title }),
    el('span', { text: r.note.text })
  ]));

  return [
    head('ФИНАНСОВЫЙ КВИЗ'),
    el('div', { class: 'bbody', style: 'gap:2rem;justify-content:center' }, [
      el('div', { class: 'chip out', style: 'align-self:flex-start', text: 'РАУНД ' + r.n }),
      el('h1', { class: 'rtitle serif', text: r.name }),
      el('p', { class: 'rintro', text: r.intro }),
      el('div', { class: 'rstats', style: 'margin-top:1rem' }, stats)
    ]),
    foot()
  ];
}

function screenBet(step) {
  const r = roundOf(step);
  const bets = (data.bets || {})[keyOf(step)] || {};
  const teams = sortedTeams(data.teams);

  const cards = teams.map((t) => {
    const done = bets[t.id] != null;
    return el('div', { class: 'bet-team' + (done ? ' done' : '') }, [
      el('div', { class: 'nm', text: t.name }),
      el('div', { class: 'st', text: done ? 'СТАВКА ПРИНЯТА' : 'думает…' })
    ]);
  });

  const range = r.betMax == null ? 'от 1 до всех своих баллов' : 'от ' + r.betMin + ' до ' + r.betMax + ' баллов';

  return [
    head(roundLabel(r) + ' · СТАВКИ'),
    el('div', { class: 'bbody', style: 'gap:2.5rem;justify-content:center;align-items:center;text-align:center' }, [
      el('h1', { class: 'rtitle serif', text: 'ДЕЛАЕМ СТАВКУ' }),
      el('p', { class: 'rintro', style: 'text-align:center', text: 'Вопрос вы ещё не видели. Ставка ' + range + ' — и назад её уже не забрать.' }),
      el('div', { class: 'bet-grid' }, cards),
      el('div', { class: 'counter', style: 'font-size:1.25rem', text: Object.keys(bets).length + ' / ' + teams.length + ' поставили' })
    ]),
    foot('СТАВКА ДЕЛАЕТСЯ ДО ВОПРОСА')
  ];
}

function statusStrip(step) {
  const answers = (data.answers || {})[keyOf(step)] || {};
  const teams = sortedTeams(data.teams);
  const chips = teams.map((t) => {
    const on = answers[t.id] != null;
    return el('div', { class: 'tchip' + (on ? ' on' : '') }, [el('i', {}), el('span', { text: t.name })]);
  });
  return el('div', { class: 'status' }, [
    el('div', { class: 'lbl', text: 'ОТВЕТИЛИ' }),
    ...chips,
    el('div', { class: 'grow' }),
    el('div', { class: 'counter', text: Object.keys(answers).length + ' / ' + teams.length })
  ]);
}

function screenQuestion(step) {
  const r = roundOf(step);
  const q = questionOf(step);
  const isMc = r.kind === 'mc';

  const qhead = el('div', { class: 'qhead' }, [
    el('div', { class: 'chip out', text: q.tag || ((isMc ? 'ВОПРОС ' : 'СТАВКА ') + (step.qi + 1)) }),
    el('div', { class: 'grow' }),
    isMc
      ? el('div', { class: 'chip pts' }, [
          el('b', { text: String(r.points) }),
          el('span', { text: r.points === 1 ? 'БАЛЛ' : 'БАЛЛА' })
        ])
      : el('div', { class: 'chip', text: 'СТАВКА НА КОНУ' }),
    timerClock()
  ]);

  const body = [];
  if (isMc) {
    body.push(el('div', { class: 'opts' }, q.options.map((o, i) =>
      el('div', { class: 'opt' }, [
        el('div', { class: 'letter', text: LETTERS[i] }),
        el('div', { class: 'body', text: o })
      ])
    )));
  } else {
    body.push(el('div', {
      style: 'flex-grow:1;display:flex;align-items:center;justify-content:center;background:var(--card);border:1px solid var(--line);border-radius:1rem;padding:2rem;'
    }, [
      el('div', {
        style: 'font-size:1.375rem;color:var(--dim);font-style:italic;text-align:center'
      }, ['Вариантов ответа нет — команда фиксирует свой ответ на телефоне'])
    ]));
  }

  return [
    head(roundLabel(r)),
    timerBar(),
    qhead,
    el('h1', { class: 'qtext' + (q.text.length > 260 ? ' xsmall' : q.text.length > 180 ? ' small' : ''), text: q.text }),
    ...body,
    statusStrip(step),
    foot()
  ];
}

function screenReveal(step) {
  const r = roundOf(step);
  const q = questionOf(step);
  const isMc = r.kind === 'mc';

  const nodes = [
    head(roundLabel(r) + ' · ОТВЕТ'),
    el('div', { class: 'chip out', style: 'align-self:flex-start', text: 'ОТВЕТ' })
  ];

  if (isMc) {
    nodes.push(el('div', { class: 'answer' }, [
      el('div', { class: 'letter', text: LETTERS[q.correct] }),
      el('div', { class: 'body', text: q.options[q.correct] })
    ]));
  } else {
    nodes.push(el('div', { class: 'answer' }, [
      el('div', { class: 'body', style: 'font-size:calc(2.75rem * var(--fit, 1))', text: q.answerLabel })
    ]));
  }

  nodes.push(el('div', { style: 'display:flex;flex-direction:column;gap:.75rem;margin-top:1.5rem;flex-grow:1' }, [
    el('div', { class: 'explain-lbl', text: 'РАЗБОР' }),
    el('p', { class: 'explain', text: q.explain }),
    q.source ? el('div', { class: 'source', text: 'Источник: ' + q.source }) : null
  ]));

  nodes.push(foot('ТЕПЕРЬ ПОНЯТНО'));
  return nodes;
}

function screenScoreboard(step) {
  const list = ranked(data.teams);
  const deltas = data.lastDeltas || {};
  const rows = list.map((t, i) => {
    const d = deltas[t.id];
    return el('div', { class: 'srow' + (i === 0 ? ' lead' : '') }, [
      el('div', { class: 'pos', text: String(i + 1) }),
      el('div', { class: 'nm', text: t.name }),
      d ? el('div', { class: 'dl ' + (d > 0 ? 'up' : 'down'), text: (d > 0 ? '+' : '') + d }) : null,
      el('div', { class: 'sc', text: String(t.score) })
    ]);
  });

  return [
    head('ТАБЛО'),
    el('div', { class: 'bbody', style: 'gap:1.5rem;justify-content:center' }, [
      el('h1', { class: 'rtitle serif', style: 'font-size:3.5rem', text: 'СЧЁТ ПОСЛЕ РАУНДА ' + roundOf(step).n }),
      el('div', { class: 'scores' }, rows.length ? rows : [el('div', { class: 'rintro', text: 'Команд пока нет' })])
    ]),
    foot()
  ];
}

function screenTransition() {
  return [
    head('ПЕРЕХОД'),
    el('div', { class: 'quote' }, [
      el('div', { class: 'quote-mark', text: '“' }),
      el('div', { style: 'width:4rem;height:2px;background:var(--orange)' }),
      el('p', { class: 'quote-text', text: QUIZ.transition })
    ]),
    foot()
  ];
}

function screenPartner() {
  return [
    head('О ПАРТНЁРЕ'),
    el('div', { class: 'bbody', style: 'gap:1.75rem;justify-content:center' }, [
      el('div', { class: 'chip out', style: 'align-self:flex-start;border-color:var(--teal);color:var(--teal)', text: 'ARBI' }),
      el('h1', { class: 'serif', style: 'margin:0;font-size:3.25rem;line-height:1.1', text: QUIZ.partner.title }),
      el('div', { class: 'pgrid' }, QUIZ.partner.items.map((it) =>
        el('div', { class: 'pcard' }, [
          el('div', { class: 'n', text: it.n }),
          el('div', {}, [el('b', { text: it.title }), el('span', { text: it.text })])
        ])
      ))
    ]),
    foot()
  ];
}

function screenEnd() {
  const list = ranked(data.teams);
  const top = list[0];
  return [
    head('СПАСИБО'),
    el('div', { class: 'bbody', style: 'gap:1.75rem;justify-content:center' }, [
      top
        ? el('div', { class: 'winner' }, [
            el('div', { class: 'lbl', text: 'ПОБЕДИТЕЛЬ ВЕЧЕРА' }),
            el('div', { class: 'nm serif', text: top.name }),
            el('div', { class: 'sc', text: top.score + ' баллов' })
          ])
        : el('h1', { class: 'rtitle serif', text: QUIZ.ending.title }),
      el('div', { class: 'scores', style: 'flex-grow:0;max-height:14rem;overflow:hidden' },
        list.slice(1, 4).map((t, i) =>
          el('div', { class: 'srow' }, [
            el('div', { class: 'pos', text: String(i + 2) }),
            el('div', { class: 'nm', text: t.name }),
            el('div', { class: 'sc', text: String(t.score) })
          ])
        )
      ),
      el('div', { class: 'next-box' }, [
        el('div', { class: 'lbl', text: QUIZ.ending.nextLabel }),
        el('p', { text: QUIZ.ending.next })
      ])
    ]),
    foot()
  ];
}

// ---------- сборка ----------

function render() {
  clockNodes = [];
  const st = data.state || {};
  const step = stepAt(st.stepIdx || 0);

  let nodes;
  switch (step.type) {
    case 'lobby': nodes = screenLobby(); break;
    case 'round': nodes = screenRound(step); break;
    case 'bet': nodes = screenBet(step); break;
    case 'question': nodes = screenQuestion(step); break;
    case 'reveal': nodes = screenReveal(step); break;
    case 'scoreboard': nodes = screenScoreboard(step); break;
    case 'transition': nodes = screenTransition(); break;
    case 'partner': nodes = screenPartner(); break;
    case 'end': nodes = screenEnd(); break;
    default: nodes = screenLobby();
  }

  root.textContent = '';
  nodes.filter(Boolean).forEach((n) => root.appendChild(n));
  fitText();
}

// Вопрос, варианты и ответ — крупным шрифтом. Если длинный вопрос не влезает
// на экран проектора, их шрифт уменьшается ступеньками, пока всё не поместится.
function fitText() {
  let fit = 1;
  root.style.setProperty('--fit', '1');
  while (fit > 0.5 && root.scrollHeight > root.clientHeight + 1) {
    fit -= 0.05;
    root.style.setProperty('--fit', fit.toFixed(2));
  }
}

window.addEventListener('resize', fitText);

render();
