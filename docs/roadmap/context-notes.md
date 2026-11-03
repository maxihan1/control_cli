# AltTester 기능 전부 + 여러 엔진 — 결정 기록

일하면서 정한 것과 까닭을 붙여 쓴다. 지도는 [plan.md](plan.md), 할 일은 [checklist.md](checklist.md).

## 2026-11-03 — 범위 (사용자)

- 사용자 「alttester 에서 제공하는 기능 모두 넣고 추가로 앞서 얘기한 엔진이 적용되길 바래」 — 앞서 얘기한 엔진은 Unity 넓히기 범위 질문 때의 목록(Unreal · Unity · Godot · GameMaker · CryEngine · RPG Maker, [docs/unity/context-notes.md](../unity/context-notes.md) 「범위」)
- 그 전 질문 — 「alttester 대비 몇 프로」 → 명령 기준 22.5/68(약 33%), 핵심 QA 흐름(찾기 · 기다리기 · 누르기 · 끌기 · 글자 · 읽기 · 속성 · 키 · 스크린샷)은 약 90%. 셈은 plan.md 1절 표
- 한 설계로는 너무 크다(엔진 여섯 · 드라이버 넷 · GUI 도구). 로드맵 하나 + 단계(P0~P9)마다 설계 · 구현 계획 · PR 로 나눴다

## 2026-11-03 — 확인한 사실

- AltTester 명령 목록(설정 5개를 뺀 68개) — [commands](https://alttester.com/docs/sdk/latest/pages/commands.html). UI Toolkit 명령(`GetVisualElementProperty` 등)은 유료판(non-GPL)만
- AltTester Desktop — 인스펙터 · 메서드 보기 · 선택자 검색 · 장면 · 게임 속도 · 키보드/마우스/터치/조이스틱 입력 · Recorder(assertion) · C#/Python/Java/Robot 테스트 생성 · 기록 돌리기 · AltTester Server(로컬 · 원격) · AI 확장(CLI · skills · MCP) · batch mode. 엔진은 Unity · Unreal — [overview](https://alttester.com/docs/desktop/latest/pages/overview.html)
- CryEngine 공개판은 5.7.1 LTS(2022-05-19)에서 멈췄다. 라이선스 고객 지원은 이어진다고 Crytek 이 말했다 — P7 을 「실제 게임이 있을 때만」으로 둔 까닭
- GameMaker `network_create_server` 는 TCP · UDP · WebSocket 을 받지만 HTML5 는 서버를 못 연다(브라우저 제한) — [Networking](https://manual.gamemaker.io/lts/en/GameMaker_Language/GML_Reference/Networking/Networking.htm). 브라우저 빌드 전부(Unity WebGL · Godot 웹 · RPG Maker 웹)에 같은 문제라 게임이 밖으로 WebSocket 을 거는 중계(P2)를 엔진 공통으로 둔다

## 2026-11-03 — 구조 결정 (로드맵 초안, 사용자 검토 전)

- 통신 꼴은 엔진과 무관한 한 벌 — CLI · 드라이버 · test_platform kit 은 엔진을 모른다. 엔진이 못 하는 명령은 `ping` 의 `caps` 로 미리 알린다. 까닭 — 엔진 여섯 × 드라이버 다섯을 곱하지 않고 더하게 한다
- 명령 정의는 `protocol/commands.json` 한 곳 — 적합성 검사 · 드라이버 생성 · README 표가 같은 곳을 본다
- 「모든 엔진에 적용」의 증거는 엔진마다 같은 표준 화면 + `control-cli conform`. 이번 세션 손 실측(loop 스크립트)을 명령으로 굳힌다
- Unity 를 먼저 AltTester 와 똑같이(P1) — 고객 게임이 Unity 고, 다른 엔진이 따라올 기준 구현이 된다. 둘째 엔진은 Godot(열린 소스 · headless CI · 동적 reflection)
