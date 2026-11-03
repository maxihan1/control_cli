# control_cli

Unity 게임을 자동화 테스트로 조작하는 SDK 와 CLI.

- **SDK** (Unity UPM 패키지) — QA 빌드에서만 게임 안 `127.0.0.1` 에 포트를 열고, 오브젝트 트리 읽기 · 찾기 · 누르기 · 끌기 · 글자 넣기 · 키 · 속성 읽기 · 스크린샷을 받는다. 터치는 빌드 때 이름이 같은 가짜 `Input` 으로 바꿔치기하고, 새 Input System 게임에는 장치 이벤트로 넣는다
- **CLI** — appium-cli 꼴. snapshot(줄인 트리 + 스크린샷) → ref → 액션, 액션마다 케이스에 붙일 코드 한 줄(`Ran:`)을 찍는다. 디바이스 팜 게임 명령 주소 · USB `adb forward` · PC(TCP) · USB iPhone(usbmuxd) 로 잇는다
- **MCP** — `control-cli mcp`. AI 앱(Claude Desktop · Claude Code)이 띄우는 stdio MCP 서버로, 같은 명령을 도구로 내준다 — 셸 없는 AI 앱도 게임을 조작한다
- **라이브러리** — CLI 와 같은 드라이버(`Game`)와 연결 길(`farmLink` · `usbLink` · `tcpLink` · `iosLink`). test_platform kit 이 CLI 를 띄우지 않고 쓴다

0단계 실측 결과는 [docs/step0.md](docs/step0.md). Unity 지원 넓히기의 결정 기록은 [docs/unity/](docs/unity/context-notes.md).

## 지원

| 무엇 | 받는 것 | 실기기로 확인 | 컴파일만 확인 |
|---|---|---|---|
| Unity 판 | 2021.3 · 2022.3 · 6000.0 | 6000.0 (Ashveil) | 2021.3 · 2022.3 |
| UI | uGUI · TextMeshPro · UI Toolkit(UIDocument) | uGUI | TMP · UI Toolkit (`layout` 은 uGUI 만) |
| 입력 | 옛 Input · 새 Input System · 둘 다 | 옛 Input | Input System(Touchscreen · Mouse · Keyboard) |
| 플랫폼 | Android(팜 · USB) · PC(Windows · macOS) · iOS(USB, 17+) | Android | PC · iOS (CLI 는 가짜 게임 · 가짜 usbmuxd 로 테스트) |

「컴파일만 확인」은 `tools/unity-compile-check` 9개 구성과 CLI 테스트까지다 — 샘플 Unity 프로젝트(`sample/`)를 CI 가 판 · 입력 · 플랫폼마다 구워(`.github/workflows/sample.yml`, Unity 라이선스 Secret 필요) 실기기에서 돌려 봐야 「실기기로 확인」으로 옮긴다.
못 가로채는 것 — 게임 코드가 `UnityEngine.Input` 을 전체 이름으로 부르는 곳 · DLL plugin 안의 입력. 디바이스 팜은 Android 만 받는다.

## 게임에 넣기 (QA 빌드만)

Unity 2021.3 LTS 이상 — 2021.3 · 2022.3 · 6000.0 에서 컴파일을 검사한다(`tools/unity-compile-check`).

게임 저장소에는 SDK 를 넣지 않는다. QA 빌드 잡에서 Unity 를 켜기 전에 한 번 돌린다.

```bash
git clone -q https://github.com/maxihan1/control_cli.git /tmp/control_cli
git -C /tmp/control_cli checkout -q <커밋>
npm --prefix /tmp/control_cli ci          # 받으면서 CLI 를 빌드한다
node /tmp/control_cli/dist/main.js instrument <Unity 프로젝트 폴더> --ref <커밋>
```

`npx github:maxihan1/control_cli` 는 쓰지 않는다 — npm 10 이 git 패키지를 npx 로 받을 때 「GitFetcher requires an Arborist constructor」로 멈춘다(GitHub Actions 에서 확인).

1. `Packages/manifest.json` 에 SDK 패키지를 `--ref` 로 고정해 더한다(없으면 `main`)
2. `Assets/` · `Packages/`(내장 패키지) 아래 asmdef 의 `references` 에 `ControlCli.Input` 을 더한다 — 에디터 전용 · `noEngineReferences` 는 건너뛴다. asmdef 없는 스크립트(Assembly-CSharp)는 자동으로 참조한다
3. `namespace` 안에 `using UnityEngine;` 을 둔 파일 · `namespace UnityEngine.*` 안의 파일은 `UnityEngine.Input` 이 먼저 잡혀 가짜 터치를 못 본다 — 경고로 알려 준다
4. 깨진 asmdef 가 있으면 파일 이름을 알리고 아무것도 바꾸지 않는다

그리고 **QA 빌드 스크립트가 정의 심볼 `CONTROL_CLI` 를 더한다** — 없으면 SDK 코드가 빌드에 아예 안 들어간다. Release 빌드는 손대지 않으면 된다.

가짜 `Input` 은 `UnityEngine.Input` 의 멤버를 다 감싼다(펜 · `mousePositionDelta` · `location` 은 빠짐 — `location` 은 적기만 해도 Android 에 위치 권한이 붙고 iOS 빌드가 위치 사용 문구를 요구해서다. 쓰는 게임은 `UnityEngine.Input.location` 으로 적는다). 터치만 가짜를 섞고(진짜 폰처럼 `simulateMouseWithTouches` 가 켜져 있으면 마우스 왼쪽 단추에도 비춘다) 나머지는 그대로 넘긴다. 새 Input System 을 쓰는 게임에는 같은 터치를 `Touchscreen` 장치 이벤트로 넣는다 — `InputSystemUIInputModule` · EnhancedTouch · `Touchscreen.current` 가 같이 본다. UI Toolkit 화면은 EventSystem 이 있으면 그 입력 모듈로 같은 터치가 닿고, 없으면(옛 Input) UI Toolkit 이 `UnityEngine.Input` 을 바로 읽어 SDK 가 panel 에 Pointer 이벤트를 보낸다. `touchSupported` 는 늘 `true` 다.
알려진 한계 — `Assets/Plugins` 의 스크립트(Assembly-CSharp-firstpass)도 가짜 `Input` 을 보게 되어, 빠진 멤버를 쓰면 QA 빌드에서만 컴파일이 깨진다. 그런 게임이 오면 그 멤버를 더한다.

## CLI

```bash
npm i -D github:maxihan1/control_cli#v0.2.0
npx control-cli help
```

### 루프 — 디바이스 팜

```bash
export PLATFORM_APPIUM_URL=http://<팜>:4723/wd/hub PLATFORM_APPIUM_TOKEN=pat_…   # 팜이 인증을 켰을 때만 토큰
npx control-cli hold --minutes 30                 # 빈 폰 하나를 잡는다(--udid 로 고를 수도) — 방금 놓은 폰은 팜이 정리를 마칠 때까지 20초까지 기다린다
npx control-cli open --app https://…/qa.apk       # 잡은 폰에 깔고 켠 뒤 게임이 답할 때까지 기다려 첫 화면을 찍는다
npx control-cli snapshot                          # - Snapshot: .control-cli/default-….yml · - Screenshot: ….png
npx control-cli type e2 qa_user01                 # Ran: await game.type('IdInput', 'qa_user01')
npx control-cli click e3                          # Ran: await game.click('LoginButton')
npx control-cli wait e5 --text 아이디는           # Ran: await game.waitFor('StatusText', { text: '아이디는' })
npx control-cli close                             # Appium 세션을 닫는다
npx control-cli release                           # 폰을 놓는다 — 팜이 깐 게임 · 데이터를 지운다
```

화면 파일 한 줄이 오브젝트 하나다. 글자 · 버튼이 아니고 갈림길도 아닌 외길 오브젝트는 빠진다. ref 는 마지막 화면에서만 쓴다.

```
# 장면 Boot · 화면 2400×1080
- LoginView [ref=e1]
  - InputField IdInput "" [ref=e2]
  - Button LoginButton [ref=e3]
    - Text Text "로그인" [ref=e4]
  - Text StatusText "" [ref=e5]
```

`-s=<이름>` 으로 세션을 여럿 둔다(기본 `default`). 세션 파일 · 화면 파일은 `.control-cli/` 에 떨어진다.

### 루프 — USB

```bash
npx control-cli open --usb --app ./qa.apk         # 내 컴퓨터 Appium(PLATFORM_APPIUM_URL, 없으면 127.0.0.1:4723)이 깔고 켠다
npx control-cli open --usb                        # 이미 켜 둔 게임에 붙는다 — Appium 세션이 없어 스크린샷은 게임(SDK)이 찍는다(.jpg)
npx control-cli open --usb --udid <serial> --port 13100
```

USB 는 `adb forward tcp:13100 tcp:13100` 을 걸고 TCP 로 보낸다. adb 는 `ANDROID_HOME` → `~/Library/Android/sdk` → PATH 순서로 찾는다.

### 루프 — PC (Windows · macOS 빌드)

```bash
npx control-cli open --pc --app ./Build/Game.app   # 띄우고 붙는다(.app 은 Contents/MacOS 안 실행 파일) — close 가 끈다
npx control-cli open --pc                          # 이미 켜 둔 게임에 붙는다
npx control-cli key I                              # Ran: await game.key('I')
```

PC 게임의 SDK 는 이 컴퓨터의 `127.0.0.1:13100` 에 열려 adb 없이 TCP 로 바로 붙는다. 스크린샷은 게임이 프레임 끝에서 찍고, 창 훑기의 뒤로 키는 `Escape` 다. QA 빌드는 창 초점이 없어도 돈다(SDK 가 `runInBackground` · Input System `IgnoreFocus` 를 켜고 uGUI 에 초점을 다시 알린다). 다만 화면은 켜져 있어야 한다 — macOS 는 디스플레이가 꺼지면 Metal 이 프레임을 못 내보내 게임이 멈추고 명령이 「멈췄거나 일시정지」로 실패한다. `PLATFORM_APP` 은 팜 · USB 의 APK 라 PC 는 `--app` 만 본다.

### 루프 — iOS (USB)

```bash
npx control-cli open --ios --app ./Build/Game.app  # 서명된 .app 을 devicectl 로 깔고 켠다 — close 가 끈다
npx control-cli open --ios                         # 이미 켜 둔 게임에 붙는다(USB iPhone 이 하나면 --udid 없이)
```

macOS 의 usbmuxd 로 폰의 `127.0.0.1:13100` 에 명령마다 바로 잇는다 — iproxy 같은 것을 깔거나 걸어 둘 것이 없다. 깔기 · 켜기 · 끄기는 Xcode 15+ 의 `devicectl`(iOS 17+ · 폰 개발자 모드)이고 bundle id 는 `.app` 의 `Info.plist` 에서 읽는다. 디바이스 팜은 iOS 를 아직 받지 않는다. 스크린샷은 게임이 찍고, iPhone 에는 뒤로 키가 없어 창 훑기는 닫기 버튼 · 저절로 사라지기로만 닫는다. 서명 · 프로비저닝은 Xcode 에서 직접 한다.

### 명령

| 명령 | 하는 일 | Ran 줄 |
|---|---|---|
| `click <ref\|주소>` | 가운데를 가짜 터치로 누른다. 월드 오브젝트는 주 카메라로 비춘 자리 | `game.click('LoginButton')` |
| `drag <ref\|주소> <ref\|주소>` | 앞 자리에서 뒤 자리로 10프레임에 걸쳐 끈다 | `game.drag('/Hud/Bag/Slot[0]', '/Hud/Bag/Slot[3]')` |
| `type <ref\|주소> <글자>` | InputField · TMP_InputField · UI Toolkit TextField 에 바로 넣는다(화면 키보드 없이). 글자 수 제한 · 거르기는 그 칸 규칙대로, 키로 칠 때의 차례(글자마다 거르고 거른 결과로 자름)다 — 글자 수 8 · 영숫자 칸에 `qa_user01!` 면 `qauser01`. uGUI · TMP 는 SDK 가 그 칸의 거르개를 글자마다 부른다. 비밀번호 칸이면 Ran 줄에 글자 대신 `'***'` | `game.type('IdInput', 'qa_user01')` |
| `text <ref\|주소>` | 글자 읽기 | `game.text('StatusText')` |
| `get <ref\|주소> <컴포넌트.칸>` | 속성 읽기 — 게임이 폰에서 셈하는 값. `material` · `materials` · `mesh` 는 읽기만 해도 사본을 만들어 거절한다(`shared…` 를 읽는다). UI Toolkit 요소는 컴포넌트가 없어 거절한다 | `game.get('Player', 'PlayerController.moveSpeed')` |
| `find <ref\|주소>` | 있으면 `{path, text, interactable}`, 없으면 `null` | `game.find('ShopPanel')` |
| `wait <ref\|주소> [--text 글자] [--gone] [--timeout 초]` | 뜰 때까지 · 글자가 들 때까지 · 사라질 때까지(기본 10초) | `game.waitFor('ShopPanel', { gone: true })` |
| `layout [ref\|주소]` | 누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치는지(팝업에 가린 것은 뺀다) | `game.layout('LoginView')` |
| `call <ref\|주소> <컴포넌트.메서드> [인자…]` | 컴포넌트 메서드를 부르고 돌려준 값을 찍는다. 인자는 글자로 보내고 SDK 가 메서드 칸 타입(숫자 · 참거짓 · 열거 이름 · `[x,y,z]` 벡터 · 색)으로 바꾼다 — 같은 이름 꼴이 여럿이면 인자 수가 맞고 다 바꿀 수 있는 첫 꼴 | `game.callMethod('Player', 'PlayerController.Jump', ['2'])` |
| `set <ref\|주소> <컴포넌트.칸> <값>` | 칸 쓰기 — 값은 `get` 이 주는 꼴. `Transform.position.y` 처럼 값 타입 칸도 바꾼 사본을 다시 써 넣는다. 다시 읽은 값을 찍는다 | `game.set('Player', 'PlayerController.moveSpeed', '9')` |
| `static-call <타입.메서드> [인자…]` · `static-get <타입.칸>` · `static-set <타입.칸> <값>` | static 메서드 · 칸 — 타입은 전체 이름(`UnityEngine.Time`) 또는 하나뿐인 짧은 이름 | `game.callStatic('Game.Cheats.AddGold', ['100'])` · `game.getStatic('UnityEngine.Time.timeScale')` |
| `pref-get <키>` · `pref-set <키> <값>` · `pref-delete <키>` · `pref-clear` | 저장 값(PlayerPrefs) — `--type string\|int\|float`(기본 string). 넣은 타입으로 읽는다. 쓰면 바로 디스크에 | `game.setPref('tutorial_done', '1', 'int')` · `game.pref('tutorial_done', 'int')` |
| `timescale-get` · `timescale-set <배율>` | 시간 배율 — 1 보통 · 0 멈춤 · 2 두 배(0~100) | `game.setTimeScale(0)` |
| `scenes` · `scene-load <장면> [--add]` · `scene-unload <장면>` · `scene-wait <장면> [--timeout 초]` | 지금 장면 · 열린 장면, 빌드에 넣은 장면 열기(`--add` 는 위에 더한다) · 닫기 — 다 열리고 닫힐 때까지 기다린다(기본 30초). `scene-wait` 는 게임이 스스로 장면을 바꿀 때 | `game.loadScene('Shop', { add: true })` · `game.waitForScene('Lobby')` |
| `errors [번호]` | 게임 예외 · 에러 로그(최근 200개). 답의 `last` 를 받아 두고 다음에 그 번호 뒤만 받는다 | 없음 |
| `key <키>` | 키 한 번(한 프레임 누르고 다음 프레임 뗀다). KeyCode 이름 — `Escape` · `Space` · `Return` · `I` · `Alpha1` · `F1`. 옛 Input `GetKey*(KeyCode)` · Input System 키보드가 본다. `Escape` 는 Unity 에서 폰 뒤로 키와 같다 | `game.key('Escape')` |
| `tap <x> <y>` | 좌표 누르기(왼쪽 아래가 0,0) — 살펴볼 때만. 케이스는 좌표를 쓰지 않는다 | 없음 |
| `ping` · `tree` | 게임 답 · 켜진 오브젝트 트리 JSON | 없음 |
| `conform` | 표준 화면(샘플)에 명령을 차례로 보내 기대값과 견준다 — `open` 바로 뒤에. 게임 SDK 의 `caps` 에 없는 명령 줄은 건너뛰고, 실패가 있으면 종료 코드 1 | 없음 |

**주소**는 오브젝트 이름(켜진 것 중 하나뿐일 때) 또는 `/` 로 시작하는 경로다. 같은 이름 형제는 경로 칸에 `[순번]`(0부터)을 붙인다 — `/HudCanvas/Inventory/Grid/Slot[2]`. 이름이 겹치면 고르지 않고 실패한다. UI Toolkit 요소는 UIDocument 오브젝트 아래 자식으로 이어진다(이름이 없으면 타입 이름) — `/UitkDocument/UitkPanel/UitkLoginButton`.
액션 뒤에는 트리가 두 번 같을 때까지(3초 상한) 기다렸다 화면을 찍는다. **기다리기**는 0.3초마다 짧은 `find` 를 되풀이한다 — 명령 하나가 팜 15초 · SDK 10초 한도에 안 걸린다.

### 창 훑기

```bash
npx control-cli crawl                                  # → .control-cli/crawl/list.json · 001.yml …
npx control-cli crawl --max 30 --minutes 5 --exclude '/설정|settings/i' --exclude 'GmButton' --out ./crawl
```

지금 화면의 버튼을 하나씩 눌러 새로 뜬 창(앞 화면에 없던 오브젝트 묶음)을 찍고 닫는다 — 창 안 닫기 버튼 → 저절로 사라지기(알림) → 뒤로 키(Appium 이 있으면 폰 뒤로 키, 없으면 `Escape` 키) 차례. 창 안 버튼은 한 단계 더 누른다(창 밖에 뜬 팝업만 다시 닫는다). 같은 이름 형제(목록 줄 · 슬롯)는 `[0]` 하나만, 같은 틀(순번을 뗀 경로)의 창은 한 번만 적는다.
안 누르는 것 — 이름이나 글자에 삭제 · 탈퇴 · 로그아웃 · 종료 · 나가기 · delete · remove · logout · quit · exit 가 든 버튼 · 닫기 버튼 · `--exclude`(`/정규식/깃발` 이나 든 글자). 되돌리지 못하면 그 자리에서 멈춘다. 상한은 창 60개 · 10분(`CRAWL` 상수).
로그인 · 캐릭터 고르기 · 순간이동은 하지 않는다 — 부르는 쪽이 그 화면에 맞춰 둔 뒤 다시 부른다.

| 파일 | 내용 |
|---|---|
| `NNN.yml` | `# <주소>` · `# 연 곳: <창> 의 <버튼> 「글자」` · 줄인 목록 |
| `list.json` | `[{주소, 이름, 틀, 파일, 지문, 글자지문, 연곳: {창, 버튼, 글자} \| null}]` — 첫 줄은 시작 화면 `scene:<장면>`. 지문은 순번을 뗀 구조, 글자지문은 글자 |
| `summary.json` | `{멈춘까닭, 창, 누름, 초}` |

### MCP — AI 앱에서

`control-cli mcp` 는 stdio MCP 서버다 — 따로 띄워 두는 프로그램이 아니라 AI 앱이 이 명령을 실행해 붙는다.

```bash
npm i -g github:maxihan1/control_cli#<태그>      # control-cli 를 PATH 에
claude mcp add control-cli -- control-cli mcp     # Claude Code
```

Claude Desktop — `claude_desktop_config.json`(macOS `~/Library/Application Support/Claude/` · Windows `%APPDATA%\Claude\`)의 `mcpServers` 에 한 줄. 팜을 안 쓰면 `env` 는 뺀다.

```json
"control-cli": { "command": "control-cli", "args": ["mcp"], "env": { "PLATFORM_APPIUM_URL": "http://<팜>:4723/wd/hub", "PLATFORM_APPIUM_TOKEN": "pat_…" } }
```

Desktop 은 셸의 PATH 를 안 볼 수 있다 — `control-cli` · `node` 를 못 찾으면 `"command": "<which node 의 경로>", "args": ["<npm root -g 의 경로>/control-cli/dist/main.js", "mcp"]` 로 쓴다.

| 도구 | 하는 일 |
|---|---|
| `hold` · `open` · `close` · `release` | 세션 — CLI 의 같은 명령. `open` 의 `via` 는 `farm`(기본 · `hold` 먼저) · `usb` · `pc` · `ios` |
| `ping` · `tree` · `find` · `click` · `drag` · `type` · `get` · `tap` · `key` · `screenshot` · `errors` · `layout` · `call` · `set` · `static-call` · `static-get` · `static-set` · `pref-get` · `pref-set` · `pref-delete` · `pref-clear` · `timescale-get` · `timescale-set` · `scenes` · `scene-load` · `scene-unload` | `protocol/commands.json` 의 명령 그대로 — 인자는 그 칸, 답은 SDK 답 JSON(`ok` 뺌). `screenshot` 은 그림으로 준다. `scene-load` 는 열기 시작만 하니 `scenes` 로 다 열렸는지 본다 |

- 명령을 `protocol/commands.json` 에 더하면 도구도 따라 는다(`src/mcp.test.ts` 가 잡는다)
- 세션 파일은 `~/.control-cli/` — Claude Desktop 은 MCP 서버를 쓸 수 없는 `/` 에서 띄운다. 셸 CLI 의 `./.control-cli/` 와 따로다. `-s <세션>` · `--port` · `--url` · `--token` 은 `control-cli … mcp` 로 띄울 때 준다
- 셸 CLI 의 `snapshot` ref · `Ran:` 줄 · `wait` · `text` 는 MCP 에 없다 — `tree` · `find` 로 본다

### 연결

| 값 | 옵션 | 환경값 |
|---|---|---|
| Appium · 팜 입구 | `--url` | `PLATFORM_APPIUM_URL` (없으면 `http://127.0.0.1:4723`) — 잡기 · 게임 명령 주소는 여기서 `/wd/hub` 를 뗀 곳 |
| 팜 토큰 (Bearer) | `--token` | `PLATFORM_APPIUM_TOKEN` |
| 게임 APK | `--app` | `PLATFORM_APP` |
| 폰 | `--udid` | `PLATFORM_DEVICE_UDID` |
| USB · PC · iOS 게임 포트 | `--port` | — (기본 13100) |
| PC 게임 실행 파일 · iOS 서명된 .app | `--app` (`--pc` · `--ios` 와 같이) | — |
| iPhone | `--udid` (`--ios` 와 같이 — 없으면 USB 로 꽂힌 하나) | `USBMUXD_SOCKET_ADDRESS` (usbmuxd 자리 — 테스트용, 없으면 `/var/run/usbmuxd`) |

## SDK 명령 (통신 꼴 정본)

명령은 JSON 객체 한 줄, 답도 JSON 객체 한 줄이다. 디바이스 팜 게임 명령 주소는 본문을 그대로 한 줄로 넘기고 답을 `{"value": …}` 로 싼다(Devicefarm ADR-048).
실패는 `{"ok":false,"error":"…"}`. 명령은 게임 프레임에서 받은 차례대로 돈다. 10초 안에 게임이 못 받으면 실패로 답하고 그 명령은 버린다.

| `cmd` | 칸 | 답 |
|---|---|---|
| `ping` | | `{ok, app, version, engine, engineVersion, sdkVersion, protocol, caps}` — `engine` 부터는 protocol 2(SDK 0.3.0)부터. CLI 는 `open` 때 받은 `caps` 밖 명령을 보내지 않고 거절한다. 명령 정의는 `protocol/commands.json` |
| `tree` | | `{ok, scene, screen:[w,h], tree:[{name, text?, kind?, interactable?, children?}]}` — 켜진 오브젝트만. `kind` 는 Selectable 종류(Button · Toggle · InputField · TMP_InputField …) 또는 UI Toolkit 컨트롤(Button · Toggle · RadioButton · TextField · DropdownField · Slider). `text` 는 Text · InputField · TextMeshPro(TMP_Text · TMP_InputField) · UI Toolkit(TextElement · TextField). UI Toolkit 은 숨은 요소(display none · 안 보임)를 빼고 컨트롤 속은 내보내지 않는다. 비밀번호 칸 글자는 `***` |
| `find` | `target` | `{ok, found:false}` 또는 `{ok, found:true, path, text?, interactable?}` — 이름이 겹치면 실패 |
| `click` | `target` | `{ok, x, y}` — 가짜 터치가 다 나가고 게임이 처리한 뒤 답한다 |
| `drag` | `target` · `to` | `{ok, x, y}` — 위와 같다 |
| `type` | `target` · `text` | `{ok, text}` — 넣은 뒤 칸 글자. 잠긴 칸은 실패 |
| `get` | `target` · `prop`(`컴포넌트.칸[.칸…]`) | `{ok, value}` — 숫자 · 글자 · 참거짓 · 열거(이름) · 벡터 · 색은 배열, 그 밖은 글자 |
| `tap` | `x` · `y` | `{ok, x, y}` |
| `key` | `key`(KeyCode 이름, 대소문자 무시) | `{ok, key}` — 누르고 뗀 것을 게임이 처리한 뒤 답한다. 모르는 이름은 실패 |
| `screenshot` | | `{ok, jpg}` — 프레임 끝에서 찍은 화면(JPEG base64). 수 MB 라 팜은 Appium 스크린샷을 쓴다. ImageConversion 모듈을 뺀 게임은 실패 |
| `errors` | `since` | `{ok, last, errors:[{seq, time, type, message, stack}], dropped?, restarted?}` |
| `layout` | `target`? | `{ok, screen, safeArea, checked, problems:[{kind:'outside'\|'overlap', name, path, rect?, other?, otherPath?}]}` |
| `call` | `target` · `method`(`컴포넌트.메서드`) · `args`?(글자 배열) | `{ok, value}` — void 는 `null`. 맞는 꼴이 없으면 있는 꼴을 실패 글에. 게임이 던지면 그 까닭 |
| `set` | `target` · `prop` · `value`(글자) | `{ok, value}` — 다시 읽은 값. 읽기 전용 칸 · 바꿀 수 없는 타입은 실패 |
| `static-call` | `method`(`타입.메서드`) · `args`? | `call` 과 같다 — SDK 0.4.0 부터 |
| `static-get` · `static-set` | `prop`(`타입.칸[.칸…]`) · `value`(set) | `{ok, value}` — 타입 이름이 겹치면 실패 |
| `pref-get` | `key` · `type`?(`string` · `int` · `float`) | `{ok, found:false}` 또는 `{ok, found:true, value}` |
| `pref-set` · `pref-delete` · `pref-clear` | `key` · `value` · `type`? / `key` / | `{ok}` — 쓴 뒤 `PlayerPrefs.Save()` |
| `timescale-get` · `timescale-set` | / `scale`(0~100) | `{ok, timeScale}` |
| `scenes` | | `{ok, active, loaded:[이름], loads, unloads}` — 다 열린 장면만. `loads` · `unloads` 는 게임이 켜진 뒤 열리고 닫힌 수 |
| `scene-load` | `name`(이름 · 경로) · `mode`?(`single` · `add`) | `{ok, loads}` — 열기 전 수를 주고 바로 답한다. `scenes` 의 `loads` 가 이보다 커지면 다 열렸다. 빌드에 없는 장면은 실패 |
| `scene-unload` | `name` | `{ok, unloads}` — 위와 같다. 마지막 장면은 실패 |

## 개발

```bash
npm test                                            # CLI 테스트 — 가짜 게임 · 가짜 팜 · 가짜 PC 게임 · 가짜 usbmuxd
python3 tools/unity-compile-check/check.py fetch    # Unity 판마다 관리 DLL · 내장 패키지 · TMP · Input System 받기(판마다 수 GB 를 받아 일부만 푼다)
python3 tools/unity-compile-check/check.py 6000.0   # SDK · 샘플을 입력 설정 셋(옛 Input · 둘 다 · Input System)으로 컴파일 — Docker 필요
```

컴파일 검사는 Unity 라이선스 없이 PR 마다 돈다(`.github/workflows/sdk-compile.yml`). 로그의 `== <판> · <입력>` 줄에 SDK 에 켜진 정의(`CONTROL_CLI_TMP` · `CONTROL_CLI_INPUTSYSTEM` …)가 찍힌다.
`sdk/unity/` 에 파일을 더하면 `.meta` 도 같이 넣는다 — git 으로 받은 UPM 패키지는 Unity 가 `.meta` 를 못 만든다(`src/sdk-meta.test.ts` 가 잡는다).
명령을 더하거나 바꾸면 `protocol/commands.json` 과 Unity SDK 의 `Caps`(`sdk/unity/Runtime/ControlServer.cs`)를 같이 고친다 — `src/protocol.test.ts` 가 잡는다.

## License

MIT
