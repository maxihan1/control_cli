# P1 MCP — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `control-cli mcp` — AI 앱(Claude Desktop · Claude Code)이 띄우는 stdio MCP 서버가 `protocol/commands.json` 의 명령과 세션 명령(hold · open · close · release)을 도구로 내주고, Unity 샘플 `conform` 차례가 그 도구로 다 통과한다.

**Architecture:** `src/mcp.ts` 가 MCP(JSON-RPC 2.0, 줄 하나에 메시지 하나)를 직접 읽고 쓴다 — 쓰는 메서드는 `initialize` · `ping` · `tools/list` · `tools/call` 넷뿐이라 SDK 패키지(`@modelcontextprotocol/sdk`)를 들이지 않는다(지금 런타임 dependency 0). 게임 도구는 `PROTOCOL.commands` 에서 이름 · 설명 · 인자 꼴을 만들고 `tools/call` 을 `{cmd, ...인자}` 한 줄로 바꿔 세션 파일의 게임(`Game.call`)에 보낸다. 세션 도구는 CLI `run()` 에 명령줄을 넘긴다. MCP 세션 파일은 `~/.control-cli/` — Claude Desktop 은 MCP 서버를 쓸 수 없는 `/` 에서 띄운다.

**Tech Stack:** TypeScript(Node 22 · `node:test` · `node:readline`) · MCP 2025-11-25(2024-11-05 ~ 받음) · GitHub Actions(sdk-compile meta) · 디바이스 팜 RF9R408GKRR · 이 맥 macOS 앱

로드맵은 [plan.md](plan.md) P1, 할 일 체크는 [checklist.md](checklist.md) P1, 결정은 [context-notes.md](context-notes.md) 「P1 설계」.
브랜치 `p1`(`roadmap` 위, PR 은 `roadmap` 으로). 테스트는 고친 파일의 테스트만 — `npm run -s build && node --test dist/<이름>.test.js`. 전체 `npm test` 는 Task 6 push 전에 한 번.

## 설계

| 정할 것 | 고른 것 | 까닭 |
|---|---|---|
| MCP 구현 | 손으로 쓴 JSON-RPC(줄 단위) | 메서드 넷 · 글과 그림 답뿐. SDK 패키지는 zod · express 를 끌고 온다 |
| 도구 | 게임 도구 12개(commands.json 그대로) + 세션 도구 4개(`hold` · `open` · `close` · `release`) | 셸 없는 Claude Desktop 도 폰을 잡고 게임을 연다(context-notes 「MCP · 인스펙터 모양」). 이름이 겹치지 않는다 |
| 게임 도구 답 | SDK 답 JSON 에서 `ok` 를 뺀 글 · `screenshot` 은 그림(`image/jpeg`) | AI 앱이 화면을 바로 본다. 새 명령도 꼴 그대로 따라온다 |
| 실패 | 게임 · CLI · 인자 꼴 실패는 도구 실패(`isError`) · 모르는 도구 -32602 · 모르는 메서드 -32601 | AI 가 글을 읽고 고쳐 다시 부른다(MCP 2025-11-25 의 인자 검사 실패 권고) |
| 인자 검사 | 도구 꼴(`type` · `enum` · `required`)과 견주고 꼴 밖 칸은 버린다 | 신뢰 경계 — 게임에 엉뚱한 칸을 보내지 않는다 |
| 세션 파일 | `~/.control-cli/`(`HOME` 을 따른다) | Desktop 의 cwd 는 `/`. 셸 CLI(`./.control-cli/`)와 따로 — README 에 적는다 |
| 서버 옵션 | `-s` · `--port` · `--url` · `--token` 은 `control-cli … mcp` 때 한 번 | 세션 도구가 같은 옵션으로 `run()` 을 부른다 |
| 차례 | 요청을 한 줄씩 차례로 답한다 | 게임 SDK 도 받은 차례대로 돈다. ponytail 주석 |
| 뺀 것 | `snapshot` ref · `Ran:` 줄 · `wait` · `text` · `conform` · `crawl` · `instrument` | ref · Ran 은 셸 CLI 몫, `wait` · `text` 는 `find` 로 된다. 쓸 일이 생기면 더한다 |
| 확인 | 테스트 · 실기기 모두 MCP 클라이언트가 `conform` 의 `Game` 을 MCP 도구로 돌린다(`mcpLink`) | `conform` 16줄이 그대로 MCP 도구 차례가 된다 — 끝 기준을 같은 줄 수로 잰다 |

## 파일 지도

| 파일 | 하는 일 | Task |
|---|---|---|
| `src/mcp.ts` (새) | JSON-RPC 읽기 · 쓰기 · 도구 목록 · 인자 검사 | 1 · 2 |
| `src/mcp.test.ts` (새) | `dist/main.js mcp` 를 띄워 MCP 클라이언트처럼 부른다 | 1 · 2 |
| `src/game.ts` | `call` 을 밖에서 부른다(MCP 가 명령을 그대로 보낸다) | 1 |
| `src/cli.ts` | `mcp` 명령 · 홈 폴더 세션 · help 줄 | 1 |
| `.github/workflows/sdk-compile.yml` | meta 잡이 `mcp.test` 도 돌린다 | 3 |
| `README.md` | MCP 절 · Claude Desktop 한 줄 · 도구 표 | 4 |
| `docs/roadmap/*` | 실기기 결과 · 체크 · 다음 세션 | 5 · 6 |

---

### Task 1: 서버 뼈대 — `initialize` · `tools/list` · 게임 도구

**Files:**
- Create: `src/mcp.ts` · `src/mcp.test.ts`
- Modify: `src/game.ts`(`call` 공개) · `src/cli.ts`(import · HELP · `mcp` 분기)

- [ ] **Step 1: 실패하는 테스트**

`src/mcp.test.ts`:

```ts
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
  assert.match((await call('click')).content[0].text!, /^click 에 target 이 필요합니다/);
  assert.match((await call('tap', { x: '10', y: 10 })).content[0].text!, /^tap 의 x 는 number 여야 합니다 \(받은 값 "10"\)/);
});
```

- [ ] **Step 2: 실패를 본다**

Run: `npm run -s build && node --test dist/mcp.test.js`
Expected: FAIL — 첫 테스트가 `init.result` 를 못 읽는다(`mcp` 가 모르는 명령이라 stdout 에 답이 없고 기다리다 끝난다) 또는 「모르는 명령입니다: mcp」가 stderr 에

- [ ] **Step 3: `Game.call` 을 밖에서 부른다**

`src/game.ts` 의 `private async call` 을 바꾼다.

```ts
  /** 명령 하나를 그대로 보낸다 — caps 밖이면 보내기 전에, 실패 답이면 던진다(MCP 가 commands.json 의 명령을 이 길로 보낸다) */
  async call(command: Command): Promise<Reply> {
```

- [ ] **Step 4: `src/mcp.ts`**

```ts
// stdio MCP 서버 — protocol/commands.json 의 명령과 세션 명령(hold · open · close · release)을 AI 앱(Claude Desktop · Claude Code)의 도구로 내준다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import type { Command, Reply } from './link.js';
import { PROTOCOL } from './protocol.js';

export interface Handlers {
  /** 게임 명령 하나 — 열린 세션의 게임에 보내고 답을 그대로 */
  game: (command: Command) => Promise<Reply>;
  /** CLI 명령줄 하나(hold · open · close · release) — CLI 가 찍을 글을 그대로 */
  session: (argv: string[]) => Promise<string>;
}

interface Prop {
  type: 'string' | 'number';
  description: string;
  enum?: (string | number)[];
}

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

interface Tool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, Prop>; required: string[] };
  run: (args: Record<string, unknown>) => Promise<Content[]>;
}

// 받는 판 — 쓰는 것(도구 · 글 · 그림)은 2024-11-05 부터 같다. 모르는 판을 달라면 맨 앞 판으로 답하고 클라이언트가 고른다.
export const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const VERSION = (JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version: string }).version;

const INSTRUCTIONS = [
  'QA 빌드 게임(control_cli SDK)을 조작한다.',
  '먼저 open — 디바이스 팜은 hold 로 폰을 잡은 뒤 open {app: QA APK}, 이 컴퓨터 PC 게임은 open {via: "pc"}.',
  '화면은 tree · screenshot 으로 본다. 주소는 오브젝트 이름(켜진 것 중 하나뿐일 때) 또는 /Canvas/Panel/Slot[2] 경로.',
  '다 쓰면 close, 팜 폰은 release.',
].join(' ');

const schema = (properties: Record<string, Prop>, required: string[] = []) => ({ type: 'object' as const, properties, required });
const text = (t: string): Content[] => [{ type: 'text', text: t }];

export function tools(h: Handlers): Tool[] {
  const game: Tool[] = PROTOCOL.commands.map((c) => ({
    name: c.name,
    description: c.summary,
    inputSchema: schema(
      Object.fromEntries(Object.entries(c.args).map(([k, a]) => [k, { type: a.type, description: a.summary }])),
      Object.entries(c.args)
        .filter(([, a]) => a.required)
        .map(([k]) => k),
    ),
    run: async (args) => {
      const { ok: _ok, jpg, ...rest } = await h.game({ cmd: c.name, ...args });
      // 스크린샷은 그림으로 — AI 앱이 화면을 바로 본다.
      return typeof jpg === 'string' ? [{ type: 'image', data: jpg, mimeType: 'image/jpeg' }] : text(JSON.stringify(rest));
    },
  }));
  return game;
}

// AI 가 준 인자를 도구 꼴과 견준다 — 틀리면 도구 실패로 알려 AI 가 고쳐 다시 부른다. 꼴 밖 칸은 버린다.
function pick(tool: Tool, args: unknown): Record<string, unknown> {
  const given = (args ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(tool.inputSchema.properties)) {
    const v = given[k];
    if (v === undefined) {
      if (tool.inputSchema.required.includes(k)) throw new Error(`${tool.name} 에 ${k} 가 필요합니다 — ${p.description}`);
      continue;
    }
    if (typeof v !== p.type || (p.enum !== undefined && !p.enum.includes(v as string | number)))
      throw new Error(`${tool.name} 의 ${k} 는 ${p.enum ? `${p.enum.join(' · ')} 중 하나여야` : `${p.type} 여야`} 합니다 (받은 값 ${JSON.stringify(v)})`);
    out[k] = v;
  }
  return out;
}

const rpcError = (code: number, message: string) => Object.assign(new Error(message), { code });

async function answer(method: string | undefined, params: Record<string, unknown>, list: Tool[]): Promise<unknown> {
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return {
        protocolVersion: typeof asked === 'string' && VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'control-cli', version: VERSION },
        instructions: INSTRUCTIONS,
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: list.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case 'tools/call': {
      const tool = list.find((t) => t.name === params.name);
      if (!tool) throw rpcError(-32602, `모르는 도구입니다: ${String(params.name)}`);
      // 게임 · CLI · 인자 실패는 도구 실패로 — AI 가 글을 읽고 다음 수를 고른다.
      try {
        return { content: await tool.run(pick(tool, params.arguments)) };
      } catch (e) {
        return { content: text(e instanceof Error ? e.message : String(e)), isError: true };
      }
    }
    default:
      throw rpcError(-32601, `모르는 메서드입니다: ${String(method)}`);
  }
}

/** 줄 하나에 JSON-RPC 메시지 하나(MCP stdio) — 입력이 닫히면 끝난다 */
export async function serve(input: Readable, output: Writable, h: Handlers): Promise<void> {
  const list = tools(h);
  const send = (m: object) => output.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  // ponytail: 요청을 한 줄씩 차례로 답한다 — 게임 SDK 도 받은 차례대로 돈다. open(최대 60초) 동안 뒤 요청이 기다리니, 클라이언트가 동시에 부르는 일이 잦아지면 줄마다 따로 돌린다.
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (line.trim() === '') continue;
    let m: { id?: number | string | null; method?: string; params?: Record<string, unknown> } | null;
    try {
      m = JSON.parse(line);
    } catch {
      send({ id: null, error: { code: -32700, message: 'JSON 이 아닌 줄입니다' } });
      continue;
    }
    // 알림(notifications/initialized · cancelled)에는 답하지 않는다.
    if (m?.id === undefined || m.id === null) continue;
    try {
      send({ id: m.id, result: await answer(m.method, m.params ?? {}, list) });
    } catch (e) {
      send({ id: m.id, error: { code: (e as { code?: number }).code ?? -32603, message: e instanceof Error ? e.message : String(e) } });
    }
  }
}
```

- [ ] **Step 5: CLI 에 `mcp` 를 단다**

`src/cli.ts` import 에 더한다.

```ts
import { homedir } from 'node:os';
```
```ts
import type { Command, Reply } from './link.js';
import { serve } from './mcp.js';
```

HELP 의 `conform` 줄 아래:

```ts
  mcp                                              stdio MCP 서버 — AI 앱(Claude Desktop · Claude Code)이 띄운다. 세션 파일은 ~/.control-cli
```

`const env = o.env;` 바로 아래:

```ts
  // AI 앱이 MCP 서버를 어느 폴더에서 띄울지 모른다(Claude Desktop 은 쓸 수 없는 /) — MCP 세션 파일은 홈 폴더에 둔다.
  if (name === 'mcp') o = { ...o, dir: join(env.HOME ?? homedir(), '.control-cli') };
```

`if (name === 'hold') {` 바로 위:

```ts
  if (name === 'mcp') {
    // 세션 도구는 이 run 을 그대로 부른다 — 서버를 띄울 때 준 세션 · 연결 옵션을 넘긴다.
    const globals = [`--session=${sname}`, ...(['url', 'token', 'port'] as const).flatMap((k) => (values[k] === undefined ? [] : [`--${k}=${values[k]}`]))];
    await serve(process.stdin, process.stdout, {
      session: (argv) => run([...globals, ...argv], o),
      game: async (command: Command): Promise<Reply> => {
        const s = await load(file);
        const game = gameOf(s, farm, port);
        if (command.cmd !== 'ping') return game.call(command);
        // CLI ping 처럼 받은 caps 를 세션에 적는다 — 게임을 새 SDK 로 다시 띄웠을 수 있다.
        const reply = await game.ping();
        await save(file, { ...s, caps: game.caps });
        return reply as unknown as Reply;
      },
    });
    return '';
  }
```

- [ ] **Step 6: 통과를 본다**

Run: `npm run -s build && node --test dist/mcp.test.js`
Expected: PASS 2 · fail 0

- [ ] **Step 7: Commit**

```bash
git add src/mcp.ts src/mcp.test.ts src/game.ts src/cli.ts
git commit -m "control-cli mcp — stdio MCP 서버 · 도구 목록은 protocol/commands.json 명령 + 세션 도구 · 실패는 도구 실패로"
```

---

### Task 2: 세션 도구 · 표준 화면 `conform` 을 MCP 도구로

**Files:**
- Modify: `src/mcp.ts` · `src/mcp.test.ts`

- [ ] **Step 1: 실패하는 테스트**

첫 테스트의 도구 이름 줄을 세션 도구까지로 바꾼다.

```ts
  assert.deepEqual(names, [...COMMANDS, 'hold', 'open', 'close', 'release']);
```

`src/mcp.test.ts` import 에 더한다.

```ts
import { existsSync } from 'node:fs';

import { CONFORM, conform, report } from './conform.js';
import { fakeFarm, FakeGame, fakeTcp, node, standardScreen } from './fake-game.js';
import { Game, WAIT } from './game.js';
import type { Link } from './link.js';
```

import 아래:

```ts
Object.assign(WAIT, { intervalMs: 5 });
Object.assign(CONFORM, { waitMs: 50 });

// conform 의 Game 을 MCP 도구로 돌린다 — 명령 하나를 tools/call 하나로, 도구 답을 SDK 답 꼴로 되돌린다
const mcpLink =
  (call: (name: string, args: Record<string, unknown>) => Promise<CallResult>): Link =>
  async ({ cmd, ...args }) => {
    const r = await call(cmd, args);
    if (r.isError) return { ok: false, error: r.content[0].text };
    const c = r.content[0];
    return c.type === 'image' ? { ok: true, jpg: c.data } : { ok: true, ...(JSON.parse(c.text!) as object) };
  };
```

테스트 둘을 더한다.

```ts
test('PC 게임을 open 하면 표준 화면 conform 16줄이 MCP 도구로 모두 통과하고 screenshot 은 그림으로 온다', async (t) => {
  const { port, server: tcp } = await fakeTcp(standardScreen());
  t.after(() => tcp.close());
  const { call, home } = await server(`--port=${port}`);
  assert.match((await call('open', { via: 'pc' })).content[0].text!, /^세션 default 열림 — com\.fake\.game 1\.0 \(PC\) · fake 0 · SDK 0\.3\.0/);
  assert.ok(existsSync(join(home, '.control-cli', 'default.json')), '세션 파일은 홈 폴더에');

  const r = await conform(new Game(mcpLink(call)));
  assert.deepEqual([r.passed, r.failed, r.skipped], [16, 0, 0], report(r));
  assert.deepEqual((await call('screenshot')).content, [{ type: 'image', data: Buffer.from('jpg').toString('base64'), mimeType: 'image/jpeg' }]);
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
```

- [ ] **Step 2: 실패를 본다**

Run: `npm run -s build && node --test dist/mcp.test.js`
Expected: FAIL 3 — 도구 이름에 세션 도구가 없고, `open` · `hold` 가 -32602 「모르는 도구입니다」라 `result` 가 없다(TypeError: Cannot read properties of undefined (reading 'content'))

- [ ] **Step 3: 세션 도구**

`src/mcp.ts` 의 `tools()` 끝 `return game;` 을 바꾼다.

```ts
  const flag = (k: string, v: unknown) => (v === undefined ? [] : [`--${k}=${String(v)}`]);
  const cli = async (argv: string[]) => text(await h.session(argv));
  const udid = { type: 'string', description: '폰 serial(팜 · USB) 또는 iPhone UDID' } as const;
  const session: Tool[] = [
    {
      name: 'hold',
      description: '디바이스 팜 폰을 잡는다 — udid 가 없으면 빈 폰 하나. 다 쓰면 close 뒤 release',
      inputSchema: schema({ udid, minutes: { type: 'number', enum: [30, 60, 120], description: '잡아 둘 분(기본 30)' } }),
      run: (a) => cli(['hold', ...flag('udid', a.udid), ...flag('minutes', a.minutes)]),
    },
    {
      name: 'open',
      description: '게임에 붙고 첫 화면을 찍는다 — farm(기본)은 hold 로 잡은 폰에 app 을 깔고 켠다 · usb 는 꽂힌 Android · pc 는 이 컴퓨터 게임(app 이 있으면 띄운다) · ios 는 USB iPhone',
      inputSchema: schema({
        via: { type: 'string', enum: ['farm', 'usb', 'pc', 'ios'], description: '어디의 게임인가(기본 farm)' },
        app: { type: 'string', description: 'QA APK 주소 · 경로(farm · usb) · PC 실행 파일 · .app(pc) · 서명된 .app(ios)' },
        udid,
      }),
      run: (a) => cli(['open', ...(a.via === undefined || a.via === 'farm' ? [] : [`--${String(a.via)}`]), ...flag('app', a.app), ...flag('udid', a.udid)]),
    },
    { name: 'close', description: '세션을 닫는다 — open 이 띄운 PC · iPhone 게임은 끈다. 팜 폰은 잡힌 채로 남는다(release)', inputSchema: schema({}), run: () => cli(['close']) },
    { name: 'release', description: '잡은 팜 폰을 놓는다 — 팜이 깐 게임 · 데이터를 지운다', inputSchema: schema({ udid }), run: (a) => cli(['release', ...flag('udid', a.udid)]) },
  ];
  return [...game, ...session];
```

- [ ] **Step 4: 통과를 본다**

Run: `npm run -s build && node --test dist/mcp.test.js`
Expected: PASS 4 · fail 0

- [ ] **Step 5: Commit**

```bash
git add src/mcp.ts src/mcp.test.ts
git commit -m "MCP 세션 도구 hold · open · close · release — 표준 화면 conform 16줄을 MCP 도구로 돌려 통과(테스트)"
```

---

### Task 3: CI — sdk-compile meta 잡이 `mcp.test` 도 돌린다

도구 목록 ↔ `protocol/commands.json` 은 `protocol.test` 와 같은 계약이다. 지금 CLI 테스트는 CI 에서 안 돈다.

**Files:**
- Modify: `.github/workflows/sdk-compile.yml:1,6,9,20`

- [ ] **Step 1: 고친다**

첫 줄 주석:

```yaml
# SDK 를 Unity 판 · 입력 설정마다 컴파일만 해 보고 .meta · 명령 정의(protocol/commands.json ↔ SDK Caps · MCP 도구)를 검사한다 — Unity 라이선스 없이 (tools/unity-compile-check)
```

`pull_request` · `push` 의 `paths` 둘 다 `'src/protocol.test.ts',` 뒤에 `'src/mcp.ts', 'src/mcp.test.ts',` 를 더한다. meta 잡:

```yaml
      - run: node --test dist/sdk-meta.test.js dist/protocol.test.js dist/mcp.test.js
```

- [ ] **Step 2: 확인**

Run: `npm run -s build && node --test dist/sdk-meta.test.js dist/protocol.test.js dist/mcp.test.js`
Expected: PASS — fail 0. CI 결과는 Task 6 의 PR 에서 본다.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sdk-compile.yml
git commit -m "sdk-compile meta 잡이 mcp.test 도 돌린다 — MCP 도구 목록 ↔ commands.json"
```

---

### Task 4: README — MCP 절 · Claude Desktop 한 줄

**Files:**
- Modify: `README.md`(맨 위 목록 · 「창 훑기」와 「연결」 사이)

- [ ] **Step 1: 맨 위 목록의 「라이브러리」 줄 위에 더한다**

```markdown
- **MCP** — `control-cli mcp`. AI 앱(Claude Desktop · Claude Code)이 띄우는 stdio MCP 서버로, 같은 명령을 도구로 내준다 — 셸 없는 AI 앱도 게임을 조작한다
```

- [ ] **Step 2: 「연결」 절 위에 MCP 절**

````markdown
### MCP — AI 앱에서

`control-cli mcp` 는 stdio MCP 서버다 — 따로 띄워 두는 프로그램이 아니라 AI 앱이 이 명령을 실행해 붙는다.

```bash
npm i -g github:maxihan1/control_cli#<태그>      # control-cli 를 PATH 에
claude mcp add control-cli -- control-cli mcp     # Claude Code
```

Claude Desktop — `claude_desktop_config.json`(macOS `~/Library/Application Support/Claude/` · Windows `%APPDATA%\Claude\`)의 `mcpServers` 에 한 줄. 팜을 안 쓰면 `env` 는 뺀다.

```json
"control-cli": { "command": "control-cli", "args": ["mcp"], "env": { "PLATFORM_APPIUM_URL": "http://<팜>:4723/wd/hub", "PLATFORM_APPIUM_TOKEN": "pat_…" } }
```

Desktop 은 셸의 PATH 를 안 볼 수 있다 — `control-cli` · `node` 를 못 찾으면 `"command": "<which node 의 경로>", "args": ["<npm root -g 의 경로>/control-cli/dist/main.js", "mcp"]` 로 쓴다.

| 도구 | 하는 일 |
|---|---|
| `hold` · `open` · `close` · `release` | 세션 — CLI 의 같은 명령. `open` 의 `via` 는 `farm`(기본 · `hold` 먼저) · `usb` · `pc` · `ios` |
| `ping` · `tree` · `find` · `click` · `drag` · `type` · `get` · `tap` · `key` · `screenshot` · `errors` · `layout` | `protocol/commands.json` 의 명령 그대로 — 인자는 그 칸, 답은 SDK 답 JSON(`ok` 뺌). `screenshot` 은 그림으로 준다 |

- 명령을 `protocol/commands.json` 에 더하면 도구도 따라 는다(`src/mcp.test.ts` 가 잡는다)
- 세션 파일은 `~/.control-cli/` — Claude Desktop 은 MCP 서버를 쓸 수 없는 `/` 에서 띄운다. 셸 CLI 의 `./.control-cli/` 와 따로다. `-s <세션>` · `--port` · `--url` · `--token` 은 `control-cli … mcp` 로 띄울 때 준다
- 셸 CLI 의 `snapshot` ref · `Ran:` 줄 · `wait` · `text` 는 MCP 에 없다 — `tree` · `find` 로 본다
````

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README — MCP 절 · Claude Desktop 설정 한 줄 · 도구 표"
```

---

### Task 5: 실기기 — Unity 샘플 `conform` 을 MCP 도구로

저장소 밖(`$CLAUDE_JOB_DIR/tmp`)에서 돌린다. 클라이언트 스크립트는 Task 2 의 `server()` · `mcpLink` 와 같은 꼴로, `dist/main.js -s p1mcp mcp` 를 띄워 `initialize` → (팜이면 `hold`) → `open` → `conform`(MCP 도구) → `screenshot` → `close` → (`release`) 를 부르고 줄마다 찍는다. 세션 파일은 진짜 `~/.control-cli/` 에 생긴다(Desktop 과 같은 자리).

- [ ] **Step 1: 결과물을 받는다(빈 새 폴더마다)**

```bash
gh run download 41642343858 -R maxihan1/control_cli -n sample-6000.0.84f1-StandaloneOSX-input0 -D "$CLAUDE_JOB_DIR/tmp/osx"
gh run download 41642343858 -R maxihan1/control_cli -n sample-6000.0.84f1-Android-input1 -D "$CLAUDE_JOB_DIR/tmp/apk"
```

- [ ] **Step 2: 이 맥 macOS 앱** — 화면이 잠들었으면 `caffeinate -u -t 3`, `caffeinate -d -t 900 &` 를 건 채 `open {via:'pc', app:<.app>}` → conform. 끝나면 그 caffeinate PID 만 kill

Expected: 「통과 16 · 실패 0 · 건너뜀 0」

- [ ] **Step 3: 팜 RF9R408GKRR** — `farm.env` 를 `set -a; . 파일; set +a` 로 읽은 래퍼에서 `hold {udid:'RF9R408GKRR'}` → `open {app:<apk>}` → conform → `close` → `release`

Expected: 「통과 16 · 실패 0 · 건너뜀 0」, `release` 줄이 「폰 RF9R408GKRR 놓음」

- [ ] **Step 4: 진짜 MCP 클라이언트(Claude Code headless)로 손 확인** — `claude -p --strict-mcp-config --mcp-config <json> --allowedTools 'mcp__control-cli'` 로 macOS 앱에 `open` · `tree` · `screenshot` · `close` 를 부르게 한다. 손으로 쓴 JSON-RPC 가 실제 클라이언트(공식 SDK)와 맞는지 본다

- [ ] **Step 5: 기록 · Commit** — context-notes 「P1 끝」에 결과 · 시각 · 판, checklist P1 칸

```bash
git add docs/roadmap/context-notes.md docs/roadmap/checklist.md
git commit -m "P1 실기기 — 이 맥 macOS 앱 · 팜 RF9R408GKRR 에서 conform 을 MCP 도구로 16/16"
```

---

### Task 6: 전체 테스트 · PR · 다음 세션

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: fail 0

- [ ] **Step 2: plan.md AltTester 표 「AI 확장(MCP)」 줄의 지금 칸을 ✓ `control-cli mcp` 로, checklist 「다음 세션은 여기부터」를 P2-A 로**

- [ ] **Step 3: push · draft PR(`p1` → `roadmap`) · CI(sdk-compile) 결과 확인**

```bash
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin p1
gh pr create -R maxihan1/control_cli --draft --base roadmap --head p1 --title "P1 MCP — control-cli mcp" --body-file <본문>
```
