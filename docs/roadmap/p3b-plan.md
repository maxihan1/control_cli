# P3-B Unity WebGL — 브라우저 게임이 relay 로 (설계 · 구현 계획)

로드맵은 [plan.md](plan.md) P3, 할 일 체크는 [checklist.md](checklist.md) P3-B, 결정은 [context-notes.md](context-notes.md) 「P3-B 설계」. 바탕은 [p3a-plan.md](p3a-plan.md) — relay · 통신 꼴은 그대로 쓴다.

## Context

WebGL 게임은 브라우저 안에서 돈다. 포트를 못 열고(`TcpListener` 없음), 스레드도 없고(`new Thread` 는 실행 때 예외), `ClientWebSocket` 도 없다. 그래서 0.9.0 까지 SDK 는 WebGL 에서 `Relay.Start` 를 빼 두기만 했다 — 붙을 길이 없었다.

P3-B 는 브라우저 WebSocket 으로 P3-A relay 의 `/game` 에 건다. relay · CLI · MCP 는 안 바뀐다 — hello · `<번호> <명령>` 꼴이 같아서 `open --relay` 가 WebGL 게임을 다른 플랫폼과 똑같이 고른다.

## 그림

```
[브라우저 탭: Unity WebGL]                                  [control-cli relay :13101] ◀── open --relay · conform
  ControlCliRelay.jslib — new WebSocket(<주소>/game)  ──▶      (P3-A 그대로)
    onmessage → 받은 줄 큐 ─┐
  C# Update ── 큐를 꺼내 ───┘→ ControlServer 큐(TCP 와 같은 차례) → 답 → jslib send
```

## 사용 예

```bash
$ cd build/WebGL/control-cli-sample && python3 -m http.server 8000 &
$ open 'http://127.0.0.1:8000/?controlcli=ws://127.0.0.1:13101'   # 주소는 페이지에서 — 빌드에 굽지 않아도 된다
$ control-cli open --relay                                          # relay 를 띄우고 탭이 붙기를 기다린다
세션 default 열림 — com.maxihan1.controlcli.sample 1.0 (relay · WebGL · …) · unity 6000.0.84f1 · SDK 0.10.0
$ control-cli conform
```

## 설계

1. **주소** — 페이지 주소 `?controlcli=<주소>` 가 먼저(`Application.absoluteURL` 에서 읽음), 없으면 `instrument --relay` 로 구운 `ControlCliRelay.txt`. 둘 다 없으면 꺼짐(아무것도 안 함). https 페이지는 브라우저가 `ws://` 를 막아 `wss://` 를 써야 한다
2. **jslib** (`sdk/unity/Runtime/Plugins/WebGL/ControlCliRelay.jslib`) — `Open(url, hello)` · `Next()`(받은 줄 하나 또는 null) · `Send(text)` · `State()`(0 아직 · 1 붙음 · 2 끊김) · `TabId()`. 끊기면 2초 뒤 다시, 끝없이. C# 으로 부르는 콜백(dynCall · SendMessage)은 쓰지 않고 **C# 이 매 프레임 꺼내 간다** — 판마다 다른 콜백 문법 · `MonoPInvokeCallback` 을 피하고 처리가 늘 메인 스레드 차례 안에 든다
3. **C#** — `Relay.cs` 에 WebGL 쪽을 같이 둔다(hello · 플랫폼 이름을 같이 쓴다). `ControlServer.Awake` 는 WebGL 이면 TCP 대신 `Relay.StartWeb()`, `Update` 맨 앞에서 `Relay.Tick()` 이 받은 줄을 `Post(line, answer)` 로 큐에 넣는다
4. **답을 기다리지 않는 Ask** — TCP · 데스크톱 relay 는 스레드가 `Done` 을 기다린다. WebGL 은 기다릴 스레드가 없어 요청에 `Answer` 콜백을 달고, `Update` 가 답을 정할 때 부른다. 10초 규칙 — 큐에서 꺼낼 때 10초 넘게 묵은 요청은 돌리지 않고 시간 초과로 답한다(늦게 눌려 엉뚱한 화면에서 도는 일을 막는 TCP 규칙과 같은 뜻). 답을 미룬 명령이 멈추면 relay 15초가 504 로 끊고, 늦은 답은 번호로 걸러진다
5. **기기 id** — 탭마다 하나(`sessionStorage` — 새로 고침에도 같고 탭끼리는 다르다). `SystemInfo.deviceUniqueIdentifier` 를 쓰면 같은 브라우저의 탭 둘이 같은 key 로 서로를 밀어낸다. 플랫폼 이름 `WebGL`
6. **SDK 0.10.0** — `protocol` 은 2 그대로(명령 · 답 꼴 같음)

## 확인할 위험

- `WaitForEndOfFrame` 뒤 `ReadPixels` 가 WebGL 에서 검은 화면을 주나(스크린샷 줄)
- 탭이 뒤로 가면 브라우저가 프레임을 늦춘다 — conform 은 탭을 앞에 둔 채 돈다. 일시정지 줄은 PC 처럼 미실행(게임 밖 길이 없다)
- 손으로 짠 relay WebSocket 이 브라우저 클라이언트(마스크 · `permessage-deflate` 제안 · Origin)를 받나

## 끝 기준

- sdk-compile 에 WebGL 구성(판마다 `UNITY_WEBGL` · 옛 Input) 초록
- sample CI 에 WebGL(6000.0) 잡 초록 — 압축 끔(아무 정적 서버로 열리게) · 세로 캔버스
- 이 맥 브라우저(Chrome)에서 `conform` — 「통과 52 · 실패 0 · 미실행 1」(일시정지)이 목표. WebGL 이 못 하는 줄이 나오면 까닭을 README AltTester 표 · context-notes 에 적는다
- README 지원 표 · relay 절 WebGL 줄 · 0.10.0, test_platform kit 다음 줄

## 범위 밖

- WebGL 다중 스레드 빌드(Unity 6 실험 기능), Linux(P3-C), 팜 화면 relay 표시
- CLI 가 브라우저 탭을 여는 `open --webgl <페이지>` — 손으로 여는 것으로 충분할 때까지

# 구현 계획

1. **SDK** — `ControlServer.cs`(Awake 분기 · `Post` · `Answer` · Tick), `Relay.cs`(WebGL 쪽 · 주소 · TabId), `Plugins/WebGL/ControlCliRelay.jslib` + `.meta`(WebGL 만), 0.10.0 → 확인: 이 맥 compile-check 6000.0 + 새 WebGL 구성, `npm test`(sdk-meta · protocol)
2. **compile-check WebGL 구성** — `check.py` 에 `UNITY_WEBGL` 플레이어 정의 → 확인: 같은 명령 초록
3. **sample** — `SampleBuild.cs` WebGL 설정, `sample.yml` WebGL 잡 → 확인: PR CI
4. **실기기** — CI WebGL 결과물을 받아 이 맥 Chrome 에서 conform
5. **문서** — README · checklist · context-notes · 진척 페이지
