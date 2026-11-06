// 가짜 표준 화면으로 conform 이 기대값을 맞히고, 다르면 실패로 세고, caps 에 없는 명령은 건너뛰는지 본다
import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFORM, conform, report } from './conform.js';
import { keyFilter, standardScreen, type FakeGame, type FakeNode } from './fake-game.js';
import { Game, WAIT } from './game.js';
import { flatten } from './snapshot.js';

Object.assign(WAIT, { intervalMs: 5 });
Object.assign(CONFORM, { waitMs: 50, holdS: 0.1, dragS: 0, keyS: 0 });

const direct = (g: FakeGame) => new Game(async (c) => g.handle(c));
// 팜 · USB 처럼 앱을 뒤로 보낼 길이 있다 — 없으면 D 일시정지 줄이 미실행
const hooks = (g: FakeGame) => ({ background: async () => g.background() });
const byName = (g: FakeGame, name: string) => flatten(g.roots).find((e) => e.node.name === name)!.node as FakeNode;

test('표준 화면이면 52줄이 모두 통과한다', async () => {
  const g = standardScreen();
  const r = await conform(direct(g), hooks(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [52, 0, 0], report(r));
  assert.match(report(r), /\n통과 52 · 실패 0 · 미실행 0$/);
  assert.deepEqual([g.fingers.size, g.held.size, g.scene], [0, 0, 'Sample']);
  assert.match(report(r), /^conform — com\.fake\.game 1\.0 · fake 0 · SDK 0\.3\.0 · protocol 2/);
});

test('옛 uGUI setter 차례(qauser0)면 그 줄과 로그인 줄이 실패하고 caps 에 없는 layout 은 미실행', async () => {
  const g = standardScreen((t) => keyFilter(8)(t.slice(0, 8)));
  g.caps = g.caps.filter((c) => c !== 'layout');
  const r = await conform(direct(g), hooks(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [49, 2, 1], report(r));
  assert.match(report(r), /✗ type IdInput 'qa_user01!' → qauser01 — IdInput: "qauser0"/);
  assert.match(report(r), /- layout 이 답한다 \(미실행 — 이 SDK 의 caps 에 layout 없음\)/);
});

// 장면 줄(A)은 표준 화면을 새로 만든다 — 앞 판 상태를 남기려고 scene-load 를 뺀다(B 영구 id 줄 · D 장면 알림 줄도 같이 미실행).
const keepScreen = (g: FakeGame) => ((g.caps = g.caps.filter((c) => c !== 'scene-load')), g);

test('같은 게임에 다시 돌려도 통과하고, 둘째 판은 Item 을 다른 칸(Slot[2])으로 옮긴다', async () => {
  const g = keepScreen(standardScreen());
  await conform(direct(g), hooks(g));
  const r = await conform(direct(g), hooks(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [47, 0, 5], report(r));
  assert.ok(flatten(g.roots).some((e) => e.path === '/SampleCanvas/Bag/Slot[2]/Item'), report(r));
});

test('다시 돌릴 때 누르기 · 끌기가 안 먹으면 앞 판 글자 · 자리가 남아 있어도 실패한다', async () => {
  const g = keepScreen(standardScreen());
  await conform(direct(g), hooks(g));
  byName(g, 'LoginButton').onClick = undefined;
  byName(g, 'Item').movable = false;
  const r = await conform(direct(g), hooks(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [42, 5, 5], report(r));
  assert.match(report(r), /✗ click LoginButton → StatusText 에 「login qauser01」 — StatusText: "login qauser01 \d+"/);
  assert.match(report(r), /✗ drag Item → 다른 칸 — \/SampleCanvas\/Bag\/Slot\[3\]\/Item 있음: false/);
  assert.match(report(r), /✗ C click LoginButton count 2 → 끝 번호가 2 늚/);
});

test('caps 에 find 가 없으면 find 로 확인하는 줄(누르기 · 끌기)도 미실행', async () => {
  const g = standardScreen();
  g.caps = g.caps.filter((c) => c !== 'find');
  const r = await conform(direct(g), hooks(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [20, 0, 32], report(r));
  assert.match(report(r), /- click LoginButton → StatusText 에 「login qauser01」 \(미실행 — 이 SDK 의 caps 에 find 없음\)/);
});

test('A 줄 — 장면을 바꿨다 돌아오면 표준 화면이 새로 서고, 저장 값 · 시간 배율이 남지 않는다', async () => {
  const g = standardScreen();
  await conform(direct(g), hooks(g));
  const r = await conform(direct(g), hooks(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [52, 0, 0], report(r));
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

test('B 줄 — 옛 SDK(caps 에 find-all 없음)에 선택자 · inactive 를 보내면 보내기 전에 거절한다', async () => {
  const g = standardScreen();
  g.caps = g.caps.filter((c) => c !== 'find-all');
  const game = direct(g);
  await game.ping();
  await assert.rejects(game.find('//*[@tag=Player]'), /이 게임의 SDK 는 선택자 · inactive · camera 를 못 읽습니다 — SDK 0\.5\.0 이상/);
  await assert.rejects(game.find('HiddenText', { inactive: true }), /SDK 0\.5\.0 이상/);
  assert.equal((await game.find('/SampleCanvas/Bag/Slot[0]/Item'))?.path, '/SampleCanvas/Bag/Slot[0]/Item');
  assert.equal(g.commands.filter((c) => c.cmd === 'find').length, 1);
});

test('B 줄 — waitForProp 은 값이 될 때까지 get 을 되풀이하고, 글자 · 숫자 · 배열을 같게 본다', async () => {
  const g = standardScreen();
  const game = direct(g);
  const cube = byName(g, 'WorldCube');
  let later = 3;
  cube.props!['Probe.count'] = 0;
  g.onGet = () => {
    if (later-- === 0) cube.props!['Probe.count'] = 10;
  };
  await game.waitForProp('WorldCube', 'Probe.count', '10');
  await game.waitForProp('WorldCube', 'Probe.count', 10);
  await game.waitForProp('WorldCube', 'Transform.position', '[0, 0, 5]');
  await assert.rejects(game.waitForProp('WorldCube', 'Probe.count', 11, { timeoutMs: 30 }), /WorldCube 의 Probe\.count 이 0\.03초 안에 11 이 되지 않았습니다 \(마지막: 10\)/);
});

test('C 줄 — 옛 SDK(caps 에 touch-down 없음)에 횟수 · 시간 · 세기 · 여러 키를 보내면 보내기 전에 거절한다', async () => {
  const g = standardScreen();
  g.caps = g.caps.filter((c) => c !== 'touch-down');
  const game = direct(g);
  await game.ping();
  await assert.rejects(game.click('LoginButton', { count: 2 }), /이 게임의 SDK 는 횟수 · 시간 · 세기 · 여러 키 · via 를 못 읽습니다 — SDK 0\.6\.0 이상/);
  await assert.rejects(game.key('I', { duration: 1 }), /SDK 0\.6\.0 이상/);
  await assert.rejects(game.key('A+LeftShift'), /SDK 0\.6\.0 이상/);
  await game.key('I');
  assert.deepEqual(g.commands.filter((c) => c.cmd === 'key').map((c) => c.key), ['I']);
  // + 는 key 명령의 여러 키일 때만 — PlayerPrefs 키 이름의 + 는 옛 SDK 도 읽는다
  await game.setPref('a+b', 'v');
});

test('C 줄 — 가짜 SDK 도 SDK 처럼 count 1 미만 · power -1~1 밖을 거절하고 키 이름의 빈칸을 무시한다', async () => {
  const g = standardScreen();
  const game = direct(g);
  await assert.rejects(game.click('LoginButton', { count: 0 }), /count 는 1 이상입니다/);
  await assert.rejects(game.keyDown('A', { power: 5 }), /power 는 -1~1 입니다/);
  // 누를 때마다 2프레임(30fps) — 7.35초 + 100프레임은 10초 답 한도를 넘는다
  await assert.rejects(game.click('LoginButton', { count: 50, interval: 0.15 }), /click 은 8초 안이어야 합니다/);
  await assert.rejects(game.click('LoginButton', { count: 1.5 }), /count 는 정수입니다/);
  await game.keyDown('A + LeftShift');
  await game.keyUp('A+LeftShift');
  assert.equal(g.held.size, 0);
});

test('C 줄 — 손가락은 비어 있는 가장 작은 번호(10~19)를 받고, 10개면 거절하고, input-reset 이 다 뗀다', async () => {
  const g = standardScreen();
  const game = direct(g);
  const fingers: number[] = [];
  for (let i = 0; i < 10; i++) fingers.push(await game.touchDown({ x: i, y: i }));
  assert.deepEqual(fingers, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  await assert.rejects(game.touchDown('StatusText'), /손가락 10개가 다 눌려 있습니다 — touch-up · input-reset 으로 뗍니다/);
  await game.touchUp(12);
  assert.equal(await game.touchDown('StatusText'), 12);
  await assert.rejects(game.touchMove(9, 'Item'), /손가락 9 은 눌려 있지 않습니다 — touch-down 이 준 번호를 씁니다/);
  await game.keyDown('W+A');
  assert.equal((await game.find('InputText'))?.text, 'fingers 10 · keys A W · axis -1 · fire 0 · tilt -');
  await game.resetInput();
  assert.equal((await game.find('InputText'))?.text, 'fingers 0 · keys - · axis 0 · fire 0 · tilt -');
  assert.equal(await game.touchDown('Item'), 10);
});

test('C 줄 — 8초 넘는 입력 · 자리 없는 한 점 명령 · 틀린 점 · UI Toolkit pointer 는 SDK 처럼 거절한다', async () => {
  const game = direct(standardScreen());
  await assert.rejects(game.longPress('HoldBox', { duration: 9 }), /long-press 은 8초 안이어야 합니다 — 더 길게는 touch-down · key-down 뒤 touch-up · key-up/);
  await assert.rejects(game.click('LoginButton', { count: 50, interval: 0.2 }), /click 은 8초 안이어야 합니다/);
  await assert.rejects(game.call({ cmd: 'touch-down' }), /touch-down 에 target 또는 x · y 가 필요합니다/);
  await assert.rejects(game.swipe([{ x: 1, y: 1 }]), /swipe 의 points 는 "x,y" 글자 둘 이상입니다/);
  await assert.rejects(game.pointer('UitkLoginButton', 'down'), /UitkLoginButton 은 UI Toolkit 요소라 pointer 를 못 보냅니다 — mouse-move · touch-down 으로/);
});

const P2C = ['touch-down', 'touch-move', 'touch-up', 'swipe', 'long-press', 'mouse-move', 'scroll', 'key-down', 'key-up', 'tilt', 'pointer', 'input-reset'];

test('C 줄 — 옛 SDK(caps 에 P2-C 명령 없음)면 C 줄 15개는 미실행', async () => {
  const g = standardScreen();
  g.caps = g.caps.filter((c) => !P2C.includes(c));
  const r = await conform(direct(g), hooks(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [37, 0, 15], report(r));
  assert.match(report(r), /- C 손가락 둘 — touch-down 둘 → fingers 2 · touch-up → fingers 0 \(미실행 — 이 SDK 의 caps 에 touch-down · touch-up · input-reset 없음\)/);
});

test('D 줄 — 앱을 뒤로 보낼 길이 없으면(PC · iPhone) 일시정지 줄만 미실행이다', async () => {
  const g = standardScreen();
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [51, 0, 1], report(r));
  assert.match(report(r), /- D 일시정지 알림 — 앱을 2초 뒤로 → game\.paused · game\.resumed \(미실행 — 앱을 뒤로 보낼 길 없음: PC · iPhone · Appium 없는 USB\)/);
});

test('D 줄 — 알림은 장면 열림 · 닫힘 · 일시정지를 차례로, 로그는 40자 넘는 토큰을 *** 로 싣는다', async () => {
  const g = standardScreen();
  const game = direct(g);
  const from = (await game.events()).last;
  await game.loadScene('Second', { add: true });
  await game.unloadScene('Second');
  g.background();
  assert.deepEqual((await game.events(from)).events.map((e) => [e.seq, e.type]), [[from + 1, 'scene.loaded'], [from + 2, 'scene.unloaded'], [from + 3, 'game.paused'], [from + 4, 'game.resumed']]);
  await game.callStatic('Sample.TouchProbe.Log', [`key=${'k'.repeat(40)} short=${'s'.repeat(39)}`]);
  const logs = await game.logs();
  assert.equal(logs.logs.at(-1)?.message, `key=*** short=${'s'.repeat(39)}`);
  assert.equal(logs.logs.at(-1)?.type, 'Log');
});

test('D 줄 — sdk-log 는 값 칸을 「이름=***」로, 실패 글 속 입력값도 *** 로 적고, 알림 읽기 · sdk-log · 끈 뒤는 안 적는다', async () => {
  const g = standardScreen();
  const game = direct(g);
  await game.sdkLog(true);
  await game.type('IdInput', 'hunter2');
  await assert.rejects(game.setPref('lv', 'hunter3', 'int'), /「hunter3」은 int 가 아닙니다/);
  await game.callMethod('SampleCanvas', 'TouchProbe.Say', ['hunter4', '1']);
  await game.logs();
  await game.events();
  await game.errors();
  await game.sdkLog(false);
  await game.click('LoginButton');
  assert.deepEqual(
    g.logs.map((l) => l.message),
    [
      '[ControlCli] type IdInput text=*** — 성공',
      '[ControlCli] pref-set lv value=*** — 실패: 「***」은 int 가 아닙니다',
      '[ControlCli] call SampleCanvas TouchProbe.Say args=*** — 성공',
    ],
  );
});
