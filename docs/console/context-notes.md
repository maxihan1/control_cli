# 콘솔별 가상 패드 · Windows 지원 — 결정 노트

## 2026-11-17 범위 (사용자 결정)
- **콘솔을 실행 대상으로 더하지 않는다** — 게임은 Windows 빌드로만 돈다. PlayStation · Switch · Xbox 는 그 게임에 꽂힌 것으로 보이는 가상 패드의 종류다. 사용자 「PC에 패드 선택하고 가상패드 선택 없음은 PC용으로」
- **SDK 는 하나** — 모바일 · PC 가 같은 패키지다. 개발사가 프로젝트 하나로 Android 판과 Windows 판을 굽기 때문이다. 콘솔 실기(kit)용 갈래는 이번에 없다
- **패드는 실행할 때 고른다** — QA Hub 에서 「PC + 패드(없음 · PS5 · PS4 · Switch · Xbox)」. 케이스가 도중에 바꾸지 않는다. 결과가 패드별로 따로 남아야 어느 패드에서 틀렸는지 보인다
- **Windows PC 에는 러너를 한 벌 더** — 맥 러너와 같은 방식. 게임 포트가 `127.0.0.1` 전용이라 조작 도구가 게임과 같은 PC 에 있어야 한다. PC 가 일을 받아 가는 에이전트는 새 표 · API 가 생겨 일이 가장 많다
- **1차 증적은 스크린샷** — 영상은 PC 에 녹화 도구(새 의존)가 있어야 해서 다음
- **PR #32 는 main 에 합치지 않는다** — 개발사 전달용 이름 바꾸기(`QAHUB_SDK` · QA Hub 문구)일 뿐이다. 새 작업은 main(`CONTROL_CLI*`)에서 시작한다. 새 패드 기능을 개발사에 넘길 때는 그 branch 의 이름 바꾸기를 새 main 위에 다시 얹는다

## 판 번호
- CLI 0.15.0 · SDK 0.12.0 으로 건너뛴다 — 0.14.0 · 0.11.0 은 넘긴 zip(`QAhub.zip`)이 이미 쓴 번호다. 같은 번호에 다른 내용이 생기면 개발사가 가진 판을 가릴 수 없다

## 가상 패드 설계 (Input System 1.18.0 source 판독 · 실행 전)
- **늘 자기 장치에 보낸다** — `Device(ref _gamepad, Gamepad.current)` 는 실물 패드가 있으면 그 장치에 `GamepadState` 를 보낸다. 실물 DualSense · Switch Pro · Xbox 패드는 상태 형식이 달라 그 입력이 예외도 로그도 없이 버려진다. `docs/unity/context-notes.md` 12행의 「있는 장치부터 쓴다」(PlayerInput 짝짓기)는 터치 · 마우스 · 키보드에만 남긴다. 패드는 새 장치에서 버튼이 눌리면 `PlayerInput` 이 조작 묶음을 바꾼다(한 명이 하는 구성에서만 — 실측 칸)
- **타입을 쓰지 않고 장치 설명으로 만든다** — `DualSenseGamepadHID` · `DualShock4GamepadHID` · `SwitchProControllerHID` 는 `#if UNITY_EDITOR || UNITY_STANDALONE_*` 안에만 있고 `XInputControllerWindows` 는 Windows 빌드에만 있다. 타입을 직접 쓰면 Android 빌드가 깨지고, 컴파일 검사 하네스는 `UNITY_ANDROID` 정의로만 돌아 그 `#if` 안쪽을 못 본다. `InputSystem.AddDevice(new InputDeviceDescription{…})` 에 interface 와 VID/PID 를 주면 맞는 layout 이 골라진다
- **`StateEvent.From` + `WriteValueIntoEvent` + `QueueEvent`** — 형식(`DSVS` · `D4VS` · `SPVS` · `XINP`)이 layout 마다 다르고 상태 구조체 대부분이 internal 이라, 장치의 지금 상태를 복사해 control 로 값을 쓰는 길 하나만 모든 layout 에 통한다. PS 계열은 delta 이벤트를 버리므로 늘 전체 상태 이벤트다. 중립이 0 이 아니다(스틱 가운데 · hat 8) — 빈 구조체를 보내면 스틱이 끝까지 꺾인 것으로 읽힌다
- **PS 십자키는 hat 값을 직접 쓴다** — `dpad/up` 등이 `DiscreteButtonControl` 이라 `WriteValueIntoState` 가 `NotSupportedException` 을 던진다. `writeMode = WriteNullAndMaxValue` 는 up 에 1(위 · 오른쪽)을 써 틀린다. Switch · Windows Xbox 의 십자키는 비트라 그대로 쓴다(macOS Xbox 는 hat — 아래 실측)
- **비슷한 layout 으로 몰래 바꾸지 않는다** — 만들 수 없으면 오류다. `DualShockGamepad` 기본 layout 으로 떨어뜨리면 PS5 와 PS4 를 못 가리고, 답의 종류와 실제 장치가 달라진다
- **`Pad.` 이름표와 거절** — Switch 의 A 는 오른쪽(확인), Xbox 의 A 는 아래다. 자리 기준 이름(`JoystickButton0`)만 있으면 케이스가 플랫폼을 섞어 써도 통과한다. `Pad.A` 처럼 글자로 쓰게 하고 그 패드에 없는 글자는 거절한다. `A` 는 키보드 KeyCode 와 겹쳐 `Pad.` 을 붙였다
- **`devices` 를 답에 싣는다** — Steam Input · 변환 도구가 끼면 실물 패드가 모두 XInput 으로 보인다. 시험 실패가 아니라 환경 오류로 가르려면 실물 장치의 layout · VID/PID 기록이 있어야 한다
- **Godot 는 하지 않는다** — 개발사에는 Unity 만 넘긴다. `protocol.test.ts` 가 Godot `CAPS` 도 같기를 강제하므로 명령에 `engines` 칸을 둔다

## 2026-11-17 C1 실측 (이 맥 · Unity 6000.3.10f1 · Input System 1.18.0 · macOS Mono 빌드)
샘플을 Input System 설정으로 굽고, 장치 설명으로 만든 가상 패드에 상태 이벤트를 넣어 되읽었다(버리는 측정 코드 · 저장소에 없다).
- **장치 설명 → layout** — 판독대로다. ps5 `DualSenseGamepadHID`(`DSVS`) · ps4 `DualShock4GamepadHID`(`D4VS`) · switch `SwitchProControllerHID`(`SPVS`) · xbox(HID product `Xbox Wireless Controller`) `XboxGamepadMacOSWireless`(`HID`). macOS 에서 interface `XInput` 은 `ArgumentException: Cannot find layout matching device description` — 못 만드는 플랫폼은 이 예외를 받아 오류로 답하면 된다
- **스틱 되돌려 쓰기는 어긋났다** — `WriteValueIntoEvent` 가 ps5 · ps4 · switch · macOS xbox 에서 `(-1, 0)` · `(0, 1)` 을 `(0, 0)` 으로 쓴다. `(1, 0)` · `(0, -1)` · `(0.5, -0.5)` 는 맞다. 까닭은 `NormalizeProcessor.Denormalize` 의 음수 갈래가 `min + (zero − min) × (−value)` 라 −1 이 가운데(zero)가 되는 것이다(y 는 `invert` 라 +1 이 음수 쪽). 가운데가 0 인 축(generic 의 `FLT`)은 그 갈래를 안 탄다. **고친 설계** — `normalize` 이고 `normalizeMin < normalizeZero` 인 축은 날값(`zero + (max − zero) × v` · 음수는 `zero + (zero − min) × v`, `invert` 면 먼저 뒤집는다)을 셈해 `stateBlock.WriteFloat` 로 쓴다. Input System 이 그 버그를 고쳐도 결과가 같다. 버그를 거꾸로 이용하는 값 넣기(−1 대신 −0)는 고쳐진 판에서 깨지므로 버렸다
- **상태 칸을 직접 쓰려면 포인터가 든다** — `GetStatePtrFromStateEvent` · `stateBlock.WriteFloat` · `WriteInt` 가 `void*` 를 받는다. SDK asmdef 에 `allowUnsafeCode` 를 켠다(어셈블리 하나의 설정이라 게임 프로젝트 설정과 상관없다 · 컴파일 검사 도구는 asmdef 값을 그대로 읽는다). 이벤트 버퍼(`NativeArray<byte>`)에 byte 를 손으로 쓰는 길은 형식(`BYTE` · `USHT` · 4비트)마다 Input System 의 쓰기를 다시 짜야 해서 버렸다
- **hat 십자키** — 값을 직접 쓰면 여덟 방향과 중립이 다 맞게 읽힌다. **macOS xbox(`XboxGamepadMacOSWireless`)도 hat 이다**(위 1 · 시계 방향 · 중립 0, PS 는 위 0 · 중립 8). 종류마다 표를 두지 않고 layout 에서 셈한다 — 위 값 = `dpad/right` 의 `minValue − 1`, 중립 = `dpad/up` 의 `nullValue`, 위부터 시계 방향으로 1 씩. `dpad/up` 이 `DiscreteButtonControl` 이 아니면(switch · generic · Windows xbox) control 로 쓴다
- **Switch 연결 절차는 해가 없다** — 만든 뒤 3초 동안 로그 0줄, 장치는 `added` · `enabled` 그대로, 버튼도 그대로 들어간다(`HandshakeTick` 의 `ExecuteCommand` 가 native 가 아닌 장치에서 조용히 실패)
- **`PlayerInput`** — 키보드로 시작한 한 명짜리 구성(조작 묶음 `KeyboardMouse` · `Gamepad`)에 가상 패드를 뒤에 만들고 아래 버튼을 누르면 `currentControlScheme` 이 `Gamepad` 로 바뀌고 action 이 불린다(ps5 · switch · xbox · generic 모두). 중립 상태만 보낸 것으로는 안 바뀐다. 키보드 space 를 넣으면 `KeyboardMouse` 로 돌아온다. 패드를 없애면 키보드 묶음으로 남는다
- **만든 직후의 빈 상태** — switch 는 이벤트를 넣기 전 스틱이 `(-0.707, 0.707)` 로 읽힌다(byte 0 = 끝). ps5 · ps4 · xbox 는 기본값이 가운데다. 종류를 가리지 않고 만들자마자 중립 상태를 한 번 보낸다
- **Switch 방아쇠는 비트** — `ZL` · `ZR` 는 세기 0.5 도 1 로 읽힌다(실물도 디지털). xbox · ps 는 0.5 가 0.5
- **표시 이름** — ps5 의 `select` 는 layout 이 「Share」로 준다(실물 글자는 Create). `pad` 답의 `buttons` 는 layout 이 주는 이름 그대로 싣는다 — 게임이 Input System 에 이름을 물으면 받는 글자가 그것이다. `Pad.` 이름표는 실물 글자(`Pad.Create`)를 쓴다
- **이 맥에는 실물 패드가 없다** — 붙은 장치는 Keyboard · Mouse · Pen 셋. 「실물 패드를 꽂은 채 가상 패드 입력이 들어가는지」는 C3 에 남는다

## 2026-11-17 C1 에서 계획과 다르게 한 것
- **ping 에 `pads` 를 더했다** — 계획은 `input` 만 실었다. conform 을 Android Input System 빌드(CI 가 굽는다)에 돌리면 콘솔 패드를 못 만들어 패드 줄이 실패로 찍힌다. 「이 빌드 · 이 플랫폼에서 만들 수 있는 종류」를 ping 이 알려 주고 conform 은 거기 없는 종류를 미실행으로 친다. `input` 도 그대로 싣는다(QA Hub 가 「Input System 게임인가」를 물을 때 쓴다)
- **「C 축 · 조이스틱」 줄은 고치지 않았다** — 계획은 키보드 키를 빼자고 했으나, 옛 Input 감싸기는 조이스틱 축을 흉내 내지 않아(`FakeKeys.Axis`) 키보드 키가 빠지면 옛 Input 빌드와 Godot 표준 화면에서 그 줄이 실패한다. 패드만 보는 확인은 새 패드 줄이 맡는다
- **`off` 는 처음 상태다** — 가상 패드가 없는 상태를 `off` 로 부르고, 그 상태에서 패드 키가 오면 `generic` 을 만든다(계획의 「종류를 안 골랐으면 generic」). 따로 「안 고름」 상태를 두지 않았다

## 2026-11-17 C1 conform (이 맥)
- **Input System 빌드** — 이 맥에서 구운 샘플(Unity 6000.3.10f1 · Input System 1.18.0 · Mono · SDK 0.12.0)에 `open --pc --app` → conform 「통과 56 · 실패 0 · 미실행 1」(미실행은 PC 의 일시정지 줄). 패드 줄 넷(ps5 `DualSenseGamepadHID` · ps4 `DualShock4GamepadHID` · switch `SwitchProControllerHID` · xbox `XboxGamepadMacOSWireless`)은 돌린 판마다 통과했다. `pad switch` → `key-down Pad.A+Pad.Up+Pad.LX --power -1` 의 PadText 는 「pad SwitchProControllerHID · ok A · no B · held east=A · dpad 0,1 · L -1,0 …」
- **옛 Input 빌드** — 같은 프로젝트를 `-activeInputHandler 0` 으로 구우면 ping 이 `input: old` · `pads: []`, `pad ps5` 는 「이 게임은 Input System 을 쓰지 않아 가상 패드를 만들 수 없습니다」, conform 「통과 52 · 실패 0 · 미실행 5」(패드 줄 넷이 「옛 Input 빌드」 까닭으로 미실행). `key Pad.Up` 은 옛 길(`JoystickButton12`)로 간다
- **마우스 줄의 흔들림은 패드와 상관없다** — 이 맥에서 구운 6000.3 + 1.18.0 빌드는 「C UI Toolkit 직접」(EventSystem 없는 장면의 UI Toolkit 누르기) · 끌기 줄이 판마다 붙었다 떨어졌다 했다. 같은 Unity · Input System 으로 main 의 SDK(0.10.0)를 구워도 같았다 — 패드를 한 번도 안 만든 새 게임에서 `scene-load Second` → `click SecondButton` 이 「second 1」이 될 때와 빈 글자일 때가 섞인다. 앞서 「52/0/1」을 남긴 빌드는 CI 가 구운 6000.0.84f1 + 1.11.2 다. 까닭은 캐지 않았다(C1 범위 밖) — 진짜 마우스 커서가 게임 창 위에 있었는지, Input System 1.18.0 의 UI Toolkit 입력 길이 달라졌는지가 후보다
- **CI 가 구운 빌드(6000.0.84f1 · Input System 1.11.2 · run 44056206295 의 StandaloneOSX input 1)** — `open --pc --app` → conform 을 세 번 돌려 마우스 줄 흔들림 없이 ps5 · ps4 · switch 줄이 통과했다. 스틱 날값 쓰기 · hat 십자키가 1.11.2 에서도 맞는다
- **macOS Xbox layout 이름은 Input System 판마다 다르다** — 같은 장치 설명(HID · product `Xbox Wireless Controller`)이 1.18.0 에서는 `XboxGamepadMacOSWireless`, 1.11.2 에서는 `XboxOneGampadMacOSWireless`(Unity 쪽 오타 그대로)가 된다. 1.11.2 에는 macOS 무선 Xbox layout 이 그것 하나이고, 1.18.0 은 옛 Xbox One 패드(VID/PID 여덟)만 그 이름으로 남기고 나머지를 새 layout 으로 뺐다. SDK 는 그대로 두고(그 Input System 이 무선 Xbox 패드에 주는 layout 이 맞는 답이다) conform 의 xbox 줄이 셋(`XInputControllerWindows` 포함)을 다 맞다고 보게 고쳤다 — CI 빌드에서 그 줄이 「layout XboxOneGampadMacOSWireless」로 실패해 알았다
- **Boss Room 은 굽지 않았다** — 사용자 2026-11-17 「보스룸 굽지마」. 그 프로젝트는 Input System 원본을 읽는 데만 썼다

## Windows
- CLI 의 PC 길은 OS 분기가 거의 없다(`process.platform` 은 Keychain 과 inspect 브라우저 열기 둘). `.exe` 는 `launch()` 의 일반 분기로 이미 `spawn` 된다. 남은 것은 실행해 본 기록이 없다는 것이다 — 그래서 고칠 곳보다 CI(`windows-latest` 에서 `npm test`)와 실측이 먼저다
- `--ios` · `--usb` 의 Windows 지원 · `tools/handoff.mjs`(전달용 branch 에만 있다)는 손대지 않는다 — 요청 밖
- 이 맥에서는 `XInputControllerWindows` 를 볼 수 없다. Xbox 는 macOS 용 layout(`XboxGamepadMacOSWireless`)까지만 실측되고, Windows layout 은 CI runner 나 PC 에서 본다 — C2 에서 CI runner 로 봤다(아래 「C2」)

## 2026-11-17 C2 — Windows runner 실측과 결정
재는 곳은 GitHub `windows-latest` runner 다(GPU 없음 · 화면 1024×768). 게임은 CI 가 구운 샘플 Windows 빌드(Unity 6000.0.84f1 · Input System 1.11.2 · Mono · SDK 0.12.0 · run 44056206295)다. 이 맥에는 Windows 가 없어 실제 PC 는 C3 이다.
- **GPU 없는 runner 에서도 Unity 가 뜬다** — Player.log 에 「Direct3D 11.0 · Microsoft Basic Render Driver」. `open --pc --app …\control-cli-sample.exe` 가 붙고 스크린샷 · conform 이 돈다. 인자(`-force-…`)는 필요 없었다 — `launch(app, args)` 는 만들지 않았다
- **게임에는 `windowsHide` 를 걸지 않는다(계획을 뒤집음)** — 계획은 `launch()` 에 `windowsHide: true` 였다. 걸고 띄우면 Unity 창 손잡이(`MainWindowHandle`)가 0 이고 conform 「통과 51 · 실패 5 · 미실행 1」(스크린샷이 「ReadPixels … while not inside drawing frame」 · UI Toolkit 직접 누르기 실패)이다. 안 걸면 손잡이 131442 · 제목 「control_cli sample」. 까닭은 Node 가 이 값을 `STARTUPINFO.wShowWindow = SW_HIDE` 로 넘기고 Unity 가 첫 창을 그 값으로 띄우는 것으로 본다(판독 — 잰 것은 손잡이 0 까지다). relay 띄우기(node · 콘솔 프로그램)에는 건다 — 빈 콘솔 창을 막는 본래 쓰임이다
- **화면이 창보다 작으면 conform 이 깨진다** — runner 기본 1024×768 에서는 「통과 53 · 실패 3 · 미실행 1」(find-at 이 WorldCube 자리에서 `UitkStatusText` 를 집음 · swipe · scroll 의 ScrollList 가 안 움직임). 샘플 창(540×1200)이 화면 높이로 잘려 UI Toolkit 패널이 uGUI 칸을 덮는다(`SampleBuild.cs` 의 「세로 창」 주석과 같은 까닭). `Set-DisplayResolution -Width 1920 -Height 1080 -Force` 뒤에는 게임 화면 540×1080 · 「통과 56 · 실패 0 · 미실행 1」. 2560×1600 · 1920×1440 · 1920×1200 은 runner 가 거절한다
- **`pad xbox` 는 `XInputControllerWindows`** — 답 「xbox · XInputControllerWindows · south A · east B · west X · north Y …」, 장치 목록 「XInputControllerWindows(가상)」. conform 패드 줄 넷(ps5 `DualSenseGamepadHID` · ps4 `DualShock4GamepadHID` · switch `SwitchProControllerHID` · xbox)이 Windows 에서 다 통과했다 — 스틱이 `SHRT` · 십자키가 비트인 Windows Xbox 도 control 로 쓰는 보통 길이 맞다(C1 이 넘긴 것)
- **Windows 빌드의 app 이름** — ping 의 `app` 이 `control_cli sample`(productName)이다. Windows 빌드에는 번들 identifier 가 없다(P3-B 의 「identifier 가 비면 productName」)
- **`launch` · `stop` 은 `src/launch.ts`** — `cli.ts` 를 `index.ts` 에서 내보내면 라이브러리가 MCP · 인스펙터 · relay 까지 끌고 온다. `stop(pid)` 는 `process.kill` 만 한다(iPhone 끄기는 `cli.ts` 에 남김). Windows 에서 `process.kill` 은 그 프로세스 하나를 끝낸다 — 러너가 띄운 `npx` 가지 전체를 끄는 일(`taskkill /T`)은 QA Hub 러너 몫이다
- **작업 폴더는 실행 파일 폴더, 그래서 절대 경로가 먼저** — `spawn` 에 `cwd` 를 주면 상대 경로 실행 파일이 그 폴더 기준으로 풀려 못 찾는다. `resolve` 뒤에 `dirname`. macOS · Linux 도 같게 했다(`.app` 은 `Contents/MacOS`). 이 맥에서 CI 가 구운 macOS 빌드를 끝에 `/` 붙인 경로로 열어 「통과 56 · 실패 0 · 미실행 1」
- **끝의 `\`** — Windows 에서만 뗀다(`/` 는 어디서나). POSIX 에서는 `\` 가 파일 이름 글자다
- **`--usb` · `--ios` 는 Windows 에서 열기 전에 거절** — adb 길은 될 수도 있지만 돌려 본 기록이 없다. 반쯤 되다 마는 것보다 「`--pc` · `--relay` · 디바이스 팜만 됩니다」가 낫다. 지원은 요청이 오면 한다
- **Windows 용 가짜 게임** — `sh` 스크립트를 못 띄우고 `.cmd` 는 `spawn` 이 막는다. node 실행 파일을 게임 삼아 띄우고 `NODE_OPTIONS=--require <멈춰 있는 모듈>` 을 그 줄 동안만 건다 — 인자를 못 주는 `launch` 를 그대로 시험한다. `launch.test.ts` 는 같은 수로 작업 폴더를 파일에 적게 해 세 OS 에서 본다
- **`npm test` — Windows 104개 중 통과 101 · 건너뜀 3**(iPhone 줄 · Robot 둘 — runner 에 robot 이 없다). 처음 돌렸을 때 실패한 다섯은 모두 드라이버의 인코딩이었다 — Python 다리가 한글 답을 cp1252 stdout 에 못 썼고(`UnicodeEncodeError`), JDK 17 `javac` 가 UTF-8 소스를 windows-1252 로 읽었다. 다리는 `sys.stdin` · `sys.stdout` 을 UTF-8 로 고쳤고(한 군데 — stdin 도 같은 인코딩이라 한글이 든 명령도 깨졌을 것이다), 테스트의 `javac` 에는 `-encoding UTF-8`, 내보낸 Python 테스트 실행에는 `PYTHONIOENCODING=utf-8` 을 줬다. Java · C# 다리는 처음부터 통과했다. 드라이버의 Windows 보증은 여전히 범위 밖이다 — runner 에서 도는 기록만 생겼다
- **`has()`** — `sh -c 'command -v'` 는 Windows 에 `sh` 가 없으면 전부 건너뛰고, Git 이 깔려 있으면 우연히 돈다. Windows 는 `where` 로 바꿨다
- **`.gitattributes`** — 저장소 파일은 모두 LF 로 들어가 있어 `* text=auto eol=lf` 로 바뀌는 파일이 없다. Windows checkout 이 CRLF 로 풀지 않게만 한다
- **측정은 버리는 workflow 로** — `win-try.yml`(branch push 로 돈다)이 C1 실행의 Windows 빌드를 `gh run download` 로 받아 3~4분에 한 번씩 쟀다. sample 전체(80분)를 돌리지 않고 `sample.yml` 에 넣을 잡을 꼴 그대로 검증한 뒤 지웠다
- **sample 전체 실행(run 44070282927)** — 빌드 열과 `conform-windows` 까지 12개 잡이 한 번에 초록이다. `conform-windows` 는 그 실행이 막 구운 Windows 빌드를 `gh run download <이 실행 번호>` 로 받아 「통과 56 · 실패 0 · 미실행 1」 · `pad xbox` 「XInputControllerWindows」. `cli` 잡은 run 44070282724
- **C3 에 남는 것** — 실제 PC(GPU · 진짜 화면)에서의 conform, 실물 패드를 꽂은 채 가상 패드 입력, 초점 잃은 창, IL2CPP 빌드, `close` 뒤 `UnityCrashHandler64.exe` 가 남는지

## 범위 밖으로 둔 것
- 옛 Input Manager 게임 — layout 개념이 없다. 장치 이름 글자와 버튼 번호가 게임마다 다른 약속이라 게임별로 재야 한다
- Rewired · Steam Input 게임 — Input System 에 만든 가상 장치를 보지 못한다
- 케이스 도중의 패드 교체 · 연결 해제 시험, 영상 · FPS, 콘솔 실기 · relay

## 근거 자료 (저장소 밖)
- 조사 보고서 `~/Downloads/콘솔 게임 QA 방식과 적용 방안.md` · 조사 노트 `~/Downloads/qahub-handoff/조사 노트/windows_virtual_console_pads.md`(1~5절)

## 2026-11-19 C3 — VISION 길로 바꿈
- **사용자 결정** — 「모바일에서 러너는 어디에 있어? 모바일 스펙과 동일하게 가지고 가고 싶은데?」. 모바일은 러너가 QA Hub 서버(컨테이너)에 있고 VISION(`DEVICE_FARM_URL`)이 폰을 잡아 준다. 같게 가면 PC 도 러너는 서버에, PC 는 VISION 기기 `pc-<이름>`(Devicefarm ADR-061 · 11-18)이다. 원래 C3 · QA Hub Q1 의 「PC 에 러너 한 벌 더 · `PC_RUNNER_URL`」은 버린다
- **`open --pc` 는 남긴다** — 같은 컴퓨터에서 켠 게임에 바로 붙는 길이라 사람이 손으로 시험할 때 쓴다. VISION 길과 겹치지 않는다
- **PC 인지는 serial 로 가린다** — VISION 이 PC serial 을 `pc-<이름>` 으로 정했다(ADR-061 §3.3 · 제약 C7). 기기 목록을 한 번 더 묻지 않는다
- **명령 · 스크린샷은 손대지 않는다** — VISION `/game` 입구가 폰과 같아 `farmLink` 그대로다. Appium 세션이 없으면 스크린샷은 SDK 가 찍는다(이미 PC · USB 길이 그렇다). VISION 은 1MB 넘는 글자 답을 조각으로 이어 붙인다(16MB 까지)
- **넘겨받은 글** — Devicefarm 세션이 main 체크아웃에 커밋 안 하고 둔 `vision-pc-handoff.md` 를 이 branch 로 옮겨 실었다
