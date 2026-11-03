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
