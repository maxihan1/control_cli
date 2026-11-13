// 인스펙터 서버 — 토큰 없이는 거절 · 트리 · 좌표로 고르기 · 누르고 확인을 기록 → 내보내기 · 돌리기, CLI 의 마지막 연결 기억 · replay · export
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { run } from './cli.js';
import { fakeTcp, RECORDED, standardScreen } from './fake-game.js';
import { Game, WAIT } from './game.js';
import { inspect } from './inspect.js';
import { tcpLink } from './link.js';

Object.assign(WAIT, { intervalMs: 5, timeoutMs: 300 });

test('인스펙터 — 토큰이 없으면 403, 있으면 트리 · find-at · 누르기 · 확인 단계 → 내보내기 · 돌리기', async () => {
  const pc = await fakeTcp(standardScreen());
  const { url, server } = await inspect(new Game(tcpLink(pc.port)), { port: 0, title: 't' });
  const base = url.replace(/\/\?t=.*/, '');
  const token = new URL(url).searchParams.get('t')!;
  const post = async (path: string, body: unknown, t = token) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'X-Inspect': t }, body: JSON.stringify(body) });
    return { status: r.status, v: (await r.json()) as Record<string, unknown> };
  };
  try {
    assert.match(await (await fetch(url)).text(), /<title>control-cli inspect<\/title>/);
    assert.equal((await post('/tree', {}, 'nope')).status, 403);
    assert.equal((await fetch(`${base}/shot?t=nope`)).status, 403);
    assert.equal((await fetch(`${base}/shot?t=${token}`)).headers.get('content-type'), 'image/jpeg');

    const tree = (await post('/tree', {})).v as { scene: string; entries: { path: string; address: string; depth: number }[] };
    assert.equal(tree.scene, 'Sample');
    assert.ok(tree.entries.some((e) => e.address === 'LoginButton' && e.depth > 0));
    // WorldCube 는 (540, 600) 에 있다.
    assert.equal((await post('/call', { cmd: 'find-at', x: 540, y: 600 })).v.path, '/WorldCube');

    const recorded = [
      (await post('/do', { do: 'type', target: 'IdInput', text: 'qa_user01!' })).v,
      (await post('/do', { do: 'click', target: 'LoginButton' })).v,
      (await post('/check', { check: 'text', target: 'StatusText' })).v,
      (await post('/check', { check: 'prop', target: 'WorldCube', prop: 'Transform.position' })).v,
    ];
    assert.deepEqual(recorded[2], { check: 'text', target: 'StatusText', contains: 'login qauser01 1' });
    assert.deepEqual(recorded[3], { check: 'prop', target: 'WorldCube', prop: 'Transform.position', equals: [0, 0, 5] });
    assert.match((await post('/export', { steps: recorded, lang: 'py' })).v.code as string, /game\.click\("LoginButton"\)/);
    assert.equal((await post('/do', { do: 'drag' })).status, 500);
    // 버튼을 한 번 더 누르면 글자가 「login qauser01 2」 — 기록한 확인(… 1)은 들어 있지 않아 실패해야 한다.
    const again = (await post('/replay', { steps: recorded.slice(1, 3) })).v as { ok: boolean };
    assert.equal(again.ok, false);
  } finally {
    server.close();
    pc.server.close();
  }
});

test('CLI — open 이 연결을 기억해 세션 없는 inspect 가 다시 열고, replay · export 가 기록 파일을 읽는다', async () => {
  const pc = await fakeTcp(standardScreen());
  const dir = await mkdtemp(join(tmpdir(), 'control-cli-'));
  const servers: Server[] = [];
  const cli = (...argv: string[]) => run(argv, { env: {}, dir, onServer: (s) => servers.push(s) });
  try {
    await cli('-s=i', 'open', '--pc', '--port', String(pc.port));
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'last-open.json'), 'utf8')), ['--pc', `--port=${pc.port}`]);
    await cli('-s=i', 'close');
    const out = await cli('-s=i', 'inspect', '--headless', '--listen', '0');
    assert.match(out, /^세션 i 열림 — com\.fake\.game[\s\S]*\n인스펙터 http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{32} /);

    const rec = join(dir, 'rec.json');
    await writeFile(rec, JSON.stringify({ steps: RECORDED }));
    assert.match(await cli('-s=i', 'replay', rec), /^기록 .*rec\.json — 통과\n통과 · await game\.type\('IdInput', 'qa_user01!'\);/);
    await writeFile(rec, JSON.stringify([{ check: 'text', target: 'Nothing', contains: 'x' }]));
    await assert.rejects(cli('-s=i', 'replay', rec), /— 실패\n실패 · await game\.waitFor\('Nothing'/);
    assert.match(await cli('export', rec, '--lang', 'robot'), /Wait Until Keyword Succeeds {4}10s {4}0\.3s {4}글자에 들어 있다 {4}Nothing {4}x/);
    await assert.rejects(cli('export', rec, '--lang', 'go'), /--lang 은 ts · py · cs · java · robot/);
    await cli('-s=i', 'close');
  } finally {
    servers.forEach((s) => s.close());
    pc.server.close();
  }
});

test('CLI inspect — 세션도 지난 open 기록도 없으면 open 부터라고 알린다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'control-cli-'));
  await assert.rejects(run(['inspect', '--headless'], { env: {}, dir }), /open 부터/);
});
