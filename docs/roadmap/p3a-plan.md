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
세션 default 열림 — com.maxihan1.sample 1.0 (relay · macOS · MacBook) · unity 6000.0.84f1 · SDK 0.8.0
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
$ control-cli open --relay wss://relay.<도메인>                 # 토큰은 --token · CONTROL_CLI_RELAY_TOKEN · Keychain control-cli-relay

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
- CLI 토큰 — `--token` · `CONTROL_CLI_RELAY_TOKEN` · macOS Keychain `control-cli-relay` 차례(팜 PAT 와 같은 꼴). QA Hub 통합계정 PAT 로 통일은 뒤로(relay 가 인증 서버에 물어야 해서)

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

### 4. SDK (Unity, 0.8.0 — `protocol` 은 2 그대로, 명령 · 답 꼴이 같아서)
- `127.0.0.1:13100` 은 그대로 연다 — 팜 · USB · PC 길은 안 바뀐다
- `Relay.cs` — 켤 때 `Resources.Load<TextAsset>("ControlCliRelay")` 를 읽는다. 없으면 아무것도 안 한다
- 백그라운드 스레드가 `ClientWebSocket` 으로 `<주소>/game` 에 걸고, 붙자마자 hello 한 줄(`ping` 답과 같은 내용 + 플랫폼 · 기종 · 기기 id)을 보낸다
- relay → 게임 `<번호> <명령 JSON>`, 게임 → relay `<번호> <답 JSON>`. 번호로 늦은 답이 다음 명령의 답이 되는 일을 막는다
- TCP `Serve` 의 「큐에 넣고 → 10초까지 기다리고 → 답(버림 · 시간 초과 규칙)」을 함수 하나로 뽑아 TCP 와 relay 가 같이 쓴다
- 실패 · 끊김이면 2초 뒤 다시, 끝없이. 로그는 상태가 바뀔 때만 — 「[ControlCli] relay <주소> 에 붙었습니다」 · 「[ControlCli] relay <주소> 와 끊겼습니다 — 2초마다 다시 겁니다」
- iOS — 같은 Wi-Fi 의 맥 주소로 걸면 「로컬 네트워크」 허락이 뜬다. QA 빌드 훅이 `Info.plist` 에 `NSLocalNetworkUsageDescription` 을 넣는다

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
