// Recorder — 단계 꼴 검사 · 가짜 표준 화면에 다시 돌리기 · 내보낸 TS 테스트를 실제로 node --test 로 돌려 초록인지 본다
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { exec, FakeGame, fakeTcp, node, RECORDED, standardScreen } from './fake-game.js';
import { Game, WAIT } from './game.js';
import { tcpLink } from './link.js';
import { exportTest, LANGS, replay, steps, typeStep, type Step } from './recorder.js';

Object.assign(WAIT, { intervalMs: 5 });
const ROOT = join(import.meta.dirname, '..');
const SAMPLE = RECORDED;

test('steps — 꼴이 틀린 단계는 몇 번째인지 알린다 · {steps} 도 받는다', () => {
  assert.deepEqual(steps({ steps: SAMPLE }), SAMPLE);
  assert.throws(() => steps([{ do: 'click' }]), /1번째 단계/);
  assert.throws(() => steps([{ do: 'click', target: 'A' }, { check: 'prop', target: 'A', prop: 'x' }]), /2번째 단계/);
  assert.throws(() => steps([{ do: 'type', target: 'A', secret: 'X; rm' }]), /1번째 단계/);
  assert.throws(() => steps('x'), /단계 목록/);
});

test('replay — 가짜 표준 화면에 차례로 통과, 틀린 기대값은 그 단계에서 멈춘다', async () => {
  const pc = await fakeTcp(standardScreen());
  try {
    const game = new Game(tcpLink(pc.port));
    const ok = await replay(game, SAMPLE);
    assert.equal(ok.ok, true, ok.lines.join('\n'));
    assert.equal(ok.lines[1], "통과 · await game.click('LoginButton');");
    game.waitMs = 50;
    const bad = await replay(game, [{ check: 'text', target: 'StatusText', contains: 'nope' }, { do: 'click', target: 'LoginButton' }]);
    assert.equal(bad.ok, false);
    assert.equal(bad.lines.length, 1);
    assert.match(bad.lines[0], /^실패 · await game\.waitFor\('StatusText', \{ text: 'nope' \}\);\n {2}.+/);
  } finally {
    pc.server.close();
  }
});

test('비밀번호 칸 — 글자 대신 환경 변수 이름을 적고, 돌릴 때 그 변수에서 읽는다', async () => {
  const pw = node('PwInput', { kind: 'InputField', interactable: true, text: '', password: true });
  const pc = await fakeTcp(new FakeGame([pw], 'S'));
  try {
    const game = new Game(tcpLink(pc.port));
    const s = await typeStep(game, 'PwInput', 'hunter2');
    assert.deepEqual(s, { do: 'type', target: 'PwInput', secret: 'SECRET_PWINPUT' });
    for (const lang of LANGS) assert.doesNotMatch(exportTest([s], lang), /hunter2/);
    assert.equal((await replay(game, [s], {})).ok, false);
    assert.equal((await replay(game, [s], { SECRET_PWINPUT: 'pw' })).ok, true);
    assert.equal(pw.text, 'pw');
  } finally {
    pc.server.close();
  }
});

test('exportTest — 언어마다 동작 · 확인 줄, 따옴표 · 줄바꿈 · Robot 변수 꼴은 감싼다', () => {
  const tricky: Step[] = [{ do: 'type', target: "It's", text: 'a\\b"c\n${x}  y' }];
  assert.match(exportTest(tricky, 'ts'), /await game\.type\('It\\'s', 'a\\\\b"c\\n\$\{x\}  y'\);/);
  assert.match(exportTest(tricky, 'py'), /game\.type\("It's", "a\\\\b\\"c\\n\$\{x\}  y"\)/);
  assert.match(exportTest(tricky, 'robot'), /^ {4}Type {4}It's {4}a\\\\b"c\\n\\\$\{x\}\$\{SPACE\}\$\{SPACE\}y$/m);
  assert.match(exportTest(SAMPLE, 'java'), /until\("WorldCube 의 Transform\.position = \[0,0,5\]"/);
  assert.match(exportTest(SAMPLE, 'cs'), /^game\.Click\("LoginButton"\);$/m);
  assert.throws(() => exportTest(SAMPLE, 'rb' as never), /언어는/);
});

test('내보낸 TS 테스트를 node --test 로 돌리면 초록, 틀린 기대값이면 빨강', async () => {
  const pc = await fakeTcp(standardScreen());
  // 저장소 안이라야 import 'control-cli' 가 package 자기 참조로 dist 를 찾는다.
  const dir = await mkdtemp(join(ROOT, '.recorder-'));
  const go = async (list: Step[]) => {
    const file = join(dir, 'recorded.test.ts');
    await writeFile(file, exportTest(list, 'ts'));
    return exec(process.execPath, ['--experimental-strip-types', '--no-warnings', '--test', file], { CONTROL_CLI_GAME: `tcp://127.0.0.1:${pc.port}` });
  };
  try {
    const ok = await go(SAMPLE);
    assert.equal(ok.code, 0, ok.text);
    const bad = await go([{ check: 'prop', target: 'Nothing', prop: 'X.y', equals: 1 }]);
    assert.equal(bad.code, 1, bad.text);
    assert.match(bad.text, /X\.y 칸이 없습니다/);
  } finally {
    pc.server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
