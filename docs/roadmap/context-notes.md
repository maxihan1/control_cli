# AltTester 기능 전부 + 여러 엔진 — 결정 기록

일하면서 정한 것과 까닭을 붙여 쓴다. 지도는 [plan.md](plan.md), 할 일은 [checklist.md](checklist.md).

## 2026-11-03 — 범위 (사용자)

- 사용자 「alttester 에서 제공하는 기능 모두 넣고 추가로 앞서 얘기한 엔진이 적용되길 바래」 — 앞서 얘기한 엔진은 Unity 넓히기 범위 질문 때의 목록(Unreal · Unity · Godot · GameMaker · CryEngine · RPG Maker, [docs/unity/context-notes.md](../unity/context-notes.md) 「범위」)
- 그 전 질문 — 「alttester 대비 몇 프로」 → 명령 기준 22.5/68(약 33%), 핵심 QA 흐름(찾기 · 기다리기 · 누르기 · 끌기 · 글자 · 읽기 · 속성 · 키 · 스크린샷)은 약 90%. 셈은 plan.md 1절 표
- 한 설계로는 너무 크다(엔진 여섯 · 드라이버 넷 · GUI 도구). 로드맵 하나 + 단계(P0~P10)마다 설계 · 구현 계획 · PR 로 나눴다

## 2026-11-03 — 확인한 사실

- AltTester 명령 목록(설정 5개를 뺀 68개) — [commands](https://alttester.com/docs/sdk/latest/pages/commands.html). UI Toolkit 명령(`GetVisualElementProperty` 등)은 유료판(non-GPL)만
- AltTester Desktop — 인스펙터 · 메서드 보기 · 선택자 검색 · 장면 · 게임 속도 · 키보드/마우스/터치/조이스틱 입력 · Recorder(assertion) · C#/Python/Java/Robot 테스트 생성 · 기록 돌리기 · AltTester Server(로컬 · 원격) · AI 확장(CLI · skills · MCP) · batch mode. 엔진은 Unity · Unreal — [overview](https://alttester.com/docs/desktop/latest/pages/overview.html)
- CryEngine 공개판은 5.7.1 LTS(2022-05-19)에서 멈췄다. 라이선스 고객 지원은 이어진다고 Crytek 이 말했다 — P10 을 「실제 게임이 있을 때만」으로 둔 까닭
- GameMaker `network_create_server` 는 TCP · UDP · WebSocket 을 받지만 HTML5 는 서버를 못 연다(브라우저 제한) — [Networking](https://manual.gamemaker.io/lts/en/GameMaker_Language/GML_Reference/Networking/Networking.htm). 브라우저 빌드 전부(Unity WebGL · Godot 웹 · RPG Maker 웹)에 같은 문제라 게임이 밖으로 WebSocket 을 거는 중계(P3)를 엔진 공통으로 둔다

## 2026-11-03 — 구조 결정 (로드맵 초안, 사용자 검토 전)

- 통신 꼴은 엔진과 무관한 한 벌 — CLI · 드라이버 · test_platform kit 은 엔진을 모른다. 엔진이 못 하는 명령은 `ping` 의 `caps` 로 미리 알린다. 까닭 — 엔진 여섯 × 드라이버 다섯을 곱하지 않고 더하게 한다
- 명령 정의는 `protocol/commands.json` 한 곳 — 적합성 검사 · 드라이버 생성 · README 표가 같은 곳을 본다
- 「모든 엔진에 적용」의 증거는 엔진마다 같은 표준 화면 + `control-cli conform`. 이번 세션 손 실측(loop 스크립트)을 명령으로 굳힌다
- Unity 를 먼저 AltTester 와 똑같이(P2) — 고객 게임이 Unity 고, 다른 엔진이 따라올 기준 구현이 된다. 둘째 엔진은 Godot(열린 소스 · headless CI · 동적 reflection)

## 2026-11-03 — MCP · 인스펙터 모양 (사용자 확인)

- MCP 서버도 만든다(사용자 「mcp 도 추가해서 만든다는 말이지?」 → 예). `control-cli mcp` — stdio MCP 서버가 CLI 의 `Game` 위에 얇게 앉아 `click` · `type` · `snapshot` · `get` … 을 도구로 내준다. 셸이 없는 AI 클라이언트(Claude Desktop · claude.ai)도 게임을 조작하고, 도구 인자 꼴이 정해져 AI 가 덜 틀린다
- 인스펙터는 `control-cli inspect` — 로컬 웹 화면(설치 없음 · 스크린샷을 보이기 쉬움). 터미널 UI 는 스크린샷을 못 보이고 데스크톱 앱(Electron)은 무거워 뺐다
- MCP 도구 목록은 `protocol/commands.json` 에서 만든다 — 단계마다 늘어나는 명령이 MCP 에도 저절로 들어온다

## 2026-11-03 — 차례 바꿈 · 번호 다시 매김 (사용자)

- 사용자 「p3 에서 p7 일 가장 나중에 하는게 맞는거 같다」 — 엔진(Godot · Unreal · GameMaker · RPG Maker · CryEngine)을 맨 뒤로. 까닭 — 그때는 통신 꼴 · MCP · 드라이버 · 인스펙터가 다 서 있어 엔진 SDK 만 만들면 도구가 따라온다
- MCP 는 P5(인스펙터)에서 떼어 P0 바로 뒤 P1 로 — 1일로 싸고 도구 목록이 `protocol/commands.json` 에서 따라온다. 사용자가 이 칸은 따로 답하지 않아 제안대로 두었다(되돌리기 쉬움)
- 번호를 차례대로 다시 매겼다 — 옛 P1-A~D → P2-A~D · P2 → P3 · P8 → P4 · P9 → P5 · P3~P7 → P6~P10. 이 문서의 앞 절도 새 번호로 고쳤다

## 2026-11-03 — 순차와 병행 (사용자)

- 사용자 「p0 ~ p2 까지 순차 진행하고 나머지는 병행해서 작업 진행 할 수 있지?」 → 된다. P0~P2 가 통신 꼴 · `conform` · 표준 화면 · Unity 기준 구현을 굳히면 P3~P10 은 서로 거의 안 엮인다(엔진끼리 무관 · 엔진 웹 빌드만 P3 relay 뒤 · Recorder 의 TS 밖 출력만 P4 뒤)
- 조건 — P2 가 main 에 합쳐진 뒤 시작(그 전에 Unity U-stack #5~#13 도). 통신 꼴 바꿈은 작은 PR 로 main 에 먼저. 트랙마다 세션 · worktree · 팜 폰 하나
- 한꺼번에가 아니라 세 트랙씩 묶음을 권했다 — 병목이 코드가 아니라 PR 검토 · 팜 폰 둘 · Unreal 러너 · GameMaker/RPG Maker 라이선스라서

## 2026-11-03 — P0 끝 (팜 RF9R408GKRR · sample run 41642343858 · 커밋 07062ec)

- 경로 — Unity SDK 는 `sdk/unity/`(c6a60c1). UPM 주소는 `?path=/sdk/unity`, 엔진이 늘면 `sdk/<엔진>/`. 워크플로 `paths: ['sdk/**']` 는 그대로 받는다
- protocol 2 — `ping` 이 `engine` · `engineVersion` · `sdkVersion` · `protocol` · `caps` 를 준다(SDK · CLI 판 0.3.0). 명령 이름은 `protocol/commands.json` 한 곳, Unity 쪽 `Caps` 배열과 `SdkVersion` 은 `src/protocol.test.ts` 가 글로 읽어 대조한다(C# 을 돌리지 않고 잡는다). npm 패키지에 `protocol/` 을 싣는다
- caps 미리 거절 — `open` 이 받은 caps 를 세션 파일에 적고, `Game` 이 caps 밖 명령을 보내기 전에 「이 게임의 SDK 는 X 를 못 합니다」로 던진다. 옛 SDK(caps 없음)는 다 보낸다 — 0.2.0 게임도 그대로 쓴다
- conform 16줄 — tree · find · type 셋(uGUI · TMP · UI Toolkit) · 로그인 셋 · drag · 큐브 · 키 · get · tap · layout · screenshot · errors. 누른 횟수는 안 보고 글자가 들어 있는지만 봐 같은 세션에서 다시 돌려도 맞다. caps 에 없는 명령 줄은 「건너뜀」, 실패가 있으면 종료 코드 1
- 실기기 결과 — APK 넷(6000.0 옛 Input · 6000.0 Input System · 2022.3 둘 다 · 2021.3 옛 Input) 모두 「통과 16 · 실패 0 · 건너뜀 0」. `open` 줄에 「· unity <판> · SDK 0.3.0」이 나와 새 ping 이 실기기에서도 온다. uGUI `type` 이 이제 `qauser01`(2db810e 고침이 들어간 첫 conform). 전체 화면 안내 창은 안 떴다(패키지 이름으로 기억 — 「두 번째 실기기 시험」 그대로)
- CI 에서 새로 안 것 — 6000.0 옛 Input Android 잡이 Gradle 단계에서 Maven Central 의 POM(`commons-io:2.16.1` · `asm:9.8` · `kotlin-stdlib:2.2.10` …)을 「Could not find」로 4분 넘게 못 받아 빨강. 저장소 쪽 문제라 `gh run rerun --failed` 한 번에 초록. 같은 Unity 판 Input System 잡은 바로 다음 차례에 같은 run 에서 초록이었다
- 이 맥 macOS 앱도 「통과 16 · 실패 0 · 건너뜀 0」(2026-11-04 04:48, run 41642343858 의 StandaloneOSX · 세로 창 540×1200 · `close` 가 게임을 끔). 처음엔 pmset 마지막 기록이 「Display is turned off」(11-03 19:43)라 미뤘으나, 사용자는 맥이 켜져 있다고 했다 — `system_profiler SPDisplaysDataType` 은 두 화면 모두 「Display Asleep: Yes」. **`caffeinate -u -t 3`(사용자 활동 신호)로 화면을 깨우면 pmset 에 바로 「Display is turned on」이 찍히고, `caffeinate -d` 를 걸어 둔 채 돌리면 Metal 멈춤 없이 끝난다** — 화면이 잠들었다고 macOS 시험을 건너뛸 까닭이 없다
- 계획과 다르게 한 것 — ① Task 1 확인 때 앞 작업자가 남긴 Task 2 실패 테스트(`src/protocol.test.ts`)가 build 를 막아 잠깐 치우고 돌렸다 ② roadmap PR 본문은 `origin/roadmap` 의 plan.md 에 attribution 을 붙였다 ③ `package-lock.json` 판은 0.0.1 그대로(0.2.0 때도 안 올렸다 — 계획대로 package.json 둘만)

## 2026-11-04 — P0 코드 리뷰 (PR #15, /code-review · 후보 15개)

- 고침 — ① caps 는 ping 마다 새로 적는다(게임을 새 SDK 로 다시 띄워도 `ping` · `conform` 이 세션 caps 를 고친다) · 게임이 보낸 caps 가 글자 배열이 아니면 믿지 않고 다 보낸다(글자 하나면 `includes` 가 일부로 맞춘다) · `open` 이 caps 를 바로 저장(176f89d) ② conform 을 다시 돌리면 앞 판 상태 글자 · Item 자리가 남아 누르기 · 끌기가 안 먹어도 통과했다 — 누르기 전 글자와 달라져야 통과, Item 이 이미 Slot[3] 이면 Slot[2] 로 옮긴다. 줄마다 쓰는 명령 전부(`click` + `find` …)를 caps 와 견준다 · get 실패 글에 받은 값(7e39ba2). 이 맥 앱에서 한 세션 두 판 모두 16/16 ③ `protocol.test` 를 sdk-compile meta 잡에서 돌리고 SDK ping 의 `protocol` 숫자도 commands.json 과 대조, 테스트 안의 명령 목록 사본은 겹침 검사로 바꿈(d18a681) ④ `PingReply` 를 라이브러리 입구에서 export
- 안 고침 — errors 를 conform 시작 뒤만 보자는 안: 표준 화면이 켜질 때 낸 에러도 적합성 실패가 맞다. 팜 screenshot 을 Appium 으로 돌리자는 안: conform 은 SDK screenshot 명령 자체를 본다(팜 SM-A325N 에서 통과). 가짜 drag 의 `to` 없음 · 일부만 v2 인 ping 의 `undefined` 글: 그런 입력이 없다
- 미룸 — `instrument` 기본 ref `main` × `?path=/sdk/unity`. `roadmap` 에 합치는 데는 상관없고, main 에 합칠 때 옛 CLI(`?path=/sdk#main`)와 새 CLI 가 엇갈린다. 기본 ref 를 CLI 판 tag 로 두면 CLI 와 SDK 경로가 늘 맞는다(그 tag 를 먼저 찍어야 한다) — checklist 맨 위

## 2026-11-04 — P1 설계 ([p1-plan.md](p1-plan.md))

- 브랜치 — 체크리스트의 「`p1` 을 `p0` 위에 · PR 은 `p0` 로」는 P0 가 PR #15 로 `roadmap` 에 합쳐져(e1bdb6b) 낡았다. `p1` 은 `origin/roadmap` 에서, PR 은 `roadmap` 으로(사용자)
- MCP 를 손으로 쓴다 — 쓰는 메서드가 `initialize` · `ping` · `tools/list` · `tools/call` 넷이고 답은 글 · 그림뿐이다. `@modelcontextprotocol/sdk` 는 zod · express 를 끌고 온다(지금 런타임 dependency 0). 판은 2025-11-25 를 앞에 두고 2024-11-05 까지 받는다 — 쓰는 꼴이 그 사이 안 바뀌었다
- 도구 = commands.json 명령 12개 + 세션 도구 4개(`hold` · `open` · `close` · `release`). 세션 도구는 「셸이 없는 AI 클라이언트도 게임을 조작」(「MCP · 인스펙터 모양」)을 지키려고 넣었다 — 없으면 Desktop 사용자가 터미널에서 폰을 잡고 열어야 한다. 세션 도구는 CLI `run()` 을 그대로 부르고, 게임 도구는 세션 파일의 게임에 `{cmd, ...인자}` 를 `Game.call` 로 보낸다(새 명령이 도구로 저절로 들어온다)
- MCP 세션 파일은 `~/.control-cli/` — Claude Desktop 은 MCP 서버를 cwd `/`(macOS 에서 쓸 수 없다)에서 띄운다. 셸 CLI 의 `./.control-cli/` 와 따로 두는 값을 치렀다(README 에 적음)
- 뺀 것 — `snapshot` ref · `Ran:` 줄 · `wait` · `text` · `conform` · `crawl` · `instrument`. ref · Ran 은 셸 CLI 의 케이스 쓰기 몫이고 `wait` · `text` 는 `find` 로 된다
- 끝 기준을 재는 법 — MCP 클라이언트가 `conform` 의 `Game` 을 MCP 링크(`tools/call` 하나 = 명령 하나)로 돌린다. 「conform 차례를 MCP 도구로」가 같은 16줄 · 같은 통과 수로 잰다. 테스트는 `dist/main.js mcp` 를 진짜로 띄워 stdio 로 부른다
- CI — CLI 테스트는 지금 CI 에서 안 돈다. 도구 목록 ↔ commands.json 은 `protocol.test` 와 같은 계약이라 sdk-compile meta 잡에 `mcp.test` 를 더한다

## 2026-11-04 — P1 실기기 (MCP 도구로 conform · sample run 41642343858 · 커밋 f7719f6)

- 재는 법 — 저장소 밖 스크립트가 `dist/main.js -s p1mcp mcp` 를 AI 앱처럼 띄워 `initialize`(MCP 2025-06-18) → `tools/list`(16개) → 세션 도구 → `conform` 의 `Game` 을 MCP 링크(`tools/call` 하나 = 명령 하나)로 → `screenshot` → `close` → `release`. 세션 파일은 진짜 `~/.control-cli/`(시험 뒤 지움 — 처음엔 폴더가 없었다)
- 이 맥 macOS 앱(StandaloneOSX · 세로 창 540×1200) — `open {via: "pc", app}` 뒤 「통과 16 · 실패 0 · 건너뜀 0」(05:54). MCP 스크린샷은 진짜 화면(JPEG 그림 · 로그인 글 · 큐브 · touch 10,10)
- 팜 RF9R408GKRR(6000.0 Input System APK) — `hold {udid}` → `open {app: 로컬 APK 경로}` → 「통과 16 · 실패 0 · 건너뜀 0」 → `close` → `release`(05:56). 팜 기기 목록에서 그 폰은 「IDLE · ready」. P0 에서 APK 넷이 같은 SDK · 같은 conform 으로 초록이었고 MCP 층은 APK 를 가리지 않아 하나만 돌렸다
- 진짜 MCP 클라이언트 — Claude Code headless(`claude -p --strict-mcp-config --mcp-config …`)가 손으로 쓴 서버에 붙었다(`status: connected`, 도구 16개). 말로 시킨 open → tree → type → click → find → screenshot → close 를 다 부르고 스크린샷 그림을 읽어 「touch 135,815」라고 답했다. Claude Desktop 과 같은 공식 SDK 클라이언트라 Desktop 의 손 확인은 사용자 몫으로 남긴다(이 세션은 Desktop 앱을 못 띄운다)
- **잠금 화면은 `caffeinate -d` 를 무시한다** — 첫 macOS 시도에서 `-u -t 3` 으로 깨우고 `-d -t 900` 을 걸었는데 13초 뒤(05:52:33) 다시 꺼져 open 뒤 스크린샷 · ping 이 「게임이 10초 안에 답하지 않았습니다(멈췄거나 일시정지)」 — P0 의 Metal 멈춤과 같은 증상. `ioreg -n Root -d1 -a` 의 `CGSSessionScreenIsLocked` 가 true 였다. P0(04:48)에는 WindowServer 의 HID 신호(UserIsActive)가 화면을 잡아 줬다. `caffeinate -d -u -t 900`(시험 내내 「사용자 활동 중」)으로 바꾸니 끝까지 켜져 16/16. 그 caffeinate PID 만 껐다
- 계획과 다르게 한 것 — ① 인자 꼴 실패 글 「target 가 필요합니다」가 영어 칸 이름 뒤 조사를 못 고른다 → 「target 칸이 필요합니다」 ② 실기기 스크립트는 hold 가 성공한 폰만 release 한다(남이 잡은 폰을 놓지 않게)
