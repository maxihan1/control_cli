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
- **PS 십자키는 hat 값을 직접 쓴다** — `dpad/up` 등이 `DiscreteButtonControl` 이라 `WriteValueIntoState` 가 `NotSupportedException` 을 던진다. `writeMode = WriteNullAndMaxValue` 는 up 에 1(위 · 오른쪽)을 써 틀린다. Switch · Xbox 의 십자키는 비트라 그대로 쓴다
- **비슷한 layout 으로 몰래 바꾸지 않는다** — 만들 수 없으면 오류다. `DualShockGamepad` 기본 layout 으로 떨어뜨리면 PS5 와 PS4 를 못 가리고, 답의 종류와 실제 장치가 달라진다
- **`Pad.` 이름표와 거절** — Switch 의 A 는 오른쪽(확인), Xbox 의 A 는 아래다. 자리 기준 이름(`JoystickButton0`)만 있으면 케이스가 플랫폼을 섞어 써도 통과한다. `Pad.A` 처럼 글자로 쓰게 하고 그 패드에 없는 글자는 거절한다. `A` 는 키보드 KeyCode 와 겹쳐 `Pad.` 을 붙였다
- **`devices` 를 답에 싣는다** — Steam Input · 변환 도구가 끼면 실물 패드가 모두 XInput 으로 보인다. 시험 실패가 아니라 환경 오류로 가르려면 실물 장치의 layout · VID/PID 기록이 있어야 한다
- **Godot 는 하지 않는다** — 개발사에는 Unity 만 넘긴다. `protocol.test.ts` 가 Godot `CAPS` 도 같기를 강제하므로 명령에 `engines` 칸을 둔다

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
