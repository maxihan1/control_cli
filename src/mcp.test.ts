// control-cli mcp 를 AI 앱처럼 띄워 부른다 — 도구 목록이 commands.json 에서 오는지 · 실패를 도구 실패로 알리는지
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { after, test } from 'node:test';

import { COMMANDS, PROTOCOL } from './protocol.js';

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
  assert.deepEqual(names, COMMANDS);
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
});
