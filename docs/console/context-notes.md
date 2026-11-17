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

## Windows
- CLI 의 PC 길은 OS 분기가 거의 없다(`process.platform` 은 Keychain 과 inspect 브라우저 열기 둘). `.exe` 는 `launch()` 의 일반 분기로 이미 `spawn` 된다. 남은 것은 실행해 본 기록이 없다는 것이다 — 그래서 고칠 곳보다 CI(`windows-latest` 에서 `npm test`)와 실측이 먼저다
- `--ios` · `--usb` 의 Windows 지원 · `tools/handoff.mjs`(전달용 branch 에만 있다)는 손대지 않는다 — 요청 밖
- 이 맥에서는 `XInputControllerWindows` 를 볼 수 없다. Xbox 는 macOS 용 layout(`XboxGamepadMacOSWireless`)까지만 실측되고, Windows layout 은 CI runner 나 PC 에서 본다

## 범위 밖으로 둔 것
- 옛 Input Manager 게임 — layout 개념이 없다. 장치 이름 글자와 버튼 번호가 게임마다 다른 약속이라 게임별로 재야 한다
- Rewired · Steam Input 게임 — Input System 에 만든 가상 장치를 보지 못한다
- 케이스 도중의 패드 교체 · 연결 해제 시험, 영상 · FPS, 콘솔 실기 · relay

## 근거 자료 (저장소 밖)
- 조사 보고서 `~/Downloads/콘솔 게임 QA 방식과 적용 방안.md` · 조사 노트 `~/Downloads/qahub-handoff/조사 노트/windows_virtual_console_pads.md`(1~5절)
