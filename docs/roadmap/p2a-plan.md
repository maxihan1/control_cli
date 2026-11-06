# P2-A Unity 게임 상태 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AltTester 의 게임 상태 명령(CallComponentMethod · SetComponentProperty · CallStaticMethod · Get/SetStaticProperty · PlayerPrefs 넷 · Get/SetTimeScale · LoadScene · UnloadScene · GetAllLoadedScenes · WaitForCurrentSceneToBe)을 control_cli 명령으로 넣고, 표준 화면 `conform` 의 A 줄이 팜 폰에서 초록이 된다.

**Architecture:** 명령 14개를 `protocol/commands.json` 에 더하면 CLI(`Game`) · MCP 도구 · `conform` 이 같은 목록을 쓴다. Unity SDK 는 reflection 명령(`call` · `set` · `static-*`)을 `Props.cs` 에, 엔진 낱말 명령(저장 값 · 시간 배율 · 장면)을 새 `GameState.cs` 에 둔다. 장면 열기 · 닫기는 바로 답하고 CLI 가 `scenes` 를 되풀이해 다 열릴 때까지 기다린다(기다리기는 바깥에서 — 명령 하나가 팜 15초 · SDK 10초 한도에 안 걸린다).

**Tech Stack:** TypeScript(Node 22 · `node:test`) · Unity C#(2021.3 · 2022.3 · 6000.0, reflection · `PlayerPrefs` · `SceneManager`) · GitHub Actions(sdk-compile · sample) · 디바이스 팜(사용자가 정한 폰)

로드맵은 [plan.md](plan.md) P2-A, 할 일 체크는 [checklist.md](checklist.md) P2-A, 결정은 [context-notes.md](context-notes.md) 「P2-A 설계」.
브랜치 `p2a`(`origin/roadmap` 위 — PR #16 이 합쳐짐, PR 은 `roadmap` 으로). 테스트는 고친 파일의 테스트만 — `npm run -s build && node --test dist/<이름>.test.js`. 전체 `npm test` 는 Task 6 push 전에 한 번.

## 설계

| 정할 것 | 고른 것 | 까닭 |
|---|---|---|
| 명령 이름 | `call` · `set` · `static-call` · `static-get` · `static-set` · `pref-get` · `pref-set` · `pref-delete` · `pref-clear` · `timescale-get` · `timescale-set` · `scenes` · `scene-load` · `scene-unload` | 명령마다 칸이 정해진다 — MCP 도구 꼴이 고정이라 AI 가 덜 틀린다. static 을 `get` 의 빈 target 으로 합치면 옛 SDK(0.3.0)가 caps 로 못 거른다. `<낱말>-<동사>` 로 묶어 도구 목록에서 모인다 |
| 엔진 낱말 | 저장 값 · 시간 배율 · 장면은 따로 명령(reflection 위가 아님) | plan.md 엔진 표 — Godot `Engine.time_scale` · Unreal Time Dilation 이 같은 명령으로 따라온다 |
| 칸 꼴 | commands.json 칸 `type` 에 `array`(글자 배열 — `call` 의 `args`) · `enum`(고를 글자 — `pref-*` 의 `type` · `scene-load` 의 `mode`)을 더한다 | 메서드 인자는 개수가 정해지지 않는다. MCP 는 숫자 · 참거짓 배열도 받아 글자로 바꾼다(AI 가 `[2, 3]` 으로 보낸다) |
| 값 바꾸기 | `set` 값 · 메서드 인자는 글자 — SDK 가 받을 칸 타입으로 바꾼다(글자 · 숫자 · 참거짓 · 열거 이름 · `[x,y,z]` 벡터 · 색) | `get` 이 주는 꼴을 그대로 `set` 에 넣는다. 타입은 게임 쪽이 안다 |
| 겹친 메서드 | 인자 수가 맞고 글자를 다 바꿀 수 있는 첫 꼴 · 없으면 있는 꼴을 실패 글에 | AltTester 의 typeOfParameters 를 받지 않는다 — 쓸 일이 생기면 더한다 |
| 칸 길 | `컴포넌트.칸[.칸…]` — 가운데 값 타입(Vector3)은 사본이라 바꾼 뒤 거꾸로 다시 써 넣는다 | `Transform.position.y` 를 바꾸면 position 이 바뀌어야 한다 |
| static 타입 | `타입.칸` 의 가장 긴 앞부분이 타입 — 전체 이름(`UnityEngine.Time`) 또는 하나뿐인 짧은 이름(`Time`) | 겹치면 고르지 않고 실패(Tree.Find 와 같은 규칙) |
| 저장 값 타입 | `type` 은 `string`(기본) · `int` · `float` — 넣은 타입으로 읽는다. 쓴 뒤 `PlayerPrefs.Save()` | Unity PlayerPrefs 는 담긴 타입을 안 알려 준다. 게임이 죽어도 남게 |
| 시간 배율 | `timescale-get` · `timescale-set {scale}`(0~100) | 칸 하나로 읽기 · 쓰기를 가르면 「없음」과 「0(멈춤)」이 JsonUtility 에서 갈리지 않는다 |
| 장면 기다리기 | `scene-load` · `scene-unload` 는 바로 답한다(그때의 `loads` · `unloads` 수). `scenes` 가 `{active, loaded, loads, unloads}` 를 주고 `Game.loadScene` 이 수가 늘고 그 장면이 열릴 때까지(한 장면이면 지금 장면이 될 때까지) 되풀이한다. `waitForScene` 은 지금 장면만 본다 | 큰 장면은 10초를 넘는다. 같은 장면을 다시 열어도(이름이 그대로) 수로 갈린다 |
| 빌드에 없는 장면 | `Application.CanStreamedLevelBeLoaded` 로 먼저 거절 · 마지막 장면 닫기도 거절 | Unity 가 에러 로그를 남겨 `errors` 줄이 빨개진다 |
| 열리는 중인 장면 | `Tree.RootObjects` 가 `isLoaded` 아닌 장면을 건너뛴다 | 열리는 중 `GetRootGameObjects` 가 던져 `tree` · `find` 가 실패한다 — 공용 함수 한 곳에서 |
| 표준 화면 | `Second` 장면(빌드 두 번째) · `SecondMarker` · `TouchProbe.Say(word, times)` · `static TouchProbe.Add(a, b)` · `static TouchProbe.Note` · 샘플은 `Sample` 이 열릴 때마다 화면을 다시 만든다 | 한 장면 열기 뒤 `Sample` 로 돌아오면 표준 화면이 다시 있어야 다음 판이 돈다 |
| conform A 줄 | 7줄(`A ` 로 시작) — `errors` 줄 바로 앞, 장면 둘은 맨 뒤(화면을 새로 만든다) | 23줄 |
| Game 메서드(kit 이름) | `callMethod` · `set` · `callStatic` · `getStatic` · `setStatic` · `pref` · `setPref` · `deletePref` · `clearPrefs` · `timeScale` · `setTimeScale` · `scenes` · `loadScene` · `unloadScene` · `waitForScene` | `Game.call` 은 P1 부터 날 명령 보내기(MCP)라 메서드 부르기는 `callMethod` |
| 판 | SDK · CLI 0.4.0 · protocol 2 그대로 | 명령을 더했을 뿐 꼴은 같다 — 옛 CLI 는 새 명령을 모르고, 새 CLI 는 caps 로 옛 SDK 를 거른다 |
| 뺀 것 | 선택적 인자 채우기 · 제네릭 메서드 · `params` · 객체 참조 값 넣기 · 저장 값 타입 알아내기 | 플랫폼마다 PlayerPrefs 저장 꼴이 달라 알아내기가 틀릴 수 있다. 쓸 일이 생기면 더한다 |

## 파일 지도

| 파일 | 하는 일 | Task |
|---|---|---|
| `protocol/commands.json` | 명령 14개 · `array` · `enum` | 1 |
| `src/protocol.ts` · `src/protocol.test.ts` | 칸 꼴에 `array` · `enum` | 1 |
| `src/mcp.ts` · `src/mcp.test.ts` | 배열 · 고를 글자 도구 꼴 · 검사 | 1 |
| `src/game.ts` | Game 메서드 15개 · `Scenes` · `WAIT.sceneMs` | 2 |
| `src/fake-game.ts` | 가짜 SDK 가 새 명령 · 표준 화면 Second 장면 · TouchProbe | 2 |
| `src/conform.ts` · `src/conform.test.ts` | A 줄 7개 | 2 |
| `src/cli.ts` · `src/cli.test.ts` | CLI 명령 · Ran 줄 · help | 3 |
| `sdk/unity/Runtime/Props.cs` | `Set` · `Call` · `GetStatic` · `SetStatic` · `CallStatic` · 글자 → 타입 | 4 |
| `sdk/unity/Runtime/GameState.cs`(+ .meta, 새) | 저장 값 · 시간 배율 · 장면 | 4 |
| `sdk/unity/Runtime/ControlServer.cs` · `Tree.cs` · `package.json` | 명령 갈래 · Caps · 0.4.0 · 열리는 중인 장면 건너뛰기 | 4 |
| `sample/Assets/Sample/*` · `sample/Assets/Editor/SampleBuild.cs` | Second 장면 · 다시 만들기 · TouchProbe | 4 |
| `README.md` · `docs/roadmap/*` | 명령 표 · AltTester 표 · 결과 · 다음 세션 | 5 · 6 |

---

### Task 1: 명령 정의 — commands.json 14개 · `array` · `enum` · MCP 도구 꼴

**Files:** Modify `protocol/commands.json` · `src/protocol.ts` · `src/protocol.test.ts` · `src/mcp.ts` · `src/mcp.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `src/protocol.test.ts` 의 칸 검사를 바꾼다.

```ts
    for (const [k, a] of Object.entries(c.args)) {
      assert.ok(['string', 'number', 'array'].includes(a.type), `${c.name}.${k} 의 type`);
      assert.equal(typeof a.required, 'boolean', `${c.name}.${k} 의 required`);
      assert.ok(a.summary, `${c.name}.${k} 의 summary`);
      if (a.enum !== undefined) assert.ok(a.type === 'string' && a.enum.length > 0 && a.enum.every((e) => typeof e === 'string'), `${c.name}.${k} 의 enum`);
    }
```

`src/mcp.test.ts` 「open 전에는 …」 테스트 끝에 —

```ts
  assert.match((await call('static-call', { method: 'A.B', args: 'x' })).content[0].text!, /^static-call 의 args 는 글자 배열이어야 합니다/);
  assert.match((await call('pref-get', { key: 'k', type: 'bool' })).content[0].text!, /^pref-get 의 type 는 string · int · float 중 하나여야 합니다/);
```

- [ ] **Step 2: 실패 확인** — `npm run -s build && node --test dist/protocol.test.js dist/mcp.test.js` → Caps 대조는 아직 통과, 새 단언 실패(모르는 도구 -32602)

- [ ] **Step 3: 구현** — commands.json 끝에 14개(아래 꼴), `Arg` 에 `type: 'string' | 'number' | 'array'` · `enum?: string[]`, mcp `tools()` 가 `array` 는 `{type:'array', items:{type:'string'}}`, `enum` 은 그대로 싣고 `pick()` 이 배열 칸은 글자 · 숫자 · 참거짓만 받아 글자로 바꾼다. `ControlServer.cs` 의 `Caps` 도 같은 차례로 더한다(protocol.test 가 본다 — SDK 구현은 Task 4).

```json
{ "name": "call", "summary": "컴포넌트 메서드를 부르고 돌려준 값을 준다", "args": {
  "target": { "type": "string", "required": true, "summary": "오브젝트 주소" },
  "method": { "type": "string", "required": true, "summary": "컴포넌트.메서드 — PlayerController.Jump" },
  "args": { "type": "array", "required": false, "summary": "인자 — 글자로, SDK 가 메서드 칸 타입으로 바꾼다('2' · 'true' · '[0,1,0]')" } } },
{ "name": "set", "summary": "컴포넌트 칸 값을 쓰고 다시 읽은 값을 준다", "args": { "target", "prop", "value": "get 이 주는 꼴의 글자" } },
{ "name": "static-call", "args": { "method": "타입.메서드 — 전체 이름 또는 하나뿐인 짧은 이름", "args" } },
{ "name": "static-get", "args": { "prop": "타입.칸[.칸…] — UnityEngine.Time.timeScale" } },
{ "name": "static-set", "args": { "prop", "value" } },
{ "name": "pref-get", "args": { "key", "type": { "enum": ["string", "int", "float"], "required": false } } },
{ "name": "pref-set", "args": { "key", "value", "type" } },
{ "name": "pref-delete", "args": { "key" } },
{ "name": "pref-clear", "args": {} },
{ "name": "timescale-get", "args": {} },
{ "name": "timescale-set", "args": { "scale": { "type": "number" } } },
{ "name": "scenes", "args": {} },
{ "name": "scene-load", "args": { "name", "mode": { "enum": ["single", "add"], "required": false } } },
{ "name": "scene-unload", "args": { "name" } }
```

- [ ] **Step 4: 통과 확인** — 같은 명령, 통과
- [ ] **Step 5: 커밋** — `git commit -m "명령 정의 — P2-A 게임 상태 14개 · 칸 꼴 array · enum · MCP 도구 꼴"`

### Task 2: Game 메서드 · 가짜 SDK · conform A 줄

**Files:** Modify `src/game.ts` · `src/fake-game.ts` · `src/conform.ts` · `src/conform.test.ts` · `src/mcp.test.ts`(줄 수)

- [ ] **Step 1: 실패하는 테스트** — `src/conform.test.ts` 의 줄 수를 A 줄 7개만큼 늘린다(16 → 23, 13·2·1 → 20·2·1, 14·2·0 → 21·2·0, find 를 빼면 12·0·11). 장면 줄이 화면을 새로 만들어도 다시 돌릴 수 있는지 —

```ts
test('A 줄 — 장면을 바꿨다 돌아오면 표준 화면이 새로 서고, 저장 값 · 시간 배율이 남지 않는다', async () => {
  const g = standardScreen();
  const r = await conform(direct(g));
  assert.deepEqual([r.passed, r.failed, r.skipped], [23, 0, 0], report(r));
  assert.deepEqual([g.scene, g.loaded.map((l) => l.name), g.prefs.size, g.timeScale], ['Sample', ['Sample'], 0, 1]);
  assert.match(report(r), /✓ A scene-load Second → Sample 로 돌아오면 표준 화면을 다시 만든다/);
});

test('A 줄 — 장면이 늦게 열리면 loadScene 이 기다리고, 끝내 안 열리면 장면 이름과 함께 실패한다', async () => {
  const g = standardScreen();
  const game = direct(g);
  g.loadDelay = 3; // scenes 를 세 번 물을 때까지 열리는 중
  await game.loadScene('Second', { add: true });
  assert.deepEqual((await game.scenes()).loaded, ['Sample', 'Second']);
  g.loadDelay = Infinity;
  await assert.rejects(game.loadScene('Second', { timeoutMs: 30 }), /Second 이 열리지 않았습니다 \(지금 Sample · 열린 것 Sample · Second\)/);
  await assert.rejects(game.loadScene('Nope'), /장면 Nope 은 빌드에 없습니다/);
});
```

- [ ] **Step 2: 실패 확인** — `npm run -s build` 가 타입 오류(`loaded` · `prefs` · `loadScene` 없음)
- [ ] **Step 3: 구현**
  - `game.ts` — `WAIT.sceneMs = 30_000`, `Scenes` · `PrefType`, 메서드 15개(설계 표). `loadScene` 은 `scene-load` 답의 `loads` 보다 `scenes().loads` 가 커지고 `loaded` 에 이름이 있고 한 장면이면 `active` 가 그 이름일 때까지, `unloadScene` 은 `unloads` 가 커질 때까지, `waitForScene` 은 `active` 만
  - `fake-game.ts` — 노드 `methods` · `set`, 게임 `statics` · `staticMethods` · `prefs` · `timeScale` · `sceneRoots` · `loaded` · `loads` · `unloads` · `loadDelay`. `standardScreen` 은 `Sample` 뿌리를 만드는 함수를 장면 열 때마다 다시 부른다
  - `conform.ts` — A 줄 7개(`A call` · `A set` · `A static` · `A timescale` · `A pref` · `A scene add` · `A scene single`)를 `errors` 줄 앞에
- [ ] **Step 4: 통과 확인** — `node --test dist/conform.test.js dist/mcp.test.js`(MCP 도구로도 23/23)
- [ ] **Step 5: 커밋** — `git commit -m "conform A 줄 — 메서드 · 칸 쓰기 · static · 저장 값 · 시간 배율 · 장면, Game 메서드 · 가짜 SDK"`

### Task 3: CLI 명령 · Ran 줄

**Files:** Modify `src/cli.ts` · `src/cli.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `src/cli.test.ts` 에 PC 가짜 게임(표준 화면)으로 —

```ts
test('게임 상태 명령 — Ran 줄이 kit 의 game.* 이름 · 인자 꼴로 찍힌다', async (t) => {
  // open --pc 뒤
  assert.match(await cli('call', 'SampleCanvas', 'TouchProbe.Say', 'hi', '3'), /^Ran: await game\.callMethod\('SampleCanvas', 'TouchProbe\.Say', \['hi', '3'\]\)\n- 값: "hi 3"/);
  assert.match(await cli('set', 'StatusText', 'Text.text', 'x'), /^Ran: await game\.set\('StatusText', 'Text\.text', 'x'\)\n- 값: "x"/);
  assert.match(await cli('static-call', 'Sample.TouchProbe.Add', '2', '3'), /^Ran: await game\.callStatic\('Sample\.TouchProbe\.Add', \['2', '3'\]\)\n- 값: 5/);
  assert.equal(await cli('pref-set', 'lv', '3', '--type', 'int'), "Ran: await game.setPref('lv', '3', 'int')");
  assert.equal(await cli('pref-get', 'lv', '--type', 'int'), "Ran: await game.pref('lv', 'int')\n- 값: 3");
  assert.equal(await cli('timescale-set', '0.5'), 'Ran: await game.setTimeScale(0.5)');
  assert.match(await cli('scene-load', 'Second', '--add'), /^Ran: await game\.loadScene\('Second', \{ add: true \}\)/);
  assert.match(await cli('scene-wait', 'Sample', '--timeout', '5'), /^Ran: await game\.waitForScene\('Sample', \{ timeoutMs: 5000 \}\)/);
  await assert.rejects(cli('timescale-set', 'fast'), /timescale-set <배율> 꼴이어야 합니다/);
});
```

- [ ] **Step 2: 실패 확인** — 「모르는 명령입니다: call」
- [ ] **Step 3: 구현** — `--type` · `--add` 옵션, `switch` 갈래 14개 + `scene-wait`, HELP 줄. 화면이 바뀔 수 있는 `call` · `set` · `static-call` · `static-set` · `scene-*` 는 `after()`(화면 파일), 읽기 · 저장 값 · 시간 배율은 Ran 줄만
- [ ] **Step 4: 통과 확인** — `node --test dist/cli.test.js`
- [ ] **Step 5: 커밋** — `git commit -m "CLI — 게임 상태 명령 · Ran 줄(callMethod · set · callStatic · pref · setTimeScale · loadScene · waitForScene)"`

### Task 4: Unity SDK · 표준 화면

**Files:** Modify `sdk/unity/Runtime/Props.cs` · `ControlServer.cs` · `Tree.cs` · `sdk/unity/package.json` · `sample/Assets/Sample/SampleScreen.cs` · `TouchProbe.cs` · `sample/Assets/Editor/SampleBuild.cs`, Create `sdk/unity/Runtime/GameState.cs` · `GameState.cs.meta`

- [ ] **Step 1: SDK** — `Props` 에 `Set` · `Call` · `GetStatic` · `SetStatic` · `CallStatic`(칸 찾기 `MemberOf` · 글자 → 타입 `Parse` · 타입 찾기 `TypeOf` · 게임이 던진 예외는 「게임이 던졌습니다」), `GameState`(저장 값 · 시간 배율 · 장면 · `loads`/`unloads` 수 — `ControlServer.Boot` 에서 `Watch()`), `ControlServer` 의 `Command` 칸 `method` · `args` · `value` · `type` · `scale` · `name` · `mode` 와 갈래, `SdkVersion` · `package.json` 0.4.0, `Tree.RootObjects` 가 `isLoaded` 아닌 장면을 건너뛴다
- [ ] **Step 2: 표준 화면** — `SampleBuild` 가 `Assets/Second.unity` 를 만들어 빌드 두 번째 장면으로, `SampleScreen` 은 `BeforeSceneLoad` 에서 `sceneLoaded` 를 걸어 `Sample` 이 열릴 때마다 화면을 만들고 `Second` 에는 `SecondMarker` 를 그 장면에 둔다, `TouchProbe` 에 `[Preserve]` `Say` · `Add` · `Note`
- [ ] **Step 3: 확인** — `npm run -s build && node --test dist/protocol.test.js dist/sdk-meta.test.js`(Caps · 판 · .meta), 컴파일은 PR 의 sdk-compile(2021.3 · 2022.3 · 6000.0 × 입력 셋)
- [ ] **Step 4: 커밋** — SDK 와 샘플을 따로 두 번

### Task 5: README · AltTester 표

**Files:** Modify `README.md` · `docs/roadmap/plan.md`

- [ ] SDK 명령 표 14줄 · CLI 명령 표 · MCP 도구 표 줄, plan.md 1절 「게임 상태」 · 「오브젝트」 줄의 P2-A 칸을 ✓ 로
- [ ] 커밋 — `git commit -m "README — 게임 상태 명령 표 · AltTester 표 P2-A"`

### Task 6: PR · 실기기 · 다음 세션

- [ ] 전체 `npm test` 한 번 → push → draft PR(`p2a` → `roadmap`) — sdk-compile · sample 이 돈다
- [ ] sample run 의 Android APK 로 팜 폰(사용자가 정한 serial)에서 `hold` → `open --app` → `conform` → 「통과 23 · 실패 0 · 건너뜀 0」 → `close` → `release`. 이 맥 macOS 앱도 되면(`caffeinate -d -u -t 900`)
- [ ] checklist P2-A 체크 · context-notes 「P2-A 실기기」 · 맨 위 「다음 세션은 여기부터」를 P2-B 로 · test_platform kit 다음 줄(새 `game.*` 15개)
