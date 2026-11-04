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
| 표준 화면 | SampleCanvas 에 `InputText`(입력 탐침 — 「fingers N · keys … · axis x · fire 0/1 · tilt y」, 바뀔 때만 씀) · `HoldBox`(uGUI 칸 — Pointer Down/Up/Enter/Exit 을 `PointerText` 에 「last enter · held 1.0」 꼴로 — 마지막 이벤트와 누른 초) · `ScrollList`(세로 ScrollRect, `scrollSensitivity` 30). `Second` 장면을 한 장면으로 열면 EventSystem 없는 UI Toolkit 칸 `SecondPanel`(`SecondButton` → `SecondText` 「second N」 · 마우스가 들어오면 「enter」 · `SecondScroll` ScrollView) | 탐침 하나가 옛 Input · Input System 을 같은 글자로 보인다. 기울기는 진짜 값이 늘 흔들려 절댓값 10 넘는 값만 「tilt 37」로 남긴다(conform 은 판마다 다른 값). UI Toolkit 직접 길은 EventSystem 이 없어야 돌아 `Second` 를 한 장면으로 열 때만 만든다(더해 열면 Sample 의 EventSystem 이 있다) |
| conform C 줄 | 15줄(`C ` 로 시작) — B 줄 뒤 · A 장면 줄 앞, UI Toolkit 직접 줄만 A 장면 줄 뒤(Second 를 한 장면으로 연 뒤 Sample 로 돌아온다). 48줄 | 아래 「conform C 줄」 |
| Game 메서드(kit 이름) | `touchDown(at)` → 번호 · `touchMove(finger, at)` · `touchUp(finger)` · `swipe(points, {duration})` · `hold(at, {duration})` · `mouseMove(at, {duration})` · `scroll(dy, {dx, at, duration})` · `keyDown(keys, {power})` · `keyUp(keys)` · `tilt([x, y, z], {duration})` · `pointer(target, event)` · `resetInput()` + `click` · `tap` · `drag` · `key` 의 옵션(`count` · `interval` · `via` · `duration` · `power`). `at` 은 주소 글자 또는 `{x, y}`, 시간은 초 | kit 에 같은 이름 · 같은 인자 꼴. 시간은 AltTester · commands.json 과 같은 초(기다림 한도 `timeoutMs` 와는 다른 뜻) |
| CLI | `touch-down <ref\|주소> \| <x> <y>` · `touch-move <번호> <ref\|주소> \| <x> <y>` · `touch-up <번호>` · `swipe <x,y> <x,y>…` · `hold` · `mouse-move` · `scroll [ref\|주소] <dy>` · `key-down` · `key-up` · `tilt <x> <y> <z>` · `pointer <ref\|주소> <down\|up\|enter\|exit>` · `input-reset`, 칸 `--duration <초>` · `--count` · `--interval <초>` · `--via <주소>`(여럿) · `--power` · `--dx`. 인자 둘이 다 수면 좌표 | 지금 `tap <x> <y>` 와 같은 읽기 |
| 판 | SDK · CLI 0.6.0 · protocol 2 그대로 | 명령 · 칸을 더했을 뿐 |
| sample CI(사용자) | 매트릭스에 6000.0 StandaloneOSX · input 1(Input System 1.11.2)을 더한다 | PC 의 Input System Mouse 길(손가락 비춤 · `mouse-move` · `scroll` · Mouse 단추)을 이 맥에서 `open --pc` 로 실측한다 |
| 뺀 것 | `wait: false` · 키를 UI Toolkit 요소에(글자는 `type`) · 옛 Input 조이스틱 축(type 2 — AltTester 도 안 함) · 진짜 입력 끄기 · 자이로 · UI Toolkit 요소에 `pointer` · `touch-move` 의 시간(AltTester 도 한 번에) | 쓸 일이 생기면 더한다 |

### conform C 줄

| 줄 | 보내는 것 → 기대 |
|---|---|
| C click count | `click LoginButton` 한 번 → 끝 번호 n → `click LoginButton {count: 2}` → 끝 번호 n+2 |
| C 손가락 둘 | `touchDown('StatusText')` · `touchDown('TouchText')` → 번호 둘이 다름 · InputText 「fingers 2」 → `touchUp` 둘 → 「fingers 0」(Input System 탐침은 Touchscreen 누른 손가락 + PC 의 Mouse 왼 단추를 센다) |
| C down · move · up 끌기 | Item 이 든 칸 k → `touchDown('Item')` · `touchMove(f, Slot[k+1])` · `touchUp(f)` → Item 이 그 칸 |
| C drag via · duration | `drag('Item', Slot[k+2], {via: [Slot[k+1]], duration: 0.5})` → Item 이 Slot[k+2] · 0.5초 넘게 걸림 |
| C swipe | ScrollList 가운데 위아래 150 픽셀을 잇는 `swipe`(0.3초) → `ScrollRect.verticalNormalizedPosition` 이 바뀜 — 0.5 보다 크면 위로 밀어 줄고, 아니면 아래로 밀어 는다(다시 돌려도 움직일 쪽이 있다) |
| C pointer | `pointer HoldBox enter · down · up · exit` → PointerText 의 last 가 차례로 enter · down · up · exit |
| C hold | `hold HoldBox {duration: 1}` → PointerText 의 held 가 0.95 이상(바로 앞 pointer 줄이 held 를 0 근처로 새로 둔다) |
| C mouse-move hover | `mouseMove('HoldBox')` → last enter → `mouseMove('StatusText')` → last exit |
| C scroll | `scroll(∓10, {at: 'ScrollList'})` → `verticalNormalizedPosition` 이 바뀜 — 0.5 보다 크면 −10(아래로 — 준다), 아니면 +10 |
| C key-down 여럿 | `keyDown('A+LeftShift')` → InputText keys 「A LeftShift」 → `keyUp('A+LeftShift')` → keys 「-」 |
| C key duration | TouchText 를 `-` 로 비우고 `key('I', {duration: 0.5})` → 0.5초 넘게 걸림 · TouchText 「key I」 |
| C 축 · 조이스틱 | `keyDown('RightArrow+JoystickButton16', {power: 1})` → axis 1 · `keyDown('LeftControl+JoystickButton0')` → fire 1 → `keyUp` 넷 → axis 0 · fire 0(옛 Input 은 InputManager 기본 축 Horizontal · Fire1, Input System 은 Gamepad 왼 스틱 x · A) |
| C tilt | `tilt([0, v, 0])`(v 는 판마다 20~49) → InputText tilt v |
| C input-reset | `touchDown('StatusText')` · `keyDown('W')` → fingers 1 · keys W → `resetInput()` → fingers 0 · keys - |
| C UI Toolkit 직접 | (A 장면 줄 뒤) `scene-load Second` → `click SecondButton` → SecondText 「second 1」 · `mouseMove('SecondButton')` → 「enter」 · `scroll(-10, {at: 'SecondScroll'})` → `SecondScroll` 의 `scrollOffset` y 가 0 보다 큼 → (실패해도) `resetInput` · `scene-load Sample` |

InputText 꼴은 `fingers N · keys A LeftShift W(누른 것만, 없으면 -) · axis 정수 · fire 0|1 · tilt 정수|-`, PointerText 꼴은 `last down|up|enter|exit|- · held 초(소수 한 자리)|-` — 줄은 ` · ` 로 나눈 마디를 이름으로 읽는다. C 줄의 `cmds` 에는 쓰는 명령과 함께 `touch-down` 을 넣는다 — 바뀐 칸(`count` · `duration` …)을 못 읽는 옛 SDK 에서 실패 대신 건너뛴다.

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
| `sdk/unity/Runtime/FakeKeys.cs` | 누른 키 · 세기 · 이번 프레임 누름/뗌(5) · 축 표 읽기(6) | 5 · 6 |
| `sdk/unity/Runtime/FakeMouse.cs`(+ .meta, 새) | 가짜 마우스 자리 · 이동량 · 바퀴 | 5 |
| `sdk/unity/Runtime/FakeInputSystem.cs` | Touchscreen 손가락마다 · Mouse 한 상태 · Keyboard 여러 키 · Gamepad · Accelerometer | 5 |
| `sdk/unity/Runtime/UiToolkit.cs` | 손가락마다 panel · 마우스 Pointer · Wheel | 5 |
| `sdk/unity/Input/Input.cs` | 마우스 · 바퀴 · `acceleration` · `anyKeyDown`(5) · `GetAxis*` · `GetButton*`(6) | 5 · 6 |
| `sdk/unity/Runtime/ControlServer.cs` | 지금 명령을 일로(5) · 새 명령 · 칸(7) | 5 · 7 |
| `sdk/unity/package.json` · `package.json` | 0.6.0 | 7 |
| `sdk/unity/Id/ControlCliAxes.cs`(+ .meta, 새) | 축 표 컴포넌트 · static 표 | 6 |
| `sdk/unity/Editor/BakeAxes.cs`(+ .meta, 새) | InputManager 축을 장면에 굽는 빌드 훅 | 6 |
| `sample/Assets/Sample/InputProbe.cs` · `PointerBox.cs`(+ .meta, 새) · `SampleScreen.cs` · `SampleUitk.cs` | InputText · HoldBox · PointerText · ScrollList · Second 의 UI Toolkit 칸 | 8 |
| `.github/workflows/sample.yml` | 6000.0 StandaloneOSX input 1 | 8 |
| `README.md` · `docs/roadmap/plan.md` | 명령 표 · AltTester 표 | 9 |
| `docs/roadmap/*` | 결과 · 다음 세션 · kit 다음 줄 | 10 |

---

### Task 1: 명령 정의 — commands.json · MCP 꼴

**Files:** Modify `protocol/commands.json` · `src/mcp.test.ts` · `sdk/unity/Runtime/ControlServer.cs`(Caps 만)

- [ ] **Step 1: 실패하는 테스트** — `src/mcp.test.ts` 「open 전에는 …」 테스트(`call('tap', { x: '10', y: 10 })` 단언 다음 줄)에

```ts
  assert.match((await call('touch-move', { x: 1, y: 1 })).content[0].text!, /^touch-move 에 finger 칸이 필요합니다/);
  assert.match((await call('swipe', { points: '1,1 2,2' })).content[0].text!, /^swipe 의 points 는 글자 배열이어야 합니다/);
  assert.match((await call('pointer', { target: 'HoldBox', event: 'press' })).content[0].text!, /^pointer 의 event 는 down · up · enter · exit 중 하나여야 합니다/);
```

- [ ] **Step 2: 실패 확인** — `npm run -s build && node --test dist/mcp.test.js dist/protocol.test.js` → mcp 새 단언 셋 실패(모르는 도구), protocol 은 통과
- [ ] **Step 3: 구현**
  - `protocol/commands.json` — `click` · `drag` · `tap` · `key` 를 아래로 바꾸고, 끝(`text-set` 뒤)에 명령 12개를 이 차례로 더한다

```json
{
  "name": "click",
  "summary": "가운데를 가짜 터치로 누른다 — 게임이 처리한 뒤 답한다",
  "args": {
    "target": { "type": "string", "required": true, "summary": "주소 — 이름(하나뿐일 때) · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자" },
    "camera": { "type": "string", "required": false, "summary": "월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)" },
    "count": { "type": "number", "required": false, "summary": "누르는 횟수(기본 1) — 2 면 두 번 누르기" },
    "interval": { "type": "number", "required": false, "summary": "누르기 사이 초(기본 0.1)" }
  }
},
{
  "name": "drag",
  "summary": "앞 자리에서 via 를 차례로 지나 뒤 자리로 끈다 — 마디마다 적어도 10프레임",
  "args": {
    "target": { "type": "string", "required": true, "summary": "끌 오브젝트 주소" },
    "to": { "type": "string", "required": true, "summary": "놓을 자리 주소" },
    "camera": { "type": "string", "required": false, "summary": "월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)" },
    "via": { "type": "array", "required": false, "summary": "사이에 지날 자리 주소들" },
    "duration": { "type": "number", "required": false, "summary": "처음부터 끝까지 걸리는 초(0~8, 기본 0 — 마디마다 10프레임)" }
  }
},
{
  "name": "tap",
  "summary": "좌표를 누른다(왼쪽 아래가 0,0) — 살펴볼 때만",
  "args": {
    "x": { "type": "number", "required": true, "summary": "가로 픽셀" },
    "y": { "type": "number", "required": true, "summary": "세로 픽셀" },
    "count": { "type": "number", "required": false, "summary": "누르는 횟수(기본 1)" },
    "interval": { "type": "number", "required": false, "summary": "누르기 사이 초(기본 0.1)" }
  }
},
{
  "name": "key",
  "summary": "키 누르기 — duration 동안(기본 한 프레임) 누르고 뗀다. A+LeftShift 처럼 + 로 여럿을 함께",
  "args": {
    "key": { "type": "string", "required": true, "summary": "KeyCode 이름 — Escape · Space · Return · I · Alpha1 · Mouse0 · JoystickButton0, 여럿은 A+LeftShift" },
    "duration": { "type": "number", "required": false, "summary": "누르고 있는 초(0~8, 기본 0 — 한 프레임)" },
    "power": { "type": "number", "required": false, "summary": "세기 -1~1(기본 1) — GetAxis 값 · JoystickButton16~19 는 스틱 값" }
  }
}
```

```json
{
  "name": "touch-down",
  "summary": "손가락 하나를 눌러 둔다 — 답의 finger(10~19)로 touch-move · touch-up",
  "args": {
    "target": { "type": "string", "required": false, "summary": "누를 오브젝트 주소 — 없으면 x · y" },
    "x": { "type": "number", "required": false, "summary": "가로 픽셀(왼쪽 0) — target 이 없을 때" },
    "y": { "type": "number", "required": false, "summary": "세로 픽셀(아래 0) — target 이 없을 때" },
    "camera": { "type": "string", "required": false, "summary": "월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)" }
  }
},
{
  "name": "touch-move",
  "summary": "눌러 둔 손가락을 옮긴다(한 프레임에)",
  "args": {
    "finger": { "type": "number", "required": true, "summary": "touch-down 이 준 번호" },
    "target": { "type": "string", "required": false, "summary": "옮길 자리 오브젝트 주소 — 없으면 x · y" },
    "x": { "type": "number", "required": false, "summary": "가로 픽셀 — target 이 없을 때" },
    "y": { "type": "number", "required": false, "summary": "세로 픽셀 — target 이 없을 때" },
    "camera": { "type": "string", "required": false, "summary": "월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)" }
  }
},
{
  "name": "touch-up",
  "summary": "눌러 둔 손가락을 뗀다",
  "args": { "finger": { "type": "number", "required": true, "summary": "touch-down 이 준 번호" } }
},
{
  "name": "swipe",
  "summary": "좌표로 끌기 — 한 손가락이 points 를 차례로 지난다(살펴볼 때 · 케이스는 drag)",
  "args": {
    "points": { "type": "array", "required": true, "summary": "\"x,y\" 글자 둘 이상 — [\"540,400\", \"540,900\"]" },
    "duration": { "type": "number", "required": false, "summary": "처음부터 끝까지 걸리는 초(0~8, 기본 0 — 마디마다 10프레임)" }
  }
},
{
  "name": "hold",
  "summary": "길게 누르기 — duration 초 눌렀다 뗀다",
  "args": {
    "target": { "type": "string", "required": false, "summary": "누를 오브젝트 주소 — 없으면 x · y" },
    "x": { "type": "number", "required": false, "summary": "가로 픽셀 — target 이 없을 때" },
    "y": { "type": "number", "required": false, "summary": "세로 픽셀 — target 이 없을 때" },
    "camera": { "type": "string", "required": false, "summary": "월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)" },
    "duration": { "type": "number", "required": false, "summary": "누르고 있는 초(0~8, 기본 1)" }
  }
},
{
  "name": "mouse-move",
  "summary": "가짜 마우스를 옮긴다 — hover(Pointer Enter/Exit). 단추는 key Mouse0~4, 끄기는 input-reset",
  "args": {
    "target": { "type": "string", "required": false, "summary": "옮길 자리 오브젝트 주소 — 없으면 x · y" },
    "x": { "type": "number", "required": false, "summary": "가로 픽셀 — target 이 없을 때" },
    "y": { "type": "number", "required": false, "summary": "세로 픽셀 — target 이 없을 때" },
    "camera": { "type": "string", "required": false, "summary": "월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)" },
    "duration": { "type": "number", "required": false, "summary": "옮기는 초(0~8, 기본 0 — 한 번에)" }
  }
},
{
  "name": "scroll",
  "summary": "마우스 바퀴 — 자리를 주면 먼저 그리로 옮긴다(폰은 자리를 준다)",
  "args": {
    "dy": { "type": "number", "required": true, "summary": "세로 바퀴 칸(위가 +, 옛 Input mouseScrollDelta 꼴)" },
    "dx": { "type": "number", "required": false, "summary": "가로 바퀴 칸(오른쪽이 +)" },
    "target": { "type": "string", "required": false, "summary": "바퀴를 굴릴 오브젝트 주소 — 없으면 x · y, 둘 다 없으면 지금 마우스 자리" },
    "x": { "type": "number", "required": false, "summary": "가로 픽셀" },
    "y": { "type": "number", "required": false, "summary": "세로 픽셀" },
    "camera": { "type": "string", "required": false, "summary": "월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)" },
    "duration": { "type": "number", "required": false, "summary": "나눠 굴리는 초(0~8, 기본 0 — 한 프레임)" }
  }
},
{
  "name": "key-down",
  "summary": "키를 눌러 둔다 — key-up · input-reset 까지. A+LeftShift 처럼 여럿",
  "args": {
    "key": { "type": "string", "required": true, "summary": "KeyCode 이름 — 여럿은 A+LeftShift" },
    "power": { "type": "number", "required": false, "summary": "세기 -1~1(기본 1) — GetAxis 값 · JoystickButton16~19 는 스틱 값" }
  }
},
{
  "name": "key-up",
  "summary": "눌러 둔 키를 뗀다",
  "args": { "key": { "type": "string", "required": true, "summary": "KeyCode 이름 — 여럿은 A+LeftShift" } }
},
{
  "name": "tilt",
  "summary": "기울이기 — duration 동안 가속도(Input.acceleration · Accelerometer)를 대신한다",
  "args": {
    "x": { "type": "number", "required": true, "summary": "가속도 x(g)" },
    "y": { "type": "number", "required": true, "summary": "가속도 y(g)" },
    "z": { "type": "number", "required": true, "summary": "가속도 z(g)" },
    "duration": { "type": "number", "required": false, "summary": "대신하는 초(0~8, 기본 0 — 한 프레임)" }
  }
},
{
  "name": "pointer",
  "summary": "GameObject 하나에 Pointer 이벤트를 바로 보낸다(EventSystem 처리기 — 부모로 안 올린다)",
  "args": {
    "target": { "type": "string", "required": true, "summary": "GameObject 주소(UI Toolkit 요소는 안 된다)" },
    "event": { "type": "string", "required": true, "enum": ["down", "up", "enter", "exit"], "summary": "down · up · enter · exit" }
  }
},
{ "name": "input-reset", "summary": "가짜 입력을 다 거둔다 — 눌러 둔 손가락 · 키 · 가짜 마우스 · 기울기", "args": {} }
```

  - `ControlServer.cs` 의 `Caps` 끝에 `"touch-down", "touch-move", "touch-up", "swipe", "hold", "mouse-move", "scroll", "key-down", "key-up", "tilt", "pointer", "input-reset"`(SDK 구현은 Task 7 — protocol.test 가 차례를 본다)

- [ ] **Step 4: 통과 확인** — 같은 명령, 통과
- [ ] **Step 5: 커밋** — `git commit -m "명령 정의 — P2-C 손가락 · swipe · hold · 마우스 · 바퀴 · 키 누름/뗌 · 기울기 · pointer · input-reset, 횟수 · 시간 · 세기 칸"`

### Task 2: Game 메서드 · 가짜 SDK

**Files:** Modify `src/game.ts` · `src/fake-game.ts` · `src/conform.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `src/conform.test.ts` 끝에

```ts
test('C 줄 — 옛 SDK(caps 에 touch-down 없음)에 횟수 · 시간 · 세기 · 여러 키를 보내면 보내기 전에 거절한다', async () => {
  const g = standardScreen();
  g.caps = g.caps.filter((c) => c !== 'touch-down');
  const game = direct(g);
  await game.ping();
  await assert.rejects(game.click('LoginButton', { count: 2 }), /이 게임의 SDK 는 횟수 · 시간 · 세기 · 여러 키 · via 를 못 읽습니다 — SDK 0\.6\.0 이상/);
  await assert.rejects(game.key('I', { duration: 1 }), /SDK 0\.6\.0 이상/);
  await assert.rejects(game.key('A+LeftShift'), /SDK 0\.6\.0 이상/);
  await game.key('I');
  assert.deepEqual(g.commands.filter((c) => c.cmd === 'key').map((c) => c.key), ['I']);
});

test('C 줄 — 손가락은 비어 있는 가장 작은 번호(10~19)를 받고, 10개면 거절하고, input-reset 이 다 뗀다', async () => {
  const g = standardScreen();
  const game = direct(g);
  const fingers: number[] = [];
  for (let i = 0; i < 10; i++) fingers.push(await game.touchDown({ x: i, y: i }));
  assert.deepEqual(fingers, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  await assert.rejects(game.touchDown('StatusText'), /손가락 10개가 다 눌려 있습니다 — touch-up · input-reset 으로 뗍니다/);
  await game.touchUp(12);
  assert.equal(await game.touchDown('StatusText'), 12);
  await assert.rejects(game.touchMove(9, 'Item'), /손가락 9 은 눌려 있지 않습니다 — touch-down 이 준 번호를 씁니다/);
  await game.keyDown('W+A');
  assert.equal((await game.find('InputText'))?.text, 'fingers 10 · keys A W · axis -1 · fire 0 · tilt -');
  await game.resetInput();
  assert.equal((await game.find('InputText'))?.text, 'fingers 0 · keys - · axis 0 · fire 0 · tilt -');
  assert.equal(await game.touchDown('Item'), 10);
});

test('C 줄 — 8초 넘는 입력 · 자리 없는 한 점 명령 · 틀린 점 · UI Toolkit pointer 는 SDK 처럼 거절한다', async () => {
  const game = direct(standardScreen());
  await assert.rejects(game.hold('HoldBox', { duration: 9 }), /hold 은 8초 안이어야 합니다 — 더 길게는 touch-down · key-down 뒤 touch-up · key-up/);
  await assert.rejects(game.click('LoginButton', { count: 50, interval: 0.2 }), /click 은 8초 안이어야 합니다/);
  await assert.rejects(game.call({ cmd: 'touch-down' }), /touch-down 에 target 또는 x · y 가 필요합니다/);
  await assert.rejects(game.swipe([{ x: 1, y: 1 }]), /swipe 의 points 는 "x,y" 글자 둘 이상입니다/);
  await assert.rejects(game.pointer('UitkLoginButton', 'down'), /UitkLoginButton 은 UI Toolkit 요소라 pointer 를 못 보냅니다 — mouse-move · touch-down 으로/);
});
```

- [ ] **Step 2: 실패 확인** — `npm run -s build` 가 타입 오류(`touchDown` · `count` 가 없다)로 멈춘다
- [ ] **Step 3: `src/game.ts`**
  - `PrefType` 아래에 꼴 셋

```ts
/** 누를 자리 — 주소 글자 또는 화면 좌표(왼쪽 아래 0,0 — 살펴볼 때만) */
export type At = string | { x: number; y: number };

/** pointer 가 보내는 Pointer 이벤트 */
export type PointerAction = 'down' | 'up' | 'enter' | 'exit';

/** 탭 · 클릭 — 횟수와 사이 초 */
export interface PressOptions {
  count?: number;
  interval?: number;
}
```

  - `newer` 아래에 옛 SDK 거르기 · 자리 · 준 칸만 싣기

```ts
// 횟수 · 시간 · 세기 · via · 여러 키(A+LeftShift)는 SDK 0.6.0(touch-down 과 같은 판)부터. 옛 SDK 는 모르는 칸을 버리고 한 번만 눌러 통과한 척한다.
const INPUT = ['count', 'interval', 'via', 'duration', 'power'];
const timed = (c: Command) => INPUT.some((k) => c[k] !== undefined) || (typeof c.key === 'string' && c.key.includes('+'));
const at = (a: At) => (typeof a === 'string' ? { target: a } : { x: a.x, y: a.y });
// 준 칸만 싣는다 — 옛 명령 꼴이 그대로 남는다.
const given = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
```

  - `call()` 의 선택자 거절 줄 다음에

```ts
    if (this.caps && !this.caps.includes('touch-down') && timed(command)) throw new Error('이 게임의 SDK 는 횟수 · 시간 · 세기 · 여러 키 · via 를 못 읽습니다 — SDK 0.6.0 이상으로 올립니다');
```

  - `click` · `drag` 를 바꾼다

```ts
  async click(target: string, o: { camera?: string } & PressOptions = {}): Promise<void> {
    await this.call({ cmd: 'click', target, ...extra(o), ...given({ count: o.count, interval: o.interval }) });
  }

  /** via 는 사이에 지날 자리 주소들, duration 은 처음부터 끝까지의 초 */
  async drag(target: string, to: string, o: { camera?: string; via?: string[]; duration?: number } = {}): Promise<void> {
    await this.call({ cmd: 'drag', target, to, ...extra(o), ...given({ via: o.via?.length ? o.via : undefined, duration: o.duration }) });
  }
```

  - `tap` · `key` 를 바꾸고, `key` 다음에 새 메서드

```ts
  /** 좌표 누르기(왼쪽 아래가 0,0) — 살펴볼 때만. 케이스는 좌표를 쓰지 않는다 */
  async tap(x: number, y: number, o: PressOptions = {}): Promise<void> {
    await this.call({ cmd: 'tap', x, y, ...given({ count: o.count, interval: o.interval }) });
  }

  /** 키 누르기 — KeyCode 이름(Escape · Space · Return · I · Alpha1 · F1 · Mouse0), A+LeftShift 는 함께. duration 동안(기본 한 프레임). Escape 는 폰 뒤로 키와 같다 */
  async key(name: string, o: { duration?: number; power?: number } = {}): Promise<void> {
    await this.call({ cmd: 'key', key: name, ...given({ duration: o.duration, power: o.power }) });
  }

  /** 손가락을 눌러 둔다 — 돌려준 번호(10~19)로 touchMove · touchUp */
  async touchDown(a: At, o: { camera?: string } = {}): Promise<number> {
    return (await this.call({ cmd: 'touch-down', ...at(a), ...extra(o) })).finger as number;
  }

  async touchMove(finger: number, a: At, o: { camera?: string } = {}): Promise<void> {
    await this.call({ cmd: 'touch-move', finger, ...at(a), ...extra(o) });
  }

  async touchUp(finger: number): Promise<void> {
    await this.call({ cmd: 'touch-up', finger });
  }

  /** 좌표로 끌기 — 한 손가락이 점을 차례로 지난다(살펴볼 때만 — 케이스는 drag) */
  async swipe(points: { x: number; y: number }[], o: { duration?: number } = {}): Promise<void> {
    await this.call({ cmd: 'swipe', points: points.map((p) => `${p.x},${p.y}`), ...given({ duration: o.duration }) });
  }

  /** 길게 누르기 — duration 초(기본 1) */
  async hold(a: At, o: { duration?: number; camera?: string } = {}): Promise<void> {
    await this.call({ cmd: 'hold', ...at(a), ...extra(o), ...given({ duration: o.duration }) });
  }

  /** 가짜 마우스를 옮긴다 — hover. 끄기는 resetInput */
  async mouseMove(a: At, o: { duration?: number; camera?: string } = {}): Promise<void> {
    await this.call({ cmd: 'mouse-move', ...at(a), ...extra(o), ...given({ duration: o.duration }) });
  }

  /** 마우스 바퀴 — dy 는 바퀴 칸(위가 +). at 을 주면 먼저 그리로 옮긴다(폰은 준다) */
  async scroll(dy: number, o: { dx?: number; at?: At; duration?: number; camera?: string } = {}): Promise<void> {
    await this.call({ cmd: 'scroll', dy, ...(o.at === undefined ? {} : at(o.at)), ...extra(o), ...given({ dx: o.dx, duration: o.duration }) });
  }

  /** 키를 눌러 둔다 — A+LeftShift 는 함께. power 는 GetAxis 값 · JoystickButton16~19 의 스틱 값 */
  async keyDown(keys: string, o: { power?: number } = {}): Promise<void> {
    await this.call({ cmd: 'key-down', key: keys, ...given({ power: o.power }) });
  }

  async keyUp(keys: string): Promise<void> {
    await this.call({ cmd: 'key-up', key: keys });
  }

  /** 기울이기 — 가속도(g)를 duration 동안(기본 한 프레임) 대신한다 */
  async tilt(acceleration: [number, number, number], o: { duration?: number } = {}): Promise<void> {
    const [x, y, z] = acceleration;
    await this.call({ cmd: 'tilt', x, y, z, ...given({ duration: o.duration }) });
  }

  /** GameObject 하나에 Pointer 이벤트를 바로 보낸다 */
  async pointer(target: string, event: PointerAction): Promise<void> {
    await this.call({ cmd: 'pointer', target, event });
  }

  /** 가짜 입력을 다 거둔다 — 눌러 둔 손가락 · 키 · 가짜 마우스 · 기울기 */
  async resetInput(): Promise<void> {
    await this.call({ cmd: 'input-reset' });
  }
```

- [ ] **Step 4: `src/fake-game.ts`** — 가짜 SDK
  - import 를 `import type { Node, PointerAction } from './game.js';` 로
  - `FakeNode` 끝에

```ts
  /** touch · hold · mouse-move · pointer 가 부르는 Pointer 이벤트 — up 은 누른 초 */
  onPointer?: (event: PointerAction, seconds?: number) => void;
  /** 바퀴 · swipe — dy 는 바퀴 칸(위가 +, 손가락을 위로 밀면 −) */
  onScroll?: (dy: number) => void;
```

  - `button` 아래에

```ts
// SDK 처럼 입력 명령 하나는 8초 안 — SDK 답 한도 10초 · 팜 15초
const tooLong = (c: Command) => Math.max(Number(c.duration ?? 0), 0) + Math.max(Number(c.count ?? 1) - 1, 0) * Number(c.interval ?? 0.1) > 8;
const FINGERS = Array.from({ length: 10 }, (_, i) => 10 + i);
const keysOf = (c: Command) => String(c.key).split('+');
```

  - `FakeGame` 칸 — `sceneRoots` 의 꼴을 `Record<string, (add: boolean) => FakeNode[]>` 로(주석 「장면 이름 → 그 장면을 열 때 만드는 뿌리(add 는 더해 열기)…」), `onGet` 아래에

```ts
  /** 눌러 둔 손가락 — 번호 → 누른 것 · 지금 위에 있는 것(touch-up 때 끌기 흉내) */
  fingers = new Map<number, { node?: FakeNode; over?: FakeNode }>();
  /** 눌러 둔 키 → 세기 */
  held = new Map<string, number>();
  /** 가짜 마우스가 올라간 것 */
  hovered?: FakeNode;
  /** tilt 의 y — 표준 화면 탐침처럼 절댓값 10 넘는 값만 남긴다 */
  tilted?: number;
  /** 입력 명령마다 — 표준 화면이 InputText 를 다시 쓴다 */
  onInput?: () => void;
```

  - `cameraProblem` 아래에 도우미 넷

```ts
  // 좌표의 맨 위 — find-at 과 같은 맞춤(가짜 자리는 점 하나)
  private hit(x: unknown, y: unknown, camera?: string): FakeNode[] | undefined {
    return select(steps('//*'), this.view(false)).trails.find((t) => {
      const n = t[t.length - 1];
      const at = camera ? n.atBy?.[camera] : n.at;
      return at?.[0] === x && at?.[1] === y;
    });
  }

  // 한 점 명령의 자리 — SDK 처럼 target 이 있으면 그 오브젝트, 없으면 x · y
  private point(c: Command, f: { node?: FakeNode }): { node?: FakeNode; x: number; y: number } | { error: string } {
    if (typeof c.target === 'string') {
      if (!f.node) return { error: `켜진 오브젝트 중에 ${c.target} 이 없습니다` };
      const [x, y] = f.node.at ?? [1, 1];
      return { node: f.node, x, y };
    }
    if (typeof c.x !== 'number' || typeof c.y !== 'number') return { error: `${c.cmd} 에 target 또는 x · y 가 필요합니다` };
    const hit = this.hit(c.x, c.y);
    return { node: hit?.[hit.length - 1], x: c.x, y: c.y };
  }

  // drag · touch-up — 움직일 수 있으면 놓은 자리의 자식으로(샘플 Bag/Slot 의 Item)
  private move(node: FakeNode, to: FakeNode): void {
    if (!node.movable) return;
    const parent = this.parentOf(node);
    if (parent) parent.children = parent.children!.filter((x) => x !== node);
    else this.roots = this.roots.filter((x) => x !== node);
    (to.children ??= []).push(node);
  }

  // 가짜 마우스 — 올라간 것이 바뀌면 exit · enter
  private hover(node?: FakeNode): void {
    if (node === this.hovered) return;
    this.hovered?.onPointer?.('exit');
    node?.onPointer?.('enter');
    this.hovered = node;
  }
```

  - `handle()` 의 `camera` 확인 다음 줄에

```ts
    if (tooLong(c)) return { ok: false, error: `${c.cmd} 은 8초 안이어야 합니다 — 더 길게는 touch-down · key-down 뒤 touch-up · key-up` };
```

  - `find-at` 은 `const hit = this.hit(c.x, c.y, c.camera as string | undefined);` 로, `scene-load` 의 `make()` 는 `make(c.mode === 'add')` 로
  - `click` · `drag` · `key` 갈래를 바꾸고 `key` 다음에 새 갈래를 더한다

```ts
      case 'click':
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        this.clicks.push(f.path!);
        for (let i = 0; i < Number(c.count ?? 1); i++) f.node.onClick?.();
        return { ok: true, x: 1, y: 1 };
      case 'drag': {
        const to = this.find(c.to as string);
        if (!f.node || !to.node || ((c.via as string[] | undefined) ?? []).some((v) => !this.find(v).node)) return { ok: false, error: '없음' };
        this.move(f.node, to.node);
        return { ok: true, x: 1, y: 1 };
      }
```

```ts
      case 'key':
        for (const k of keysOf(c)) {
          this.keys.push(k);
          this.onKey?.(k);
          // SDK 처럼 Escape 는 뒤로 키와 같다.
          if (k === 'Escape') this.onBack?.();
        }
        return { ok: true, key: c.key };
      case 'touch-down': {
        const p = this.point(c, f);
        if ('error' in p) return { ok: false, error: p.error };
        const finger = FINGERS.find((n) => !this.fingers.has(n));
        if (finger === undefined) return { ok: false, error: '손가락 10개가 다 눌려 있습니다 — touch-up · input-reset 으로 뗍니다' };
        this.fingers.set(finger, { node: p.node });
        p.node?.onPointer?.('enter');
        p.node?.onPointer?.('down');
        this.onInput?.();
        return { ok: true, finger, x: p.x, y: p.y };
      }
      case 'touch-move':
      case 'touch-up': {
        const t = this.fingers.get(c.finger as number);
        if (!t) return { ok: false, error: `손가락 ${String(c.finger)} 은 눌려 있지 않습니다 — touch-down 이 준 번호를 씁니다` };
        if (c.cmd === 'touch-move') {
          const p = this.point(c, f);
          if ('error' in p) return { ok: false, error: p.error };
          t.over = p.node;
          return { ok: true, x: p.x, y: p.y };
        }
        if (t.node && t.over) this.move(t.node, t.over);
        t.node?.onPointer?.('up', 0);
        t.node?.onPointer?.('exit');
        this.fingers.delete(c.finger as number);
        this.onInput?.();
        return { ok: true };
      }
      case 'swipe': {
        const points = ((c.points as string[] | undefined) ?? []).map((s) => /^(-?[\d.]+),(-?[\d.]+)$/.exec(s));
        if (points.length < 2 || points.some((m) => !m)) return { ok: false, error: 'swipe 의 points 는 "x,y" 글자 둘 이상입니다 — ["540,400", "540,900"]' };
        const [a, b] = [points[0]!, points[points.length - 1]!].map((m) => [Number(m[1]), Number(m[2])]);
        // 가짜 자리는 점 하나라 첫 점과 끝 점의 가운데로 고른다 — 손가락을 위로 밀면 바퀴를 아래로 굴린 것과 같다.
        const hit = this.hit((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        hit?.[hit.length - 1].onScroll?.(-Math.sign(b[1] - a[1]));
        return { ok: true, x: b[0], y: b[1] };
      }
      case 'hold': {
        const p = this.point(c, f);
        if ('error' in p) return { ok: false, error: p.error };
        p.node?.onPointer?.('enter');
        p.node?.onPointer?.('down');
        p.node?.onPointer?.('up', Number(c.duration ?? 1));
        p.node?.onPointer?.('exit');
        return { ok: true, x: p.x, y: p.y };
      }
      case 'mouse-move': {
        const p = this.point(c, f);
        if ('error' in p) return { ok: false, error: p.error };
        this.hover(p.node);
        return { ok: true, x: p.x, y: p.y };
      }
      case 'scroll': {
        if (c.target !== undefined || c.x !== undefined) {
          const p = this.point(c, f);
          if ('error' in p) return { ok: false, error: p.error };
          this.hover(p.node);
        }
        this.hovered?.onScroll?.(c.dy as number);
        return { ok: true };
      }
      case 'key-down':
        for (const k of keysOf(c)) this.held.set(k, Number(c.power ?? 1));
        this.onInput?.();
        return { ok: true };
      case 'key-up':
        for (const k of keysOf(c)) this.held.delete(k);
        this.onInput?.();
        return { ok: true };
      case 'tilt':
        if (Math.abs(c.y as number) > 10) this.tilted = Math.round(c.y as number);
        this.onInput?.();
        return { ok: true };
      case 'pointer':
        if (!f.node) return { ok: false, error: `켜진 오브젝트 중에 ${c.target as string} 이 없습니다` };
        if (f.node.components?.some((t) => t.startsWith('UnityEngine.UIElements.'))) return { ok: false, error: `${c.target as string} 은 UI Toolkit 요소라 pointer 를 못 보냅니다 — mouse-move · touch-down 으로` };
        if (!['down', 'up', 'enter', 'exit'].includes(c.event as string)) return { ok: false, error: 'event 는 down · up · enter · exit 중 하나입니다' };
        f.node.onPointer?.(c.event as PointerAction, c.event === 'up' ? 0 : undefined);
        return { ok: true };
      case 'input-reset':
        this.fingers.clear();
        this.held.clear();
        this.hovered = undefined;
        this.onInput?.();
        return { ok: true };
```

  - 표준 화면 — `keyFilter` 아래에 탐침 글자

```ts
/** 표준 화면 InputText 흉내 — sample InputProbe 와 같은 꼴. 축은 옛 Input 기본 축(Horizontal — right · d 와 left · a)과 Input System 왼 스틱 x(JoystickButton16)를 함께 흉내 낸다 */
function inputLine(g: FakeGame): string {
  const has = (...k: string[]) => k.some((x) => g.held.has(x));
  const axis = has('RightArrow', 'D') ? 1 : has('LeftArrow', 'A') ? -1 : Math.round(g.held.get('JoystickButton16') ?? 0);
  const keys = ['A', 'LeftShift', 'W'].filter((k) => g.held.has(k)).join(' ') || '-';
  return `fingers ${g.fingers.size} · keys ${keys} · axis ${axis} · fire ${has('LeftControl', 'JoystickButton0') ? 1 : 0} · tilt ${g.tilted ?? '-'}`;
}
```

  `standardScreen` 의 `build` 안(`game.onKey = …` 다음)에 C 칸, 그리고 SampleCanvas 자식 목록 끝(`HiddenText` 뒤)에 `input, pointerText, holdBox, scrollList`

```ts
    // C — 입력 탐침 · Pointer 칸 · 세로 목록(sample InputProbe · PointerBox · ScrollList)
    const input = node('InputText', { text: inputLine(game) });
    game.onInput = () => (input.text = inputLine(game));
    const pointerText = node('PointerText', { text: 'last - · held -' });
    let last = '-';
    let held = '-';
    const holdBox = node('HoldBox', {
      at: [810, 900],
      components: ['UnityEngine.RectTransform', 'UnityEngine.UI.Image', 'Sample.PointerBox'],
      onPointer: (e, seconds) => {
        last = e;
        if (e === 'up') held = (seconds ?? 0).toFixed(1);
        pointerText.text = `last ${last} · held ${held}`;
      },
    });
    let scrolled = 1;
    const scrollList = node('ScrollList', {
      at: [810, 700],
      props: {
        get 'ScrollRect.verticalNormalizedPosition'() {
          return scrolled;
        },
      },
      onScroll: (dy) => (scrolled = Math.min(1, Math.max(0, scrolled + Math.sign(dy) * 0.3))),
    });
```

  `game.sceneRoots = …` 줄을 아래로 — `Second` 는 한 장면으로 열 때만 UI Toolkit 칸을 만든다

```ts
  // Second 를 한 장면으로 열면 EventSystem 없는 UI Toolkit 칸(sample SampleUitk.BuildSecond) — 더해 열면 Sample 의 EventSystem 이 있어 만들지 않는다.
  const second = (): FakeNode[] => {
    const text = node('SecondText', { text: '' });
    let presses = 0;
    let offset = 0;
    return [
      node('SecondDocument', {}, [
        node('SecondPanel', {}, [
          text,
          node('SecondButton', {
            kind: 'Button',
            interactable: true,
            text: 'Second',
            components: ['UnityEngine.UIElements.Button'],
            at: [540, 300],
            onClick: () => (text.text = `second ${++presses}`),
            onPointer: (e) => (e === 'enter' ? (text.text = 'enter') : undefined),
          }),
          node('SecondScroll', {
            components: ['UnityEngine.UIElements.ScrollView'],
            at: [540, 150],
            props: {
              get scrollOffset() {
                return [0, offset];
              },
            },
            onScroll: (dy) => (offset = Math.max(0, offset - dy * 18)),
          }),
        ]),
      ]),
    ];
  };
  // SecondSaved 는 장면에 저장된 오브젝트 흉내 — 영구 id 가 다시 열어도 같다. SecondMarker 는 실행 중에 만들어 열 때마다 새 id.
  game.sceneRoots = { Sample: build, Second: (add) => [node('SecondMarker'), node('SecondSaved', { id: 'saved-1' }), ...(add ? [] : second())] };
```

- [ ] **Step 5: 통과 확인** — `npm run -s build && node --test dist/conform.test.js` → 새 테스트 셋 통과(「33줄」 테스트들도 그대로 — C 줄은 Task 3)
- [ ] **Step 6: 커밋** — `git commit -m "Game 입력 메서드 — touchDown/Move/Up · swipe · hold · mouseMove · scroll · keyDown/Up · tilt · pointer · resetInput · 횟수 · 시간 칸, 가짜 SDK 와 표준 화면 C 칸"`

### Task 3: conform C 줄

**Files:** Modify `src/conform.ts` · `src/conform.test.ts` · `src/cli.test.ts`

- [ ] **Step 1: 실패하는 테스트**
  - `src/conform.test.ts` 줄 수 — 「표준 화면이면 33줄」 → 이름 `48줄` · `[48, 0, 0]`, 「옛 uGUI setter」 → `[45, 2, 1]`, 「다시 돌려도」 → `[44, 0, 4]`(장면 줄 둘 · B 영구 id · C UI Toolkit 직접이 scene-load 없음으로 건너뜀), 「안 먹으면」 → `[39, 5, 4]`(login · drag · C click count · C down/move/up · C drag via)이고 그 테스트의 drag 단언은 `Slot\[3\]` 으로(C 줄이 Item 을 옮겨 첫 판 끝에 Item 이 Slot[2] — 둘째 판 drag 줄은 Slot[3] 을 노린다), `assert.match(report(r), /✗ C click LoginButton count 2 → 끝 번호가 2 늚/);` 를 더한다, 「caps 에 find 가 없으면」 → `[16, 0, 32]`(C 줄 중 scroll 줄만 find 없이 돈다), 「A 줄 — 장면을 바꿨다 돌아오면」 → `[48, 0, 0]`
  - 표준 화면 테스트는 `const g = standardScreen();` 로 받아 끝에 `assert.deepEqual([g.fingers.size, g.held.size, g.scene], [0, 0, 'Sample']);`
  - `Object.assign(CONFORM, { waitMs: 50 })` 을 `{ waitMs: 50, holdS: 0, dragS: 0, keyS: 0 }` 로(가짜는 기다리지 않는다) — `src/cli.test.ts` 도 같게, 그리고 그 conform 테스트의 `통과 33` → `통과 48`(테스트 이름도)
  - 새 테스트

```ts
const P2C = ['touch-down', 'touch-move', 'touch-up', 'swipe', 'hold', 'mouse-move', 'scroll', 'key-down', 'key-up', 'tilt', 'pointer', 'input-reset'];

test('C 줄 — 옛 SDK(caps 에 P2-C 명령 없음)면 C 줄 15개를 건너뛴다', async () => {
  const g = standardScreen();
  g.caps = g.caps.filter((c) => !P2C.includes(c));
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [33, 0, 15], report(r));
  assert.match(report(r), /- C 손가락 둘 — touch-down 둘 → fingers 2 · touch-up → fingers 0 \(이 SDK 의 caps 에 touch-down · touch-up · input-reset 없음\)/);
});
```

- [ ] **Step 2: 실패 확인** — `npm run -s build && node --test dist/conform.test.js` → 줄 수 단언 실패
- [ ] **Step 3: 구현** — `src/conform.ts`
  - `CONFORM` 에 시간 셋

```ts
// 테스트가 줄일 수 있게 묶어 둔다 — 실기기에서 누른 뒤 글자가 바뀌기까지 1초 안팎이다. holdS · dragS · keyS 는 C 줄이 보내는 시간(가짜는 기다리지 않아 테스트는 0).
export const CONFORM = { waitMs: 5000, holdS: 1, dragS: 0.5, keyS: 0.5 };
```

  - `pressed` 아래에 도우미

```ts
// 값이 그렇게 될 때까지 다시 읽는다 — 실기기는 다음 프레임에 바뀐다
async function poll<T>(what: string, read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  const end = Date.now() + CONFORM.waitMs;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() >= end) throw new Error(`${what} — 마지막 ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, WAIT.intervalMs));
  }
}
const textOf = (g: Game, target: string) => async () => (await g.find(target))?.text ?? '';
// 「fingers 2 · keys A LeftShift · …」 꼴 글자에서 이름 뒤 값 — InputText · PointerText
const part = (text: string, name: string) => text.split(' · ').find((p) => p.startsWith(`${name} `))?.slice(name.length + 1);
const shows = (g: Game, target: string, name: string, value: string) => poll(`${target} 의 ${name} — 기대 ${value}`, textOf(g, target), (t) => part(t, name) === value);
// Item 이 든 칸 번호 — 끌기 줄은 늘 다른 칸으로 옮겨 다시 돌려도 움직임을 본다
async function slotOf(g: Game): Promise<number> {
  const path = (await g.find('Item'))?.path ?? '없음';
  const k = Number(/\/Bag\/Slot\[(\d)\]\/Item$/.exec(path)?.[1]);
  if (!Number.isInteger(k)) throw new Error(`Item 자리: ${path}`);
  return k;
}
const slot = (k: number) => `/SampleCanvas/Bag/Slot[${k % 4}]`;
const listPos = (g: Game) => async () => (await g.get('ScrollList', 'ScrollRect.verticalNormalizedPosition')) as number;
// 눌러 둔 채 실패하면 다음 줄이 갇힌다 — 끝에 거둔다.
const released = (run: (g: Game) => Promise<void>) => async (g: Game) => {
  try {
    await run(g);
  } finally {
    await g.resetInput().catch(() => undefined);
  }
};
```

  - `STEPS` 의 `B screenshot png` 줄 다음(A 장면 줄 앞)에 C 줄 14개

```ts
  // C — 입력(P2-C). 표준 화면에 InputText(입력 탐침) · HoldBox · PointerText · ScrollList. cmds 의 touch-down 은 SDK 0.6.0 표 — 바뀐 칸을 못 읽는 옛 SDK 는 건너뛴다.
  {
    cmds: ['click', 'find', 'touch-down'],
    label: 'C click LoginButton count 2 → 끝 번호가 2 늚',
    run: async (g) => {
      const n = async () => Number(/ (\d+)$/.exec(await textOf(g, 'StatusText')())?.[1] ?? NaN);
      await g.click('LoginButton');
      const first = await poll('StatusText 끝 번호', n, (v) => Number.isFinite(v));
      await g.click('LoginButton', { count: 2 });
      await poll(`StatusText 끝 번호 — 기대 ${first + 2}`, n, (v) => v === first + 2);
    },
  },
  {
    cmds: ['touch-down', 'touch-up', 'input-reset', 'find'],
    label: 'C 손가락 둘 — touch-down 둘 → fingers 2 · touch-up → fingers 0',
    run: released(async (g) => {
      const a = await g.touchDown('StatusText');
      const b = await g.touchDown('TouchText');
      same('번호가 다름', a !== b, true);
      await shows(g, 'InputText', 'fingers', '2');
      await g.touchUp(a);
      await g.touchUp(b);
      await shows(g, 'InputText', 'fingers', '0');
    }),
  },
  {
    cmds: ['touch-down', 'touch-move', 'touch-up', 'input-reset', 'find'],
    label: 'C touch-down Item · touch-move 다음 칸 · touch-up → Item 이 그 칸',
    run: released(async (g) => {
      const to = slot((await slotOf(g)) + 1);
      const f = await g.touchDown('Item');
      await g.touchMove(f, to);
      await g.touchUp(f);
      same(`${to}/Item 있음`, (await g.find(`${to}/Item`)) !== null, true);
    }),
  },
  {
    cmds: ['drag', 'find', 'touch-down'],
    label: 'C drag Item via 다음 칸 → 그다음 칸 · duration 만큼 걸림',
    run: async (g) => {
      const k = await slotOf(g);
      const t0 = Date.now();
      await g.drag('Item', slot(k + 2), { via: [slot(k + 1)], duration: CONFORM.dragS });
      same('걸린 초가 duration 이상', (Date.now() - t0) / 1000 >= CONFORM.dragS, true);
      same(`${slot(k + 2)}/Item 있음`, (await g.find(`${slot(k + 2)}/Item`)) !== null, true);
    },
  },
  {
    cmds: ['swipe', 'find', 'get'],
    label: 'C swipe ScrollList → 위치가 바뀜',
    run: async (g) => {
      const list = await g.find('ScrollList');
      if (list?.x === undefined || list.y === undefined) throw new Error(`ScrollList 자리: ${JSON.stringify(list)}`);
      const before = await listPos(g)();
      // 위로 밀면 아래 것이 올라와 위치가 준다 — 이미 아래쪽이면 아래로 민다.
      const up = before > 0.5 ? 1 : -1;
      await g.swipe([{ x: list.x, y: list.y - 150 * up }, { x: list.x, y: list.y + 150 * up }], { duration: 0.3 });
      await poll(`ScrollList 위치 — 기대 ${up > 0 ? '줄어듦' : '늚'}(앞 ${before})`, listPos(g), (v) => (up > 0 ? v < before : v > before));
    },
  },
  {
    cmds: ['pointer', 'find'],
    label: 'C pointer HoldBox enter · down · up · exit → PointerText last',
    run: async (g) => {
      for (const e of ['enter', 'down', 'up', 'exit'] as const) {
        await g.pointer('HoldBox', e);
        await shows(g, 'PointerText', 'last', e);
      }
    },
  },
  {
    cmds: ['hold', 'find', 'touch-down'],
    label: 'C hold HoldBox → PointerText held 가 duration 이상',
    run: async (g) => {
      await g.hold('HoldBox', { duration: CONFORM.holdS });
      await poll(`PointerText 의 held — 기대 ${CONFORM.holdS} 이상`, textOf(g, 'PointerText'), (t) => Number(part(t, 'held')) >= CONFORM.holdS - 0.05);
    },
  },
  {
    cmds: ['mouse-move', 'find'],
    label: 'C mouse-move HoldBox → enter · StatusText 로 → exit',
    run: async (g) => {
      await g.mouseMove('HoldBox');
      await shows(g, 'PointerText', 'last', 'enter');
      await g.mouseMove('StatusText');
      await shows(g, 'PointerText', 'last', 'exit');
    },
  },
  {
    cmds: ['scroll', 'get', 'touch-down'],
    label: 'C scroll ScrollList → 위치가 바뀜',
    run: async (g) => {
      const before = await listPos(g)();
      const dy = before > 0.5 ? -10 : 10;
      await g.scroll(dy, { at: 'ScrollList' });
      await poll(`ScrollList 위치 — 기대 ${dy < 0 ? '줄어듦' : '늚'}(앞 ${before})`, listPos(g), (v) => (dy < 0 ? v < before : v > before));
    },
  },
  {
    cmds: ['key-down', 'key-up', 'input-reset', 'find'],
    label: 'C key-down A+LeftShift → keys A LeftShift · key-up → keys -',
    run: released(async (g) => {
      await g.keyDown('A+LeftShift');
      await shows(g, 'InputText', 'keys', 'A LeftShift');
      await g.keyUp('A+LeftShift');
      await shows(g, 'InputText', 'keys', '-');
    }),
  },
  {
    cmds: ['key', 'text-set', 'find', 'touch-down'],
    label: 'C key I duration → duration 만큼 걸림 · TouchText 「key I」',
    run: async (g) => {
      await g.setText('TouchText', '-');
      const t0 = Date.now();
      await g.key('I', { duration: CONFORM.keyS });
      same('걸린 초가 duration 이상', (Date.now() - t0) / 1000 >= CONFORM.keyS, true);
      await poll('TouchText — 기대 「key I」', textOf(g, 'TouchText'), (t) => t === 'key I');
    },
  },
  {
    cmds: ['key-down', 'key-up', 'input-reset', 'find'],
    label: 'C 축 · 조이스틱 — RightArrow+JoystickButton16 → axis 1 · LeftControl+JoystickButton0 → fire 1',
    run: released(async (g) => {
      await g.keyDown('RightArrow+JoystickButton16', { power: 1 });
      await shows(g, 'InputText', 'axis', '1');
      await g.keyDown('LeftControl+JoystickButton0');
      await shows(g, 'InputText', 'fire', '1');
      await g.keyUp('RightArrow+JoystickButton16+LeftControl+JoystickButton0');
      await shows(g, 'InputText', 'axis', '0');
      await shows(g, 'InputText', 'fire', '0');
    }),
  },
  {
    cmds: ['tilt', 'find'],
    label: 'C tilt 0 v 0 → InputText tilt v',
    run: async (g) => {
      // 판마다 다른 값 — 앞 판 값이 남아 있어도 이번 기울기를 본다.
      const v = 20 + (Date.now() % 30);
      await g.tilt([0, v, 0]);
      await shows(g, 'InputText', 'tilt', String(v));
    },
  },
  {
    cmds: ['touch-down', 'key-down', 'input-reset', 'find'],
    label: 'C input-reset — 눌러 둔 손가락 · 키를 거둔다',
    run: released(async (g) => {
      await g.touchDown('StatusText');
      await g.keyDown('W');
      await shows(g, 'InputText', 'fingers', '1');
      await shows(g, 'InputText', 'keys', 'W');
      await g.resetInput();
      await shows(g, 'InputText', 'fingers', '0');
      await shows(g, 'InputText', 'keys', '-');
    }),
  },
```

  - `A scene-load Second → Sample 로 돌아오면` 줄 다음(`errors` 줄 앞)에

```ts
  {
    cmds: ['scene-load', 'scenes', 'click', 'mouse-move', 'scroll', 'get', 'find', 'input-reset'],
    label: 'C UI Toolkit 직접 — Second(EventSystem 없음)의 SecondButton click · hover · scroll',
    run: async (g) => {
      await g.loadScene('Second');
      try {
        await g.click('SecondButton');
        await poll('SecondText — 기대 「second 1」', textOf(g, 'SecondText'), (t) => t === 'second 1');
        await g.mouseMove('SecondButton');
        await poll('SecondText — 기대 「enter」', textOf(g, 'SecondText'), (t) => t === 'enter');
        await g.scroll(-10, { at: 'SecondScroll' });
        await poll('SecondScroll 의 scrollOffset y — 기대 0 보다 큼', async () => (await g.get('SecondScroll', 'scrollOffset')) as number[], (v) => Array.isArray(v) && v[1] > 0);
      } finally {
        await g.resetInput().catch(() => undefined);
        await g.loadScene('Sample');
        await g.waitForScene('Sample');
      }
    },
  },
```

- [ ] **Step 4: 통과 확인** — `npm run -s build && node --test dist/conform.test.js dist/cli.test.js` → 통과
- [ ] **Step 5: 커밋** — `git commit -m "conform C 줄 15개 — 횟수 · 손가락 둘 · down/move/up · via · swipe · pointer · hold · hover · 바퀴 · 여러 키 · 키 시간 · 축 · 기울기 · input-reset · UI Toolkit 직접"`

### Task 4: CLI 명령 · Ran 줄

**Files:** Modify `src/cli.ts` · `src/cli.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `src/cli.test.ts` 「찾기 · 설정 명령」 테스트 다음에

```ts
test('입력 명령 — Ran 줄이 kit 의 game.* 이름 · 인자 꼴로 찍히고, 좌표는 Ran 줄이 없고, 음수도 읽는다', async () => {
  const pc = await fakeTcp(standardScreen());
  const io = (...argv: string[]) => cli('-s=io', ...argv, '--port', String(pc.port));
  try {
    await io('open', '--pc');
    assert.match(await io('click', 'LoginButton', '--count', '2', '--interval', '0.2'), /^Ran: await game\.click\('LoginButton', \{ count: 2, interval: 0\.2 \}\)/);
    assert.match(await io('touch-down', 'Item'), /^Ran: await game\.touchDown\('Item'\)\n- 손가락 10\n/);
    assert.match(await io('touch-move', '10', '/SampleCanvas/Bag/Slot[1]'), /^Ran: await game\.touchMove\(10, '\/SampleCanvas\/Bag\/Slot\[1\]'\)/);
    assert.match(await io('touch-up', '10'), /^Ran: await game\.touchUp\(10\)/);
    assert.match(await io('touch-down', '100', '200'), /^- 좌표 \(100, 200\) 누름 — 케이스에는 주소로 씁니다\n- 손가락 10\n/);
    assert.match(await io('drag', 'Item', '/SampleCanvas/Bag/Slot[3]', '--via', '/SampleCanvas/Bag/Slot[2]', '--duration', '0.5'), /^Ran: await game\.drag\('Item', '\/SampleCanvas\/Bag\/Slot\[3\]', \{ via: \['\/SampleCanvas\/Bag\/Slot\[2\]'\], duration: 0\.5 \}\)/);
    assert.match(await io('swipe', '810,550', '810,850', '--duration', '0.3'), /^- 좌표 810,550 → 810,850 끎 — 케이스에는 drag 로 씁니다/);
    assert.match(await io('hold', 'HoldBox', '--duration', '1'), /^Ran: await game\.hold\('HoldBox', \{ duration: 1 \}\)/);
    assert.match(await io('mouse-move', 'HoldBox'), /^Ran: await game\.mouseMove\('HoldBox'\)/);
    assert.match(await io('scroll', 'ScrollList', '-10'), /^Ran: await game\.scroll\(-10, \{ at: 'ScrollList' \}\)/);
    assert.match(await io('scroll', '3', '--dx', '1'), /^Ran: await game\.scroll\(3, \{ dx: 1 \}\)/);
    assert.match(await io('key', 'A+LeftShift', '--duration', '0.5'), /^Ran: await game\.key\('A\+LeftShift', \{ duration: 0\.5 \}\)/);
    assert.match(await io('key-down', 'JoystickButton16', '--power', '-1'), /^Ran: await game\.keyDown\('JoystickButton16', \{ power: -1 \}\)/);
    assert.match(await io('key-up', 'JoystickButton16'), /^Ran: await game\.keyUp\('JoystickButton16'\)/);
    assert.match(await io('tilt', '0', '-5', '0', '--duration', '1'), /^Ran: await game\.tilt\(\[0, -5, 0\], \{ duration: 1 \}\)/);
    assert.match(await io('pointer', 'HoldBox', 'enter'), /^Ran: await game\.pointer\('HoldBox', 'enter'\)/);
    assert.match(await io('input-reset'), /^Ran: await game\.resetInput\(\)/);
    await assert.rejects(io('pointer', 'HoldBox', 'press'), /pointer <ref\|주소> <down\|up\|enter\|exit> 꼴이어야 합니다/);
    await assert.rejects(io('hold', 'HoldBox', '--duration', '9'), /hold 은 8초 안이어야 합니다/);
    await assert.rejects(io('touch-up', 'x'), /touch-up <손가락 번호> 꼴이어야 합니다/);
    await assert.rejects(io('swipe', '1,1'), /swipe <x,y> <x,y> \[x,y…\] \[--duration <초>\] 꼴이어야 합니다/);
    await assert.rejects(io('click', 'LoginButton', '--count', 'two'), /--count 은 수입니다/);
    await io('close');
  } finally {
    pc.server.close();
  }
});
```

- [ ] **Step 2: 실패 확인** — `npm run -s build && node --test dist/cli.test.js` → 새 테스트 실패(모르는 옵션 `--count`)
- [ ] **Step 3: 구현** — `src/cli.ts`
  - `./game.js` import 에 `type At`
  - `parseArgs` options 에 `duration` · `count` · `interval` · `power` · `dx` 는 `{ type: 'string' }`, `via` 는 `{ type: 'string', multiple: true }`
  - 음수 — `parseArgs` 가 `-10` 을 짧은 옵션으로 읽어 거절한다(`scroll ScrollList -10` · `tilt 0 -5 0` · `--power -1` 모두 — Node 22 에서 확인). `run()` 첫머리에

```ts
  // parseArgs 는 -10 을 짧은 옵션으로 읽는다 — 음수는 잠깐 다른 글자로 감쌌다 푼다(scroll ScrollList -10 · tilt 0 -5 0 · --power -1).
  const NEG = '\u0000';
  const un = (s: string) => (s.startsWith(NEG) ? s.slice(NEG.length) : s);
```

  `parseArgs({ args: argv, …` 를 `args: argv.map((a) => (/^-\d/.test(a) ? NEG + a : a))` 로 바꾸고, `parseArgs` 다음에(지금 `const [name, ...args] = positionals;` 자리)

```ts
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string') (values as Record<string, unknown>)[k] = un(v);
    else if (Array.isArray(v)) (values as Record<string, unknown>)[k] = v.map(un);
  }
  const [name, ...args] = positionals.map(un);
```

  - `flags` 를 넓힌다 — 수 칸 · via, Ran 줄에 끼울 날 목록(`list`)도 준다. 그 아래에 `point` · `finger`

```ts
  type Flag = 'inactive' | 'camera' | 'count' | 'interval' | 'duration' | 'power' | 'dx' | 'via';
  const num = (k: 'count' | 'interval' | 'duration' | 'power' | 'dx') => {
    const v = values[k];
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`--${k} 은 수입니다`);
    return n;
  };
  // --inactive · --camera · --count … — Game 옵션과 Ran 줄의 { … } 칸을 같이 만든다. 그 명령이 받는 것만.
  const flags = (...which: Flag[]) => {
    const o: FindOptions & { count?: number; interval?: number; duration?: number; power?: number; dx?: number; via?: string[] } = {};
    const shown: string[] = [];
    if (which.includes('inactive') && values.inactive) {
      o.inactive = true;
      shown.push('inactive: true');
    }
    if (which.includes('camera') && values.camera !== undefined) {
      o.camera = target(values.camera, '카메라 주소');
      shown.push(`camera: ${quote(o.camera)}`);
    }
    if (which.includes('via') && values.via?.length) {
      o.via = values.via.map((v) => target(v, '지날 자리'));
      shown.push(`via: [${o.via.map(quote).join(', ')}]`);
    }
    for (const k of ['count', 'interval', 'duration', 'power', 'dx'] as const) {
      const n = which.includes(k) ? num(k) : undefined;
      if (n === undefined) continue;
      o[k] = n;
      shown.push(`${k}: ${n}`);
    }
    return { o, list: shown, shown: opts(shown) };
  };
  // 한 점 — 인자 둘이 다 수면 좌표, 아니면 ref · 주소. shown 은 Ran 줄 인자(좌표면 없음)
  const point = (xs: string[], usage: string): { at: At; shown?: string; where: string } => {
    if (xs.length === 2 && xs.every((x) => x.trim() !== '' && Number.isFinite(Number(x)))) return { at: { x: Number(xs[0]), y: Number(xs[1]) }, where: `좌표 (${xs[0]}, ${xs[1]})` };
    if (xs.length !== 1) throw new Error(`${usage} 꼴이어야 합니다`);
    const a = target(xs[0]);
    return { at: a, shown: quote(a), where: a };
  };
  const finger = (x: string | undefined, usage: string) => {
    if (x === undefined || !/^\d+$/.test(x)) throw new Error(`${usage} 꼴이어야 합니다`);
    return Number(x);
  };
```

  - `click` 은 `flags('camera', 'count', 'interval')`, `drag` 는 `flags('camera', 'via', 'duration')`. `key` · `tap` 을 바꾸고 새 갈래

```ts
    case 'key': {
      if (args[0] === undefined) throw new Error('key <키[+키…]> 꼴이어야 합니다 — KeyCode 이름(Escape · Space · Return · I · Alpha1 · Mouse0)');
      const f = flags('duration', 'power');
      await game.key(args[0], f.o);
      return after(ran('key', quote(args[0]), ...f.shown));
    }
    case 'tap': {
      const [x, y] = args.map(Number);
      if (args.length !== 2 || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('tap <x> <y> 꼴이어야 합니다');
      await game.tap(x, y, flags('count', 'interval').o);
      return after(`- 좌표 (${x}, ${y}) 누름 — 케이스에는 주소로 씁니다`);
    }
    case 'touch-down': {
      const p = point(args, 'touch-down <ref|주소> 또는 touch-down <x> <y>');
      const f = flags('camera');
      const n = await game.touchDown(p.at, f.o);
      return after(`${p.shown ? ran('touchDown', p.shown, ...f.shown) : `- ${p.where} 누름 — 케이스에는 주소로 씁니다`}\n- 손가락 ${n}`);
    }
    case 'touch-move': {
      const usage = 'touch-move <손가락 번호> <ref|주소> 또는 touch-move <손가락 번호> <x> <y>';
      const n = finger(args[0], usage);
      const p = point(args.slice(1), usage);
      const f = flags('camera');
      await game.touchMove(n, p.at, f.o);
      return after(p.shown ? ran('touchMove', String(n), p.shown, ...f.shown) : `- 손가락 ${n} 을 ${p.where} 로 — 케이스에는 주소로 씁니다`);
    }
    case 'touch-up': {
      const n = finger(args[0], 'touch-up <손가락 번호>');
      await game.touchUp(n);
      return after(ran('touchUp', String(n)));
    }
    case 'swipe': {
      const usage = 'swipe <x,y> <x,y> [x,y…] [--duration <초>]';
      const points = args.map((a) => {
        const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(a);
        if (!m) throw new Error(`${usage} 꼴이어야 합니다`);
        return { x: Number(m[1]), y: Number(m[2]) };
      });
      if (points.length < 2) throw new Error(`${usage} 꼴이어야 합니다`);
      await game.swipe(points, flags('duration').o);
      return after(`- 좌표 ${args.join(' → ')} 끎 — 케이스에는 drag 로 씁니다`);
    }
    case 'hold':
    case 'mouse-move': {
      const p = point(args, `${name} <ref|주소> 또는 ${name} <x> <y> [--duration <초>]`);
      const f = flags('camera', 'duration');
      if (name === 'hold') await game.hold(p.at, f.o);
      else await game.mouseMove(p.at, f.o);
      return after(p.shown ? ran(name === 'hold' ? 'hold' : 'mouseMove', p.shown, ...f.shown) : `- ${p.where} ${name === 'hold' ? '길게 누름' : '로 마우스'} — 케이스에는 주소로 씁니다`);
    }
    case 'scroll': {
      const usage = 'scroll [<ref|주소> | <x> <y>] <dy> [--dx <칸>] [--duration <초>]';
      const dy = Number(args[args.length - 1]);
      if (!args.length || !Number.isFinite(dy)) throw new Error(`${usage} 꼴이어야 합니다`);
      const p = args.length > 1 ? point(args.slice(0, -1), usage) : undefined;
      const f = flags('camera', 'dx', 'duration');
      await game.scroll(dy, { ...f.o, ...(p ? { at: p.at } : {}) });
      if (p && !p.shown) return after(`- ${p.where} 에서 바퀴 ${dy} — 케이스에는 주소로 씁니다`);
      return after(ran('scroll', String(dy), ...opts([...(p ? [`at: ${p.shown}`] : []), ...f.list])));
    }
    case 'key-down':
    case 'key-up': {
      if (args[0] === undefined) throw new Error(`${name} <키[+키…]> 꼴이어야 합니다`);
      if (name === 'key-up') {
        await game.keyUp(args[0]);
        return after(ran('keyUp', quote(args[0])));
      }
      const f = flags('power');
      await game.keyDown(args[0], f.o);
      return after(ran('keyDown', quote(args[0]), ...f.shown));
    }
    case 'tilt': {
      const xyz = args.map(Number);
      if (xyz.length !== 3 || !xyz.every(Number.isFinite)) throw new Error('tilt <x> <y> <z> [--duration <초>] 꼴이어야 합니다');
      const f = flags('duration');
      await game.tilt(xyz as [number, number, number], f.o);
      return after(ran('tilt', `[${xyz.join(', ')}]`, ...f.shown));
    }
    case 'pointer': {
      const a = target(args[0]);
      const e = args[1];
      if (e !== 'down' && e !== 'up' && e !== 'enter' && e !== 'exit') throw new Error('pointer <ref|주소> <down|up|enter|exit> 꼴이어야 합니다');
      await game.pointer(a, e);
      return after(ran('pointer', quote(a), quote(e)));
    }
    case 'input-reset':
      await game.resetInput();
      return after(ran('resetInput'));
```

  - `HELP` — `click` 줄에 `[--count <n>] [--interval <초>]`, `drag` 줄을 `drag <ref|주소> <ref|주소> [--via <주소>]… [--duration <초>]`, `key` 줄을 `key <키[+키…]> [--duration <초>] [--power <-1~1>]   키(KeyCode 이름 — Escape · Space · Return · I · Alpha1 · Mouse0). Escape 는 폰 뒤로 키와 같다`, `tap` 줄 끝에 `[--count <n>] [--interval <초>]`. `tap` 줄 다음에

```
  touch-down <ref|주소>|<x> <y> · touch-move <번호> <ref|주소>|<x> <y> · touch-up <번호>   손가락 눌러 두기 · 옮기기 · 떼기(번호 10~19)
  swipe <x,y> <x,y>… [--duration <초>]             좌표로 끌기(살펴볼 때만 — 케이스는 drag)
  hold <ref|주소>|<x> <y> [--duration <초>]        길게 누르기(기본 1초)
  mouse-move <ref|주소>|<x> <y> [--duration <초>]   가짜 마우스 — hover. 단추는 key Mouse0
  scroll [<ref|주소>|<x> <y>] <dy> [--dx <칸>] [--duration <초>]   마우스 바퀴(위가 +)
  key-down <키[+키…]> [--power <-1~1>] · key-up <키[+키…]>   키 눌러 두기 · 떼기(JoystickButton16~19 는 스틱 — power 가 값)
  tilt <x> <y> <z> [--duration <초>]               기울이기(가속도 g)
  pointer <ref|주소> <down|up|enter|exit>          GameObject 하나에 Pointer 이벤트
  input-reset                                      눌러 둔 손가락 · 키 · 가짜 마우스 · 기울기를 다 거둔다
```

  주소 절 둘째 줄 끝에 「입력 시간은 초 — 명령 하나는 8초 안(더 길게는 touch-down · key-down 뒤 touch-up · key-up).」
- [ ] **Step 4: 통과 확인** — `npm run -s build && node --test dist/cli.test.js` → 통과
- [ ] **Step 5: 커밋** — `git commit -m "CLI 입력 명령 — touch-down/move/up · swipe · hold · mouse-move · scroll · key-down/up · tilt · pointer · input-reset · --count · --duration · --via · 음수 인자"`

### Task 5: Unity SDK — 입력 상태 · 일 · 세 길

**Files:** Create `sdk/unity/Runtime/FakeInput.cs` · `FakeMouse.cs`(+ .meta 둘), Modify `FakeTouches.cs` · `FakeKeys.cs` · `FakeInputSystem.cs` · `UiToolkit.cs` · `sdk/unity/Input/Input.cs` · `ControlServer.cs`

C# 은 단위 테스트가 없다 — 확인은 Step 9 의 컴파일 검사와 Task 10 의 실기기 `conform` 이다. 새 `.cs` 의 `.meta` 는 `FakeKeys.cs.meta` 를 베끼고 guid 만 `python3 -c 'import uuid; print(uuid.uuid4().hex)'` 로 새로(`src/sdk-meta.test.ts` 가 짝 · 겹침을 본다).

- [ ] **Step 1: `FakeMouse.cs`(새)**

```cs
// 바깥 명령이 옮긴 가짜 마우스 — 자리 · 이번 프레임 이동량 · 바퀴. 단추는 FakeKeys 의 Mouse0~4
using UnityEngine;

namespace ControlCli
{
    public static class FakeMouse
    {
        // mouse-move · 자리를 준 scroll 이 켜고 input-reset 이 끈다 — 꺼져 있으면 진짜 마우스 그대로.
        public static bool Active { get; private set; }
        public static Vector2 Position { get; private set; }
        // 이번 프레임 이동량 · 바퀴 — 옛 Input 축(Mouse X · Y · ScrollWheel)과 Input System Mouse 가 읽는다.
        public static Vector2 Delta { get; private set; }
        public static Vector2 Scroll { get; private set; }
        // 이번 프레임에 자리를 옮겼나 — UI Toolkit 직접 길 · Input System 이 바뀐 프레임에만 보낸다.
        public static bool Moved { get; private set; }

        private static Vector2? _next;
        private static Vector2 _scroll;

        internal static void MoveTo(Vector2 p) => _next = p;
        internal static void AddScroll(Vector2 d) => _scroll += d;

        // 드라이버(FakeTouches)가 프레임마다 일(FakeInput) 다음에 부른다.
        internal static void Tick()
        {
            Moved = _next.HasValue;
            Delta = Moved && Active ? _next.Value - Position : Vector2.zero;
            if (Moved)
            {
                Position = _next.Value;
                Active = true;
            }
            _next = null;
            Scroll = _scroll;
            _scroll = Vector2.zero;
        }

        internal static void Reset()
        {
            Active = false;
            _next = null;
            _scroll = Vector2.zero;
        }
    }
}
```

- [ ] **Step 2: `FakeKeys.cs`** — 통째로(축 표 읽기는 Task 6)

```cs
// 바깥 명령이 누른 키 — 누른 동안 · 이번 프레임 누름/뗌 · 세기. 옛 Input 감싸기(GetKey*) · uGUI 마우스 단추 · Input System 장치가 같이 본다
using System.Collections.Generic;
using UnityEngine;

namespace ControlCli
{
    public static class FakeKeys
    {
        // 일이 정한 눌림(키 → 세기)과 내보낸 눌림 — 프레임마다 견줘 이번 프레임 누름 · 뗌을 낸다.
        private static readonly Dictionary<KeyCode, float> Wanted = new Dictionary<KeyCode, float>();
        private static readonly Dictionary<KeyCode, float> Shown = new Dictionary<KeyCode, float>();
        private static readonly HashSet<KeyCode> DownNow = new HashSet<KeyCode>();
        private static readonly HashSet<KeyCode> UpNow = new HashSet<KeyCode>();

        // 이번 프레임에 눌림 · 세기가 바뀌었나 — Input System 이 바뀐 프레임에만 상태를 보낸다.
        public static bool Changed { get; private set; }

        internal static void Press(KeyCode key, float power) => Wanted[key] = power;
        internal static void Release(KeyCode key) => Wanted.Remove(key);
        internal static void ReleaseAll() => Wanted.Clear();

        public static bool Held(KeyCode key) => Shown.ContainsKey(key);
        public static bool Down(KeyCode key) => DownNow.Contains(key);
        public static bool Up(KeyCode key) => UpNow.Contains(key);
        public static bool Any => Shown.Count > 0;
        public static bool AnyDown => DownNow.Count > 0;
        // 지금 누른 키와 세기 — Input System 이 한 상태로 보낸다.
        internal static Dictionary<KeyCode, float> All => Shown;

        // 마우스 단추 번호 → KeyCode(Mouse0~6), 밖이면 None — GetMouseButton(7) 이 JoystickButton0 이 되지 않게.
        public static KeyCode MouseKey(int button) => button >= 0 && button <= 6 ? KeyCode.Mouse0 + button : KeyCode.None;

        // 드라이버(FakeTouches)가 프레임마다 일(FakeInput) 다음에 부른다.
        internal static void Tick()
        {
            DownNow.Clear();
            UpNow.Clear();
            Changed = false;
            foreach (var k in Shown.Keys)
                if (!Wanted.ContainsKey(k)) UpNow.Add(k);
            foreach (var kv in Wanted)
                if (!Shown.TryGetValue(kv.Key, out var p)) DownNow.Add(kv.Key);
                else if (!Mathf.Approximately(p, kv.Value)) Changed = true;
            Changed |= DownNow.Count > 0 || UpNow.Count > 0;
            if (!Changed) return;
            Shown.Clear();
            foreach (var kv in Wanted) Shown[kv.Key] = kv.Value;
        }
    }
}
```

- [ ] **Step 3: `FakeInput.cs`(새)** — 일 돌리기와 일 꼴. 바로 바꾸는 명령(touch-down · key-down …)은 상태를 바꾸고 `Settle()` 을 건다. 일 안에서 다른 IEnumerator 를 `yield return` 하지 않는다 — Unity 코루틴이 아니라 드라이버가 `MoveNext` 를 직접 불러 안의 일은 돌지 않는다

```cs
// 바깥 입력 명령을 프레임마다 한 걸음 도는 일(iterator)로 돌린다 — 탭 · 끌기 · 길게 누르기 · 키 · 마우스 · 바퀴 · 기울기. 한 번에 일 하나, 다 돌면 명령에 답한다
using System.Collections;
using UnityEngine;

namespace ControlCli
{
    public static class FakeInput
    {
        // 명령 하나가 넘지 말아야 할 초 — SDK 답 한도 10초 · 팜 15초. 더 오래 누르기는 touch-down · key-down 뒤 touch-up · key-up.
        public const float LongestSeconds = 8;
        // 끌기 한 마디를 적어도 몇 프레임에 나누나 — EventSystem 의 끌기 문턱을 넘고 끌기 처리기가 중간 자리를 받게 한다.
        private const int MinSteps = 10;

        private static IEnumerator _job;

        // 기울기 — 옛 Input 감싸기 · Input System 이 읽는다. null 이면 진짜 값.
        public static Vector3? Tilt { get; private set; }

        // 도는 일이 없고 Input System 이 넣은 이벤트를 받았으면 한가하다 — 명령 답을 그때까지 미룬다. 눌러 둔 손가락 · 키는 바쁨이 아니다.
        public static bool Idle => _job == null
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            && !FakeInputSystem.Waiting
#endif
            ;

        public static void Run(IEnumerator job) => _job = job;

        // 드라이버(FakeTouches)가 프레임마다 맨 먼저 부른다.
        internal static void Step()
        {
            if (_job != null && !_job.MoveNext()) _job = null;
        }

        // 시간 초과로 거둘 때 · input-reset — 일을 멈추고 눌린 것을 다 뗀다(다음 프레임에 Canceled · 뗌이 나간다).
        public static void Reset()
        {
            _job = null;
            FakeTouches.CancelAll();
            FakeKeys.ReleaseAll();
            FakeMouse.Reset();
            Tilt = null;
        }

        // 바꾼 상태가 한 프레임 나가게 기다린다.
        public static IEnumerator Settle()
        {
            yield return null;
        }

        // count 번 눌렀다 뗀다 — 사이에 interval 초. tapCount 는 몇 번째인지(진짜 빠른 연타와 같게).
        public static IEnumerator Tap(int finger, Vector2 at, int count, float interval)
        {
            for (var i = 1; i <= count; i++)
            {
                if (i > 1)
                    for (var t = 0f; t < interval; t += Time.unscaledDeltaTime) yield return null;
                FakeTouches.Press(finger, at, i);
                yield return null;
                FakeTouches.Release(finger);
                yield return null;
            }
        }

        // 한 손가락이 점들을 차례로 지나고 끝에서 뗀다 — 점 사이마다 같은 시간(AltTester), 한 마디에 적어도 MinSteps 프레임.
        public static IEnumerator Path(int finger, Vector2[] points, float seconds)
        {
            FakeTouches.Press(finger, points[0], 1);
            yield return null;
            var each = points.Length > 1 ? seconds / (points.Length - 1) : 0;
            for (var i = 1; i < points.Length; i++)
            {
                var t = 0f;
                for (var k = 1; ; k++)
                {
                    t += Time.unscaledDeltaTime;
                    var f = Mathf.Min(1, Mathf.Min(k / (float)MinSteps, each > 0 ? t / each : 1));
                    FakeTouches.Move(finger, Vector2.Lerp(points[i - 1], points[i], f));
                    yield return null;
                    if (f >= 1) break;
                }
            }
            FakeTouches.Release(finger);
            yield return null;
        }

        // 누른 채 seconds 를 둔다 — 그동안 Stationary.
        public static IEnumerator Hold(int finger, Vector2 at, float seconds)
        {
            FakeTouches.Press(finger, at, 1);
            yield return null;
            for (var t = 0f; t < seconds; t += Time.unscaledDeltaTime) yield return null;
            FakeTouches.Release(finger);
            yield return null;
        }

        // 키들을 함께 눌러 seconds(적어도 한 프레임) 두고 뗀다 — 0 이면 지금처럼 한 프레임 누름 → 다음 프레임 뗌.
        public static IEnumerator Keys(KeyCode[] keys, float power, float seconds)
        {
            foreach (var k in keys) FakeKeys.Press(k, power);
            yield return null;
            for (var t = Time.unscaledDeltaTime; t < seconds; t += Time.unscaledDeltaTime) yield return null;
            foreach (var k in keys) FakeKeys.Release(k);
            yield return null;
        }

        // 가짜 마우스를 seconds 동안 곧게 옮긴다(0 이면 한 번에) — 꺼져 있었으면 그 자리에서 켠다.
        public static IEnumerator MouseTo(Vector2 to, float seconds)
        {
            var from = FakeMouse.Active ? FakeMouse.Position : to;
            for (var t = 0f; ;)
            {
                t += Time.unscaledDeltaTime;
                var f = seconds > 0 ? Mathf.Min(1, t / seconds) : 1;
                FakeMouse.MoveTo(Vector2.Lerp(from, to, f));
                yield return null;
                if (f >= 1) break;
            }
        }

        // 바퀴 — at 이 있으면 먼저 그리로 옮겨 한 프레임 두고(hover 가 잡히게), delta 를 seconds 동안 나눠 굴린다.
        public static IEnumerator Scroll(Vector2? at, Vector2 delta, float seconds)
        {
            if (at.HasValue)
            {
                FakeMouse.MoveTo(at.Value);
                yield return null;
            }
            var done = 0f;
            for (var t = 0f; done < 1;)
            {
                t += Time.unscaledDeltaTime;
                var f = seconds > 0 ? Mathf.Min(1, t / seconds) : 1;
                FakeMouse.AddScroll(delta * (f - done));
                done = f;
                yield return null;
            }
        }

        // 가속도를 seconds(적어도 한 프레임) 동안 대신하고 놓는다.
        public static IEnumerator TiltFor(Vector3 acceleration, float seconds)
        {
            Tilt = acceleration;
            yield return null;
            for (var t = Time.unscaledDeltaTime; t < seconds; t += Time.unscaledDeltaTime) yield return null;
            Tilt = null;
            yield return null;
        }
    }
}
```

- [ ] **Step 4: `FakeTouches.cs`** — 통째로. 드라이버 · 손가락 칸 10개 · `FakeBaseInput`

```cs
// 가짜 입력 드라이버 — 프레임마다 게임보다 먼저 일(FakeInput)을 한 걸음 돌리고 손가락 · 키 · 마우스 상태를 옛 Input · Input System · UI Toolkit 길로 내보낸다. 손가락 칸 10개도 여기
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Scripting;

namespace ControlCli
{
    // 게임 · EventSystem 의 Update 보다 먼저 돌아야 같은 프레임에 가짜 입력이 보인다.
    [DefaultExecutionOrder(-32000), Preserve]
    public sealed class FakeTouches : MonoBehaviour
    {
        // 진짜 손가락 번호(0~9)와 겹치지 않게 10~19 를 쓴다. UI Toolkit 은 터치 손가락을 0~19 만 받아(PointerId.touchPointerCount 20)
        // 그보다 크면 EventSystem 의 PanelRaycaster 가 IndexOutOfRange 를 던져 uGUI 까지 아무것도 안 눌린다(샘플 실기기 2026-11-03).
        public const int FirstFinger = 10;
        private const int Count = 10;

        private sealed class Finger
        {
            // 일이 정한 눌림 · 자리(Down · Next)와 내보낸 눌림 · 자리(Shown — Began 을 냈고 아직 Ended · Canceled 를 안 냄 · Position)
            public bool Down, Shown, Cancel;
            public Vector2 Next, Position;
            public int Taps;
        }

        private static readonly Finger[] Slots = Make();
        // 이번 프레임 터치 — 누른 동안(Stationary 포함)과 뗀 프레임, 번호 차례.
        private static readonly Touch[] Live = new Touch[Count];
        private static int _live;

        private static Finger[] Make()
        {
            var slots = new Finger[Count];
            for (var i = 0; i < Count; i++) slots[i] = new Finger();
            return slots;
        }

        private static Finger Slot(int finger) => finger >= FirstFinger && finger < FirstFinger + Count ? Slots[finger - FirstFinger] : null;

        // 비어 있는 가장 작은 번호 — 다 눌렸으면 -1. 뗀 손가락은 Ended 를 내보낸 뒤에 빈다.
        public static int Free()
        {
            for (var i = 0; i < Count; i++)
                if (!Slots[i].Down && !Slots[i].Shown) return FirstFinger + i;
            return -1;
        }

        public static bool IsDown(int finger) => Slot(finger)?.Down == true;

        // 일 · 명령이 부른다 — 다음 내보내기에 실린다.
        internal static void Press(int finger, Vector2 at, int taps)
        {
            var s = Slot(finger);
            s.Down = true;
            s.Next = at;
            s.Taps = taps;
        }

        internal static void Move(int finger, Vector2 to) => Slot(finger).Next = to;
        internal static void Release(int finger) => Slot(finger).Down = false;

        // 거둘 때 — 내보낸 손가락은 Canceled 로 떼 EventSystem 이 눌림에 갇히지 않게, 아직 안 내보낸 것은 그냥 지운다.
        internal static void CancelAll()
        {
            foreach (var s in Slots)
            {
                s.Cancel = s.Shown;
                s.Down = false;
            }
        }

        // 옛 Input 을 끈 게임(Input System 만)은 UnityEngine.Input 을 부르면 던진다 — 가짜 터치만 센다.
#if ENABLE_LEGACY_INPUT_MANAGER
        private static int RealCount => UnityEngine.Input.touchCount;
#else
        private const int RealCount = 0;
#endif

        public static int TouchCount => RealCount + _live;

        public static Touch GetTouch(int index) =>
#if ENABLE_LEGACY_INPUT_MANAGER
            index < RealCount ? UnityEngine.Input.GetTouch(index) :
#endif
            Live[index - RealCount];

        // 진짜 폰처럼 simulateMouseWithTouches 가 켜져 있으면 가장 작은 번호 손가락(Live[0])을 마우스 왼쪽 단추로도 비춘다 — 마우스 API 로 터치를 읽는 게임용.
        // 뗀 프레임에는 GetMouseButtonUp 만 참이다(Unity 와 같게).
        private static bool Ended(TouchPhase p) => p == TouchPhase.Ended || p == TouchPhase.Canceled;
        public static bool MouseHeld => _live > 0 && !Ended(Live[0].phase);
        public static bool MouseDown => _live > 0 && Live[0].phase == TouchPhase.Began;
        public static bool MouseUp => _live > 0 && Ended(Live[0].phase);
        public static Vector2? MousePosition => _live > 0 ? Live[0].position : (Vector2?)null;

        private void Update()
        {
            FakeInput.Step();
            FakeKeys.Tick();
            FakeMouse.Tick();
            Fingers();
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            FakeInputSystem.Publish();
#endif
#if CONTROL_CLI_UITK
            if (UiToolkit.Direct) UiToolkit.SendMouse();
#endif
            // 장면이 바뀌면 EventSystem 이 새로 생기므로 매 프레임 확인한다.
            var events = EventSystem.current;
            var module = events != null ? events.currentInputModule : null;
            if (module != null && !(module.inputOverride is FakeBaseInput))
                module.inputOverride = module.gameObject.AddComponent<FakeBaseInput>();
            // PC 는 창 초점이 없으면 uGUI 입력 모듈이 입력을 버린다 — 가짜 입력이 있는 동안 EventSystem 에 초점을 다시 알린다.
            if ((_live > 0 || FakeMouse.Active || FakeKeys.Any) && events != null && !events.isFocused && !Application.isMobilePlatform) Focus?.Invoke(events, Focused);
        }

        // 칸마다 이번 프레임 phase 를 셈해 옛 Input 이 읽을 터치로 두고, 바뀐 것(Stationary 밖)만 Input System · UI Toolkit 직접 길로 보낸다.
        private static void Fingers()
        {
            _live = 0;
            for (var i = 0; i < Count; i++)
            {
                var s = Slots[i];
                var delta = s.Next - s.Position;
                TouchPhase phase;
                if (s.Down && !s.Shown)
                {
                    phase = TouchPhase.Began;
                    delta = Vector2.zero;
                    s.Shown = true;
                }
                else if (s.Shown && !s.Down)
                {
                    phase = s.Cancel ? TouchPhase.Canceled : TouchPhase.Ended;
                    s.Shown = s.Cancel = false;
                }
                else if (s.Shown) phase = delta == Vector2.zero ? TouchPhase.Stationary : TouchPhase.Moved;
                else continue;
                s.Position = s.Next;
                var touch = new Touch { fingerId = FirstFinger + i, position = s.Position, rawPosition = s.Position, deltaPosition = delta, phase = phase, tapCount = s.Taps, pressure = 1, maximumPossiblePressure = 1, type = TouchType.Direct };
                Live[_live++] = touch;
                if (phase == TouchPhase.Stationary) continue;
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
                FakeInputSystem.Send(touch.fingerId, touch.position, delta, phase);
#endif
#if CONTROL_CLI_UITK
                if (UiToolkit.Direct) UiToolkit.Send(touch);
#endif
            }
        }

        private static readonly object[] Focused = { true };
        private static readonly System.Reflection.MethodInfo Focus =
            typeof(EventSystem).GetMethod("OnApplicationFocus", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
    }

    // UI 는 게임 코드가 아니라 입력 모듈이 터치 · 마우스를 읽으므로 inputOverride 로 같은 가짜 입력을 넣는다.
    [Preserve]
    public sealed class FakeBaseInput : BaseInput
    {
        public override int touchCount => FakeTouches.TouchCount;
        public override Touch GetTouch(int index) => FakeTouches.GetTouch(index);
        public override bool touchSupported => true;
        // 가짜 마우스 — 폰에서도 hover · 바퀴 · 단추가 uGUI 마우스 길에 닿게 마우스가 있다고 답한다.
        public override bool mousePresent => FakeMouse.Active || base.mousePresent;
        public override Vector2 mousePosition => FakeMouse.Active ? FakeMouse.Position : base.mousePosition;
        public override Vector2 mouseScrollDelta => base.mouseScrollDelta + FakeMouse.Scroll;
        public override bool GetMouseButton(int button) => base.GetMouseButton(button) || FakeKeys.Held(FakeKeys.MouseKey(button));
        public override bool GetMouseButtonDown(int button) => base.GetMouseButtonDown(button) || FakeKeys.Down(FakeKeys.MouseKey(button));
        public override bool GetMouseButtonUp(int button) => base.GetMouseButtonUp(button) || FakeKeys.Up(FakeKeys.MouseKey(button));
    }
}
```

- [ ] **Step 5: `FakeInputSystem.cs`** — 통째로. 손가락은 바뀐 프레임에 `Send`, 나머지는 `Publish` 가 바뀐 것만

```cs
// 새 Input System 을 쓰는 게임에 같은 가짜 입력을 장치 이벤트로 넣는다 — 폰은 손가락마다 Touchscreen, PC 는 마우스 손가락을 Mouse 로, 키는 Keyboard · Gamepad, 기울기는 Accelerometer
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using InputTouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace ControlCli
{
    internal static class FakeInputSystem
    {
        private static Touchscreen _screen;
        private static Mouse _mouse;
        private static Keyboard _keyboard;
        private static Gamepad _gamepad;
        private static Accelerometer _accelerometer;
        private static uint _queuedAt;
        private static bool _queued;
        // PC 에서 Mouse 에 실은 손가락 — 아무 손가락도 안 실렸을 때 처음 누른 것, 뗄 때까지. 나머지 손가락은 Touchscreen.
        private static int _mouseFinger = -1;
        private static bool _fingerDown;
        private static Vector2 _mouseAt, _sentAt;
        private static int _sentButtons;
        private static bool _mouseDirty, _keysSent, _padSent;
        private static Vector3? _sentTilt;

        // 넣은 이벤트는 다음 Input System 업데이트(보통 다음 프레임 처음, FixedUpdate 처리 게임이면 다음 FixedUpdate)에 처리된다 — 그 전까지 바쁘다.
        public static bool Waiting => _queued && InputState.updateCount <= _queuedAt;

        // 폰에는 진짜 장치가 늘 있다 — 새로 만든 장치는 PlayerInput 짝짓기 밖이라 있는 것부터 쓴다.
        private static T Device<T>(ref T kept, T current) where T : InputDevice
        {
            if (kept == null || !kept.added) kept = current != null && current.added ? current : InputSystem.AddDevice<T>();
            return kept;
        }

        public static void Send(int finger, Vector2 position, Vector2 delta, UnityEngine.TouchPhase phase)
        {
            var end = phase == UnityEngine.TouchPhase.Ended || phase == UnityEngine.TouchPhase.Canceled;
            // PC 게임은 마우스로 읽는다 — 같은 손가락을 Touchscreen 에도 넣으면 UI 입력 모듈이 두 번 누른다. Mouse 는 Publish 가 가짜 마우스 · 단추와 한 상태로 보낸다.
            if (!Application.isMobilePlatform && (_mouseFinger == finger || (_mouseFinger < 0 && phase == UnityEngine.TouchPhase.Began)))
            {
                _mouseFinger = end ? -1 : finger;
                _fingerDown = !end;
                _mouseAt = position;
                _mouseDirty = true;
                return;
            }
            InputSystem.QueueStateEvent(Device(ref _screen, Touchscreen.current), new TouchState
            {
                touchId = finger,
                phase = Map(phase),
                position = position,
                delta = delta,
                pressure = 1,
                tapCount = 1,
            });
            Queued();
        }

        // 드라이버가 프레임마다 손가락 다음에 부른다 — 마우스 · 키보드 · 게임패드 · 가속도를 바뀐 프레임에만 한 상태로.
        public static void Publish()
        {
            PublishMouse();
            if (FakeKeys.Changed) PublishKeys();
            PublishTilt();
        }

        private static void PublishMouse()
        {
            if (FakeMouse.Moved)
            {
                _mouseAt = FakeMouse.Position;
                _mouseDirty = true;
            }
            var buttons = (_fingerDown || FakeKeys.Held(KeyCode.Mouse0) ? 1 : 0) | (FakeKeys.Held(KeyCode.Mouse1) ? 2 : 0) | (FakeKeys.Held(KeyCode.Mouse2) ? 4 : 0)
                | (FakeKeys.Held(KeyCode.Mouse3) ? 8 : 0) | (FakeKeys.Held(KeyCode.Mouse4) ? 16 : 0);
            // 가짜 마우스 · 마우스 손가락 · 단추를 안 쓰면 진짜 마우스를 건드리지 않는다.
            if (!_mouseDirty && buttons == _sentButtons && FakeMouse.Scroll == Vector2.zero) return;
            var state = new MouseState { position = _mouseAt, delta = _mouseAt - _sentAt, scroll = FakeMouse.Scroll }
                .WithButton(MouseButton.Left, (buttons & 1) != 0)
                .WithButton(MouseButton.Right, (buttons & 2) != 0)
                .WithButton(MouseButton.Middle, (buttons & 4) != 0)
                .WithButton(MouseButton.Forward, (buttons & 8) != 0)
                .WithButton(MouseButton.Back, (buttons & 16) != 0);
            InputSystem.QueueStateEvent(Device(ref _mouse, Mouse.current), state);
            Queued();
            _sentAt = _mouseAt;
            _sentButtons = buttons;
            _mouseDirty = false;
        }

        // 누른 키 전부를 한 상태로 — 키보드 키는 Keyboard, JoystickButton 은 Gamepad. 한 번이라도 보낸 장치는 다 뗄 때도 보낸다.
        private static void PublishKeys()
        {
            var keys = new List<Key>();
            var pad = default(GamepadState);
            var padUsed = false;
            foreach (var kv in FakeKeys.All)
            {
                if (TryKey(kv.Key, out var key)) keys.Add(key);
                else padUsed |= Pad(kv.Key, kv.Value, ref pad);
            }
            if (keys.Count > 0 || _keysSent)
            {
                InputSystem.QueueStateEvent(Device(ref _keyboard, Keyboard.current), new KeyboardState(keys.ToArray()));
                _keysSent = keys.Count > 0;
                Queued();
            }
            if (padUsed || _padSent)
            {
                InputSystem.QueueStateEvent(Device(ref _gamepad, Gamepad.current), pad);
                _padSent = padUsed;
                Queued();
            }
        }

        // AltTester 와 같은 짝 — JoystickButton0~15 는 단추(6 · 7 은 방아쇠 값), 16~19 는 왼 스틱 x · y · 오른 스틱 x · y(값 = 세기).
        private static readonly GamepadButton[] Buttons =
        {
            GamepadButton.South, GamepadButton.East, GamepadButton.West, GamepadButton.North, GamepadButton.LeftShoulder, GamepadButton.RightShoulder,
            GamepadButton.LeftTrigger, GamepadButton.RightTrigger, GamepadButton.Select, GamepadButton.Start, GamepadButton.LeftStick, GamepadButton.RightStick,
            GamepadButton.DpadUp, GamepadButton.DpadDown, GamepadButton.DpadLeft, GamepadButton.DpadRight,
        };

        private static bool Pad(KeyCode code, float power, ref GamepadState pad)
        {
            var n = code - KeyCode.JoystickButton0;
            switch (n)
            {
                case 6: pad.leftTrigger = Mathf.Abs(power); return true;
                case 7: pad.rightTrigger = Mathf.Abs(power); return true;
                case 16: pad.leftStick.x = power; return true;
                case 17: pad.leftStick.y = power; return true;
                case 18: pad.rightStick.x = power; return true;
                case 19: pad.rightStick.y = power; return true;
            }
            if (n < 0 || n >= Buttons.Length) return false;
            pad = pad.WithButton(Buttons[n]);
            return true;
        }

        private static void PublishTilt()
        {
            var tilt = FakeInput.Tilt;
            if (tilt == _sentTilt) return;
            _sentTilt = tilt;
            InputSystem.QueueStateEvent(Accel(), new AccelerometerState { acceleration = tilt ?? Vector3.zero });
            Queued();
        }

        // 켜진 가속도 장치 — 폰의 것은 게임이 켜야 이벤트를 받아(꺼진 장치는 이벤트를 버린다) 꺼져 있으면 하나 더한다.
        private static Accelerometer Accel()
        {
            if (_accelerometer != null && _accelerometer.added) return _accelerometer;
            var current = Accelerometer.current;
            _accelerometer = current != null && current.added && current.enabled ? current : InputSystem.AddDevice<Accelerometer>();
            if (!_accelerometer.enabled) InputSystem.EnableDevice(_accelerometer);
            return _accelerometer;
        }

        private static void Queued()
        {
            _queuedAt = InputState.updateCount;
            _queued = true;
        }

        // KeyCode 와 Key 는 이름이 거의 같다 — 다른 것만 짝짓는다(Alpha1 → Digit1 · Return → Enter · Keypad1 → Numpad1 · LeftControl → LeftCtrl).
        private static bool TryKey(KeyCode code, out Key key)
        {
            var name = code.ToString();
            if (name.StartsWith("Alpha")) name = "Digit" + name.Substring(5);
            else if (name.StartsWith("Keypad")) name = "Numpad" + name.Substring(6);
            else if (name == "Return") name = "Enter";
            else if (name.EndsWith("Control")) name = name.Replace("Control", "Ctrl");
            else if (name == "BackQuote") name = "Backquote";
            return Enum.TryParse(name, out key) && key != Key.None;
        }

        // 두 TouchPhase 는 숫자가 다르다(옛 Began 0 · 새 Began 1) — 캐스트하지 않고 짝짓는다.
        private static InputTouchPhase Map(UnityEngine.TouchPhase phase)
        {
            switch (phase)
            {
                case UnityEngine.TouchPhase.Began: return InputTouchPhase.Began;
                case UnityEngine.TouchPhase.Moved: return InputTouchPhase.Moved;
                case UnityEngine.TouchPhase.Stationary: return InputTouchPhase.Stationary;
                case UnityEngine.TouchPhase.Ended: return InputTouchPhase.Ended;
                default: return InputTouchPhase.Canceled;
            }
        }
    }
}
#endif
```

  알아 둘 것 — `Enum.TryParse("Mouse0", out Key)` · `"JoystickButton0"` 은 실패해 Keyboard 에 안 실린다(Mouse 는 PublishMouse, 패드는 Pad). `Mouse` 의 `delta` · `scroll` 은 Input System 이 다음 업데이트에 0 으로 되돌린다. 가속도 장치를 더하면 그 장치가 `Accelerometer.current` 가 된다 — 실기기에서 InputText 의 tilt 로 본다(Task 10).

- [ ] **Step 6: `UiToolkit.cs`** — 손가락 · 마우스마다 누른 panel, 가짜 마우스
  - `_pressed` 칸과 `Send` 를 아래로, `using System.Collections.Generic;` 을 더한다

```cs
        // 누른 panel — 뗄 때까지 같은 panel 로 보낸다(Unity 기본 이벤트 시스템의 soft capture 와 같게). 손가락 · 마우스마다 따로.
        private static readonly Dictionary<int, IPanel> Pressed = new Dictionary<int, IPanel>();
        private static int _mouseButtons;

        private static Vector2 Flip(Vector2 p) => new Vector2(p.x, Screen.height - p.y);

        private static IPanel Target(int pointer, Vector2 flipped, bool begin, bool end)
        {
            Pressed.TryGetValue(pointer, out var pressed);
            var panel = begin || pressed == null ? Topmost(flipped) : pressed;
            if (end || panel == null) Pressed.Remove(pointer);
            else Pressed[pointer] = panel;
            return panel;
        }

        // Unity 기본 이벤트 시스템과 같은 차례 — 위아래 뒤집기 → panel 좌표 → 그 좌표의 Touch 로 Pointer 이벤트. 손가락 번호가 pointerId 가 된다.
        public static void Send(Touch touch)
        {
            var flipped = Flip(touch.position);
            var panel = Target(touch.fingerId, flipped, touch.phase == TouchPhase.Began, touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled);
            if (panel == null) return;
            var at = RuntimePanelUtils.ScreenToPanel(panel, flipped);
            var before = RuntimePanelUtils.ScreenToPanel(panel, flipped - new Vector2(touch.deltaPosition.x, -touch.deltaPosition.y));
            touch.position = at;
            touch.deltaPosition = at - before;
            using (var e = Pointer(touch)) panel.visualTree.SendEvent(e);
        }

        // 가짜 마우스 — 옮긴 프레임에 PointerMove, 단추(키 Mouse0~2)가 바뀐 프레임에 PointerDown/Up, 바퀴는 WheelEvent. IMGUI Event 로 만들어 기본 이벤트 시스템과 같은 꼴(마우스 pointerId).
        public static void SendMouse()
        {
            if (!FakeMouse.Active) return;
            var flipped = Flip(FakeMouse.Position);
            var buttons = 0;
            for (var b = 0; b < 3; b++)
                if (FakeKeys.Held(KeyCode.Mouse0 + b)) buttons |= 1 << b;
            if (FakeMouse.Moved) Mouse(EventType.MouseMove, 0, flipped, Vector2.zero, buttons);
            for (var b = 0; b < 3; b++)
            {
                var bit = 1 << b;
                if ((buttons & bit) != 0 && (_mouseButtons & bit) == 0) Mouse(EventType.MouseDown, b, flipped, Vector2.zero, buttons);
                if ((buttons & bit) == 0 && (_mouseButtons & bit) != 0) Mouse(EventType.MouseUp, b, flipped, Vector2.zero, buttons);
            }
            _mouseButtons = buttons;
            // IMGUI 바퀴는 아래가 + 라 옛 Input 꼴(위가 +)을 뒤집는다.
            if (FakeMouse.Scroll != Vector2.zero) Mouse(EventType.ScrollWheel, 0, flipped, new Vector2(FakeMouse.Scroll.x, -FakeMouse.Scroll.y), buttons);
        }

        // 단추를 누른 동안만 panel 을 붙잡는다 — 안 누른 hover 는 프레임마다 맨 앞 panel 을 다시 고른다.
        private static void Mouse(EventType type, int button, Vector2 flipped, Vector2 delta, int buttons)
        {
            var panel = Target(PointerId.mousePointerId, flipped, type == EventType.MouseDown || buttons == 0, buttons == 0);
            if (panel == null) return;
            var e = new Event { type = type, button = button, delta = delta, mousePosition = RuntimePanelUtils.ScreenToPanel(panel, flipped) };
            EventBase pooled;
            switch (type)
            {
                case EventType.MouseMove: pooled = PointerMoveEvent.GetPooled(e); break;
                case EventType.MouseDown: pooled = PointerDownEvent.GetPooled(e); break;
                case EventType.MouseUp: pooled = PointerUpEvent.GetPooled(e); break;
                default: pooled = WheelEvent.GetPooled(e); break;
            }
            using (pooled) panel.visualTree.SendEvent(pooled);
        }
```

  - `Pick` 의 `new Vector2(screen.x, Screen.height - screen.y)` 는 `Flip(screen)` 으로. 주석 첫 줄을 「… 옛 Input 게임에는 가짜 터치 · 마우스를 panel 에 Pointer · Wheel 이벤트로 보낸다」로
- [ ] **Step 7: `Input.cs`** — 마우스 · 바퀴 · 기울기 · `anyKeyDown`. 주석 머리의 「터치 · 마우스 왼쪽 단추 · 키(KeyCode)만 가짜를 섞고」 → 「터치 · 마우스(자리 · 단추 · 바퀴) · 키(KeyCode) · 축 · 가상 단추 · 가속도만 가짜를 섞고」

```cs
    // 진짜 폰은 simulateMouseWithTouches(기본 켜짐)일 때 첫 손가락을 마우스 왼쪽 단추로 비춘다 — 가짜 손가락도 같게. 가짜 마우스(mouse-move)가 켜졌으면 그 자리.
    private static bool Mirrored(int button) => button == 0 && UnityEngine.Input.simulateMouseWithTouches;
    public static bool mousePresent => UnityEngine.Input.mousePresent || FakeMouse.Active;
    public static Vector3 mousePosition => Mirrored(0) && FakeTouches.MousePosition is Vector2 p ? (Vector3)p : FakeMouse.Active ? (Vector3)FakeMouse.Position : UnityEngine.Input.mousePosition;
    public static Vector2 mouseScrollDelta => UnityEngine.Input.mouseScrollDelta + FakeMouse.Scroll;
    public static bool GetMouseButton(int button) => UnityEngine.Input.GetMouseButton(button) || (Mirrored(button) && FakeTouches.MouseHeld) || FakeKeys.Held(FakeKeys.MouseKey(button));
    public static bool GetMouseButtonDown(int button) => UnityEngine.Input.GetMouseButtonDown(button) || (Mirrored(button) && FakeTouches.MouseDown) || FakeKeys.Down(FakeKeys.MouseKey(button));
    public static bool GetMouseButtonUp(int button) => UnityEngine.Input.GetMouseButtonUp(button) || (Mirrored(button) && FakeTouches.MouseUp) || FakeKeys.Up(FakeKeys.MouseKey(button));
```

  `anyKeyDown` 은 `UnityEngine.Input.anyKeyDown || FakeKeys.AnyDown`, `acceleration` 은 `FakeInput.Tilt ?? UnityEngine.Input.acceleration`
- [ ] **Step 8: `ControlServer.cs`** — 지금 명령을 일로
  - `Update` 의 `FakeTouches.Idle` 둘을 `FakeInput.Idle` 로, `_cancel = FakeTouches.Cancel;` 을 `_cancel = FakeInput.Reset;` 로(주석 「시간 초과(3)면 답할 곳이 없다 — 남은 가짜 입력을 거두고 넘어간다」는 그대로)
  - `Touched` 위에

```cs
        private const string AllDown = "손가락 10개가 다 눌려 있습니다 — touch-up · input-reset 으로 뗍니다";

        // 비어 있는 손가락으로 일을 건다 — 10개가 다 눌려 있으면 실패 글.
        private static string WithFinger(Func<int, IEnumerator> job, string reply)
        {
            var finger = FakeTouches.Free();
            if (finger < 0) return Error(AllDown);
            FakeInput.Run(job(finger));
            return reply;
        }
```

  - `tap` 은 `return WithFinger(f => FakeInput.Tap(f, point, 1, 0), Touched(point));`, `click` 은 `return WithFinger(f => FakeInput.Tap(f, at, 1, 0), Touched(at));`, `drag` 는 `return WithFinger(f => FakeInput.Path(f, new[] { from, to }, 0), Touched(to));`, `key` 는 `FakeKeys.Press(key);` 를 `FakeInput.Run(FakeInput.Keys(new[] { key }, 1, 0));` 로
- [ ] **Step 9: 컴파일 확인** — `UNITY_REF_DIR=/Users/maxi.moff/Projects/control_cli/.claude/worktrees/p2b/tools/unity-compile-check/.cache python3 tools/unity-compile-check/check.py 6000.0` → 입력 설정 셋(옛 Input · Input System · 둘 다) 모두 성공. 그 폴더가 없으면 `python3 tools/unity-compile-check/check.py fetch 6000.0` 먼저(`.cache` 1.5GB). `npm run -s build && node --test dist/sdk-meta.test.js` 도 통과
- [ ] **Step 10: 커밋** — `git commit -m "SDK 입력 상태 · 일 — 손가락 10개 · 키 세기 · 가짜 마우스 · 기울기를 프레임 일로, 옛 Input · Input System · UI Toolkit 직접 길로 내보내기"`

### Task 6: Unity SDK — 옛 Input 축 표

**Files:** Create `sdk/unity/Id/ControlCliAxes.cs` · `sdk/unity/Editor/BakeAxes.cs`(+ .meta 둘), Modify `sdk/unity/Runtime/FakeKeys.cs` · `sdk/unity/Input/Input.cs`

- [ ] **Step 1: `ControlCliAxes.cs`(새, `ControlCli.Id`)**

```cs
// QA 빌드 훅(ControlCli.Editor.BakeAxes)이 장면마다 구워 넣는 InputManager 축 표 — 깨어나면 static 표로 옮기고 제 오브젝트를 지운다. 정의 제약 없는 어셈블리라 Editor 가 CONTROL_CLI 없이도 붙인다
using System;
using UnityEngine;

namespace ControlCli
{
    [AddComponentMenu("")]
    public sealed class ControlCliAxes : MonoBehaviour
    {
        [Serializable]
        public sealed class Axis
        {
            public string name, positive, negative, altPositive, altNegative;
            public float sensitivity;
            public bool invert;
            // 0 키 · 마우스 단추 · 1 마우스 이동 · 2 조이스틱 축
            public int type;
            // 마우스 이동 축의 번호 — 0 X · 1 Y · 2 바퀴
            public int axis;
        }

        public Axis[] axes;

        // 처음 깨어난 장면의 표 — 장면마다 같은 표라 하나만 둔다. 없으면(축 훅 전 빌드) null.
        public static Axis[] Table { get; private set; }

        private void Awake()
        {
            if (Table == null) Table = axes;
            Destroy(gameObject);
        }
    }
}
```

- [ ] **Step 2: `BakeAxes.cs`(새, `ControlCli.Editor`)** — 영구 id 훅(`StampIds`)과 같은 자리

```cs
// QA 빌드가 장면을 구울 때 InputManager 축 표를 [ControlCliAxes] 오브젝트로 넣는다 — Unity 는 실행 중에 축 설정을 읽는 API 가 없어, 옛 Input 의 GetAxis · GetButton 이 가짜 키를 따르게 한다
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ControlCli.Editor
{
    internal sealed class BakeAxes : IProcessSceneWithReport
    {
        public int callbackOrder => 0;

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            // 에디터 재생(report 가 null)은 건너뛴다.
            if (report == null) return;
            var axes = Read();
            var go = new GameObject("[ControlCliAxes]");
            SceneManager.MoveGameObjectToScene(go, scene);
            go.AddComponent<ControlCliAxes>().axes = axes;
            // sample 빌드 로그에서 본다 — 0 이면 InputManager.asset 을 못 읽었다.
            Debug.Log("[ControlCli] " + scene.path + " 축 " + axes.Length + "개");
        }

        private static ControlCliAxes.Axis[] Read()
        {
            var list = new List<ControlCliAxes.Axis>();
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset");
            if (assets.Length == 0) return list.ToArray();
            var all = new SerializedObject(assets[0]).FindProperty("m_Axes");
            for (var i = 0; i < all.arraySize; i++)
            {
                var a = all.GetArrayElementAtIndex(i);
                var invert = a.FindPropertyRelative("invert");
                list.Add(new ControlCliAxes.Axis
                {
                    name = a.FindPropertyRelative("m_Name").stringValue,
                    positive = a.FindPropertyRelative("positiveButton").stringValue,
                    negative = a.FindPropertyRelative("negativeButton").stringValue,
                    altPositive = a.FindPropertyRelative("altPositiveButton").stringValue,
                    altNegative = a.FindPropertyRelative("altNegativeButton").stringValue,
                    sensitivity = a.FindPropertyRelative("sensitivity").floatValue,
                    invert = invert.propertyType == SerializedPropertyType.Boolean ? invert.boolValue : invert.intValue != 0,
                    type = a.FindPropertyRelative("type").intValue,
                    axis = a.FindPropertyRelative("axis").intValue,
                });
            }
            return list.ToArray();
        }
    }
}
```

- [ ] **Step 3: `FakeKeys.cs`** — 축 · 가상 단추. `Tick` 위에

```cs
        // 옛 Input 축 — QA 빌드가 구운 InputManager 축 표에서 그 이름 축들을 본다(같은 이름이 여럿이면 절댓값이 큰 것, Unity 와 같게).
        // 단추 축은 양쪽 키(positive · alt positive)가 +세기, 음쪽이 −세기 · 마우스 축은 가짜 마우스 이동량 × sensitivity. 조이스틱 축은 흉내 내지 않는다(AltTester 도).
        public static float Axis(string name)
        {
            var table = ControlCliAxes.Table;
            if (table == null) return 0;
            float best = 0;
            foreach (var a in table)
            {
                if (a.name != name) continue;
                float v;
                if (a.type == 0) v = Mathf.Clamp(Strength(a.positive, a.altPositive) - Strength(a.negative, a.altNegative), -1, 1);
                else if (a.type == 1) v = (a.axis == 0 ? FakeMouse.Delta.x : a.axis == 1 ? FakeMouse.Delta.y : FakeMouse.Scroll.y) * a.sensitivity;
                else continue;
                if (a.invert) v = -v;
                if (Mathf.Abs(v) > Mathf.Abs(best)) best = v;
            }
            return best;
        }

        // GetButton* — 그 이름 축의 양쪽 키를 가짜로 누름 · 이번 프레임 누름 · 뗌
        public static bool ButtonHeld(string name) => Named(name, Shown.Keys);
        public static bool ButtonDown(string name) => Named(name, DownNow);
        public static bool ButtonUp(string name) => Named(name, UpNow);

        private static bool Named(string axis, IEnumerable<KeyCode> keys)
        {
            var table = ControlCliAxes.Table;
            if (table == null) return false;
            foreach (var k in keys)
            {
                var n = NameOf(k);
                foreach (var a in table)
                    if (a.name == axis && a.type == 0 && (a.positive == n || a.altPositive == n)) return true;
            }
            return false;
        }

        // 그 단추 이름들 중 누른 것의 세기(없으면 0)
        private static float Strength(string a, string b)
        {
            foreach (var kv in Shown)
            {
                var n = NameOf(kv.Key);
                if ((n == a || n == b) && !string.IsNullOrEmpty(n)) return kv.Value;
            }
            return 0;
        }

        // KeyCode → InputManager 단추 이름(a · 1 · [1] · up · left shift · left ctrl · mouse 0 · joystick button 0 · joystick 1 button 0 · f1)
        internal static string NameOf(KeyCode k)
        {
            if (k >= KeyCode.A && k <= KeyCode.Z) return ((char)('a' + (k - KeyCode.A))).ToString();
            if (k >= KeyCode.Alpha0 && k <= KeyCode.Alpha9) return ((char)('0' + (k - KeyCode.Alpha0))).ToString();
            if (k >= KeyCode.Keypad0 && k <= KeyCode.Keypad9) return "[" + (k - KeyCode.Keypad0) + "]";
            if (k >= KeyCode.Mouse0 && k <= KeyCode.Mouse6) return "mouse " + (k - KeyCode.Mouse0);
            if (k >= KeyCode.JoystickButton0 && k <= KeyCode.JoystickButton19) return "joystick button " + (k - KeyCode.JoystickButton0);
            if (k >= KeyCode.Joystick1Button0 && k <= KeyCode.Joystick8Button19)
            {
                var n = k - KeyCode.Joystick1Button0;
                return "joystick " + (n / 20 + 1) + " button " + n % 20;
            }
            switch (k)
            {
                case KeyCode.UpArrow: return "up";
                case KeyCode.DownArrow: return "down";
                case KeyCode.LeftArrow: return "left";
                case KeyCode.RightArrow: return "right";
                case KeyCode.LeftControl: return "left ctrl";
                case KeyCode.RightControl: return "right ctrl";
                case KeyCode.LeftCommand: return "left cmd";
                case KeyCode.RightCommand: return "right cmd";
                case KeyCode.KeypadPlus: return "[+]";
                case KeyCode.KeypadMinus: return "[-]";
                case KeyCode.KeypadMultiply: return "[*]";
                case KeyCode.KeypadDivide: return "[/]";
                case KeyCode.KeypadPeriod: return "[.]";
                case KeyCode.KeypadEnter: return "enter";
            }
            // 나머지는 낱말 사이를 띄우고 작게 — LeftShift → left shift · PageUp → page up · F1 → f1 · Space → space
            // ponytail: 기호 키(BackQuote · Equals …)는 InputManager 이름(` · =)과 다르다 — 그 키를 축에 쓰는 게임이 오면 짝을 더한다.
            var s = k.ToString();
            var b = new System.Text.StringBuilder(s.Length + 4);
            for (var i = 0; i < s.Length; i++)
            {
                if (i > 0 && char.IsUpper(s[i]) && !char.IsUpper(s[i - 1])) b.Append(' ');
                b.Append(char.ToLowerInvariant(s[i]));
            }
            return b.ToString();
        }
```

  `NameOf` 는 Editor 없이 확인할 길이 없어 실기기 축 줄(InputManager 기본 축 Horizontal 의 `right` · Fire1 의 `left ctrl` · `joystick button 0`)이 본다
- [ ] **Step 4: `Input.cs`** — 축 · 가상 단추

```cs
    // 축 · 가상 단추 — QA 빌드가 구운 InputManager 축 표로 가짜 키 · 마우스를 따른다. 가짜 값과 진짜 값 중 절댓값이 큰 쪽.
    private static float Larger(float fake, float real) => Mathf.Abs(fake) > Mathf.Abs(real) ? fake : real;
    public static float GetAxis(string axisName) => Larger(FakeKeys.Axis(axisName), UnityEngine.Input.GetAxis(axisName));
    public static float GetAxisRaw(string axisName) => Larger(FakeKeys.Axis(axisName), UnityEngine.Input.GetAxisRaw(axisName));
    public static bool GetButton(string buttonName) => UnityEngine.Input.GetButton(buttonName) || FakeKeys.ButtonHeld(buttonName);
    public static bool GetButtonDown(string buttonName) => UnityEngine.Input.GetButtonDown(buttonName) || FakeKeys.ButtonDown(buttonName);
    public static bool GetButtonUp(string buttonName) => UnityEngine.Input.GetButtonUp(buttonName) || FakeKeys.ButtonUp(buttonName);
```

- [ ] **Step 5: 컴파일 확인** — Task 5 Step 9 와 같은 명령 · `node --test dist/sdk-meta.test.js`. `BakeAxes` 는 Editor 어셈블리라 check.py 가 굽지 않는다 — sample 빌드(PR 의 sample 워크플로)가 본다
- [ ] **Step 6: 커밋** — `git commit -m "SDK 옛 Input 축 — QA 빌드가 InputManager 축 표를 장면에 굽고 GetAxis · GetButton 이 가짜 키 · 마우스를 따른다"`

### Task 7: Unity SDK — 새 명령 · 바뀐 칸 · 0.6.0

**Files:** Modify `sdk/unity/Runtime/ControlServer.cs` · `sdk/unity/package.json` · `package.json`

- [ ] **Step 1: `Command` 칸** — `format` 다음에. `x` · `y` 는 「칸 없음」을 가르려고 NaN 으로 시작한다(JsonUtility 는 없는 칸을 건드리지 않는다 — `scale = -1` 과 같은 까닭)

```cs
            // 입력(P2-C) — 0 이 뜻 있는 칸은 「칸 없음」과 갈라 둔다.
            public int finger = -1;
            public float duration = -1;
            public int count = 1;
            public float interval = 0.1f;
            public float power = 1;
            public string[] via;
            public string[] points;
            public float dx;
            public float dy;
            public float z;
            public string @event;
```

  그리고 `public float x;` · `public float y;` 를 `public float x = float.NaN;` · `public float y = float.NaN;` 로. `using System.Globalization;` · `using UnityEngine.EventSystems;` 를 더한다
- [ ] **Step 2: 도우미** — `WithFinger` 아래에

```cs
        private const string PointsForm = "swipe 의 points 는 \"x,y\" 글자 둘 이상입니다 — [\"540,400\", \"540,900\"]";

        // 명령 하나는 8초 안 — SDK 답 한도 10초 · 팜 15초. 더 오래 누르기는 down/up 두 명령으로. 횟수 · 세기 칸도 여기서 본다.
        private static string Limits(Command c)
        {
            if (c.count < 1) return Error("count 는 1 이상입니다");
            if (c.power < -1 || c.power > 1) return Error("power 는 -1~1 입니다");
            var seconds = Mathf.Max(c.duration, 0) + (c.count - 1) * Mathf.Max(c.interval, 0);
            return seconds > FakeInput.LongestSeconds ? Error(c.cmd + " 은 " + FakeInput.LongestSeconds + "초 안이어야 합니다 — 더 길게는 touch-down · key-down 뒤 touch-up · key-up") : null;
        }

        // 한 점 명령의 자리 — target 이 있으면 그 오브젝트 화면 가운데, 없으면 x · y.
        private static bool At(Command c, out Vector2 point, out string problem)
        {
            point = default;
            if (!CameraOf(c.camera, out var cam, out problem)) return false;
            if (!string.IsNullOrEmpty(c.target)) return Point(c.target, cam, out point, out problem);
            if (float.IsNaN(c.x) || float.IsNaN(c.y))
            {
                problem = c.cmd + " 에 target 또는 x · y 가 필요합니다";
                return false;
            }
            point = new Vector2(c.x, c.y);
            return true;
        }

        // A+LeftShift — KeyCode 이름을 + 로 이어 함께 누른다(대소문자 무시).
        private static bool Keys(string text, out KeyCode[] keys, out string problem)
        {
            var parts = (text ?? "").Split('+');
            keys = new KeyCode[parts.Length];
            problem = null;
            for (var i = 0; i < parts.Length; i++)
            {
                if (Enum.TryParse(parts[i].Trim(), true, out keys[i]) && keys[i] != KeyCode.None) continue;
                problem = "모르는 키입니다: " + parts[i] + " (KeyCode 이름 — Escape · Space · Return · A · Alpha1 · F1 · UpArrow · Mouse0 · JoystickButton0 …, 여럿은 A+LeftShift)";
                return false;
            }
            return true;
        }

        private static string NotDown(int finger) => "손가락 " + finger + " 은 눌려 있지 않습니다 — touch-down 이 준 번호를 씁니다";

        // AltTester PointerDown/Up/Enter/Exit — 그 GameObject 하나의 EventSystem 처리기를 바로 부른다(부모로 안 올린다). position 은 그 오브젝트 화면 가운데.
        private static string PointerReply(Command c)
        {
            var item = Tree.Find(c.target, out var problem);
            if (!item.Exists) return Error(problem);
            if (item.Go == null) return Error(c.target + " 은 UI Toolkit 요소라 pointer 를 못 보냅니다 — mouse-move · touch-down 으로");
            var data = new PointerEventData(EventSystem.current) { position = Tree.ScreenPoint(item) ?? Vector2.zero, pointerEnter = item.Go, pointerPress = item.Go };
            switch (c.@event)
            {
                case "down": ExecuteEvents.Execute(item.Go, data, ExecuteEvents.pointerDownHandler); break;
                case "up": ExecuteEvents.Execute(item.Go, data, ExecuteEvents.pointerUpHandler); break;
                case "enter": ExecuteEvents.Execute(item.Go, data, ExecuteEvents.pointerEnterHandler); break;
                case "exit": ExecuteEvents.Execute(item.Go, data, ExecuteEvents.pointerExitHandler); break;
                default: return Error("event 는 down · up · enter · exit 중 하나입니다");
            }
            return "{\"ok\":true}";
        }
```

- [ ] **Step 3: 갈래** — `Handle` 의 `tap` · `key` · `click` · `drag` 를 바꾸고 새 갈래를 더한다. 맨 앞(`switch` 앞)에 `if (Limits(c) is string limit) return limit;`(입력 밖 명령은 기본값이라 걸리지 않는다)

```cs
                case "tap":
                {
                    var point = new Vector2(c.x, c.y);
                    return WithFinger(f => FakeInput.Tap(f, point, c.count, c.interval), Touched(point));
                }
                case "key":
                {
                    // 키 이름은 KeyCode 이름(대소문자 무시) — Escape 는 폰 뒤로 키와 같다(Unity 가 뒤로 키를 Escape 로 준다).
                    if (!Keys(c.key, out var keys, out var problem)) return Error(problem);
                    FakeInput.Run(FakeInput.Keys(keys, c.power, Mathf.Max(c.duration, 0)));
                    return "{\"ok\":true,\"key\":" + Json.Str(string.Join("+", keys)) + "}";
                }
                case "click":
                {
                    if (!CameraOf(c.camera, out var cam, out var problem)) return Error(problem);
                    if (!Point(c.target, cam, out var at, out problem)) return Error(problem);
                    return WithFinger(f => FakeInput.Tap(f, at, c.count, c.interval), Touched(at));
                }
                case "drag":
                {
                    if (!CameraOf(c.camera, out var cam, out var problem)) return Error(problem);
                    var stops = new List<string> { c.target };
                    if (c.via != null) stops.AddRange(c.via);
                    stops.Add(c.to);
                    var points = new Vector2[stops.Count];
                    for (var i = 0; i < stops.Count; i++)
                        if (!Point(stops[i], cam, out points[i], out problem)) return Error(problem);
                    return WithFinger(f => FakeInput.Path(f, points, Mathf.Max(c.duration, 0)), Touched(points[points.Length - 1]));
                }
                case "touch-down":
                {
                    if (!At(c, out var p, out var problem)) return Error(problem);
                    var f = FakeTouches.Free();
                    if (f < 0) return Error(AllDown);
                    FakeTouches.Press(f, p, 1);
                    FakeInput.Run(FakeInput.Settle());
                    return "{\"ok\":true,\"finger\":" + f + ",\"x\":" + Mathf.RoundToInt(p.x) + ",\"y\":" + Mathf.RoundToInt(p.y) + "}";
                }
                case "touch-move":
                {
                    if (!FakeTouches.IsDown(c.finger)) return Error(NotDown(c.finger));
                    if (!At(c, out var p, out var problem)) return Error(problem);
                    FakeTouches.Move(c.finger, p);
                    FakeInput.Run(FakeInput.Settle());
                    return Touched(p);
                }
                case "touch-up":
                    if (!FakeTouches.IsDown(c.finger)) return Error(NotDown(c.finger));
                    FakeTouches.Release(c.finger);
                    FakeInput.Run(FakeInput.Settle());
                    return "{\"ok\":true}";
                case "swipe":
                {
                    var points = new List<Vector2>();
                    foreach (var s in c.points ?? new string[0])
                    {
                        var xy = s.Split(',');
                        if (xy.Length != 2 || !float.TryParse(xy[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var px) || !float.TryParse(xy[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var py)) return Error(PointsForm);
                        points.Add(new Vector2(px, py));
                    }
                    if (points.Count < 2) return Error(PointsForm);
                    return WithFinger(f => FakeInput.Path(f, points.ToArray(), Mathf.Max(c.duration, 0)), Touched(points[points.Count - 1]));
                }
                case "hold":
                {
                    if (!At(c, out var p, out var problem)) return Error(problem);
                    var seconds = c.duration < 0 ? 1 : c.duration;
                    return WithFinger(f => FakeInput.Hold(f, p, seconds), Touched(p));
                }
                case "mouse-move":
                {
                    if (!At(c, out var p, out var problem)) return Error(problem);
                    FakeInput.Run(FakeInput.MouseTo(p, Mathf.Max(c.duration, 0)));
                    return Touched(p);
                }
                case "scroll":
                {
                    Vector2? at = null;
                    if (!string.IsNullOrEmpty(c.target) || !float.IsNaN(c.x))
                    {
                        if (!At(c, out var p, out var problem)) return Error(problem);
                        at = p;
                    }
                    FakeInput.Run(FakeInput.Scroll(at, new Vector2(c.dx, c.dy), Mathf.Max(c.duration, 0)));
                    return "{\"ok\":true}";
                }
                case "key-down":
                case "key-up":
                {
                    if (!Keys(c.key, out var keys, out var problem)) return Error(problem);
                    foreach (var k in keys)
                        if (c.cmd == "key-down") FakeKeys.Press(k, c.power);
                        else FakeKeys.Release(k);
                    FakeInput.Run(FakeInput.Settle());
                    return "{\"ok\":true}";
                }
                case "tilt":
                    if (float.IsNaN(c.x) || float.IsNaN(c.y)) return Error("tilt 에 x · y · z 가 필요합니다");
                    FakeInput.Run(FakeInput.TiltFor(new Vector3(c.x, c.y, c.z), Mathf.Max(c.duration, 0)));
                    return "{\"ok\":true}";
                case "pointer":
                    return PointerReply(c);
                case "input-reset":
                    FakeInput.Reset();
                    FakeInput.Run(FakeInput.Settle());
                    return "{\"ok\":true}";
```

  `FakeKeys.Press` · `Release` · `FakeTouches.Press` · `Move` · `Release` 는 `internal` 이다 — 같은 `ControlCli.Runtime` 어셈블리라 그대로 부른다. `Limits` 를 `switch` 앞에 두면 `find` · `get` 같은 명령도 지나가지만 그 칸은 기본값(count 1 · power 1 · duration -1)이라 걸리지 않는다
- [ ] **Step 4: 판** — `SdkVersion = "0.6.0"` · `sdk/unity/package.json` · `package.json` 의 version `0.6.0`
- [ ] **Step 5: 확인** — 컴파일(Task 5 Step 9 의 명령) · `npm run -s build && node --test dist/protocol.test.js dist/sdk-meta.test.js` → Caps · 판 대조 통과
- [ ] **Step 6: 커밋** — `git commit -m "SDK 0.6.0 — touch-down/move/up · swipe · hold · mouse-move · scroll · key-down/up · tilt · pointer · input-reset · 횟수 · via · 시간 · 세기 · 여러 키"`

### Task 8: 표준 화면 · sample CI

**Files:** Create `sample/Assets/Sample/InputProbe.cs` · `PointerBox.cs`(샘플은 .meta 를 커밋하지 않는다 — Unity 가 만든다), Modify `sample/Assets/Sample/SampleScreen.cs` · `SampleUitk.cs` · `.github/workflows/sample.yml`

자리(1080×1920 기준, 줄 = 위에서 `-100 - 줄×200`) — 왼쪽 칸 0~5 줄 · 오른쪽 칸 0~3 줄 · 5 줄(HiddenText, 꺼짐)은 차 있다. 오른쪽 4 줄에 HoldBox(왼 반) · PointerText(오른 반), 6 줄에 InputText(왼쪽) · ScrollList(오른쪽). 6 줄 아래 끝(1440)은 UI Toolkit 칸 위 끝(1480)보다 위다.

- [ ] **Step 1: `InputProbe.cs`(새)**

```cs
// 게임 코드처럼 손가락 수 · 누른 키 · 축 · 가상 단추 · 기울기를 읽어 InputText 에 적는다 — 옛 Input 과 Input System 이 같은 글자가 되는지 conform C 줄이 본다
using UnityEngine;
using UnityEngine.UI;

namespace Sample
{
    public sealed class InputProbe : MonoBehaviour
    {
        public Text Output;
        private string _tilt = "-";

        private void Update()
        {
            var fingers = 0;
            var keys = "";
            float axis, tilt;
            bool fire;
#if SAMPLE_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            var screen = UnityEngine.InputSystem.Touchscreen.current;
            if (screen != null)
                foreach (var t in screen.touches)
                    if (t.press.isPressed) fingers++;
            // PC 는 SDK 가 마우스 손가락을 Mouse 왼 단추로 넣는다.
            var mouse = UnityEngine.InputSystem.Mouse.current;
            if (!Application.isMobilePlatform && mouse != null && mouse.leftButton.isPressed) fingers++;
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb != null)
            {
                if (kb.aKey.isPressed) keys += " A";
                if (kb.leftShiftKey.isPressed) keys += " LeftShift";
                if (kb.wKey.isPressed) keys += " W";
            }
            var pad = UnityEngine.InputSystem.Gamepad.current;
            axis = pad != null ? pad.leftStick.x.ReadValue() : 0;
            fire = pad != null && pad.buttonSouth.isPressed;
            var acc = UnityEngine.InputSystem.Accelerometer.current;
            tilt = acc != null ? acc.acceleration.ReadValue().y : 0;
#else
            for (var i = 0; i < Input.touchCount; i++)
            {
                var phase = Input.GetTouch(i).phase;
                if (phase != TouchPhase.Ended && phase != TouchPhase.Canceled) fingers++;
            }
            foreach (var k in new[] { KeyCode.A, KeyCode.LeftShift, KeyCode.W })
                if (Input.GetKey(k)) keys += " " + k;
            // InputManager 기본 축 — Horizontal(left · right · a · d) · Fire1(left ctrl · mouse 0 · joystick button 0).
            axis = Input.GetAxis("Horizontal");
            fire = Input.GetButton("Fire1");
            tilt = Input.acceleration.y;
#endif
            // 진짜 기울기는 늘 흔들린다 — 사람이 못 내는 큰 값(conform 은 20~49)만 남긴다.
            if (Mathf.Abs(tilt) > 10) _tilt = Mathf.RoundToInt(tilt).ToString();
            var text = "fingers " + fingers + " · keys " + (keys.Length > 0 ? keys.Substring(1) : "-") + " · axis " + Mathf.RoundToInt(axis) + " · fire " + (fire ? 1 : 0) + " · tilt " + _tilt;
            if (Output.text != text) Output.text = text;
        }
    }
}
```

- [ ] **Step 2: `PointerBox.cs`(새)**

```cs
// 누르면 PointerText 에 마지막 Pointer 이벤트(down · up · enter · exit)와 누른 초를 적는 uGUI 칸 — hold · mouse-move · pointer 명령 확인용
using System.Globalization;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Sample
{
    public sealed class PointerBox : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerEnterHandler, IPointerExitHandler
    {
        public Text Output;
        private float _downAt;
        private string _held = "-";

        private void Start() => Show("-");

        public void OnPointerDown(PointerEventData e)
        {
            _downAt = Time.unscaledTime;
            Show("down");
        }

        public void OnPointerUp(PointerEventData e)
        {
            _held = (Time.unscaledTime - _downAt).ToString("0.0", CultureInfo.InvariantCulture);
            Show("up");
        }

        public void OnPointerEnter(PointerEventData e) => Show("enter");
        public void OnPointerExit(PointerEventData e) => Show("exit");

        private void Show(string last) => Output.text = "last " + last + " · held " + _held;
    }
}
```

- [ ] **Step 3: `SampleScreen.cs`**
  - `Build` 의 HiddenText 다음(`#if SAMPLE_TMP` 앞)에

```cs
            // C — 입력 탐침(손가락 · 키 · 축 · 단추 · 기울기)과 Pointer 칸 · 세로 목록.
            var input = Label(root, "InputText", Left, 6);
            input.fontSize = 28;
            canvas.AddComponent<InputProbe>().Output = input;
            var pointerText = Label(root, "PointerText", Right, 4);
            pointerText.fontSize = 28;
            var holdBox = Place(DefaultControls.CreateImage(Look), root, "HoldBox", Right, 4);
            holdBox.GetComponent<Image>().color = new Color(0.6f, 0.8f, 1f);
            holdBox.AddComponent<PointerBox>().Output = pointerText;
            Half((RectTransform)holdBox.transform, -1);
            Half((RectTransform)pointerText.transform, 1);
            BuildList(root);
```

  - `Place` 아래에 도우미 둘

```cs
        // 한 칸(넓이 500)의 반 — side -1 왼쪽 · 1 오른쪽
        private static void Half(RectTransform rect, int side)
        {
            rect.sizeDelta = new Vector2(240, rect.sizeDelta.y);
            rect.anchoredPosition += new Vector2(side * 130, 0);
        }

        // 세로 목록 — swipe · scroll 이 ScrollRect 를 움직이는지. 바퀴 한 칸이 30 픽셀.
        private static void BuildList(Transform root)
        {
            var list = Place(new GameObject("ScrollList", typeof(RectTransform), typeof(Image), typeof(RectMask2D), typeof(ScrollRect)), root, "ScrollList", Right, 6);
            var content = new GameObject("Content", typeof(RectTransform), typeof(VerticalLayoutGroup)).GetComponent<RectTransform>();
            content.SetParent(list.transform, false);
            content.anchorMin = new Vector2(0, 1);
            content.anchorMax = Vector2.one;
            content.pivot = new Vector2(0.5f, 1);
            content.sizeDelta = new Vector2(0, 1000);
            var layout = content.GetComponent<VerticalLayoutGroup>();
            layout.childControlHeight = layout.childForceExpandHeight = true;
            for (var i = 0; i < 10; i++)
            {
                var row = DefaultControls.CreateText(Look).GetComponent<Text>();
                row.text = "row " + i;
                row.fontSize = 40;
                row.transform.SetParent(content, false);
            }
            var scroll = list.GetComponent<ScrollRect>();
            scroll.content = content;
            scroll.horizontal = false;
            scroll.scrollSensitivity = 30;
        }
```

  - `Watch` 의 `else if (scene.name == "Second")` 갈래를

```cs
            else if (scene.name == "Second")
            {
                SceneManager.MoveGameObjectToScene(new GameObject("SecondMarker"), scene);
                // 한 장면으로 열면 EventSystem 이 없다 — UI Toolkit 이 입력을 스스로 읽는 길(SDK 의 UI Toolkit 직접)을 conform C 가 본다.
                if (mode == LoadSceneMode.Single) SampleUitk.BuildSecond();
            }
```

- [ ] **Step 4: `SampleUitk.cs`** — panel 만들기를 도우미로 빼고 `BuildSecond`
  - 지금 `Build` 의 「`settings` 만들기 ~ `doc.rootVisualElement.Add(panel);`」를 `private static VisualElement Panel(string documentName, string panelName)`(GameObject 이름 · panel 이름만 칸으로, 주석 그대로, `return panel;`)으로 옮기고 `Build` 는 `var panel = Panel("UitkDocument", "UitkPanel");` 로 시작한다
  - `Build` 다음에

```cs
        // Second 를 한 장면으로 열 때 — EventSystem 없는 UI Toolkit 칸(SDK 의 UI Toolkit 직접 길). 누르기 · 마우스 들어옴 · 바퀴를 SecondText · scrollOffset 으로 본다.
        public static void BuildSecond()
        {
            var panel = Panel("SecondDocument", "SecondPanel");
            var text = new Label { name = "SecondText" };
            var presses = 0;
            var button = Box(new Button(() => text.text = "second " + ++presses) { name = "SecondButton", text = "Second" });
            // 마우스만 — 터치도 Enter 를 내 click 글자를 덮지 않게.
            button.RegisterCallback<PointerEnterEvent>(e =>
            {
                if (e.pointerId == PointerId.mousePointerId) text.text = "enter";
            });
            var scroll = new ScrollView { name = "SecondScroll" };
            for (var i = 0; i < 20; i++) scroll.Add(new Label("row " + i) { style = { height = 60 } });
            text.style.height = button.style.height = 80;
            scroll.style.height = 200;
            foreach (var e in new VisualElement[] { text, button, scroll })
            {
                e.style.marginBottom = 10;
                panel.Add(e);
            }
        }
```

- [ ] **Step 5: `.github/workflows/sample.yml`** — StandaloneOSX input 0 다음에(아티팩트 이름은 `sample-6000.0.84f1-StandaloneOSX-input1`)

```yaml
          # PC 의 Input System Mouse 길(마우스 손가락 · mouse-move · scroll · Mouse 단추) — 이 맥에서 open --pc 로 실측.
          - unity: 6000.0.84f1
            ugui: 2.0.0
            tmp: ''
            input: 1
            inputsystem: 1.11.2
            target: StandaloneOSX
```

- [ ] **Step 6: 확인** — 컴파일(Task 5 Step 9 의 명령 — check.py 는 `sample/Assets` 도 굽는다). 빌드 스크립트 · 장면은 PR 의 sample 워크플로가 본다
- [ ] **Step 7: 커밋** — `git commit -m "표준 화면 C — InputText 탐침 · HoldBox · PointerText · ScrollList · Second 의 EventSystem 없는 UI Toolkit 칸, sample 에 macOS Input System 빌드"`

### Task 9: README · AltTester 표

**Files:** Modify `README.md` · `docs/roadmap/plan.md`

- [ ] README — SDK 명령 표에 12줄(`touch-down` … `input-reset`) + 바뀐 칸(`tap` · `click` 의 `count` · `interval`, `drag` 의 `via` · `duration`, `key` 의 `duration` · `power` · `A+LeftShift`), CLI 명령 표(새 명령 · `--count` · `--interval` · `--via` · `--duration` · `--power` · `--dx`), MCP 도구 표 줄. 「가짜 입력」 절 하나 — 세 길(옛 Input 감싸기 · Input System 장치 · UI Toolkit 직접)과 손가락 번호 10~19 · 명령 하나 8초 · 진짜 입력은 섞는다 · PC Input System 은 마우스 손가락 + 나머지 Touchscreen · 옛 Input 축은 QA 빌드 훅이 InputManager 축을 굽는다(조이스틱 축은 안 함) · JoystickButton0~19 짝(설계 표 「키 · 세기」 줄)
- [ ] plan.md 1절 — 「입력」 P2-C 줄 ✓(`key-down` · `key-up` · `hold` · `key A+B` · `mouse-move` · `scroll` · `swipe` · `drag --via` · `touch-down/move/up` · `tilt` · `input-reset` · 조이스틱 `JoystickButton` · `pointer`), 머리말 셈에 「P2-C 뒤」 값 — 그 줄의 AltTester 명령(KeyDown · KeyUp · HoldButton · PressKeys · MoveMouse · Scroll · MultipointSwipe · BeginTouch · MoveTouch · EndTouch · Tilt · ResetInput · Pointer 넷)을 22.5/68 셈과 같은 규칙으로 더한다(context-notes 「범위」)
- [ ] 커밋 — `git commit -m "README — 입력 명령 표 · 가짜 입력 세 길 · AltTester 표 P2-C"`

### Task 10: PR · 실기기 · 다음 세션

- [ ] 전체 `npm test` 한 번 → push → draft PR(`p2c` → `roadmap`) — sdk-compile · sample 이 돈다
- [ ] sample 로그에서 잡마다 「[ControlCli] Assets/Sample.unity 축 N개」(N 은 InputManager 기본 축 수 — 0 이면 `InputManager.asset` 을 못 읽었다)
- [ ] 팜 — **폰은 사용자가 정한 serial 만**(2026-11-04 사용자 「RF9R408GKRR 폰 잠깐 쓰지마 써도 될때 얘기해줄게」 — 그 말이 있기 전에는 쓰지 않는다. 다른 폰도 정해 주지 않았으면 묻는다). sample run 의 APK 로 `hold --udid <serial>` → `open --app` → `conform` → 「통과 48 · 실패 0 · 건너뜀 0」 → `close` — 6000.0 옛 Input · 6000.0 Input System · 2021.3 옛 Input · 2022.3 둘 다(Input System 과 옛 Input 이 함께 — 탐침은 Input System 쪽), 다 돌면 `release`
- [ ] 이 맥 — `caffeinate -d -u -t 900` 을 건 채 macOS 앱 둘(input0 · input1)을 `open --pc --app` → `conform` 48/0/0 → `close`. 그동안 마우스 · 키보드를 만지지 않는다(Input System 은 진짜 장치에 상태를 넣는다)
- [ ] 줄이 실패하면 superpowers:systematic-debugging — 먼저 의심할 곳: ① C UI Toolkit 직접 줄 — `GetPooled(Event)` 의 panel 좌표 · `PointerEnterEvent` 가 마우스 pointerId 로 오는지 ② scroll 줄 — Input System 의 바퀴 값 크기(`InputSystemUIInputModule.scrollDeltaPerTick`) ③ tilt 줄 — 더한 `Accelerometer` 가 `Accelerometer.current` 인지 ④ 축 줄 — `NameOf` 가 InputManager 이름과 맞는지(`[ControlCliAxes]` 표를 `static-get ControlCli.ControlCliAxes.Table` 로 본다)
- [ ] checklist P2-C 체크 · context-notes 「P2-C 구현」 · 「P2-C 실기기」(계획과 다르게 한 것 · run 번호 · 폰 serial) · 맨 위 「다음 세션은 여기부터」를 P2-D 로 · test_platform kit 다음 줄 — `touchDown` · `touchMove` · `touchUp` · `swipe` · `hold` · `mouseMove` · `scroll` · `keyDown` · `keyUp` · `tilt` · `pointer` · `resetInput`, `click` · `tap` · `drag` · `key` 의 옵션 `{ count?, interval?, via?, duration?, power? }`(꼴은 control_cli `src/game.ts`)
