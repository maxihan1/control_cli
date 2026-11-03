# AltTester 기능 전부 + 여러 엔진 — 체크리스트

## ▶ 다음 세션은 여기부터 (2026-11-03)

- P0 구현 — [p0-plan.md](p0-plan.md) Task 1 부터(브랜치 `p0`). 로드맵은 사용자 승인(2026-11-03, 「이어달리기로 진행」)
- 차례 — P0 바탕 → P1 MCP → P2 Unity 를 AltTester 와 똑같이 → P3 relay · WebGL · Linux → P4 드라이버 → P5 인스펙터 · Recorder → P6~P10 엔진(맨 뒤 — 사용자 결정)
- P0 → P1 → P2 는 순차, P3~P10 은 P2 가 main 에 합쳐진 뒤 병행(트랙마다 세션 · worktree · 팜 폰 하나 — plan.md 「순차와 병행」)
- 브랜치 — `roadmap`(`unity-u8` 위). P0~P2 는 단계마다 브랜치 하나 · PR 하나(`p0` · `p1` · `p2a` …)를 앞 단계 위에 쌓고, P3 부터는 main 에서 트랙마다 따로
- 그 전에 Unity 넓히기 마무리(U0~U8 draft PR #5~#13 합치기 · `v0.2.0` · Ashveil 회귀 · 팜 안내 창) — [docs/unity/checklist.md](../unity/checklist.md)

단계마다 「설계 → 구현 계획 → 구현 → `conform` 초록(CI + 실기기) → README 지원 표 · AltTester 표 갱신 → test_platform kit 다음 줄」 차례다.

## P0. 바탕
- [x] 설계 · 구현 계획 — [p0-plan.md](p0-plan.md)(태스크 9개)
- [ ] `ping` 이 `engine` · `engineVersion` · `protocol` · `caps` 를 준다 · CLI 가 `caps` 밖 명령을 미리 거절
- [ ] `protocol/commands.json` — 지금 SDK 명령 12개
- [ ] `control-cli conform` — 표준 화면 차례 · 기대값 · 엔진 × 기능 결과 표
- [ ] `sdk/` → `sdk/unity/` · instrument 경로 · 하네스 · sample 워크플로
- [ ] Unity 샘플 `conform` 초록(팜 · 이 맥)

## P1. MCP
- [ ] 설계 · 구현 계획
- [ ] `control-cli mcp` — stdio MCP 서버 · 도구 목록은 `protocol/commands.json` 에서
- [ ] Claude Desktop 설정 한 줄 · README
- [ ] Unity 샘플 `conform` 차례를 MCP 도구로 돌려 초록

## P2-A. Unity 게임 상태
- [ ] 설계 · 구현 계획
- [ ] 컴포넌트 메서드 호출 · 속성 쓰기 · static 메서드 · static 속성 읽기/쓰기
- [ ] PlayerPrefs 읽기 · 쓰기 · 키 지우기 · 다 지우기
- [ ] timeScale 읽기 · 쓰기
- [ ] 장면 열기(하나 · 더하기) · 닫기 · 열린 목록 · 이 장면이 될 때까지 기다리기
- [ ] 표준 화면 · `conform` A 줄 · 팜 초록

## P2-B. Unity 찾기 · 설정
- [ ] 설계 · 구현 계획(선택자 꼴 확정)
- [ ] 이름 일부 · 태그 · 레이어 · 컴포넌트 · 글자 · id 선택자 · 여러 개 찾기 · 좌표로 찾기
- [ ] 부모 · 화면 좌표 · 속성 값이 될 때까지 기다리기
- [ ] 컴포넌트 · 필드 · 메서드 목록(인스펙터 바탕)
- [ ] UI Toolkit 요소 속성 읽기 · 기다리기
- [ ] 글자 컴포넌트에 글자 쓰기(입력칸 밖)
- [ ] 명령 시간 초과 · 명령 뒤 쉼 · 기본 기다림 설정 · PNG 스크린샷
- [ ] `conform` B 줄 초록

## P2-C. Unity 입력
- [ ] 설계 · 구현 계획(손가락 여럿 · 세 입력 길)
- [ ] `FakeTouches` 손가락 여럿 · 터치 누름/움직임/뗌 따로 · 여러 점 끌기 · 끌기 시간
- [ ] 스크롤 · 길게 누르기 · 마우스 옮기기 · Pointer Down/Up/Enter/Exit
- [ ] 키 누름 · 뗌 따로 · 여러 키 함께 · 누른 채 두기
- [ ] 기울이기(가속도) · 조이스틱
- [ ] 입력 거두기(ResetInput)
- [ ] 옛 Input · Input System · UI Toolkit 직접 길 모두 · `conform` C 줄 초록(Android · macOS)

## P2-D. Unity 알림
- [ ] 설계 · 구현 계획
- [ ] 장면 열림 · 닫힘 · 로그 · 일시정지 알림(번호 뒤만 가져가기)
- [ ] SDK 로그 켜고 끄기
- [ ] `conform` D 줄 초록

## P3. 연결 · 플랫폼
- [ ] 설계 · 구현 계획
- [ ] `control-cli relay` — 게임이 WebSocket 으로 거는 길 · 원격 연결
- [ ] Unity WebGL 샘플 · 이 맥 브라우저에서 `conform`
- [ ] Linux 샘플 빌드 · `conform`
- [ ] iOS 역방향 연결

## P4. 드라이버
- [ ] 설계 · 구현 계획(생성기)
- [ ] Python · C# · Java · Robot — 언어마다 `conform` 을 그 언어로

## P5. 인스펙터 · Recorder
- [ ] 설계 · 구현 계획
- [ ] `control-cli inspect` — 트리 · 상세 · 스크린샷 · 누르면 명령
- [ ] Recorder — 단계 · assertion 기록 → TS · Python · C# · Java · Robot 테스트
- [ ] 기록 돌리기 · 마지막 연결 기억

## P6. Godot
- [ ] 설계 · 구현 계획(Godot 4.3+ · 엔진 낱말 표 확정)
- [ ] `sdk/godot/` 애드온 · instrument
- [ ] 표준 화면 · CI headless export(Android · PC · 웹)
- [ ] `conform` 초록 · 맞출 수 없는 칸 표에 적기

## P7. Unreal
- [ ] 설계 · 구현 계획(판 · CI 러너 정함)
- [ ] `sdk/unreal/` 플러그인 · instrument
- [ ] 표준 화면(UMG) · CI
- [ ] `conform` 초록

## P8. GameMaker
- [ ] 설계 · 구현 계획(주소 꼴 · 라이선스 빌드)
- [ ] `sdk/gamemaker/` 확장 · instrument
- [ ] 표준 화면 · CI · HTML5 는 relay
- [ ] `conform` 초록

## P9. RPG Maker
- [ ] 설계 · 구현 계획(MZ 먼저)
- [ ] `sdk/rpgmaker/` 플러그인 · instrument
- [ ] 표준 화면 · NW.js(TCP) · 웹(relay)
- [ ] `conform` 초록

## P10. CryEngine
- [ ] 할지 말지 — 이 엔진으로 만든 실제 게임이 있나(사용자)
- [ ] 설계 · 구현 계획 · `sdk/cryengine/` · 표준 화면 · `conform`

### test_platform 다음 줄 (이 저장소에서는 고치지 않는다)
- 단계마다 새 명령의 `game.*` 함수를 kit(`packages/kit/src/runtime/game.ts`)에 같은 이름으로 더한다 — 안 그러면 `Ran:` 줄이 케이스에서 안 돈다
