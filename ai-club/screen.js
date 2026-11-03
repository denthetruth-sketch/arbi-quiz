// Экран на телевизоре. Стрелки ← → (или кликер) листают экраны — телефоны переключаются сами.

import { EVENT, SLIDES, QUESTION_COUNT, TALK_COUNT } from './config.js';
import { openStore, DEMO, ROOM, el, plural, clampSlide } from './store.js';
import { visible, hiddenCount, people, cloudWords, percentStats } from './tally.js';

const root = document.getElementById('root');
const offlineBar = document.getElementById('offline');
const PALETTE = ['#A99BFF', '#5EE0C9', '#FF8FC2', '#FFD166', '#7CC4FF', '#B9F27C', '#FF9F6E'];

let store = null;
let slide = 0;
let answers = {};
let builtSlide = -1;
let seen = {};            // какие ответы уже показаны — новые появляются с анимацией
let refs = {};
let shownAvg = 0;

// ---------- адрес для телефонов ----------

function answerUrl() {
  const u = new URL('answer.html', location.href);
  u.search = '';
  u.hash = '';
  if (ROOM !== 'main') u.searchParams.set('room', ROOM);
  return u.toString();
}

function qrSvg(text) {
  /* global qrcode */
  if (typeof qrcode !== 'function') return null;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.innerHTML = '<rect width="100%" height="100%" fill="#fff"/><path fill="#0B0B12" d="' + d + '"/>';
  return svg;
}

// ---------- каркас ----------

function header(right) {
  return el('header', { class: 's-head' }, [
    el('div', { class: 's-logo' }, [el('span', { class: 's-dot' }), EVENT.title]),
    el('div', { class: 's-date', text: EVENT.date }),
    el('div', { class: 'grow' }),
    el('div', { class: 's-ctx', text: right })
  ]);
}

function progress() {
  return el('div', { class: 's-progress' }, SLIDES.map((s, i) =>
    el('i', { class: (s.type === 'talk' ? 'talk' : 'q') + (i === slide ? ' on' : i < slide ? ' done' : '') })
  ));
}

// ---------- экраны ----------

function build() {
  const s = SLIDES[slide];
  refs = {};
  shownAvg = 0;
  root.replaceChildren();
  root.className = 's-root ' + (s.type === 'talk' ? 'is-talk' : 'is-question kind-' + s.kind);
  if (s.type === 'talk') buildTalk(s);
  else buildQuestion(s);
  builtSlide = slide;
  update();
}

function buildTalk(s) {
  const initials = s.speaker.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  root.append(
    header('ДОКЛАД ' + s.n + ' ИЗ ' + TALK_COUNT),
    el('main', { class: 't-main' }, [
      el('div', { class: 't-num', text: String(s.n).padStart(2, '0') }),
      el('div', { class: 't-body' }, [
        el('div', { class: 't-topic', text: s.topic }),
        el('h1', { class: 't-title', text: s.title }),
        el('div', { class: 't-speaker' }, [
          el('div', { class: 't-ava', text: initials || '•' }),
          el('div', {}, [
            el('div', { class: 't-name', text: s.speaker }),
            s.role ? el('div', { class: 't-role', text: s.role }) : null
          ])
        ])
      ])
    ]),
    el('footer', { class: 's-foot' }, [progress()])
  );
}

function buildQuestion(s) {
  const url = answerUrl();
  const qr = qrSvg(url);
  refs.count = el('div', { class: 'q-count-n', text: '0' });
  refs.countLabel = el('div', { class: 'q-count-l', text: 'человек ответили' });
  refs.stage = el('div', { class: 'q-stage' });
  refs.inner = el('div', { class: 'q-inner' });
  refs.stage.append(refs.inner);

  root.append(
    header('ВОПРОС ' + s.n + ' ИЗ ' + QUESTION_COUNT),
    el('main', { class: 'q-main' }, [
      el('section', { class: 'q-left' }, [
        el('h1', { class: 'q-title', text: s.title }),
        refs.stage
      ]),
      el('aside', { class: 'q-right' }, [
        el('div', { class: 'q-qr' }, [qr || el('div', { class: 'q-qr-fallback', text: url })]),
        el('div', { class: 'q-scan' }, [
          el('div', { class: 'q-scan-t', text: 'Наведите камеру' }),
          el('div', { class: 'q-scan-s', text: 'и ответьте с телефона' })
        ]),
        el('div', { class: 'q-url', text: url.replace(/^https?:\/\//, '') }),
        el('div', { class: 'q-count' }, [refs.count, refs.countLabel])
      ])
    ]),
    el('footer', { class: 's-foot' }, [progress()])
  );
}

// ---------- ответы ----------

function update() {
  const s = SLIDES[slide];
  if (s.type !== 'question' || !refs.stage) return;
  const bucket = answers[s.id] || {};
  const n = s.kind === 'percent' ? visible(bucket).length : people(bucket);
  if (refs.count.textContent !== String(n)) {
    refs.count.textContent = String(n);
    refs.count.classList.remove('bump');
    void refs.count.offsetWidth;
    refs.count.classList.add('bump');
  }
  refs.countLabel.textContent = plural(n, 'человек ответил', 'человека ответили', 'человек ответили');

  const firstPaint = !seen[s.id];
  seen[s.id] = seen[s.id] || new Set();

  if (s.kind === 'percent') renderPercent(bucket);
  else if (visible(bucket).length === 0) renderEmpty();
  else if (s.kind === 'cloud') renderCloud(s, bucket, firstPaint);
  else renderCards(s, bucket, firstPaint);

  updateMenu();
}

function renderEmpty() {
  refs.inner.className = 'q-inner empty';
  refs.inner.replaceChildren(
    el('div', { class: 'q-empty' }, [
      el('div', { class: 'q-dots' }, [el('i'), el('i'), el('i')]),
      el('div', { text: 'Ждём первые ответы' })
    ])
  );
  refs.inner.style.fontSize = '';
}

function colorFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function hideKeys(qid, keys) {
  keys.forEach((k) => store.setHidden(qid, k, true));
}

function renderCloud(s, bucket, firstPaint) {
  const words = cloudWords(bucket);
  const max = words[0] ? words[0].count : 1;
  // крупные слова — в середину, мелкие — по краям
  const arranged = [];
  words.forEach((w, i) => { if (i % 2) arranged.push(w); else arranged.unshift(w); });

  const known = seen[s.id];
  refs.inner.className = 'q-inner cloud';
  refs.inner.replaceChildren(...arranged.map((w) => {
    const t = max > 1 ? Math.sqrt((w.count - 1) / (max - 1)) : 0;
    const isNew = !firstPaint && !known.has(w.key + '#' + w.count);
    const node = el('span', {
      class: 'w' + (isNew ? ' new' : ''),
      title: 'Двойной клик — скрыть',
      style: 'font-size:' + (1 + t * 1.9).toFixed(2) + 'em;color:' + colorFor(w.key) + ';font-weight:' + (t > 0.5 ? 700 : t > 0 ? 600 : 500),
      ondblclick: () => hideKeys(s.id, w.answerKeys)
    }, [w.label, w.count > 1 ? el('sup', { text: String(w.count) }) : null]);
    return node;
  }));
  words.forEach((w) => known.add(w.key + '#' + w.count));
  fit(4.2, 1.1);
}

function renderCards(s, bucket, firstPaint) {
  const list = visible(bucket).reverse();
  const known = seen[s.id];
  refs.inner.className = 'q-inner cards';
  refs.inner.replaceChildren(...list.map((a) => {
    const isNew = !firstPaint && !known.has(a.key);
    return el('div', {
      class: 'card' + (isNew ? ' new' : ''),
      title: 'Двойной клик — скрыть',
      style: '--c:' + colorFor(a.key),
      ondblclick: () => hideKeys(s.id, [a.key])
    }, [a.t]);
  }));
  list.forEach((a) => known.add(a.key));
  fit(2.1, 0.95);
}

// шрифт уменьшается, пока всё не влезет; если ответов совсем много — внизу обрезаются самые старые.
// Меряем с выравниванием по левому верхнему краю: при центровке вылезающее за край не попадает в scrollHeight.
function fit(maxRem, minRem) {
  const stage = refs.stage;
  const inner = refs.inner;
  const cs = getComputedStyle(stage);
  const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const base = parseFloat(getComputedStyle(root).fontSize) || 16;
  inner.classList.add('measuring');
  let f = maxRem;
  inner.style.fontSize = f * base + 'px';
  let guard = 60;
  while (guard-- > 0 && f > minRem && (inner.scrollHeight > availH + 1 || inner.scrollWidth > availW + 1)) {
    f = Math.max(minRem, f * 0.94);
    inner.style.fontSize = f * base + 'px';
  }
  inner.classList.remove('measuring');
}

function renderPercent(bucket) {
  const { n, avg, bins } = percentStats(bucket);
  if (!refs.pct) {
    const R = 46;
    const C = 2 * Math.PI * R;
    refs.ringC = C;
    refs.ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    refs.ring.setAttribute('viewBox', '0 0 100 100');
    refs.ring.setAttribute('class', 'p-ring');
    refs.ring.innerHTML =
      '<defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A99BFF"/><stop offset="1" stop-color="#5EE0C9"/></linearGradient></defs>' +
      '<circle cx="50" cy="50" r="' + R + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="5"/>' +
      '<circle class="arc" cx="50" cy="50" r="' + R + '" fill="none" stroke="url(#pg)" stroke-width="5" stroke-linecap="round" transform="rotate(-90 50 50)" stroke-dasharray="0 ' + C + '"/>';
    refs.avg = el('div', { class: 'p-avg', text: '—' });
    refs.avgSub = el('div', { class: 'p-avg-sub', text: 'в среднем делегируют ИИ' });
    refs.bars = el('div', { class: 'p-bars' });
    refs.barNodes = bins.map((_, i) => {
      const fill = el('i');
      const num = el('b');
      const col = el('div', { class: 'p-col' }, [el('div', { class: 'p-track' }, [num, fill]), el('span', { text: (i * 10) + (i === 9 ? '–100' : '–' + (i * 10 + 9)) })]);
      refs.bars.append(col);
      return { fill, num };
    });
    refs.pct = el('div', { class: 'p-wrap' }, [
      el('div', { class: 'p-gauge' }, [refs.ring, el('div', { class: 'p-center' }, [refs.avg, refs.avgSub])]),
      el('div', { class: 'p-dist' }, [el('div', { class: 'p-dist-t', text: 'Как распределились ответы, %' }), refs.bars])
    ]);
    refs.inner.className = 'q-inner percent';
    refs.inner.style.fontSize = '';
    refs.inner.replaceChildren(refs.pct);
  }
  const arc = refs.ring.querySelector('.arc');
  arc.setAttribute('stroke-dasharray', (refs.ringC * (n ? avg : 0) / 100).toFixed(2) + ' ' + refs.ringC.toFixed(2));
  const top = Math.max(1, ...bins);
  bins.forEach((b, i) => {
    refs.barNodes[i].fill.style.height = (b / top * 100) + '%';
    refs.barNodes[i].num.textContent = b ? String(b) : '';
  });
  if (!n) { refs.avg.textContent = '—'; shownAvg = 0; return; }
  // число плавно докручивается до нового среднего
  const from = shownAvg;
  const to = avg;
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / 700);
    const e = 1 - Math.pow(1 - k, 3);
    const v = from + (to - from) * e;
    refs.avg.textContent = Math.round(v) + '%';
    if (k < 1 && refs.avg.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  shownAvg = avg;
}

// ---------- пульт: стрелки и меню в углу ----------

function go(n) {
  const next = clampSlide(n);
  if (next === slide) return;
  slide = next;
  build();
  store.setSlide(next).catch(showDbError);
}

document.addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(slide + 1); }
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(slide - 1); }
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(SLIDES.length - 1);
  else if (/^[1-9]$/.test(e.key) && Number(e.key) <= SLIDES.length) go(Number(e.key) - 1);
  else if (e.key === 'f' || e.key === 'а') toggleFull();
});

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

const menu = {};
function buildMenu() {
  menu.pos = el('span', { class: 'm-pos' });
  menu.hidden = el('button', { class: 'm-btn', onclick: restoreHidden });
  menu.clear = el('button', { class: 'm-btn danger', text: 'Очистить ответы', onclick: clearAnswers });
  menu.box = el('div', { class: 'menu' }, [
    el('button', { class: 'm-btn', text: '←', title: 'Назад (стрелка влево)', onclick: () => go(slide - 1) }),
    menu.pos,
    el('button', { class: 'm-btn', text: '→', title: 'Вперёд (стрелка вправо)', onclick: () => go(slide + 1) }),
    el('span', { class: 'm-sep' }),
    menu.hidden,
    menu.clear,
    el('button', { class: 'm-btn', text: '⛶', title: 'Полный экран (F)', onclick: toggleFull })
  ]);
  document.body.append(menu.box);
  let timer = null;
  const wake = () => {
    document.body.classList.add('awake');
    clearTimeout(timer);
    timer = setTimeout(() => document.body.classList.remove('awake'), 2500);
  };
  document.addEventListener('mousemove', wake);
  menu.box.addEventListener('mouseenter', () => clearTimeout(timer));
  menu.box.addEventListener('mouseleave', wake);
}

function updateMenu() {
  if (!menu.box) return;
  const s = SLIDES[slide];
  menu.pos.textContent = (slide + 1) + ' / ' + SLIDES.length;
  const isQ = s.type === 'question';
  const h = isQ ? hiddenCount(answers[s.id]) : 0;
  menu.hidden.hidden = !h;
  menu.hidden.textContent = 'Вернуть скрытые (' + h + ')';
  menu.clear.hidden = !isQ;
}

function restoreHidden() {
  const s = SLIDES[slide];
  Object.entries(answers[s.id] || {}).forEach(([k, a]) => { if (a && a.hidden) store.setHidden(s.id, k, false); });
}

function clearAnswers() {
  const s = SLIDES[slide];
  if (!confirm('Удалить все ответы на вопрос «' + s.title + '»? Вернуть их будет нельзя.')) return;
  seen[s.id] = null;
  store.clear(s.id);
}

function showDbError(err) {
  offlineBar.hidden = false;
  offlineBar.textContent = 'База не пускает запись: ' + (err && err.message ? err.message : err) + ' — см. README, раздел «Правила базы»';
}

// ---------- старт ----------

window.addEventListener('resize', () => { if (builtSlide >= 0) update(); });

(async function start() {
  try {
    store = await openStore();
  } catch (e) {
    root.replaceChildren(el('div', { class: 'fatal', text: 'Не удалось подключиться к базе. Проверьте интернет и обновите страницу.' }));
    return;
  }
  buildMenu();
  if (DEMO) document.body.classList.add('demo');
  store.onConnection((ok) => { offlineBar.hidden = ok; if (!ok) offlineBar.textContent = 'Нет связи с базой — проверьте интернет'; });
  store.onSlide((v) => {
    const n = clampSlide(v == null ? 0 : Number(v));
    if (n !== slide || builtSlide < 0) { slide = n; build(); }
  }, showDbError);
  store.onAnswers((v) => {
    answers = v;
    if (builtSlide < 0) build(); else update();
  }, showDbError);
})();
