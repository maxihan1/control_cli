# control_cli

Unity 게임을 자동화 테스트로 조작하는 SDK 와 CLI.

- **SDK** (Unity UPM 패키지) — QA 빌드에서만 폰 안 `127.0.0.1` 에 포트를 열고, 오브젝트 트리 읽기 · 찾기 · 누르기 · 끌기 · 글자 넣기 · 속성 읽기를 받는다. 터치는 빌드 때 이름이 같은 가짜 `Input` 으로 바꿔치기한다
- **CLI** — appium-cli 꼴. snapshot(줄인 트리 + 스크린샷) → ref → 액션, 액션마다 케이스에 붙일 코드 한 줄(`Ran:`)을 찍는다. 폰은 디바이스 팜 게임 명령 주소 또는 USB `adb forward` 로 잇는다
- **라이브러리** — CLI 와 같은 드라이버(`Game`)와 두 길(`farmLink` · `usbLink`). test_platform kit 이 CLI 를 띄우지 않고 쓴다

0단계 실측 결과는 [docs/step0.md](docs/step0.md).

## 게임에 넣기 (QA 빌드만)

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

가짜 `Input` 은 `UnityEngine.Input` 의 멤버를 다 감싼다(펜 · `mousePositionDelta` 는 빠짐). 터치만 가짜를 섞고 나머지는 그대로 넘긴다. `touchSupported` 는 늘 `true` 다.
알려진 한계 — `Assets/Plugins` 의 스크립트(Assembly-CSharp-firstpass)도 가짜 `Input` 을 보게 되어, 빠진 멤버를 쓰면 QA 빌드에서만 컴파일이 깨진다. 그런 게임이 오면 그 멤버를 더한다.

## CLI

```bash
npm i -D github:maxihan1/control_cli#v0.1.1
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
npx control-cli open --usb                        # 이미 켜 둔 게임에 붙는다 — Appium 세션이 없어 스크린샷이 없다
npx control-cli open --usb --udid <serial> --port 13100
```

USB 는 `adb forward tcp:13100 tcp:13100` 을 걸고 TCP 로 보낸다. adb 는 `ANDROID_HOME` → `~/Library/Android/sdk` → PATH 순서로 찾는다.

### 명령

| 명령 | 하는 일 | Ran 줄 |
|---|---|---|
| `click <ref\|주소>` | 가운데를 가짜 터치로 누른다. 월드 오브젝트는 주 카메라로 비춘 자리 | `game.click('LoginButton')` |
| `drag <ref\|주소> <ref\|주소>` | 앞 자리에서 뒤 자리로 10프레임에 걸쳐 끈다 | `game.drag('/Hud/Bag/Slot[0]', '/Hud/Bag/Slot[3]')` |
| `type <ref\|주소> <글자>` | InputField 에 바로 넣는다(화면 키보드 없이). 글자 수 제한 · 거르기는 InputField 가 한다. 비밀번호 칸이면 Ran 줄에 글자 대신 `'***'` | `game.type('IdInput', 'qa_user01')` |
| `text <ref\|주소>` | 글자 읽기 | `game.text('StatusText')` |
| `get <ref\|주소> <컴포넌트.칸>` | 속성 읽기 — 게임이 폰에서 셈하는 값. `material` · `materials` · `mesh` 는 읽기만 해도 사본을 만들어 거절한다(`shared…` 를 읽는다) | `game.get('Player', 'PlayerController.moveSpeed')` |
| `find <ref\|주소>` | 있으면 `{path, text, interactable}`, 없으면 `null` | `game.find('ShopPanel')` |
| `wait <ref\|주소> [--text 글자] [--gone] [--timeout 초]` | 뜰 때까지 · 글자가 들 때까지 · 사라질 때까지(기본 10초) | `game.waitFor('ShopPanel', { gone: true })` |
| `layout [ref\|주소]` | 누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치는지(팝업에 가린 것은 뺀다) | `game.layout('LoginView')` |
| `errors [번호]` | 게임 예외 · 에러 로그(최근 200개). 답의 `last` 를 받아 두고 다음에 그 번호 뒤만 받는다 | 없음 |
| `tap <x> <y>` | 좌표 누르기(왼쪽 아래가 0,0) — 살펴볼 때만. 케이스는 좌표를 쓰지 않는다 | 없음 |
| `ping` · `tree` | 게임 답 · 켜진 오브젝트 트리 JSON | 없음 |

**주소**는 오브젝트 이름(켜진 것 중 하나뿐일 때) 또는 `/` 로 시작하는 경로다. 같은 이름 형제는 경로 칸에 `[순번]`(0부터)을 붙인다 — `/HudCanvas/Inventory/Grid/Slot[2]`. 이름이 겹치면 고르지 않고 실패한다.
액션 뒤에는 트리가 두 번 같을 때까지(3초 상한) 기다렸다 화면을 찍는다. **기다리기**는 0.3초마다 짧은 `find` 를 되풀이한다 — 명령 하나가 팜 15초 · SDK 10초 한도에 안 걸린다.

### 창 훑기

```bash
npx control-cli crawl                                  # → .control-cli/crawl/list.json · 001.yml …
npx control-cli crawl --max 30 --minutes 5 --exclude '/설정|settings/i' --exclude 'GmButton' --out ./crawl
```

지금 화면의 버튼을 하나씩 눌러 새로 뜬 창(앞 화면에 없던 오브젝트 묶음)을 찍고 닫는다 — 창 안 닫기 버튼 → 저절로 사라지기(알림) → 폰 뒤로 키 차례. 창 안 버튼은 한 단계 더 누른다(창 밖에 뜬 팝업만 다시 닫는다). 같은 이름 형제(목록 줄 · 슬롯)는 `[0]` 하나만, 같은 틀(순번을 뗀 경로)의 창은 한 번만 적는다.
안 누르는 것 — 이름이나 글자에 삭제 · 탈퇴 · 로그아웃 · 종료 · 나가기 · delete · remove · logout · quit · exit 가 든 버튼 · 닫기 버튼 · `--exclude`(`/정규식/깃발` 이나 든 글자). 되돌리지 못하면 그 자리에서 멈춘다. 상한은 창 60개 · 10분(`CRAWL` 상수).
로그인 · 캐릭터 고르기 · 순간이동은 하지 않는다 — 부르는 쪽이 그 화면에 맞춰 둔 뒤 다시 부른다.

| 파일 | 내용 |
|---|---|
| `NNN.yml` | `# <주소>` · `# 연 곳: <창> 의 <버튼> 「글자」` · 줄인 목록 |
| `list.json` | `[{주소, 이름, 틀, 파일, 지문, 글자지문, 연곳: {창, 버튼, 글자} \| null}]` — 첫 줄은 시작 화면 `scene:<장면>`. 지문은 순번을 뗀 구조, 글자지문은 글자 |
| `summary.json` | `{멈춘까닭, 창, 누름, 초}` |

### 연결

| 값 | 옵션 | 환경값 |
|---|---|---|
| Appium · 팜 입구 | `--url` | `PLATFORM_APPIUM_URL` (없으면 `http://127.0.0.1:4723`) — 잡기 · 게임 명령 주소는 여기서 `/wd/hub` 를 뗀 곳 |
| 팜 토큰 (Bearer) | `--token` | `PLATFORM_APPIUM_TOKEN` |
| 게임 APK | `--app` | `PLATFORM_APP` |
| 폰 | `--udid` | `PLATFORM_DEVICE_UDID` |
| USB 게임 포트 | `--port` | — (기본 13100) |

## SDK 명령 (통신 꼴 정본)

명령은 JSON 객체 한 줄, 답도 JSON 객체 한 줄이다. 디바이스 팜 게임 명령 주소는 본문을 그대로 한 줄로 넘기고 답을 `{"value": …}` 로 싼다(Devicefarm ADR-048).
실패는 `{"ok":false,"error":"…"}`. 명령은 게임 프레임에서 받은 차례대로 돈다. 10초 안에 게임이 못 받으면 실패로 답하고 그 명령은 버린다.

| `cmd` | 칸 | 답 |
|---|---|---|
| `ping` | | `{ok, app, version}` |
| `tree` | | `{ok, scene, screen:[w,h], tree:[{name, text?, kind?, interactable?, children?}]}` — 켜진 오브젝트만. `kind` 는 Selectable 종류(Button · Toggle · InputField …). 비밀번호 칸 글자는 `***` |
| `find` | `target` | `{ok, found:false}` 또는 `{ok, found:true, path, text?, interactable?}` — 이름이 겹치면 실패 |
| `click` | `target` | `{ok, x, y}` — 가짜 터치가 다 나가고 게임이 처리한 뒤 답한다 |
| `drag` | `target` · `to` | `{ok, x, y}` — 위와 같다 |
| `type` | `target` · `text` | `{ok, text}` — 넣은 뒤 칸 글자. 잠긴 칸은 실패 |
| `get` | `target` · `prop`(`컴포넌트.칸[.칸…]`) | `{ok, value}` — 숫자 · 글자 · 참거짓 · 열거(이름) · 벡터 · 색은 배열, 그 밖은 글자 |
| `tap` | `x` · `y` | `{ok, x, y}` |
| `errors` | `since` | `{ok, last, errors:[{seq, time, type, message, stack}], dropped?, restarted?}` |
| `layout` | `target`? | `{ok, screen, safeArea, checked, problems:[{kind:'outside'\|'overlap', name, path, rect?, other?, otherPath?}]}` |

## License

MIT
