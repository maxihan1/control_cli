# P3-A relay — 게임이 밖으로 거는 길 (설계)

로드맵은 [plan.md](plan.md) P3, 할 일 체크는 [checklist.md](checklist.md) P3-A, 결정은 [context-notes.md](context-notes.md) 「P3-A 설계」.

## Context

지금 CLI 는 게임에게 찾아간다 — 게임 SDK 가 기기 안 `127.0.0.1:13100` 을 열고, CLI 가 adb forward · 디바이스 팜 · usbmuxd · PC TCP 로 그 포트에 닿는다. 그래서 길(USB · 팜 · 같은 컴퓨터)이 없는 게임은 조작하지 못한다 — 브라우저 게임(서버를 못 연다), 케이블 없는 iPhone, 다른 네트워크의 폰.

P3-A 는 방향을 뒤집는다. 게임이 relay 에 연결을 **걸고**, CLI 는 relay 에 명령을 보낸다. AltTester 의 AltTester Server(로컬 · 원격 중계) · 역방향 연결과 같은 몫이다.

P3 은 셋으로 나눈다(사용자 2026-11-06) — **P3-A relay**(이 문서) → P3-B Unity WebGL(P3-A 의 relay 에 브라우저 WebSocket 으로) → P3-C Linux.

사용자 결정(2026-11-06).
- relay 는 로컬이 기본이고, `--token` 을 주면 밖에 공개한다(같은 프로그램 하나)
- 게임은 relay 주소를 빌드 때 받는다(`instrument --relay`). WebGL 은 페이지 주소 `?controlcli=<주소>` 가 먼저(P3-B)
- 게임 → relay 는 모든 플랫폼이 WebSocket — `wss` · HTTP 터널을 지나야 밖 공개가 된다
- 사용자는 relay 를 켜지 않는다 — `open --relay` 가 없으면 백그라운드로 띄운다(MCP 서버 안에서 돌리지 않음). 게임은 2초마다 다시 건다
- 팜 화면에 relay 연결 표시는 다음에(test_platform kit 다음 줄)

## 그림

```
[게임 SDK] ──WebSocket /game (게임이 건다, 2초마다 다시)──▶ [control-cli relay :13101] ◀──HTTP /games/…── [CLI · MCP]
  폰 · PC: ClientWebSocket                                    이 맥: open --relay 가 띄움          open --relay
  WebGL: 브라우저 WebSocket (P3-B)                             밖 공개: 늘 켜 둠 + --token          click · find …
```

## 사용 예

```bash
# 이 맥 macOS 앱
$ control-cli instrument sample --relay ws://127.0.0.1:13101    # QA 빌드에 relay 주소를 굽는다
$ control-cli open --relay                                       # relay 가 없으면 띄우고, 게임이 붙기를 60초까지 기다린다
relay 를 띄웠습니다 — 127.0.0.1:13101 (백그라운드)
세션 default 열림 — com.maxihan1.sample 1.0 (relay · macOS · MacBook) · unity 6000.0.84f1 · SDK 0.9.0
$ control-cli click LoginButton                                  # 그다음은 지금과 같다

# 팜 폰 · 같은 Wi-Fi — 깔고 켜는 건 팜, 명령은 relay
$ control-cli instrument sample --relay ws://<이 맥 Wi-Fi 주소>:13101
$ control-cli hold --udid RF9R408GKRR && control-cli open --relay --app qa.apk

# 게임이 여럿
$ control-cli open --relay
게임이 둘 붙어 있습니다 — --game 으로 고릅니다
  com.maxihan1.sample 1.0 · Android · SM-A325N
  com.maxihan1.sample 1.0 · macOS · MacBook
$ control-cli open --relay --game SM-A325N

# 밖 공개 — 이 맥에 늘 켜 둔 relay(launchd), 게임에는 토큰을 굽지 않는다
$ control-cli instrument game --relay wss://relay.<도메인>
$ control-cli open --relay wss://relay.<도메인>                 # 토큰은 CONTROL_CLI_RELAY_TOKEN · Keychain control-cli-relay

# 붙은 게임 보기
$ control-cli relay status
relay 127.0.0.1:13101 — 게임 2개
  com.maxihan1.sample 1.0 · Android · SM-A325N · 3분째 · 신호 2초 전
```

## 설계

### 1. relay (`control-cli relay [--port 13101] [--token <비밀값>]`)
- Node 내장 `http` 서버 하나 · 포트 하나(기본 13101), 모든 네트워크에서 받는다(같은 Wi-Fi 의 폰이 붙어야 해서)
- `GET /game` (WebSocket upgrade) — 게임 입구. WebSocket 은 손으로 짠다(handshake · frame 읽기/쓰기 · ping/pong · close, `node:crypto` sha1). runtime dependency 0개를 지킨다
- `GET /games` — 붙은 게임 목록 `[{key, app, version, platform, device, engine, engineVersion, sdkVersion, since, lastSeen}]`
- `POST /games/<key>/command` — 몸은 명령 JSON, 답은 `{value: 게임 답}`(디바이스 팜 게임 명령 주소와 같은 꼴). 실패는 HTTP 코드 — 403 권한 · 404 그 게임 없음 · 504 게임이 15초 안에 답 없음 · 502 명령 중 끊김(「명령이 실행됐을 수도 있습니다」)
- 게임 key 는 `<app>@<기기 id 앞 8자>`(Unity `SystemInfo.deviceUniqueIdentifier`) — 다시 붙어도 같다. 화면에는 기종(`SystemInfo.deviceModel`, 예 `SM-A325N`)을 보인다. Android serial 은 Android 10 부터 앱이 못 읽어 쓰지 않는다. 같은 key 가 다시 붙으면 옛 연결을 닫고 새 연결로 바꾼다
- 15초마다 ping — 답이 없으면 그 게임을 목록에서 뺀다(잠든 폰). 터널이 조용한 연결을 끊는 것도 막는다
- 한 게임에 명령이 여럿 오면 차례로 하나씩 보낸다(게임은 받은 차례대로 돈다)

### 2. 권한
- 토큰 없이 띄운 relay(`open` 이 자동으로 띄운 것) — 명령 입구(`/games…`)는 `127.0.0.1` · `::1` 에서 온 요청만. 같은 Wi-Fi 의 다른 컴퓨터는 403
- `--token` 으로 띄운 relay(밖 공개) — 명령 입구는 모든 요청에 `Authorization: Bearer <토큰>`. 터널은 요청을 `127.0.0.1` 에서 온 것처럼 넘기므로 루프백 통과 규칙을 쓰지 않는다
- 게임 입구(`/game`)는 토큰을 받지 않는다 — APK 를 풀면 구운 값이 다 보여 비밀이 될 수 없다. 대가는 가짜 게임 등록이고, 명령은 여전히 토큰이 있어야 보낸다
- CLI 토큰 — `CONTROL_CLI_RELAY_TOKEN` · macOS Keychain `control-cli-relay` 차례(팜 PAT 와 같은 꼴). `--token` 은 이미 팜 토큰 자리라 relay 클라이언트는 쓰지 않는다. relay 서버는 `relay --token` 또는 같은 환경 변수 · Keychain — `open` 이 띄우는 로컬 relay 는 그 변수를 지우고 띄워 늘 토큰 없이 돈다 QA Hub 통합계정 PAT 로 통일은 뒤로(relay 가 인증 서버에 물어야 해서)

### 3. CLI
- `open --relay [주소] [--game <key · 앱 · 기종 일부>]` — 주소 기본 `http://127.0.0.1:13101`(`ws://` · `wss://` 도 받아 `http(s)://` 로)
  - 기본 주소에 relay 가 없으면 `process.execPath dist/main.js relay` 를 떼어 띄운다(detached · 출력은 `~/.control-cli/relay.log`), `GET /games` 가 답할 때까지 5초. 다른 주소에 relay 가 없으면 띄우지 않고 실패
  - 게임 고르기 — 하나면 그것, 여럿이면 목록을 보여 주고 실패(`--game` 으로), 없으면 60초(`TIMING.openWaitMs`)까지 기다린다
  - `--app` 과 함께면 깔고 켜기는 지금 길(팜 Appium · `--ios` devicectl · `--pc` 실행), 명령만 relay. 게임은 켠 뒤에 붙은(또는 다시 붙은) 그 앱으로 고른다 — 팜 폰을 serial 로 맞추지 않는다
  - 백그라운드 relay 는 `close` 가 끄지 않는다(다음 `open` · 다른 세션이 쓴다)
- 세션 파일에 `relay: {url, game: <key>}` — 명령은 `relayLink(url, headers, key)`(`src/link.ts`, `farmLink` 옆)
- `relay status` — `GET /games` 를 표로
- `instrument --relay <주소>` — `Assets/ControlCli/Resources/ControlCliRelay.txt` 에 주소 한 줄. `--relay` 가 없으면 그 파일을 지운다 — relay 는 기본 꺼짐이고, 파일이 없으면 SDK 의 relay 쪽은 스레드 · 연결 없이 잠든다(Release 빌드는 `CONTROL_CLI` 가 없어 SDK 가 통째로 빠진다)
- MCP `open` 도구에 `relay` · `game` 칸

### 4. SDK (Unity, 0.9.0 — `protocol` 은 2 그대로, 명령 · 답 꼴이 같아서)
- `127.0.0.1:13100` 은 그대로 연다 — 팜 · USB · PC 길은 안 바뀐다
- `Relay.cs` — 켤 때 `Resources.Load<TextAsset>("ControlCliRelay")` 를 읽는다. 없으면 아무것도 안 한다
- 백그라운드 스레드가 `ClientWebSocket` 으로 `<주소>/game` 에 걸고, 붙자마자 hello 한 줄(`ping` 답과 같은 내용 + 플랫폼 · 기종 · 기기 id)을 보낸다
- relay → 게임 `<번호> <명령 JSON>`, 게임 → relay `<번호> <답 JSON>`. 번호로 늦은 답이 다음 명령의 답이 되는 일을 막는다
- TCP `Serve` 의 「큐에 넣고 → 10초까지 기다리고 → 답(버림 · 시간 초과 규칙)」을 함수 하나로 뽑아 TCP 와 relay 가 같이 쓴다
- 실패 · 끊김이면 2초 뒤 다시, 끝없이. 로그는 상태가 바뀔 때만 — 「[ControlCli] relay <주소> 에 붙었습니다」 · 「[ControlCli] relay <주소> 와 끊겼습니다 — 2초마다 다시 겁니다」
- iOS — 같은 Wi-Fi 의 맥 주소로 걸면 「로컬 네트워크」 허락이 뜬다. QA 빌드 훅이 `Info.plist` 에 `NSLocalNetworkUsageDescription` 을 넣는다(relay 주소 파일이 있는 빌드만)

### 5. 시간 초과 차례
게임 10초(지금과 같음) → relay 15초 → CLI 20초(지금과 같음). 먼저 말하는 쪽이 까닭을 안다.

## 확인할 위험 (구현 · 실기기 때)
- IL2CPP 에서 `ClientWebSocket` 의 `wss` TLS — Unity 2021.3 · 2022.3 · 6000.0
- Android 9+ 의 cleartext 막기가 Unity(Mono 소켓)의 `ws://` 에도 걸리나
- 폰이 뒤로 갔다 오면(`conform` 일시정지 줄) 연결이 끊기나 — 끊기면 2초 안에 다시 붙어야 다음 줄이 돈다

## 테스트 · 끝 기준
- 단위(실기기 없이) — Node 22 내장 `WebSocket` 클라이언트로 가짜 게임을 relay 에 붙여: `open --relay` → `conform` 52줄 초록, 토큰 · 루프백 거절, 게임 여럿 고르기, 끊겼다 다시 붙어도 세션 이어짐, 늦은 답 번호로 거르기, 백그라운드 relay 띄우기. `instrument --relay` 가 주소 파일을 넣는다
- CI — sdk-compile(meta · 2021.3 · 2022.3 · 6000.0) 초록. `sample.yml` 에 손으로 돌릴 때 넣는 `relay` 입력(빌드에 구울 주소)
- 실기기
  - 이 맥 macOS 앱 → 로컬 relay: 「통과 51 · 실패 0 · 미실행 1」(PC 는 일시정지가 안 난다)
  - 팜 폰 → 같은 Wi-Fi 의 이 맥 relay: 「통과 52 · 실패 0 · 미실행 0」
  - 팜 폰 → 밖 공개 relay(`wss` · 토큰): 「통과 52」 — 터널 주소(`relay.<도메인>` → 이 맥 13101)는 사용자가 연다
  - iPhone USB 없이 — 사용자 실측
- README(relay 절 · 명령 표 · AltTester 표 연결 줄) · test_platform kit 다음 줄(팜 화면 relay 표시 · `GET /games` 꼴)

## 범위 밖
- 팜 화면 relay 표시(test_platform), QA Hub PAT 로 토큰 통일, WebGL(P3-B), Linux(P3-C)
- 실행 때 relay 주소 바꾸기(PC 명령줄 · intent extra) — 빌드 때 굽기로 충분할 때까지

## 시간
2~3일 — relay · CLI · 테스트 1일, SDK 반나절, 실기기 반나절~1일.

---

# P3-A 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임이 WebSocket 으로 거는 `control-cli relay` 를 만들고, CLI · MCP · Unity SDK 가 그 길로 명령을 주고받게 한다.

**Architecture:** relay 는 Node 내장 `http` 서버 하나(손으로 짠 WebSocket, dependency 0). 게임은 `/game` 에 걸어 hello 뒤 `<번호> <명령>` 을 받고 `<번호> <답>` 으로 답한다. CLI 는 `/games/<key>/command` 에 HTTP 로 보낸다 — 디바이스 팜 게임 명령 주소와 같은 `{value}` 꼴이라 `farmLink` 와 길을 같이 쓴다.

**Tech Stack:** Node 22(`node:http` · `node:crypto` · 내장 `WebSocket` 클라이언트는 테스트만), TypeScript strict, `node:test`. Unity C#(`System.Net.WebSockets.ClientWebSocket`), Docker C# 컴파일 검사(`tools/unity-compile-check`).

## 파일

| 파일 | 몫 |
|---|---|
| `src/relay.ts` (새) | relay 서버 — WebSocket handshake · frame 읽기/쓰기 · 게임 목록 · 명령 넘기기 · ping · 권한 |
| `src/relay.test.ts` (새) | frame 조각 모으기 · 권한 · 번호 · 시간 초과 · 끊김 · 다시 붙기 · ping 빼기 |
| `src/fake-game.ts` | `fakeRelayGame` — SDK `Relay.cs` 흉내 |
| `src/link.ts` | `postLink`(팜 · relay 공통) · `relayLink` |
| `src/cli.ts` | `open --relay [주소] [--game]` · `relay` · `relay status` · `instrument --relay` · 세션 `relay` 칸 · HELP |
| `src/cli.test.ts` | relay 로 열기 → conform · 게임 고르기 · 다시 붙기 · 로컬 relay 띄우기 |
| `src/main.ts` | Keychain `control-cli-relay` → `CONTROL_CLI_RELAY_TOKEN` |
| `src/mcp.ts` · `src/mcp.test.ts` | `open` 도구 `relay` · `game` 칸 |
| `src/instrument.ts` · `src/instrument.test.ts` | 주소 파일 쓰기 · 지우기 |
| `sdk/unity/Runtime/ControlServer.cs` | `PingReply()` · `Ask()` 로 뽑기, `Relay.Start(Ask)` |
| `sdk/unity/Runtime/Relay.cs` (+ `.meta`, 새) | 주소 파일 읽기 · 걸기 · hello · 받기/답하기 · 2초마다 다시 |
| `sdk/unity/Editor/LocalNetwork.cs` (+ `.meta`, 새) | iOS `Info.plist` 에 `NSLocalNetworkUsageDescription` |
| `sdk/unity/package.json` · `package.json` | 0.9.0 |
| `.github/workflows/sample.yml` | 손으로 돌릴 때 `relay` 입력 |
| 문서 | README(relay 절 · 명령 표 · AltTester 표) · plan.md · checklist · context-notes 「P3-A 구현」 · 「P3-A 실기기」 · kit 다음 줄 |

## 차례 (커밋 단위)

### Task 1: relay 서버 (`src/relay.ts`) · `relayLink`

**Files:** Create `src/relay.ts` · `src/relay.test.ts` · Modify `src/fake-game.ts`(끝에 더함) · `src/link.ts:85-100`

- [ ] **Step 1: 가짜 relay 게임을 `src/fake-game.ts` 끝에 더한다**

```ts
/** relay 에 거는 게임 흉내 — SDK Relay.cs 처럼 hello 한 줄 뒤 `<번호> <명령>` 에 `<번호> <답>` 으로 답한다 */
export async function fakeRelayGame(game: FakeGame, url: string, hello: Record<string, unknown> = {}): Promise<WebSocket> {
  const ws = new WebSocket(`${url.replace(/^http/, 'ws')}/game`);
  await new Promise<void>((ok, no) => {
    ws.onopen = () => ok();
    ws.onerror = () => no(new Error(`relay ${url} 에 붙지 못했습니다`));
  });
  ws.send(`hello ${JSON.stringify({ app: 'com.fake.game', version: '1.0', engine: 'fake', engineVersion: '0', sdkVersion: '0.3.0', platform: 'macOS', model: 'FakeBook', device: 'fake', deviceId: 'fake-device-1', ...hello })}`);
  ws.onmessage = (e) => {
    const text = String(e.data);
    const sp = text.indexOf(' ');
    ws.send(`${text.slice(0, sp)} ${JSON.stringify(game.handle(JSON.parse(text.slice(sp + 1)) as Command))}`);
  };
  return ws;
}
```

- [ ] **Step 2: 실패하는 테스트 `src/relay.test.ts`**

```ts
// relay 가 게임 WebSocket 을 붙잡고 HTTP 명령을 번호로 넘기며, 권한 · 시간 초과 · 끊김 · 다시 붙기를 가르는지 본다
import assert from 'node:assert/strict';
import { connect as tcp, type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

import { fakeRelayGame, standardScreen } from './fake-game.js';
import { relayLink } from './link.js';
import { allowed, frame, reader, relay, RELAY, type GameInfo } from './relay.js';

Object.assign(RELAY, { replyMs: 100, pingMs: 30 });
const server = relay();
let url = '';
let port = 0;
before(async () => {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as AddressInfo).port;
  url = `http://127.0.0.1:${port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const games = async () => ((await (await fetch(`${url}/games`)).json()) as { value: GameInfo[] }).value;
const post = (key: string, body: unknown) => fetch(`${url}/games/${encodeURIComponent(key)}/command`, { method: 'POST', body: JSON.stringify(body) });
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const until = async (ok: () => Promise<boolean>) => {
  for (let i = 0; i < 200 && !(await ok()); i++) await sleep(5);
};

test('frame 을 조각내어 넣어도 reader 가 글 하나로 모은다 — 가린 frame · 126 길이 · FIN 0 이어 붙이기', () => {
  const masked = (op: number, fin: boolean, text: string) => {
    const p = Buffer.from(text);
    const m = Buffer.from([1, 2, 3, 4]);
    const b0 = (fin ? 0x80 : 0) | op;
    const head = p.length < 126 ? Buffer.from([b0, 0x80 | p.length]) : Buffer.from([b0, 0x80 | 126, p.length >> 8, p.length & 255]);
    return Buffer.concat([head, m, Buffer.from(p.map((b, i) => b ^ m[i & 3]))]);
  };
  const got: string[] = [];
  const read = reader((t) => got.push(t), () => {});
  const long = '가'.repeat(100);
  const all = Buffer.concat([masked(1, false, 'a'), masked(0, true, 'b'), masked(1, true, long)]);
  for (let i = 0; i < all.length; i += 7) read(all.subarray(i, i + 7));
  assert.deepEqual(got, ['ab', long]);
  assert.deepEqual([...frame(1, Buffer.from('hi'))], [0x81, 2, 104, 105]);
});

test('토큰 없는 relay 는 이 컴퓨터 요청만, 토큰 relay 는 늘 토큰을 본다(터널은 127.0.0.1 로 넘긴다)', () => {
  assert.equal(allowed('127.0.0.1', undefined, undefined), undefined);
  assert.equal(allowed('::ffff:127.0.0.1', undefined, undefined), undefined);
  assert.match(allowed('192.168.0.7', undefined, undefined)!, /그 컴퓨터 안에서만/);
  assert.match(allowed('127.0.0.1', undefined, 's3cret')!, /토큰이 맞지 않습니다/);
  assert.match(allowed('127.0.0.1', 'Bearer nope', 's3cret')!, /토큰이 맞지 않습니다/);
  assert.equal(allowed('203.0.113.9', 'Bearer s3cret', 's3cret'), undefined);
});

test('붙은 게임이 목록에 나오고 명령이 번호를 달고 가서 답이 돌아온다 · 끊기면 목록에서 빠진다', async () => {
  const ws = await fakeRelayGame(standardScreen(), url);
  await until(async () => (await games()).length === 1);
  const [g] = await games();
  assert.deepEqual([g.key, g.app, g.platform, g.model], ['com.fake.game@fake-dev', 'com.fake.game', 'macOS', 'FakeBook']);
  assert.equal((await relayLink(url, {}, g.key)({ cmd: 'ping' })).app, 'com.fake.game');
  ws.close();
  await until(async () => (await games()).length === 0);
  await assert.rejects(relayLink(url, {}, g.key)({ cmd: 'ping' }), /게임 com\.fake\.game@fake-dev 이 relay 에 붙어 있지 않습니다/);
});

test('늦은 답은 번호가 달라 다음 명령의 답이 되지 않고, 명령 중 끊기면 502', async () => {
  const ws = new WebSocket(`${url.replace('http', 'ws')}/game`);
  await new Promise((ok) => (ws.onopen = ok));
  ws.send(`hello ${JSON.stringify({ app: 'slow', deviceId: 'slow-device' })}`);
  ws.onmessage = (e) => {
    const text = String(e.data);
    const id = text.slice(0, text.indexOf(' '));
    const cmd = (JSON.parse(text.slice(text.indexOf(' ') + 1)) as { cmd: string }).cmd;
    if (cmd === 'tree') setTimeout(() => ws.send(`${id} {"ok":true,"late":true}`), RELAY.replyMs * 2);
    else if (cmd === 'ping') ws.send(`${id} {"ok":true,"pong":true}`);
    else ws.close();
  };
  await until(async () => (await games()).some((g) => g.key === 'slow@slow-dev'));
  assert.equal((await post('slow@slow-dev', { cmd: 'tree' })).status, 504);
  assert.deepEqual(await (await post('slow@slow-dev', { cmd: 'ping' })).json(), { value: { ok: true, pong: true } });
  await sleep(RELAY.replyMs * 2); // 늦은 tree 답이 이때 온다 — 버려야 한다
  assert.deepEqual(await (await post('slow@slow-dev', { cmd: 'ping' })).json(), { value: { ok: true, pong: true } });
  const gone = await post('slow@slow-dev', { cmd: 'click' });
  assert.equal(gone.status, 502);
  assert.match(((await gone.json()) as { value: { message: string } }).value.message, /실행됐을 수도/);
});

test('토큰 relay 는 토큰 없는 명령을 403, 없는 게임은 404, 명령 꼴이 틀리면 400', async () => {
  const locked = relay({ token: 's3cret' });
  await new Promise<void>((ok) => locked.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(locked.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/games`)).status, 403);
    const headers = { Authorization: 'Bearer s3cret' };
    assert.equal((await fetch(`${base}/games`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/games/nope/command`, { method: 'POST', headers, body: '{"cmd":"ping"}' })).status, 404);
    assert.equal((await fetch(`${base}/games/nope/command`, { method: 'POST', headers, body: 'ping' })).status, 400);
  } finally {
    locked.close();
  }
});

test('같은 게임이 다시 붙으면 새 연결로 바꾸고, ping 에 답하지 않는 연결은 뺀다', async () => {
  const a = await fakeRelayGame(standardScreen(), url, { deviceId: 'again-01' });
  await until(async () => (await games()).some((g) => g.key === 'com.fake.game@again-01'));
  const b = await fakeRelayGame(standardScreen(), url, { deviceId: 'again-01' });
  await until(async () => a.readyState === WebSocket.CLOSED);
  assert.equal(a.readyState, WebSocket.CLOSED);
  assert.equal((await post('com.fake.game@again-01', { cmd: 'ping' })).status, 200);
  b.close();

  // hello 만 보내고 ping 에 pong 을 하지 않는 연결 — 잠든 폰. 요청과 같은 조각에 frame 을 실어 head 길도 본다.
  const raw = tcp(port, '127.0.0.1');
  raw.on('error', () => {});
  raw.write(Buffer.concat([
    Buffer.from('GET /game HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'),
    frame(1, Buffer.from('hello {"app":"mute","deviceId":"mute-dev"}')),
  ]));
  await until(async () => (await games()).some((g) => g.key === 'mute@mute-dev'));
  await until(async () => !(await games()).some((g) => g.key === 'mute@mute-dev'));
  assert.ok(!(await games()).some((g) => g.key === 'mute@mute-dev'));
  raw.destroy();
});
```

- [ ] **Step 3: 돌려 실패를 본다**

Run: `npm run build 2>&1 | tail -3`
Expected: FAIL — `Cannot find module './relay.js'` · `relayLink` 없음

- [ ] **Step 4: `src/relay.ts`**

```ts
// 게임이 WebSocket 으로 걸어 오는 연결을 붙잡아 두고 CLI 의 HTTP 명령을 그 게임에 넘긴다 — control-cli relay
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

export const RELAY_PORT = 13101;
// 게임은 10초 · CLI 는 20초에 끊는다 — relay 는 그 사이(15초). ping 은 터널이 조용한 연결을 끊는 것(100초 꼴)보다 자주. 테스트가 줄인다.
export const RELAY = { replyMs: 15_000, pingMs: 15_000 };

/** 게임이 붙자마자 보내는 hello(ping 답 + 플랫폼 · 기종 · 기기)에 relay 가 key · 시각을 더한 것 */
export interface GameInfo {
  /** `<앱>@<기기 id 앞 8자>` — 게임을 다시 켜도 같다 */
  key: string;
  app: string;
  version: string;
  platform: string;
  model: string;
  device: string;
  engine?: string;
  engineVersion?: string;
  sdkVersion?: string;
  since: number;
  lastSeen: number;
}

// 게임 답 한 줄(JSON) · 시간 초과 · 명령 중 끊김
type Outcome = string | 'timeout' | 'gone';

interface Conn {
  info: GameInfo;
  socket: Duplex;
  pending: Map<number, (o: Outcome) => void>;
  // 한 게임에는 명령을 하나씩 — 게임도 받은 차례대로 돈다.
  queue: Promise<unknown>;
  alive: boolean;
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/** 서버 → 게임 frame — 서버는 가리지 않는다(RFC 6455 5.1) */
export function frame(op: number, payload: Buffer): Buffer {
  const n = payload.length;
  let head: Buffer;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) head = Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
  else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | op;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

/** 게임 → 서버 frame 을 읽는다 — TCP 조각을 모으고, 여러 조각 메시지(FIN 0 + 이어짐)는 한 글로 */
export function reader(onText: (text: string) => void, onControl: (op: number, payload: Buffer) => void): (chunk: Buffer) => void {
  let buf = Buffer.alloc(0);
  let parts: Buffer[] = [];
  return (chunk) => {
    // ponytail: 조각마다 이어 붙여 큰 답(오류 기록 수백 KB)은 O(n²) — 느리면 조각 목록으로
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        at = 10;
      }
      const maskAt = at;
      if (masked) at += 4;
      if (buf.length < at + len) return;
      const payload = Buffer.from(buf.subarray(at, at + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[maskAt + (i & 3)];
      buf = buf.subarray(at + len);
      if (op >= 8) onControl(op, payload);
      else {
        parts.push(payload);
        if (fin) {
          const text = Buffer.concat(parts).toString('utf8');
          parts = [];
          onText(text);
        }
      }
    }
  };
}

/** 명령 입구 권한 — 토큰 relay 는 늘 토큰, 토큰 없는 relay 는 이 컴퓨터에서 온 요청만. 막으면 까닭 */
export function allowed(remote: string | undefined, auth: string | undefined, token: string | undefined): string | undefined {
  if (token) {
    const want = Buffer.from(`Bearer ${token}`);
    const got = Buffer.from(auth ?? '');
    return got.length === want.length && timingSafeEqual(got, want) ? undefined : 'relay 토큰이 맞지 않습니다 — CONTROL_CLI_RELAY_TOKEN 이나 Keychain control-cli-relay 를 봅니다';
  }
  return LOOPBACK.includes(remote ?? '') ? undefined : '이 relay 는 그 컴퓨터 안에서만 명령을 받습니다 — 밖에서 쓰려면 relay 를 --token 으로 띄웁니다';
}

export function relay(o: { token?: string } = {}): Server {
  const games = new Map<string, Conn>();
  let next = 0;

  const drop = (c: Conn) => {
    if (games.get(c.info.key) === c) games.delete(c.info.key);
    for (const done of [...c.pending.values()]) done('gone');
    c.socket.destroy();
  };

  const ask = (c: Conn, line: string): Promise<Outcome> => {
    const run = () =>
      new Promise<Outcome>((done) => {
        if (c.socket.destroyed) return done('gone');
        const id = ++next;
        const finish = (out: Outcome) => {
          clearTimeout(timer);
          c.pending.delete(id);
          done(out);
        };
        const timer = setTimeout(() => finish('timeout'), RELAY.replyMs);
        c.pending.set(id, finish);
        c.socket.write(frame(1, Buffer.from(`${id} ${line}`)));
      });
    const p = c.queue.then(run, run);
    c.queue = p;
    return p;
  };

  const send = (res: ServerResponse, status: number, body: string) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  };
  const fail = (res: ServerResponse, status: number, message: string) => send(res, status, JSON.stringify({ value: { message } }));

  async function http(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const why = allowed(req.socket.remoteAddress, req.headers.authorization, o.token);
    if (why) return fail(res, 403, why);
    const path = new URL(req.url ?? '/', 'http://relay').pathname;
    if (req.method === 'GET' && path === '/games') return send(res, 200, JSON.stringify({ value: [...games.values()].map((c) => c.info) }));
    const m = /^\/games\/([^/]+)\/command$/.exec(path);
    if (req.method !== 'POST' || !m) return fail(res, 404, `relay 에 없는 주소입니다: ${req.method} ${path}`);
    req.setEncoding('utf8');
    let body = '';
    for await (const chunk of req) body += chunk;
    let line: string;
    try {
      const cmd = JSON.parse(body) as { cmd?: unknown } | null;
      if (typeof cmd?.cmd !== 'string') throw new Error('cmd 없음');
      line = JSON.stringify(cmd);
    } catch {
      return fail(res, 400, '명령은 {"cmd": …} JSON 객체여야 합니다');
    }
    const key = decodeURIComponent(m[1]);
    const c = games.get(key);
    if (!c) return fail(res, 404, `게임 ${key} 이 relay 에 붙어 있지 않습니다 — 게임이 켜져 있나요? 켜면 2초 안에 다시 붙습니다`);
    const out = await ask(c, line);
    if (out === 'timeout') return fail(res, 504, `게임이 ${RELAY.replyMs / 1000}초 안에 relay 에 답하지 않았습니다`);
    if (out === 'gone') return fail(res, 502, '게임이 명령 중에 relay 와 끊겼습니다 — 명령이 실행됐을 수도 있습니다');
    send(res, 200, `{"value":${out}}`);
  }

  const server = createServer((req, res) => void http(req, res).catch((e: unknown) => fail(res, 500, e instanceof Error ? e.message : String(e))));

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const wsKey = req.headers['sec-websocket-key'];
    if (new URL(req.url ?? '/', 'http://relay').pathname !== '/game' || typeof wsKey !== 'string') return void socket.destroy();
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${createHash('sha1').update(wsKey + GUID).digest('base64')}\r\n\r\n`);
    let c: Conn | undefined;
    const read = reader(
      (text) => {
        if (c) {
          c.alive = true;
          c.info.lastSeen = Date.now();
          const sp = text.indexOf(' ');
          c.pending.get(Number(text.slice(0, sp)))?.(text.slice(sp + 1));
          return;
        }
        let h: Partial<GameInfo> & { deviceId?: string };
        try {
          if (!text.startsWith('hello ')) throw new Error('hello 아님');
          h = JSON.parse(text.slice(6)) as typeof h;
        } catch {
          return void socket.destroy();
        }
        const now = Date.now();
        const info: GameInfo = {
          key: `${h.app ?? '?'}@${(h.deviceId ?? '').slice(0, 8)}`,
          app: h.app ?? '?',
          version: h.version ?? '?',
          platform: h.platform ?? '?',
          model: h.model ?? '?',
          device: h.device ?? '?',
          engine: h.engine,
          engineVersion: h.engineVersion,
          sdkVersion: h.sdkVersion,
          since: now,
          lastSeen: now,
        };
        // 같은 게임이 다시 붙었다 — 옛 연결은 죽은 것(앱을 다시 켰거나 Wi-Fi 가 바뀌었다).
        const old = games.get(info.key);
        if (old) drop(old);
        c = { info, socket, pending: new Map(), queue: Promise.resolve(), alive: true };
        games.set(info.key, c);
      },
      (op, payload) => {
        if (c) {
          c.alive = true;
          c.info.lastSeen = Date.now();
        }
        if (op === 9) socket.write(frame(10, payload));
        else if (op === 8) {
          socket.end(frame(8, Buffer.alloc(0)));
          if (c) drop(c);
        }
      },
    );
    socket.on('data', read);
    socket.on('error', () => {});
    socket.on('close', () => c && drop(c));
    // 요청과 같은 조각에 온 frame 은 head 로 온다.
    if (head.length) read(head);
  });

  // ping 한 번 사이(15초) 아무것도 안 온 연결은 뺀다 — 잠든 폰 · 끊긴 Wi-Fi 는 close 가 안 온다.
  const beat = setInterval(() => {
    for (const c of [...games.values()]) {
      if (!c.alive) {
        drop(c);
        continue;
      }
      c.alive = false;
      c.socket.write(frame(9, Buffer.alloc(0)));
    }
  }, RELAY.pingMs);
  beat.unref();
  server.on('close', () => {
    clearInterval(beat);
    for (const c of [...games.values()]) drop(c);
  });
  return server;
}
```

- [ ] **Step 5: `src/link.ts` 의 `farmLink`(85~100줄)를 `postLink` 로 나누고 `relayLink` 를 더한다**

```ts
// HTTP 로 명령 하나를 보내고 {value: 게임 답} 을 받는다 — 성공 · 오류는 HTTP 코드로 가른다(디바이스 팜 · relay 가 같은 꼴, Devicefarm 안내서 12절 · 7절).
function postLink(endpoint: string, headers: Record<string, string>, refused: (status: number, message?: string) => string): Link {
  return async (command) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { value?: unknown } | null;
    if (!res.ok) throw new Error(refused(res.status, (body?.value as { message?: string } | undefined)?.message));
    return asReply(body?.value);
  };
}

// 디바이스 팜 게임 명령 주소 — 잡은 사람만 받는다.
export function farmLink(farm: string, headers: Record<string, string>, serial: string): Link {
  return postLink(`${farm}/api/devices/${encodeURIComponent(serial)}/game`, headers, (status, message) => `디바이스 팜이 게임 명령을 HTTP ${status} 로 거절했습니다${message ? `: ${message}` : ''}`);
}

// relay 에 붙은 게임 — key 는 <앱>@<기기 id 앞 8자>라 게임을 다시 켜도 같은 세션으로 간다. relay 의 거절 글은 그대로 보인다.
export function relayLink(url: string, headers: Record<string, string>, key: string): Link {
  const link = postLink(`${url}/games/${encodeURIComponent(key)}/command`, headers, (status, message) => message ?? `relay 가 게임 명령을 HTTP ${status} 로 거절했습니다`);
  return (command) =>
    link(command).catch((e: unknown) => {
      // fetch 는 닿지 못하면 TypeError('fetch failed') 를 던진다.
      throw e instanceof TypeError ? new Error(`relay ${url} 에 닿지 못했습니다 — relay 가 꺼졌으면 close 뒤 open --relay 로 다시 엽니다`) : e;
    });
}
```
파일 머리 주석 — `// 게임 SDK 에 명령 하나를 보내는 길 — 디바이스 팜 게임 명령 주소 · relay(HTTP) · USB adb forward(TCP) · PC(TCP) · USB iPhone(usbmuxd)`

- [ ] **Step 6: 통과를 본다** — Run: `npm run build && node --test dist/relay.test.js dist/cli.test.js 2>&1 | grep -E '^# (pass|fail)'` · Expected: `# fail 0`(cli.test 의 팜 줄은 `farmLink` 를 바꾼 뒤에도 그대로)
- [ ] **Step 7: 커밋** — 「relay — 게임 WebSocket 을 붙잡고 HTTP 명령을 번호로 넘긴다(손으로 짠 WebSocket · 권한 · ping), relayLink」

### Task 2: CLI `relay` · `relay status` · `open --relay`

**Files:** Modify `src/cli.ts` · `src/main.ts` · Test `src/cli.test.ts`

- [ ] **Step 1: 실패하는 테스트를 `src/cli.test.ts` 끝에 더한다** — 머리에 `import type { AddressInfo } from 'node:net';` · `import { relay } from './relay.js';`, fake-game import 줄에 `fakeRelayGame`

```ts
test('relay 로 연 게임은 conform 이 일시정지 줄(Appium 없음) 말고 모두 통과하고, 다시 붙어도 같은 세션으로 간다', async () => {
  const r = relay();
  await new Promise<void>((ok) => r.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${(r.address() as AddressInfo).port}`;
  const game = standardScreen();
  let ws = await fakeRelayGame(game, url);
  try {
    assert.match(await cli('-s=relay', 'open', '--relay', url), /^세션 relay 열림 — com\.fake\.game 1\.0 \(relay · macOS · FakeBook\) · fake 0 · SDK 0\.3\.0/m);
    assert.match(await cli('-s=relay', 'conform'), /\n통과 51 · 실패 0 · 미실행 1$/);
    ws.close();
    // relay 가 끊김을 알기 전이면 502(끊겼습니다), 안 뒤면 404(붙어 있지 않습니다)
    await assert.rejects(cli('-s=relay', 'snapshot'), /relay 에 붙어 있지 않습니다|relay 와 끊겼습니다/);
    ws = await fakeRelayGame(game, url);
    assert.match(await cli('-s=relay', 'snapshot'), /- Snapshot:/);
    assert.equal(await cli('-s=relay', 'close'), '세션 relay 닫음');
  } finally {
    ws.close();
    r.closeAllConnections();
    r.close();
  }
});

test('relay 에 게임이 여럿이면 목록을 보이고 --game 으로 고른다 · 없으면 기다리다 실패 · relay status', async () => {
  const r = relay();
  await new Promise<void>((ok) => r.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${(r.address() as AddressInfo).port}`;
  await assert.rejects(cli('-s=none', 'open', '--relay', url), /relay .* 에 붙은 게임이 없습니다 — QA 빌드에 instrument --relay/);
  await cli('-s=none', 'close'); // open 이 먼저 적어 둔 세션 파일
  const a = await fakeRelayGame(standardScreen(), url, { deviceId: 'phone-0001', platform: 'Android', model: 'SM-A325N' });
  const b = await fakeRelayGame(standardScreen(), url);
  try {
    await assert.rejects(cli('-s=two', 'open', '--relay', url), /게임이 2개 붙어 있습니다 — --game 으로 고릅니다\n  com\.fake\.game 1\.0 · /);
    await cli('-s=two', 'close');
    assert.match(await cli('-s=two', 'open', '--relay', url, '--game', 'SM-A325N'), /\(relay · Android · SM-A325N\)/);
    assert.match(await cli('relay', 'status', url), /^relay http:\/\/127\.0\.0\.1:\d+ — 게임 2개\n  com\.fake\.game 1\.0 · /);
    await cli('-s=two', 'close');
  } finally {
    a.close();
    b.close();
    r.closeAllConnections();
    r.close();
  }
});

test('이 컴퓨터 주소에 relay 가 없으면 open 이 백그라운드로 띄우고, 밖 주소는 띄우지 않는다', async () => {
  const { createServer } = await import('node:net');
  const probe = createServer();
  await new Promise<void>((ok) => probe.listen(0, '127.0.0.1', ok));
  const port = (probe.address() as AddressInfo).port;
  await new Promise((ok) => probe.close(ok));
  const url = `http://127.0.0.1:${port}`;
  // 게임은 SDK 처럼 relay 가 뜰 때까지 다시 건다.
  let ws: WebSocket | undefined;
  const dial = setInterval(() => void fakeRelayGame(standardScreen(), url).then((w) => ((ws = w), clearInterval(dial)), () => {}), 50);
  Object.assign(TIMING, { openWaitMs: 5000 });
  try {
    const out = await cli('-s=spawned', 'open', '--relay', url);
    assert.match(out, /^relay 를 띄웠습니다 — http:\/\/127\.0\.0\.1:\d+ \(프로세스 \d+/);
    process.kill(Number(/프로세스 (\d+)/.exec(out)![1]));
    await cli('-s=spawned', 'close');
  } finally {
    clearInterval(dial);
    ws?.close();
    Object.assign(TIMING, { openWaitMs: 200 });
  }
  await assert.rejects(cli('-s=far', 'open', '--relay', 'wss://relay.invalid'), /relay https:\/\/relay\.invalid 에 닿지 못했습니다 — 밖 relay 는 띄우지 않습니다/);
});
```

- [ ] **Step 2: 돌려 실패를 본다** — Run: `npm run build 2>&1 | tail -3; node --test --test-name-pattern=relay dist/cli.test.js 2>&1 | grep -E '^# (pass|fail)'` · Expected: FAIL — `Unknown option '--relay'`

- [ ] **Step 3: `src/cli.ts` 를 고친다**

머리 import:
```ts
import { closeSync, existsSync, openSync, readdirSync } from 'node:fs';
import { farmLink, GAME_PORT, iosLink, relayLink, tcpLink, usbLink, type Command, type Reply } from './link.js';
import { relay, RELAY_PORT, type GameInfo } from './relay.js';
```

`Session` — `via` 에 `'relay'`(이미 켜진 게임이 relay 에 걸어 왔다)를 더하고 칸 하나:
```ts
  /** open --relay — 명령은 이 relay 의 이 게임으로(깔고 켜기는 via 길 그대로) */
  relay?: { url: string; key: string };
```

`parseArgs` options 에 `relay: { type: 'boolean' }, game: { type: 'string' },`. 주소는 뒤 글자(`open --relay <주소>` · `instrument <폴더> --relay <주소>`)에서 `ws(s)://` · `http(s)://` 로 시작하는 것을 고른다.

HELP — `open --ios` 줄 아래에 둘, `instrument` 줄 바꿈, `연결:` 줄 아래에 한 줄:
```
  open --relay [주소] [--game <이름>] [--app …]   relay 에 걸어 온 게임 — 주소가 없으면 이 컴퓨터 relay(없으면 띄운다). --app 이면 깔고 켜기는 팜 · --pc · --ios 길
  relay [--port 13101] [--token <비밀값>] · relay status [주소]   게임이 거는 중계를 띄운다 · 붙은 게임을 본다
  instrument <Unity 프로젝트 폴더> [--ref <커밋>] [--relay <주소>]  QA 빌드에 SDK 를 넣는다 — relay 주소를 주면 게임이 그리로 건다
relay 토큰: CONTROL_CLI_RELAY_TOKEN, 없으면 macOS Keychain 의 control-cli-relay
```

`port` 검사 바로 아래(mcp 앞)에 `relay` 명령:
```ts
  if (name === 'relay') {
    if (args[0] === 'status') {
      const url = relayUrl(args[1]);
      const games = await relayGames(url, relayHeaders(env));
      return [`relay ${url} — 게임 ${games.length}개`, ...games.map((g) => `  ${gameLine(g)} · ${ago(g.since)}째 · 신호 ${ago(g.lastSeen)} 전`)].join('\n');
    }
    if (args.length) throw new Error('relay [--port <n>] [--token <비밀값>] · relay status [주소] 꼴이어야 합니다');
    const token = values.token ?? env.CONTROL_CLI_RELAY_TOKEN;
    const listenPort = values.port === undefined ? RELAY_PORT : port;
    const server = relay({ token });
    await new Promise<void>((ok, no) => {
      server.once('error', no);
      server.listen(listenPort, ok);
    });
    console.log(`relay 가 ${listenPort} 에서 게임을 받습니다 — 명령은 ${token ? '토큰이 있어야' : '이 컴퓨터에서만'}`);
    return new Promise<never>(() => {});
  }
```

`open` — `via` 를 정하는 줄부터 `return` 까지:
```ts
    if (values.game !== undefined && !values.relay) throw new Error('--game 은 --relay 와 함께 씁니다');
    const address = values.relay ? args.find((a) => /^(ws|http)s?:\/\//.test(a)) : undefined;
    // --relay 만 주면 이미 켜진 게임에 붙는다 — 깔 게 없다(PLATFORM_APP 은 보지 않는다).
    const via: Session['via'] = values.ios ? 'ios' : values.pc ? 'pc' : values.usb ? 'usb' : values.relay && values.app === undefined ? 'relay' : 'farm';
    const local = via === 'pc' || via === 'ios' || via === 'relay';
    const udid =
      via === 'pc' || via === 'relay' ? undefined
      : via === 'ios' ? (await phone(values.udid)).udid
      : (values.udid ?? env.PLATFORM_DEVICE_UDID ?? (via === 'farm' ? (await readFile(heldFile, 'utf8').catch(() => '')).trim() || undefined : undefined));
    if (via === 'farm' && !udid) throw new Error('잡은 폰이 없습니다 — hold 부터 합니다');
    const app = local ? values.app : (values.app ?? env.PLATFORM_APP);
    if (via === 'farm' && !app) throw new Error('게임을 깔려면 --app 이나 PLATFORM_APP 이 필요합니다(QA APK 주소)');
    const s: Session = { via, udid, refs: {} };
    // relay 는 켜기 전에 본다 — --app 으로 켜면 켠 뒤 (다시) 붙은 게임을 고른다.
    const url = values.relay ? relayUrl(address) : undefined;
    const headers = relayHeaders(env);
    const started = url ? await ensureRelay(url, headers, o.dir) : '';
    const before = url && app ? await relayGames(url, headers) : undefined;
    if (via === 'pc') {
      if (app) s.pid = launch(app);
    } else if (via === 'ios') {
      if (app) s.pid = installAndLaunch(udid!, app).pid;
    } else if (app) s.appium = await openSession(appium, app, udid);
    // 게임이 답하기 전에 실패해도 close 로 Appium 세션 · 띄운 게임을 닫을 수 있게 먼저 적는다.
    await save(file, s);
    const picked = url ? await pickGame(url, headers, values.game, before) : undefined;
    if (url && picked) s.relay = { url, key: picked.key };
    const game = gameOf(s, farm, port, env);
    const info = await untilAnswers(game);
    s.caps = game.caps;
    await save(file, s);
    const pid = s.pid ? ` · 프로세스 ${s.pid}` : '';
    const where =
      picked ? `relay · ${picked.platform} · ${picked.model}${via === 'farm' ? ` · 디바이스 팜 ${udid}` : ''}${pid}`
      : via === 'farm' ? `디바이스 팜 ${udid}` : via === 'usb' ? 'USB' : via === 'pc' ? `PC${pid}` : `iPhone ${udid}${pid}`;
    const engine = info.engine ? ` · ${info.engine} ${info.engineVersion} · SDK ${info.sdkVersion}` : '';
    return `${started}세션 ${sname} 열림 — ${info.app} ${info.version} (${where})${engine}\n${await shot(game, s, appium, file, sname, o.dir)}`;
```

`gameOf` 를 부르는 세 곳(mcp `game` · `open` · 명령들)에 `env` 를 넘기고 함수를 바꾼다:
```ts
function gameOf(s: Session, farm: Conn, port: number, env: Options['env']): Game {
  // PC 게임의 SDK 는 이 컴퓨터의 127.0.0.1 에 열려 있다 — adb 없이 바로 붙는다. relay 면 깔고 켠 길과 상관없이 relay 로.
  const link =
    s.relay ? relayLink(s.relay.url, relayHeaders(env), s.relay.key)
    : s.via === 'farm' ? farmLink(farm.base, farm.headers, s.udid!)
    : s.via === 'usb' ? usbLink(s.udid, port)
    : s.via === 'ios' ? iosLink(s.udid, port)
    : tcpLink(port);
  const game = new Game(link, s.caps);
  if (s.waitMs !== undefined) game.waitMs = s.waitMs;
  return game;
}
```

`gameOf` 아래에 relay 도우미:
```ts
// ws:// · wss:// 도 받는다 — 게임에 구운 주소를 그대로 써도 된다.
function relayUrl(address?: string): string {
  const url = (address ?? `http://127.0.0.1:${RELAY_PORT}`).replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(url)) throw new Error(`relay 주소는 http(s) · ws(s)://<호스트>[:<포트>] 꼴입니다: ${address}`);
  return url;
}

const relayHeaders = (env: Options['env']): Record<string, string> => (env.CONTROL_CLI_RELAY_TOKEN ? { Authorization: `Bearer ${env.CONTROL_CLI_RELAY_TOKEN}` } : {});

async function relayGames(url: string, headers: Record<string, string>): Promise<GameInfo[]> {
  const res = await fetch(`${url}/games`, { headers, signal: AbortSignal.timeout(5000) });
  const body = (await res.json().catch(() => null)) as { value?: unknown } | null;
  if (!res.ok) throw new Error((body?.value as { message?: string } | undefined)?.message ?? `relay ${url} 가 HTTP ${res.status} 로 답했습니다`);
  return body?.value as GameInfo[];
}

const gameLine = (g: GameInfo) => `${g.app} ${g.version} · ${g.platform} · ${g.model}`;
const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분`;
};

// 이 컴퓨터 주소에 relay 가 없으면 띄운다 — 토큰 변수를 지워 늘 토큰 없이(명령은 이 컴퓨터에서만). close 는 끄지 않는다(다음 open · 다른 세션이 쓴다).
async function ensureRelay(url: string, headers: Record<string, string>, dir: string): Promise<string> {
  try {
    await relayGames(url, headers);
    return '';
  } catch (e) {
    if (!(e instanceof TypeError)) throw e; // 닿았는데 거절(403 …)이면 그대로 알린다
  }
  const { hostname, port } = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error(`relay ${url} 에 닿지 못했습니다 — 밖 relay 는 띄우지 않습니다. 주소 · 터널이 살아 있나 봅니다`);
  const logFile = join(dir, 'relay.log');
  const log = openSync(logFile, 'a');
  const { CONTROL_CLI_RELAY_TOKEN: _token, ...env } = process.env;
  const child = spawn(process.execPath, [join(import.meta.dirname, 'main.js'), 'relay', `--port=${port || 80}`], { detached: true, stdio: ['ignore', log, log], env });
  child.on('error', () => {});
  child.unref();
  closeSync(log);
  const end = Date.now() + 5000;
  for (;;) {
    await sleep(100);
    try {
      await relayGames(url, headers);
      return `relay 를 띄웠습니다 — ${url} (프로세스 ${child.pid}, 기록 ${logFile})\n`;
    } catch (e) {
      if (!(e instanceof TypeError) || Date.now() >= end) throw new Error(`relay 를 띄우지 못했습니다 — ${logFile} 를 봅니다`);
    }
  }
}

// open 이 고를 게임 — want 가 있으면 key · 앱 · 기종 · 기기 이름에 그 글자가 든 것, before 가 있으면(--app 으로 켰다) 켠 뒤 붙거나 다시 붙은 것.
async function pickGame(url: string, headers: Record<string, string>, want: string | undefined, before?: GameInfo[]): Promise<GameInfo> {
  const end = Date.now() + TIMING.openWaitMs;
  for (;;) {
    let games = await relayGames(url, headers);
    if (before) games = games.filter((g) => !before.some((b) => b.key === g.key && b.since === g.since));
    if (want !== undefined) games = games.filter((g) => [g.key, g.app, g.model, g.device].some((v) => v.includes(want)));
    if (games.length === 1) return games[0];
    if (games.length > 1) throw new Error([`게임이 ${games.length}개 붙어 있습니다 — --game 으로 고릅니다`, ...games.map((g) => `  ${gameLine(g)} (${g.key})`)].join('\n'));
    if (Date.now() >= end) throw new Error(`${TIMING.openWaitMs / 1000}초 안에 relay ${url} 에 붙은 게임이 없습니다${want ? `(--game ${want})` : ''} — QA 빌드에 instrument --relay 로 이 주소를 구웠나요?`);
    await sleep(TIMING.openStepMs);
  }
}
```
(로컬 relay 띄우기 테스트는 `dist/cli.js` 옆 `dist/main.js` 를 띄운다 — `npm run build` 뒤라 있다.)

- [ ] **Step 4: `src/main.ts` — Keychain relay 토큰** (`keychainToken` 을 서비스 이름을 받게)

```ts
// 팜 · relay 토큰 — 환경 변수가 없으면 macOS Keychain(사용자가 한 번 넣는다). 테스트는 CONTROL_CLI_KEYCHAIN=0 으로 끈다(진짜 토큰이 가짜로 가지 않게).
function keychain(env: NodeJS.ProcessEnv, name: string, service: string): string | undefined {
  if (process.platform !== 'darwin' || env[name] || env.CONTROL_CLI_KEYCHAIN === '0') return undefined;
  try {
    return execFileSync('security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined; // 항목이 없다 — 토큰 없이 간다(팜 · relay 가 401 · 403 으로 알린다)
  }
}

const env = { ...process.env };
for (const [name, service] of [['PLATFORM_APPIUM_TOKEN', 'control-cli-farm'], ['CONTROL_CLI_RELAY_TOKEN', 'control-cli-relay']]) {
  const token = keychain(process.env, name, service);
  if (token) env[name] = token;
}
run(process.argv.slice(2), { env, dir: '.control-cli' }).then(
```

- [ ] **Step 5: 통과를 본다** — Run: `npm run build && node --test dist/cli.test.js dist/relay.test.js 2>&1 | grep -E '^# (pass|fail)|^not ok'` · Expected: `# fail 0`
- [ ] **Step 6: 커밋** — 「open --relay · relay · relay status — 이 컴퓨터 relay 는 open 이 띄우고, 게임은 key 로 골라 다시 붙어도 같은 세션」

### Task 3: MCP `open` 도구 `relay` · `game`

**Files:** Modify `src/mcp.ts:81-89` · Test `src/mcp.test.ts`

- [ ] **Step 1: 실패하는 테스트를 `src/mcp.test.ts` 끝에** (import 에 `fakeRelayGame` · `relay` · `AddressInfo`)

```ts
test('open {relay} 는 relay 에 걸어 온 게임에 붙는다', async (t) => {
  const r = relay();
  await new Promise<void>((ok) => r.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${(r.address() as AddressInfo).port}`;
  const ws = await fakeRelayGame(standardScreen(), url);
  t.after(() => {
    ws.close();
    r.closeAllConnections();
    r.close();
  });
  const { call } = await server();
  assert.match((await call('open', { relay: url })).content[0].text!, /^세션 default 열림 — com\.fake\.game 1\.0 \(relay · macOS · FakeBook\)/);
  assert.match((await call('find', { target: 'LoginButton' })).content[0].text!, /LoginButton/);
  assert.match((await call('close')).content[0].text!, /^세션 default 닫음/);
});
```

- [ ] **Step 2: 실패를 본다** — Run: `npm run build && node --test --test-name-pattern=relay dist/mcp.test.js 2>&1 | grep -E '^# (pass|fail)'` · Expected: FAIL — `relay` 칸이 없어 open 이 거절되거나 팜 길로 가 「잡은 폰이 없습니다」(어느 쪽인지 오류 줄을 읽고 적는다)

- [ ] **Step 3: `src/mcp.ts` 의 `open` 도구**

```ts
    {
      name: 'open',
      description: '게임에 붙고 첫 화면을 찍는다 — farm(기본)은 hold 로 잡은 폰에 app 을 깔고 켠다 · usb 는 꽂힌 Android · pc 는 이 컴퓨터 게임(app 이 있으면 띄운다) · ios 는 USB iPhone · relay 를 주면 relay 에 걸어 온 게임(app 이 있으면 깔고 켜기만 via 길)',
      inputSchema: schema({
        via: { type: 'string', enum: ['farm', 'usb', 'pc', 'ios'], description: '어디의 게임인가(기본 farm)' },
        app: { type: 'string', description: 'QA APK 주소 · 경로(farm · usb) · PC 실행 파일 · .app(pc) · 서명된 .app(ios)' },
        udid,
        relay: { type: 'string', description: 'relay 주소(ws · wss · http) — 빈 글자면 이 컴퓨터 relay(없으면 띄운다)' },
        game: { type: 'string', description: 'relay 에 게임이 여럿일 때 고를 이름(key · 앱 · 기종 일부)' },
      }),
      run: (a) =>
        cli([
          'open',
          ...(a.via === undefined || a.via === 'farm' ? [] : [`--${String(a.via)}`]),
          ...flag('app', a.app),
          ...flag('udid', a.udid),
          ...(a.relay === undefined ? [] : ['--relay', ...(a.relay ? [String(a.relay)] : [])]),
          ...flag('game', a.game),
        ]),
    },
```
`INSTRUCTIONS` 의 open 줄 끝에 `, relay 에 걸어 온 게임은 open {relay: ""}` 를 더한다.

- [ ] **Step 4: 통과를 본다** — Run: `npm run build && node --test dist/mcp.test.js 2>&1 | grep -E '^# (pass|fail)'` · Expected: `# fail 0`
- [ ] **Step 5: 커밋** — 「MCP open — relay · game 칸」

### Task 4: `instrument --relay`

**Files:** Modify `src/instrument.ts` · `src/cli.ts`(instrument 갈래) · Test `src/instrument.test.ts`

- [ ] **Step 1: 실패하는 테스트를 `src/instrument.test.ts` 끝에** (import 에 `existsSync` · `RELAY_FILE`)

```ts
test('relay 주소를 주면 Resources 에 주소 파일을 넣고, 안 주면 남은 파일을 지운다', () => {
  const root = mkdtempSync(join(tmpdir(), 'instrument-relay-'));
  mkdirSync(join(root, 'Packages'));
  mkdirSync(join(root, 'Assets'));
  writeFileSync(join(root, 'Packages', 'manifest.json'), JSON.stringify({ dependencies: {} }));
  instrument(root, 'v1', 'ws://192.168.0.10:13101');
  assert.equal(readFileSync(join(root, RELAY_FILE), 'utf8'), 'ws://192.168.0.10:13101\n');
  instrument(root, 'v1');
  assert.equal(existsSync(join(root, RELAY_FILE)), false);
});
```

- [ ] **Step 2: 실패를 본다** — Run: `npm run build 2>&1 | tail -2` · Expected: FAIL(`RELAY_FILE` 없음)

- [ ] **Step 3: `src/instrument.ts`** — import 를 `import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';` · `import { dirname, join, relative } from 'node:path';` 로, 상수 하나:

```ts
// SDK Relay.cs 가 Resources.Load 로 읽는다 — 이 파일이 없으면 relay 는 꺼짐.
export const RELAY_FILE = join('Assets', 'ControlCli', 'Resources', 'ControlCliRelay.txt');
```
`export function instrument(project: string, ref: string, relayAddress?: string)` 로 받고 `for (const [path, text] of writes) writeFileSync(path, text);` 아래에:
```ts
  const relayPath = join(project, RELAY_FILE);
  if (relayAddress) {
    mkdirSync(dirname(relayPath), { recursive: true });
    writeFileSync(relayPath, relayAddress + '\n');
  } else if (existsSync(relayPath)) rmSync(relayPath);
```
(Unity 는 `.meta` 가 없는 새 파일에 스스로 `.meta` 를 만든다 — 빌드 잡의 일회 폴더라 남지 않는다.)

- [ ] **Step 4: `src/cli.ts` 의 instrument 갈래**

```ts
  if (name === 'instrument') {
    const ref = values.ref ?? `v${VERSION}`;
    const address = values.relay ? args.find((a) => /^(ws|http)s?:\/\//.test(a)) : undefined;
    if (values.relay && !address) throw new Error('--relay 뒤에 게임이 걸 주소(ws:// · wss://)를 줍니다');
    const folders = args.filter((a) => a !== address);
    if (folders.length !== 1) throw new Error('instrument <Unity 프로젝트 폴더> [--ref <태그 · 커밋>] [--relay <주소>] 꼴이어야 합니다');
    const gameAddress = address?.replace(/^http/, 'ws');
    const { asmdefs, warnings } = instrument(folders[0], ref, gameAddress);
    return [
      `SDK(${ref}) 를 Packages/manifest.json 에 더했습니다`,
      ...(gameAddress ? [`relay 주소를 구웠습니다 — 게임이 ${gameAddress} 로 겁니다`] : []),
      ...asmdefs.map((a) => `asmdef 참조 더함: ${a}`),
      ...warnings.map((w) => `경고: ${w}`),
      'QA 빌드 정의 심볼에 CONTROL_CLI 가 있어야 SDK 가 빌드에 들어갑니다',
    ].join('\n');
  }
```

- [ ] **Step 5: 통과를 본다** — Run: `npm run build && node --test dist/instrument.test.js dist/cli.test.js 2>&1 | grep -E '^# (pass|fail)'` · Expected: `# fail 0`
- [ ] **Step 6: 커밋** — 「instrument --relay — QA 빌드에 relay 주소 파일, 안 주면 지운다」

### Task 5: SDK — `Ask` · `PingReply` 뽑기, `Relay.cs`, 0.9.0

**Files:** Modify `sdk/unity/Runtime/ControlServer.cs` · Create `sdk/unity/Runtime/Relay.cs` · `Relay.cs.meta` · Modify `sdk/unity/package.json` · `package.json`

- [ ] **Step 1: `ControlServer.cs` — `Serve` 의 기다림을 `Ask` 로 뽑는다.** `Serve` 의 `while` 을:
```csharp
                    string line;
                    while ((line = reader.ReadLine()) != null) writer.WriteLine(Ask(line));
```
`Serve` 아래에:
```csharp
        // 명령 한 줄을 메인 스레드(Update)에 넘기고 답을 기다린다 — TCP(Serve) · relay(Relay.cs) 가 같이 쓴다. 부른 스레드를 막는다.
        internal string Ask(string line)
        {
            var request = new Request { Line = line };
            _requests.Enqueue(request);
            // 실패로 답한 명령이 게임이 깨어난 뒤 늦게 눌리면 다음 명령이 엉뚱한 화면에서 돈다. 버린 요청은 Update 가 건너뛴다.
            var timedOut = !request.Done.Wait(ReplyTimeoutMs) && Interlocked.CompareExchange(ref request.State, 2, 0) == 0;
            // 게임이 가져간 명령이 답을 미룬 채 멈추면(백그라운드) Done 이 안 온다 — 버림으로 바꾸면 Update 가 남은 가짜 입력을 거둔다.
            if (!timedOut && !request.Done.IsSet) timedOut = Interlocked.CompareExchange(ref request.State, 3, 1) == 1;
            if (!timedOut) request.Done.Wait();
            return timedOut ? Error("게임이 10초 안에 답하지 않았습니다(멈췄거나 일시정지)") : request.Reply;
        }
```

- [ ] **Step 2: `ping` 답을 `PingReply()` 로.** `Handle` 의 `case "ping":` 은 `return PingReply();`, `Handle` 위에:
```csharp
        // ping 답 — relay hello 도 이 칸으로 시작한다(Relay.cs).
        internal static string PingReply() =>
            "{\"ok\":true,\"app\":" + Json.Str(Application.identifier) + ",\"version\":" + Json.Str(Application.version)
            + ",\"engine\":\"unity\",\"engineVersion\":" + Json.Str(Application.unityVersion) + ",\"sdkVersion\":\"" + SdkVersion
            + "\",\"protocol\":2,\"caps\":[\"" + string.Join("\",\"", Caps) + "\"]}";
```

- [ ] **Step 3: `Awake` 끝에 relay 를 건다 · 판 · 머리 주석**
```csharp
#if !UNITY_WEBGL || UNITY_EDITOR
            // instrument --relay 로 주소를 구운 빌드만 — 없으면 아무것도 안 한다. WebGL 은 브라우저 WebSocket(P3-B).
            Relay.Start(Ask);
#endif
```
`SdkVersion = "0.9.0"`, 머리 주석 `// 폰 안 127.0.0.1 포트(와 relay — Relay.cs)로 JSON 명령 한 줄을 받아 게임 메인 스레드에서 처리하고 JSON 한 줄로 답한다`.

- [ ] **Step 4: `sdk/unity/Runtime/Relay.cs`**

```csharp
// relay 주소가 구워진 QA 빌드에서 게임이 relay 로 WebSocket 을 걸어 명령을 받는다 — 못 붙거나 끊기면 2초마다 다시(P3-A)
#if !UNITY_WEBGL || UNITY_EDITOR
using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using UnityEngine;

namespace ControlCli
{
    internal static class Relay
    {
        private const int RetryMs = 2000;

        // 메인 스레드(Awake)에서 부른다 — 주소 파일 · hello 는 여기서 읽고, 연결은 백그라운드 스레드가 맡는다.
        public static void Start(Func<string, string> ask)
        {
            var file = Resources.Load<TextAsset>("ControlCliRelay");
            var address = file == null ? "" : file.text.Trim();
            if (address.Length == 0) return; // instrument --relay 를 안 줬다 — relay 는 꺼짐
            Uri uri;
            try { uri = new Uri(address.TrimEnd('/') + "/game"); }
            catch (UriFormatException) { Debug.LogWarning("[ControlCli] relay 주소를 읽지 못했습니다: " + address); return; }
            var hello = "hello " + Hello();
            new Thread(() => Loop(uri, hello, ask)) { IsBackground = true, Name = "ControlCli relay" }.Start();
        }

        private static void Loop(Uri uri, string hello, Func<string, string> ask)
        {
            // 상태가 바뀔 때만 한 줄 — 2초마다 쌓여 logs 를 덮지 않게.
            var up = false;
            var told = false;
            while (true)
            {
                try
                {
                    using (var ws = new ClientWebSocket())
                    {
                        ws.ConnectAsync(uri, CancellationToken.None).Wait();
                        Send(ws, hello);
                        up = true;
                        told = false;
                        Debug.Log("[ControlCli] relay " + uri + " 에 붙었습니다");
                        string message;
                        while ((message = Receive(ws)) != null)
                        {
                            var space = message.IndexOf(' ');
                            if (space > 0) Send(ws, message.Substring(0, space) + " " + ask(message.Substring(space + 1).Trim()));
                        }
                    }
                }
                catch (Exception e)
                {
                    if (!up && !told)
                    {
                        Debug.Log("[ControlCli] relay " + uri + " 에 붙지 못했습니다(" + e.GetBaseException().Message + ") — " + RetryMs / 1000 + "초마다 다시 겁니다");
                        told = true;
                    }
                }
                if (up) Debug.Log("[ControlCli] relay " + uri + " 와 끊겼습니다 — " + RetryMs / 1000 + "초마다 다시 겁니다");
                up = false;
                Thread.Sleep(RetryMs);
            }
        }

        private static void Send(ClientWebSocket ws, string text) =>
            ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text)), WebSocketMessageType.Text, true, CancellationToken.None).Wait();

        // 여러 조각 메시지를 다 모은다 — 닫히면 null. ping 은 ClientWebSocket 이 받는 동안 스스로 pong 한다.
        private static string Receive(ClientWebSocket ws)
        {
            var buffer = new ArraySegment<byte>(new byte[8192]);
            using (var all = new MemoryStream())
            {
                while (true)
                {
                    var r = ws.ReceiveAsync(buffer, CancellationToken.None).Result;
                    if (r.MessageType == WebSocketMessageType.Close) return null;
                    all.Write(buffer.Array, 0, r.Count);
                    if (r.EndOfMessage) return Encoding.UTF8.GetString(all.ToArray());
                }
            }
        }

        // ping 답에 플랫폼 · 기종 · 기기 이름 · 기기 id 를 더한다 — relay 는 <앱>@<기기 id 앞 8자>로 게임을 알아본다. Application · SystemInfo 는 메인 스레드에서만.
        private static string Hello()
        {
            var ping = ControlServer.PingReply();
            return ping.Substring(0, ping.Length - 1)
                + ",\"platform\":" + Json.Str(PlatformName()) + ",\"model\":" + Json.Str(SystemInfo.deviceModel)
                + ",\"device\":" + Json.Str(SystemInfo.deviceName) + ",\"deviceId\":" + Json.Str(SystemInfo.deviceUniqueIdentifier) + "}";
        }

        private static string PlatformName()
        {
            switch (Application.platform)
            {
                case RuntimePlatform.Android: return "Android";
                case RuntimePlatform.IPhonePlayer: return "iOS";
                case RuntimePlatform.OSXPlayer: case RuntimePlatform.OSXEditor: return "macOS";
                case RuntimePlatform.WindowsPlayer: case RuntimePlatform.WindowsEditor: return "Windows";
                case RuntimePlatform.LinuxPlayer: case RuntimePlatform.LinuxEditor: return "Linux";
                default: return Application.platform.ToString();
            }
        }
    }
}
#endif
```
`Relay.cs.meta` — `Feed.cs.meta` 와 같은 꼴, guid 는 `python3 -c "import uuid; print(uuid.uuid4().hex)"` 로 새로.

- [ ] **Step 5: 판 0.9.0** — `sdk/unity/package.json` · `package.json` 의 `"version": "0.9.0"`
- [ ] **Step 6: 확인** — Run: `npm run build && node --test dist/protocol.test.js dist/sdk-meta.test.js 2>&1 | grep -E '^# (pass|fail)'` · Expected: `# fail 0`. 그리고 `UNITY_REF_DIR=/Users/maxi.moff/Projects/control_cli/.claude/worktrees/p2b/tools/unity-compile-check/.cache python3 tools/unity-compile-check/check.py 6000.0` · Expected: 입력 설정 셋 모두 성공
- [ ] **Step 7: 커밋** — 「Unity SDK 0.9.0 — Relay.cs(ClientWebSocket 으로 걸고 hello · 번호 붙은 명령 · 2초마다 다시), Ask · PingReply 로 TCP 와 같은 길」

### Task 6: iOS 로컬 네트워크 문구

**Files:** Create `sdk/unity/Editor/LocalNetwork.cs` · `LocalNetwork.cs.meta`

- [ ] **Step 1: `sdk/unity/Editor/LocalNetwork.cs`**

```csharp
// relay 주소를 구운 iOS QA 빌드의 Info.plist 에 로컬 네트워크 사용 문구를 넣는다 — 같은 Wi-Fi 의 relay 로 걸면 iOS 가 허락을 묻는다(P3-A)
using System.IO;
using UnityEditor;
using UnityEditor.Callbacks;

namespace ControlCli.Editor
{
    internal static class LocalNetwork
    {
        private const string Key = "NSLocalNetworkUsageDescription";
        // instrument --relay 가 쓰는 파일(src/instrument.ts RELAY_FILE) — 없으면 relay 가 꺼진 빌드라 손대지 않는다.
        private const string RelayFile = "Assets/ControlCli/Resources/ControlCliRelay.txt";

        [PostProcessBuild]
        private static void Add(BuildTarget target, string path)
        {
            if (target != BuildTarget.iOS || !File.Exists(RelayFile)) return;
            var plist = Path.Combine(path, "Info.plist");
            var text = File.ReadAllText(plist);
            if (text.Contains("<key>" + Key + "</key>")) return;
            var end = text.LastIndexOf("</dict>");
            File.WriteAllText(plist, text.Substring(0, end) + "\t<key>" + Key + "</key>\n\t<string>QA 빌드가 같은 네트워크의 control-cli relay 에 연결합니다</string>\n" + text.Substring(end));
        }
    }
}
```
`.meta` 는 Task 5 와 같이 새 guid.

- [ ] **Step 2: 확인** — Run: `node --test dist/sdk-meta.test.js 2>&1 | grep -E '^# (pass|fail)'` · `check.py 6000.0` 성공
- [ ] **Step 3: 커밋** — 「iOS QA 빌드 — relay 주소가 있으면 Info.plist 에 로컬 네트워크 문구」

### Task 7: 샘플 빌드에 relay 주소

**Files:** Modify `.github/workflows/sample.yml:7,107`

- [ ] **Step 1: `workflow_dispatch` 에 입력, instrument 줄에 붙이기**

```yaml
  workflow_dispatch:
    inputs:
      relay:
        description: 'QA 빌드에 구울 relay 주소(ws://<이 맥 Wi-Fi 주소>:13101 · wss://relay.<도메인>) — 비우면 relay 꺼짐'
        required: false
        default: ''
```
```yaml
      - run: node dist/main.js instrument sample --ref ${{ github.event.pull_request.head.sha || github.sha }} ${{ inputs.relay && format('--relay {0}', inputs.relay) || '' }}
```
- [ ] **Step 2: 커밋** — 「sample — 손으로 돌릴 때 relay 주소를 구울 입력」

### Task 8: 문서 · kit 다음 줄

**Files:** `README.md` · `docs/roadmap/plan.md` · `docs/roadmap/checklist.md` · `docs/roadmap/context-notes.md`

- [ ] README — 「relay — 게임이 거는 길」 절(위 「사용 예」 · 토큰 · 밖 공개 relay 를 이 맥에 늘 켜 두는 launchd plist 예), 명령 표에 `open --relay` · `relay` · `relay status` · `instrument --relay`, SDK 명령 표 아래 「relay 통신 꼴 — hello · `<번호> <명령>`」, AltTester 표 연결 줄 「✓ relay(로컬 · 원격)」, MCP 도구 줄 `open {relay, game}`
- [ ] plan.md 1절 연결 줄 — `✓ adb forward · 팜 · usbmuxd · relay(P3-A)`
- [ ] checklist — P3 줄을 P3-A · P3-B · P3-C 로 나누고 P3-A 할 일 체크, kit 다음 줄 「P3-A — 팜 화면 relay 연결 표시(`GET /games` 꼴 · key `<앱>@<기기 id 앞 8자>`). kit `game.*` 은 그대로(명령 꼴이 같다)」
- [ ] context-notes 「P3-A 구현」 — 계획과 다르게 한 것
- [ ] 커밋 — 「README · 로드맵 — relay 절 · 명령 표 · AltTester 연결 줄, kit 다음 줄 P3-A」

### Task 9: CI · PR

- [ ] push → draft PR(`p3a` → main — #22 가 합쳐진 뒤 base main) · sdk-compile(meta · 2021.3 · 2022.3 · 6000.0) 초록
- [ ] `gh workflow run sample.yml --ref p3a -f relay=ws://<이 맥 Wi-Fi 주소>:13101` 와 `-f relay=wss://relay.<도메인>` 두 번 — 9개 잡 초록(러너 사정이면 `gh run rerun <run> --failed`)

### Task 10: 실기기

- [ ] 이 맥 macOS 앱(Wi-Fi 주소를 구운 빌드 — 이 맥에서도 그 주소로 닿는다) — `caffeinate -d -u -t 900` 을 건 채 앱을 켜고 `open --relay` → `conform` 「통과 51 · 실패 0 · 미실행 1」
- [ ] 팜 폰(사용자가 정한 폰) · 같은 Wi-Fi — `hold` → `open --relay --app <APK>` → `conform` 「통과 52」 → `close` → `release`. 폰이 그 Wi-Fi 에 없으면 사용자에게 묻는다
- [ ] 팜 폰 · 밖 공개 — 사용자가 터널(`relay.<도메인>` → 이 맥 13101)을 열고, 이 맥에서 `control-cli relay`(Keychain `control-cli-relay` 토큰)를 늘 켜 둔다 → `open --relay wss://relay.<도메인> --app <APK>` → `conform` 「통과 52」
- [ ] 확인할 위험 셋(IL2CPP `wss` · Android cleartext `ws` · 일시정지 뒤 다시 붙기) 결과를 context-notes 「P3-A 실기기」에
- [ ] iPhone USB 없이 — 사용자 실측 항목으로 checklist 에 남긴다
- [ ] checklist P3-A [x] · 「다음 세션은 여기부터」 P3-B · push · PR ready · 합친 뒤 `v0.9.0` tag

## 검증

- 단위 — 태스크마다 그 파일 테스트만, `npm test` 전체는 PR 앞에 한 번
- C# — 이 맥 `check.py 6000.0` · CI sdk-compile 판 셋
- 실기기 — Task 10 의 셋 + 사용자 iPhone
