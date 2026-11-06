# P2-B Unity 찾기 · 설정 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AltTester 의 찾기 · 오브젝트 · 설정 명령(FindObjects · …WhichContain(s) · FindObjectAtCoordinates · By NAME/PATH/TAG/LAYER/COMPONENT/TEXT/ID · 꺼진 오브젝트 찾기 · 카메라 고르기 · GetParent · GetScreenPosition · WaitForComponentProperty · GetAllComponents/Fields/Properties/Methods · Get/WaitForVisualElementProperty · SetText · Get/SetImplicitTimeout · GetPNGScreenshot)을 control_cli 에 넣고, 표준 화면 `conform` 의 B 줄이 팜 폰에서 초록이 된다.

**Architecture:** 모든 명령의 `target` 한 칸이 AltTester PATH 꼴의 일부(`//` · `*` · `..` · `[@칸=값]` · `[contains(@칸,값)]` · `[n]` · `[-1]`)를 받는다 — 지금 주소 `이름` · `/a/b[n]` 은 그 꼴의 부분집합이라 그대로 돈다. 해석은 `src/select.ts`(가짜 SDK 가 쓰는 기준 구현)와 그것을 옮긴 `Select.cs` 두 곳이다. 새 명령 5개(`find-all` · `find-at` · `components` · `members` · `text-set`)와 새 칸(`inactive` · `camera` · `format`)은 `protocol/commands.json` 에 더해 CLI · MCP · `conform` 이 같이 따라온다. 부모 · 속성 기다리기 · 기본 기다림은 CLI(`Game`)만 한다. 영구 id 는 QA 빌드 훅이 장면 오브젝트마다 fileID 를 붙인다.

**Tech Stack:** TypeScript(Node 22 · `node:test`) · Unity C#(2021.3 · 2022.3 · 6000.0 — reflection · EventSystem · Physics · UI Toolkit `panel.Pick` · `GlobalObjectId` · `IProcessSceneWithReport`) · GitHub Actions(sdk-compile · sample) · 디바이스 팜(사용자가 정한 폰)

로드맵은 [plan.md](plan.md) P2-B, 할 일 체크는 [checklist.md](checklist.md) P2-B, 결정은 [context-notes.md](context-notes.md) 「P2-B 설계」.
브랜치 `p2b`(`origin/roadmap` 위 — PR #17 이 합쳐짐, PR 은 `roadmap` 으로). 테스트는 고친 파일의 테스트만 — `npm run -s build && node --test dist/<이름>.test.js`. 전체 `npm test` 는 Task 9 push 전에 한 번.

## 설계

| 정할 것 | 고른 것 | 까닭 |
|---|---|---|
| 선택자 꼴 | AltTester PATH 꼴의 일부(사용자). `/` 바로 아래 · `//` 아래 어디서나 · `*` 아무 이름 · `..` 부모 · `[@name\|tag\|layer\|component\|text\|id=값]` · `[contains(@칸,값)]` · 조건 이어 붙이기(모두 맞아야) · `[n]` 그 단계에 맞은 형제 중 n번째(0부터) · `[-1]` 마지막. 값의 양끝 공백은 떼고 `'…'` · `"…"` 한 쌍은 벗긴다. `/` 로 시작하지 않는 주소는 지금처럼 이름 그대로 | 지금 `/a/b[n]` 의 `[n]` 이 AltTester 와 같은 뜻(같은 이름 형제 중 0부터 — `//Button/Text[1]`)이라 문법 하나로 이어진다. 접두어(`tag:x`)는 범위 좁히기 · 조건 겹치기 · 부모가 없고 이름 속 `:` 과 겹친다 |
| 여럿이 맞으면 | 고르지 않고 실패 — 이름은 지금 글, 경로 · 선택자는 「맞는 것이 N개라 … [순번] · 조건을 더하거나 find-all 로 경로를 봅니다」 | 지금 규칙(엉뚱한 것을 누르면 케이스가 틀린 곳에서 통과). `/a/b/c` 는 이제 b 가 여럿이어도 c 가 하나면 맞는다(단계마다 모아 내려간다) |
| 칸의 뜻(Unity) | name 은 트리 이름 · tag 는 `GameObject.tag` · layer 는 레이어 이름 또는 번호 · component 는 붙은 컴포넌트 타입 이름 또는 전체 이름(UI Toolkit 요소는 그 요소 타입 — `Button` 은 uGUI · UI Toolkit 둘 다) · text 는 `find` 가 주는 글자(비밀번호 `***`) · id 는 영구 id 또는 instance id. UI Toolkit 요소에 없는 칸(tag · layer · id)은 늘 안 맞는다 | 한 트리로 보는 지금 모양 그대로 |
| 해석 자리 | `src/select.ts`(단계 풀기 · 고르기 · 경로 셈 · 실패 글) + 그것을 옮긴 `sdk/unity/Runtime/Select.cs`. 단계마다 「뿌리에서 그것까지의 줄(trail)」을 들고 내려가 `..` 는 줄 끝을 뗀다 | 가짜 SDK 와 엔진 SDK 가 같은 규칙 · 같은 실패 글. RPG Maker(JS) SDK 는 이 파일을 그대로 쓸 수 있다. 줄을 들고 다니면 위로 올라가는 길(트리에 없는 UI Toolkit 속 칸)이 필요 없다 |
| 옛 SDK | caps 에 `find-all` 이 없는 SDK 에 선택자 · `inactive` · `camera` 를 보내면 `Game` 이 보내기 전에 「SDK 0.5.0 이상」으로 거절 | 옛 `Tree.Find` 는 `//*[@tag=x]` 를 이름으로 찾아 「없음」으로 답해 `wait` 가 10초 내내 헛돈다. `find-all` 이 같은 판에 들어온다 |
| 새 명령 | `find-all {target, inactive?, camera?}` → `{found: [Found…]}` · `find-at {x, y, camera?}` → Found 꼴 · `components {target, inactive?}` → `{components: [{name, type}]}` · `members {target, component, inactive?}` → `{fields, properties, methods}` · `text-set {target, text, inactive?}` → `{text}` | 명령마다 칸이 정해진다(P2-A 와 같은 까닭 — MCP 도구 꼴이 고정이라 AI 가 덜 틀린다) |
| `find` 답 | `{found, path, text?, interactable?, id?, x?, y?, active?}` — `x` · `y` 는 화면 가운데(왼쪽 아래 0,0 · 반올림 정수 · `click` 답과 같은 꼴), 화면에 비친 자리가 없거나 꺼졌으면 없다. `id` 는 게임 오브젝트만. `active: false` 는 `inactive` 로 찾은 꺼진 것 | GetScreenPosition 이 명령 없이 끝난다. 월드 좌표는 `get Transform.position` |
| 꺼진 오브젝트(사용자) | `inactive: true` 칸 — find · find-all · get · set · call · components · members · text-set. 누르기 · 끌기 · `type` · `find-at` 은 켜진 것만. 그때 경로 순번은 꺼진 형제까지 센다 | 꺼진 팝업의 글자 · 칸 확인. 꺼진 것을 누르면 그 자리의 다른 것이 눌린다. 순번이 달라지니 `inactive` 로 받은 경로는 `inactive` 와 같이 쓰거나 `[@id=…]` 로 쓴다 |
| 카메라(사용자) | `camera: <카메라 오브젝트 주소>` 칸 — find · find-all · find-at · click · drag. 월드 오브젝트의 화면 자리 · `find-at` 의 물리 raycast 에만 쓴다(기본 `Camera.main`). 꺼진 Camera 컴포넌트도 된다 | uGUI 는 Canvas 가, UI Toolkit 은 panel 이 제 카메라를 안다. 주 카메라 태그가 없는 게임 · 화면 나눔 게임 |
| 좌표로 찾기 | UI Toolkit(맨 앞 panel 의 `Pick`) → uGUI(`EventSystem.RaycastAll`, 트리에 있는 첫 맞음) → 3D · 2D 물리(카메라 앞 가까운 것). 트리에 없는 속 칸(입력칸 속 글자 칸 · panel 뿌리)이 맞으면 트리에 있는 조상으로 올리고, 끝까지 없으면 다음 길로 | AltTester 와 같은 차례(UI 먼저, 없으면 물리). 버튼 속 글자가 맞을 수 있다 — AltTester 도 맞은 것 그대로 준다 |
| 영구 id(사용자) | QA 빌드 훅(`ControlCli.Editor` 의 `IProcessSceneWithReport`)이 빌드에 드는 장면의 오브젝트마다 `GlobalObjectId` 의 fileID(프리팹 인스턴스는 `<objectId>.<prefabId>`)를 `ControlCliId` 컴포넌트로 붙인다. `ControlCliId` 는 정의 제약 없는 작은 어셈블리 `ControlCli.Id`. `[@id=…]` 는 그 id 먼저, 없으면 instance id. 에디터 재생은 붙이지 않는다 | SDK 는 빌드 잡에서만 게임에 든다 — 장면에 저장하면 보통 빌드에서 Missing Script. 샘플은 `CONTROL_CLI` 를 `extraScriptingDefines`(플레이어만)로 켜 Editor 는 `CONTROL_CLI` 어셈블리를 못 본다 — 그래서 컴포넌트를 제약 없는 어셈블리에 둔다. 실행 중 만든 오브젝트(프리팹 생성)는 instance id |
| 부모 | `Game.parent(target)` = `find` 로 경로를 받아 `<path>/..` 를 `find` — SDK 명령 없음. MCP 는 `find` 에 `..` 를 쓴다 | 선택자 `..` 가 이미 한다 |
| 속성 기다리기 | `Game.waitForProp(target, prop, value, {timeoutMs?, inactive?})` — `get` 을 되풀이. 같음은 JSON 이 같거나, 값이 글자면 그 글자를 JSON 으로 읽은 것과 같을 때(`'10'` · `10` · `'[0, 1, 0]'` 가 다 맞는다). 오브젝트 · 칸이 없으면 바로 실패 | 기다리기는 바깥에서(P2-A). CLI 인자는 늘 글자다 |
| UI Toolkit 속성 | `get` 이 UI Toolkit 요소면 칸 길을 요소에서 바로 읽는다(`value` · `text` · `layout.height`) — 기다리기는 `waitForProp` 그대로. `set` · `call` 은 컴포넌트 칸만 | GetVisualElementProperty · WaitForVisualElementProperty. `Props.Walk` 에 요소를 owner 로 넘기면 된다. `resolvedStyle.*` 는 명시적 인터페이스 구현이라 실제 타입에서 이름으로 안 찾아져 뺀다 |
| 글자 쓰기 | `text-set` — uGUI `Text` · TMP `TMP_Text` · UI Toolkit `TextElement`(Label · Button). 입력칸(InputField · TMP_InputField · TextField)은 「type 으로 넣습니다」로 거절 | `type` 에 합치면 입력칸 주소를 잘못 짚어도 글자가 바뀌어 통과한다. 엔진 낱말 명령이라 Godot `Label.text` 도 같은 명령 |
| 목록 | `components` — 붙은 컴포넌트 `{name, type}`. `members` — 그 컴포넌트 타입에서 Unity 부모(`MonoBehaviour` · `Behaviour` · `Component` · `Object`) 앞까지 선언한 필드 · 속성(`{name, type, value?, readOnly?, static?}`)과 메서드(`{name, args, returns, static?}`). 컴파일러가 만든 이름(`<`)과 속성 접근자는 뺀다. 값은 읽다 던지면 · 사본 속성(`material` …)이면 싣지 않는다 | 인스펙터(P5)와 `call` · `static-call` 의 바탕. 스크립트 쪽만 보여 목록이 짧다 |
| PNG | `screenshot {format?: 'jpg' \| 'png'}` → PNG 면 `{png}`. `Game.screenshot('png')` 는 답에 png 가 없으면(옛 SDK) 던진다. CLI `snapshot --png`, MCP 는 `image/png` | 비교용 무손실 그림. caps 는 칸까지 못 가린다 |
| 설정(사용자) | 기본 기다림만 — CLI `config [--wait <초>]` 가 세션 파일 `waitMs` 에 적고 `wait` · `wait-prop` 기본 한도가 된다(장면 기다림 30초는 그대로). 명령 시간 초과 · 명령 뒤 쉼은 뺀다 | 기다리기를 CLI 가 짧은 명령을 되풀이해서 해 명령 하나는 1초 안팎이다. 고정 쉼은 테스트를 느리고 흔들리게 한다 — AltTester 표에 「필요 없음」 |
| 표준 화면 | `WorldCube` 에 내장 태그 `Player` · 내장 레이어 `Water`(4) · 뿌리 `SideCamera`(Camera 컴포넌트 꺼짐 · (1.5, 0, -10)) · SampleCanvas 아래 꺼진 `HiddenText`(글자 hidden) · `Second.unity` 에 저장 오브젝트 `SecondSaved` | 프로젝트 설정 없이 내장 태그 · 레이어만. 옆 카메라는 화면을 덮지 않게 끈다. 세로 화면 반 폭(거리 10 에서 약 2.6)보다 덜 비켜 큐브가 그 카메라 시야 안 |
| conform B 줄 | 10줄(`B ` 로 시작) — A pref 줄 바로 뒤 · A 장면 줄 앞 | 33줄 |
| Game 메서드(kit 이름) | `findAll` · `findAt` · `parent` · `waitForProp` · `components` · `members` · `setText` + `find` · `get` · `set` · `callMethod` · `click` · `drag` 의 옵션 `{inactive?, camera?}` · `screenshot(format)` · `waitMs` | kit 에 같은 이름 · 같은 인자 꼴 |
| 판 | SDK · CLI 0.5.0 · protocol 2 그대로 | 명령 · 칸을 더했을 뿐 — 옛 CLI 는 새 명령을 모르고, 새 CLI 는 caps 로 옛 SDK 를 거른다 |
| 뺀 것 | 명령 시간 초과 · 명령 뒤 쉼(사용자) · static 멤버만 따로 보기 · `members` 의 상속 고르기(ALL · CLASS · INHERITED) · `WaitForComponentProperty` 의 `interval` · `maxDepth` · `find-all` 개수 한도 · Editor 어셈블리 컴파일 검사(check.py 는 Android 플레이어 어셈블리만 굽는다 — sample 빌드가 본다) | 쓸 일이 생기면 더한다 |

## 파일 지도

| 파일 | 하는 일 | Task |
|---|---|---|
| `protocol/commands.json` | 명령 5개 · `inactive` · `camera` · `format` 칸 · target 설명 | 1 |
| `src/protocol.ts` · `src/protocol.test.ts` | 칸 꼴에 `boolean` | 1 |
| `src/mcp.ts` · `src/mcp.test.ts` | 참거짓 칸 검사 · PNG 그림 · 안내 글의 선택자 | 1 |
| `src/select.ts` · `src/select.test.ts`(새) | 단계 풀기 · 고르기 · 경로 셈 · 하나 고르기 실패 글 | 2 |
| `src/game.ts` | Game 메서드 · `Found` · 옵션 · `waitMs` · 옛 SDK 거절 | 3 |
| `src/fake-game.ts` | 가짜 SDK 가 `select.ts` 로 찾기 · 새 명령 · 표준 화면 B 칸 | 3 |
| `src/conform.ts` · `src/conform.test.ts` | B 줄 10개 · 줄 수 | 3 |
| `src/cli.ts` · `src/cli.test.ts` | CLI 명령 · 옵션 · Ran 줄 · `config` · `snapshot --png` | 4 |
| `sdk/unity/Runtime/Select.cs`(+ .meta, 새) | `select.ts` 를 옮긴 것 · 좌표로 찾기 | 5 |
| `sdk/unity/Runtime/Tree.cs` · `UiToolkit.cs` · `Props.cs` · `ControlServer.cs` · `ControlCli.Runtime.asmdef` · `sdk/unity/package.json` · `package.json` | 꺼진 것 · 카메라 · find 답 · UI Toolkit get · 목록 · text-set · PNG · 갈래 · Caps · 0.5.0 · Physics define | 5 |
| `sdk/unity/Id/*`(새) | `ControlCliId`(정의 제약 없는 어셈블리) | 5 |
| `sdk/unity/Editor/*`(새) | 영구 id 를 붙이는 QA 빌드 훅 | 6 |
| `sample/Assets/Sample/SampleScreen.cs` · `sample/Assets/Editor/SampleBuild.cs` | 태그 · 레이어 · SideCamera · HiddenText · SecondSaved | 7 |
| `README.md` · `docs/roadmap/plan.md` | 명령 표 · AltTester 표 | 8 |
| `docs/roadmap/*` | 결과 · 다음 세션 · kit 다음 줄 | 9 |

---

### Task 1: 명령 정의 — commands.json · `boolean` 칸 · MCP 도구 꼴

**Files:** Modify `protocol/commands.json` · `src/protocol.ts` · `src/protocol.test.ts` · `src/mcp.ts` · `src/mcp.test.ts` · `sdk/unity/Runtime/ControlServer.cs`(Caps 만)

- [ ] **Step 1: 실패하는 테스트** — `src/protocol.test.ts` 의 칸 꼴 목록에 `boolean` 을 넣는다(테스트 이름도 「string · number · array · boolean」).

```ts
      assert.ok(['string', 'number', 'array', 'boolean'].includes(a.type), `${c.name}.${k} 의 type`);
```

`src/mcp.test.ts` 「open 전에는 …」 테스트 끝에 —

```ts
  assert.match((await call('find', { target: 'X', inactive: 'yes' })).content[0].text!, /^find 의 inactive 는 true · false 여야 합니다/);
  assert.match((await call('screenshot', { format: 'gif' })).content[0].text!, /^screenshot 의 format 는 jpg · png 중 하나여야 합니다/);
```

PNG 그림 — 세션을 연 뒤 도는 MCP 테스트(가짜 게임이 붙은 쪽)에 —

```ts
  const shot = await call('screenshot', { format: 'png' });
  assert.deepEqual([shot.content[0].type, shot.content[0].mimeType], ['image', 'image/png']);
```

- [ ] **Step 2: 실패 확인** — `npm run -s build && node --test dist/protocol.test.js dist/mcp.test.js` → Caps 대조는 통과, 새 단언 실패(모르는 칸이라 버려짐 · `jpg` 가 없어 글로 옴)

- [ ] **Step 3: 구현**
  - `src/protocol.ts` — `Arg.type` 에 `'boolean'`
  - `src/mcp.ts` — `Prop.type` 에 `'boolean'`, `pick()` 이 참거짓 칸에 `typeof v !== 'boolean'` 이면 `${tool.name} 의 ${k} 는 true · false 여야 합니다 (받은 값 …)` 로 던진다. `run` 은 `const { ok: _ok, jpg, png, ...rest }` 로 받아 `png` 면 `image/png`. `INSTRUCTIONS` 의 주소 글을 「주소는 오브젝트 이름(켜진 것 중 하나뿐일 때) · /Canvas/Panel/Slot[2] 경로 · //*[@tag=Player] · //*[contains(@name,Slot)] · //*[@text=OK]/.. 같은 선택자(AltTester PATH 꼴)」로
  - `ControlServer.cs` 의 `Caps` 끝에 `"find-all", "find-at", "components", "members", "text-set"`(SDK 구현은 Task 5 — protocol.test 가 차례를 본다)
  - `protocol/commands.json` — 아래 칸 둘(아래 JSON 의 빈 `"inactive": {}` · `"camera": {}` 는 이 정의 그대로, `"target": {"…"}` 는 find 의 target 그대로)을 쓰는 명령에 넣고(find · find-all · get · set · call · components · members · text-set 에 `inactive`, find · find-all · find-at · click · drag 에 `camera`), find · click 의 target 설명을 「주소 — 이름(하나뿐일 때) · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자」로, `screenshot` 에 `format`, 끝에 명령 5개

```json
"inactive": { "type": "boolean", "required": false, "summary": "꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다" },
"camera": { "type": "string", "required": false, "summary": "월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)" },
```

```json
{ "name": "screenshot", "summary": "게임이 프레임 끝에서 찍은 화면(JPEG · PNG base64)", "args": {
  "format": { "type": "string", "required": false, "enum": ["jpg", "png"], "summary": "jpg(기본 · 작다) 또는 png(무손실)" } } },
{ "name": "find-all", "summary": "주소에 맞는 것 전부 — find 와 같은 꼴의 목록, 없으면 빈 목록", "args": { "target": {"…": "find 와 같다"}, "inactive": {}, "camera": {} } },
{ "name": "find-at", "summary": "화면 좌표(왼쪽 아래 0,0)의 맨 위 — UI Toolkit · uGUI · 물리 차례, 없으면 found:false", "args": {
  "x": { "type": "number", "required": true, "summary": "가로 픽셀" },
  "y": { "type": "number", "required": true, "summary": "세로 픽셀" }, "camera": {} } },
{ "name": "components", "summary": "붙은 컴포넌트 이름 · 전체 타입 이름", "args": { "target": { "type": "string", "required": true, "summary": "오브젝트 주소" }, "inactive": {} } },
{ "name": "members", "summary": "컴포넌트의 필드 · 속성(타입 · 값) · 메서드(인자 타입) — Unity 부모 칸은 뺀다", "args": {
  "target": { "type": "string", "required": true, "summary": "오브젝트 주소" },
  "component": { "type": "string", "required": true, "summary": "컴포넌트 타입 이름 또는 전체 이름 — TouchProbe" }, "inactive": {} } },
{ "name": "text-set", "summary": "글자 컴포넌트(Text · TMP · UI Toolkit Label/Button)의 글자를 바꾸고 다시 읽은 글자를 준다 — 입력칸은 type", "args": {
  "target": { "type": "string", "required": true, "summary": "글자 오브젝트 주소" },
  "text": { "type": "string", "required": true, "summary": "넣을 글자" }, "inactive": {} } }
```

- [ ] **Step 4: 통과 확인** — 같은 명령, 통과
- [ ] **Step 5: 커밋** — `git commit -m "명령 정의 — P2-B find-all · find-at · components · members · text-set · inactive · camera · PNG, 칸 꼴 boolean"`

### Task 2: 선택자 — `src/select.ts`

**Files:** Create `src/select.ts` · `src/select.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `src/select.test.ts`

```ts
// 주소 풀기 · 고르기 — AltTester PATH 꼴의 일부가 지금 주소(이름 · /a/b[n])와 같은 규칙으로 도는지
import assert from 'node:assert/strict';
import test from 'node:test';

import { one, pathOf, select, steps, type View } from './select.js';

interface N { name: string; tag?: string; text?: string; components?: string[]; children?: N[] }
const n = (name: string, extra: Partial<N> = {}, children?: N[]): N => ({ name, ...extra, ...(children ? { children } : {}) });
const roots = [
  n('Canvas', { components: ['Canvas'] }, [
    n('Bag', {}, [n('Slot', {}, [n('Item', { tag: 'Loot' })]), n('Slot'), n('Slot')]),
    n('LoginButton', { components: ['Button'] }, [n('Text', { text: 'Login' })]),
    n('TmpLoginButton', { components: ['Button'] }, [n('Text', { text: 'TMP Login' })]),
  ]),
  n('Cube', { tag: 'Player' }),
];
const view: View<N> = {
  roots,
  children: (x) => x.children ?? [],
  attr: (x, k) => (k === 'name' ? [x.name] : k === 'tag' ? (x.tag ? [x.tag] : []) : k === 'text' ? (x.text === undefined ? [] : [x.text]) : k === 'component' ? (x.components ?? []) : []),
};
const paths = (target: string) => select(steps(target), view).trails.map((t) => pathOf(t, view));

test('지금 주소 — 이름 · /a/b[n] 은 뜻이 그대로다', () => {
  assert.deepEqual(paths('Item'), ['/Canvas/Bag/Slot[0]/Item']);
  assert.deepEqual(paths('/Canvas/Bag/Slot[1]'), ['/Canvas/Bag/Slot[1]']);
  assert.deepEqual(paths('Text'), ['/Canvas/LoginButton/Text', '/Canvas/TmpLoginButton/Text']);
  // 단계마다 모아 내려간다 — Slot 이 셋이어도 Item 은 하나다.
  assert.deepEqual(paths('/Canvas/Bag/Slot/Item'), ['/Canvas/Bag/Slot[0]/Item']);
});

test('// · * · 조건 · contains · 이어 붙이기 · [-1] · ..', () => {
  assert.deepEqual(paths('//*[@tag=Player]'), ['/Cube']);
  assert.deepEqual(paths('//*[@component=Button]'), ['/Canvas/LoginButton', '/Canvas/TmpLoginButton']);
  assert.deepEqual(paths("//*[@text='TMP Login']"), ['/Canvas/TmpLoginButton/Text']);
  assert.deepEqual(paths('//*[contains(@name, LoginButton)]'), ['/Canvas/LoginButton', '/Canvas/TmpLoginButton']);
  assert.deepEqual(paths('//*[@component=Button][contains(@name,Tmp)]'), ['/Canvas/TmpLoginButton']);
  assert.deepEqual(paths('//Bag/Slot[-1]'), ['/Canvas/Bag/Slot[2]']);
  assert.deepEqual(paths('//*[@text=Login]/..'), ['/Canvas/LoginButton']);
  assert.deepEqual(paths('/Canvas/Bag/Slot/..'), ['/Canvas/Bag']);
  assert.deepEqual(paths('/Cube/..'), []);
  assert.deepEqual(paths('/Canvas/*'), ['/Canvas/Bag', '/Canvas/LoginButton', '/Canvas/TmpLoginButton']);
});

test('꼴이 틀리면 까닭을 던지고, 없음 · 여럿은 하나 고르기가 갈라 말한다', () => {
  assert.throws(() => steps('//[@tag=x]'), /이름이나 \* 가 있어야 합니다/);
  assert.throws(() => steps('//*[@colour=red]'), /모르는 칸 @colour/);
  assert.throws(() => steps('//*[@tag=x'), /닫는 \] 가 없습니다/);
  assert.throws(() => steps('/a/'), /이름이나 \* 가 있어야 합니다/);
  const r = (t: string) => one(t, select(steps(t), view), true);
  assert.match(r('Nope').problem!, /^켜진 오브젝트 중에 Nope 이 없습니다$/);
  assert.equal(r('Nope').missing, true);
  assert.match(r('/Canvas/Box/Item').problem!, /\(Box 에서 끊김\)/);
  assert.match(r('Text').problem!, /^Text 이 2개라 하나를 고를 수 없습니다 — 경로로 주소를 씁니다$/);
  assert.match(r('//*[@component=Button]').problem!, /맞는 것이 2개라 하나를 고를 수 없습니다 — \[순번\] · 조건을 더하거나 find-all 로 경로를 봅니다/);
  assert.equal(r('//*[@component=Button]').missing, false);
});
```

- [ ] **Step 2: 실패 확인** — `npm run -s build` 가 「Cannot find module './select.js'」
- [ ] **Step 3: 구현** — `src/select.ts`

```ts
// 주소를 단계로 풀고 트리에서 맞는 것을 고른다 — AltTester PATH 꼴의 일부. 가짜 SDK 가 쓰고 엔진 SDK(Unity Select.cs …)가 같은 규칙 · 같은 글로 옮긴다
export type Key = 'name' | 'tag' | 'layer' | 'component' | 'text' | 'id';
const KEYS: Key[] = ['name', 'tag', 'layer', 'component', 'text', 'id'];

export interface Cond {
  key: Key;
  value: string;
  /** contains(@칸,값) — 일부만 맞아도 */
  part: boolean;
}

export interface Step {
  /** 실패 글에 쓰는 그 단계 글자 */
  raw: string;
  /** // — 바로 아래가 아니라 아래 어디서나 */
  deep: boolean;
  /** 오브젝트 이름 · * 아무 이름 · .. 부모 */
  name: string;
  conds: Cond[];
  /** 그 단계에 맞은 형제 중 몇 번째(0부터) — 음수는 뒤에서(-1 이 마지막) */
  index?: number;
}

export interface View<T> {
  roots: T[];
  children: (n: T) => T[];
  /** 그 칸의 값들 — 없으면 빈 배열(UI Toolkit 요소의 tag). name 은 하나, component 는 붙은 것 전부 */
  attr: (n: T, key: Key) => string[];
}

const bad = (target: string, why: string) => new Error(`주소 ${target} 의 꼴이 틀렸습니다 — ${why}`);

/** / 로 시작하지 않으면 이름 그대로(아래 어디서나 그 이름). 꼴이 틀리면 까닭을 던진다 */
export function steps(target: string): Step[] {
  if (target === '') throw new Error('주소가 비었습니다');
  if (!target.startsWith('/')) return [{ raw: target, deep: true, name: target, conds: [] }];
  const out: Step[] = [];
  let i = 0;
  while (i < target.length) {
    const start = i;
    const deep = target.startsWith('//', i);
    i += deep ? 2 : 1;
    let name = '';
    while (i < target.length && target[i] !== '/' && target[i] !== '[') name += target[i++];
    const step: Step = { raw: '', deep, name, conds: [] };
    while (target[i] === '[') {
      const end = target.indexOf(']', i);
      if (end < 0) throw bad(target, `${target.slice(i)} 를 닫는 ] 가 없습니다`);
      cond(step, target.slice(i + 1, end), target);
      i = end + 1;
    }
    if (i < target.length && target[i] !== '/') throw bad(target, '] 뒤에는 / 가 와야 합니다');
    if (name === '') throw bad(target, '단계마다 이름이나 * 가 있어야 합니다 (예: //*[@tag=Player])');
    if (name === '..' && (deep || step.conds.length > 0 || step.index !== undefined)) throw bad(target, '.. 은 /.. 꼴로만 씁니다');
    step.raw = target.slice(start, i).replace(/^\/+/, '');
    out.push(step);
  }
  return out;
}

function cond(step: Step, inside: string, target: string): void {
  if (/^-?\d+$/.test(inside)) {
    if (step.index !== undefined) throw bad(target, `순번이 둘입니다 [${inside}]`);
    step.index = Number(inside);
    return;
  }
  const m = /^@(\w+)=(.*)$/s.exec(inside) ?? /^contains\(@(\w+),(.*)\)$/s.exec(inside);
  if (!m) throw bad(target, `[${inside}] 는 [@칸=값] · [contains(@칸,값)] · [순번] 중 하나여야 합니다`);
  if (!KEYS.includes(m[1] as Key)) throw bad(target, `모르는 칸 @${m[1]} — ${KEYS.join(' · ')}`);
  step.conds.push({ key: m[1] as Key, value: m[2].trim().replace(/^(['"])(.*)\1$/s, '$2'), part: inside.startsWith('contains(') });
}

const fits = <T>(n: T, s: Step, v: View<T>) =>
  (s.name === '*' || v.attr(n, 'name')[0] === s.name) && s.conds.every((c) => v.attr(n, c.key).some((x) => (c.part ? x.includes(c.value) : x === c.value)));

/** 맞은 것마다 뿌리에서 그것까지의 줄(마지막이 맞은 것). 비면 stop 이 끊긴 단계 번호 */
export function select<T>(path: Step[], v: View<T>): { trails: T[][]; stop?: number } {
  let trails: T[][] = [[]];
  for (const [k, s] of path.entries()) {
    const next: T[][] = [];
    for (const t of trails) {
      if (s.name === '..') {
        if (t.length > 1) next.push(t.slice(0, -1));
        continue;
      }
      // 형제 묶음마다 순번을 센다 — // 는 아래 모든 층의 묶음이다.
      const groups: [T[], T[]][] = [];
      const gather = (trail: T[], under: T[]) => {
        groups.push([trail, under]);
        if (s.deep) for (const n of under) gather([...trail, n], v.children(n));
      };
      gather(t, t.length ? v.children(t[t.length - 1]) : v.roots);
      for (const [trail, under] of groups) {
        const hit = under.filter((n) => fits(n, s, v));
        const at = s.index === undefined ? -1 : s.index < 0 ? hit.length + s.index : s.index;
        for (const n of s.index === undefined ? hit : at >= 0 && at < hit.length ? [hit[at]] : []) next.push([...trail, n]);
      }
    }
    // 같은 것에 두 길로 닿으면(// 를 두 번 · 형제의 ..) 하나만 남긴다.
    const seen = new Set<T>();
    trails = next.filter((t) => !seen.has(t[t.length - 1]) && Boolean(seen.add(t[t.length - 1])));
    if (trails.length === 0) return { trails, stop: k };
  }
  return { trails };
}

/** 줄을 SDK 가 받는 경로로 — 같은 이름 형제가 있으면 [순번](CLI snapshot 의 flatten 과 같은 셈) */
export function pathOf<T>(trail: T[], v: View<T>): string {
  let level = v.roots;
  let out = '';
  for (const n of trail) {
    const name = v.attr(n, 'name')[0];
    const twins = level.filter((x) => v.attr(x, 'name')[0] === name);
    out += `/${twins.length > 1 ? `${name}[${twins.indexOf(n)}]` : name}`;
    level = v.children(n);
  }
  return out;
}

/** 한 것을 짚는 명령 — 없음(missing: 기다리기가 되풀이할 수 있다) · 여럿(몇 번 해도 같다)을 갈라 말한다. shown 은 켜진 것만 본 찾기인가 */
export function one<T>(target: string, r: { trails: T[][]; stop?: number }, shown: boolean, path?: Step[]): { trail?: T[]; problem?: string; missing: boolean } {
  const bare = !target.startsWith('/');
  if (r.trails.length === 1) return { trail: r.trails[0], missing: false };
  if (r.trails.length === 0) {
    const where = bare || r.stop === undefined ? '' : ` (${(path ?? steps(target))[r.stop].raw} 에서 끊김)`;
    return { problem: `${shown ? '켜진 ' : ''}오브젝트 중에 ${target} 이 없습니다${where}`, missing: true };
  }
  return {
    problem: bare
      ? `${target} 이 ${r.trails.length}개라 하나를 고를 수 없습니다 — 경로로 주소를 씁니다`
      : `${target} 에 맞는 것이 ${r.trails.length}개라 하나를 고를 수 없습니다 — [순번] · 조건을 더하거나 find-all 로 경로를 봅니다`,
    missing: false,
  };
}
```

- [ ] **Step 4: 통과 확인** — `npm run -s build && node --test dist/select.test.js`
- [ ] **Step 5: 커밋** — `git commit -m "선택자 — AltTester PATH 꼴 일부(// · * · .. · @칸 · contains · [n] · [-1]) 풀기 · 고르기 · 실패 글"`

### Task 3: Game 메서드 · 가짜 SDK · conform B 줄

**Files:** Modify `src/game.ts` · `src/fake-game.ts` · `src/conform.ts` · `src/conform.test.ts` · `src/mcp.test.ts`(줄 수)

- [ ] **Step 1: 실패하는 테스트** — `src/conform.test.ts` 의 줄 수를 B 줄 10개만큼 늘린다 — 표준 화면 23 → 33, 옛 uGUI 20·2·1 → 30·2·1, 다시 돌리기 21·0·2 → 30·0·3(B 영구 id 줄이 scene-load 를 써 같이 건너뜀), 안 먹은 다시 돌리기 19·2·2 → 28·2·3 이고 그 실패 글의 앞 판 글자는 `StatusText: "text-set ok"`(B text-set 줄이 마지막에 쓴다), find 를 빼면 12·0·11 → 15·0·18. 새 테스트 —

```ts
test('B 줄 — 옛 SDK(caps 에 find-all 없음)에 선택자 · inactive 를 보내면 보내기 전에 거절한다', async () => {
  const g = standardScreen();
  g.caps = g.caps.filter((c) => c !== 'find-all');
  const game = direct(g);
  await game.ping();
  await assert.rejects(game.find('//*[@tag=Player]'), /이 게임의 SDK 는 선택자 · inactive · camera 를 못 읽습니다 — SDK 0\.5\.0 이상/);
  await assert.rejects(game.find('HiddenText', { inactive: true }), /SDK 0\.5\.0 이상/);
  assert.equal((await game.find('/SampleCanvas/Bag/Slot[0]/Item'))?.path, '/SampleCanvas/Bag/Slot[0]/Item');
  assert.equal(g.commands.filter((c) => c.cmd === 'find').length, 1);
});

test('B 줄 — waitForProp 은 값이 될 때까지 get 을 되풀이하고, 글자 · 숫자 · 배열을 같게 본다', async () => {
  const g = standardScreen();
  const game = direct(g);
  let later = 3;
  byName(g, 'WorldCube').props!['Probe.count'] = 0;
  g.onGet = () => (later-- === 0 ? (byName(g, 'WorldCube').props!['Probe.count'] = 10) : undefined);
  await game.waitForProp('WorldCube', 'Probe.count', '10');
  await game.waitForProp('WorldCube', 'Probe.count', 10);
  await game.waitForProp('WorldCube', 'Transform.position', '[0, -2.5, 0]');
  await assert.rejects(game.waitForProp('WorldCube', 'Probe.count', 11, { timeoutMs: 30 }), /WorldCube 의 Probe\.count 이 0\.03초 안에 11 이 되지 않았습니다 \(마지막: 10\)/);
});
```

(`g.onGet` 은 가짜 SDK 가 `get` 을 받을 때마다 부르는 갈고리 — Step 3 에서 더한다. 큐브 `Transform.position` 은 표준 화면 가짜의 `[0, -2.5, 0]`.)

- [ ] **Step 2: 실패 확인** — `npm run -s build` 가 타입 오류(`waitForProp` · `onGet` · find 의 두 번째 인자 없음)

- [ ] **Step 3: 구현**
  - `game.ts`
    - `Found` 에 `id?: string` · `x?: number` · `y?: number` · `active?: false`(만들 때 `path` 를 맨 앞에 — CLI 가 그대로 JSON 으로 찍는다), `export interface FindOptions { inactive?: boolean; camera?: string }`, `Members` 꼴(`fields` · `properties` · `methods`)
    - `find(target, o: FindOptions = {})` · `findAll(target, o = {})` · `findAt(x, y, o: { camera?: string } = {})` · `parent(target, o: { inactive?: boolean } = {})`(`find` → 없으면 「켜진 오브젝트 중에 … 이 없습니다」로 던짐 → `find(`${path}/..`, o)`, 뿌리면 null) · `get(target, prop, o: { inactive? })` · `set(target, prop, value, o)` · `callMethod(target, method, args, o)` · `click(target, o: { camera? })` · `drag(target, to, o)` · `components(target, o)` · `members(target, component, o)` · `setText(target, text, o)` · `screenshot(format: 'jpg' | 'png' = 'jpg')`(`r[format]` 가 글자가 아니면 「게임이 ${format} 스크린샷을 주지 않았습니다 — PNG 는 SDK 0.5.0 이상」) · `waitForProp(target, prop, value: unknown, o: { timeoutMs?; inactive? } = {})`
    - 옵션은 참일 때만 명령에 싣는다 — `const extra = (o: FindOptions) => ({ ...(o.inactive ? { inactive: true } : {}), ...(o.camera ? { camera: o.camera } : {}) })`
    - `waitMs = WAIT.timeoutMs` 필드 — `waitFor` · `waitForProp` 의 기본 한도(CLI 가 세션의 `waitMs` 로 덮는다)
    - 옛 SDK 거절 — `call()` 첫머리에

```ts
// 선택자(// · [@ · [contains( · [-n] · .. · *) · inactive · camera 는 SDK 0.5.0(find-all 과 같은 판)부터. 옛 SDK 는 선택자를 이름으로 찾아 「없음」으로 답해 wait 가 헛돈다.
const SELECTOR = /\/\/|\[@|\[contains\(|\[-\d+\]|(^|\/)(\.\.|\*)(\/|\[|$)/;
const newer = (c: Command) => c.inactive === true || c.camera !== undefined || [c.target, c.to].some((t) => typeof t === 'string' && t.startsWith('/') && SELECTOR.test(t));
// call() 안 — caps 검사 바로 뒤
if (this.caps && !this.caps.includes('find-all') && newer(command)) throw new Error(`이 게임의 SDK 는 선택자 · inactive · camera 를 못 읽습니다 — SDK 0.5.0 이상으로 올립니다`);
```

    - `waitForProp` 같음과 실패 글

```ts
const sameValue = (got: unknown, want: unknown) => {
  const g = JSON.stringify(got);
  if (g === JSON.stringify(want)) return true;
  if (typeof want !== 'string') return false;
  try {
    return g === JSON.stringify(JSON.parse(want));
  } catch {
    return false;
  }
};
// 실패 — `${target} 의 ${prop} 이 ${timeoutMs / 1000}초 안에 ${typeof value === 'string' ? value : JSON.stringify(value)} 이 되지 않았습니다 (마지막: ${JSON.stringify(got)})`
```

  - `fake-game.ts`
    - `FakeNode` 에 `tag?` · `layer?` · `components?: string[]` · `id?: string` · `active?: false` · `at?: [number, number]` · `atBy?: Record<string, [number, number]>`(카메라 이름 → 그 카메라로 본 자리) · `members?: Record<string, unknown>`(컴포넌트 → members 답)
    - `find` 를 `select.ts` 로 — `View<FakeNode>` 는 `children` 이 `inactive` 가 아니면 `active === false` 를 빼고, `attr` 은 name · tag · layer · component(`components`) · text(`password` 면 `***`) · id. 실패 글은 `one()` 그대로
    - `find` · `find-all` 답에 `id` · `x` · `y`(카메라면 `atBy[camera]`, 꺼진 것은 없음) · `active: false`, `find-at` 은 `at`(카메라면 `atBy`)이 `[x, y]` 와 같은 첫 노드, `components` · `members` · `text-set`(`kind` 가 입력칸이면 「type 으로 넣습니다」 실패) · `screenshot` 의 `format: 'png'` → `{png: PNG 머리 8바이트 base64}`, `get` 이 `inactive` 를 받고 받을 때마다 `onGet?.()`
    - 노드를 만들 때 `id` 를 늘어나는 번호로(instance id 흉내) — 다시 만든 장면의 노드는 새 번호
    - `standardScreen` — `WorldCube` 에 `tag: 'Player'` · `layer: 'Water'` · `components: ['Transform', 'MeshFilter', 'BoxCollider', 'MeshRenderer']` · `at: [540, 600]` · `atBy: { SideCamera: [400, 600] }` · `props` 에 `'Transform.position': [0, -2.5, 0]`, 뿌리 `SideCamera`(`components: ['Transform', 'Camera']`), `SampleCanvas` 에 `components: ['RectTransform', 'Canvas', 'CanvasScaler', 'GraphicRaycaster', 'TouchProbe']` · `members: { TouchProbe: { fields: [{ name: 'Output', type: 'Text', value: 'TouchText (UnityEngine.UI.Text)' }], properties: [{ name: 'Note', type: 'String', static: true }], methods: [{ name: 'Say', args: ['String', 'Int32'], returns: 'String' }, { name: 'Add', args: ['Int32', 'Int32'], returns: 'Int32', static: true }] } }`, SampleCanvas 아래 `HiddenText`(`active: false` · `text: 'hidden'` · `props: { 'Text.text': 'hidden' }`), 버튼 셋에 `components: ['Button']` · `at`(LoginButton `[270, 1500]` · TmpLoginButton `[810, 1500]` · UitkLoginButton `[540, 200]`), `UitkLoginButton` 에 `props: { text: 'UITK Login' }` · `text: 'UITK Login'`, `UitkPanel` 에 `props: { 'layout.height': 200 }`, `Second` 장면 뿌리에 `SecondSaved`(`id: 'saved-1'` 고정 — 영구 id 흉내)
  - `conform.ts` — B 줄 10개를 A pref 줄 바로 뒤에

```ts
  // B — 찾기 · 설정(P2-B). 표준 화면의 WorldCube(태그 Player · 레이어 Water) · SideCamera(꺼진 Camera) · HiddenText(꺼짐) · Second 의 SecondSaved(장면에 저장).
  {
    cmds: ['find-all', 'find'],
    label: 'B find-all //Bag/Slot → 넷 · //Bag/Slot[-1] → Slot[3]',
    run: async (g) => {
      same('Slot', (await g.findAll('//Bag/Slot')).map((f) => f.path), [0, 1, 2, 3].map((i) => `/SampleCanvas/Bag/Slot[${i}]`));
      same('마지막', (await g.find('//Bag/Slot[-1]'))?.path, '/SampleCanvas/Bag/Slot[3]');
    },
  },
  {
    cmds: ['find', 'find-all'],
    label: 'B 선택자 @tag · @layer · @component · @text · contains · 이어 붙이기',
    run: async (g) => {
      same('tag', (await g.find('//*[@tag=Player]'))?.path, '/WorldCube');
      same('layer', (await g.find('//*[@layer=Water]'))?.path, '/WorldCube');
      same('tag + layer', (await g.findAll('//*[@tag=Player][@layer=Water]')).length, 1);
      same('component', (await g.find('//*[@component=TouchProbe]'))?.path, '/SampleCanvas');
      same('text', (await g.find('//*[@text=UITK Login]'))?.path, '/UitkDocument/UitkPanel/UitkLoginButton');
      same('contains', (await g.findAll('//*[contains(@name,LoginButton)]')).map((f) => f.path).sort(), ['/SampleCanvas/LoginButton', '/SampleCanvas/TmpLoginButton', '/UitkDocument/UitkPanel/UitkLoginButton']);
    },
  },
  {
    cmds: ['find'],
    label: 'B //*[@text=UITK Login]/.. → UitkPanel · parent Item → Bag/Slot',
    run: async (g) => {
      same('..', (await g.find('//*[@text=UITK Login]/..'))?.path, '/UitkDocument/UitkPanel');
      const p = (await g.parent('Item'))?.path ?? '';
      if (!/^\/SampleCanvas\/Bag\/Slot\[\d\]$/.test(p)) throw new Error(`Item 의 부모 ${JSON.stringify(p)} — /SampleCanvas/Bag/Slot[n] 이어야 합니다`);
    },
  },
  {
    cmds: ['find', 'find-at'],
    label: 'B find 의 x,y 로 find-at → 같은 것 · camera SideCamera 는 다른 x',
    run: async (g) => {
      for (const name of ['LoginButton', 'UitkLoginButton', 'WorldCube']) {
        const f = (await g.find(name))!;
        const at = (await g.findAt(f.x!, f.y!))?.path ?? '';
        // 버튼 속 글자가 맞을 수 있다 — 그 버튼이거나 그 아래면 된다.
        if (at !== f.path && !at.startsWith(`${f.path}/`)) throw new Error(`${name} (${f.x}, ${f.y}) 의 find-at ${JSON.stringify(at)} — ${f.path} 이어야 합니다`);
      }
      const main = (await g.find('WorldCube'))!;
      const side = (await g.find('WorldCube', { camera: 'SideCamera' }))!;
      if (side.x === main.x) throw new Error(`SideCamera 로 본 x(${side.x})가 Camera.main 과 같습니다`);
      same('SideCamera find-at', (await g.findAt(side.x!, side.y!, { camera: 'SideCamera' }))?.path, '/WorldCube');
    },
  },
  {
    cmds: ['find', 'get'],
    label: 'B HiddenText 는 찾기에 없고 inactive 로는 active:false · get',
    run: async (g) => {
      same('켜진 것만', await g.find('HiddenText'), null);
      const f = await g.find('HiddenText', { inactive: true });
      same('inactive', [f?.active, f?.text], [false, 'hidden']);
      same('get', await g.get('HiddenText', 'Text.text', { inactive: true }), 'hidden');
    },
  },
  {
    cmds: ['scenes', 'scene-load', 'scene-unload', 'find'],
    label: 'B 영구 id — SecondSaved 는 다시 열어도 id 가 같고 [@id] 로 찾는다',
    run: async (g) => {
      await g.loadScene('Second', { add: true });
      const a = (await g.find('SecondSaved'))?.id;
      const marker = (await g.find('SecondMarker'))?.id;
      same('[@id]', (await g.find(`//*[@id=${a}]`))?.path, '/SecondSaved');
      await g.unloadScene('Second');
      await g.loadScene('Second', { add: true });
      same('다시 연 SecondSaved id', (await g.find('SecondSaved'))?.id, a);
      // 실행 중 만든 SecondMarker 는 instance id 라 바뀐다 — 같은 id 가 우연이 아님을 본다.
      if ((await g.find('SecondMarker'))?.id === marker) throw new Error(`SecondMarker id(${marker})가 다시 열어도 같습니다 — 영구 id 가 아닌 instance id 여야 합니다`);
      await g.unloadScene('Second');
    },
  },
  {
    cmds: ['components', 'members'],
    label: 'B components SampleCanvas · members TouchProbe → Output · Say(String, Int32)',
    run: async (g) => {
      const c = await g.components('SampleCanvas');
      same('TouchProbe', c.some((x) => x.name === 'TouchProbe' && x.type === 'Sample.TouchProbe'), true);
      const m = await g.members('SampleCanvas', 'TouchProbe');
      same('Output', m.fields.some((f) => f.name === 'Output' && f.type === 'Text'), true);
      same('Say', m.methods.some((x) => x.name === 'Say' && JSON.stringify(x.args) === '["String","Int32"]' && x.returns === 'String'), true);
    },
  },
  {
    cmds: ['get'],
    label: 'B UI Toolkit get UitkLoginButton text · UitkPanel layout.height · wait-prop',
    run: async (g) => {
      same('text', await g.get('UitkLoginButton', 'text'), 'UITK Login');
      const h = await g.get('UitkPanel', 'layout.height');
      if (!(typeof h === 'number' && h > 0)) throw new Error(`UitkPanel 높이 ${JSON.stringify(h)} — 0 보다 큰 숫자여야 합니다`);
      await g.waitForProp('UitkLoginButton', 'text', 'UITK Login', { timeoutMs: CONFORM.waitMs });
    },
  },
  {
    cmds: ['text-set', 'find', 'get'],
    label: 'B text-set StatusText · TmpStatusText · UitkStatusText · 입력칸은 type 으로',
    run: async (g) => {
      for (const name of ['StatusText', 'TmpStatusText', 'UitkStatusText']) {
        same(name, await g.setText(name, 'text-set ok'), 'text-set ok');
        same(`${name} 글자`, (await g.find(name))?.text, 'text-set ok');
      }
      await g.waitForProp('StatusText', 'Text.text', 'text-set ok', { timeoutMs: CONFORM.waitMs });
      const refused = await g.setText('IdInput', 'x').then(() => '', (e: unknown) => (e instanceof Error ? e.message : String(e)));
      if (!refused.includes('type')) throw new Error(`IdInput text-set — 「type 으로 넣습니다」 실패여야 합니다 (받은 것 ${JSON.stringify(refused)})`);
    },
  },
  {
    cmds: ['screenshot'],
    label: 'B screenshot png → PNG 머리',
    run: async (g) => same('PNG 머리', [...(await g.screenshot('png')).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
```

- [ ] **Step 4: 통과 확인** — `node --test dist/conform.test.js dist/mcp.test.js dist/select.test.js`(MCP 도구로도 33/33 — `mcp.test` 의 줄 수도 33)
- [ ] **Step 5: 커밋** — `git commit -m "conform B 줄 — 선택자 · find-all · find-at · 부모 · 꺼진 것 · 카메라 · 영구 id · 목록 · UI Toolkit get · text-set · PNG, Game 메서드 · 가짜 SDK"`

### Task 4: CLI 명령 · Ran 줄 · config

**Files:** Modify `src/cli.ts` · `src/cli.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `src/cli.test.ts` 에 PC 가짜 게임(표준 화면)으로 —

```ts
test('찾기 · 설정 명령 — Ran 줄이 kit 의 game.* 이름 · 인자 꼴로 찍힌다', async (t) => {
  // open --pc 뒤 (P2-A 「게임 상태 명령」 테스트와 같은 차림)
  assert.match(await cli('find', '//*[@tag=Player]'), /^Ran: await game\.find\('\/\/\*\[@tag=Player\]'\)\n- 값: \{"path":"\/WorldCube"/);
  assert.match(await cli('find', 'HiddenText', '--inactive'), /^Ran: await game\.find\('HiddenText', \{ inactive: true \}\)\n- 값: .*"active":false/);
  assert.match(await cli('find-all', '//Bag/Slot'), /^Ran: await game\.findAll\('\/\/Bag\/Slot'\)\n- 값: \[/);
  assert.match(await cli('find', 'WorldCube', '--camera', 'SideCamera'), /^Ran: await game\.find\('WorldCube', \{ camera: 'SideCamera' \}\)/);
  assert.match(await cli('find-at', '540', '600'), /^- 좌표 \(540, 600\) 의 맨 위: \/WorldCube — 케이스에는 주소로 씁니다/);
  assert.match(await cli('parent', 'Item'), /^Ran: await game\.parent\('Item'\)\n- 값: \{"path":"\/SampleCanvas\/Bag\/Slot/);
  assert.match(await cli('wait-prop', 'UitkLoginButton', 'text', 'UITK Login', '--timeout', '5'), /^Ran: await game\.waitForProp\('UitkLoginButton', 'text', 'UITK Login', \{ timeoutMs: 5000 \}\)/);
  assert.match(await cli('components', 'SampleCanvas'), /^Ran: await game\.components\('SampleCanvas'\)\n- 값: .*TouchProbe/);
  assert.match(await cli('members', 'SampleCanvas', 'TouchProbe'), /^Ran: await game\.members\('SampleCanvas', 'TouchProbe'\)\n- 값: .*"Say"/);
  assert.match(await cli('text-set', 'StatusText', 'hi'), /^Ran: await game\.setText\('StatusText', 'hi'\)\n- 칸 글자: "hi"/);
  assert.match(await cli('get', 'HiddenText', 'Text.text', '--inactive'), /^Ran: await game\.get\('HiddenText', 'Text\.text', \{ inactive: true \}\)\n- 값: "hidden"/);
  assert.equal(await cli('config'), '- 기본 기다림 10초 — wait · wait-prop (장면 기다림은 30초)');
  assert.equal(await cli('config', '--wait', '20'), '- 기본 기다림 20초 — wait · wait-prop (장면 기다림은 30초)');
  assert.equal(await cli('config'), '- 기본 기다림 20초 — wait · wait-prop (장면 기다림은 30초)');
  assert.match(await cli('snapshot', '--png'), /- Screenshot: .*\.png/);
  await assert.rejects(cli('wait-prop', 'StatusText', 'Text.text'), /wait-prop <ref\|주소> <컴포넌트\.칸> <값> 꼴이어야 합니다/);
  await assert.rejects(cli('config', '--wait', '0'), /--wait 은 0 보다 큰 초입니다/);
});
```

- [ ] **Step 2: 실패 확인** — 「모르는 명령입니다: find-all」 · `find` 의 Ran 줄에 옵션 없음

- [ ] **Step 3: 구현**
  - `parseArgs` 옵션 `inactive`(boolean) · `camera`(string) · `png`(boolean) · `wait`(string)
  - `Session` 에 `waitMs?: number`, `gameOf` 가 `game.waitMs = s.waitMs ?? WAIT.timeoutMs`
  - 옵션 → Ran 줄 칸 — `const findOpts = () => ({ ...(values.inactive ? { inactive: true } : {}), ...(values.camera ? { camera: target(values.camera, '카메라 주소') } : {}) })`, 찍을 때 `opts([...(values.inactive ? ['inactive: true'] : []), ...(values.camera ? [`camera: ${quote(...)}`] : [])])`
  - 갈래 — `find` · `find-all`(옵션), `find-at <x> <y>`(Ran 줄 없음 — `tap` 처럼 살펴볼 때만, 없으면 「- 좌표 (x, y) 에 맞는 것이 없습니다」), `parent`, `wait-prop`(`--timeout` · `--inactive`, 값은 글자 그대로 넘긴다 — Game 이 JSON 으로도 견준다), `components`, `members`, `text-set`(`after()` — 화면이 바뀐다), `get` · `set` · `call` 에 `--inactive`, `click` · `drag` 에 `--camera`, `config`(`--wait` 이 있으면 세션에 적고 지금 값을 찍는다), `snapshot --png`(Appium 이 없을 때만 `game.screenshot('png')`, Appium 은 원래 PNG), HELP 줄
- [ ] **Step 4: 통과 확인** — `node --test dist/cli.test.js`
- [ ] **Step 5: 커밋** — `git commit -m "CLI — find-all · find-at · parent · wait-prop · components · members · text-set · config · --inactive · --camera · snapshot --png, Ran 줄"`

### Task 5: Unity SDK Runtime — 선택자 · 꺼진 것 · 카메라 · 새 명령 · 0.5.0

**Files:** Create `sdk/unity/Runtime/Select.cs` · `Select.cs.meta` · `sdk/unity/Id/ControlCli.Id.asmdef` · `ControlCliId.cs`(+ 폴더 · 파일 .meta 셋), Modify `Tree.cs` · `UiToolkit.cs` · `Props.cs` · `ControlServer.cs` · `ControlCli.Runtime.asmdef` · `sdk/unity/package.json` · `package.json`

- [ ] **Step 0: `ControlCli.Id`** — `Select.Attr` 가 읽는 영구 id 컴포넌트. 정의 제약 없음 · 참조 없음 · `autoReferenced: false`(게임 코드가 볼 일 없다). 붙이는 빌드 훅은 Task 6

```cs
// QA 빌드 훅(ControlCli.Editor.StampIds)이 장면 오브젝트에 붙이는 영구 id — 정의 제약 없는 어셈블리라 Editor 가 CONTROL_CLI 없이도 붙일 수 있다
using UnityEngine;

namespace ControlCli
{
    [AddComponentMenu(""), DisallowMultipleComponent]
    public sealed class ControlCliId : MonoBehaviour
    {
        public string Id;
    }
}
```

- [ ] **Step 1: `Select.cs`** — `src/select.ts` 를 같은 이름 · 같은 글로 옮긴다(`Steps` · `Cond` · `Select` · `PathOf(List<Item> trail, bool all)` · `One`). 다른 곳만 적는다.
  - 같은 것 가르기 — `Item.Key`(게임 오브젝트 또는 요소 참조)를 `HashSet<object>` 에
  - 칸 값 — `Attr(Item item, string key)`

```cs
        // 선택자 칸의 값들 — select.ts 의 View.attr. UI Toolkit 요소에 없는 칸(tag · layer · id)은 빈 목록이라 늘 안 맞는다.
        internal static List<string> Attr(Item item, string key)
        {
            var list = new List<string>();
            switch (key)
            {
                case "name": list.Add(item.Name); break;
                case "text": { var t = Tree.TextOf(item); if (t != null) list.Add(t); break; }
                case "component":
#if CONTROL_CLI_UITK
                    if (item.Ve != null) { list.Add(item.Ve.GetType().Name); list.Add(item.Ve.GetType().FullName); break; }
#endif
                    foreach (var c in item.Go.GetComponents<Component>())
                        if (c != null) { list.Add(c.GetType().Name); list.Add(c.GetType().FullName); }
                    break;
                case "tag": if (item.Go != null) list.Add(item.Go.tag); break;
                case "layer": if (item.Go != null) { list.Add(LayerMask.LayerToName(item.Go.layer)); list.Add(item.Go.layer.ToString(CultureInfo.InvariantCulture)); } break;
                case "id":
                    if (item.Go != null)
                    {
                        var stamped = item.Go.GetComponent<ControlCliId>();
                        if (stamped != null && !string.IsNullOrEmpty(stamped.Id)) list.Add(stamped.Id);
                        list.Add(item.Go.GetInstanceID().ToString(CultureInfo.InvariantCulture));
                    }
                    break;
            }
            return list;
        }
```

  - 좌표로 찾기 — `At(Vector2 p, Camera cam)` 이 `Item` 을 준다(없으면 `default`)

```cs
        // 화면 자리(왼쪽 아래 0,0)의 맨 위 — UI Toolkit → uGUI → 3D · 2D 물리. 트리에 없는 속 칸이 맞으면 트리에 있는 조상으로 올린다.
        // ponytail: UI Toolkit 과 uGUI 가 겹치면 UI Toolkit 이 이긴다 — 두 정렬 순서를 견주는 건 겹친 게임이 생기면.
        public static Item At(Vector2 p, Camera cam)
        {
#if CONTROL_CLI_UITK
            for (var ve = UiToolkit.Pick(p); ve != null; ve = ve.hierarchy.parent)
                if (Tree.TrailOf(new Item(ve), false) != null) return new Item(ve);
#endif
            var events = EventSystem.current;
            if (events != null)
            {
                Hits.Clear();
                events.RaycastAll(new PointerEventData(events) { position = p }, Hits);
                foreach (var hit in Hits)
                    for (var t = hit.gameObject.transform; t != null; t = t.parent)
                        if (Tree.TrailOf(new Item(t.gameObject), false) != null) return new Item(t.gameObject);
            }
            cam = cam != null ? cam : Camera.main;
            if (cam == null) return default;
            var ray = cam.ScreenPointToRay(p);
            GameObject best = null;
            var near = float.MaxValue;
#if CONTROL_CLI_PHYSICS
            if (Physics.Raycast(ray, out var h3)) { best = h3.collider.gameObject; near = h3.distance; }
#endif
#if CONTROL_CLI_PHYSICS2D
            var h2 = Physics2D.GetRayIntersection(ray);
            if (h2.collider != null && h2.distance < near) best = h2.collider.gameObject;
#endif
            return best != null ? new Item(best) : default;
        }
```

- [ ] **Step 2: `Tree.cs` · `UiToolkit.cs`**
  - `Item.Key` · `ChildrenOf(item, bool all)`(`all` 이면 꺼진 자식 · 숨은 요소 · 꺼진 UIDocument 의 `rootVisualElement` 도 — 컨트롤 속은 그대로 감춘다) · `Roots(all)` · `Find(target, bool all, out problem, out missing, out List<Item> trail)`(= `Select.One(target, Select.Run(target, all), !all)`, 지금 겹친 꼴 `Find(target, out problem)` · `Find(target, out problem, out missing)` 은 `all: false` 로 남긴다) · `TrailOf(item, all)`(지금 `Seek` 이 줄을 모은다) · `PathOf(item)` 은 `Select.PathOf(TrailOf(item, false), false)` · `Active(trail)`(줄의 모든 것이 `activeSelf` · `Shown`) · `ScreenPoint(item, Camera cam = null)`(월드 오브젝트만 `cam ?? Camera.main`). `FindPath` 는 지운다
  - `UiToolkit.Pick(Vector2 screen)` — 지금 `Topmost` 로 고른 panel 에서 `panel.Pick(ScreenToPanel(…))`(뒤집기 같게). `Topmost` 는 그대로 쓴다
- [ ] **Step 3: `Props.cs`**
  - `GetOn(object owner, string prop)` — UI Toolkit 요소처럼 컴포넌트 없이 그 객체에서 바로(`Guard(prop, () => Read(owner, null, prop.Split('.'), 0, prop))`)
  - `Components(GameObject go)` → `{"ok":true,"components":[{"name":…,"type":…}]}`
  - `Members(GameObject go, string component)` — `ComponentOf` 로 고르고 Unity 부모 앞까지

```cs
        private static bool UnityBase(Type t) => t == typeof(MonoBehaviour) || t == typeof(Behaviour) || t == typeof(Component) || t == typeof(UnityEngine.Object) || t == typeof(object);

        // 그 스크립트가 선언한 칸 · 메서드 — 컴파일러가 만든 이름(<…>)과 속성 접근자는 뺀다. 값은 읽다 던지거나 사본 속성이면 싣지 않는다.
        public static string Members(GameObject go, string component)
        {
            var c = ComponentOf(go, component ?? "");
            if (c == null) return Fail(go.name + " 에 " + component + " 컴포넌트가 없습니다");
            var flags = Member | BindingFlags.Static | BindingFlags.DeclaredOnly;
            var fields = new List<string>();
            var props = new List<string>();
            var methods = new List<string>();
            for (var t = c.GetType(); t != null && !UnityBase(t); t = t.BaseType)
            {
                foreach (var f in t.GetFields(flags))
                    if (f.Name.IndexOf('<') < 0) fields.Add(Entry(f.Name, f.FieldType, f.IsStatic, () => f.GetValue(f.IsStatic ? null : c), f.IsInitOnly || f.IsLiteral));
                foreach (var p in t.GetProperties(flags))
                {
                    var get = p.GetGetMethod(true);
                    if (get == null || p.GetIndexParameters().Length > 0) continue;
                    var copy = Array.IndexOf(Copying, p.Name) >= 0;
                    props.Add(Entry(p.Name, p.PropertyType, get.IsStatic, copy ? null : (Func<object>)(() => p.GetValue(get.IsStatic ? null : c)), p.GetSetMethod(true) == null));
                }
                foreach (var m in t.GetMethods(flags))
                {
                    if (m.IsSpecialName || m.Name.IndexOf('<') >= 0) continue;
                    var names = new List<string>();
                    foreach (var a in m.GetParameters()) names.Add(Json.Str(a.ParameterType.Name));
                    methods.Add("{\"name\":" + Json.Str(m.Name) + ",\"args\":[" + string.Join(",", names) + "],\"returns\":" + Json.Str(m.ReturnType.Name) + (m.IsStatic ? ",\"static\":true" : "") + "}");
                }
            }
            return "{\"ok\":true,\"fields\":[" + string.Join(",", fields) + "],\"properties\":[" + string.Join(",", props) + "],\"methods\":[" + string.Join(",", methods) + "]}";
        }

        private static string Entry(string name, Type type, bool isStatic, Func<object> read, bool readOnly)
        {
            var sb = new System.Text.StringBuilder("{\"name\":").Append(Json.Str(name)).Append(",\"type\":").Append(Json.Str(type.Name));
            if (read != null)
                try { sb.Append(",\"value\":").Append(Value(read())); }
                catch (Exception) { } // 게임 쪽 getter 가 던지면 값 없이 — 목록은 이어진다
            if (readOnly) sb.Append(",\"readOnly\":true");
            if (isStatic) sb.Append(",\"static\":true");
            return sb.Append('}').ToString();
        }
```

- [ ] **Step 4: `ControlServer.cs`**
  - `Command` 에 `public bool inactive; public string camera; public string component; public string format;`
  - `CameraOf(string address, out Camera cam, out string problem)` — 비면 `null`(기본), 아니면 `Tree.Find` 해서 `GetComponent<Camera>()`, 없으면 「… 에 Camera 가 없습니다」
  - `find` · `find-all` 은 `Found(trail, all, cam)` 하나로 같은 JSON(`path` · `text` · `interactable` · `id` · `active:false` · 켜진 것만 `x` · `y`), `find-at` 은 `Select.At` → 없으면 `found:false`, 있으면 `Tree.TrailOf` → `Found`
  - `get` — 요소면 `Props.GetOn(item.Ve, c.prop)`, 아니면 지금처럼. `set` · `call` · `components` · `members` · `text-set` 은 `c.inactive` 로 찾는다. 요소에 `set` · `call` · `components` · `members` 는 「UI Toolkit 요소라 컴포넌트가 없습니다 — get 은 요소 칸(value · text)을 바로 읽습니다」
  - `click` · `drag` 의 `Point(target, cam, …)` — 켜진 것만 찾고 `ScreenPoint(item, cam)`
  - `text-set` — 입력칸이면 「… 은 입력칸이라 type 으로 넣습니다」, `Text` · `TMP_Text` · `TextElement`(TextField 아님)에 넣고 `{"ok":true,"text":…}`(다시 읽은 `TextOf`), 없으면 「… 에 글자 컴포넌트(Text · TMP_Text · UI Toolkit Label/Button)가 없습니다」
  - `screenshot` — `format` 이 `""` · `"jpg"` 면 지금 그대로, `"png"` 면 `EncodeToPNG` 로 `{"ok":true,"png":…}`, 그 밖은 「format 은 jpg · png 중 하나입니다」
  - `SdkVersion = "0.5.0"`
- [ ] **Step 5: asmdef · 판** — `ControlCli.Runtime.asmdef` 의 `versionDefines` 에 `com.unity.modules.physics` → `CONTROL_CLI_PHYSICS`, `com.unity.modules.physics2d` → `CONTROL_CLI_PHYSICS2D`, `references` 에 `ControlCli.Id`(Step 0). `sdk/unity/package.json` · 뿌리 `package.json` 의 `version` 0.5.0. `Select.cs.meta` 는 새 guid(`uuidgen | tr -d - | tr 'A-Z' 'a-z'`)로 `Tree.cs.meta` 꼴을 따른다
- [ ] **Step 6: 확인** — `npm run -s build && node --test dist/protocol.test.js dist/sdk-meta.test.js`(Caps · 판 · .meta). 컴파일은 PR 의 sdk-compile(2021.3 · 2022.3 · 6000.0 × 입력 셋), 이 맥에서는 못 굽는다
- [ ] **Step 7: 커밋** — `git commit -m "Unity SDK — 선택자(Select.cs) · 꺼진 것 · 카메라 · find 답 x,y,id · find-all · find-at · UI Toolkit get · components · members · text-set · PNG · 0.5.0"`

### Task 6: Unity SDK 영구 id — 빌드 훅

**Files:** Create `sdk/unity/Editor/ControlCli.Editor.asmdef` · `StampIds.cs` (+ 폴더 · 파일 .meta 셋). `ControlCliId` 는 Task 5 Step 0

- [ ] **Step 1: `ControlCli.Editor`** — `includePlatforms: ["Editor"]` · `references: ["ControlCli.Id"]` · 정의 제약 없음(SDK 패키지가 든 프로젝트 = QA 빌드 잡)

```cs
// QA 빌드가 장면을 구울 때 오브젝트마다 장면 파일 속 번호(GlobalObjectId)를 ControlCliId 로 붙인다 — 게임 저장소의 장면은 그대로, 빌드마다 같은 id
// ponytail: SDK 패키지를 늘 두는 게임은 release 빌드에도 붙는다(글자 칸 하나씩) — 걸리면 플레이어 어셈블리에 ControlCli.Runtime 이 드는지로 가른다.
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ControlCli.Editor
{
    internal sealed class StampIds : IProcessSceneWithReport
    {
        public int callbackOrder => 0;

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            // 에디터 재생(report 가 null)은 건너뛴다 — 그때는 instance id 로 찾는다.
            if (report == null) return;
            int stamped = 0, total = 0;
            foreach (var root in scene.GetRootGameObjects())
                foreach (var t in root.GetComponentsInChildren<Transform>(true))
                {
                    total++;
                    var gid = GlobalObjectId.GetGlobalObjectIdSlow(t.gameObject);
                    if (gid.targetObjectId == 0) continue;
                    var id = t.GetComponent<ControlCliId>() ?? t.gameObject.AddComponent<ControlCliId>();
                    id.Id = gid.targetPrefabId == 0 ? gid.targetObjectId.ToString() : gid.targetObjectId + "." + gid.targetPrefabId;
                    stamped++;
                }
            // sample 빌드 로그에서 본다 — 0/N 이면 이 Unity 판은 장면을 굽는 중에 번호를 못 준다(p2b-plan Task 6 Step 3).
            Debug.Log("[ControlCli] " + scene.path + " 오브젝트 " + stamped + "/" + total + "개에 영구 id");
        }
    }
}
```

- [ ] **Step 2: .meta** — 폴더 `Editor`, asmdef, `.cs` 의 .meta 를 새 guid 로(`ControlCli.Input.asmdef.meta` · `Tree.cs.meta` 꼴). `node --test dist/sdk-meta.test.js` 통과
- [ ] **Step 3: 확인 지점(sample 빌드)** — Task 9 의 sample run 로그에 `[ControlCli] Assets/Second.unity 오브젝트 1/1개에 영구 id` 가 나와야 한다. `0/1` 이면 `GlobalObjectId` 가 굽는 중에 0 을 준 것 — 그때는 id 를 「장면 이름/형제 순번 줄」(`Second/0` — 장면 속 차례가 그대로면 같은 id)로 바꾸고 그 한계를 context-notes 에 적은 뒤 사용자에게 알린다
- [ ] **Step 4: 커밋** — `git commit -m "Unity SDK 영구 id — QA 빌드 훅이 장면 오브젝트에 fileID 를 ControlCliId 로 붙인다"`

### Task 7: 표준 화면

**Files:** Modify `sample/Assets/Sample/SampleScreen.cs` · `sample/Assets/Editor/SampleBuild.cs`

- [ ] **Step 1: `SampleScreen.Build`**

```cs
            // conform B — 내장 태그 · 레이어(프로젝트 설정 없이)로 선택자를 본다.
            cube.tag = "Player";
            cube.layer = 4; // Water
            // 화면을 덮지 않게 끈 옆 카메라 — camera 칸이 Camera.main 과 다른 자리를 셈하는지. 세로 화면 반 폭(거리 10 에서 약 2.6)보다 덜 비켜 큐브가 시야 안이다.
            var side = new GameObject("SideCamera", typeof(Camera));
            side.GetComponent<Camera>().enabled = false;
            side.transform.position = new Vector3(1.5f, 0, -10);
```

```cs
            // 꺼진 글자 — inactive 로만 찾는다.
            var hidden = Label(root, "HiddenText", Right, 5);
            hidden.text = "hidden";
            hidden.gameObject.SetActive(false);
```

- [ ] **Step 2: `SampleBuild.Build`** — `Second.unity` 에 저장 오브젝트 하나(빌드 훅이 영구 id 를 붙인다)

```cs
        // conform B 영구 id — 장면에 저장된 오브젝트라야 빌드 훅이 fileID 를 붙인다(SecondMarker 는 실행 중에 만든다).
        var second = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        new UnityEngine.GameObject("SecondSaved");
        EditorSceneManager.SaveScene(second, SecondScene);
```

- [ ] **Step 3: 확인** — 컴파일은 PR 의 sdk-compile(샘플 런타임 코드) · sample(빌드 스크립트)
- [ ] **Step 4: 커밋** — `git commit -m "표준 화면 — WorldCube 태그 Player · 레이어 Water · SideCamera · HiddenText · Second 장면의 SecondSaved"`

### Task 8: README · AltTester 표

**Files:** Modify `README.md` · `docs/roadmap/plan.md`

- [ ] README — 주소 절에 선택자 꼴(표 하나 — `//` · `*` · `..` · `@칸` · `contains` · `[n]` · `[-1]`, 여럿이면 실패), SDK 명령 표 5줄 + 바뀐 칸(`inactive` · `camera` · `format`), CLI 명령 표(`find-all` · `find-at` · `parent` · `wait-prop` · `components` · `members` · `text-set` · `config` · `snapshot --png` · `--inactive` · `--camera`), MCP 도구 표 줄, 영구 id(QA 빌드 훅 · 실행 중 만든 것은 instance id)
- [ ] plan.md 1절 — 「찾기」 P2-B 줄 ✓(`find-all` · `contains` · `find-at` · 선택자), 「설정」 줄은 `config --wait` ✓ · 명령 시간 초과 · 명령 뒤 쉼은 「필요 없음 — 기다리기가 바깥 되풀이」, 「스크린샷」 PNG ✓, 「오브젝트」 P2-B 두 줄 ✓. 머리말의 셈(37.5/68 → P2-B 뒤 값)
- [ ] 커밋 — `git commit -m "README — 선택자 · 찾기 · 설정 명령 표 · AltTester 표 P2-B"`

### Task 9: PR · 실기기 · 다음 세션

- [ ] 전체 `npm test` 한 번 → push → draft PR(`p2b` → `roadmap`) — sdk-compile · sample 이 돈다
- [ ] sample 로그에서 Task 6 Step 3 의 영구 id 줄을 본다(잡마다 — 2021.3 · 2022.3 · 6000.0)
- [ ] sample run 의 Android APK 로 팜 폰(사용자가 정한 serial)에서 `hold` → `open --app` → `conform` → 「통과 33 · 실패 0 · 건너뜀 0」 → `close` → `release`. 2021.3 옛 Input APK 도. 이 맥 macOS 앱도 되면(`caffeinate -d -u -t 900`)
- [ ] checklist P2-B 체크 · context-notes 「P2-B 실기기」 · 맨 위 「다음 세션은 여기부터」를 P2-C 로 · test_platform kit 다음 줄 — `findAll` · `findAt` · `parent` · `waitForProp` · `components` · `members` · `setText`, `find` · `get` · `set` · `callMethod` · `click` · `drag` 의 옵션 `{ inactive?, camera? }`, `screenshot(format)`(꼴은 control_cli `src/game.ts`). `parent` · `waitForProp` 은 바깥 되풀이라 kit 에도 같은 되풀이가 든다
