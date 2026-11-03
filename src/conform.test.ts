// 가짜 표준 화면으로 conform 이 기대값을 맞히고, 다르면 실패로 세고, caps 에 없는 명령은 건너뛰는지 본다
import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFORM, conform, report } from './conform.js';
import { keyFilter, standardScreen, type FakeGame } from './fake-game.js';
import { Game, WAIT } from './game.js';

Object.assign(WAIT, { intervalMs: 5 });
Object.assign(CONFORM, { waitMs: 50 });

const direct = (g: FakeGame) => new Game(async (c) => g.handle(c));

test('표준 화면이면 16줄이 모두 통과한다', async () => {
  const r = await conform(direct(standardScreen()));
  assert.deepEqual([r.passed, r.failed, r.skipped], [16, 0, 0], report(r));
  assert.match(report(r), /^conform — com\.fake\.game 1\.0 · fake 0 · SDK 0\.3\.0 · protocol 2/);
});

test('옛 uGUI setter 차례(qauser0)면 그 줄과 로그인 줄이 실패하고 caps 에 없는 layout 은 건너뛴다', async () => {
  const g = standardScreen((t) => keyFilter(8)(t.slice(0, 8)));
  g.caps = g.caps.filter((c) => c !== 'layout');
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [13, 2, 1], report(r));
  assert.match(report(r), /✗ type IdInput 'qa_user01!' → qauser01 — IdInput: "qauser0"/);
  assert.match(report(r), /- layout 이 답한다 \(이 SDK 의 caps 에 layout 없음\)/);
});
