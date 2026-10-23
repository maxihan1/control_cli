// CLI 를 가짜 디바이스 팜 · 가짜 게임에 붙여 잡기 → 열기 → 액션 → Ran 줄 → 닫기 → 놓기를 돌려 본다
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { run, TIMING } from './cli.js';
import { button, fakeFarm, FakeGame, node } from './fake-game.js';
import { SETTLE, WAIT } from './game.js';

Object.assign(SETTLE, { maxMs: 30, stepMs: 5 });
Object.assign(WAIT, { intervalMs: 5 });
Object.assign(TIMING, { openWaitMs: 200, openStepMs: 5 });

const status = node('StatusText', { text: '' });
const game = new FakeGame([
  node('Boot', {}, [
    node('LoginView', {}, [
      node('IdInput', { kind: 'InputField', interactable: true, text: '' }),
      button('LoginButton', '로그인', () => (status.text = '아이디는 4~16자입니다')),
      button('SignupButton', '가입'),
      status,
      node('Player', { props: { 'PlayerController.moveSpeed': 4.5 } }),
    ]),
  ]),
]);
let farm: Awaited<ReturnType<typeof fakeFarm>>;
let dir: string;
const cli = (...argv: string[]) => run(argv, { env: { PLATFORM_APPIUM_URL: farm.url, PLATFORM_APP: 'http://builds/qa.apk' }, dir });

before(async () => {
  farm = await fakeFarm(game);
  dir = await mkdtemp(join(tmpdir(), 'control-cli-'));
});
after(() => farm.server.close());

test('잡기 전에는 열지 않는다', async () => {
  await assert.rejects(cli('open'), /hold 부터/);
});

test('잡기 → 열기 → 화면 → 액션마다 Ran 줄 → 닫기 → 놓기', async () => {
  assert.match(await cli('hold'), /폰 R1 잡음/);
  const opened = await cli('open');
  assert.match(opened, /세션 default 열림 — com\.fake\.game 1\.0 \(디바이스 팜 R1\)/);
  assert.match(opened, /- Screenshot: .*\.png/);
  assert.ok(farm.seen.includes('POST /wd/hub/session'));

  const shot = (await readFile(/- Snapshot: (.*\.yml)/.exec(opened)![1], 'utf8')).split('\n');
  assert.equal(shot[0], '# 장면 Boot · 화면 2400×1080');
  assert.ok(shot.includes('- LoginView [ref=e1]'));
  assert.ok(shot.includes('  - InputField IdInput "" [ref=e2]'));
  assert.ok(shot.includes('  - Button LoginButton [ref=e3]'));
  assert.ok(shot.includes('    - Text Text "로그인" [ref=e4]'));

  assert.match(await cli('type', 'e2', "qa'01"), /^Ran: await game\.type\('IdInput', 'qa\\'01'\)\n- 칸 글자: "qa'01"/);
  assert.match(await cli('click', 'e3'), /^Ran: await game\.click\('LoginButton'\)\n- Snapshot:/);
  assert.match(await cli('text', 'StatusText'), /Ran: await game\.text\('StatusText'\)\n- 값: "아이디는 4~16자입니다"/);
  assert.match(await cli('wait', 'StatusText', '--text', '아이디는', '--timeout', '1'), /^Ran: await game\.waitFor\('StatusText', \{ text: '아이디는', timeoutMs: 1000 \}\)/);
  assert.match(await cli('wait', 'Nothing', '--gone'), /^Ran: await game\.waitFor\('Nothing', \{ gone: true \}\)/);
  await assert.rejects(cli('wait', 'Nothing', '--timeout', '0.05'), /Nothing 이 0\.05초 안에 뜨지 않았습니다 \(마지막: 없음\)/);
  assert.match(await cli('get', 'Player', 'PlayerController.moveSpeed'), /Ran: await game\.get\('Player', 'PlayerController\.moveSpeed'\)\n- 값: 4\.5/);
  assert.match(await cli('layout'), /Ran: await game\.layout\(\)\n- 검사 2개 · 문제 1개\n- 겹침: \/C\/A ↔ \/C\/B/);
  // 같은 이름이 여럿인 Text 는 경로가 주소다
  assert.match(await cli('find', 'e4'), /Ran: await game\.find\('\/Boot\/LoginView\/LoginButton\/Text'\)/);
  // 좌표 누르기는 Ran 줄을 찍지 않는다
  assert.doesNotMatch(await cli('tap', '10', '20'), /Ran:/);

  assert.deepEqual(game.commands.find((c) => c.cmd === 'type'), { cmd: 'type', target: 'IdInput', text: "qa'01" });
  assert.match(await cli('close'), /세션 default 닫음 — 폰은 아직 잡혀 있습니다/);
  assert.match(await cli('release'), /폰 R1 놓음/);
  assert.ok(farm.seen.includes('DELETE /wd/hub/session/S1'));
  assert.ok(farm.seen.includes('DELETE /api/devices/R1/hold'));
});

test('ref 는 마지막 화면 것만 · 팜 거절은 까닭을 그대로', async () => {
  await cli('hold');
  await cli('-s=b', 'open');
  await assert.rejects(cli('-s=b', 'click', 'e99'), /ref e99 가 마지막 화면에 없습니다/);
  await assert.rejects(cli('-s=b', 'text', 'Text'), /Text 이 2개라 하나를 고를 수 없습니다/);
  await cli('release');
  await assert.rejects(cli('-s=b', 'ping'), /HTTP 409 로 거절했습니다: 잡은 폰이 아니다/);
  await cli('-s=b', 'close');
  await assert.rejects(cli('-s=b', 'ping'), /열린 세션이 없습니다/);
});
