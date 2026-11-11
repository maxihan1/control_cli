# AltTester 기능 전부 + 여러 엔진 — 로드맵

목표: AltTester 가 주는 기능을 control_cli 에 모두 넣고, 같은 기능을 Unity 밖의 엔진(Unreal · Godot · GameMaker · RPG Maker · CryEngine)에도 붙인다(사용자 2026-11-03).
할 일은 [checklist.md](checklist.md), 결정과 까닭은 [context-notes.md](context-notes.md). 단계(P번호)마다 따로 설계 · 구현 계획을 쓰고 PR 을 낸다 — 이 문서는 전체 지도다.

## 1. 기준 — AltTester 기능 목록

기준은 AltTester 문서 [명령 목록](https://alttester.com/docs/sdk/latest/pages/commands.html)과 [Desktop 개요](https://alttester.com/docs/desktop/latest/pages/overview.html)다. 명령 목록을 P2-D 설계 때(2026-11-04) 다시 셌다 — 설정(AltDriver) 5개 · 꼴 이름 `PlayerPrefKeyType` 을 빼면 명령 64(찾기 9 · 입력 16 · 스크린샷 1 · Unity 15 · Other(SetServerLogging) 1 · 오브젝트 19 · 역방향 포트 3) + 알림 4 = 68. P2-C 뒤 63/68(역방향 포트 셋은 게임이 서버라 adb forward 로 대신), P2-D 뒤 68/68 이다. 앞 어림 셈(22.5 → 37.5 → 52.5)은 반 개 셈과 겹침이 섞여 P2-C 뒤 68.5 로 넘쳤었다.
✓ 는 지금 있음, 단계는 넣을 곳.

| AltTester 갈래 | 명령 · 기능 | 지금 | 단계 |
|---|---|---|---|
| 찾기 | FindObject · GetAllElements · WaitForObject · WaitForObjectNotBePresent | ✓ `find` · `tree` · `wait` · `wait --gone` | — |
| 찾기 | FindObjects · FindObjectWhichContains · FindObjectsWhichContain · WaitForObjectWhichContains · FindObjectAtCoordinates · 선택자(By NAME · PATH · TAG · LAYER · COMPONENT · TEXT · ID) · 꺼진 오브젝트(`enabled: false`) · 카메라(`cameraBy`) | ✓ `find-all` · `//*[contains(@name,…)]` · `wait` 에 선택자 · `find-at` · AltTester PATH 꼴 선택자(`@tag` · `@layer` · `@component` · `@text` · `@id` 영구 id) · `inactive` · `camera` | P2-B |
| 설정 | SetCommandResponseTimeout · Get/SetDelayAfterCommand · Get/SetImplicitTimeout | ✓ `config --wait`(ImplicitTimeout). 명령 시간 초과 · 명령 뒤 쉼은 필요 없음 — 기다리기를 CLI 가 짧은 명령 되풀이로 해 명령 하나가 1초 안팎(사용자) | P2-B |
| 입력 | PressKey · Click · Tap(좌표) · Swipe | ✓ `key` · `tap` · `drag` | — |
| 입력 | KeyDown · KeyUp · HoldButton · PressKeys · MoveMouse · Scroll · MultipointSwipe · BeginTouch · MoveTouch · EndTouch · Tilt · ResetInput · 조이스틱 · Pointer Down/Up/Enter/Exit | ✓ `key-down` · `key-up` · `long-press` · `key A+B` · `mouse-move` · `scroll` · `swipe` · `drag --via` · `touch-down/move/up` · `tilt` · `input-reset` · 조이스틱 `JoystickButton` · `pointer` | P2-C |
| 스크린샷 | GetPNGScreenshot | ✓ JPEG · PNG(`screenshot {format: png}` · `snapshot --png`) | P2-B |
| 게임 상태 | GetCurrentScene · GetApplicationScreenSize | ✓ `tree` 의 `scene` · `screen` | — |
| 게임 상태 | LoadScene · UnloadScene · GetAllLoadedScenes · WaitForCurrentSceneToBe · Get/SetTimeScale · PlayerPrefs(읽기 · 쓰기 · 키 지우기 · 다 지우기) · CallStaticMethod · Get/SetStaticProperty | ✓ `scene-load` · `scene-unload` · `scenes` · `scene-wait`(CLI) · `timescale-get/set` · `pref-get/set/delete/clear` · `static-call/get/set` | P2-A |
| 오브젝트 | FindObjectFromObject · GetComponentProperty · GetText · SetText(입력칸) · Tap · Click · UpdateObject · GetWorldPosition | ✓ 경로 주소 · `get` · `text` · `type` · `click` | — |
| 오브젝트 | CallComponentMethod · SetComponentProperty | ✓ `call` · `set` | P2-A |
| 오브젝트 | WaitForComponentProperty · GetParent · GetScreenPosition · SetText(글자 컴포넌트) · 컴포넌트 · 필드 · 메서드 목록 | ✓ `wait-prop` · `parent`(`/..`) · `find` 답 `x,y` · `text-set` · `components` · `members` | P2-B |
| 오브젝트 | GetVisualElementProperty · WaitForVisualElementProperty(UI Toolkit) | ✓ 요소에 `get` · `wait-prop`(`value` · `text` · `layout.height`) | P2-B |
| 알림 | 장면 열림 · 닫힘 · 로그 · 앱 일시정지 · SetServerLogging | ✓ `events`(`scene.loaded` · `scene.unloaded` · `game.paused` · `game.resumed`) · `logs` · `sdk-log on\|off` — 가져가기(번호 뒤만). 이름 · 시각 칸 · 토큰 가리기는 Issue Bunker 정책과 같다 | P2-D |
| 연결 | Android 역방향 포트 연결 · iOS 역방향 · AltTester Server(로컬 · 원격 중계) | ✓ adb forward · 팜 · usbmuxd · relay(로컬 · 원격, P3-A) | P3 |
| 플랫폼 | Android · iOS · Windows · macOS | ✓ | — |
| 플랫폼 | Linux · WebGL | | P3 |
| 엔진 | Unity | ✓ | — |
| 엔진 | Unreal(+ 사용자가 고른 Godot · GameMaker · RPG Maker · CryEngine) | | P6~P10 |
| 드라이버 | C# · Python · Java · Robot Framework | TS(CLI · test_platform kit) | P4 |
| Desktop | AI 확장(MCP) | ✓ `control-cli mcp`(P1 — 도구는 `protocol/commands.json` + 세션 도구) | — |
| Desktop | 인스펙터(트리 · 컴포넌트 · 메서드) · Recorder(단계 · assertion) · 테스트 생성 · 기록 돌리기 · 마지막 연결 기억 | CLI 화면 파일 · `Ran:` 줄 | P5 |

## 2. 구조

### 통신 꼴 v2 — 엔진과 무관한 명령 한 벌
- 명령은 지금처럼 JSON 한 줄 → 답 JSON 한 줄. CLI · 드라이버는 엔진을 모른다
- `ping` 이 `{engine, engineVersion, sdkVersion, protocol: 2, caps: [...]}` 를 준다. `caps` 는 그 SDK 가 하는 명령 이름 — 못 하는 명령은 CLI 가 보내기 전에 「이 엔진(판)은 X 를 못 합니다」로 거절한다
- 명령 정의 한 곳 — `protocol/commands.json`(이름 · 칸 · 답 · 어느 단계). 적합성 검사 · 드라이버 생성 · README 표가 여기서 나온다
- 엔진 개념은 같은 낱말로 맞춘다. 맞출 수 없으면 `caps` 에서 빼고 엔진 표(아래)에 적는다

| 공통 낱말 | Unity | Unreal | Godot | GameMaker | RPG Maker MZ/MV | CryEngine |
|---|---|---|---|---|---|---|
| 오브젝트 트리 | GameObject · UI Toolkit 요소 | Actor · Component · UMG 위젯 | Node | 인스턴스(트리 없음 — 레이어 · 오브젝트 종류로 묶음) | Scene · Window · Sprite | Entity · Component |
| 속성 읽기 · 쓰기 · 메서드 | reflection | UPROPERTY · UFUNCTION 만 | `get` · `set` · `call` | `variable_instance_get/set` · 메서드 변수 | JS 객체 그대로 | Entity Component 속성(C++) |
| 장면 | Scene | Level(Map) | Scene(`change_scene_to_file`) | Room | `SceneManager` · 맵 | Level |
| 시간 배율 | `Time.timeScale` | Global Time Dilation | `Engine.time_scale` | `game_set_speed` | 프레임 갱신 횟수(일부만) | `t_Scale` 콘솔 변수 |
| 저장 값 | PlayerPrefs | SaveGame 슬롯 | ConfigFile(`user://`) | ini 파일 | `ConfigManager` · `StorageManager` | 콘솔 변수 · 파일 |
| 가짜 입력 | Input 감싸기 · Input System 장치 · UI Toolkit panel | Slate · Enhanced Input 주입 | `Input.parse_input_event` | 입력 함수를 감싼 스크립트 | `TouchInput` · `Input` 덮어쓰기 | 입력 장치 이벤트 주입 |

### 통신 길
- 네이티브(폰 · PC) — 지금처럼 게임이 `127.0.0.1:13100` 에 TCP 로 연다. adb forward · 팜 · usbmuxd · PC TCP 그대로
- 브라우저(Unity WebGL · Godot 웹 · GameMaker HTML5 · RPG Maker 웹 · 모바일 웹 묶음) — 브라우저는 서버를 못 연다. 게임이 밖으로 WebSocket 을 걸고 CLI 의 중계(`control-cli relay`)가 받는다. 같은 중계가 AltTester Server 처럼 원격 연결도 맡는다(P3)

### 저장소 모양
- `sdk/unity/`(지금 `sdk/` 를 옮김) · `sdk/unreal/` · `sdk/godot/` · `sdk/gamemaker/` · `sdk/rpgmaker/` · `sdk/cryengine/`
- `sample/<엔진>/` — 엔진마다 같은 표준 화면(아래). `instrument` 는 엔진을 알아채 그 SDK 를 넣는다
- 옮겨도 이미 커밋을 박은 Ashveil QA 빌드(`instrument --ref`)는 옛 경로 그대로 돈다 — 새 ref 부터 새 경로

### 적합성 검사 — 「모든 엔진에 적용」의 증거
- 엔진마다 같은 표준 화면을 만든다 — `IdInput` · `PasswordInput` · `LoginButton` · `StatusText` · `Bag/Slot[n]` · `Item` · `WorldCube` · `TouchText` (+ 단계마다 늘어나는 것: 스크롤 목록 · 길게 누르기 칸 · 장면 둘 · 저장 값 · 시간 배율 표시)
- `control-cli conform` 이 `protocol/commands.json` 의 `caps` 차례대로 표준 화면에 명령을 보내고 기대값을 본다 — 이번 세션의 손 실측(loop)을 명령 하나로
- 엔진 CI 가 샘플을 굽고, 팜 · 이 맥에서 `conform` 이 초록이면 그 엔진의 그 기능을 「실기기로 확인」으로 옮긴다. 엔진 × 기능 표가 진척률이다

## 3. 단계

| 단계 | 하는 일 | 끝 기준 | 크기 |
|---|---|---|---|
| **P0** 바탕 | 통신 꼴 v2(`ping` caps) · `protocol/commands.json` · `conform` · `sdk/` → `sdk/unity/` · instrument 경로 | Unity 샘플에서 `conform` 초록(지금 명령만) | 1~2일 |
| **P1** MCP | `control-cli mcp` — stdio MCP 서버가 CLI 의 `Game` 위에서 `protocol/commands.json` 의 명령을 도구로 내준다(따로 띄우는 프로그램 아님 — AI 앱이 이 명령을 실행) | Claude Desktop 에서 Unity 샘플 `conform` 차례를 MCP 도구로 돌림 | 1일 |
| **P2-A** Unity 게임 상태 | 메서드 호출(컴포넌트 · static) · 속성 쓰기 · static 속성 · PlayerPrefs · timeScale · 장면 열기 · 닫기 · 목록 · 기다리기 | `conform` A 줄 초록 · 팜 | 1~2일 |
| **P2-B** Unity 찾기 · 설정 | 선택자(AltTester PATH 꼴 — 이름 일부 · 태그 · 레이어 · 컴포넌트 · 글자 · id) · 여러 개 · 좌표로 찾기 · 꺼진 오브젝트 · 카메라 · 영구 id · 부모 · 화면 좌표 · 속성 값 기다리기 · 컴포넌트/필드/메서드 목록 · UI Toolkit 속성 · 기본 기다림 설정 · PNG | `conform` B 줄 초록 | 2~3일 |
| **P2-C** Unity 입력 | 여러 손가락(`FakeTouches` 를 손가락 여럿으로) · 누름/움직임/뗌 따로 · 여러 점 끌기 · 스크롤 · 길게 누르기 · 키 누름/뗌 · 여러 키 · 마우스 옮기기 · 기울이기 · 조이스틱 · Pointer 이벤트 · 입력 거두기 — 옛 Input · Input System · UI Toolkit 세 길 | `conform` C 줄 초록(Android · macOS) | 3~4일 |
| **P2-D** Unity 알림 | 장면 · 로그 · 일시정지 알림(가져가기 방식 — `errors` 처럼 번호 뒤만) · SDK 로그 켜고 끄기 | `conform` D 줄 초록 | 반나절~1일 |
| **P3** 연결 · 플랫폼 | `control-cli relay`(WebSocket · 원격) · Unity WebGL · Linux 빌드 · iOS 역방향 | WebGL · Linux 샘플 `conform` 초록 | 3~5일 |
| **P4** 드라이버 | Python · C# · Java · Robot — `protocol/commands.json` 에서 얇게 만든다 | 언어마다 `conform` 을 그 언어로 | 1주 |
| **P5** 인스펙터 · Recorder | `control-cli inspect`(로컬 웹 화면 — 트리 · 상세 · 스크린샷 · 누르면 명령) · 기록 → TS · Python · C# · Java · Robot 테스트 · 기록 돌리기 · 마지막 연결 기억 | 기록한 테스트가 다시 초록 | 2~3주 |
| **P6** Godot | `sdk/godot/` 애드온(GDScript) · 표준 화면 · CI(headless export) · Android · PC · 웹 | Godot `conform` 전 줄(맞출 수 있는 것) | 1~2주 |
| **P7** Unreal | `sdk/unreal/` C++ 플러그인 · UMG · Enhanced Input · CI(자체 러너) | Unreal `conform` | 2~4주 |
| **P8** GameMaker | `sdk/gamemaker/` 확장(GML) · 방 · 인스턴스 · HTML5 는 relay | GameMaker `conform` | 1~2주 |
| **P9** RPG Maker | `sdk/rpgmaker/` 플러그인(JS · MZ 먼저, MV) · NW.js 는 TCP, 웹 · 모바일은 relay | RPG Maker `conform` | 1주 |
| **P10** CryEngine | `sdk/cryengine/` C++ 플러그인 — 시작 전 할지 말지 정함(아래 위험) | CryEngine `conform` | 2~3주 |

차례 까닭 — Unity 를 먼저 AltTester 와 똑같이 만들어 기준 구현으로 삼는다(고객 게임 Ashveil 이 Unity). 통신 꼴은 P0 에서 고정한다. MCP(P1)는 1일로 싸고 도구 목록이 `protocol/commands.json` 에서 따라와 바로 앞에 둔다. 엔진(P6~P10)은 맨 뒤 — 사용자 결정(2026-11-03). 그때는 통신 꼴 · MCP · 드라이버 · 인스펙터가 다 서 있어 엔진 SDK 만 만들면 도구가 모두 따라온다. 엔진 안 차례는 Godot 먼저(열린 소스 · headless CI · 동적 reflection 이라 가장 싸게 검증), 실제 게임이 있는 엔진이 생기면 그 엔진을 앞당긴다.
크기는 구현 · CI · 실기기 확인까지의 대략이다. 단계마다 이 표의 끝 기준을 지키고 다음으로 넘어간다.

### 순차와 병행 (사용자 2026-11-03)
- **P0 → P1 → P2 는 순차** — 통신 꼴 · `conform` · 표준 화면 · Unity 기준 구현을 굳힌다
- **P3~P10 은 병행** — P2 가 main 에 합쳐진 뒤 트랙마다 세션 · worktree · 브랜치(main 에서) · 팜 폰 하나씩. 기대는 것: P4 는 P2 까지의 `protocol/commands.json`, P5 는 P2-B(Recorder 의 TS 밖 언어 출력만 P4 뒤), 엔진은 P0 꼴 · `conform` · 표준 화면(엔진 웹 빌드만 P3 뒤)
- **통신 꼴 바꿈은 작은 PR 로 main 에 먼저** — 다른 트랙은 그 위로 다시 올린다. README 지원 표 · AltTester 표는 트랙 PR 마다 자기 칸만 고친다
- **묶음(권장)** — 1차 P3 · P4 · P6 Godot(라이선스 · 전용 러너 없음) → 2차 P5 · P7 Unreal(자체 러너) · P8 GameMaker(라이선스) → 3차 P9 RPG Maker · P10 CryEngine(조건부). 병목은 PR 검토 · 합치기, 팜 폰 대수(지금 둘), 엔진 라이선스 · CI 러너
- 기간 대략 — P0~P2 2~3주 + 병행 구간은 가장 긴 트랙(Unreal 2~4주) → 약 2달

## 4. 열린 결정 (기본값으로 가되 단계 시작 때 다시 묻는다)

| 결정 | 기본값 | 물을 때 |
|---|---|---|
| `sdk/` 를 `sdk/unity/` 로 옮기나 | 옮긴다(박힌 ref 는 그대로 돈다) | P0 |
| 엔진 판 | Unreal 5.4 이상 · Godot 4.3 이상 · GameMaker LTS · RPG Maker MZ(MV 는 뒤) · CryEngine 5.7.1 | 각 엔진 단계 |
| Unreal CI | 자체 러너(Epic 컨테이너는 Epic–GitHub 계정 잇기 필요, 디스크 100GB+) | P7 |
| GameMaker · RPG Maker CI | 사용자 라이선스로 빌드(GameMaker Igor CLI) | P8 · P9 |
| 드라이버 만드는 법 | `protocol/commands.json` 에서 생성 | P4 |
| 인스펙터 모양 | 로컬 웹 화면(설치 없음) | P5 |
| test_platform kit | 단계마다 같은 이름 `game.*` 함수를 kit 에 더한다(다른 저장소) | 단계 끝마다 |

## 5. 위험

- **CryEngine** — 공개판이 5.7.1 LTS(2022-05)에서 멈췄고 라이선스 고객만 지원받는다. P10 은 이 엔진으로 만든 실제 게임이 있을 때만 시작한다
- **Unreal 의 reflection 한계** — UPROPERTY · UFUNCTION 이 아닌 C++ 멤버는 못 읽고 못 부른다. AltTester Unreal SDK 와 같은 한계다
- **GameMaker 트리 없음** — 인스턴스는 부모-자식이 없다. 주소 꼴을 `/<레이어>/<오브젝트 종류>[n]` 으로 맞춘다(P8 설계에서 확정)
- **브라우저 빌드 실측** — 팜은 Android 앱만 받는다. 웹 빌드는 이 맥 브라우저(Playwright)로 돌린다
- **좌석 · 라이선스 · CI 시간** — 엔진마다 샘플 빌드가 늘어 CI 시간이 커진다. 엔진별 워크플로를 나눠 그 엔진 경로가 바뀔 때만 돈다
