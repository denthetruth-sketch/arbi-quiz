// Проверка правил подсчёта. Запуск: node test-rules.mjs
import { QUIZ } from './quiz-data.js';
import {
  STEPS, stepAt, roundOf, questionOf, keyOf, stepTitle,
  autoVerdicts, deltaFor, applyDelta, clampBet, parseNum, ranked
} from './rules.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; console.log('FAIL: ' + name + '\n   получили ' + a + '\n   ожидали  ' + b); }
};
const ok = (name, cond) => eq(name, !!cond, true);

// ---------- содержание ----------
eq('раундов', QUIZ.rounds.length, 5);
QUIZ.rounds.forEach((r) => {
  if (r.kind === 'mc') {
    r.questions.forEach((q, i) => {
      ok('r' + r.n + 'q' + (i + 1) + ': 4 варианта', q.options.length === 4);
      ok('r' + r.n + 'q' + (i + 1) + ': correct в диапазоне', q.correct >= 0 && q.correct < 4);
      ok('r' + r.n + 'q' + (i + 1) + ': есть разбор', (q.explain || '').length > 40);
    });
  } else {
    r.questions.forEach((q, i) => {
      ok('r' + r.n + 'с' + (i + 1) + ': есть правило', !!q.rule);
      ok('r' + r.n + 'с' + (i + 1) + ': есть ответ', !!q.answerLabel);
    });
  }
});
eq('таймеры раундов', QUIZ.rounds.map((r) => r.seconds), [30, 60, 90, 45, 120]);
eq('баллы раундов 1-3', QUIZ.rounds.slice(0, 3).map((r) => r.points), [1, 2, 3]);
eq('ставки раунда 4', [QUIZ.rounds[3].betMin, QUIZ.rounds[3].betMax], [1, 3]);
eq('множители раунда 4', [QUIZ.rounds[3].winMultiplier, QUIZ.rounds[3].loseMultiplier], [2, 1]);
eq('множители финала', [QUIZ.rounds[4].winMultiplier, QUIZ.rounds[4].loseMultiplier], [2, 2]);
eq('ставка финала без потолка', QUIZ.rounds[4].betMax, null);

// ---------- порядок экранов ----------
eq('первый экран', STEPS[0].type, 'lobby');
eq('последний экран', STEPS[STEPS.length - 1].type, 'end');
// 1 лобби + (8 + 8 + 10 + 8 + 5) по раундам + 1 финальный = 41
eq('всего экранов', STEPS.length, 41);

const types = STEPS.map((s) => s.type);
eq('после лобби заставка раунда', types[1], 'round');
eq('в раунде 1 нет ставок', STEPS.filter((s) => s.ri === 0 && s.type === 'bet').length, 0);
eq('в раунде 4 две ставки', STEPS.filter((s) => s.ri === 3 && s.type === 'bet').length, 2);
eq('в финале одна ставка', STEPS.filter((s) => s.ri === 4 && s.type === 'bet').length, 1);

const iScore3 = STEPS.findIndex((s) => s.type === 'scoreboard' && s.ri === 2);
const iTrans = types.indexOf('transition');
const iPartner = types.indexOf('partner');
const iRound4 = STEPS.findIndex((s) => s.type === 'round' && s.ri === 3);
ok('реплика после табло 3-го раунда', iTrans === iScore3 + 1);
ok('блок ARBI после реплики', iPartner === iTrans + 1);
ok('раунд 4 после блока ARBI', iRound4 === iPartner + 1);

// в раунде со ставками ставка идёт перед вопросом
const betIdx = STEPS.findIndex((s) => s.type === 'bet' && s.ri === 3 && s.qi === 0);
eq('ставка -> вопрос', STEPS[betIdx + 1].type, 'question');
eq('вопрос -> ответ', STEPS[betIdx + 2].type, 'reveal');

eq('ключ вопроса', keyOf({ ri: 3, qi: 1 }), 'r3q1');
ok('заголовок шага непустой', stepTitle(stepAt(5)).length > 0);

// ---------- разбор чисел ----------
eq('число с запятой', parseNum('6,5'), 6.5);
eq('число с процентом', parseNum('20.9%'), 20.9);
eq('мусор', parseNum('абв'), null);
eq('пусто', parseNum(''), null);

// ---------- раунды 1-3 ----------
const r1 = QUIZ.rounds[0];
const q1 = r1.questions[0]; // верный ответ B (индекс 1)
let v = autoVerdicts(r1, q1, ['a', 'b', 'c'], { a: 1, b: 0, c: null });
eq('mc: верный ответ', v.a, true);
eq('mc: неверный ответ', v.b, false);
eq('mc: нет ответа', v.c, false);
eq('mc: баллы за верный', deltaFor(r1, true, null), 1);
eq('mc: ноль за неверный', deltaFor(r1, false, null), 0);
eq('mc: раунд 3 даёт 3', deltaFor(QUIZ.rounds[2], true, null), 3);

// ---------- раунд 4: ближе всех, не превысив ----------
const r4 = QUIZ.rounds[3];
const q4 = r4.questions[0]; // 6.5
v = autoVerdicts(r4, q4, ['a', 'b', 'c', 'd'], { a: 5, b: 6.4, c: 7, d: 3 });
eq('ставка: побеждает 6.4', [v.a, v.b, v.c, v.d], [false, true, false, false]);

v = autoVerdicts(r4, q4, ['a', 'b'], { a: 6.5, b: 6.4 });
eq('ставка: точное попадание', [v.a, v.b], [true, false]);

v = autoVerdicts(r4, q4, ['a', 'b'], { a: 10, b: 8 });
eq('ставка: все превысили — никто', [v.a, v.b], [false, false]);

v = autoVerdicts(r4, q4, ['a', 'b'], { a: 6, b: 6 });
eq('ставка: ничья засчитывается обоим', [v.a, v.b], [true, true]);

eq('ставка 3 выигрыш', deltaFor(r4, true, 3), 6);
eq('ставка 3 проигрыш', deltaFor(r4, false, 3), -3);
eq('ставка 1 выигрыш', deltaFor(r4, true, 1), 2);

// второй вопрос раунда 4 — только вручную
const q4b = r4.questions[1];
v = autoVerdicts(r4, q4b, ['a', 'b'], { a: '2 недели', b: '3 дня' });
eq('диапазон: автомат никого не засчитывает', [v.a, v.b], [false, false]);

// ---------- финал ----------
const r5 = QUIZ.rounds[4];
const q5 = r5.questions[0]; // 20.9 ± 0.6
v = autoVerdicts(r5, q5, ['a', 'b', 'c', 'd'], { a: 20.9, b: 21.4, c: 22, d: '20,5' });
eq('финал: точно', v.a, true);
eq('финал: в допуске', v.b, true);
eq('финал: мимо', v.c, false);
eq('финал: запятая в допуске', v.d, true);

eq('финал: выигрыш 2x', deltaFor(r5, true, 7), 14);
eq('финал: проигрыш 2x', deltaFor(r5, false, 7), -14);

// пример Дена: 10 баллов, ставка 7, проигрыш -> 0
eq('пример Дена', applyDelta(10, deltaFor(r5, false, 7)), 0);
// он же с выигрышем: 10 + 14 = 24
eq('пример Дена, выигрыш', applyDelta(10, deltaFor(r5, true, 7)), 24);

// ---------- границы ставки ----------
eq('r4: ниже минимума', clampBet(r4, 0, 20), 1);
eq('r4: выше максимума', clampBet(r4, 9, 20), 3);
eq('r4: мусор', clampBet(r4, 'abc', 20), 1);
eq('финал: не больше счёта', clampBet(r5, 50, 12), 12);
eq('финал: минимум 1', clampBet(r5, 0, 12), 1);
eq('финал: нулевой счёт — ставка 0', clampBet(r5, 5, 0), 0);
eq('r4 при нулевом счёте всё равно можно', clampBet(r4, 2, 0), 2);

// ---------- счёт не уходит в минус ----------
eq('пол на нуле', applyDelta(2, -10), 0);
eq('обычное сложение', applyDelta(5, 3), 8);

// ---------- таблица ----------
const table = ranked({
  t0: { name: 'КУРС', score: 5, joinedAt: 3 },
  t1: { name: 'ДЕПОЗИТ', score: 12, joinedAt: 1 },
  t2: { name: 'ЭСКРОУ', score: 12, joinedAt: 2 }
});
eq('сортировка по баллам', table.map((t) => t.name), ['ДЕПОЗИТ', 'ЭСКРОУ', 'КУРС']);

// ---------- сквозной прогон партии ----------
{
  // три команды проходят всю игру
  let s = { A: 0, B: 0, C: 0 };
  // раунды 1-3: A отвечает верно везде, B половину, C мимо
  s.A = applyDelta(s.A, 1 * 3);          // 3 вопроса по 1
  s.A = applyDelta(s.A, 2 * 3);          // 3 по 2
  s.A = applyDelta(s.A, 3 * 3);          // 3 по 3
  eq('идеальный счёт за 1-3 раунды', s.A, 18);

  s.B = applyDelta(s.B, 1 + 2 + 3);      // по одному верному в раунде
  eq('средний счёт за 1-3 раунды', s.B, 6);

  // раунд 4: A выигрывает обе ставки по 3, B проигрывает обе по 3
  s.A = applyDelta(s.A, deltaFor(r4, true, 3));
  s.A = applyDelta(s.A, deltaFor(r4, true, 3));
  eq('A после раунда 4', s.A, 30);

  s.B = applyDelta(s.B, deltaFor(r4, false, 3));
  s.B = applyDelta(s.B, deltaFor(r4, false, 3));
  eq('B после раунда 4 (не обнулился)', s.B, 0);

  // C не отвечал вовсе и ставил минимум — тоже не ушёл в минус
  s.C = applyDelta(s.C, deltaFor(r4, false, 1));
  s.C = applyDelta(s.C, deltaFor(r4, false, 1));
  eq('C не в минусе', s.C, 0);
}

console.log('\nпройдено: ' + pass + ', провалено: ' + fail);
process.exit(fail ? 1 : 0);
