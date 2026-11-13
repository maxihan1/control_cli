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
- 진짜 MCP 클라이언트 — Claude Code headless(`claude -p --strict-mcp-config --mcp-config …`)가 손으로 쓴 서버에 붙었다(`status: connected`, 도구 16개). 말로 시킨 open → tree → type → click → find → screenshot → close 를 다 부르고 스크린샷 그림을 읽어 「touch 135,815」라고 답했다. 같은 날 Claude Code headless 에 conform 8단계를 말로만 시키니 도구 27번 · 91초에 다 ✓(도구 설명만 보고 글자는 `get Text.text` 로 읽고 끌기 전 빈 칸을 `find` 로 찾았다)
- **잠금 화면은 `caffeinate -d` 를 무시한다** — 첫 macOS 시도에서 `-u -t 3` 으로 깨우고 `-d -t 900` 을 걸었는데 13초 뒤(05:52:33) 다시 꺼져 open 뒤 스크린샷 · ping 이 「게임이 10초 안에 답하지 않았습니다(멈췄거나 일시정지)」 — P0 의 Metal 멈춤과 같은 증상. `ioreg -n Root -d1 -a` 의 `CGSSessionScreenIsLocked` 가 true 였다. P0(04:48)에는 WindowServer 의 HID 신호(UserIsActive)가 화면을 잡아 줬다. `caffeinate -d -u -t 900`(시험 내내 「사용자 활동 중」)으로 바꾸니 끝까지 켜져 16/16. 그 caffeinate PID 만 껐다
- 계획과 다르게 한 것 — ① 인자 꼴 실패 글 「target 가 필요합니다」가 영어 칸 이름 뒤 조사를 못 고른다 → 「target 칸이 필요합니다」 ② 실기기 스크립트는 hold 가 성공한 폰만 release 한다(남이 잡은 폰을 놓지 않게)
- Claude Desktop(대화 화면) — 사용자 허락으로 `claude_desktop_config.json` 의 `mcpServers` 에 `"control-cli": {"command": "/usr/local/bin/node", "args": ["<worktree>/dist/main.js", "mcp"]}` 을 넣고(원본은 `.bak-p1`) 사용자가 앱을 다시 켜 말로 시켰다(07:26~07:27). Desktop 로그 — 「negotiated protocol version: 2025-11-25」 · 「Connected to control-cli (16 tools)」. 앱 답 — `type` 에 `qauser01`, StatusText 「login qauser01 1」, 스크린샷의 「touch 135,815」를 읽고 close 로 게임을 껐다. 세션 파일은 `~/.control-cli/` 에 생겼다 지워졌다(홈 폴더 결정이 Desktop 에서 맞다)
- Desktop 에서 새로 안 것 — 도구 호출 하나하나는 Desktop 로그(`mcp-server-control-cli.log`)에 안 남는다(initialize · tools/list 만). Desktop 은 서버를 띄울 때 셸 PATH(`/usr/local/bin` · `/opt/homebrew/bin` …)를 넘긴다고 로그에 찍었다 — README 의 짧은 꼴(`"command": "control-cli"`)도 될 듯하나 돌려 보지는 않았다. 설정은 대화 화면 몫이다(사용자가 대화 화면에서 썼다)

## 2026-11-04 — P2-A 설계 ([p2a-plan.md](p2a-plan.md))

- 브랜치 — PR #16(`p1`)이 `roadmap` 에 합쳐져(ed256c5) `p2a` 는 `origin/roadmap` 에서, PR 은 `roadmap` 으로
- 명령 14개를 칸이 정해진 명령으로 나눴다 — `call` · `set` · `static-call` · `static-get` · `static-set` · `pref-get` · `pref-set` · `pref-delete` · `pref-clear` · `timescale-get` · `timescale-set` · `scenes` · `scene-load` · `scene-unload`. static 을 `get` 의 빈 target 으로 합치는 안은 뺐다 — 옛 SDK(0.3.0)가 caps 로 못 걸러 엉뚱한 실패 글이 나오고, CLI 의 `call <주소> <메서드> [인자…]` 와 `call <타입.메서드> [인자…]` 가 갈리지 않는다
- 저장 값 · 시간 배율 · 장면은 reflection 위가 아니라 따로 명령 — plan.md 엔진 표의 공통 낱말이라 다른 엔진 SDK 가 같은 명령을 낸다
- 칸 꼴에 `array`(메서드 인자) · `enum`(`pref-*` 의 `type` · `scene-load` 의 `mode`)을 더했다. MCP 는 배열 칸에 숫자 · 참거짓도 받아 글자로 바꾼다 — AI 가 `args: [2, 3]` 으로 보낸다
- `timescale-get` · `timescale-set` 을 나눈 까닭 — 칸 하나(`value` 가 없으면 읽기)면 JsonUtility 는 「칸 없음」과 0(멈춤)을 가르지 못한다. `set` 의 `value`(글자)와 이름이 겹치지 않게 칸은 `scale`
- 장면 열기 · 닫기는 바로 답하고 CLI 가 `scenes` 를 되풀이한다 — 큰 장면은 SDK 10초 · 팜 15초를 넘는다. 「다 열림」은 `sceneLoaded` 수(`loads`)로 잰다 — 같은 장면을 한 장면으로 다시 열면 이름만으로는 열기 전 · 뒤가 같다
- `Game.call` 은 P1 부터 날 명령 보내기(MCP 길)라 메서드 부르기는 `Game.callMethod` — kit 에도 같은 이름
- 표준 화면은 `Second` 장면을 더하고, 샘플이 `Sample` 이 열릴 때마다 화면을 다시 만든다(`BeforeSceneLoad` 에서 `sceneLoaded` 를 건다). 한 장면 열기로 `Second` 에 갔다 돌아와도 다음 판 conform 이 돈다
- 공용 함수에서 고친 것 — `Tree.RootObjects` 가 열리는 중인(isLoaded 아닌) 장면을 건너뛴다. 장면을 비동기로 열면 그동안 `GetRootGameObjects` 가 던져 `tree` · `find` 가 실패한다
- 뺀 것 — 선택적 인자 채우기 · 제네릭 메서드 · `params` · 객체 참조 값 넣기 · 저장 값 타입 알아내기(`GetInt` 기본값 둘로 견주는 수는 Windows 레지스트리처럼 float 를 DWORD 로 두는 플랫폼에서 틀릴 수 있다)

## 2026-11-04 — P2-A 실기기 (팜 RF9R408GKRR · sample run 41742741513 · 커밋 94ea620)

- CI — sdk-compile run 41742741341 초록(meta 잡이 protocol · mcp · sdk-meta 테스트, 컴파일 2021.3 · 2022.3 · 6000.0). C# 은 이 맥에서 못 굽고 CI 가 처음 본 판이 그대로 통과했다
- 팜 — sample run 의 첫 잡(6000.0 · 옛 Input · Android IL2CPP ARM64) APK 로 `hold --udid RF9R408GKRR` → `open --app <APK>` → `conform` 「통과 23 · 실패 0 · 건너뜀 0」 → `close` → `release`. `open` 줄에 「· unity 6000.0.84f1 · SDK 0.4.0」. A 줄 7개(메서드 · 칸 쓰기 · static · 시간 배율 · 저장 값 · 장면 둘)가 다 초록이고 마지막 `errors` 줄도 비었다 — 장면을 바꾸고 돌아와도 Unity 에러 로그가 없다
- 가장 옛 판 — 같은 run 의 2021.3.45f1 옛 Input APK(IL2CPP)도 「통과 23 · 실패 0 · 건너뜀 0」(10:33). 2022.3 · 6000.0 Input System APK 는 게임 상태 명령이 입력 길과 무관해 돌리지 않았다
- 이 맥 macOS 앱 — 같은 run 의 StandaloneOSX(Mono · 세로 창 540×1200)도 `open --pc --app` → 「통과 23 · 실패 0 · 건너뜀 0」 → `close` 가 게임을 껐다(10:45). 화면은 깨어 있었고(「Display Asleep」 없음) memory 대로 `caffeinate -d -u -t 900` 을 건 채 돌리고 그 PID 만 껐다. sample run 41742741513 은 7개 잡(Android 넷 · macOS · Windows · iOS) 모두 초록
- IL2CPP 에서 확인된 것 — reflection 칸 쓰기(`Text.text` · 값 타입 `Transform.position.y` 의 거꾸로 써 넣기) · `[Preserve]` 를 붙인 샘플 메서드 · static 속성, `Application.CanStreamedLevelBeLoaded` · `LoadSceneAsync` · `UnloadSceneAsync`, 샘플의 `BeforeSceneLoad` 에서 건 `sceneLoaded` 가 첫 장면에도 와서 표준 화면이 한 번만 선다(겹치면 이름 겹침으로 `find` 가 실패했을 것)
- 팜 연결 — 팜은 이 맥(launchd)에서 돈다. `http://127.0.0.1:4723/wd/hub` 도 인증 켬이라 토큰을 묻는다. 토큰은 사용자의 QA Hub 통합계정(`https://auth.maxihan.com/account`) PAT 다(Devicefarm `docs/guides/test-platform.md` 4절 — 토큰 주인이 폰을 잡은 사람이어야 한다). docs/unity/checklist.md 의 `vision.maxihan.com` 도 401 로 살아 있었다
- 계획과 다르게 한 것 — ① cli.test 의 conform 줄 수(16)를 Task 2 커밋 뒤에 알아채 Task 3 커밋에 같이 고쳤다 ② conform.test 의 「다시 돌리기」 두 테스트는 caps 에서 `scene-load` 를 빼 앞 판 상태를 남긴다 — A 장면 줄이 표준 화면을 새로 세워 그 테스트의 뜻이 사라져서. 두 판 돌리기 자체는 새 A 테스트가 본다 ③ `protocol.test` 의 Caps 정규식이 한 줄 배열만 읽어 `\s*` 로 넓혔다(Caps 를 세 줄로 나눔) ④ `.gitignore` 에 `Second.unity*`

## 2026-11-04 — P2-B 설계 ([p2b-plan.md](p2b-plan.md))

- 브랜치 — PR #17(`p2a`)이 `roadmap` 에 합쳐져(43158ee) `p2b` 는 `origin/roadmap` 에서, PR 은 `roadmap` 으로
- 선택자는 AltTester PATH 꼴의 일부(사용자 — 접두어 `tag:x` · CSS `[tag=x]` 와 견줘 고름). AltTester 문서의 `[n]` 이 「같은 이름 형제 중 n번째(0부터)」(`//Button/Text[1]`)라 지금 `/a/b[n]` 이 그 꼴의 부분집합이다 — 문법이 하나로 이어지고 범위 좁히기 · 조건 겹치기 · `..` 부모가 된다. 1.6.3 판 소식 · SDK 문서로 `/` · `//` · `..` · `*` · `contains` · `@tag/@layer/@name/@component/@id/@text` · 조건 이어 붙이기 · `[-1]` 마지막을 확인했다
- 해석은 `src/select.ts` 한 곳을 기준으로 가짜 SDK 가 쓰고 `Select.cs` 가 같은 글로 옮긴다. 단계마다 뿌리에서의 줄(trail)을 들고 내려가 `..` 는 줄 끝을 뗀다(UI Toolkit 요소의 부모 사슬에는 트리에 없는 속 칸이 끼어 위로 오르기가 안 맞는다). 계획 속 기준 코드는 job tmp 에서 tsc strict · 제 테스트 3개 통과를 확인했다
- `/a/b/c` 는 이제 b 가 여럿이어도 c 가 하나면 맞는다(단계마다 모아 내려간다) — 옛 Tree.FindPath 는 b 에서 「순번을 붙입니다」로 멈췄다. 하나를 짚는 명령이 여럿을 만나면 고르지 않고 실패하는 규칙은 그대로
- 옛 SDK 에 선택자 · `inactive` · `camera` 를 보내면 Game 이 보내기 전에 거절 — 옛 Tree.Find 는 `//*[@tag=x]` 를 이름으로 찾아 「없음」으로 답해 `wait` 가 10초 내내 헛돈다. 판 가르기는 caps 의 `find-all`(같은 판에 들어옴)
- 설정 셋 중 기본 기다림만(사용자 「이게 왜 필요한거야?」 → 설명 뒤 고름). AltTester 는 `WaitForObject` 같은 기다리기를 게임 안 명령 하나로 오래 돌려 driver 의 답 한도가 필요하다. 우리는 CLI 가 짧은 명령을 되풀이해 명령 하나가 1초 안팎이고, 고정 쉼은 테스트를 느리고 흔들리게 한다 — 명령 시간 초과 · 명령 뒤 쉼은 AltTester 표에 「필요 없음」
- AltTester 와 견줘 뺀 것을 묻자(사용자 「alttester와 비교해사 제외한거 있어?」) 꺼진 오브젝트 찾기(`enabled: false`) · 카메라 고르기(`cameraBy`) · 영구 id(`AltId`)를 보였고 사용자가 셋 다 넣기로 했다. `[-1]` 은 그때 빠뜨린 것을 찾아 넣었다. 그대로 둔 차이 — `members` 의 상속 고르기 · `WaitForComponentProperty` 의 `interval` · `maxDepth` · AltObject 의 월드 좌표 · 부모 id 칸
- 영구 id 는 빌드 때 박기(사용자). AltTester 처럼 장면에 저장하면 SDK 가 빌드 잡에서만 드는 우리 구조(instrument)에서 보통 빌드 · 개발 중 Missing Script 가 된다. 샘플은 `CONTROL_CLI` 를 `extraScriptingDefines`(플레이어만)로 켜 Editor 는 `CONTROL_CLI` 어셈블리를 컴파일하지 않는다 — 그래서 `ControlCliId` 를 정의 제약 없는 `ControlCli.Id` 에, 빌드 훅을 Editor 전용 `ControlCli.Editor` 에 둔다. `GlobalObjectId` 가 장면을 굽는 중에도 번호를 주는지는 확인 못 했다 — sample 로그 줄로 보고, 안 되면 「장면 이름/형제 순번 줄」로 물러난다(Task 6 Step 3)
- `tools/unity-compile-check/check.py` 는 Android 플레이어 어셈블리만 굽는다(`included()` 가 Editor 전용을 뺀다) — Editor 훅 코드는 sample 빌드(진짜 Unity)에서만 컴파일 확인된다
- UI Toolkit `get` 의 예는 `layout.height` — `resolvedStyle` 은 `VisualElement` 가 `IResolvedStyle` 를 명시적으로 구현해 실제 타입에서 `height` 라는 이름으로 안 찾아진다
- 크기 — 사용자가 더한 셋(꺼진 것 · 카메라 · 영구 id)으로 로드맵의 1~2일이 2~3일

## 2026-11-04 — P2-B 구현 (PR #18 · 커밋 2055e4a~58d2412)

- 계획과 다르게 한 것 — ① 가짜 SDK 의 `screenshot` PNG 를 Task 3 이 아니라 Task 1 에서 넣었다(Task 1 의 MCP PNG 테스트가 기대서). MCP 테스트의 링크도 `image/png` 를 `png` 칸으로 되돌린다 ② 가짜 큐브 자리는 `[0, 0, 5]` 그대로 두고 `waitForProp` 테스트를 거기 맞췄다(계획은 `[0, -2.5, 0]` — 실제 샘플 자리지만 가짜는 P0 부터 달랐다) ③ 가짜 StatusText 에 `Text.text` 읽기 칸을 더했다(B text-set 줄의 `waitForProp`) ④ `wait-prop` · `find-at` 의 꼴 안내 글에 옵션까지 싣고 테스트 정규식을 그 글에 맞췄다 ⑤ 인자 없는 `call` 에 `--inactive` 를 주면 Ran 줄이 `callMethod('X', 'M', [], { inactive: true })` — kit 의 인자 차례 ⑥ `Select.At` 의 물리 raycast 한도를 카메라 `farClipPlane` 으로(안 보이는 것은 안 맞는다 · 물리 모듈이 하나뿐인 게임에서 상수 local 경고 CS0219 를 피한다) ⑦ `members` 값은 먼저 읽고 성공했을 때만 붙인다(getter 가 던지면 `"value":` 만 남아 JSON 이 깨진다)
- 고친 회귀 — 새 선택자 해석이 `[숫자]` 가 아닌 `[ ]` 를 조건으로 읽어 `/[DOTween]/x` · `Slot[A]` 같은 이름에서 꼴 오류를 냈다(옛 FindPath 는 끝의 `[숫자]` 만 순번으로 뗐다). 플러그인 싱글턴 이름(`[DOTween]` · `[Debug Updater]`)이 흔해 `@` · `contains(` · 숫자로 시작하지 않는 `[ ]` 가 있으면 단계 전체를 이름으로, 끝의 `[숫자]` 만 순번으로 본다(678f070 · Select.cs 같이)
- 이 맥에서 C# 컴파일 — Docker 가 있어 `tools/unity-compile-check/check.py fetch 6000.0`(Linux 에디터 tar.xz 를 흘려받아 Managed · 내장 패키지만 풀기, `.cache` 1.5GB) 뒤 `check.py 6000.0` 이 입력 설정 셋 모두 성공. CI 를 기다리지 않고 SDK 컴파일 오류를 잡을 수 있다(Editor 어셈블리는 여전히 빠진다)
- 팜 토큰을 Keychain 에서 — 사용자 「PAT를 왜 매번 넣어야하는건데」 · 「PAT 통합해서 사용하는걸 auth에 추가 했는데 그게 왜 반영이 안되는거냐」. 조사 결과 Auth S25 「PAT 공유」는 Test Commander 서버(client secret)의 3시간 「대신 PAT」뿐이고, CLI · MCP 가 PAT 를 받는 device flow 는 S25 「안 하는 것」(`Auth_platform/docs/superpowers/plans/2026-11-04-s25-pat-share.md:106`)이라 control_cli 에 반영될 길이 없었다. 그래서 `src/main.ts` 가 `--token` · `PLATFORM_APPIUM_TOKEN` 이 없으면 macOS Keychain `control-cli-farm` 을 읽는다(사용자가 한 번 넣는다 — CLI 와 Claude Desktop 이 띄우는 MCP 서버 둘 다). 테스트는 `CONTROL_CLI_KEYCHAIN=0` 으로 끈다. 이 맥 팜에서 끈 때 401 · 켠 때 409(없는 폰 — 인증 통과)로 확인. 붙여 넣기를 아예 없애려면 Auth 에 device flow 를 새로 만든다(이 저장소 밖)

## 2026-11-04 — P2-B 실기기 (팜 RF9R408GKRR · sample run 41759126839 · 커밋 b629a39)

- CI — sdk-compile run 41759126717 초록(meta · 2021.3 · 2022.3 · 6000.0). 2021.3 · 2022.3 은 이 맥에서 안 굽고 CI 가 처음 본 판이 그대로 통과
- 영구 id — sample run 의 6000.0 Android 두 잡 로그에 「[ControlCli] Assets/Sample.unity 오브젝트 0/0개에 영구 id」 · 「Assets/Second.unity 오브젝트 1/1개에 영구 id」. `IProcessSceneWithReport` 안에서 `GlobalObjectId.GetGlobalObjectIdSlow` 가 번호를 준다 — 계획의 물러설 길(장면 이름/형제 순번)은 안 썼다. Sample.unity 는 빈 장면(표준 화면은 코드로 선다)이라 0/0
- 팜 — run 이 다 끝나기 전에 끝난 잡의 결과물(`gh run download -n sample-6000.0.84f1-Android-input0`)을 받아 `hold --udid RF9R408GKRR` → `open --app <APK>` → `conform` 「통과 33 · 실패 0 · 건너뜀 0」 → `close`, 같은 잡기 안에서 Input System APK(`…-input1`)도 「통과 33 · 실패 0 · 건너뜀 0」 → `close` → `release`. 토큰은 Keychain 에서(env 없이). `open` 줄에 「· unity 6000.0.84f1 · SDK 0.5.0」
- IL2CPP 에서 확인된 것 — 선택자 해석(Regex 포함) · `find-at` 의 uGUI RaycastAll · UI Toolkit `panel.Pick` · 물리 raycast(꺼진 SideCamera 로도 `ScreenPointToRay`) · `inactive` 로 꺼진 HiddenText · `members` 의 reflection 목록(TouchProbe `Say(String, Int32)` · `Output`) · UI Toolkit 요소 `get`(`text` · `layout.height`) · TMP · UI Toolkit `text-set` · `EncodeToPNG`
- 가장 옛 판 · macOS — run 이 다 끝난 뒤(8개 잡 모두 초록) 2021.3.45f1 옛 Input APK 를 같은 폰에 다시 잡아 「통과 33 · 실패 0 · 건너뜀 0」 → `release`. 이 맥 macOS 앱(StandaloneOSX · Mono)도 `caffeinate -d -u -t 900` 을 건 채 `open --pc --app` → 「통과 33 · 실패 0 · 건너뜀 0」 → `close` 가 게임을 껐고, 건 caffeinate 만 껐다. `--url` 없이 기본 `http://127.0.0.1:4723` 으로도 팜이 받았다
- CI 에서 새로 안 것 — 문서 · TS 만 바꾼 push 에도 sample 워크플로가 떠(같은 Unity 내용) 두 run(41760691153 · 41762170550)을 취소했다. sample 의 `paths` 를 `sdk/**` · `sample/**` 로 좁히면 러너 시간을 아낀다(이번 PR 에서는 안 고침)

## 2026-11-04 — P2-C 설계 ([p2c-plan.md](p2c-plan.md))

- 브랜치 — PR #18(`p2b`)이 `roadmap` 에 합쳐져(d14f892) `p2c` 는 `origin/roadmap` 에서, PR 은 `roadmap` 으로
- AltTester 입력 명령에서 확인한 것(문서 + `AltTester-Unity-SDK` development 소스) — 시간은 모두 초이고 `Time.unscaledDeltaTime` 으로 센다. `PressKeys` 는 함께 누름, `KeysDown` · `KeysUp` 도 있다. `HoldButton` 은 같은 자리 `Swipe`, `MultipointSwipe` 는 한 손가락이 점 사이마다 같은 시간. `BeginTouch` 가 손가락 번호를 준다. `Tilt` 는 z 를 버린다. 옛 Input 조이스틱은 빌드 때 `InputManager.asset` 축을 `Resources` JSON 으로 굽고 `GetAxis` 가 가짜 키를 따른다(조이스틱 축 자체는 흉내 안 냄). Input System 은 가짜 Gamepad — `JoystickButton0~15` 단추, `16~19` 스틱(값 = power). `PointerDown/Up/Enter/Exit` 은 그 GameObject 하나에 `ExecuteEvents` 만. 가짜 입력 동안 진짜 장치를 끈다. `wait: false` 는 바로 답한다
- 사용자가 고른 셋 — ① 새 한 점 명령(`touch-down` · `touch-move` · `hold` · `mouse-move` · `scroll`)은 주소 또는 좌표(Ran 줄은 주소일 때만 — 「케이스는 좌표를 쓰지 않는다」를 지킨다) ② 옛 Input `GetAxis` · `GetButton` 이 가짜 키를 따르게 축 표를 굽는다 ③ sample 에 macOS Input System 빌드(StandaloneOSX · input 1)를 더한다 — PC Input System Mouse 길을 이 맥에서 실측
- 상태 한 벌 + 프레임 일 — 지금 큐(한 프레임에 한 터치)는 손가락 여럿 · 시간 · 명령 사이 눌림을 못 담는다. 명령이 iterator 하나를 걸고 드라이버가 프레임마다 `MoveNext`. Unity 코루틴이 아니라 안의 IEnumerator 를 `yield return` 하면 돌지 않는다 — 기다림 고리는 일 안에 바로 쓴다. 바쁨은 「도는 일 있음 · Input System 이 아직 안 받음」뿐이라 눌러 둔 손가락 · 키는 다음 명령을 막지 않는다
- 명령 하나 8초 — SDK 답 한도 10초 · 팜 15초. AltTester `wait: false` 대신 오래 누르기는 down/up 두 명령으로
- 손가락 10~19 — 진짜 0~9 와 안 겹치고 UI Toolkit 한도(0~19) 안. PC Input System 은 「마우스 손가락」(아무것도 Mouse 에 안 실렸을 때 처음 누른 것)만 Mouse, 나머지는 Touchscreen — 같은 손가락을 둘에 넣으면 UI 입력 모듈이 두 번 누른다(지금 PC 가 Mouse 만 쓰는 까닭)
- `key` 에 `A+LeftShift` — 명령을 따로 두지 않는다. KeyCode 이름에 `+` 가 없다(`KeyCode.Plus` 는 `Plus`)
- 축 표는 영구 id 처럼 장면에 굽는다(`[ControlCliAxes]` → `Awake` 에서 static 표로 옮기고 지움). AltTester 처럼 `Resources` 에 쓰면 게임 저장소에 파일이 생긴다. 장면마다 굽고 처음 것만 읽어 `IProcessSceneWithReport` 안의 `buildIndex` 에 기대지 않는다
- UI Toolkit 직접 길은 샘플에 한 번도 없었다(늘 EventSystem 이 있다 — docs/unity context-notes). `set EventSystem EventSystem.enabled false` 로 끄는 안은 UI Toolkit 이 실행 중에 기본 이벤트 시스템으로 바꿔 타는지 확실하지 않아, `Second` 를 한 장면으로 열 때만 EventSystem 없는 UI Toolkit 칸을 만든다(더해 열면 Sample 의 EventSystem 이 있다)
- 기울기 탐침은 절댓값 10 넘는 값만 남긴다 — 진짜 폰 가속도는 늘 흔들려 InputText 를 덮는다. conform 은 판마다 20~49 를 보낸다(다시 돌려도 이번 값을 본다)
- 진짜 입력은 지금처럼 섞는다 — 팜 폰은 아무도 안 만지고, 이 맥 PC 시험 중에는 마우스 · 키보드를 안 건드린다(Input System 은 진짜 장치에 상태를 넣는다)
- CLI 음수 — Node 22 `parseArgs` 가 `scroll ScrollList -10` · `tilt 0 -5 0` · `--power -1` 을 모두 거절한다(`-1` 을 짧은 옵션으로 읽음, job tmp 에서 확인). 음수 인자를 잠깐 다른 글자로 감쌌다 푼다
- 팜 폰 — 사용자 「RF9R408GKRR 폰 잠깐 쓰지마 써도 될때 얘기해줄게」(설계 중). 써도 된다는 말이 있을 때까지 그 폰을 잡지 않는다
- 크기 — 축 표 · macOS 빌드를 더해 로드맵의 3~4일이 4일쯤

## 2026-11-04 — P2-C 구현

- 길게 누르기 명령 이름은 `hold` 가 아니라 `long-press`(Game · kit `longPress`) — `hold` 는 이미 팜 폰을 잡는 세션 명령이다(`src/cli.ts` · MCP 세션 도구 · test_platform GAME-F2-15). MCP 도구 이름은 겹칠 수 없고 배포된 세션 `hold` 를 바꾸면 깨진다. 계획서도 같이 고쳤다(세션 `hold --udid` 줄만 그대로). 표준 화면 오브젝트 `HoldBox` · `CONFORM.holdS` 는 그대로
- conform C 줄 검토 반영(계획과 다르게 한 것) — 가짜 SDK 가 가린 실기기 문제 넷. ① swipe 는 ScrollList 가운데에서 시작한다 — 목록이 140 높이라 가운데 ± 150 은 목록 밖이고 uGUI 는 누른 자리로 끌 대상을 정한다(가짜 SDK 도 첫 점으로 고르게 바꿈). ② mouse-move · UI Toolkit 줄은 대상에 올리기 전에 다른 곳으로 뺀다 — PC Input System(이번에 더하는 macOS input 1)은 앞 줄 손가락이 Mouse 라 마우스가 이미 그 위에 있어 enter 가 안 난다. ③ `dragS` 2 · `keyS` 1.5 — via 끌기는 duration 을 무시해도 마디 둘 × 10프레임(30fps 0.67초) + 왕복이라 0.5 로는 못 가른다. ④ long-press 는 먼저 `pointer down` · `up` 을 바로 이어 held 를 작게 둔다 — pointer 줄이 poll 사이에 남긴 held 가 팜에서는 0.95 를 넘을 수 있다. 테스트의 `holdS` 는 0 → 0.1(다시 둔 held 0 이 기준 밑이어야 해서)
- SDK 검토 반영(e1e418a — 계획 밖) — ① `FakeMouse.Reset` 은 2 Tick 뒤에 끈다(뗀 단추가 나가는 프레임에 마우스가 꺼져 있으면 uGUI `StandaloneInputModule` · UI Toolkit 이 뗌을 못 본다) ② UI Toolkit 마우스는 뗀 프레임의 Move · Up 도 붙잡은 panel 로, 마지막 Up 에서만 놓는다 ③ 가짜 마우스도 마우스 손가락도 없을 때 단추 · 바퀴는 지금 `Mouse.current` 자리에(폰에 Mouse 가 없으면 안 보냄) ④ 시간 초과로 거둔 프레임에는 다음 명령을 꺼내지 않는다(PC Mouse 에서 Canceled 와 새 Began 이 한 상태로 섞여 끌기가 된다) ⑤ `Waiting` 은 10프레임 뒤 받은 셈(FixedUpdate 처리 · timeScale 0 이면 모든 명령이 막힌다) ⑥ 손가락이 Mouse 를 새로 잡으면 delta 0 ⑦ 기울이는 동안 Accelerometer 를 프레임마다 다시 넣는다 ⑧ 8초 셈에 프레임 바닥(누르기 2 · 마디 10프레임, 30fps — TS 가짜 SDK 와 같은 식) ⑨ 입력 칸 확인 — tap · find-at 의 NaN, y 만 준 scroll, tilt 의 z, swipe 의 NaN · Infinity, 숫자 · 쉼표 키 이름(`Enum.TryParse` 는 `8` → Backspace, `A,B` → OR), TS 는 count 정수만
- 남긴 한계(검토가 찾았지만 안 고침) — UI Toolkit 에서 마우스가 요소 없는 곳 · 다른 panel 로 가면 떠난 panel 에 PointerLeave 가 안 간다 · 옛 Input 마우스 손가락은 가장 작은 번호, Input System 은 처음 누른 손가락(계획이 고름) · 옛 uGUI 에서 손가락과 가짜 마우스 단추를 함께 눌러 둔 채 Reset 하면 그 프레임은 터치가 이겨 마우스 뗌을 못 본다 · `key X` 는 key-down 으로 눌러 둔 X 도 뗀다 · `pointer` 는 처리기가 없어도 ok(AltTester 와 같음)
- plan.md 1절 셈 — 어림 셈(22.5 → 37.5 → 52.5)에 입력 16개를 더하면 68.5/68 로 넘는다. 앞 셈이 겹쳤다 — P2-D 설계 때 AltTester 명령 목록으로 다시 센다(checklist P2-D 첫 줄)

## 2026-11-04 — P2-C 실기기 (이 맥 · sample run 41780970119 · 커밋 e1e418a)

- CI — sdk-compile run 41780969965 초록(meta · 2021.3 · 2022.3 · 6000.0) · sample run 41780970119 9개 잡 초록(새 6000.0 StandaloneOSX input 1 포함). 축 표 — 9개 잡 모두 「[ControlCli] Assets/Sample.unity 축 18개」 · 「Assets/Second.unity 축 18개」(InputManager 기본 축 수) — 빌드 중에도 `AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset")` 가 읽힌다
- 이 맥 macOS 앱 둘(`caffeinate -d -u -t 900` 을 건 채 `open --pc --app`) — 옛 Input(input0) · Input System(input1) 모두 「통과 47 · 실패 1 · 건너뜀 0」. PC Input System 의 hover · swipe · long-press · drag/key 시간 · 축 · 기울기 줄이 검토 반영 그대로 초록
- 실패 한 줄 — C UI Toolkit 직접의 바퀴(`SecondScroll` 의 `scrollOffset` [0,0]). click · hover 는 통과. 살펴보니 바퀴가 아니라 굴릴 거리가 0 — `contentContainer.layout.height` 200(= 보이는 높이) · `verticalScroller.highValue` 0 · 줄 Label 높이 10(60 을 줬다) · `resolvedStyle.flexShrink` 1. 샘플 panel 은 테마(.tss) 없이 만들어 테마가 주던 내용 칸 `flex-shrink: 0` 이 없다 → 내용 칸이 보이는 높이로 줄고 줄들이 쪼그라든다. 진짜 게임은 테마가 있어 SDK 문제가 아니다 — 샘플에 `scroll.contentContainer.style.flexShrink = 0`. UI Toolkit 요소에는 `set` 이 없어(P2-B — `get` 만) 앱에서 바로 고쳐 보지 못하고 다음 sample run 으로 확인한다
- 레이아웃 수정 빌드(sample run 41786634961 · c08963d) — 팜 RF9R408GKRR(사용자 「RF9R408GKRR 써도 됨」) 2021.3 옛 Input · 2022.3 둘 다 APK 는 「통과 48 · 실패 0 · 건너뜀 0」(UI Toolkit 직접 바퀴까지 굴렀다). 6000.0 옛 Input · Input System APK 와 이 맥 6000.0 앱은 46/48 — 바퀴 줄 + `errors` 의 NullReferenceException. 앱에서 줄마다 보내 보니 바퀴는 닿는다(stack `WheelEvent.Dispatch` → `DispatchToElementUnderPointerOrPanelRoot` → `ScrollView.OnScrollWheel`) — SDK 의 UI Toolkit 직접 바퀴 길은 맞다
- 6000.0 NRE 의 까닭(UnityCsReference 6000.0 `ScrollView.cs`) — `OnScrollWheel` 이 줄 높이를 `ReadSingleLineHeight` 로 읽는다. 테마가 없으면 `--unity-metrics-single_line-height` 를 못 찾고, `isRootVisualContainer` 인 조상도 없어 `updatedRoot` 가 null 인데 붙을 때 넣어 둔 `panel.visualTree` 와 달라 null 에 `RegisterCallback` 을 부른다. 샘플에 `mouseWheelScrollSize = 30`(기본 18 과 달라야 inline — 그 함수를 건너뛴다). 2021.3 소스에도 같은 칸 · inline 표시가 있다. 진짜 게임은 테마가 있어 안 걸린다
- 팜 conform 은 APK 하나에 1~2분(48줄)
- 끝(sample run 41793375943 · 27feaef) — 2021.3 Android 잡이 러너 Docker 층 쓰기 실패(`failed to register layer: write …/NDK/…`)로 한 번 떨어져 그 잡만 다시 돌려 초록. 팜 RF9R408GKRR 의 6000.0 옛 Input · 6000.0 Input System · 2021.3 옛 Input · 2022.3 둘 다 APK, 이 맥 macOS 6000.0 옛 Input · Input System 앱 모두 「통과 48 · 실패 0 · 건너뜀 0」. 팜 폰은 기다리는 동안 놓았다가 다시 잡았고 끝에 `release`, 이 맥 caffeinate 는 건 것만 껐다
- 사용자가 취소한 중복 CI 를 「다시 돌려봐」라 해 다시 돌렸다 — PR 의 마지막 commit 에 CI 가 초록으로 남기를 바란다고 보고, 문서만 바꾼 push 의 run 도 취소하지 않는다

## 2026-11-04 — P2-D 설계 ([p2d-plan.md](p2d-plan.md))

- 브랜치 — PR #19(`p2c`)가 아직 `roadmap` 에 안 합쳐져 `p2d` 는 `origin/p2c` 위, PR 은 `roadmap` 으로
- plan.md 1절 셈을 AltTester [명령 목록](https://alttester.com/docs/sdk/latest/pages/commands.html)으로 다시 셌다 — 설정(AltDriver) 5개 · `PlayerPrefKeyType`(꼴 이름)을 빼면 명령 64(찾기 9 · 입력 16 · 스크린샷 1 · Unity 15 · Other 1 · 오브젝트 19 · 역방향 포트 3) + 알림 4 = 68. P2-C 뒤 63/68(역방향 포트 셋은 게임이 서버라 adb forward 로 대신), 남은 다섯이 알림 넷과 `SetServerLogging`. 앞 셈(22.5 → 37.5 → 52.5 + 16)은 반 개 셈과 겹침으로 68.5 가 됐다
- 알림은 가져가기(사용자 — `logs` + `events` 둘). 우리 통신은 요청-답 한 줄이라 AltTester 처럼 밀어 줄 길이 없다. 로그를 따로 둔 까닭 — 게임이 로그를 쏟아내도 드문 장면 · 일시정지 알림이 고리에서 밀려나지 않는다
- `SetServerLogging` 은 `sdk-log on|off` 로(사용자). 우리 SDK 는 켤 때 한 줄만 적어 끌 것이 없어, 켜면 받은 명령마다 한 줄을 Unity 로그에 적는 것으로 뜻을 옮겼다 — 게임 예외 바로 앞에 무슨 명령이 왔는지 logcat · Player.log · `logs` 에서 보인다
- Issue Bunker 정책과 통일(사용자 「bunker에서의 정책까지 다 읽고 최대한 통일하자」) — `~/projects/bts` 의 알림(notification-policy · inapp-channel · transition-event-outbox · webhook · subscription · Slack), cursor envelope(FR-API-01), 로그(frontend-logging · auth-audit-log · nginx 토큰 가리기 · DEVELOPMENT.md · code-checklists), QA Hub 공통 UI 정책 §8 을 읽었다
  - 맞춘 것 — 알림 종류 `scene.loaded` · `scene.unloaded` · `game.paused` · `game.resumed`(Bunker `issue.<과거분사>`, 사실 하나에 이벤트 하나) · 시각 칸 `occurredAt`(UTC ms 3자리) · `logs` · `errors` 의 40자 넘는 `[A-Za-z0-9_-]` 토막을 `***` 로(nginx 규칙 — SDK 안에서) · `sdk-log` 줄 「[ControlCli] type IdInput text=*** — 성공」(프론트 `[모듈] 설명 — 결과 key=값`, 값은 `passwordHash=***` 꼴) · conform 「건너뜀」 → 「미실행」(공통 UI §8 QA 표준 용어)
  - `errors` 는 `occurredAt` 을 더하고 `time` 을 남긴다(사용자 — Bunker 의 「nullable 칸을 더해 하위호환」). test_platform kit 증적 `game-errors.txt` 가 `e.time` 을 읽는다. 가리기도 `errors` 에 같이 건다
  - 안 맞춘 것 — 껍데기 `{ok, last, logs|events, restarted?, dropped?}` · `since` · `seq`. Bunker `{data, meta.page.next}` 는 최신순 페이지 넘기기라 오래된 것부터 따라가는 우리 쓰임과 다르다. `dropped` 는 Bunker 의 「조용히 잘라내지 않는다」와 같은 뜻. 목록 키 `items` 도 안 바꿨다(Bunker 안에서도 `data` · `items` 가 섞임, `errors` 와 같은 꼴을 지킴). 로그 `type` 은 Unity LogType 그대로(Bunker 에 로그 항목 스키마가 없다). `sdk-log` 의 실행 중 켜고 끄기는 Bunker 선례(빌드 때 DEV 가드)와 다르지만 사용자가 고른 것
- 일시정지 conform 줄 — 팜 · USB 는 Appium `mobile: backgroundApp {seconds: 2}`(팜 Appium 3.8 · UiAutomator2 8.7, `execute/sync` 를 넘긴다 — Devicefarm `scripts/device-check/used-apps-check.ts` 가 `mobile: startActivity` 를 같은 길로). PC 는 SDK 가 `runInBackground = true` 로 켜 일시정지가 아예 안 나 「미실행」, iPhone 도 길이 없어 「미실행」. 그래서 끝 기준이 팜 52/0/0 · macOS 51/0/1
- 듣기 시작은 `SubsystemRegistration` — 지금 `GameState.Watch`(AfterSceneLoad)는 첫 장면의 `sceneLoaded` 를 놓친다. `loads` 셈은 건드리지 않고 알림만 일찍 듣는다

## 2026-11-04 — P2-D 실기기 (팜 RF9R408GKRR · sample run 41806656652 · 커밋 4a86b0d)

- CI — sdk-compile run 41806656486 초록(meta · 2021.3 · 2022.3 · 6000.0). sample run 9개 잡 중 macOS 옛 Input · Windows 가 러너 Docker 층 쓰기 실패(`docker: failed to register layer: write /opt/unity/…/libcache/…` — P2-C 2021.3 잡과 같은 러너 문제)로 떨어져 그 둘만 다시 돌려 초록(attempt 2)
- 팜 — 잡이 하나씩 끝날 때마다 결과물을 받아 `hold --udid RF9R408GKRR` → `open --app <APK>` → `conform` → `close` → `release`(기다리는 동안은 놓았다). 6000.0 옛 Input · 6000.0 Input System · 2022.3 둘 다 · 2021.3 옛 Input 모두 「통과 52 · 실패 0 · 미실행 0」, `open` 줄 「SDK 0.7.0」. 일시정지 줄은 팜 Appium(3.8 · UiAutomator2 8.7)의 `mobile: backgroundApp {seconds: 2}` 가 `execute/sync` 로 넘어가 `game.paused` · `game.resumed` 둘이 잡혔다 — IL2CPP · 2021.3 에서도 `OnApplicationPause` 가 온다
- 이 맥 — `caffeinate -d -u -t 900` 을 건 채 macOS 앱 둘(Input System · 옛 Input) 「통과 51 · 실패 0 · 미실행 1」(일시정지 줄 미실행 — PC 는 SDK 가 `runInBackground` 를 켜 일시정지가 안 난다). 띄운 caffeinate 는 PID 로만 껐다
- 켤 때 알림 — `SubsystemRegistration` 에서 들어 첫 장면 `scene.loaded Sample single` 과 SDK 시작 줄 「[ControlCli] 127.0.0.1:13100 에서 명령을 받습니다」가 `events` · `logs` 1번부터 있다. 새로 안 것 — Unity 가 켤 때 이름 없는 빈 장면을 닫아 `scene.unloaded`(`scene: ""`)가 첫 장면보다 먼저 하나 온다. Unity 가 부른 그대로라 거르지 않고 README 에 적었다(AltTester 도 `sceneUnloaded` 를 그대로 넘긴다)
- 손 확인(팜 6000.0 옛 Input) — `sdk-log on` 뒤 `click LoginButton` · `type PasswordInput` · 틀린 `pref-set` 이 「[ControlCli] click LoginButton — 성공」 · 「[ControlCli] type PasswordInput text=*** — 성공」 · 「[ControlCli] pref-set lv value=*** — 실패: 「***」은 int 가 아닙니다」. CLI 가 액션 뒤 찍는 `tree` 도 명령이라 「[ControlCli] tree — 성공」이 함께 적힌다
- PR — `gh pr create` 를 자동 권한 판정이 「Data Exfiltration」으로 막았다(본문에 Issue Bunker 정책 문서 이름). control_cli · BTS 둘 다 공개 저장소이고 비밀값은 없었다 — 사용자가 「제가 직접 PR 만들기」를 골라 `! gh pr create` 로 #20 을 만들었다. #19 가 아직 안 합쳐져 base 는 `p2c`

## 2026-11-06 — instrument 기본 ref (브랜치 `p2-ref`)

- 정함(사용자 「instrument 기본 ref 결정(v0.3.0 tag 안)을 진행」) — `--ref` 가 없으면 `v${package.json 판}`. P0 때 적은 `v0.3.0` 은 그때 판이었을 뿐이라 숫자를 박지 않고 판에서 읽는다(지금 `v0.7.0`). 판은 `src/mcp.ts` 가 이미 읽던 `VERSION` 을 내보내 같이 쓴다
- 까닭 — 기본 `main` 이면 CLI 가 아는 SDK 경로(`?path=/sdk/unity`)와 main 의 SDK 자리가 어긋나는 때가 생긴다(옛 CLI `?path=/sdk#main`). tag 면 CLI 판과 SDK 판 · 경로가 늘 같은 커밋이다
- 대가 — tag 를 찍기 전의 CLI(손으로 받은 개발판)는 기본값이 아직 없는 tag 를 가리켜 UPM 이 못 받는다. 그때는 `--ref <커밋>`. CI(`sample.yml`)는 늘 `--ref <커밋>` 을 넘겨 상관없다
- 할 일 — P2 묶음을 main 에 합친 뒤 그 커밋에 `v0.7.0` tag. 판을 올릴 때마다 tag 도 같이 찍는다

## 2026-11-06 — P3-A 설계 ([p3a-plan.md](p3a-plan.md))

- P3 을 셋으로 — P3-A relay → P3-B Unity WebGL → P3-C Linux(사용자 「A → B → C 순서」). WebGL 은 relay 위에 서고, Linux 는 작아서 맨 뒤
- relay 범위 — 로컬 기본 + `--token` 이면 밖 공개(사용자). 같은 프로그램 하나
- 주소 전달 — 빌드 때 굽기(`instrument --relay`), WebGL 은 URL `?controlcli=` 가 먼저(사용자). 실행 때 인자(intent extra · devicectl 인자)는 플랫폼마다 길이 달라 뺐다
- 게임 → relay 는 모두 WebSocket(사용자 「A」) — 밖 공개를 고른 순간 HTTP 터널(cloudflared 꼴)을 지나야 해서 TCP 는 안 된다. 대가는 IL2CPP `wss` TLS 를 실기기로 확인할 것
- relay 켜기 — 사용자 「사용자가 키는거면 너무 불편」 · 「mcp없이 자동으로 여는걸로」. `open --relay` 가 없으면 따로 도는 백그라운드 프로세스로 띄우고, 게임이 2초마다 다시 걸어 누가 먼저 켜져도 된다. MCP 서버 안에서 돌리면 AI 앱을 닫을 때 relay 가 같이 죽어 뺐다
- 권한 — 토큰 없는 relay 는 명령 입구를 루프백만, `--token` relay 는 늘 토큰(터널은 요청을 127.0.0.1 로 넘겨 루프백 규칙이 뚫린다). 게임 쪽엔 토큰을 굽지 않는다 — APK 에서 다 보인다
- 팜 화면 relay 표시 — 사용자 「다음에 하자」. `GET /games` · `relay status` 는 `open` 이 게임을 고르는 데 어차피 필요해 P3-A 에
- iPhone 「USB 없이」는 사용자 실측 항목(팜에 iPhone 없음, U7 과 같음)

## 2026-11-11 — P3-A 구현 (브랜치 `p3a`)

계획과 다르게 한 것.
- 판 0.9.0 — #23 find rect 가 0.8.0 을 먼저 썼다. `p3a` 를 main `6f6511a` 위로 rebase(충돌 없음 — #23 이 고친 `ControlServer.cs` 자리는 `Caps` · `SdkVersion` · `Found` 라 Task 5 의 `Serve` · `ping` 과 안 겹친다)
- conform 숫자 — #23 이 rect 줄을 더해 한 줄 늘었다. relay 로 연 맥 게임 「통과 52 · 미실행 1」, 팜 폰 「통과 53」(계획 · 끝 기준 · cli.test 를 고침)
- `open` 이 띄운 로컬 relay 도 `main.ts` 를 지나 Keychain `control-cli-relay` 를 읽어 토큰 relay 가 될 수 있었다 — 띄울 때 `CONTROL_CLI_KEYCHAIN=0` 을 넘겨 설계대로 늘 토큰 없이(c91cc72)
- sample.yml 의 `relay` 입력은 `${{ inputs.relay }}` 를 명령줄에 바로 넣지 않고 환경 변수 `RELAY` 로 넘긴다 — 입력 글자가 shell 로 풀리지 않게. 두 잡 다 ubuntu 라 `${RELAY:+…}` 가 돈다
- `LocalNetwork.cs`(Editor 어셈블리)는 `tools/unity-compile-check` 가 보지 않는다(플레이어 어셈블리만) — sample CI 의 iOS 빌드가 컴파일을 확인한다. 기존 `BakeAxes` · `StampIds` 와 같다
- README 의 명령 표는 게임 명령 + Ran 줄 표라 `open --relay` · `relay` 는 「루프 — relay」 절과 연결 표에 두었다. AltTester 비교 표는 README 가 아니라 plan.md 1절에 있다

## 2026-11-11 — P3-A 실기기 (RF9R408GKRR · 이 맥 · sample run 42979434816 · 42979606389 · 커밋 c11b77d)

- 길 — 팜 토큰 길이 401(2026-11-04 토큰 정책)이라 계획의 「팜 폰」 대신 이 맥에 USB 로 꽂힌 RF9R408GKRR 에 adb 로 깔고 켰다(사용자 「응 진행해」). Appium 이 없어 conform 일시정지 줄은 미실행 — 폰도 맥처럼 「통과 52 · 미실행 1」이 기준이 됐다
- 같은 Wi-Fi — 폰 172.25.28.72 · 맥 172.25.28.64(`kg_guest`, /23). 게스트 Wi-Fi 가 기기끼리 막지 않았다. 6000.0 Input System APK(relay `ws://172.25.28.64:13101`) → `open --relay` → conform 「통과 52 · 실패 0 · 미실행 1」
- 이 맥 macOS 앱(6000.0 옛 Input, 같은 Wi-Fi 주소를 구운 빌드) — 폰 게임이 붙어 있는 채로 `open --relay --pc --app` → 켠 뒤 붙은 맥 게임을 골랐다. 「통과 52 · 실패 0 · 미실행 1」
- 밖 공개 — cloudflared quick tunnel(임시 `trycloudflare.com`) → 이 맥 토큰 relay(13102). `wss://…/game` 에 IL2CPP 게임이 붙었다. 토큰 없이 `open` 은 「relay 토큰이 맞지 않습니다」, 토큰이면 「통과 52 · 실패 0 · 미실행 1」. 시험 뒤 터널 · relay 를 끄고 토큰을 지웠다
- 위험 셋 — ① IL2CPP `ClientWebSocket` 의 `wss` TLS: 6000.0 · Android 13 에서 됨(2021.3 · 2022.3 은 안 봄) ② Android cleartext 막기: Unity 소켓의 `ws://` 에 안 걸림(Android 13) ③ 일시정지: 홈 키로 5초 뒤로 보내도 WebSocket 은 안 끊긴다 — 그동안 명령은 게임 10초 한도로 「멈췄거나 일시정지」, 돌아오면 같은 연결로 바로 답하고 `events` 에 `game.paused` · `game.resumed`
- 걸린 것 — 폰에 다른 서명의 옛 샘플 앱이 있어 `adb install -r` 이 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 로 거절됐는데 출력을 잘라 놓쳤다 → 옛 앱(SDK 0.8.0)이 돌아 relay 줄이 안 나왔다. CI APK 는 잡마다 서명 키가 달라 빌드를 바꿀 때마다 `adb uninstall` 이 먼저(자동 권한이 막아 사용자가 두 번 지웠다). 고칠 수 있는 것 — sample 빌드에 고정 디버그 keystore


## 2026-11-13 — P3-B 설계 ([p3b-plan.md](p3b-plan.md))

- 이어달리기 — 사용자 「남은 작업 이어서 진행하고 이어달리기로 … test_platform 의 방식으로」. 단계 하나(`### P3-B`) = 브랜치 하나 · PR 하나 · 세션 하나, 끝나면 이 세션이 병합하고 다음 단계(P3-C)를 `claude --bg` 로 띄운다. 설계는 사용자에게 묻지 않고 여기 적는다
- jslib → C# 은 콜백 없이 **C# 이 매 프레임 꺼내 간다**(`ControlCliRelayNext`). `dynCall` 문법은 Unity 판(emscripten)마다 다르고, `MonoPInvokeCallback` 은 compile-check 의 참조에 없을 수 있고, `SendMessage` 는 jslib 안에서 보이는지가 판마다 흐리다. 꺼내 가기는 Unity 문서의 「string 돌려주기」 예(`_malloc` + `stringToUTF8`)만 쓴다. 처리가 늘 `Update` 차례 안에 들어 TCP 와 같은 순서를 지킨다
- 답 기다리기 — TCP · 데스크톱 relay 의 `Ask` 는 스레드가 `Done` 을 막고 기다린다. WebGL 은 스레드가 없어 요청에 `Answer` 콜백을 달고(`ControlServer.Post`), `Update` 가 답을 정하는 두 곳을 `Finish` 하나로 모았다. 10초 규칙은 꺼낼 때 센다(10초 넘게 묵은 요청은 돌리지 않고 시간 초과). 답을 미룬 명령이 멈춘 경우는 relay 15초 504 + 번호 거르기에 맡긴다
- 기기 id — `SystemInfo.deviceUniqueIdentifier` 대신 탭마다 하나(`sessionStorage`). 같은 브라우저의 탭 둘이 같은 key 면 relay 가 「같은 key 가 다시 붙으면 옛 연결을 닫는다」로 2초마다 서로를 밀어낸다
- WebGL 에서도 `Relay.cs` 한 파일 — hello · 플랫폼 이름 · 구운 주소 읽기를 같이 쓰고, 스레드 쪽과 브라우저 쪽만 `#if` 로 가른다. 0.9.0 은 파일 전체가 `#if !UNITY_WEBGL` 이었다
- jslib `.meta` 에 `defineConstraints: CONTROL_CLI` 를 걸지 않았다 — Release 빌드에서 jslib 가 빠지는데 C# 의 `DllImport` 도 빠지니 걸어도 되지만, `extraScriptingDefines` 로 켠 정의를 plugin 판정이 보는지 확인할 길이 CI 뿐이라 위험을 안 산다. 안 불리는 함수 몇 개라 Release 크기에 거의 안 든다
- compile-check 에 `webgl` 구성(판마다 `UNITY_WEBGL` · 옛 Input, `UNITY_ANDROID` 를 뺌) — 이 맥 6000.0 네 구성 초록
- sample WebGL — 6000.0 · 옛 Input 하나. 압축 끔(`python3 -m http.server` 로 열리게) · 캔버스 405×900(폰 · PC 와 같은 세로, 노트북 화면에 들게)

## 2026-11-13 — P3-B 실기기 (이 맥 Chrome 157 · sample run 43365234863 · 커밋 3ae9719)

- 결과 — WebGL(6000.0 · 옛 Input · IL2CPP) 을 `python3 -m http.server` 로 열고 `?controlcli=ws://127.0.0.1:13101` → `open --relay --game <key>` → conform 「통과 52 · 실패 0 · 미실행 1」(일시정지 줄 — 게임 밖 길 없음). 위험 셋 — ① `WaitForEndOfFrame` 뒤 `ReadPixels` 스크린샷 · PNG 줄 초록(검은 화면 아님) ② 손으로 짠 relay WebSocket 이 Chrome 클라이언트(마스크 · deflate 제안 · Origin)를 그대로 받음 ③ 뒤로 간 탭 — 아래
- 걸린 것 — 처음 두 번은 「C drag Item via … duration」부터 줄줄이 15초 시간 초과(통과 35 · 33). 게임 안에서 재 보니 5초에 frameCount 8 · `unscaledDeltaTime` 1.0 — Chrome 이 가려진 창(이 맥은 사람이 없어 다른 창 · 잠금 화면 뒤)의 timer 를 초당 1번으로 늦췄다. `runInBackground` 가 켜져 있어 rAF 대신 setTimeout 으로 돌다가 그 1초 늦추기에 걸린다. 1초 끌기가 24초 걸려 답을 미룬 채 다음 명령이 다 막혔다. Chrome 확장 도구가 탭을 건드리면 120fps 로 돌아와 「멈췄다 풀린」 것처럼 보였다
- 해결 — 사용자 Chrome 대신 `--user-data-dir=<job tmp>` · `--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding` 로 따로 띄운 Chrome 에서 60fps · 52/0/1. README WebGL 절에 같은 명령을 적었다
- 그래서 고친 SDK(7500c42) — ① WebGL 은 답을 미룬 명령을 거둘 스레드가 없어(TCP 는 `Ask` 가 10초 뒤 State 3) 미룬 명령 하나가 멈추면 뒤가 끝없이 막혔다 → `Update` 가 `Answer` 요청의 나이를 보고 10초 넘으면 남은 가짜 입력을 거두고 시간 초과로 답한다 ② WebGL `Application.identifier` 가 비어 relay key 가 `@<id>` · conform 머리가 「 1.0」이었다 → 비면 `productName`. 고친 판(sample run 43376280037 · fb87e43)도 같은 Chrome 에서 52/0/1, conform 머리가 「control_cli sample 1.0」

## 2026-11-13 — P3-C 설계 ([p3c-plan.md](p3c-plan.md))

- SDK · CLI 는 그대로 — Linux 플레이어는 데스크톱 길(`TcpListener` · 스레드 · `ClientWebSocket`)이고 `Relay.cs` 가 이미 `LinuxPlayer` 를 「Linux」로 부른다. 없던 것은 Linux 빌드와 그 빌드로 돈 conform 뿐이라 판을 올리지 않는다(tag 없음)
- 실측 자리 — 이 맥엔 리눅스 기계가 없다. Docker Desktop 의 `--platform linux/amd64` 컨테이너(Apple Silicon 위 Rosetta 흉내, `uname -m` 이 `x86_64`) + Xvfb + Mesa llvmpipe(OpenGL 4.5 Core)
- CLI 도 같은 컨테이너에서 — SDK 가 `127.0.0.1` 에만 열어 `docker -p` 로는 못 닿는다. CLI 는 JS 라 컨테이너 안 node 22 로 `open --pc --app` 이 그대로 돈다. Linux 의 `launch` · `stop` 도 함께 본다
- sample 잡은 6000.0 · 옛 Input 하나 — PC Input System 길은 macOS 잡이 실측했고 C# 이 같다

## 2026-11-13 — P3-C 실기기 (이 맥 Docker · sample run 43381678078 → 43387721549)

- 첫 빌드(Mono)는 Docker 에서 못 뜬다 — 그래픽(Mesa llvmpipe · OpenGL 4.5 Core)까지 뜬 뒤 `MonoManager ReloadAssembly` 에서 `x86-codegen.h:410 offset == (gint32)offset` 으로 죽는다. Rosetta 가 mmap 을 실제 x86-64 리눅스와 다른 자리에 줘 Mono JIT 의 32비트 상대 호출이 안 닿는 것으로 보인다. `MONO_ENV_OPTIONS=--interpreter` · `--aot=full` 은 Unity 플레이어가 안 먹는다. Docker 설정을 Rosetta → QEMU 로 바꾸는 길은 이 맥의 다른 컨테이너까지 다시 띄워 쓰지 않았다
- 그래서 Linux sample 은 IL2CPP — JIT 가 없고, game-ci 의 Linux 이미지가 이미 `ubuntu-6000.0.84f1-linux-il2cpp-3` 라 그대로 굽는다. 폰 QA 빌드와 같은 백엔드라 실제 게임에도 가깝다. mac · Windows 는 리눅스 CI 가 그 IL2CPP 를 못 구워 Mono 그대로
- 결과 — IL2CPP 판(run 43387721549 · a4f15de)을 같은 컨테이너에서 `open --pc --app /game/control-cli-sample.x86_64` → conform 「통과 52 · 실패 0 · 미실행 1」, 두 번 돌려 두 번 같다(일시정지 — PC 와 같음). 그래픽은 Vulkan 이 아니라 OpenGL 4.5 Core(llvmpipe)로 떴다
- 위험 셋 — ① Rosetta 위 프레임: llvmpipe 소프트웨어 그리기로도 끌기 · 길게 누르기 duration 줄이 시간 한도 안 ② 스크린샷 · PNG 는 검지 않다(540×1200 세로 창 그대로) ③ Xvfb 에 창 관리자가 없어도 초점 · 마우스 좌표 줄이 다 초록. CLI 의 Linux `launch` · `close`(SIGTERM) 도 됐다
- 남은 흠 — Mesa GL 에서 WorldCube 가 분홍(셰이더 변형 없음)으로 그려진다. 누르기 · 찾기와는 상관없어 그대로 둔다. 소리 장치가 없어 FMOD 오류가 개발 콘솔에 뜨지만 `errors`(예외)에는 안 든다

## 2026-11-13 — P4 설계 ([p4-plan.md](p4-plan.md))

- 드라이버 = 언어마다 의존 없는 파일 하나 — 손으로 쓴 연결(주소 · TCP · relay · JSON · 오류)과 생성 칸(명령마다 메서드)이 한 파일. 생성기(`src/drivers.ts`, `npm run drivers`)는 「생성」 표시 줄 사이만 다시 쓴다. 템플릿을 TS 글자로 감싸면 손 부분을 그 언어로 고치기 어렵고, 템플릿 · 결과 두 벌이 생긴다
- conform 은 다리로 — 52줄을 넷에 옮기면 1,500줄이 넘고 엔진이 늘 때마다(P6~) 넷을 같이 고쳐야 한다. 다리(stdin 명령 한 줄 → 그 언어 드라이버 메서드 → stdout 답 한 줄)를 두고 `conform --driver` 가 같은 차례를 보낸다. 명령 이름 → 메서드, 칸 → 인자, 연결, JSON 이 모두 그 언어 코드라 드라이버의 모든 층을 지난다. Python 은 `getattr` + 키워드라 메서드 꼴을 그대로 지나고, C# · Java 는 dispatch 도 생성한다
- Robot 은 따로 안 만든다 — Robot 이 Python 클래스를 라이브러리로 받아 메서드가 키워드가 된다(`find_all` → `Find All`, 고를 칸 `inactive=${True}`). 명령 층은 Python conform 이 덮고, `drivers/robot/standard.robot` 7줄이 키워드 이름 · 인자 · 실패 꼴을 본다
- 고를 칸 — Python 키워드 전용(`*`), C# 이름 있는 기본값 null, Java `Map<String, ?>`(모르는 이름은 `IllegalArgumentException` — 틀린 칸 이름을 조용히 버리지 않게). 낮은 길은 `send(cmd, args)` — `call` 은 명령 이름이라 피했다
- 연결 주소 하나 — `tcp://host:port` 또는 relay `http(s)://<relay>/games/<key>`, 토큰은 CLI 와 같은 `CONTROL_CLI_RELAY_TOKEN`. 명령마다 새로 잇는다(TS `tcpLink` 와 같은 길). 팜 · usbmuxd 는 넣지 않았다(팜 토큰 길 401 · iPhone 은 TS 만)
- Java JSON 은 손으로 — 표준 JSON 이 없고 Maven 없이 `java ControlCli.java` 로 돌게 하려고. 정수인 double 은 `2` 로 쓴다(SDK `JsonUtility` 의 int 칸)
- Java `HttpClient` 는 HTTP/1.1 로 고정 — 기본값이 `http://` 에 `Upgrade: h2c` 를 붙이고, relay(Node `http`)는 Upgrade 머리가 있는 요청을 `upgrade` 로 넘겨 WebSocket 이 아니면 끊는다(「header parser received no bytes」)
- 판 — CLI 만 0.11.0(`conform --driver`), SDK 는 0.10.0 그대로. instrument 기본 ref 가 `v<CLI 판>` 이라 합친 main 에 `v0.11.0` tag 를 찍는다(그 커밋의 SDK 는 0.10.0)

## 2026-11-13 — P4 실측

- 가짜 표준 화면(`npm test` · CI `drivers` 잡) — Python · Java · C# 다리가 TCP · 토큰 relay 둘 다 「통과 52 · 실패 0 · 미실행 1」(일시정지 — 앱을 뒤로 보낼 길 없음), 틀린 토큰은 relay 거절 글로 실패. Robot suite 7줄 초록
- 이 맥 macOS 앱(sample run 43387721549 · 6000.0 옛 Input · Mono · SDK 0.10.0) `open --pc --app` → Python 다리 두 판 · Java 다리 모두 「통과 52 · 실패 0 · 미실행 1」. 화면이 잠들고 잠겨 `caffeinate -d -u -t 900` 을 걸고 돌렸다
- C# · Robot 실기기는 못 했다 — 이 맥에 dotnet · robot 이 없고, `brew install dotnet` · venv `pip install robotframework` · 이미 받아 둔 `mcr.microsoft.com/dotnet/sdk:8.0` 컨테이너로 띄우기를 모두 자동 권한이 막았다. 사용자가 깔아 주면 README 「드라이버」 명령 그대로 돌린다

## 2026-11-13 — P6 설계 ([p6-plan.md](p6-plan.md))

- 판 — Godot 4.5 이상. plan.md 는 4.3+ 였지만 스크립트가 엔진 로그를 받는 길(`Logger` · `OS.add_logger`)이 4.5 에 생겼다 — 없으면 logs · errors 가 빠진다. 4.5 는 2025-09 판이라 바닥으로 삼고 CI 는 4.5.2 · 4.7.2(지금 최신) 둘
- SDK = GDScript 애드온 하나(`sdk/godot/addons/control_cli`) — autoload 가 매 프레임 TCP 를 훑고(스레드 없음) 명령을 받은 차례로 하나씩 돌린다. 누르기 · 끌기 · 키 · 스크린샷은 코루틴(`await process_frame`)으로 끝난 뒤 답한다. relay 는 `WebSocketPeer` 한 벌이 PC · 폰 · 웹 모두(Unity 는 ClientWebSocket · jslib 둘)
- instrument — Unity 는 UPM git 주소(`--ref`)지만 Godot 는 패키지 관리자가 없다. CLI npm 패키지에 `sdk/godot` 을 싣고 그대로 복사한다 — CLI 판 = SDK 판이라 `--ref` 를 받지 않는다. CI 는 체크아웃한 CLI 로 돌려 PR 의 SDK 가 들어간다. relay 주소는 `project.godot` 의 `[control_cli] relay` — 내보낸 빌드는 .txt 를 안 싣지만 프로젝트 설정은 실린다
- conform 엔진 표 — 차례 · 기대값은 한 벌로 두고 이름 꼴만 `Sample`(`UNITY` · `GODOT`)에서. Godot 는 같은 이름 형제를 못 둬(자동으로 이름을 바꾼다) Bag 칸이 `Slot0~3` · 선택자 `//Bag/*`. Unity 에만 있는 UI(TMP · UI Toolkit) 줄은 `ui` 표시로 「godot 표준 화면에 없음」 미실행. 옛 SDK(engine 없음)는 Unity
- 칸 주소 `[클래스.]칸` — Unity 꼴 `컴포넌트.칸` 을 그대로 받으려고 앞 낱말이 노드의 클래스 줄기 · 스크립트 이름이면 뗀다(`TouchProbe.Say` · `Label.text`). 나머지는 `get_indexed`(`position.y` → `position:y`)라 값 타입 칸 되써 넣기를 Godot 가 한다
- 영구 id — Godot 는 장면 파일에 노드 id 가 없다(판마다 다름). 「열린 장면 파일 경로 :: 뿌리부터 경로」의 hash 로 — 다시 열어도 같고, 실행 중 만든 노드(owner 없음) · 실행 중 instantiate 한 장면은 instance id 라 conform 의 SecondSaved · SecondMarker 기대와 같다
- 입력 — 손가락은 `InputEventScreenTouch` · `ScreenDrag` 로 넣고 단추 · Control 은 Godot 의 「터치로 마우스 흉내」로 눌리게 둔다(진짜 폰과 같은 길). 저장 값은 Godot 표준이 없어 `ConfigFile` 하나(`control_cli/prefs_file`)

## 2026-11-13 — P6 실측 (CI run 43401271272 → 43402118931 · 이 맥)

- 첫 CI(43401271272) — 25 통과. GDScript 파싱 오류 하나(`var bit := 1 << (e.button_index - 1)` — 타입 없는 값에서 `:=` 로 타입을 못 정함)로 `fake_input.gd` 가 통째로 안 실려 입력 줄이 다 「처리하다 멈춤」. 이 맥에 Godot 가 없어 문법은 CI `--import` 로 본다 — `:=` 는 오른쪽 타입이 정해질 때만, 하위 클래스 칸을 읽는 인자는 타입을 비운다(GDScript 는 `is` 뒤에도 타입을 좁히지 않을 수 있다)
- type 거르기 — LineEdit 는 `text_changed` 를 프레임 끝으로 미룬다. 글자를 한 프레임에 다 밀면 거르기가 끝에 한 번만 돌아 「qa_user0」. 글자마다 한 프레임을 넘겨 사람이 칠 때 차례로 「qauser01」
- pointer enter · exit — 4.5 는 `NOTIFICATION_MOUSE_ENTER` 가 `mouse_entered` 를 내지만 4.7 은 안 낸다. 알림을 보내고 신호가 안 났을 때만 직접 낸다(두 번 나지 않게)
- 웹 hover — 진짜 마우스가 캔버스 밖이면 Godot 루트 창(`mouse_in_window`)이 가짜 마우스의 hover 를 세지 않는다(PC · xvfb 는 셌다). 옮긴 뒤 `gui_get_hovered_control()` 이 그 자리 Control 이 아니면 SDK 가 enter · exit 신호를 낸다 — Godot 가 잡은 곳(PC)은 손대지 않는다
- 결과 — CI 4.5.2 · 4.7.2 xvfb(Mesa llvmpipe · gl_compatibility), 이 맥 macOS 앱(Linux 러너가 구운 ad-hoc 서명 universal 이 그대로 떴다), 이 맥 Chrome 웹(`python3 -m http.server` + `?controlcli=ws://127.0.0.1:13101` + 늦추기 끈 Chrome) 모두 「통과 47 · 실패 0 · 미실행 6」
- relay 에 같은 앱 탭이 둘이면(옛 탭이 끊긴 채 남음) `--game` 이 못 고른다 — 신호가 끊긴 쪽은 잠시 뒤 빠진다

