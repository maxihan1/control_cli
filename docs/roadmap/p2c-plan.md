# P2-C Unity 입력 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AltTester 의 입력 명령(BeginTouch · MoveTouch · EndTouch · MultipointSwipe · Swipe 시간 · HoldButton · MoveMouse · Scroll · KeyDown · KeyUp · PressKey 시간 · PressKeys · Tap/Click 횟수 · Tilt · 조이스틱 · Pointer Down/Up/Enter/Exit · ResetInput)을 control_cli 에 넣고, 표준 화면 `conform` 의 C 줄이 팜 폰(Android)과 이 맥(macOS 옛 Input · Input System)에서 초록이 된다.

**Architecture:** 가짜 입력을 「상태 한 벌 + 프레임마다 한 걸음 도는 일」로 바꾼다. 상태는 손가락 10개(번호 10~19) · 누른 키(세기 포함) · 가짜 마우스(자리 · 단추 · 바퀴) · 기울기다. 명령은 그 상태를 바꾸는 짧은 iterator(일) 하나를 걸고, 일이 끝나면 답한다. 드라이버(`FakeTouches`, 게임보다 먼저 도는 MonoBehaviour)가 매 프레임 일을 한 걸음 돌린 뒤 상태를 세 길로 내보낸다 — 옛 Input(전역 `Input` 감싸기 · uGUI `FakeBaseInput`) · Input System(장치 상태 이벤트) · UI Toolkit 직접(EventSystem 이 없는 옛 Input 게임의 panel). 옛 Input 의 `GetAxis` · `GetButton` 은 QA 빌드 훅이 구워 넣은 InputManager 축 표로 가짜 키를 따른다.

**Tech Stack:** TypeScript(Node 22 · `node:test`) · Unity C#(2021.3 · 2022.3 · 6000.0 — 옛 Input · Input System 1.11 장치(Touchscreen · Mouse · Keyboard · Gamepad · Accelerometer) · EventSystem `ExecuteEvents` · UI Toolkit `GetPooled(Touch)` · `GetPooled(Event)` · `IProcessSceneWithReport` · `SerializedObject`) · GitHub Actions(sdk-compile · sample) · 디바이스 팜(사용자가 정한 폰)

로드맵은 [plan.md](plan.md) P2-C, 할 일 체크는 [checklist.md](checklist.md) P2-C, 결정은 [context-notes.md](context-notes.md) 「P2-C 설계」.
브랜치 `p2c`(`origin/roadmap` 위 — PR #18 이 합쳐짐, PR 은 `roadmap` 으로). 테스트는 고친 파일의 테스트만 — `npm run -s build && node --test dist/<이름>.test.js`. 전체 `npm test` 는 마지막 Task 의 push 전에 한 번. C# 은 이 맥에서 `python3 tools/unity-compile-check/check.py 6000.0`(Docker — 처음이면 `check.py fetch 6000.0`).

## 설계

| 정할 것 | 고른 것 | 까닭 |
|---|---|---|
| 상태와 일 | 상태 한 벌(손가락 10 · 키 · 마우스 · 기울기)을 명령이 건 iterator 가 프레임마다 한 걸음씩 바꾼다. 한 번에 일 하나(명령은 받은 차례대로 돈다 — 지금 그대로). 시간은 `Time.unscaledDeltaTime` 으로 센다 | 탭 · 끌기 · 길게 누르기 · 키 · 마우스 · 기울이기가 모두 「몇 프레임에 걸쳐 상태를 바꾼다」라 한 꼴로 쓴다. 지금 큐(한 프레임에 한 터치)는 손가락 여럿 · 시간을 못 담는다. AltTester 와 같게 `timeScale` 0 에서도 입력이 돈다 |
| 손가락 | 칸 10개, 번호 10~19(진짜 0~9 와 안 겹치고 UI Toolkit 한도 0~19 안). 누른 동안은 매 프레임 `Stationary` 로 남는다. 프레임마다 칸의 phase 를 셈한다 — 이번에 누름 `Began` · 움직임 `Moved` · 그대로 `Stationary` · 뗌 `Ended` · 거둠 `Canceled`, 뗀 다음 프레임에 칸을 비운다 | `touch-down` 과 `touch-up` 이 다른 명령이라 손가락이 명령 사이에도 눌려 있어야 한다. 진짜 Unity 터치와 같은 phase 차례 |
| 답하는 때 | 일이 끝나고 Input System 이 받은 뒤(지금 `Idle` 그대로). `duration` · 횟수 × 간격은 8초 안 — 넘으면 「더 길게는 touch-down · key-down 뒤 touch-up · key-up」으로 거절 | SDK 답 한도 10초 · 팜 15초. AltTester 의 `wait: false`(바로 답)는 뺀다 — 오래 누르기는 down/up 둘로 |
| 바쁨 · 거둠 | 바쁨 = 도는 일이 있거나 Input System 이 아직 안 받음. 눌린 채 둔 손가락 · 키는 바쁨이 아니다. 시간 초과로 거둘 때 · `input-reset` 은 일을 멈추고 손가락 `Canceled` · 키 뗌 · 마우스 단추 뗌 · 가짜 마우스 끔 · 기울기 끔 | AltTester ResetInput 과 같은 범위. 지금 `Cancel` 이 하던 「눌림에 갇히지 않게」를 전부로 넓힌다 |
| 누를 자리(사용자) | 새 한 점 명령(`touch-down` · `touch-move` · `hold` · `mouse-move` · `scroll`)은 `target`(주소 — 그 오브젝트 화면 가운데) 또는 `x` · `y`. 둘 다 없으면 꼴 오류. Ran 줄은 주소일 때만, 좌표면 「케이스에는 주소로 씁니다」. 여러 점 끌기는 `drag` 의 `via`(주소 목록), 좌표로 끌기는 `swipe {points: ["x,y", …]}` | 「케이스는 좌표를 쓰지 않는다」를 지키면서 살펴볼 때는 좌표도 된다. `tap`(좌표) ↔ `click`(주소)과 같은 짝으로 `swipe` ↔ `drag` |
| 새 명령 | `touch-down {target \| x,y, camera?}` → `{finger, x, y}` · `touch-move {finger, target \| x,y, camera?}` · `touch-up {finger}` · `swipe {points, duration?}` · `hold {target \| x,y, duration?, camera?}`(기본 1초) · `mouse-move {target \| x,y, duration?, camera?}` · `scroll {dy, dx?, target? \| x,y?, duration?, camera?}` · `key-down {key, power?}` · `key-up {key}` · `tilt {x, y, z, duration?}` · `pointer {target, event: down\|up\|enter\|exit}` · `input-reset` | 명령마다 칸이 정해진다(P2-A 까닭 — MCP 도구 꼴이 고정). 손가락 번호는 비어 있는 가장 작은 칸 — 10개가 다 눌렸으면 「touch-up · input-reset」으로 거절 |
| 바뀐 칸 | `tap` · `click` 에 `count?`(기본 1) · `interval?`(초, 기본 0.1) · `drag` 에 `via?` · `duration?` · `key` 에 `duration?`(기본 0 = 한 프레임, 지금 그대로) · `power?`. `key` · `key-down` · `key-up` 의 `key` 는 `A+LeftShift` 처럼 `+` 로 여럿을 함께 | AltTester Tap/Click 횟수 · PressKeys. KeyCode 이름에 `+` 가 없어 겹치지 않는다(`KeyCode.Plus` 는 `Plus`). 명령을 따로 두지 않아 CLI 도 `key A+LeftShift` |
| 끌기 시간 | 점 사이마다 같은 시간(AltTester), 한 마디에 적어도 10프레임 — 프레임 k 의 진행 = `min(1, 걸린 시간/마디 시간, k/10)` | 지금 끌기(10프레임)가 `duration` 없는 값으로 그대로 남는다. EventSystem 끌기 문턱을 넘고 끌기 처리기가 중간 자리를 받는다 |
| 마우스 | 가짜 마우스 자리(없으면 끔) · 단추는 키 `Mouse0`~`Mouse4`(AltTester) · 바퀴는 이번 프레임 값. `mouse-move` 가 켜고 `input-reset` 이 끈다. `scroll` 의 `dy` · `dx` 는 옛 Input `mouseScrollDelta` 꼴(바퀴 칸, 위가 +)이고 `duration` 동안 나눠 넣는다. `scroll` 에 자리를 주면 먼저 그리로 옮긴다 | 폰에서도 hover · 바퀴가 uGUI 에 닿게 `FakeBaseInput.mousePresent` 를 켠다. AltTester 는 Scroll 이 지금 마우스 자리만 — 자리 칸은 MoveMouse 한 번을 줄인다 |
| 키 · 세기 | 누른 키마다 세기(`power` -1~1, 기본 1). 옛 Input 은 `GetKey*`(지금) + 축 표로 `GetAxis` · `GetButton*`. Input System 은 Keyboard(누른 키 전부를 한 상태로) · Mouse 단추 · Gamepad — `JoystickButton0`~`15` 는 A · B · X · Y · LB · RB · LT · RT · Select · Start · LS · RS · 십자 위 · 아래 · 왼 · 오른, `16`~`19` 는 왼 스틱 x · y · 오른 스틱 x · y(값 = 세기) | AltTester 와 같은 짝. 지금 Keyboard 는 키 하나만 상태로 보내 여러 키를 함께 못 누른다 |
| 옛 Input 축(사용자) | QA 빌드 훅 `ControlCli.Editor.BakeAxes`(IProcessSceneWithReport)가 `ProjectSettings/InputManager.asset` 의 축을 읽어 장면마다 `[ControlCliAxes]` 오브젝트(`ControlCliAxes` 컴포넌트, 정의 제약 없는 `ControlCli.Id` 어셈블리)로 굽는다. 그 컴포넌트는 `Awake` 에서 static 표로 옮기고 제 오브젝트를 지운다. `GetAxis(name)` · `GetAxisRaw` = 그 이름 축들 중 단추 축(type 0)은 가짜 키가 양쪽(positive · alt positive)이면 +세기, 음쪽이면 −세기(invert 는 뒤집음), 마우스 축(type 1)은 가짜 마우스 이동량 × sensitivity — 가짜 값과 진짜 값 중 절댓값이 큰 쪽. `GetButton*(name)` = 진짜 또는 그 축 양쪽 키의 가짜 누름 | Unity 는 실행 중에 InputManager 축을 읽는 API 가 없다(AltTester 도 빌드 때 JSON 으로 굽는다). 장면에 굽는 까닭은 영구 id 와 같다 — 게임 저장소의 파일을 안 건드린다. 장면마다 굽고 처음 것만 읽어 `buildIndex` 에 기대지 않는다. 조이스틱 축(type 2)은 AltTester 처럼 흉내 내지 않는다 |
| 기울이기 | `tilt` 가 `duration`(기본 0 = 한 프레임) 동안 가속도를 대신하고 끝나면 놓는다. 옛 Input `Input.acceleration`, Input System `Accelerometer`(켜진 장치가 없으면 하나 더한다) — 끝날 때 0 을 한 번 보낸다. z 도 그대로 | AltTester 는 z 를 버리고 Input System 에 `값×dt/시간` 을 보낸다 — 우리는 준 값 그대로 |
| Pointer 이벤트 | `pointer` 가 그 GameObject 하나에 `ExecuteEvents.Execute`(pointerDown · Up · Enter · Exit 처리기) — `PointerEventData` 의 position 은 그 오브젝트 화면 가운데. UI Toolkit 요소 · 없는 오브젝트는 거절 | AltTester PointerDown/Up/Enter/Exit 과 같다(부모로 안 올림 · OnMouse* 안 보냄). position 만 더해 자리를 읽는 처리기도 돈다 |
| 세 입력 길 | **옛 Input** — `Input.touches` 는 진짜 뒤에 가짜 칸(번호 차례), 마우스 비춤(`simulateMouseWithTouches`)은 가장 작은 번호 손가락, 아니면 가짜 마우스. `FakeBaseInput` 은 터치 · `mousePresent` · `mousePosition` · `mouseScrollDelta` · `GetMouseButton*` 을 같은 상태로. **Input System** — 폰은 손가락마다 Touchscreen `TouchState`(touchId = 번호, 바뀐 프레임만), PC 는 마우스 손가락(아무 손가락도 Mouse 에 안 실렸을 때 처음 누른 손가락 — 뗄 때까지 그대로)을 Mouse 왼 단추로, 나머지는 Touchscreen 으로(같은 손가락을 둘에 넣으면 UI 입력 모듈이 두 번 누른다 — 지금 까닭). Mouse 는 손가락 비춤 · 가짜 마우스 · 단추 · 바퀴를 한 상태로, 바뀐 프레임에만(폰에 없으면 가짜 마우스를 쓸 때만 더한다). **UI Toolkit 직접** — 손가락마다 `GetPooled(Touch)`(누른 panel 은 손가락마다), 가짜 마우스는 `GetPooled(Event)` 로 PointerMove · Down · Up · WheelEvent(panel 좌표, 바퀴는 위아래 뒤집음) | 지금 길을 손가락 여럿 · 마우스로 넓힐 뿐 고르는 규칙(`UiToolkit.Direct` · PC 는 Mouse)은 그대로. 진짜 장치가 있으면 그것부터 쓴다(PlayerInput 짝짓기 — 지금 까닭) |
| 진짜 입력 | 지금처럼 섞는다 | AltTester 는 가짜 입력 동안 진짜 장치를 끈다. 팜 폰은 아무도 안 만지고, 이 맥 PC 시험 중에는 마우스를 안 건드린다(Input System 은 진짜 Mouse 장치에 상태를 넣어 손으로 움직이면 덮인다) |
| 옛 SDK | caps 에 `touch-down` 이 없는 SDK 에 바뀐 칸(`count` · `interval` · `via` · `duration` · `power` · `key` 의 `+`)을 보내면 `Game` 이 보내기 전에 「SDK 0.6.0 이상」으로 거절 | 옛 SDK 는 모르는 칸을 버리고 한 번만 눌러 통과한 척한다 |
| 표준 화면 | SampleCanvas 에 `InputText`(입력 탐침 — 「fingers N · keys … · axis x · fire 0/1 · tilt y」, 바뀔 때만 씀) · `HoldBox`(uGUI 칸 — Pointer Down/Up/Enter/Exit 을 `PointerText` 에 「down」 · 「up 1.2」(누른 초) · 「enter」 · 「exit」) · `ScrollList`(세로 ScrollRect, `scrollSensitivity` 30). `Second` 장면을 한 장면으로 열면 EventSystem 없는 UI Toolkit 칸 `SecondPanel`(`SecondButton` → `SecondText` 「second N」 · 마우스가 들어오면 「enter」 · `SecondScroll` ScrollView) | 탐침 하나가 옛 Input · Input System 을 같은 글자로 보인다. 기울기는 진짜 값이 늘 흔들려 10 넘는 값만 「tilt 50」으로 남긴다(conform 은 판마다 다른 값). UI Toolkit 직접 길은 EventSystem 이 없어야 돌아 `Second` 를 한 장면으로 열 때만 만든다(더해 열면 Sample 의 EventSystem 이 있다) |
| conform C 줄 | 15줄(`C ` 로 시작) — B 줄 뒤 · A 장면 줄 앞, UI Toolkit 직접 줄만 A 장면 줄 뒤(Second 를 한 장면으로 연 뒤 Sample 로 돌아온다). 48줄 | 아래 「conform C 줄」 |
| Game 메서드(kit 이름) | `touchDown(at)` → 번호 · `touchMove(finger, at)` · `touchUp(finger)` · `swipe(points, {duration})` · `hold(at, {duration})` · `mouseMove(at, {duration})` · `scroll(dy, {dx, at, duration})` · `keyDown(keys, {power})` · `keyUp(keys)` · `tilt([x, y, z], {duration})` · `pointer(target, event)` · `resetInput()` + `click` · `tap` · `drag` · `key` 의 옵션(`count` · `interval` · `via` · `duration` · `power`). `at` 은 주소 글자 또는 `{x, y}`, 시간은 초 | kit 에 같은 이름 · 같은 인자 꼴. 시간은 AltTester · commands.json 과 같은 초(기다림 한도 `timeoutMs` 와는 다른 뜻) |
| CLI | `touch-down <ref\|주소> \| <x> <y>` · `touch-move <번호> <ref\|주소> \| <x> <y>` · `touch-up <번호>` · `swipe <x,y> <x,y>…` · `hold` · `mouse-move` · `scroll [ref\|주소] <dy>` · `key-down` · `key-up` · `tilt <x> <y> <z>` · `pointer <ref\|주소> <down\|up\|enter\|exit>` · `input-reset`, 칸 `--duration <초>` · `--count` · `--interval <초>` · `--via <주소>`(여럿) · `--power` · `--dx`. 인자 둘이 다 수면 좌표 | 지금 `tap <x> <y>` 와 같은 읽기 |
| 판 | SDK · CLI 0.6.0 · protocol 2 그대로 | 명령 · 칸을 더했을 뿐 |
| sample CI(사용자) | 매트릭스에 6000.0 StandaloneOSX · input 1(Input System 1.11.2)을 더한다 | PC 의 Input System Mouse 길(손가락 비춤 · `mouse-move` · `scroll` · Mouse 단추)을 이 맥에서 `open --pc` 로 실측한다 |
| 뺀 것 | `wait: false` · 키를 UI Toolkit 요소에(글자는 `type`) · 옛 Input 조이스틱 축(type 2 — AltTester 도 안 함) · 진짜 입력 끄기 · 자이로 · UI Toolkit 요소에 `pointer` · `touch-move` 의 시간(AltTester 도 한 번에) | 쓸 일이 생기면 더한다 |

### conform C 줄

| 줄 | 보내는 것 → 기대 |
|---|---|
| C click count | `click LoginButton {count: 2}` → StatusText 끝 번호가 누르기 전보다 2 큼 |
| C 손가락 둘 | `touchDown('StatusText')` · `touchDown('TouchText')` → 번호 둘이 다름 · InputText 「fingers 2」 → `touchUp` 둘 → 「fingers 0」(Input System 탐침은 Touchscreen 누른 손가락 + Mouse 왼 단추를 센다) |
| C down · move · up 끌기 | Item 의 칸 k → `touchDown('Item')` · `touchMove(f, Slot[다른 칸])` · `touchUp(f)` → Item 이 그 칸 |
| C drag via · duration | `drag Item {via: [Slot[a]], to: Slot[b], duration: 0.5}` → Item 이 Slot[b] · 0.5초 넘게 걸림 |
| C swipe | ScrollList 가운데에서 300 픽셀 `swipe` → `ScrollRect.verticalNormalizedPosition` 이 바뀜 — 0.5 보다 크면 위로 밀어 줄고, 아니면 아래로 밀어 는다(다시 돌려도 움직일 쪽이 있다) |
| C hold | `hold HoldBox {duration: 1}` → PointerText 「up 1.0」 이상 · 1초 넘게 걸림 |
| C mouse-move hover | `mouseMove('HoldBox')` → PointerText 「enter」 → `mouseMove('StatusText')` → 「exit」 |
| C scroll | `scroll(∓10, {at: 'ScrollList'})` → `verticalNormalizedPosition` 이 바뀜 — 방향은 swipe 줄과 같은 규칙(0.5 보다 크면 −10 아래로) |
| C pointer | `pointer HoldBox enter · down · up · exit` → PointerText 가 차례로 「enter」 · 「down」 · 「up …」 · 「exit」 |
| C key-down 여럿 | `keyDown('A+LeftShift')` → InputText 「keys A LeftShift」 → `keyUp('A+LeftShift')` → 「keys -」 |
| C key duration | `key I {duration: 0.5}` → TouchText 「key I」 · 0.5초 넘게 걸림 |
| C 축 · 조이스틱 | `keyDown('RightArrow+JoystickButton16', {power: 1})` → 「axis 1」 · `keyDown('LeftControl+JoystickButton0')` → 「fire 1」 → `keyUp` 둘 → 「axis 0」 · 「fire 0」(옛 Input 은 InputManager 기본 축 Horizontal · Fire1, Input System 은 Gamepad 왼 스틱 · A) |
| C tilt | `tilt([0, v, 0])`(v 는 판마다 20~49) → InputText 「tilt v」 |
| C input-reset | `touchDown` · `keyDown('W')` → `resetInput()` → 「fingers 0」 · 「keys -」 |
| C UI Toolkit 직접 | `scene-load Second` → `click SecondButton` → SecondText 「second 1」 · `mouseMove('SecondButton')` → 「enter」 · `scroll(-10, {at: 'SecondScroll'})` → `SecondScroll` 의 `scrollOffset` y 가 0 보다 큼 → `scene-load Sample`(실패해도 돌아온다) |

## 파일 지도

| 파일 | 하는 일 | Task |
|---|---|---|
| `protocol/commands.json` | 명령 12개 · 바뀐 칸 | 1 |
| `src/game.ts` | Game 메서드 · `At` · 옛 SDK 거절 | 2 |
| `src/fake-game.ts` | 가짜 SDK 의 새 명령 · 표준 화면 C 칸 | 2 |
| `src/conform.ts` · `src/conform.test.ts` | C 줄 15개 · 줄 수 | 3 |
| `src/cli.ts` · `src/cli.test.ts` | CLI 명령 · 칸 · Ran 줄 | 4 |
| `src/mcp.test.ts` | 새 도구 · 숫자 칸 | 1 |
| `sdk/unity/Runtime/FakeInput.cs`(+ .meta, 새) | 일(iterator) 돌리기 · 탭 · 끌기 · 길게 · 키 · 마우스 · 바퀴 · 기울기 · 거둠 | 5 |
| `sdk/unity/Runtime/FakeTouches.cs` | 드라이버 · 손가락 칸 10개 · phase · `FakeBaseInput`(터치 · 마우스) | 5 |
| `sdk/unity/Runtime/FakeKeys.cs` | 누른 키 · 세기 · 이번 프레임 누름/뗌 · 축 표 | 6 |
| `sdk/unity/Runtime/FakeMouse.cs`(+ .meta, 새) | 가짜 마우스 자리 · 이동량 · 바퀴 | 5 |
| `sdk/unity/Runtime/FakeInputSystem.cs` | Touchscreen 손가락마다 · Mouse 한 상태 · Keyboard 여러 키 · Gamepad · Accelerometer | 7 |
| `sdk/unity/Runtime/UiToolkit.cs` | 손가락마다 panel · 마우스 Pointer · Wheel | 7 |
| `sdk/unity/Input/Input.cs` | 마우스 · 바퀴 · `GetAxis*` · `GetButton*` · `acceleration` · `anyKey` | 6 |
| `sdk/unity/Runtime/ControlServer.cs` · `sdk/unity/package.json` · `package.json` | 명령 갈래 · 칸 · Caps · 0.6.0 | 5 |
| `sdk/unity/Id/ControlCliAxes.cs`(+ .meta, 새) | 축 표 컴포넌트 · static 표 | 6 |
| `sdk/unity/Editor/BakeAxes.cs`(+ .meta, 새) | InputManager 축을 장면에 굽는 빌드 훅 | 6 |
| `sample/Assets/Sample/InputProbe.cs` · `PointerBox.cs`(+ .meta, 새) · `SampleScreen.cs` · `SampleUitk.cs` | InputText · HoldBox · PointerText · ScrollList · Second 의 UI Toolkit 칸 | 8 |
| `.github/workflows/sample.yml` | 6000.0 StandaloneOSX input 1 | 8 |
| `README.md` · `docs/roadmap/plan.md` | 명령 표 · AltTester 표 | 9 |
| `docs/roadmap/*` | 결과 · 다음 세션 · kit 다음 줄 | 10 |
