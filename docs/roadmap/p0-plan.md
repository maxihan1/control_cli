# P0 바탕 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 엔진과 무관한 통신 꼴 v2(`ping` 의 `caps`) · 명령 정의 한 곳(`protocol/commands.json`) · 적합성 검사(`control-cli conform`)를 깔고, Unity SDK 를 `sdk/unity/` 로 옮긴다.

**Architecture:** 명령 이름 · 칸은 `protocol/commands.json` 하나에 적고 `src/protocol.ts` 가 읽는다. Unity SDK 는 같은 이름 목록(`Caps`)을 `ping` 답에 실어 보내고, CLI 는 세션 파일에 caps 를 적어 두었다가 caps 밖 명령을 보내기 전에 거절한다(옛 SDK 는 caps 가 없어 그대로 보낸다). `src/conform.ts` 는 표준 화면(샘플)에 16줄을 차례로 보내 기대값과 견준다.

**Tech Stack:** TypeScript(Node 22 · `node:test`) · Unity C#(SDK) · Python(컴파일 하네스) · GitHub Actions(sdk-compile · sample) · 디바이스 팜 RF9R408GKRR

로드맵은 [plan.md](plan.md) P0, 할 일 체크는 [checklist.md](checklist.md) P0, 결정은 [context-notes.md](context-notes.md).
브랜치 `p0`(`roadmap` 위). 테스트는 고친 파일의 테스트만 돌린다 — `npm run -s build && node --test dist/<이름>.test.js`. 전체 `npm test` 는 Task 7 에서 한 번.

## 파일 지도

| 파일 | 하는 일 | Task |
|---|---|---|
| `sdk/` → `sdk/unity/` | Unity SDK 옮김(파일 내용 그대로) | 1 |
| `src/instrument.ts` · `src/instrument.test.ts` | UPM 경로 `?path=/sdk/unity` | 1 |
| `src/sdk-meta.test.ts` · `tools/unity-compile-check/check.py` · `README.md` | 새 경로 | 1 |
| `protocol/commands.json` (새) | 명령 12개 이름 · 설명 · 칸 | 2 |
| `src/protocol.ts` (새) · `src/protocol.test.ts` (새) | 읽기 · 꼴 검사 · Unity `Caps` · `SdkVersion` 대조 | 2 · 3 |
| `sdk/unity/Runtime/ControlServer.cs` | `Caps` · `SdkVersion` · ping v2 | 3 |
| `package.json` · `sdk/unity/package.json` | 판 0.3.0 · `files` 에 `protocol` | 3 · 7 |
| `src/game.ts` · `src/cli.ts` | `PingReply` · caps 미리 거절 · 세션 caps · open 줄에 엔진 | 4 |
| `src/fake-game.ts` | ping v2 · caps · `accept` · `movable` · `onKey` · `standardScreen` | 4 · 5 |
| `src/conform.ts` (새) · `src/conform.test.ts` (새) | 16줄 · 결과 글 | 5 |
| `src/cli.ts` · `src/cli.test.ts` · `README.md` | `conform` 명령 · help · 표 | 6 |

---

### Task 1: `sdk/` 를 `sdk/unity/` 로 옮긴다

**Files:**
- Move: `sdk/Input` · `sdk/Input.meta` · `sdk/Runtime` · `sdk/Runtime.meta` · `sdk/package.json` · `sdk/package.json.meta` → `sdk/unity/`
- Modify: `src/instrument.ts:8-10` · `src/instrument.test.ts:12` · `src/sdk-meta.test.ts:1,7,17` · `tools/unity-compile-check/check.py:12,51` · `README.md:189`

- [ ] **Step 1: 테스트를 새 경로로 바꾼다(실패해야 한다)**

`src/instrument.test.ts:12` 를 바꾼다.

```ts
  assert.match(packageUrl('abc123'), /\?path=\/sdk\/unity#abc123$/);
```

- [ ] **Step 2: 실패를 본다**

Run: `npm run -s build && node --test dist/instrument.test.js`
Expected: FAIL — `The input did not match the regular expression /\?path=\/sdk\/unity#abc123$/`

- [ ] **Step 3: 옮기고 경로를 고친다**

```bash
mkdir -p sdk/unity
git mv sdk/Input sdk/Input.meta sdk/Runtime sdk/Runtime.meta sdk/package.json sdk/package.json.meta sdk/unity/
```

`src/instrument.ts` 의 `packageUrl`:

```ts
export function packageUrl(ref: string): string {
  return `https://github.com/maxihan1/control_cli.git?path=/sdk/unity#${ref}`;
}
```

`src/sdk-meta.test.ts` 첫 줄 · `SDK` · 테스트 이름:

```ts
// sdk/unity/ 의 파일 · 폴더마다 .meta 가 하나씩 있고 guid 가 겹치지 않는지 본다 — git 으로 받은 UPM 패키지는 Unity 가 .meta 를 못 만든다
```
```ts
const SDK = join(import.meta.dirname, '..', 'sdk', 'unity');
```
```ts
test('sdk/unity/ 의 파일 · 폴더마다 .meta 가 하나씩 있고 guid 가 겹치지 않는다', () => {
```

`tools/unity-compile-check/check.py` 12줄 · 51줄:

```python
SDK(sdk/unity/)와 게임 쪽 확인 어셈블리(probe/)는 asmdef 에 적힌 참조만 본다 — 검사 대상이다.
```
```python
OURS = [ROOT / "sdk" / "unity", HERE / "probe", ROOT / "sample" / "Assets"]
```

`README.md:189`:

```markdown
`sdk/unity/` 에 파일을 더하면 `.meta` 도 같이 넣는다 — git 으로 받은 UPM 패키지는 Unity 가 `.meta` 를 못 만든다(`src/sdk-meta.test.ts` 가 잡는다).
```

- [ ] **Step 4: 통과를 본다**

Run: `npm run -s build && node --test dist/instrument.test.js dist/sdk-meta.test.js`
Expected: PASS(두 파일 모두 fail 0). `git status --short` 에 `R  sdk/... -> sdk/unity/...` 줄만 있고 지운 파일이 없다. 워크플로(`sample.yml` · `sdk-compile.yml`)의 `paths: ['sdk/**', …]` 는 `sdk/unity/**` 도 받아 고치지 않는다.

- [ ] **Step 5: Commit**

```bash
git add -A sdk src/instrument.ts src/instrument.test.ts src/sdk-meta.test.ts tools/unity-compile-check/check.py README.md
git commit -m "Unity SDK 를 sdk/unity/ 로 옮긴다 — 엔진마다 sdk/<엔진>/ (instrument UPM 경로 · 하네스 · meta 테스트)"
```

---

### Task 2: 명령 정의 한 곳 — `protocol/commands.json`

**Files:**
- Create: `protocol/commands.json` · `src/protocol.ts` · `src/protocol.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/protocol.test.ts`:

```ts
// protocol/commands.json 이 한 벌로 맞는지 — 이름 겹침 · 칸 꼴 · Unity SDK 의 Caps · SdkVersion 과 같은지
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMANDS, PROTOCOL } from './protocol.js';

test('명령 12개 · 이름은 겹치지 않고 칸은 string · number 와 required · summary 를 갖는다', () => {
  assert.equal(PROTOCOL.protocol, 2);
  assert.deepEqual(COMMANDS, ['ping', 'tree', 'find', 'click', 'drag', 'type', 'get', 'tap', 'key', 'screenshot', 'errors', 'layout']);
  for (const c of PROTOCOL.commands) {
    assert.ok(c.summary, `${c.name} 에 summary 가 없습니다`);
    for (const [k, a] of Object.entries(c.args)) {
      assert.ok(a.type === 'string' || a.type === 'number', `${c.name}.${k} 의 type`);
      assert.equal(typeof a.required, 'boolean', `${c.name}.${k} 의 required`);
      assert.ok(a.summary, `${c.name}.${k} 의 summary`);
    }
  }
});
```

- [ ] **Step 2: 실패를 본다**

Run: `npm run -s build`
Expected: FAIL — `error TS2307: Cannot find module './protocol.js'`

- [ ] **Step 3: 정의 파일과 읽는 모듈**

`protocol/commands.json`:

```json
{
  "protocol": 2,
  "commands": [
    { "name": "ping", "summary": "게임 답 · 엔진 · SDK 판 · 할 수 있는 명령(caps)", "args": {} },
    { "name": "tree", "summary": "켜진 오브젝트 트리 · 장면 이름 · 화면 크기", "args": {} },
    {
      "name": "find",
      "summary": "주소의 오브젝트 — 없으면 found:false, 이름이 겹치면 실패",
      "args": { "target": { "type": "string", "required": true, "summary": "오브젝트 이름(하나뿐일 때) 또는 / 로 시작하는 경로" } }
    },
    {
      "name": "click",
      "summary": "가운데를 가짜 터치로 누른다 — 게임이 처리한 뒤 답한다",
      "args": { "target": { "type": "string", "required": true, "summary": "오브젝트 이름(하나뿐일 때) 또는 / 로 시작하는 경로" } }
    },
    {
      "name": "drag",
      "summary": "앞 자리에서 뒤 자리로 10프레임에 걸쳐 끈다",
      "args": {
        "target": { "type": "string", "required": true, "summary": "끌 오브젝트 주소" },
        "to": { "type": "string", "required": true, "summary": "놓을 자리 주소" }
      }
    },
    {
      "name": "type",
      "summary": "입력칸에 글자를 넣는다 — 그 칸의 글자 수 · 거르기를 키로 칠 때의 차례로",
      "args": {
        "target": { "type": "string", "required": true, "summary": "입력칸 주소" },
        "text": { "type": "string", "required": true, "summary": "넣을 글자" }
      }
    },
    {
      "name": "get",
      "summary": "컴포넌트 칸 값을 읽는다",
      "args": {
        "target": { "type": "string", "required": true, "summary": "오브젝트 주소" },
        "prop": { "type": "string", "required": true, "summary": "컴포넌트.칸[.칸…] — Transform.position" }
      }
    },
    {
      "name": "tap",
      "summary": "좌표를 누른다(왼쪽 아래가 0,0) — 살펴볼 때만",
      "args": {
        "x": { "type": "number", "required": true, "summary": "가로 픽셀" },
        "y": { "type": "number", "required": true, "summary": "세로 픽셀" }
      }
    },
    {
      "name": "key",
      "summary": "키 한 번 — 한 프레임 누르고 다음 프레임 뗀다",
      "args": { "key": { "type": "string", "required": true, "summary": "KeyCode 이름 — Escape · Space · Return · I · Alpha1" } }
    },
    { "name": "screenshot", "summary": "게임이 프레임 끝에서 찍은 화면(JPEG base64)", "args": {} },
    {
      "name": "errors",
      "summary": "게임 예외 · 에러 로그(최근 200개)",
      "args": { "since": { "type": "number", "required": false, "summary": "받아 둔 last — 그 번호 뒤만" } }
    },
    {
      "name": "layout",
      "summary": "누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치는지",
      "args": { "target": { "type": "string", "required": false, "summary": "이 오브젝트 아래만 본다" } }
    }
  ]
}
```

`src/protocol.ts`:

```ts
// 엔진과 무관한 명령 한 벌 — protocol/commands.json 을 읽어 CLI · conform · (P1) MCP 가 같은 목록을 쓴다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Arg {
  type: 'string' | 'number';
  required: boolean;
  summary: string;
}

export interface CommandSpec {
  name: string;
  summary: string;
  args: Record<string, Arg>;
}

export interface Protocol {
  protocol: number;
  commands: CommandSpec[];
}

// dist/protocol.js 에서 저장소 뿌리의 protocol/ — npm 패키지에도 protocol/ 을 싣는다(package.json files).
export const PROTOCOL = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'protocol', 'commands.json'), 'utf8')) as Protocol;
export const COMMANDS = PROTOCOL.commands.map((c) => c.name);
```

- [ ] **Step 4: 통과를 본다**

Run: `npm run -s build && node --test dist/protocol.test.js`
Expected: PASS — `# pass 1` · `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add protocol/commands.json src/protocol.ts src/protocol.test.ts
git commit -m "명령 정의 한 곳 — protocol/commands.json(명령 12개 · 칸 · 설명)과 읽는 모듈"
```

---

### Task 3: Unity SDK 의 ping v2 — `Caps` · `SdkVersion` · 판 0.3.0

**Files:**
- Modify: `sdk/unity/Runtime/ControlServer.cs:26,175-176,223` · `sdk/unity/package.json:3` · `package.json:3`
- Test: `src/protocol.test.ts`

- [ ] **Step 1: 실패하는 테스트를 더한다**

`src/protocol.test.ts` 맨 위 import 에 더한다.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```

파일 끝에 더한다.

```ts
const UNITY = join(import.meta.dirname, '..', 'sdk', 'unity');

test('Unity SDK 의 Caps 는 commands.json 과 같고 SdkVersion 은 sdk/unity/package.json 판과 같다', () => {
  const src = readFileSync(join(UNITY, 'Runtime', 'ControlServer.cs'), 'utf8');
  const caps = /string\[\] Caps = \{([^}]*)\}/.exec(src)?.[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1));
  assert.deepEqual(caps, COMMANDS, 'ControlServer.cs 의 Caps');
  const version = /SdkVersion = "([^"]+)"/.exec(src)?.[1];
  assert.equal(version, (JSON.parse(readFileSync(join(UNITY, 'package.json'), 'utf8')) as { version: string }).version);
});
```

- [ ] **Step 2: 실패를 본다**

Run: `npm run -s build && node --test dist/protocol.test.js`
Expected: FAIL — `ControlServer.cs 의 Caps` (actual `undefined`)

- [ ] **Step 3: SDK 를 고친다**

`sdk/unity/Runtime/ControlServer.cs:26` 의 `private const string Commands = "…";` 줄을 바꾼다.

```csharp
        // protocol/commands.json 의 명령 이름과 같은 차례(src/protocol.test.ts 가 본다) — ping 의 caps 로 CLI 에 알린다.
        private static readonly string[] Caps = { "ping", "tree", "find", "click", "drag", "type", "get", "tap", "key", "screenshot", "errors", "layout" };
        // sdk/unity/package.json 의 version 과 같다(src/protocol.test.ts 가 본다).
        public const string SdkVersion = "0.3.0";
```

`case "ping":` 의 return 을 바꾼다.

```csharp
                case "ping":
                    return "{\"ok\":true,\"app\":" + Json.Str(Application.identifier) + ",\"version\":" + Json.Str(Application.version)
                        + ",\"engine\":\"unity\",\"engineVersion\":" + Json.Str(Application.unityVersion) + ",\"sdkVersion\":\"" + SdkVersion
                        + "\",\"protocol\":2,\"caps\":[\"" + string.Join("\",\"", Caps) + "\"]}";
```

223줄 모르는 명령 답:

```csharp
                    return Error("모르는 명령입니다: " + c.cmd + " (" + string.Join(" · ", Caps) + ")");
```

`sdk/unity/package.json` · `package.json` 의 `"version": "0.2.0"` 을 `"version": "0.3.0"` 으로.

- [ ] **Step 4: 통과를 본다**

Run: `npm run -s build && node --test dist/protocol.test.js`
Expected: PASS — `# pass 2` · `# fail 0`. C# 컴파일은 Task 7 의 sdk-compile CI(구성 9개)가 본다.

- [ ] **Step 5: Commit**

```bash
git add sdk/unity/Runtime/ControlServer.cs sdk/unity/package.json package.json src/protocol.test.ts
git commit -m "Unity SDK ping v2 — engine · engineVersion · sdkVersion · protocol 2 · caps, 판 0.3.0"
```

---

### Task 4: CLI 가 caps 밖 명령을 미리 거절한다

**Files:**
- Modify: `src/game.ts:53-64` · `src/cli.ts:17-27,163-189,305-313,355-366` · `src/fake-game.ts:20-26,46-47`
- Test: `src/cli.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`src/cli.test.ts` 의 PC 테스트(「PC — 띄운 게임에 adb 없이 붙고…」) 바로 뒤에 더한다.

```ts
test('게임 SDK 의 caps 에 없는 명령은 보내지 않고 미리 거절한다 · open 줄에 엔진 · SDK 판', async () => {
  const g = new FakeGame([node('Boot', {}, [node('A', { text: 'a' })])]);
  g.caps = g.caps.filter((c) => c !== 'layout');
  const pc = await fakeTcp(g);
  const port = String(pc.port);
  try {
    assert.match(await cli('-s=caps', 'open', '--pc', '--port', port), /\(PC\) · fake 0 · SDK 0\.3\.0/);
    await assert.rejects(cli('-s=caps', 'layout', '--port', port), /이 게임의 SDK 는 layout 를 못 합니다/);
    assert.ok(!g.commands.some((c) => c.cmd === 'layout'), 'layout 이 게임에 갔습니다');
    await cli('-s=caps', 'close');
  } finally {
    pc.server.close();
  }
});
```

- [ ] **Step 2: 실패를 본다**

Run: `npm run -s build`
Expected: FAIL — `Property 'caps' does not exist on type 'FakeGame'`

- [ ] **Step 3: 가짜 게임 · Game · CLI 를 고친다**

`src/fake-game.ts` — import 에 더하고 `FakeGame` 에 `caps` 를 두고 ping 을 v2 로.

```ts
import { COMMANDS } from './protocol.js';
```
```ts
export class FakeGame {
  clicks: string[] = [];
  keys: string[] = [];
  commands: Command[] = [];
  /** SDK 의 Caps 흉내 — 테스트가 빼서 옛 SDK · 다른 엔진을 흉내 낸다 */
  caps: string[] = [...COMMANDS];
  onBack?: () => void;
```
```ts
      case 'ping':
        return { ok: true, app: 'com.fake.game', version: '1.0', engine: 'fake', engineVersion: '0', sdkVersion: '0.3.0', protocol: 2, caps: this.caps };
```

`src/game.ts` — `Found` 아래에 `PingReply` 를 두고 `Game` 의 생성자 · `call` · `ping` 을 바꾼다.

```ts
export interface PingReply {
  app: string;
  version: string;
  /** protocol 2(SDK 0.3.0)부터 — 옛 SDK 는 app · version 만 준다 */
  engine?: string;
  engineVersion?: string;
  sdkVersion?: string;
  protocol?: number;
  caps?: string[];
}
```
```ts
export class Game {
  /** caps 는 open 때 ping 으로 받은 그 게임 SDK 의 명령 목록 — 없으면(옛 SDK) 다 보낸다 */
  constructor(
    private readonly link: Link,
    private readonly caps?: string[],
  ) {}

  private async call(command: Command): Promise<Reply> {
    if (this.caps && !this.caps.includes(command.cmd))
      throw new Error(`이 게임의 SDK 는 ${command.cmd} 를 못 합니다(할 수 있는 것: ${this.caps.join(' · ')}) — SDK 를 올립니다`);
    const reply = await this.link(command);
    if (reply.ok !== true) throw new Error(reply.error ?? `게임이 실패로 답했습니다: ${JSON.stringify(reply)}`);
    return reply;
  }

  async ping(): Promise<PingReply> {
    return (await this.call({ cmd: 'ping' })) as unknown as PingReply;
  }
```

`src/cli.ts` — import 를 `import { Game, settled, type PingReply, type WaitOptions } from './game.js';` 로, `Session` 에 `caps` 를 더한다.

```ts
  /** open 때 ping 으로 받은 게임 SDK 의 명령 목록 — 밖의 명령은 보내기 전에 거절한다 */
  caps?: string[];
  refs: Record<string, string>;
```

`open` 의 마지막 두 줄(185~188줄)을 바꾼다 — caps 를 화면 찍기 전에 적어 `shot` 이 함께 저장한다.

```ts
    const info = await untilAnswers(game);
    s.caps = info.caps;
    const pid = s.pid ? ` · 프로세스 ${s.pid}` : '';
    const where = via === 'farm' ? `디바이스 팜 ${udid}` : via === 'usb' ? 'USB' : via === 'pc' ? `PC${pid}` : `iPhone ${udid}${pid}`;
    const engine = info.engine ? ` · ${info.engine} ${info.engineVersion} · SDK ${info.sdkVersion}` : '';
    return `세션 ${sname} 열림 — ${info.app} ${info.version} (${where})${engine}\n${await shot(game, s, appium, file, sname, o.dir)}`;
```

`gameOf` 끝줄:

```ts
  return new Game(link, s.caps);
```

`untilAnswers` 의 반환 꼴:

```ts
async function untilAnswers(game: Game): Promise<PingReply> {
```

- [ ] **Step 4: 통과를 본다**

Run: `npm run -s build && node --test dist/cli.test.js`
Expected: PASS — `# fail 0`(새 테스트 포함 13개). 옛 open 줄 검사(`/세션 default 열림 — com\.fake\.game 1\.0 \(디바이스 팜 R1\)/`)는 뒤에 붙은 엔진 글을 막지 않는다.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts src/cli.ts src/fake-game.ts src/cli.test.ts
git commit -m "CLI 가 open 때 받은 caps 를 세션에 적고 밖의 명령은 보내기 전에 거절한다 — 옛 SDK(caps 없음)는 그대로"
```

---

### Task 5: 적합성 검사 — `src/conform.ts`

**Files:**
- Create: `src/conform.ts` · `src/conform.test.ts`
- Modify: `src/fake-game.ts` (`FakeNode` 칸 · `type` · `drag` · `key` · `standardScreen` · `keyFilter`)

- [ ] **Step 1: 실패하는 테스트**

`src/conform.test.ts`:

```ts
// 가짜 표준 화면으로 conform 이 기대값을 맞히고, 다르면 실패로 세고, caps 에 없는 명령은 건너뛰는지 본다
import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFORM, conform, report } from './conform.js';
import { keyFilter, standardScreen, type FakeGame } from './fake-game.js';
import { Game, WAIT } from './game.js';

Object.assign(WAIT, { intervalMs: 5 });
Object.assign(CONFORM, { waitMs: 50 });

const direct = (g: FakeGame) => new Game(async (c) => g.handle(c));

test('표준 화면이면 16줄이 모두 통과한다', async () => {
  const r = await conform(direct(standardScreen()));
  assert.deepEqual([r.passed, r.failed, r.skipped], [16, 0, 0], report(r));
  assert.match(report(r), /^conform — com\.fake\.game 1\.0 · fake 0 · SDK 0\.3\.0 · protocol 2/);
});

test('옛 uGUI setter 차례(qauser0)면 그 줄과 로그인 줄이 실패하고 caps 에 없는 layout 은 건너뛴다', async () => {
  const g = standardScreen((t) => keyFilter(8)(t.slice(0, 8)));
  g.caps = g.caps.filter((c) => c !== 'layout');
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [13, 2, 1], report(r));
  assert.match(report(r), /✗ type IdInput 'qa_user01!' → qauser01 — IdInput: "qauser0"/);
  assert.match(report(r), /- layout 이 답한다 \(이 SDK 의 caps 에 layout 없음\)/);
});
```

- [ ] **Step 2: 실패를 본다**

Run: `npm run -s build`
Expected: FAIL — `Cannot find module './conform.js'` · `has no exported member 'standardScreen'`

- [ ] **Step 3: 가짜 표준 화면**

`src/fake-game.ts` 의 `FakeNode` 에 칸 둘을 더한다.

```ts
export interface FakeNode extends Node {
  children?: FakeNode[];
  onClick?: () => void;
  props?: Record<string, unknown>;
  password?: boolean;
  /** type 이 넣을 글자를 거른다 — 입력칸의 글자 수 · 거르기 흉내 */
  accept?: (text: string) => string;
  /** drag 하면 놓은 자리의 자식으로 옮긴다 — 샘플 Bag/Slot 의 Item 흉내 */
  movable?: boolean;
}
```

`FakeGame` 에 `onKey` 와 부모 찾기를 더한다(`onBack` 아래).

```ts
  onKey?: (key: string) => void;
```
```ts
  private parentOf(child: FakeNode, nodes: FakeNode[] = this.roots): FakeNode | undefined {
    for (const n of nodes) {
      if (n.children?.includes(child)) return n;
      const p = this.parentOf(child, n.children ?? []);
      if (p) return p;
    }
    return undefined;
  }
```

`handle` 의 `drag` · `type` · `key` 를 바꾼다.

```ts
      case 'drag': {
        const to = this.find(c.to as string);
        if (!f.node || !to.node) return { ok: false, error: '없음' };
        if (f.node.movable) {
          const parent = this.parentOf(f.node);
          if (parent) parent.children = parent.children!.filter((x) => x !== f.node);
          else this.roots = this.roots.filter((x) => x !== f.node);
          (to.node.children ??= []).push(f.node);
        }
        return { ok: true, x: 1, y: 1 };
      }
      case 'type':
        if (!f.node) return { ok: false, error: '없음' };
        f.node.text = f.node.accept ? f.node.accept(c.text as string) : (c.text as string);
        return { ok: true, text: f.node.password ? '***' : f.node.text };
```
```ts
      case 'key':
        this.keys.push(c.key as string);
        this.onKey?.(c.key as string);
        // SDK 처럼 Escape 는 뒤로 키와 같다.
        if (c.key === 'Escape') this.onBack?.();
        return { ok: true, key: c.key };
```

파일 끝(`fakeTcp` 위)에 표준 화면을 더한다.

```ts
/** 키로 칠 때처럼 영숫자만 남기고 글자 수로 자른다 — 샘플 IdInput(글자 수 8 · 영숫자) 흉내 */
export const keyFilter = (limit: number) => (text: string) => text.replace(/[^A-Za-z0-9]/g, '').slice(0, limit);

/** 표준 화면 흉내 — sample/Assets/Sample 과 같은 이름 · 같은 반응(conform 의 기대값) */
export function standardScreen(idAccept = keyFilter(8)): FakeGame {
  const status = node('StatusText', { text: '' });
  const tmpStatus = node('TmpStatusText', { text: '' });
  const uitkStatus = node('UitkStatusText', { text: '' });
  const touch = node('TouchText', { text: '' });
  const id = node('IdInput', { kind: 'InputField', interactable: true, text: '', accept: idAccept });
  const tmpId = node('TmpIdInput', { kind: 'TMP_InputField', interactable: true, text: '', accept: keyFilter(8) });
  const uitkId = node('UitkIdInput', { kind: 'TextField', interactable: true, text: '', accept: (t) => t.slice(0, 8) });
  const login = (name: string, label: string, out: FakeNode, from: FakeNode) => {
    let presses = 0;
    return node(name, { kind: 'Button', interactable: true, onClick: () => (out.text = `${label} ${from.text} ${++presses}`) });
  };
  let cubes = 0;
  const game = new FakeGame(
    [
      node('WorldCube', { onClick: () => (touch.text = `cube ${++cubes}`), props: { 'Transform.position': [0, 0, 5] } }),
      node('SampleCanvas', {}, [
        status,
        id,
        login('LoginButton', 'login', status, id),
        touch,
        tmpStatus,
        tmpId,
        login('TmpLoginButton', 'tmp login', tmpStatus, tmpId),
        node('Bag', {}, [node('Slot', {}, [node('Item', { movable: true })]), node('Slot'), node('Slot'), node('Slot')]),
      ]),
      node('UitkDocument', {}, [node('UitkPanel', {}, [uitkStatus, uitkId, login('UitkLoginButton', 'uitk login', uitkStatus, uitkId)])]),
    ],
    'Sample',
  );
  game.onKey = (key) => (touch.text = `key ${key}`);
  return game;
}
```

- [ ] **Step 4: conform 모듈**

`src/conform.ts`:

```ts
// 표준 화면에 정해진 차례로 명령을 보내 기대값과 견준다 — 엔진마다 같은 표준 화면이면 같은 결과가 나와야 한다(docs/roadmap/plan.md 「적합성 검사」)
import type { Game, PingReply } from './game.js';

// 테스트가 줄일 수 있게 묶어 둔다 — 실기기에서 누른 뒤 글자가 바뀌기까지 1초 안팎이다.
export const CONFORM = { waitMs: 5000 };

interface Step {
  /** 이 명령이 게임 SDK 의 caps 에 없으면 건너뛴다 */
  cmd: string;
  label: string;
  run: (game: Game) => Promise<void>;
}

export interface ConformResult {
  ping: PingReply;
  lines: string[];
  passed: number;
  failed: number;
  skipped: number;
}

function same(what: string, got: unknown, want: unknown): void {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: ${JSON.stringify(got)} — 기대 ${JSON.stringify(want)}`);
}

const typed = (target: string, want: string): Step => ({
  cmd: 'type',
  label: `type ${target} 'qa_user01!' → ${want}`,
  run: async (g) => same(target, await g.type(target, 'qa_user01!'), want),
});

// 다시 돌려도 맞게 누른 횟수는 보지 않는다 — 상태 글자에 이 글자가 들어 있으면 통과.
const pressed = (cmd: 'click' | 'key', target: string, status: string, text: string): Step => ({
  cmd,
  label: `${cmd} ${target} → ${status} 에 「${text}」`,
  run: async (g) => {
    if (cmd === 'click') await g.click(target);
    else await g.key(target);
    await g.waitFor(status, { text, timeoutMs: CONFORM.waitMs });
  },
});

// 표준 화면 — Unity 는 sample/Assets/Sample. 다른 엔진 샘플도 같은 이름 · 같은 반응을 만든다.
export const STEPS: Step[] = [
  {
    cmd: 'tree',
    label: 'tree 뿌리에 SampleCanvas · UitkDocument',
    run: async (g) => {
      const roots = (await g.tree()).tree.map((n) => n.name);
      same('없는 뿌리', ['SampleCanvas', 'UitkDocument'].filter((n) => !roots.includes(n)), []);
    },
  },
  { cmd: 'find', label: 'find /UitkDocument/UitkPanel/UitkIdInput', run: async (g) => same('찾음', (await g.find('/UitkDocument/UitkPanel/UitkIdInput')) !== null, true) },
  typed('IdInput', 'qauser01'),
  typed('TmpIdInput', 'qauser01'),
  typed('UitkIdInput', 'qa_user0'),
  pressed('click', 'LoginButton', 'StatusText', 'login qauser01'),
  pressed('click', 'TmpLoginButton', 'TmpStatusText', 'tmp login qauser01'),
  pressed('click', 'UitkLoginButton', 'UitkStatusText', 'uitk login qa_user0'),
  {
    cmd: 'drag',
    label: 'drag Item → /SampleCanvas/Bag/Slot[3]',
    run: async (g) => {
      await g.drag('Item', '/SampleCanvas/Bag/Slot[3]');
      same('옮긴 자리에 있음', (await g.find('/SampleCanvas/Bag/Slot[3]/Item')) !== null, true);
    },
  },
  pressed('click', 'WorldCube', 'TouchText', 'cube'),
  pressed('key', 'I', 'TouchText', 'key I'),
  {
    cmd: 'get',
    label: 'get WorldCube Transform.position → 숫자 셋',
    run: async (g) => {
      const v = await g.get('WorldCube', 'Transform.position');
      same('꼴', Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number'), true);
    },
  },
  { cmd: 'tap', label: 'tap 10 10', run: (g) => g.tap(10, 10) },
  { cmd: 'layout', label: 'layout 이 답한다', run: async (g) => void (await g.layout()) },
  { cmd: 'screenshot', label: 'screenshot 이 그림을 준다', run: async (g) => same('그림이 있음', (await g.screenshot()).length > 0, true) },
  { cmd: 'errors', label: 'errors 가 비었다', run: async (g) => same('오류', (await g.errors()).errors.map((e) => e.message), []) },
];

export async function conform(game: Game): Promise<ConformResult> {
  const ping = await game.ping();
  const r: ConformResult = { ping, lines: [], passed: 0, failed: 0, skipped: 0 };
  for (const step of STEPS) {
    // 옛 SDK(caps 없음)는 다 보낸다.
    if (ping.caps && !ping.caps.includes(step.cmd)) {
      r.skipped++;
      r.lines.push(`- ${step.label} (이 SDK 의 caps 에 ${step.cmd} 없음)`);
      continue;
    }
    try {
      await step.run(game);
      r.passed++;
      r.lines.push(`✓ ${step.label}`);
    } catch (e) {
      r.failed++;
      r.lines.push(`✗ ${step.label} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return r;
}

export function report(r: ConformResult): string {
  const engine = r.ping.engine ? `${r.ping.engine} ${r.ping.engineVersion} · SDK ${r.ping.sdkVersion} · protocol ${r.ping.protocol}` : 'protocol 1(옛 SDK — caps 없음)';
  return [`conform — ${r.ping.app} ${r.ping.version} · ${engine}`, ...r.lines, `통과 ${r.passed} · 실패 ${r.failed} · 건너뜀 ${r.skipped}`].join('\n');
}
```

- [ ] **Step 5: 통과를 본다**

Run: `npm run -s build && node --test dist/conform.test.js dist/cli.test.js dist/crawl.test.js`
Expected: PASS — 셋 모두 `# fail 0`(가짜 게임을 고쳤으니 그것을 쓰는 cli · crawl 테스트도 본다)

- [ ] **Step 6: Commit**

```bash
git add src/conform.ts src/conform.test.ts src/fake-game.ts
git commit -m "적합성 검사 conform — 표준 화면 16줄(type 셋 · 로그인 셋 · drag · 큐브 · 키 · get · tap · layout · screenshot · errors)과 가짜 표준 화면"
```

---

### Task 6: `control-cli conform` 명령 · help · README

**Files:**
- Modify: `src/cli.ts` (import · `HELP` · `switch`) · `src/cli.test.ts` · `README.md`(명령 표 · SDK 명령 표)

- [ ] **Step 1: 실패하는 테스트**

`src/cli.test.ts` import 를 `import { button, fakeFarm, FakeGame, fakeTcp, fakeUsbmux, node, standardScreen } from './fake-game.js';` 로 바꾸고 `import { CONFORM } from './conform.js';` 를 더한다. 맨 위 `Object.assign(WAIT, …)` 줄 아래에 `Object.assign(CONFORM, { waitMs: 50 });` 를 더한다(실패 화면에서 줄마다 5초씩 기다리지 않게). Task 4 테스트 뒤에 더한다.

```ts
test('conform — 표준 화면이면 16줄 통과, 다르면 종료 코드로 알린다', async () => {
  const ok = await fakeTcp(standardScreen());
  const bad = await fakeTcp(new FakeGame([node('Boot')]));
  try {
    await cli('-s=cf', 'open', '--pc', '--port', String(ok.port));
    assert.match(await cli('-s=cf', 'conform', '--port', String(ok.port)), /통과 16 · 실패 0 · 건너뜀 0/);
    await cli('-s=cf', 'close');
    await cli('-s=cf2', 'open', '--pc', '--port', String(bad.port));
    await assert.rejects(cli('-s=cf2', 'conform', '--port', String(bad.port)), /통과 \d+ · 실패 [1-9]/);
    await cli('-s=cf2', 'close');
  } finally {
    ok.server.close();
    bad.server.close();
  }
});
```

- [ ] **Step 2: 실패를 본다**

Run: `npm run -s build && node --test dist/cli.test.js`
Expected: FAIL — `모르는 명령입니다: conform`

- [ ] **Step 3: 명령을 더한다**

`src/cli.ts` import 에 `import { conform, report } from './conform.js';` 를 더한다.
`HELP` 의 `  ping · tree` 줄 아래에 더한다.

```ts
  conform                                          표준 화면(샘플)에 명령을 차례로 보내 기대값과 견준다 — open 바로 뒤에
```

`switch` 의 `case 'crawl':` 위에 더한다.

```ts
    case 'conform': {
      const r = await conform(game);
      const out = report(r);
      // 실패가 있으면 종료 코드 1 — CI · 스크립트가 알아챈다.
      if (r.failed > 0) throw new Error(out);
      return out;
    }
```

`README.md` 126줄(`| \`ping\` · \`tree\` | …`) 아래에 더한다.

```markdown
| `conform` | 표준 화면(샘플)에 명령을 차례로 보내 기대값과 견준다 — `open` 바로 뒤에. 게임 SDK 의 `caps` 에 없는 명령 줄은 건너뛰고, 실패가 있으면 종료 코드 1 | 없음 |
```

`README.md` 「SDK 명령」 표의 ping 행(`| \`ping\` | | \`{ok, app, version}\` |`)을 바꾼다.

```markdown
| `ping` | | `{ok, app, version, engine, engineVersion, sdkVersion, protocol, caps}` — `engine` 부터는 protocol 2(SDK 0.3.0)부터. CLI 는 `open` 때 받은 `caps` 밖 명령을 보내지 않고 거절한다. 명령 정의는 `protocol/commands.json` |
```

- [ ] **Step 4: 통과를 본다**

Run: `npm run -s build && node --test dist/cli.test.js`
Expected: PASS — `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/cli.test.ts README.md
git commit -m "control-cli conform 명령 — 표준 화면 결과 · 실패면 종료 코드 1, README 명령 표 · ping 답"
```

---

### Task 7: 패키지에 protocol/ 싣기 · 전체 테스트 · push · CI

**Files:**
- Modify: `package.json` (`files`) · `README.md`(개발 절)

- [ ] **Step 1: `files` 에 protocol 을 더한다**

```json
  "files": [
    "dist",
    "protocol"
  ],
```

`README.md` 개발 절 `sdk/unity/` 줄 아래에 더한다.

```markdown
명령을 더하거나 바꾸면 `protocol/commands.json` 과 Unity SDK 의 `Caps`(`sdk/unity/Runtime/ControlServer.cs`)를 같이 고친다 — `src/protocol.test.ts` 가 잡는다.
```

- [ ] **Step 2: 패키지에 실리는지 본다**

Run: `npm pack --dry-run 2>&1 | grep -E "protocol/commands.json|dist/protocol.js"`
Expected: 두 줄 모두 나온다

- [ ] **Step 3: 전체 테스트(이 단계의 관문 — 한 번)**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`

- [ ] **Step 4: Commit · push · draft PR**

```bash
git add package.json README.md
git commit -m "npm 패키지에 protocol/ 을 싣는다 · README 개발 절"
git push -u origin p0
gh pr create -R maxihan1/control_cli --draft --base unity-u8 --head roadmap --title "로드맵 — AltTester 기능 전부 + 여러 엔진(P0~P10)" --body-file docs/roadmap/plan.md
gh pr create -R maxihan1/control_cli --draft --base roadmap --head p0 --title "P0 바탕 — 통신 꼴 v2 · protocol/commands.json · conform · sdk/unity/" --body "docs/roadmap/p0-plan.md 대로. 끝 기준: Unity 샘플 conform 초록(팜 · 이 맥)."
```

PR 본문 끝에는 이 세션의 attribution 줄을 붙인다.

- [ ] **Step 5: CI 를 본다**

Run: `gh run list -R maxihan1/control_cli --branch p0 --limit 3` → sdk-compile run 번호로 `gh run watch <번호> -R maxihan1/control_cli --exit-status`
Expected: sdk-compile 초록(meta · 2021.3 · 2022.3 · 6000.0). sample run 은 PR 로 함께 돈다(7개 · 45분쯤).

---

### Task 8: 실기기 conform (끝 기준)

**Files:** 없음(실측) — 결과는 Task 9 에서 문서에

- [ ] **Step 1: 샘플 빌드를 기다려 결과물을 받는다**

Run: `gh run watch <sample run> -R maxihan1/control_cli --exit-status` 뒤
`gh run download <sample run> -R maxihan1/control_cli -n sample-6000.0.84f1-Android-input0 -D <job tmp>/p0-6000-in0` (input1 · 2022.3 input2 · 2021.3 input0 · StandaloneOSX 도 같은 꼴)
Expected: 7개 초록, APK 넷 · `.app` 하나

- [ ] **Step 2: 팜 RF9R408GKRR 에서 APK 마다 conform**

```bash
control-cli hold --udid RF9R408GKRR --minutes 60
control-cli -s=c1 open --app <job tmp>/p0-6000-in0/control-cli-sample.apk && control-cli -s=c1 conform; control-cli -s=c1 close
# 6000.0 input1 · 2022.3 input2 · 2021.3 input0 도 같은 꼴(-s=c2 · c3 · c4)
control-cli release --udid RF9R408GKRR
```

(토큰 · 폰 고정은 이 세션의 `cli.sh` 처럼 `PLATFORM_APPIUM_URL` · `PLATFORM_APPIUM_TOKEN` · `PLATFORM_DEVICE_UDID=RF9R408GKRR` 를 둔다.)
Expected: 넷 모두 `세션 … 열림 … · unity <판> · SDK 0.3.0` 과 `통과 16 · 실패 0 · 건너뜀 0`. 첫 실행에 전체 화면 안내 창이 뜨면 docs/unity/context-notes.md 「두 번째 실기기 시험」대로 한 번 넘긴다.

- [ ] **Step 3: 이 맥에서 macOS 앱 conform**

Run: `pmset -g log | grep -E "Display is turned (on|off)" | tail -1` — `on` 이어야 한다(꺼져 있으면 Unity 가 Metal 프레임 내보내기에서 멈춘다)
Run: `control-cli -s=mac open --pc --app <job tmp>/p0-osx/control-cli-sample.app && control-cli -s=mac conform; control-cli -s=mac close`
Expected: `통과 16 · 실패 0 · 건너뜀 0`. 디스플레이가 꺼져 있으면 이 칸만 남기고 Task 9 에 「남음」으로 적는다.

---

### Task 9: 기록 · 넘김

**Files:**
- Modify: `docs/roadmap/checklist.md` · `docs/roadmap/context-notes.md`

- [ ] **Step 1: 체크리스트 P0 칸을 채우고 「다음 세션은 여기부터」를 P1 로 바꾼다**

P0 의 여섯 칸에 결과(run 번호 · 팜 · 맥)를 적어 `[x]`. 맨 위 블록 첫 줄을 「P1 MCP — 설계 · 구현 계획(writing-plans)부터」로.

- [ ] **Step 2: 결정 기록**

context-notes 에 「P0 끝」 절 — 옮긴 경로 · protocol 2 · caps 미리 거절 · conform 16줄과 결과 · 실기기에서 새로 안 것.

- [ ] **Step 3: Commit · push**

```bash
git add docs/roadmap
git commit -m "P0 끝 — conform 실기기 결과 · 다음은 P1 MCP"
git push
```
