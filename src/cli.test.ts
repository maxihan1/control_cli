// CLI 를 가짜 디바이스 팜 · 가짜 게임에 붙여 잡기 → 열기 → 액션 → Ran 줄 → 닫기 → 놓기를 돌려 본다
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { capabilities } from './appium.js';
import { run, TIMING } from './cli.js';
import { button, fakeFarm, FakeGame, fakeTcp, fakeUsbmux, node } from './fake-game.js';
import { SETTLE, WAIT } from './game.js';

Object.assign(SETTLE, { maxMs: 30, stepMs: 5 });
Object.assign(WAIT, { intervalMs: 5 });
Object.assign(TIMING, { openWaitMs: 200, openStepMs: 5, cleanWaitMs: 100, cleanStepMs: 5 });

const status = node('StatusText', { text: '' });
const game = new FakeGame([
  node('Boot', {}, [
    node('LoginView', {}, [
      node('IdInput', { kind: 'InputField', interactable: true, text: '' }),
      button('LoginButton', '로그인', () => (status.text = '아이디는 4~16자입니다')),
      button('SignupButton', '가입'),
      status,
      node('PwInput', { kind: 'InputField', interactable: true, text: '', password: true }),
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

test('versionCode 가 같은 새 QA 빌드도 늘 다시 깐다', () => {
  assert.equal(capabilities('qa.apk')['appium:enforceAppInstall'], true);
});

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

test('비밀번호 칸에 넣은 글자는 Ran 줄에 싣지 않는다', async () => {
  await cli('hold');
  await cli('-s=c', 'open');
  const out = await cli('-s=c', 'type', 'PwInput', 'S3cret!');
  assert.match(out, /^Ran: await game\.type\('PwInput', '\*\*\*'\)\n- 비밀번호 칸이라/);
  assert.doesNotMatch(out, /S3cret/);
  await cli('-s=c', 'close');
  await cli('release');
});

test('Appium 이 세션을 이미 끝냈어도 close 는 파일을 지워 다시 열 수 있다 · 다른 폰을 놓아도 잡은 폰 기록은 남는다', async () => {
  await cli('hold');
  await cli('-s=d', 'open');
  farm.state.sessionGone = true;
  try {
    assert.match(await cli('-s=d', 'close'), /세션 d 닫음 \(Appium 세션은 이미 없음: .*HTTP 404/);
  } finally {
    farm.state.sessionGone = false;
  }
  assert.match(await cli('-s=d', 'open'), /세션 d 열림/);
  await cli('-s=d', 'close');
  await cli('release', '--udid', 'R2');
  assert.equal(await readFile(join(dir, 'held'), 'utf8'), 'R1');
  await cli('release');
});

test('방금 놓은 폰을 팜이 정리하는 동안은 기다렸다가 잡는다', async () => {
  let calls = 0;
  farm.state.devices = () => [{ serial: 'R1', state: ++calls < 3 ? 'OCCUPIED' : 'IDLE', detail: calls < 3 ? 'cleaning' : 'ready' }];
  try {
    assert.match(await cli('hold'), /폰 R1 잡음/);
    assert.equal(calls, 3);
  } finally {
    farm.state.devices = () => [{ serial: 'R1', state: 'IDLE', detail: 'ready' }];
    await cli('release');
  }
});

test('빈 폰도 정리 중인 폰도 없으면 기다리지 않고 다른 실행이 쓰는 중이라고 거절한다', async () => {
  let calls = 0;
  farm.state.devices = () => (calls++, [{ serial: 'R1', state: 'OCCUPIED', detail: 'session' }]);
  try {
    await assert.rejects(cli('hold'), /잡을 수 있는 빈 폰이 없습니다 — 폰이 다른 실행에 쓰이는 중일 수 있습니다/);
    assert.equal(calls, 1);
  } finally {
    farm.state.devices = () => [{ serial: 'R1', state: 'IDLE', detail: 'ready' }];
  }
});

test('정리가 기다림 한도를 넘기면 다른 실행 탓이 아니라 팜이 정리하는 중이라고 거절한다', async () => {
  farm.state.devices = () => [{ serial: 'R1', state: 'OCCUPIED', detail: 'cleaning' }];
  try {
    await assert.rejects(cli('hold'), (e: Error) => /디바이스 팜이 놓은 폰을 정리하는 중이라 아직 못 잡습니다/.test(e.message) && !/다른 실행/.test(e.message));
  } finally {
    farm.state.devices = () => [{ serial: 'R1', state: 'IDLE', detail: 'ready' }];
  }
});

test('PC — 띄운 게임에 adb 없이 붙고, 스크린샷은 게임이 찍고, key 는 Ran 줄을 남기고, close 가 게임을 끈다', async () => {
  const pc = await fakeTcp(game);
  const port = String(pc.port);
  const macos = join(dir, 'Game.app', 'Contents', 'MacOS');
  await mkdir(macos, { recursive: true });
  // exec 로 sh 를 sleep 으로 바꾼다 — close 가 끈 프로세스가 곧 게임이라 고아가 남지 않는다.
  await writeFile(join(macos, 'game'), '#!/bin/sh\nexec sleep 30\n', { mode: 0o755 });
  try {
    const opened = await cli('-s=pc', 'open', '--pc', '--app', join(dir, 'Game.app'), '--port', port);
    assert.match(opened, /세션 pc 열림 — com\.fake\.game 1\.0 \(PC · 프로세스 \d+\)/);
    assert.equal(await readFile(/- Screenshot: (.*\.jpg)/.exec(opened)![1], 'utf8'), 'jpg');
    assert.match(await cli('-s=pc', 'key', 'Escape', '--port', port), /Ran: await game\.key\('Escape'\)/);
    assert.equal(game.keys.at(-1), 'Escape');
    assert.match(await cli('-s=pc', 'close'), /게임\(프로세스 \d+\)을 껐습니다/);
  } finally {
    pc.server.close();
  }
});

test('iPhone — usbmuxd 로 USB 폰(Wi-Fi 쪽 말고)의 13100 에 붙고, 스크린샷은 게임이 찍는다', async () => {
  const path = join(dir, 'usbmuxd.sock');
  const mux = await fakeUsbmux(game, path);
  process.env.USBMUXD_SOCKET_ADDRESS = `UNIX:${path}`;
  try {
    const opened = await cli('-s=ios', 'open', '--ios');
    assert.match(opened, /세션 ios 열림 — com\.fake\.game 1\.0 \(iPhone UDID-1\)/);
    assert.match(opened, /- Screenshot: .*\.jpg/);
    assert.match(await cli('-s=ios', 'click', 'LoginButton'), /Ran: await game\.click\('LoginButton'\)/);
    assert.ok(mux.connects.length >= 3);
    assert.deepEqual(new Set(mux.connects.map((c) => `${c.id}:${c.port}`)), new Set(['9:13100']));
    assert.equal(await cli('-s=ios', 'close'), '세션 ios 닫음');
    await assert.rejects(cli('-s=ios2', 'open', '--ios', '--udid', 'NOPE'), /USB 로 꽂힌 iPhone 중에 NOPE 가 없습니다/);
  } finally {
    delete process.env.USBMUXD_SOCKET_ADDRESS;
    mux.server.close();
  }
});

test('--usb · --pc · --ios 는 하나만 쓰고, PC 는 팜용 PLATFORM_APP 을 띄우지 않는다', async () => {
  await assert.rejects(cli('-s=both', 'open', '--usb', '--pc'), /--usb · --pc · --ios 는 하나만 씁니다/);
  const pc = await fakeTcp(game);
  try {
    assert.match(await cli('-s=pc2', 'open', '--pc', '--port', String(pc.port)), /\(PC\)/);
    assert.equal(await cli('-s=pc2', 'close'), '세션 pc2 닫음');
  } finally {
    pc.server.close();
  }
});
