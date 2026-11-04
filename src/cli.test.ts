// CLI 를 가짜 디바이스 팜 · 가짜 게임에 붙여 잡기 → 열기 → 액션 → Ran 줄 → 닫기 → 놓기를 돌려 본다
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { capabilities } from './appium.js';
import { run, TIMING } from './cli.js';
import { CONFORM } from './conform.js';
import { button, fakeFarm, FakeGame, fakeTcp, fakeUsbmux, node, standardScreen } from './fake-game.js';
import { SETTLE, WAIT } from './game.js';

Object.assign(SETTLE, { maxMs: 30, stepMs: 5 });
Object.assign(WAIT, { intervalMs: 5 });
Object.assign(CONFORM, { waitMs: 50, holdS: 0, dragS: 0, keyS: 0 });
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

test('게임 SDK 의 caps 에 없는 명령은 보내지 않고 미리 거절한다 · open 줄에 엔진 · SDK 판', async () => {
  const g = new FakeGame([node('Boot', {}, [node('A', { text: 'a' })])]);
  g.caps = g.caps.filter((c) => c !== 'layout');
  const pc = await fakeTcp(g);
  const port = String(pc.port);
  try {
    assert.match(await cli('-s=caps', 'open', '--pc', '--port', port), /\(PC\) · fake 0 · SDK 0\.3\.0/);
    await assert.rejects(cli('-s=caps', 'layout', '--port', port), /이 게임의 SDK 는 layout 를 못 합니다/);
    assert.ok(!g.commands.some((c) => c.cmd === 'layout'), 'layout 이 게임에 갔습니다');
    // 게임을 새 SDK 로 다시 띄운 뒤 — ping 이 세션의 caps 를 새로 적는다
    g.caps.push('layout');
    await cli('-s=caps', 'ping', '--port', port);
    assert.match(await cli('-s=caps', 'layout', '--port', port), /Ran: await game\.layout\(\)/);
    await cli('-s=caps', 'close');
    // 배열이 아닌 caps 는 믿지 않는다 — 글자 일부로 맞춰 거절하지 않고 옛 SDK 처럼 다 보낸다
    (g as unknown as { caps: unknown }).caps = 'ping tree';
    await cli('-s=caps', 'open', '--pc', '--port', port);
    assert.match(await cli('-s=caps', 'layout', '--port', port), /Ran: await game\.layout\(\)/);
    await cli('-s=caps', 'close');
  } finally {
    pc.server.close();
  }
});

test('conform — 표준 화면이면 48줄 통과, 다르면 종료 코드로 알린다', async () => {
  const ok = await fakeTcp(standardScreen());
  const bad = await fakeTcp(new FakeGame([node('Boot')]));
  try {
    await cli('-s=cf', 'open', '--pc', '--port', String(ok.port));
    assert.match(await cli('-s=cf', 'conform', '--port', String(ok.port)), /통과 48 · 실패 0 · 건너뜀 0/);
    await cli('-s=cf', 'close');
    await cli('-s=cf2', 'open', '--pc', '--port', String(bad.port));
    await assert.rejects(cli('-s=cf2', 'conform', '--port', String(bad.port)), /통과 \d+ · 실패 [1-9]/);
    await cli('-s=cf2', 'close');
  } finally {
    ok.server.close();
    bad.server.close();
  }
});

test('게임 상태 명령 — Ran 줄이 kit 의 game.* 이름 · 인자 꼴로 찍힌다', async () => {
  const pc = await fakeTcp(standardScreen());
  const gs = (...argv: string[]) => cli('-s=gs', ...argv, '--port', String(pc.port));
  try {
    await gs('open', '--pc');
    assert.match(await gs('call', 'SampleCanvas', 'TouchProbe.Say', 'hi', '3'), /^Ran: await game\.callMethod\('SampleCanvas', 'TouchProbe\.Say', \['hi', '3'\]\)\n- 값: "hi 3"\n- Snapshot:/);
    assert.match(await gs('set', 'StatusText', 'Text.text', 'x'), /^Ran: await game\.set\('StatusText', 'Text\.text', 'x'\)\n- 값: "x"/);
    assert.match(await gs('static-call', 'Sample.TouchProbe.Add', '2', '3'), /^Ran: await game\.callStatic\('Sample\.TouchProbe\.Add', \['2', '3'\]\)\n- 값: 5/);
    assert.match(await gs('static-set', 'Sample.TouchProbe.Note', 'n'), /^Ran: await game\.setStatic\('Sample\.TouchProbe\.Note', 'n'\)\n- 값: "n"/);
    assert.equal(await gs('static-get', 'Sample.TouchProbe.Note'), "Ran: await game.getStatic('Sample.TouchProbe.Note')\n- 값: \"n\"");
    assert.equal(await gs('pref-set', 'lv', '3', '--type', 'int'), "Ran: await game.setPref('lv', '3', 'int')");
    assert.equal(await gs('pref-get', 'lv', '--type', 'int'), "Ran: await game.pref('lv', 'int')\n- 값: 3");
    assert.equal(await gs('pref-get', 'nope'), "Ran: await game.pref('nope')\n- 값: null");
    assert.equal(await gs('pref-delete', 'lv'), "Ran: await game.deletePref('lv')");
    assert.equal(await gs('pref-clear'), 'Ran: await game.clearPrefs()');
    assert.equal(await gs('timescale-set', '0.5'), 'Ran: await game.setTimeScale(0.5)');
    assert.equal(await gs('timescale-get'), 'Ran: await game.timeScale()\n- 값: 0.5');
    assert.match(await gs('scene-load', 'Second', '--add'), /^Ran: await game\.loadScene\('Second', \{ add: true \}\)\n- Snapshot:/);
    assert.match(await gs('scenes'), /^Ran: await game\.scenes\(\)\n- 값: \{"active":"Sample","loaded":\["Sample","Second"\]/);
    assert.match(await gs('scene-unload', 'Second'), /^Ran: await game\.unloadScene\('Second'\)\n- Snapshot:/);
    assert.match(await gs('scene-wait', 'Sample', '--timeout', '5'), /^Ran: await game\.waitForScene\('Sample', \{ timeoutMs: 5000 \}\)/);
    await assert.rejects(gs('timescale-set', 'fast'), /timescale-set <배율> 꼴이어야 합니다/);
    await assert.rejects(gs('call', 'SampleCanvas'), /call <ref\|주소> <컴포넌트\.메서드> \[인자…\] 꼴이어야 합니다/);
    await assert.rejects(gs('pref-get', 'lv', '--type', 'bool'), /--type 은 string · int · float 중 하나입니다/);
    await gs('close');
  } finally {
    pc.server.close();
  }
});

test('찾기 · 설정 명령 — Ran 줄이 kit 의 game.* 이름 · 인자 꼴로 찍힌다', async () => {
  const pc = await fakeTcp(standardScreen());
  const fs = (...argv: string[]) => cli('-s=fs', ...argv, '--port', String(pc.port));
  try {
    await fs('open', '--pc');
    assert.match(await fs('find', '//*[@tag=Player]'), /^Ran: await game\.find\('\/\/\*\[@tag=Player\]'\)\n- 값: \{"path":"\/WorldCube"/);
    assert.match(await fs('find', 'HiddenText', '--inactive'), /^Ran: await game\.find\('HiddenText', \{ inactive: true \}\)\n- 값: .*"active":false/);
    assert.match(await fs('find-all', '//Bag/Slot'), /^Ran: await game\.findAll\('\/\/Bag\/Slot'\)\n- 값: \[\{"path":"\/SampleCanvas\/Bag\/Slot\[0\]"/);
    assert.match(await fs('find', 'WorldCube', '--camera', 'SideCamera'), /^Ran: await game\.find\('WorldCube', \{ camera: 'SideCamera' \}\)\n- 값: .*"x":400/);
    assert.equal(await fs('find-at', '540', '600'), '- 좌표 (540, 600) 의 맨 위: /WorldCube — 케이스에는 주소로 씁니다');
    assert.equal(await fs('find-at', '1', '1'), '- 좌표 (1, 1) 에 맞는 것이 없습니다');
    assert.match(await fs('parent', 'Item'), /^Ran: await game\.parent\('Item'\)\n- 값: \{"path":"\/SampleCanvas\/Bag\/Slot\[0\]"/);
    assert.match(await fs('wait-prop', 'UitkLoginButton', 'text', 'UITK Login', '--timeout', '5'), /^Ran: await game\.waitForProp\('UitkLoginButton', 'text', 'UITK Login', \{ timeoutMs: 5000 \}\)/);
    assert.match(await fs('components', 'SampleCanvas'), /^Ran: await game\.components\('SampleCanvas'\)\n- 값: .*"TouchProbe"/);
    assert.match(await fs('members', 'SampleCanvas', 'TouchProbe'), /^Ran: await game\.members\('SampleCanvas', 'TouchProbe'\)\n- 값: .*"Say"/);
    assert.match(await fs('text-set', 'StatusText', 'hi'), /^Ran: await game\.setText\('StatusText', 'hi'\)\n- 칸 글자: "hi"\n- Snapshot:/);
    assert.match(await fs('get', 'HiddenText', 'Text.text', '--inactive'), /^Ran: await game\.get\('HiddenText', 'Text\.text', \{ inactive: true \}\)\n- 값: "hidden"/);
    assert.match(await fs('click', 'WorldCube', '--camera', 'SideCamera'), /^Ran: await game\.click\('WorldCube', \{ camera: 'SideCamera' \}\)/);
    assert.equal(await fs('config'), '- 기본 기다림 10초 — wait · wait-prop (장면 기다림은 30초)');
    assert.equal(await fs('config', '--wait', '20'), '- 기본 기다림 20초 — wait · wait-prop (장면 기다림은 30초)');
    assert.equal(await fs('config'), '- 기본 기다림 20초 — wait · wait-prop (장면 기다림은 30초)');
    assert.match(await fs('snapshot', '--png'), /- Screenshot: .*\.png/);
    await assert.rejects(fs('wait-prop', 'StatusText', 'Text.text'), /wait-prop <ref\|주소> <컴포넌트\.칸> <값> \[--timeout <초>\] \[--inactive\] 꼴이어야 합니다/);
    await assert.rejects(fs('config', '--wait', '0'), /--wait 은 0 보다 큰 초입니다/);
    await assert.rejects(fs('find-at', '1'), /find-at <x> <y> \[--camera <주소>\] 꼴이어야 합니다/);
    await fs('close');
  } finally {
    pc.server.close();
  }
});

test('입력 명령 — Ran 줄이 kit 의 game.* 이름 · 인자 꼴로 찍히고, 좌표는 Ran 줄이 없고, 음수도 읽는다', async () => {
  const pc = await fakeTcp(standardScreen());
  const io = (...argv: string[]) => cli('-s=io', ...argv, '--port', String(pc.port));
  try {
    await io('open', '--pc');
    assert.match(await io('click', 'LoginButton', '--count', '2', '--interval', '0.2'), /^Ran: await game\.click\('LoginButton', \{ count: 2, interval: 0\.2 \}\)/);
    assert.match(await io('touch-down', 'Item'), /^Ran: await game\.touchDown\('Item'\)\n- 손가락 10\n/);
    assert.match(await io('touch-move', '10', '/SampleCanvas/Bag/Slot[1]'), /^Ran: await game\.touchMove\(10, '\/SampleCanvas\/Bag\/Slot\[1\]'\)/);
    assert.match(await io('touch-up', '10'), /^Ran: await game\.touchUp\(10\)/);
    assert.match(await io('touch-down', '100', '200'), /^- 좌표 \(100, 200\) 누름 — 케이스에는 주소로 씁니다\n- 손가락 10\n/);
    assert.match(await io('drag', 'Item', '/SampleCanvas/Bag/Slot[3]', '--via', '/SampleCanvas/Bag/Slot[2]', '--duration', '0.5'), /^Ran: await game\.drag\('Item', '\/SampleCanvas\/Bag\/Slot\[3\]', \{ via: \['\/SampleCanvas\/Bag\/Slot\[2\]'\], duration: 0\.5 \}\)/);
    assert.match(await io('swipe', '810,550', '810,850', '--duration', '0.3'), /^- 좌표 810,550 → 810,850 끎 — 케이스에는 drag 로 씁니다/);
    assert.match(await io('long-press', 'HoldBox', '--duration', '1'), /^Ran: await game\.longPress\('HoldBox', \{ duration: 1 \}\)/);
    assert.match(await io('mouse-move', 'HoldBox'), /^Ran: await game\.mouseMove\('HoldBox'\)/);
    assert.match(await io('scroll', 'ScrollList', '-10'), /^Ran: await game\.scroll\(-10, \{ at: 'ScrollList' \}\)/);
    assert.match(await io('scroll', '3', '--dx', '1'), /^Ran: await game\.scroll\(3, \{ dx: 1 \}\)/);
    assert.match(await io('key', 'A+LeftShift', '--duration', '0.5'), /^Ran: await game\.key\('A\+LeftShift', \{ duration: 0\.5 \}\)/);
    assert.match(await io('key-down', 'JoystickButton16', '--power', '-1'), /^Ran: await game\.keyDown\('JoystickButton16', \{ power: -1 \}\)/);
    assert.match(await io('key-up', 'JoystickButton16'), /^Ran: await game\.keyUp\('JoystickButton16'\)/);
    assert.match(await io('tilt', '0', '-5', '0', '--duration', '1'), /^Ran: await game\.tilt\(\[0, -5, 0\], \{ duration: 1 \}\)/);
    assert.match(await io('pointer', 'HoldBox', 'enter'), /^Ran: await game\.pointer\('HoldBox', 'enter'\)/);
    assert.match(await io('input-reset'), /^Ran: await game\.resetInput\(\)/);
    await assert.rejects(io('pointer', 'HoldBox', 'press'), /pointer <ref\|주소> <down\|up\|enter\|exit> 꼴이어야 합니다/);
    await assert.rejects(io('long-press', 'HoldBox', '--duration', '9'), /long-press 은 8초 안이어야 합니다/);
    await assert.rejects(io('touch-up', 'x'), /touch-up <손가락 번호> 꼴이어야 합니다/);
    await assert.rejects(io('swipe', '1,1'), /swipe <x,y> <x,y> \[x,y…\] \[--duration <초>\] 꼴이어야 합니다/);
    await assert.rejects(io('click', 'LoginButton', '--count', 'two'), /--count 은 수입니다/);
    await io('close');
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
