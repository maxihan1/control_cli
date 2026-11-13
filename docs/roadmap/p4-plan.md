# P4 드라이버 — Python · C# · Java · Robot (설계 · 구현 계획)

로드맵은 [plan.md](plan.md) P4, 할 일 체크는 [checklist.md](checklist.md) P4, 결정은 [context-notes.md](context-notes.md) 「P4 설계」.

## Context

게임 SDK 는 엔진과 무관한 한 벌 꼴로 말한다 — 명령 JSON 한 줄을 보내면 답 JSON 한 줄(TCP 13100), relay 는 같은 JSON 을 `POST <relay>/games/<key>/command` 로 받아 `{value: 답}` 을 돌려준다. 지금은 TS(CLI · MCP · test_platform kit)만 이 꼴을 쓴다. AltTester 처럼 다른 언어 시험 코드에서도 게임을 몰려면 언어마다 얇은 드라이버가 있어야 한다. 명령 목록은 `protocol/commands.json` 한 곳이라 명령마다 메서드를 손으로 쓰지 않고 거기서 만든다.

## 그림

```
protocol/commands.json ──(npm run drivers)──▶ drivers/python/control_cli.py     ─┐ 생성 칸만 다시 쓴다
                                              drivers/csharp/ControlCli.cs       ─┤ (손으로 쓴 연결 · 다리는 그대로)
                                              drivers/java/controlcli/ControlCli.java ┘
                                              drivers/robot/ — Python 드라이버를 라이브러리로

control-cli conform --driver '<다리 명령>'
  TS conform 차례 ──stdin 명령 한 줄──▶ 그 언어 다리 ──그 언어 드라이버 메서드──▶ 게임(TCP · relay)
                  ◀─stdout 답 한 줄──
```

## 설계

1. **드라이버 = 파일 하나** — 언어마다 한 파일(C# 만 다리용 `Bridge.cs` · `.csproj` 를 곁에). 손으로 쓴 부분(주소 읽기 · TCP · relay · JSON · 오류)과 생성 칸(명령마다 메서드)이 한 파일에 있고, 생성기는 표시 줄 사이만 다시 쓴다. 템플릿을 TS 글자로 감싸지 않아 손 부분을 그 언어 그대로 고친다
2. **메서드 꼴** — 명령 하나 = 메서드 하나, 이름은 그 언어 꼴(`find-all` → `find_all` · `FindAll` · `findAll`). 반드시 칸은 앞 인자, 고를 칸은 Python 키워드 · C# 이름 있는 기본값 · Java `Map` 하나. 답은 그 언어의 JSON 객체(dict · `JsonObject` · `Map`) 그대로, `ok` 가 아니면 `GameError` · `GameException`. 낮은 길 `send(cmd, args)` 도 연다(`call` 은 명령 이름이라 피함)
3. **연결 주소 하나** — `tcp://127.0.0.1:13100`(PC · adb forward 뒤 폰) 또는 relay 의 `http(s)://<relay>/games/<key>`. relay 토큰은 `CONTROL_CLI_RELAY_TOKEN`(CLI 와 같은 이름). 명령마다 새로 잇는다(TS `tcpLink` 와 같음 — 실기기에서 검증된 길)
4. **conform 은 다리로** — 52줄을 언어 넷에 옮겨 쓰면 1,500줄이 넘고, 엔진이 늘 때마다 넷을 같이 고쳐야 한다. 대신 각 언어에 다리(stdin 명령 한 줄 → 그 언어 드라이버 메서드 → stdout 답 한 줄)를 두고 `conform --driver '<다리 명령>'` 이 같은 차례를 그 언어 드라이버로 보낸다. 명령 이름 → 메서드 · 칸 → 인자 · 연결 · JSON 이 모두 그 언어 코드라 드라이버의 모든 층을 지난다. 차례 · 기대값은 TS 한 벌
5. **Robot** — Python 드라이버를 그대로 라이브러리로 쓴다(`Library  control_cli.Game  ${GAME}` — 키워드 `Find All` · `Scene Load` …). 명령 층은 Python conform 이 덮고, Robot 은 표준 화면 suite(`drivers/robot/standard.robot`)로 키워드 이름 · 인자 꼴 · 실패를 본다
6. **판** — CLI 에 `conform --driver` 가 생겨 0.11.0. SDK 는 그대로지만 instrument 기본 ref 가 `v<판>` 이라 tag 는 찍는다

## 확인할 위험

- Java 에는 표준 JSON 이 없다 — 의존 없이 파일 하나로 두려고 작은 JSON 읽기 · 쓰기를 손으로 쓴다(정수인 double 은 `2` 로 — SDK 의 int 칸)
- 이 맥에 dotnet · robot 이 없고 깔기를 자동 권한이 막았다 — C# · Robot 은 CI(GitHub 러너)에서 가짜 표준 화면으로, 실기기는 Docker 길이 되는지 본다
- 스크린샷 답(수백 KB base64)이 다리 한 줄로 그대로 지나가나

## 끝 기준

- `npm run drivers` 가 세 파일을 만들고, 테스트가 「commands.json 과 생성 칸이 같다」를 본다
- 가짜 표준 화면(TCP)에 언어마다 `conform --driver` 53/0/0 · Robot suite 초록 — 새 CI 잡 `drivers`
- 이 맥 macOS 앱(PC 길)에 Python · Java 다리 conform 52/0/1, C# · Robot 은 되는 만큼
- README 드라이버 절, plan.md · checklist · context-notes, 진척 페이지

## 범위 밖

- 기다리기 · 장면 기다리기 같은 도우미(TS `waitFor` · `loadScene`) — 언어마다 몇 줄 되풀이라 쓸 사람이 생기면
- 팜 · iPhone(usbmuxd) 연결 — 팜은 토큰 길이 401, iPhone 은 TS 만. USB 안드로이드는 `adb forward` 뒤 `tcp://` 로 된다
- 패키지 배포(PyPI · NuGet · Maven) — 지금은 파일을 복사해 쓴다

# 구현 계획

1. **생성기** — `src/drivers.ts`(언어마다 생성 칸 · 표시 줄 사이 갈아 끼우기 · `npm run drivers`) → 확인: `drivers.test` 「생성 칸이 commands.json 과 같다」
2. **Python** — `control_cli.py`(연결 · 생성 칸 · `python3 control_cli.py bridge`) → 확인: 가짜 TCP 에 다리 conform 53/0/0
3. **CLI** — `link.ts` `driverLink`(자식 프로세스 stdin/stdout 한 줄씩) · `conform --driver` → 확인: cli 테스트
4. **Java** — `ControlCli.java`(JSON · 생성 칸 · 생성 dispatch · `main`) → 확인: 다리 conform 53/0/0
5. **C#** — `ControlCli.cs` · `Bridge.cs` · `.csproj` → 확인: CI
6. **Robot** — `standard.robot` → 확인: CI
7. **CI** — `.github/workflows/drivers.yml`(node · python · java · dotnet · robotframework) → 확인: PR 초록
8. **실기기** — 이 맥 macOS 앱 `open --pc --app` → `conform --driver` 언어마다
9. **문서 · 판** — README · plan.md · checklist · context-notes · 진척 페이지 · 0.11.0 · tag
