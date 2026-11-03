// 가짜 표준 화면으로 conform 이 기대값을 맞히고, 다르면 실패로 세고, caps 에 없는 명령은 건너뛰는지 본다
import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFORM, conform, report } from './conform.js';
import { keyFilter, standardScreen, type FakeGame, type FakeNode } from './fake-game.js';
import { Game, WAIT } from './game.js';
import { flatten } from './snapshot.js';

Object.assign(WAIT, { intervalMs: 5 });
Object.assign(CONFORM, { waitMs: 50 });

const direct = (g: FakeGame) => new Game(async (c) => g.handle(c));
const byName = (g: FakeGame, name: string) => flatten(g.roots).find((e) => e.node.name === name)!.node as FakeNode;

test('표준 화면이면 23줄이 모두 통과한다', async () => {
  const r = await conform(direct(standardScreen()));
  assert.deepEqual([r.passed, r.failed, r.skipped], [23, 0, 0], report(r));
  assert.match(report(r), /^conform — com\.fake\.game 1\.0 · fake 0 · SDK 0\.3\.0 · protocol 2/);
});

test('옛 uGUI setter 차례(qauser0)면 그 줄과 로그인 줄이 실패하고 caps 에 없는 layout 은 건너뛴다', async () => {
  const g = standardScreen((t) => keyFilter(8)(t.slice(0, 8)));
  g.caps = g.caps.filter((c) => c !== 'layout');
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [20, 2, 1], report(r));
  assert.match(report(r), /✗ type IdInput 'qa_user01!' → qauser01 — IdInput: "qauser0"/);
  assert.match(report(r), /- layout 이 답한다 \(이 SDK 의 caps 에 layout 없음\)/);
});

// 장면 줄(A)은 표준 화면을 새로 만든다 — 앞 판 상태를 남기려고 scene-load 를 뺀다.
const keepScreen = (g: FakeGame) => ((g.caps = g.caps.filter((c) => c !== 'scene-load')), g);

test('같은 게임에 다시 돌려도 통과하고, 둘째 판은 Item 을 다른 칸(Slot[2])으로 옮긴다', async () => {
  const g = keepScreen(standardScreen());
  await conform(direct(g));
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [21, 0, 2], report(r));
  assert.ok(flatten(g.roots).some((e) => e.path === '/SampleCanvas/Bag/Slot[2]/Item'), report(r));
});

test('다시 돌릴 때 누르기 · 끌기가 안 먹으면 앞 판 글자 · 자리가 남아 있어도 실패한다', async () => {
  const g = keepScreen(standardScreen());
  await conform(direct(g));
  byName(g, 'LoginButton').onClick = undefined;
  byName(g, 'Item').movable = false;
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [19, 2, 2], report(r));
  assert.match(report(r), /✗ click LoginButton → StatusText 에 「login qauser01」 — StatusText: "set by conform"/);
  assert.match(report(r), /✗ drag Item → 다른 칸 — \/SampleCanvas\/Bag\/Slot\[2\]\/Item 있음: false/);
});

test('caps 에 find 가 없으면 find 로 확인하는 줄(누르기 · 끌기)도 건너뛴다', async () => {
  const g = standardScreen();
  g.caps = g.caps.filter((c) => c !== 'find');
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [12, 0, 11], report(r));
  assert.match(report(r), /- click LoginButton → StatusText 에 「login qauser01」 \(이 SDK 의 caps 에 find 없음\)/);
});

test('A 줄 — 장면을 바꿨다 돌아오면 표준 화면이 새로 서고, 저장 값 · 시간 배율이 남지 않는다', async () => {
  const g = standardScreen();
  await conform(direct(g));
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [23, 0, 0], report(r));
  assert.deepEqual([g.scene, g.loaded.map((l) => l.name), g.prefs.size, g.timeScale], ['Sample', ['Sample'], 0, 1]);
  assert.match(report(r), /✓ A scene-load Second → Sample 로 돌아오면 표준 화면을 다시 만든다/);
});

test('A 줄 — 장면이 늦게 열리면 loadScene 이 기다리고, 끝내 안 열리면 장면 이름과 함께 실패한다', async () => {
  const g = standardScreen();
  const game = direct(g);
  g.loadDelay = 3; // scenes 를 세 번 물을 때까지 열리는 중
  await game.loadScene('Second', { add: true });
  assert.deepEqual((await game.scenes()).loaded, ['Sample', 'Second']);
  g.loadDelay = Infinity;
  await assert.rejects(game.loadScene('Second', { timeoutMs: 30 }), /Second 이 열리지 않았습니다 \(지금 Sample · 열린 것 Sample · Second\)/);
  await assert.rejects(game.loadScene('Nope'), /장면 Nope 은 빌드에 없습니다/);
});
