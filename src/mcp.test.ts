// control-cli mcp 를 AI 앱처럼 띄워 부른다 — 도구 목록이 commands.json 에서 오는지 · 실패를 도구 실패로 알리는지
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { after, test } from 'node:test';

import { CONFORM, conform, report } from './conform.js';
import { fakeFarm, FakeGame, fakeTcp, node, standardScreen } from './fake-game.js';
import { Game, WAIT } from './game.js';
import type { Link } from './link.js';
import { COMMANDS, PROTOCOL } from './protocol.js';

Object.assign(WAIT, { intervalMs: 5 });
Object.assign(CONFORM, { waitMs: 50 });

interface Content {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}
interface CallResult {
  content: Content[];
  isError?: boolean;
}
interface Rpc {
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

// conform 의 Game 을 MCP 도구로 돌린다 — 명령 하나를 tools/call 하나로, 도구 답을 SDK 답 꼴로 되돌린다
const mcpLink =
  (call: (name: string, args: Record<string, unknown>) => Promise<CallResult>): Link =>
  async ({ cmd, ...args }) => {
    const r = await call(cmd, args);
    if (r.isError) return { ok: false, error: r.content[0].text };
    const c = r.content[0];
    if (c.type === 'image') return { ok: true, [c.mimeType === 'image/png' ? 'png' : 'jpg']: c.data };
    return { ok: true, ...(JSON.parse(c.text!) as object) };
  };

const children: ChildProcessWithoutNullStreams[] = [];
after(() => children.forEach((c) => c.kill()));

// HOME 을 빈 임시 폴더로 — 세션 파일이 그 아래 .control-cli/ 에 생긴다. 개발자 셸의 PLATFORM_* 는 넘기지 않는다
async function server(...argv: string[]) {
  const home = await mkdtemp(join(tmpdir(), 'control-cli-mcp-'));
  const child = spawn(process.execPath, [join(import.meta.dirname, 'main.js'), ...argv, 'mcp'], { env: { PATH: process.env.PATH, HOME: home } });
  children.push(child);
  const waiting = new Map<number, (m: Rpc) => void>();
  createInterface({ input: child.stdout }).on('line', (line) => {
    const m = JSON.parse(line) as Rpc;
    waiting.get(m.id)?.(m);
  });
  let id = 0;
  const rpc = (method: string, params?: unknown) =>
    new Promise<Rpc>((ok) => {
      waiting.set(++id, ok);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  const call = async (name: string, args: Record<string, unknown> = {}) => (await rpc('tools/call', { name, arguments: args })).result as CallResult;
  return { rpc, call, home };
}

test('initialize 는 받은 판으로 답하고 tools/list 는 commands.json 명령 + 세션 도구다', async () => {
  const { rpc } = await server();
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, 'control-cli');
  assert.equal((await rpc('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-11-25');

  const tools = (await rpc('tools/list')).result.tools as { name: string; description: string; inputSchema: { properties: object; required: string[] } }[];
  const names = tools.map((t) => t.name);
  assert.deepEqual(names, [...COMMANDS, 'hold', 'open', 'close', 'release']);
  assert.equal(new Set(names).size, names.length, `겹치는 도구: ${names.join(' · ')}`);
  for (const c of PROTOCOL.commands) {
    const t = tools.find((x) => x.name === c.name)!;
    assert.equal(t.description, c.summary);
    assert.deepEqual(Object.keys(t.inputSchema.properties), Object.keys(c.args));
    assert.deepEqual(t.inputSchema.required, Object.keys(c.args).filter((k) => c.args[k].required));
  }
  assert.deepEqual(await rpc('ping'), { jsonrpc: '2.0', id: 4, result: {} });
  assert.equal((await rpc('resources/list')).error?.code, -32601);
  assert.equal((await rpc('tools/call', { name: 'nope' })).error?.code, -32602);
});

test('open 전에는 게임 도구가 실패로 답하고, 인자 꼴이 틀리면 고칠 글을 준다', async () => {
  const { call } = await server();
  assert.deepEqual(await call('tree'), { content: [{ type: 'text', text: '열린 세션이 없습니다 — open 부터 합니다' }], isError: true });
  assert.match((await call('click')).content[0].text!, /^click 에 target 칸이 필요합니다/);
  assert.match((await call('tap', { x: '10', y: 10 })).content[0].text!, /^tap 의 x 는 number 여야 합니다 \(받은 값 "10"\)/);
  assert.match((await call('static-call', { method: 'A.B', args: 'x' })).content[0].text!, /^static-call 의 args 는 글자 배열이어야 합니다/);
  assert.match((await call('pref-get', { key: 'k', type: 'bool' })).content[0].text!, /^pref-get 의 type 는 string · int · float 중 하나여야 합니다/);
  assert.match((await call('find', { target: 'X', inactive: 'yes' })).content[0].text!, /^find 의 inactive 는 true · false 여야 합니다/);
  assert.match((await call('screenshot', { format: 'gif' })).content[0].text!, /^screenshot 의 format 는 jpg · png 중 하나여야 합니다/);
});

test('PC 게임을 open 하면 표준 화면 conform 33줄이 MCP 도구로 모두 통과하고 screenshot 은 그림으로 온다', async (t) => {
  const { port, server: tcp } = await fakeTcp(standardScreen());
  t.after(() => tcp.close());
  const { call, home } = await server(`--port=${port}`);
  assert.match((await call('open', { via: 'pc' })).content[0].text!, /^세션 default 열림 — com\.fake\.game 1\.0 \(PC\) · fake 0 · SDK 0\.3\.0/);
  assert.ok(existsSync(join(home, '.control-cli', 'default.json')), '세션 파일은 홈 폴더에');

  const r = await conform(new Game(mcpLink(call)));
  assert.deepEqual([r.passed, r.failed, r.skipped], [33, 0, 0], report(r));
  assert.deepEqual((await call('screenshot')).content, [{ type: 'image', data: Buffer.from('jpg').toString('base64'), mimeType: 'image/jpeg' }]);
  const png = (await call('screenshot', { format: 'png' })).content[0];
  assert.deepEqual([png.type, png.mimeType, Buffer.from(png.data!, 'base64').subarray(1, 4).toString()], ['image', 'image/png', 'PNG']);
  assert.match((await call('open', { via: 'moon' })).content[0].text!, /^open 의 via 는 farm · usb · pc · ios 중 하나여야 합니다/);

  assert.match((await call('close')).content[0].text!, /^세션 default 닫음/);
  assert.ok(!existsSync(join(home, '.control-cli', 'default.json')));
});

test('팜 — hold → open → tree → close → release 가 세션 도구로 돈다', async (t) => {
  const farm = await fakeFarm(new FakeGame([node('Boot')]));
  t.after(() => farm.server.close());
  const { call } = await server(`--url=${farm.url}`);
  assert.match((await call('hold', { udid: 'R1', minutes: 60 })).content[0].text!, /^폰 R1 잡음/);
  assert.match((await call('hold', { minutes: 45 })).content[0].text!, /^hold 의 minutes 는 30 · 60 · 120 중 하나여야 합니다/);
  assert.match((await call('open', { app: 'http://builds/qa.apk' })).content[0].text!, /^세션 default 열림 — com\.fake\.game 1\.0 \(디바이스 팜 R1\)/);
  assert.equal((JSON.parse((await call('tree')).content[0].text!) as { scene: string }).scene, 'Boot');
  assert.match((await call('close')).content[0].text!, /폰은 아직 잡혀 있습니다/);
  assert.match((await call('release')).content[0].text!, /^폰 R1 놓음/);
  assert.ok(farm.seen.includes('POST /api/devices/R1/hold') && farm.seen.includes('DELETE /api/devices/R1/hold'));
});
