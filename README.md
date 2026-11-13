# control_cli

Unity · Godot 게임을 자동화 테스트로 조작하는 SDK 와 CLI.

- **Godot SDK** (GDScript 애드온 · `sdk/godot`) — 같은 통신 꼴 · 같은 명령. 아래 「Godot 에 넣기」
- **SDK** (Unity UPM 패키지) — QA 빌드에서만 게임 안 `127.0.0.1` 에 포트를 열고, 오브젝트 트리 읽기 · 찾기 · 누르기 · 끌기 · 글자 넣기 · 키 · 속성 읽기 · 스크린샷을 받는다. 터치는 빌드 때 이름이 같은 가짜 `Input` 으로 바꿔치기하고, 새 Input System 게임에는 장치 이벤트로 넣는다
- **CLI** — appium-cli 꼴. snapshot(줄인 트리 + 스크린샷) → ref → 액션, 액션마다 케이스에 붙일 코드 한 줄(`Ran:`)을 찍는다. 디바이스 팜 게임 명령 주소 · USB `adb forward` · PC(TCP) · USB iPhone(usbmuxd) 로 잇고, 길이 없는 게임은 게임이 relay 로 WebSocket 을 건다
- **MCP** — `control-cli mcp`. AI 앱(Claude Desktop · Claude Code)이 띄우는 stdio MCP 서버로, 같은 명령을 도구로 내준다 — 셸 없는 AI 앱도 게임을 조작한다
- **드라이버(다른 언어)** — Python · C# · Java · Robot Framework. `protocol/commands.json` 에서 명령마다 메서드를 만든 파일 하나씩(`drivers/`) — 아래 「드라이버」
- **라이브러리** — CLI 와 같은 드라이버(`Game`)와 연결 길(`farmLink` · `relayLink` · `usbLink` · `tcpLink` · `iosLink`). test_platform kit 이 CLI 를 띄우지 않고 쓴다

0단계 실측 결과는 [docs/step0.md](docs/step0.md). Unity 지원 넓히기의 결정 기록은 [docs/unity/](docs/unity/context-notes.md).

## 지원

| 무엇 | 받는 것 | 실기기로 확인 | 컴파일만 확인 |
|---|---|---|---|
| Unity 판 | 2021.3 · 2022.3 · 6000.0 | 6000.0 (Ashveil) | 2021.3 · 2022.3 |
| UI | uGUI · TextMeshPro · UI Toolkit(UIDocument) | uGUI | TMP · UI Toolkit (`layout` 은 uGUI 만) |
| 입력 | 옛 Input · 새 Input System · 둘 다 | 옛 Input | Input System(Touchscreen · Mouse · Keyboard) |
| 플랫폼 | Android(팜 · USB) · PC(Windows · macOS · Linux) · iOS(USB, 17+) · WebGL(브라우저 → relay) | Android · macOS · Linux(Docker) · WebGL(Chrome) | Windows · iOS (CLI 는 가짜 게임 · 가짜 usbmuxd 로 테스트) |
| 드라이버 | Python · C# · Java · Robot Framework (TCP · relay) | Python · Java · C# · Robot (Unity · Godot macOS 앱) | — |
| Godot | 4.5 이상 · Control UI · 3D 물리 · PC · Android · 웹(relay) | 4.5.2 · 4.7.2 Linux(CI xvfb) · 4.7.2 macOS 앱 · Android(USB) · 웹(Chrome) — conform 47/0/6 | iOS(빌드 안 함) |
| 인스펙터 · Recorder | `control-cli inspect`(로컬 웹 화면) · 기록 → TS · Python · C# · Java · Robot | Unity 6000.0 · Godot 4.7.2 macOS 앱(기록 → `replay` · 다섯 언어 초록) · Chrome | — |

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

1. `Packages/manifest.json` 에 SDK 패키지를 `--ref` 로 고정해 더한다(없으면 이 CLI 판 tag — 0.9.0 이면 `v0.9.0`. SDK 경로 `?path=/sdk/unity` 와 SDK 판이 CLI 와 늘 맞는다)
2. `Assets/` · `Packages/`(내장 패키지) 아래 asmdef 의 `references` 에 `ControlCli.Input` 을 더한다 — 에디터 전용 · `noEngineReferences` 는 건너뛴다. asmdef 없는 스크립트(Assembly-CSharp)는 자동으로 참조한다
3. `namespace` 안에 `using UnityEngine;` 을 둔 파일 · `namespace UnityEngine.*` 안의 파일은 `UnityEngine.Input` 이 먼저 잡혀 가짜 터치를 못 본다 — 경고로 알려 준다
4. 깨진 asmdef 가 있으면 파일 이름을 알리고 아무것도 바꾸지 않는다
5. `--relay <주소>` 를 주면 `Assets/ControlCli/Resources/ControlCliRelay.txt` 에 주소 한 줄을 넣는다 — 게임이 켜질 때 그 relay 로 건다(아래 「루프 — relay」). 안 주면 그 파일을 지운다(relay 꺼짐)

그리고 **QA 빌드 스크립트가 정의 심볼 `CONTROL_CLI` 를 더한다** — 없으면 SDK 코드가 빌드에 아예 안 들어간다. Release 빌드는 손대지 않으면 된다.

가짜 `Input` 은 `UnityEngine.Input` 의 멤버를 다 감싼다(펜 · `mousePositionDelta` · `location` 은 빠짐 — `location` 은 적기만 해도 Android 에 위치 권한이 붙고 iOS 빌드가 위치 사용 문구를 요구해서다. 쓰는 게임은 `UnityEngine.Input.location` 으로 적는다). 터치만 가짜를 섞고(진짜 폰처럼 `simulateMouseWithTouches` 가 켜져 있으면 마우스 왼쪽 단추에도 비춘다) 나머지는 그대로 넘긴다. 새 Input System 을 쓰는 게임에는 같은 터치를 `Touchscreen` 장치 이벤트로 넣는다 — `InputSystemUIInputModule` · EnhancedTouch · `Touchscreen.current` 가 같이 본다. UI Toolkit 화면은 EventSystem 이 있으면 그 입력 모듈로 같은 터치가 닿고, 없으면(옛 Input) UI Toolkit 이 `UnityEngine.Input` 을 바로 읽어 SDK 가 panel 에 Pointer 이벤트를 보낸다. `touchSupported` 는 늘 `true` 다.
알려진 한계 — `Assets/Plugins` 의 스크립트(Assembly-CSharp-firstpass)도 가짜 `Input` 을 보게 되어, 빠진 멤버를 쓰면 QA 빌드에서만 컴파일이 깨진다. 그런 게임이 오면 그 멤버를 더한다.

## Godot 에 넣기 (QA 빌드만)

Godot 4.5 이상 — 게임 로그를 받는 `Logger`(`OS.add_logger`)가 4.5 부터다. CI 가 4.5.2 · 4.7.2 로 표준 화면(`sample-godot/`) conform 을 돌린다(`.github/workflows/godot.yml`).

```bash
node /tmp/control_cli/dist/main.js instrument <Godot 프로젝트 폴더> [--relay <주소>]
```

1. `project.godot` 가 있으면 Godot 로 본다 — 이 CLI 에 실린 애드온(`sdk/godot/addons/control_cli`)을 `addons/control_cli` 에 새로 넣는다. CLI 판 = SDK 판이라 `--ref` 는 받지 않는다(다른 판은 그 판의 CLI 로)
2. `[autoload]` 에 `ControlCli="*res://addons/control_cli/control_cli.gd"` 한 줄 — 켜지자마자 `127.0.0.1:13100` 을 연다(웹은 relay 만)
3. `--relay <주소>` 를 주면 `[control_cli] relay="<주소>"` — 게임이 그 relay 로 건다. 웹은 페이지 주소 `?controlcli=ws://<relay>:13101` 이 먼저다(Unity WebGL 과 같음). 안 주면 지운다

Release 빌드에서는 instrument 를 안 돌리면 된다. 에디터에서 손으로 넣을 때는 같은 폴더를 `addons/` 에 두고 「프로젝트 설정 → 플러그인」에서 control_cli 를 켠다(autoload 를 더한다).

Unity 와 낱말이 다른 곳 — 주소는 노드 경로(Godot 는 같은 이름 형제가 없어 `[순번]` 이 거의 안 붙는다), 「꺼짐」은 `visible` 이 꺼진 노드, `@tag` 는 group, `@layer` 는 이름 붙인 렌더 · 물리 layer, `@component` 는 노드 클래스 줄기와 스크립트 `class_name`. 칸 주소는 `[클래스.]칸[.칸…]` — `Label.text` · `Node3D.position.y` · `TouchProbe.Say`(앞 낱말이 노드 클래스 · 스크립트 이름이면 뗀다). static 은 autoload · 엔진 싱글턴 · `class_name` 스크립트(`Engine.time_scale` · `TouchProbe.Add`). 저장 값은 `ConfigFile` — 프로젝트 설정 `control_cli/prefs_file`(기본 `user://prefs.cfg`), 키는 `구역/키`(구역이 없으면 `prefs`). 장면 이름은 `.tscn` 파일 이름.
입력 — 손가락은 `InputEventScreenTouch` · `ScreenDrag`, 단추 · Control 은 Godot 의 「터치로 마우스 흉내」(`input_devices/pointing/emulate_mouse_from_touch`, 기본 켬)로 눌린다 — 끈 게임은 click 이 Control 에 안 닿는다. 키는 Unity KeyCode 이름(`LeftShift` · `Alpha1` · `JoystickButton0` …)과 Godot 키 이름을 다 받는다. 기울기 단위는 g(Godot `get_accelerometer` 는 m/s²로 받는다). `type` 은 입력칸에 초점을 주고 글자마다 키 이벤트를 넣어 `max_length` · `text_changed` 거르기가 사람이 칠 때 차례로 돈다.

## CLI

```bash
npm i -D github:maxihan1/control_cli#v0.8.0
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

### 루프 — PC (Windows · macOS · Linux 빌드)

```bash
npx control-cli open --pc --app ./Build/Game.app   # 띄우고 붙는다(.app 은 Contents/MacOS 안 실행 파일) — close 가 끈다
npx control-cli open --pc                          # 이미 켜 둔 게임에 붙는다
npx control-cli key I                              # Ran: await game.key('I')
```

PC 게임의 SDK 는 이 컴퓨터의 `127.0.0.1:13100` 에 열려 adb 없이 TCP 로 바로 붙는다. 스크린샷은 게임이 프레임 끝에서 찍고, 창 훑기의 뒤로 키는 `Escape` 다. QA 빌드는 창 초점이 없어도 돈다(SDK 가 `runInBackground` · Input System `IgnoreFocus` 를 켜고 uGUI 에 초점을 다시 알린다). 다만 화면은 켜져 있어야 한다 — macOS 는 디스플레이가 꺼지면 Metal 이 프레임을 못 내보내 게임이 멈추고 명령이 「멈췄거나 일시정지」로 실패한다. `PLATFORM_APP` 은 팜 · USB 의 APK 라 PC 는 `--app` 만 본다.

**Linux** — PC 와 같은 길이다(`open --pc --app ./Build/Game.x86_64`). 리눅스 기계가 없으면 Docker 의 `linux/amd64` 컨테이너(Xvfb · Mesa)에서 게임과 CLI 를 함께 돌린다 — SDK 가 컨테이너의 `127.0.0.1` 에만 열어 `docker -p` 로는 못 닿기 때문이다. Apple Silicon 맥의 Docker(Rosetta 흉내)에서는 **IL2CPP 빌드만** 뜬다 — Mono JIT 는 `x86-codegen.h … offset == (gint32)offset` 으로 죽는다.

```dockerfile
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends xvfb libgl1 libgl1-mesa-dri libglu1-mesa \
    libvulkan1 mesa-vulkan-drivers libxcursor1 libxrandr2 libxinerama1 libxi6 libgtk-3-0 libasound2 && rm -rf /var/lib/apt/lists/*
```

```bash
docker build --platform linux/amd64 -t control-cli-linux .
docker run --rm --platform linux/amd64 -v "$PWD:/cli:ro" -v <Linux 빌드 폴더>:/game control-cli-linux bash -c '
  Xvfb :99 -screen 0 1280x1400x24 & export DISPLAY=:99; sleep 2; mkdir -p /work && cd /work
  node /cli/dist/main.js open --pc --app /game/<이름>.x86_64 && node /cli/dist/main.js conform; node /cli/dist/main.js close'
```

### 루프 — iOS (USB)

```bash
npx control-cli open --ios --app ./Build/Game.app  # 서명된 .app 을 devicectl 로 깔고 켠다 — close 가 끈다
npx control-cli open --ios                         # 이미 켜 둔 게임에 붙는다(USB iPhone 이 하나면 --udid 없이)
```

macOS 의 usbmuxd 로 폰의 `127.0.0.1:13100` 에 명령마다 바로 잇는다 — iproxy 같은 것을 깔거나 걸어 둘 것이 없다. 깔기 · 켜기 · 끄기는 Xcode 15+ 의 `devicectl`(iOS 17+ · 폰 개발자 모드)이고 bundle id 는 `.app` 의 `Info.plist` 에서 읽는다. 디바이스 팜은 iOS 를 아직 받지 않는다. 스크린샷은 게임이 찍고, iPhone 에는 뒤로 키가 없어 창 훑기는 닫기 버튼 · 저절로 사라지기로만 닫는다. 서명 · 프로비저닝은 Xcode 에서 직접 한다.

### 루프 — relay (게임이 거는 길)

USB · 팜 · 같은 컴퓨터 길이 없는 게임(같은 Wi-Fi 의 폰 · 다른 네트워크의 폰 · 케이블 없는 iPhone)은 방향을 뒤집는다 — 게임이 `control-cli relay` 에 WebSocket 을 **걸고**, CLI 는 relay 에 명령을 보낸다. AltTester Server(로컬 · 원격 중계)와 같은 몫이다.

```bash
# 이 맥 · 같은 Wi-Fi
npx control-cli instrument sample --relay ws://<이 맥 Wi-Fi 주소>:13101   # QA 빌드에 relay 주소를 굽는다
npx control-cli open --relay                    # 이 컴퓨터 relay(13101)가 없으면 띄우고, 게임이 붙기를 60초까지 기다린다
npx control-cli hold --udid <serial> && npx control-cli open --relay --app qa.apk   # 깔고 켜기는 팜, 명령은 relay
npx control-cli open --relay --game SM-A325N    # 게임이 여럿이면 key · 앱 · 기종 일부로 고른다
npx control-cli relay status                    # 붙은 게임 — 앱 · 플랫폼 · 기종 · 붙은 지 · 마지막 신호

# 밖 공개 — relay 를 토큰으로 늘 켜 두고 터널(relay.<도메인> → 이 맥 13101)을 연다
npx control-cli instrument game --relay wss://relay.<도메인>
npx control-cli open --relay wss://relay.<도메인>
```

- 게임은 켜질 때 구운 주소의 `/game` 에 걸고 hello 한 줄(ping 답 + 플랫폼 · 기종 · 기기 이름 · 기기 id)을 보낸다. 못 붙거나 끊기면 2초마다 다시 건다. 게임 key 는 `<앱>@<기기 id 앞 8자>` 라 게임을 다시 켜도 같은 세션으로 간다
- `open --relay` 가 띄운 relay 는 백그라운드로 돌고(기록 `.control-cli/relay.log`) `close` 가 끄지 않는다 — 다음 `open` · 다른 세션이 쓴다. 이 컴퓨터 주소(`127.0.0.1` · `localhost`)만 띄우고, 밖 주소에 relay 가 없으면 실패한다
- 권한 — 토큰 없이 띄운 relay 는 이 컴퓨터에서 온 명령만 받는다. `relay --token <비밀값>`(또는 `CONTROL_CLI_RELAY_TOKEN` · Keychain `control-cli-relay`)으로 띄우면 모든 명령에 `Authorization: Bearer` 를 본다 — 터널은 요청을 `127.0.0.1` 에서 온 것처럼 넘기므로 밖 공개는 늘 토큰이다. 게임 입구(`/game`)는 토큰을 받지 않는다(APK 를 풀면 구운 값이 다 보인다)
- 시간 초과 — 게임 10초 → relay 15초 → CLI 20초. 명령 중 게임이 끊기면 「명령이 실행됐을 수도 있습니다」로 실패한다
- iOS 는 같은 Wi-Fi 의 relay 로 걸면 「로컬 네트워크」 허락을 묻는다 — relay 주소를 구운 iOS 빌드는 SDK 빌드 훅이 `Info.plist` 에 `NSLocalNetworkUsageDescription` 을 넣는다
- relay 는 SDK 0.9.0 부터, Unity WebGL 은 0.10.0 부터

**WebGL** — 브라우저는 포트를 못 열어 WebGL 게임은 relay 길만 있다. 주소는 페이지 주소 `?controlcli=<주소>` 가 먼저이고, 없으면 `instrument --relay` 로 구운 주소다(둘 다 없으면 relay 꺼짐). https 페이지는 브라우저가 `ws://` 를 막아 `wss://` 를 쓴다. 기기 id 는 탭마다 하나(새로 고침에도 같다)라 탭 둘을 열면 게임 둘로 보인다. WebGL 은 `Application.identifier` 가 비어 앱 이름 자리에 제품 이름(`productName`)이 온다.

탭이 뒤로 가거나 창이 가려지거나 화면이 잠기면 Chrome 이 게임을 **초당 1프레임**으로 늦춘다 — 1초 끌기가 수십 초 걸려 명령이 10초에 실패한다. 자동으로 돌릴 때는 늦추기를 끈 Chrome 을 따로 띄운다(사용자 프로필과 따로).

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir=/tmp/control-cli-chrome --no-first-run \
  --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding \
  'http://127.0.0.1:8000/?controlcli=ws://127.0.0.1:13101'
```

```bash
cd <WebGL 빌드 폴더> && python3 -m http.server 8000 &          # 압축을 끈 빌드는 아무 정적 서버로 열린다
open 'http://127.0.0.1:8000/?controlcli=ws://127.0.0.1:13101'
npx control-cli open --relay                                       # 세션 … (relay · WebGL · …)
```

이 맥에 relay 를 늘 켜 두기(밖 공개) — `~/Library/LaunchAgents/com.control-cli.relay.plist` 를 두고 `launchctl load` 한다. 토큰은 Keychain `control-cli-relay` 에 한 번 넣는다(`security add-generic-password -U -a <맥 사용자> -s control-cli-relay -w "$(pbpaste)"`).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.control-cli.relay</string>
  <key>ProgramArguments</key><array>
    <string><which node 의 경로></string><string><npm root -g 의 경로>/control-cli/dist/main.js</string><string>relay</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/control-cli-relay.log</string>
  <key>StandardErrorPath</key><string>/tmp/control-cli-relay.log</string>
</dict></plist>
```

### 명령

| 명령 | 하는 일 | Ran 줄 |
|---|---|---|
| `click <ref\|주소> [--count <n>] [--interval <초>]` | 가운데를 가짜 터치로 누른다. 월드 오브젝트는 주 카메라로 비춘 자리. `--count 2` 면 `--interval`(기본 0.1초) 간격으로 두 번(SDK 0.6.0) | `game.click('LoginButton')` · `game.click('Slot', { count: 2 })` |
| `drag <ref\|주소> <ref\|주소> [--via <주소>]… [--duration <초>]` | 앞 자리에서 뒤 자리로 끈다 — 마디마다 적어도 10프레임. `--via` 는 지날 자리(여러 번 줄 수 있다), `--duration` 은 처음부터 끝까지 초(SDK 0.6.0) | `game.drag('/Hud/Bag/Slot[0]', '/Hud/Bag/Slot[3]')` · `game.drag('A', 'C', { via: ['B'] })` |
| `type <ref\|주소> <글자>` | InputField · TMP_InputField · UI Toolkit TextField 에 바로 넣는다(화면 키보드 없이). 글자 수 제한 · 거르기는 그 칸 규칙대로, 키로 칠 때의 차례(글자마다 거르고 거른 결과로 자름)다 — 글자 수 8 · 영숫자 칸에 `qa_user01!` 면 `qauser01`. uGUI · TMP 는 SDK 가 그 칸의 거르개를 글자마다 부른다. 비밀번호 칸이면 Ran 줄에 글자 대신 `'***'` | `game.type('IdInput', 'qa_user01')` |
| `text <ref\|주소>` | 글자 읽기 | `game.text('StatusText')` |
| `get <ref\|주소> <컴포넌트.칸> [--inactive]` | 속성 읽기 — 게임이 폰에서 셈하는 값. `material` · `materials` · `mesh` 는 읽기만 해도 사본을 만들어 거절한다(`shared…` 를 읽는다). UI Toolkit 요소는 요소 칸을 바로(`value` · `text` · `layout.height`) | `game.get('Player', 'PlayerController.moveSpeed')` |
| `find <ref\|주소> [--inactive] [--camera 주소]` | 있으면 `{path, text?, interactable?, id?, x?, y?, rect?, screen?, active?}`(`x` · `y` 는 누를 자리, `rect` 는 화면 사각형 `[x, y, w, h]`, `screen` 은 화면 크기 `[w, h]` — 모두 픽셀 · 왼쪽 아래 0,0), 없으면 `null` | `game.find('//*[@tag=Boss]')` |
| `find-all <주소> [--inactive] [--camera 주소]` | 맞는 것 전부 — 없으면 빈 목록 | `game.findAll('//Inventory/Slot')` |
| `find-at <x> <y> [--camera 주소]` | 좌표의 맨 위(UI Toolkit → uGUI → 3D · 2D 물리) — 살펴볼 때만. 버튼 속 글자가 맞을 수 있다 | 없음 |
| `parent <ref\|주소>` | 부모(`<경로>/..`) — 뿌리면 `null` | `game.parent('Item')` |
| `components <ref\|주소>` · `members <ref\|주소> <컴포넌트>` | 붙은 컴포넌트 `{name, type}` · 그 스크립트가 선언한 필드 · 속성(타입 · 값) · 메서드(인자 타입). Unity 부모(MonoBehaviour …) 칸은 뺀다 | `game.components('Player')` · `game.members('Player', 'PlayerController')` |
| `text-set <ref\|주소> <글자>` | 글자 컴포넌트(Text · TMP_Text · UI Toolkit Label/Button)의 글자를 바꾼다. 입력칸은 거절(`type`) | `game.setText('Title', '테스트')` |
| `wait <ref\|주소> [--text 글자] [--gone] [--timeout 초]` | 뜰 때까지 · 글자가 들 때까지 · 사라질 때까지(기본 10초 — `config --wait`) | `game.waitFor('ShopPanel', { gone: true })` |
| `wait-prop <ref\|주소> <칸> <값> [--timeout 초] [--inactive]` | 칸 값이 될 때까지 `get` 을 되풀이(UI Toolkit 요소도). `'10'` · `10` · `'[0, 1, 0]'` 을 같게 본다 | `game.waitForProp('Score', 'Text.text', '10')` |
| `config [--wait 초]` | 이 세션의 `wait` · `wait-prop` 기본 한도(장면 기다림 30초는 그대로) | 없음 |
| `layout [ref\|주소]` | 누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치는지(팝업에 가린 것은 뺀다) | `game.layout('LoginView')` |
| `call <ref\|주소> <컴포넌트.메서드> [인자…]` | 컴포넌트 메서드를 부르고 돌려준 값을 찍는다. 인자는 글자로 보내고 SDK 가 메서드 칸 타입(숫자 · 참거짓 · 열거 이름 · `[x,y,z]` 벡터 · 색)으로 바꾼다 — 같은 이름 꼴이 여럿이면 인자 수가 맞고 다 바꿀 수 있는 첫 꼴 | `game.callMethod('Player', 'PlayerController.Jump', ['2'])` |
| `set <ref\|주소> <컴포넌트.칸> <값>` | 칸 쓰기 — 값은 `get` 이 주는 꼴. `Transform.position.y` 처럼 값 타입 칸도 바꾼 사본을 다시 써 넣는다. 다시 읽은 값을 찍는다 | `game.set('Player', 'PlayerController.moveSpeed', '9')` |
| `static-call <타입.메서드> [인자…]` · `static-get <타입.칸>` · `static-set <타입.칸> <값>` | static 메서드 · 칸 — 타입은 전체 이름(`UnityEngine.Time`) 또는 하나뿐인 짧은 이름 | `game.callStatic('Game.Cheats.AddGold', ['100'])` · `game.getStatic('UnityEngine.Time.timeScale')` |
| `pref-get <키>` · `pref-set <키> <값>` · `pref-delete <키>` · `pref-clear` | 저장 값(PlayerPrefs) — `--type string\|int\|float`(기본 string). 넣은 타입으로 읽는다. 쓰면 바로 디스크에 | `game.setPref('tutorial_done', '1', 'int')` · `game.pref('tutorial_done', 'int')` |
| `timescale-get` · `timescale-set <배율>` | 시간 배율 — 1 보통 · 0 멈춤 · 2 두 배(0~100) | `game.setTimeScale(0)` |
| `scenes` · `scene-load <장면> [--add]` · `scene-unload <장면>` · `scene-wait <장면> [--timeout 초]` | 지금 장면 · 열린 장면, 빌드에 넣은 장면 열기(`--add` 는 위에 더한다) · 닫기 — 다 열리고 닫힐 때까지 기다린다(기본 30초). `scene-wait` 는 게임이 스스로 장면을 바꿀 때 | `game.loadScene('Shop', { add: true })` · `game.waitForScene('Lobby')` |
| `errors [번호]` | 게임 예외 · 에러 로그(최근 200개). 답의 `last` 를 받아 두고 다음에 그 번호 뒤만 받는다 | 없음 |
| `logs [번호]` | 게임 로그 전부(Log · Warning · Error · Assert · Exception, 최근 500개) — `errors` 와 같이 번호 뒤만. 영숫자 · `_` · `-` 가 40자 넘게 이어진 토막(토큰)은 SDK 가 `***` 로 가린다(SDK 0.7.0) | 없음 |
| `events [번호]` | 게임 알림(최근 200개) — `scene.loaded`(장면 · `single`/`add`) · `scene.unloaded` · `game.paused` · `game.resumed`. 멈춘 동안은 게임이 답하지 않으니 돌아온 뒤 읽는다. PC 는 SDK 가 `runInBackground` 를 켜 일시정지가 안 난다. 켤 때 Unity 가 이름 없는 빈 장면을 닫아 `scene.unloaded`(`scene: ""`)가 첫 장면보다 먼저 하나 온다(SDK 0.7.0) | 없음 |
| `sdk-log on\|off` | 켜면 SDK 가 받은 명령마다 `[ControlCli] click LoginButton — 성공` 한 줄을 게임 로그(logcat · Player.log · `logs`)에 적는다. 입력 글자 · 값은 `text=***` 처럼 가리고 실패 글 속 값도 가린다. 기본 꺼짐 · 게임을 다시 켜면 꺼짐(SDK 0.7.0) | `game.sdkLog(true)` |
| `key <키[+키…]> [--duration <초>] [--power <-1~1>]` | 키 한 번(기본은 한 프레임 누르고 다음 프레임 뗀다). KeyCode 이름 — `Escape` · `Space` · `Return` · `I` · `Alpha1` · `F1` · `Mouse0` · `JoystickButton0`. `A+LeftShift` 처럼 `+` 로 여럿을 함께. 옛 Input `GetKey*(KeyCode)` · `GetAxis` · `GetButton*` · Input System 키보드 · 게임패드가 본다. `Escape` 는 Unity 에서 폰 뒤로 키와 같다(`duration`·`power` 는 SDK 0.6.0) | `game.key('Escape')` · `game.key('A+LeftShift', { duration: 0.5 })` |
| `tap <x> <y> [--count <n>] [--interval <초>]` | 좌표 누르기(왼쪽 아래가 0,0) — 살펴볼 때만. 케이스는 좌표를 쓰지 않는다 | 없음 |
| `touch-down <ref\|주소>` · `touch-down <x> <y>` | 손가락 하나를 눌러 둔다 — 답의 번호(10~19)를 `touch-move` · `touch-up` 에 쓴다. 눌러 둔 손가락은 명령 사이에도 그대로다 | `game.touchDown('Slot')` |
| `touch-move <번호> <ref\|주소>` · `touch-move <번호> <x> <y>` | 눌러 둔 손가락을 한 프레임에 옮긴다 | `game.touchMove(10, 'Slot[3]')` |
| `touch-up <번호>` | 손가락을 뗀다 | `game.touchUp(10)` |
| `swipe <x,y> <x,y>… [--duration <초>]` | 좌표로 끌기 — 한 손가락이 점을 차례로 지난다. 살펴볼 때만, 케이스는 `drag` | 없음 |
| `long-press <ref\|주소>` · `long-press <x> <y>` `[--duration <초>]` | 길게 누른다(기본 1초) | `game.longPress('Slot', { duration: 2 })` |
| `mouse-move <ref\|주소>` · `mouse-move <x> <y>` `[--duration <초>]` | 가짜 마우스를 옮긴다 — hover(Pointer Enter/Exit). 단추는 `key Mouse0`~`Mouse4`, 끄기는 `input-reset` | `game.mouseMove('Tooltip')` |
| `scroll [<ref\|주소> \| <x> <y>] <dy> [--dx <칸>] [--duration <초>]` | 마우스 바퀴 — 위가 +, 옛 Input `mouseScrollDelta` 꼴(바퀴 칸). 자리를 주면 먼저 그리로 옮기고, 없으면 지금 마우스 자리(폰은 자리를 준다) | `game.scroll(-3, { at: 'ScrollList' })` |
| `key-down <키[+키…]> [--power <-1~1>]` · `key-up <키[+키…]>` | 키를 눌러 두기 · 떼기. `power` 는 세기(`GetAxis` 값) — `JoystickButton16`~`19` 는 스틱 값 | `game.keyDown('W', { power: 0.5 })` · `game.keyUp('W')` |
| `tilt <x> <y> <z> [--duration <초>]` | 기울이기 — `duration`(기본 한 프레임) 동안 가속도(`Input.acceleration` · Accelerometer)를 대신하고 끝나면 놓는다 | `game.tilt([0, -1, 0], { duration: 1 })` |
| `pointer <ref\|주소> <down\|up\|enter\|exit>` | GameObject 하나에 Pointer 이벤트를 바로 보낸다(EventSystem 처리기 — 부모로 안 올리고 `OnMouse*` 도 안 보낸다). UI Toolkit 요소는 거절 | `game.pointer('HoldBox', 'down')` |
| `input-reset` | 가짜 입력을 다 거둔다 — 눌러 둔 손가락(취소) · 키 · 가짜 마우스 · 기울기 | `game.resetInput()` |
| `ping` · `tree` | 게임 답 · 켜진 오브젝트 트리 JSON | 없음 |
| `snapshot [--png]` | 줄인 목록 + 스크린샷 파일 — `--png` 은 Appium 이 없는 길(PC · iOS · USB)에서 게임이 PNG 로 찍는다(SDK 0.5.0) | 없음 |
| `conform` | 표준 화면(샘플)에 명령을 차례로 보내 기대값과 견준다 — `open` 바로 뒤에. 게임 SDK 의 `caps` 에 없는 명령 줄과 앱을 뒤로 보낼 길이 없는 일시정지 줄(PC · iPhone)은 미실행, 실패가 있으면 종료 코드 1. 결과 줄은 「통과 N · 실패 N · 미실행 N」 | 없음 |

**주소**는 오브젝트 이름(켜진 것 중 하나뿐일 때) · `/` 로 시작하는 경로 · 선택자(AltTester PATH 꼴의 일부 — SDK 0.5.0)다. 같은 이름 형제는 경로 칸에 `[순번]`(0부터)을 붙인다 — `/HudCanvas/Inventory/Grid/Slot[2]`. 여럿이 맞으면 고르지 않고 실패한다(`find-all` 로 경로를 본다). UI Toolkit 요소는 UIDocument 오브젝트 아래 자식으로 이어진다(이름이 없으면 타입 이름) — `/UitkDocument/UitkPanel/UitkLoginButton`.

| 선택자 | 뜻 | 예 |
|---|---|---|
| `/` · `//` | 바로 아래 · 아래 어디서나 | `//Bag/Slot` |
| `*` | 아무 이름 | `/Canvas/*` |
| `..` | 부모 | `//*[@text=확인]/..` — 글자의 버튼 |
| `[@칸=값]` | 칸이 값과 같다 — `name` · `tag` · `layer`(이름 · 번호) · `component`(붙은 컴포넌트 · UI Toolkit 요소 타입) · `text` · `id` | `//*[@tag=Player]` · `//*[@component=Button]` |
| `[contains(@칸,값)]` | 값이 들어 있다 | `//*[contains(@name,Slot)]` |
| `[…][…]` | 조건을 모두 | `//*[@tag=Enemy][@layer=Water]` |
| `[n]` · `[-1]` | 그 단계에 맞은 형제 중 n번째(0부터) · 마지막 | `//Bag/Slot[-1]` |

값 양끝 공백은 떼고 `'…'` · `"…"` 는 벗긴다. `id` 는 QA 빌드가 장면 오브젝트에 붙인 **영구 id**(장면 파일 속 번호 — 빌드마다 같다) 또는 instance id(실행 중 만든 오브젝트 — 켤 때마다 바뀐다)다. 읽기 · 쓰기 명령(`find` · `get` · `set` · `call` · `components` · `members` · `text-set`)은 `--inactive` 로 꺼진 오브젝트도 찾는다 — 그때 경로 순번은 꺼진 형제까지 센다. 월드 오브젝트의 화면 자리는 `--camera <카메라 오브젝트 주소>` 로 고른 카메라로 셈한다(기본 주 카메라).
액션 뒤에는 트리가 두 번 같을 때까지(3초 상한) 기다렸다 화면을 찍는다. **기다리기**는 0.3초마다 짧은 `find` 를 되풀이한다 — 명령 하나가 팜 15초 · SDK 10초 한도에 안 걸린다.

### 가짜 입력

`touch-down` 부터 `input-reset` 까지와 `click` · `tap` · `drag` · `key` 의 새 칸은 SDK 0.6.0 부터다. 가짜 입력은 손가락 · 키 · 가짜 마우스 · 기울기 상태 한 벌을 프레임마다 바꾸고, 그 상태를 세 길로 내보낸다.

| 길 | 닿는 곳 |
|---|---|
| 옛 Input 감싸기 | `Input.touches` · `GetKey*` · `GetMouseButton*` · `mousePosition` · `mouseScrollDelta` · `acceleration` · uGUI 입력. 마우스는 `simulateMouseWithTouches` 가 켜져 있으면 가장 작은 번호 손가락을 따르고, 아니면 가짜 마우스다. `GetAxis` · `GetButton*` 은 QA 빌드 훅이 `ProjectSettings/InputManager.asset` 의 축을 장면에 구워 넣은 표로 가짜 키를 따른다 — 마우스 축은 가짜 마우스 이동량이고, 조이스틱 축(type 2)은 흉내 내지 않는다 |
| Input System 장치 | Touchscreen(손가락마다) · Mouse · Keyboard(누른 키 전부) · Gamepad · Accelerometer 에 상태 이벤트. PC 는 마우스 손가락(처음 누른 손가락 — 뗄 때까지 그대로)을 Mouse 왼 단추로, 나머지 손가락은 Touchscreen 으로 넣는다 |
| UI Toolkit 직접 | EventSystem 이 없는 옛 Input 게임의 panel 에 손가락마다 터치 이벤트, 가짜 마우스는 PointerMove · Down · Up · Wheel |

- 손가락 번호는 10~19(진짜 0~9 와 안 겹친다) — 비어 있는 가장 작은 번호를 주고, 10개가 다 눌려 있으면 `touch-up` · `input-reset` 으로 거절한다
- 명령 하나는 8초 안 — `duration` · `count` × `interval` 이 넘으면 거절한다(더 길게는 `touch-down` · `key-down` 뒤 `touch-up` · `key-up`). 시간은 `timeScale` 0 에서도 흐른다
- 진짜 입력은 끄지 않고 섞는다 — 팜 폰은 아무도 안 만지고, PC 에서 시험할 때는 마우스를 건드리지 않는다
- 키 `Mouse0`~`Mouse4` 는 가짜 마우스 단추다. `JoystickButton0`~`15` 는 게임패드 A · B · X · Y · LB · RB · LT · RT · Select · Start · LS · RS · 십자 위 · 아래 · 왼 · 오른, `16`~`19` 는 왼 스틱 x · y · 오른 스틱 x · y 이고 값은 `power` 다
- `key` · `key-down` · `key-up` 의 `power` 는 -1~1(기본 1) — 옛 Input `GetAxis` 값이다
- 옛 SDK(caps 에 `touch-down` 이 없는)에 새 칸(`count` · `interval` · `via` · `duration` · `power` · `key` 의 `+`)을 보내면 Game 이 보내기 전에 「SDK 0.6.0 이상」으로 거절한다

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
npm i -g github:maxihan1/control_cli#v0.9.0      # control-cli 를 PATH 에
claude mcp add control-cli -- control-cli mcp     # Claude Code
```

Claude Desktop — `claude_desktop_config.json`(macOS `~/Library/Application Support/Claude/` · Windows `%APPDATA%\Claude\`)의 `mcpServers` 에 한 줄. 팜을 안 쓰면 `env` 는 뺀다.

```json
"control-cli": { "command": "control-cli", "args": ["mcp"], "env": { "PLATFORM_APPIUM_URL": "http://<팜>:4723/wd/hub", "PLATFORM_APPIUM_TOKEN": "pat_…" } }
```

Desktop 은 셸의 PATH 를 안 볼 수 있다 — `control-cli` · `node` 를 못 찾으면 `"command": "<which node 의 경로>", "args": ["<npm root -g 의 경로>/control-cli/dist/main.js", "mcp"]` 로 쓴다.

| 도구 | 하는 일 |
|---|---|
| `hold` · `open` · `close` · `release` | 세션 — CLI 의 같은 명령. `open` 의 `via` 는 `farm`(기본 · `hold` 먼저) · `usb` · `pc` · `ios`, `relay`(주소 · 빈 글자면 이 컴퓨터 relay) · `game` 을 주면 relay 에 걸어 온 게임 |
| `ping` · `tree` · `find` · `click` · `drag` · `type` · `get` · `tap` · `key` · `touch-down` · `touch-move` · `touch-up` · `swipe` · `long-press` · `mouse-move` · `scroll` · `key-down` · `key-up` · `tilt` · `pointer` · `input-reset` · `screenshot` · `errors` · `layout` · `call` · `set` · `static-call` · `static-get` · `static-set` · `pref-get` · `pref-set` · `pref-delete` · `pref-clear` · `timescale-get` · `timescale-set` · `scenes` · `scene-load` · `scene-unload` · `find-all` · `find-at` · `components` · `members` · `text-set` · `logs` · `events` · `sdk-log` | `protocol/commands.json` 의 명령 그대로 — 인자는 그 칸, 답은 SDK 답 JSON(`ok` 뺌). `screenshot` 은 그림으로 준다(`format: png` 면 PNG). `scene-load` 는 열기 시작만 하니 `scenes` 로 다 열렸는지 본다. 부모는 `find` 에 `<경로>/..` |

- 명령을 `protocol/commands.json` 에 더하면 도구도 따라 는다(`src/mcp.test.ts` 가 잡는다)
- 세션 파일은 `~/.control-cli/` — Claude Desktop 은 MCP 서버를 쓸 수 없는 `/` 에서 띄운다. 셸 CLI 의 `./.control-cli/` 와 따로다. `-s <세션>` · `--port` · `--url` · `--token` 은 `control-cli … mcp` 로 띄울 때 준다
- 셸 CLI 의 `snapshot` ref · `Ran:` 줄 · `wait` · `text` 는 MCP 에 없다 — `tree` · `find` 로 본다

### 연결

| 값 | 옵션 | 환경값 |
|---|---|---|
| Appium · 팜 입구 | `--url` | `PLATFORM_APPIUM_URL` (없으면 `http://127.0.0.1:4723`) — 잡기 · 게임 명령 주소는 여기서 `/wd/hub` 를 뗀 곳 |
| 팜 토큰 (Bearer) | `--token` | `PLATFORM_APPIUM_TOKEN` — 둘 다 없으면 macOS Keychain 의 `control-cli-farm`. 한 번 넣는다: QA Hub `/account` 에서 발급한 PAT 를 복사한 채로 `security add-generic-password -U -a <맥 사용자> -s control-cli-farm -w "$(pbpaste)"` |
| 게임 APK | `--app` | `PLATFORM_APP` |
| 폰 | `--udid` | `PLATFORM_DEVICE_UDID` |
| USB · PC · iOS 게임 포트 | `--port` | — (기본 13100) |
| PC 게임 실행 파일 · iOS 서명된 .app | `--app` (`--pc` · `--ios` 와 같이) | — |
| relay | `open --relay [주소]` · `relay status [주소]` | — (없으면 `http://127.0.0.1:13101` — `ws://` · `wss://` 도 받는다) |
| relay 토큰 (Bearer) | `relay --token` (relay 를 띄울 때) | `CONTROL_CLI_RELAY_TOKEN` — 없으면 macOS Keychain 의 `control-cli-relay`. 팜 `--token` 과 따로다 |
| iPhone | `--udid` (`--ios` 와 같이 — 없으면 USB 로 꽂힌 하나) | `USBMUXD_SOCKET_ADDRESS` (usbmuxd 자리 — 테스트용, 없으면 `/var/run/usbmuxd`) |

## 인스펙터 · Recorder

설치 없이 브라우저로 게임 안을 본다(AltTester Desktop 의 인스펙터 · Recorder 자리). 엔진을 가리지 않는다 — Unity · Godot 둘 다 같은 화면.

```bash
control-cli open --pc --app <게임 앱>     # 또는 --usb · --relay … (팜 · iPhone 도)
control-cli inspect                        # 브라우저가 http://127.0.0.1:13110/?t=<토큰> 을 연다(--headless 면 주소만 찍음 · --listen <포트>)
```

- 왼쪽 트리 · 가운데 스크린샷 · 오른쪽 고른 것. 스크린샷을 누르면 그 자리 오브젝트(`find-at`)를 고른다. 고른 것의 컴포넌트를 누르면 칸 · 메서드 목록, 칸마다 「읽기」 · 「값 확인」
- 「누르기」 · 「글자 넣기」 · 「키 누르기」 · 「글자 확인」 · 「값 확인」은 Recorder 에 단계로 적힌다(「기록」을 끄면 적지 않고 하기만). 확인은 기다림 꼴 — 글자는 「들어 있다」, 값은 「같다」를 10초까지 되풀이
- 「돌리기」는 기록을 지금 게임에 다시 돌린다 · 「저장(JSON)」 · 「내보내기」(TS · Python · C# · Java · Robot) · 「내려받기」
- 세션이 없으면 마지막으로 연 `open` 연결(`.control-cli/last-open.json` — `--app` · 토큰은 안 적음)로 다시 연다. 서버는 `127.0.0.1` 만 듣고 주소의 토큰이 있어야 명령이 간다
- 비밀번호 칸에 넣은 글자는 기록에 남기지 않는다 — `SECRET_<칸 이름>` 환경 변수로 바꿔 적는다(돌릴 때 그 변수를 준다)

```bash
control-cli replay recorded.json                          # 지금 세션에 다시 — 단계마다 통과/실패, 실패면 종료 코드 1
control-cli export recorded.json --lang py --out test_recorded.py
CONTROL_CLI_GAME=tcp://127.0.0.1:13100 node --test recorded.test.ts     # TS — import { Game, linkTo } from 'control-cli' (Node 22.6+ 는 --experimental-strip-types)
CONTROL_CLI_GAME=tcp://127.0.0.1:13100 PYTHONPATH=drivers/python python3 test_recorded.py
```

| 언어 | 파일 | 돌리기 |
|---|---|---|
| TypeScript | `recorded.test.ts` | `node --test` — 줄은 Ran 줄과 같은 `await game.click('LoginButton');` |
| Python | `test_recorded.py` | `python3` 또는 `pytest`(드라이버는 `drivers/python`) |
| C# | `Recorded.cs` | `drivers/csharp/ControlCli.cs` · `ControlCli.csproj` 옆에 두고 `dotnet run`(최상위 문장) |
| Java | `RecordedTest.java` | `javac -d out drivers/java/controlcli/ControlCli.java && java -cp out RecordedTest.java` |
| Robot | `recorded.robot` | `robot --pythonpath drivers/python recorded.robot` |

게임 주소는 모두 `CONTROL_CLI_GAME`(기본 `tcp://127.0.0.1:13100`, relay 면 `http(s)://<relay>/games/<key>`). 기록하지 않는 것 — 좌표 누르기 · 끌기(주소 없는 좌표는 케이스에 못 쓴다), 칸 쓰기 · 메서드 부르기(CLI `set` · `call`).

## 드라이버 (다른 언어)

시험 코드를 TS 밖에서 쓸 때. 언어마다 의존 없는 파일 하나를 복사해 쓴다 — 명령 하나 = 메서드 하나(`protocol/commands.json` 에서 `npm run drivers` 가 만든다), 답은 게임 답 JSON 객체 그대로, 게임이 실패로 답하면 `GameError` · `GameException`.

| 언어 | 파일 | 꼴 |
|---|---|---|
| Python 3.8+ | `drivers/python/control_cli.py` | `Game('tcp://127.0.0.1:13100').click('LoginButton', count=2)` — 고를 칸은 키워드 |
| C# (.NET 8+) | `drivers/csharp/ControlCli.cs` | `new Game("tcp://127.0.0.1:13100").Click("LoginButton", count: 2)` — 고를 칸은 이름 있는 인자 |
| Java 17+ | `drivers/java/controlcli/ControlCli.java` | `new ControlCli("tcp://127.0.0.1:13100").click("LoginButton", Map.of("count", 2))` — 고를 칸은 `Map`(모르는 이름은 거절) |
| Robot Framework | `drivers/robot/standard.robot`(예) | `Library  control_cli.Game  tcp://127.0.0.1:13100` → `Click  LoginButton  count=${2}` — Python 드라이버를 그대로 라이브러리로 |

- 주소 — `tcp://<호스트>:<포트>`(PC 게임 · `adb forward tcp:13100 tcp:13100` 뒤 USB 폰) 또는 relay 의 `http(s)://<relay>/games/<key>`(key 는 `relay status` 에, `@` 는 `%40`). relay 토큰은 `CONTROL_CLI_RELAY_TOKEN`
- 명령 이름은 그 언어 꼴 — `find-all` → `find_all` · `FindAll` · `findAll`. 기다리기는 그 언어 되풀이로 쓴다(`find` 를 0.3초마다 — 드라이버에 기다리기 도우미는 아직 없다)
- 드라이버마다 같은 conform 을 돌린다 — 다리(stdin 명령 한 줄 → 그 언어 드라이버 메서드 → stdout 답 한 줄)를 띄워 차례 · 기대값은 TS 한 벌, 명령은 그 언어가 보낸다. PC · relay 세션에서

```bash
control-cli open --pc --app <샘플 앱>
control-cli conform --driver 'python3 drivers/python/control_cli.py bridge'
control-cli conform --driver 'java drivers/java/controlcli/ControlCli.java bridge'
control-cli conform --driver 'dotnet run --project drivers/csharp'
robot --pythonpath drivers/python --variable GAME:tcp://127.0.0.1:13100 drivers/robot/standard.robot
```

## SDK 명령 (통신 꼴 정본)

명령은 JSON 객체 한 줄, 답도 JSON 객체 한 줄이다. 디바이스 팜 게임 명령 주소는 본문을 그대로 한 줄로 넘기고 답을 `{"value": …}` 로 싼다(Devicefarm ADR-048).
실패는 `{"ok":false,"error":"…"}`. 명령은 게임 프레임에서 받은 차례대로 돈다. 10초 안에 게임이 못 받으면 실패로 답하고 그 명령은 버린다.

**relay 통신 꼴**(SDK 0.9.0 · WebGL 은 0.10.0 — 같은 꼴) — 게임이 `ws(s)://<relay>/game` 에 WebSocket 을 걸고 첫 글로 `hello <ping 답 JSON 에 platform · model · device · deviceId 를 더한 것>` 을 보낸다. 그 뒤 relay → 게임 `<번호> <명령 JSON>`, 게임 → relay `<번호> <답 JSON>` — 번호로 늦은 답이 다음 명령의 답이 되는 일을 막는다. CLI → relay 는 `GET /games`(붙은 게임 `{value:[{key, app, version, platform, model, device, engine?, engineVersion?, sdkVersion?, since, lastSeen}]}`) · `POST /games/<key>/command`(본문은 명령, 답은 `{value: 게임 답}` — 디바이스 팜 게임 명령 주소와 같은 꼴. 403 권한 · 404 그 게임 없음 · 504 게임이 15초 안에 답 없음 · 502 명령 중 끊김). relay 는 15초마다 ping 해 답 없는 게임을 뺀다.

| `cmd` | 칸 | 답 |
|---|---|---|
| `ping` | | `{ok, app, version, engine, engineVersion, sdkVersion, protocol, caps}` — `engine` 부터는 protocol 2(SDK 0.3.0)부터. `caps` 는 명령 이름 뒤에 기능 이름(`commands.json` 의 `features` — `rect` 는 SDK 0.8.0)을 싣는다. CLI 는 `open` 때 받은 `caps` 밖 명령을 보내지 않고 거절한다. 명령 정의는 `protocol/commands.json` |
| `tree` | | `{ok, scene, screen:[w,h], tree:[{name, text?, kind?, interactable?, children?}]}` — 켜진 오브젝트만. `kind` 는 Selectable 종류(Button · Toggle · InputField · TMP_InputField …) 또는 UI Toolkit 컨트롤(Button · Toggle · RadioButton · TextField · DropdownField · Slider). `text` 는 Text · InputField · TextMeshPro(TMP_Text · TMP_InputField) · UI Toolkit(TextElement · TextField). UI Toolkit 은 숨은 요소(display none · 안 보임)를 빼고 컨트롤 속은 내보내지 않는다. 비밀번호 칸 글자는 `***` |
| `find` | `target` · `inactive`? · `camera`? | `{ok, found:false}` 또는 `{ok, found:true, path, text?, interactable?, id?, x?, y?, rect?, screen?, active?}` — 여럿이 맞거나 꼴이 틀리면 실패. `id` 는 게임 오브젝트만, `x` · `y` 는 켜지고 화면에 비친 것만, `active:false` 는 `inactive` 로 찾은 꺼진 것. 선택자 · `inactive` · `camera` 는 SDK 0.5.0 부터. `rect` · `screen` 은 아래 「화면 사각형」 |
| `find-all` | `target` · `inactive`? · `camera`? | `{ok, found:[…]}` — `find` 의 칸 목록, 없으면 빈 목록 |
| `find-at` | `x` · `y` · `camera`? | `find` 와 같은 답 — UI Toolkit(맨 앞 panel) → uGUI(EventSystem raycast) → 3D · 2D 물리 차례, 트리에 없는 속 칸은 트리에 있는 조상으로 |
| `click` | `target` · `camera`? · `count`? · `interval`? | `{ok, x, y}` — 가짜 터치가 다 나가고 게임이 처리한 뒤 답한다. 켜진 것만. `count`(기본 1) · `interval`(초, 기본 0.1)은 SDK 0.6.0 부터 |
| `drag` | `target` · `to` · `camera`? · `via`? · `duration`? | `{ok, x, y}` — 위와 같다. `via` 는 지날 자리 주소 배열, `duration` 은 0~8초(기본 0 — 마디마다 10프레임). SDK 0.6.0 부터 |
| `type` | `target` · `text` | `{ok, text}` — 넣은 뒤 칸 글자. 잠긴 칸은 실패 |
| `get` | `target` · `prop`(`컴포넌트.칸[.칸…]`, UI Toolkit 요소는 `칸[.칸…]`) · `inactive`? | `{ok, value}` — 숫자 · 글자 · 참거짓 · 열거(이름) · 벡터 · 색은 배열, 그 밖은 글자 |
| `tap` | `x` · `y` · `count`? · `interval`? | `{ok, x, y}` |
| `key` | `key`(KeyCode 이름, 대소문자 무시 — `A+LeftShift` 처럼 `+` 로 여럿) · `duration`? · `power`? | `{ok, key}` — 누르고 뗀 것을 게임이 처리한 뒤 답한다. 모르는 이름은 실패. `duration` 0~8초(기본 0 — 한 프레임) · `power` -1~1(기본 1)은 SDK 0.6.0 부터 |
| `touch-down` | `target`? 또는 `x` · `y`, `camera`? | `{ok, finger, x, y}` — 손가락 번호 10~19. 둘 다 없으면 실패 · 10개가 다 눌려 있으면 실패. SDK 0.6.0 부터(아래 입력 명령 모두) |
| `touch-move` | `finger` · `target`? 또는 `x` · `y`, `camera`? | `{ok, x, y}` — 눌러 둔 손가락을 한 프레임에 옮긴다 |
| `touch-up` | `finger` | `{ok}` |
| `swipe` | `points`(`"x,y"` 글자 둘 이상) · `duration`? | `{ok, x, y}` — 한 손가락이 점을 차례로 지난다. 끝 점 |
| `long-press` | `target`? 또는 `x` · `y`, `camera`? · `duration`?(0~8초, 기본 1) | `{ok, x, y}` — 눌렀다 떼고 처리한 뒤 답한다 |
| `mouse-move` | `target`? 또는 `x` · `y`, `camera`? · `duration`? | `{ok, x, y}` — 가짜 마우스를 켜고 옮긴다 |
| `scroll` | `dy` · `dx`? · `target`? 또는 `x` · `y`, `camera`? · `duration`? | `{ok}` — 바퀴 칸(위가 +)을 `duration` 동안 나눠 넣는다. 자리를 주면 먼저 그리로 옮긴다 |
| `key-down` · `key-up` | `key` · `power`?(down) | `{ok}` — `key-down` 은 `key-up` · `input-reset` 까지 눌러 둔다 |
| `tilt` | `x` · `y` · `z` · `duration`? | `{ok}` — `duration`(기본 한 프레임) 동안 가속도를 대신하고 끝에 0 을 한 번 보낸다 |
| `pointer` | `target` · `event`(`down` · `up` · `enter` · `exit`) | `{ok}` — GameObject 하나의 EventSystem 처리기. UI Toolkit 요소는 실패 |
| `input-reset` | | `{ok}` — 일을 멈추고 손가락 취소 · 키 뗌 · 가짜 마우스 끔 · 기울기 끔 |
| `screenshot` | `format`?(`jpg` · `png`) | `{ok, jpg}` 또는 `{ok, png}` — 프레임 끝에서 찍은 화면(base64). 수 MB 라 팜은 Appium 스크린샷을 쓴다. ImageConversion 모듈을 뺀 게임은 실패. `png` 는 SDK 0.5.0 부터 |
| `errors` | `since` | `{ok, last, errors:[{seq, time, occurredAt, type, message, stack}], dropped?, restarted?}` — `occurredAt`(UTC ms 3자리) · 토큰 가리기는 SDK 0.7.0 부터, `time` 은 옛 꼴 그대로 |
| `logs` | `since` | `{ok, last, logs:[{seq, occurredAt, type, message, stack}], dropped?, restarted?}` — 로그 전부, 최근 500개. 40자 넘는 영숫자 토막은 `***`. SDK 0.7.0 부터(아래 둘도) |
| `events` | `since` | `{ok, last, events:[{seq, occurredAt, type, …}], dropped?, restarted?}` — `scene.loaded {scene, mode}` · `scene.unloaded {scene}` · `game.paused` · `game.resumed`, 최근 200개. 이름 · 시각 칸은 Issue Bunker 이벤트 꼴 |
| `sdk-log` | `on` | `{ok, on}` — 켜면 명령마다 `[ControlCli] <cmd> <이름 칸> <값 칸>=*** — 성공` 또는 `— 실패: <글>` 을 `Debug.Log`. 알림 읽기 · `sdk-log` 자신은 안 적는다 |
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
| `components` | `target` · `inactive`? | `{ok, components:[{name, type}]}` — SDK 0.5.0 부터(아래도) |
| `members` | `target` · `component` · `inactive`? | `{ok, fields:[{name, type, value?, readOnly?, static?}], properties:[…], methods:[{name, args, returns, static?}]}` — 그 타입에서 Unity 부모 앞까지 선언한 것. 값은 읽다 던지거나 사본 속성이면 없다 |
| `text-set` | `target` · `text` · `inactive`? | `{ok, text}` — 다시 읽은 글자. 입력칸 · 글자 컴포넌트가 없는 것은 실패 |

**화면 사각형**(SDK 0.8.0 — `ping` 의 `caps` 에 `rect`) — `find` · `find-all` · `find-at` 답의 한 칸마다 `rect: [x, y, w, h]` 와 `screen: [w, h]` 를 싣는다. 픽셀이고 `x` · `y` 와 같이 왼쪽 아래가 0,0 이다. 스크린샷처럼 왼쪽 위가 0,0 인 그림에 그릴 때는 `top = screen[1] - (y + h)`, 기기 화면 크기와 다르면 `screen` 으로 나눠 비율로 바꾼다.

- uGUI · UI Toolkit — 그 요소의 화면 사각형(돌린 UI 는 둘레)
- 월드 오브젝트 — 켜진 렌더러 bounds 를 다 합친 상자의 꼭짓점 8개를 카메라(`camera` 칸, 기본 주 카메라)로 비춘 둘레. 카메라 앞뒤에 걸친 상자는 near 면에서 잘라 비춘다. 렌더러가 없거나 상자가 다 카메라 뒤면 `rect` 가 없다
- 화면 밖으로 나간 만큼은 자르지 않는다 — 그리는 쪽이 `screen` 으로 자른다. 꺼진 오브젝트(`active:false`)는 `rect` 가 없다
- `x` · `y` 는 누를 자리라 `rect` 가운데와 다를 수 있다(월드 오브젝트는 첫 렌더러 가운데)

## 개발

```bash
npm test                                            # CLI 테스트 — 가짜 게임 · 가짜 팜 · 가짜 PC 게임 · 가짜 usbmuxd
npm run drivers                                     # protocol/commands.json 에서 드라이버 생성 칸을 다시 쓴다(src/drivers.test.ts 가 다르면 잡는다)
python3 tools/unity-compile-check/check.py fetch    # Unity 판마다 관리 DLL · 내장 패키지 · TMP · Input System 받기(판마다 수 GB 를 받아 일부만 푼다)
python3 tools/unity-compile-check/check.py 6000.0   # SDK · 샘플을 입력 설정 셋(옛 Input · 둘 다 · Input System)으로 컴파일 — Docker 필요
```

컴파일 검사는 Unity 라이선스 없이 PR 마다 돈다(`.github/workflows/sdk-compile.yml`). 로그의 `== <판> · <입력>` 줄에 SDK 에 켜진 정의(`CONTROL_CLI_TMP` · `CONTROL_CLI_INPUTSYSTEM` …)가 찍힌다.
`sdk/unity/` 에 파일을 더하면 `.meta` 도 같이 넣는다 — git 으로 받은 UPM 패키지는 Unity 가 `.meta` 를 못 만든다(`src/sdk-meta.test.ts` 가 잡는다).
명령을 더하거나 바꾸면 `protocol/commands.json` 과 Unity SDK 의 `Caps`(`sdk/unity/Runtime/ControlServer.cs`) · Godot SDK 의 `CAPS`(`sdk/godot/addons/control_cli/control_cli.gd`)를 같이 고친다 — `src/protocol.test.ts` 가 잡는다.
Godot 은 이 맥에 깔지 않고 CI 가 받는다 — `godot.yml` 이 xvfb 위에서 표준 화면을 띄워 conform 하고, macOS 앱 · 웹을 결과물로 굽는다. 이 맥에서는 `gh run download <run> -n godot-sample-4.7.2` 로 받아 `open --pc --app <…>/control-cli-sample.app`, 웹은 `python3 -m http.server` 로 열고 `?controlcli=ws://127.0.0.1:13101` 뒤 `open --relay --game control-cli-sample`(늦추기를 끈 Chrome — 「루프 — relay」 WebGL 과 같은 명령).

## License

MIT
