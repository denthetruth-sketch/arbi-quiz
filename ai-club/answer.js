// Телефон гостя. Показывает тот вопрос, который сейчас на экране, и сам переключается вслед за ним.

import { EVENT, SLIDES } from './config.js';
import { openStore, deviceId, ROOM, el, clampSlide } from './store.js';

const root = document.getElementById('root');
const offlineBar = document.getElementById('offline');
const DEVICE = deviceId();
const MINE_KEY = 'aiclub:mine:' + ROOM;

let store = null;
let slide = -1;

// свои ответы помним в браузере — чтобы показать «Вы ответили»
function loadMine() {
  try { return JSON.parse(localStorage.getItem(MINE_KEY)) || {}; } catch (e) { return {}; }
}
function saveMine(m) {
  try { localStorage.setItem(MINE_KEY, JSON.stringify(m)); } catch (e) { /* приватный режим */ }
}
let mine = loadMine();

function top() {
  return el('div', { class: 'ph-top' }, [
    el('span', { class: 's-dot' }),
    el('span', { class: 'ph-brand', text: EVENT.title }),
    el('span', { class: 'grow' }),
    el('span', { class: 'ph-date', text: EVENT.date })
  ]);
}

function render() {
  const s = SLIDES[slide];
  root.replaceChildren(top());
  if (s.type === 'talk') renderWait(s);
  else if (s.kind === 'percent') renderPercent(s);
  else renderText(s);
  window.scrollTo(0, 0);
}

function renderWait(s) {
  const next = SLIDES.slice(slide + 1).find((x) => x.type === 'question');
  root.append(el('div', { class: 'ph-card ph-wait' }, [
    el('div', { class: 'ph-label', text: 'Сейчас доклад ' + s.n }),
    el('h1', { class: 'ph-talk', text: s.title }),
    el('div', { class: 'ph-speaker', text: s.speaker + (s.role ? ' · ' + s.role : '') }),
    el('div', { class: 'ph-note', text: next
      ? 'Следующий вопрос появится здесь сам — страницу можно не закрывать.'
      : 'Спасибо за ответы! Вопросов больше не будет.' })
  ]));
}

function sendWithTimeout(promise) {
  let slow = null;
  return {
    promise,
    onSlow(cb) { slow = setTimeout(cb, 6000); },
    done() { clearTimeout(slow); }
  };
}

function renderText(s) {
  const list = mine[s.id] || [];
  const input = el('textarea', {
    class: 'ph-input',
    maxlength: String(s.maxLen),
    rows: s.maxLen > 60 ? '4' : '2',
    placeholder: s.placeholder,
    enterkeyhint: 'send'
  });
  const counter = el('span', { class: 'ph-counter', text: '0 / ' + s.maxLen });
  const btn = el('button', { class: 'ph-btn', text: 'Отправить', disabled: true });
  const status = el('div', { class: 'ph-status' });
  const mineBox = el('div', { class: 'ph-mine' });

  function paintMine() {
    const l = mine[s.id] || [];
    mineBox.replaceChildren(...(l.length ? [
      el('div', { class: 'ph-mine-t', text: l.length === 1 ? 'Ваш ответ уже на экране' : 'Ваши ответы на экране' }),
      ...l.map((t) => el('div', { class: 'ph-mine-i', text: t }))
    ] : []));
  }

  input.addEventListener('input', () => {
    counter.textContent = input.value.length + ' / ' + s.maxLen;
    btn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!btn.disabled) send(); }
  });
  btn.addEventListener('click', send);

  function send() {
    const text = input.value.replace(/\s+/g, ' ').trim().slice(0, s.maxLen);
    if (!text) return;
    btn.disabled = true;
    btn.textContent = 'Отправляем…';
    status.className = 'ph-status';
    status.textContent = '';
    const job = sendWithTimeout(store.addText(s.id, text, DEVICE));
    job.onSlow(() => { status.textContent = 'Интернет медленный — ответ уйдёт, как только появится связь.'; });
    job.promise.then(() => {
      job.done();
      mine[s.id] = [...(mine[s.id] || []), text];
      saveMine(mine);
      input.value = '';
      counter.textContent = '0 / ' + s.maxLen;
      btn.textContent = 'Отправить ещё';
      status.className = 'ph-status ok';
      status.textContent = 'Отправлено — смотрите на экран! Можно добавить ещё.';
      paintMine();
    }).catch((err) => {
      job.done();
      btn.disabled = false;
      btn.textContent = 'Отправить';
      status.className = 'ph-status err';
      status.textContent = 'Не отправилось. Попробуйте ещё раз.' + (err && err.code ? ' (' + err.code + ')' : '');
    });
  }

  root.append(el('div', { class: 'ph-card' }, [
    el('div', { class: 'ph-label', text: 'Вопрос ' + s.n }),
    el('h1', { class: 'ph-q', text: s.title }),
    el('div', { class: 'ph-hint', text: s.hint }),
    el('div', { class: 'ph-field' }, [input, counter]),
    btn,
    status
  ]), mineBox);
  if (list.length) btn.textContent = 'Отправить ещё';
  paintMine();
}

function renderPercent(s) {
  const prev = mine[s.id];
  let value = typeof prev === 'number' ? prev : 30;
  const big = el('div', { class: 'ph-pct', text: value + '%' });
  const range = el('input', { class: 'ph-range', type: 'range', min: '0', max: '100', step: '5', value: String(value) });
  const chips = el('div', { class: 'ph-chips' }, [0, 10, 25, 50, 75, 100].map((v) =>
    el('button', { class: 'ph-chip', text: v + '%', onclick: () => setV(v) })
  ));
  const btn = el('button', { class: 'ph-btn', text: typeof prev === 'number' ? 'Изменить ответ' : 'Отправить' });
  const status = el('div', { class: 'ph-status' + (typeof prev === 'number' ? ' ok' : ''), text: typeof prev === 'number' ? 'Ваш ответ: ' + prev + '%. Можно поменять.' : '' });

  function paintRange() {
    range.style.setProperty('--v', value + '%');
    big.textContent = value + '%';
  }
  function setV(v) { value = v; range.value = String(v); paintRange(); }
  range.addEventListener('input', () => { value = Number(range.value); paintRange(); });
  paintRange();

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Отправляем…';
    const v = value;
    const job = sendWithTimeout(store.setNumber(s.id, v, DEVICE));
    job.onSlow(() => { status.className = 'ph-status'; status.textContent = 'Интернет медленный — ответ уйдёт, как только появится связь.'; });
    job.promise.then(() => {
      job.done();
      mine[s.id] = v;
      saveMine(mine);
      btn.disabled = false;
      btn.textContent = 'Изменить ответ';
      status.className = 'ph-status ok';
      status.textContent = 'Принято: ' + v + '%. Смотрите на экран — там среднее по залу.';
    }).catch((err) => {
      job.done();
      btn.disabled = false;
      btn.textContent = 'Отправить';
      status.className = 'ph-status err';
      status.textContent = 'Не отправилось. Попробуйте ещё раз.' + (err && err.code ? ' (' + err.code + ')' : '');
    });
  });

  root.append(el('div', { class: 'ph-card' }, [
    el('div', { class: 'ph-label', text: 'Вопрос ' + s.n }),
    el('h1', { class: 'ph-q', text: s.title }),
    el('div', { class: 'ph-hint', text: s.hint }),
    big,
    range,
    chips,
    btn,
    status
  ]));
}

(async function start() {
  try {
    store = await openStore();
  } catch (e) {
    root.replaceChildren(top(), el('div', { class: 'ph-card' }, [
      el('h1', { class: 'ph-q', text: 'Не удалось подключиться' }),
      el('div', { class: 'ph-hint', text: 'Проверьте интернет и обновите страницу.' })
    ]));
    return;
  }
  store.onConnection((ok) => { offlineBar.hidden = ok; });
  store.onSlide((v) => {
    const n = clampSlide(v == null ? 0 : Number(v));
    if (n === slide) return;
    slide = n;
    render();
  }, () => {
    root.replaceChildren(top(), el('div', { class: 'ph-card' }, [
      el('h1', { class: 'ph-q', text: 'Опрос пока закрыт' }),
      el('div', { class: 'ph-hint', text: 'Попросите ведущего проверить доступ к базе.' })
    ]));
  });
})();
