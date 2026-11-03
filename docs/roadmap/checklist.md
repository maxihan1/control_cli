# AltTester 기능 전부 + 여러 엔진 — 체크리스트

## ▶ 다음 세션은 여기부터 (2026-11-03)

- P1 MCP — 진행 중. 계획 [p1-plan.md](p1-plan.md)(태스크 6개). 브랜치 `p1` 은 `roadmap` 위(P0 는 PR #15 로 `roadmap` 에 합쳐짐 · e1bdb6b), PR 은 `roadmap` 으로. 도구 목록은 `protocol/commands.json`(P0) 에서, 끝 기준은 Unity 샘플 `conform` 차례를 MCP 도구로 돌려 초록
- P0 끝 — 팜 · 이 맥 `conform` 모두 초록, 코드 리뷰 고침 뒤 PR #15 를 `roadmap` 에 합침(로드맵은 #14 · `roadmap` → `unity-u8`)
- main 에 합치기 전에 정할 것 — `instrument` 의 기본 ref `main` 과 UPM 경로 `?path=/sdk/unity` 가 엇갈린다(main 에 `sdk/unity/` 가 생기기 전엔 새 CLI 가, 생긴 뒤엔 옛 CLI 의 `?path=/sdk#main` 이 깨진다). 기본 ref 를 CLI 판 tag(`v0.3.0`)로 두는 안 — context-notes 「P0 코드 리뷰」
- 차례 — P0 바탕 → P1 MCP → P2 Unity 를 AltTester 와 똑같이 → P3 relay · WebGL · Linux → P4 드라이버 → P5 인스펙터 · Recorder → P6~P10 엔진(맨 뒤 — 사용자 결정)
- P0 → P1 → P2 는 순차, P3~P10 은 P2 가 main 에 합쳐진 뒤 병행(트랙마다 세션 · worktree · 팜 폰 하나 — plan.md 「순차와 병행」)
- 브랜치 — `roadmap`(`unity-u8` 위). P0~P2 는 단계마다 브랜치 하나 · PR 하나(`p0` · `p1` · `p2a` …)를 앞 단계 위에 쌓고, P3 부터는 main 에서 트랙마다 따로
- 그 전에 Unity 넓히기 마무리(U0~U8 draft PR #5~#13 합치기 · `v0.2.0` · Ashveil 회귀 · 팜 안내 창) — [docs/unity/checklist.md](../unity/checklist.md)

단계마다 「설계 → 구현 계획 → 구현 → `conform` 초록(CI + 실기기) → README 지원 표 · AltTester 표 갱신 → test_platform kit 다음 줄」 차례다.

## P0. 바탕
- [x] 설계 · 구현 계획 — [p0-plan.md](p0-plan.md)(태스크 9개)
- [x] `ping` 이 `engine` · `engineVersion` · `protocol` · `caps` 를 준다 · CLI 가 `caps` 밖 명령을 미리 거절 — SDK 0.3.0 · protocol 2(453c351), 세션 파일에 caps(b6a6b64). 팜 `open` 줄 「· unity 6000.0.84f1 · SDK 0.3.0」
- [x] `protocol/commands.json` — 지금 SDK 명령 12개(56dacce) · `src/protocol.test.ts` 가 Unity `Caps` · `SdkVersion` 과 대조 · npm 패키지에 실림(07062ec)
- [x] `control-cli conform` — 표준 화면 차례 · 기대값 · 엔진 × 기능 결과 표 — 16줄(1c1f0ed) · 명령 · 실패면 종료 코드 1(d1a4ba5). 전체 `npm test` 32 통과
- [x] `sdk/` → `sdk/unity/` · instrument 경로 · 하네스 · sample 워크플로 — c6a60c1. sdk-compile run 41642344008 초록(meta · 2021.3 · 2022.3 · 6000.0), 워크플로 `paths` 는 `sdk/**` 라 그대로
- [x] Unity 샘플 `conform` 초록(팜 · 이 맥) — 팜 RF9R408GKRR 초록: sample run 41642343858(7개 초록, 6000.0 옛 Input 은 Maven 저장소 못 닿음으로 rerun 한 번)의 APK 넷(6000.0 옛 Input · 6000.0 Input System · 2022.3 둘 다 · 2021.3 옛 Input) 모두 「통과 16 · 실패 0 · 건너뜀 0」. 이 맥 macOS 앱(같은 run 의 StandaloneOSX · 세로 창 540×1200)도 「통과 16 · 실패 0 · 건너뜀 0」(2026-11-04 — 잠든 화면을 `caffeinate -u` 로 깨우고 `caffeinate -d` 를 건 채)

## P1. MCP
- [x] 설계 · 구현 계획 — [p1-plan.md](p1-plan.md)(태스크 6개)
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
