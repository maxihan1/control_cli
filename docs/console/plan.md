# 콘솔별 가상 패드 · Windows 지원 — 구현 계획 (control_cli + QA Hub)

## Context

콘솔로 나갈 게임은 패드로 조작하고, 플랫폼 심사의 대표 반려 사유가 「다른 플랫폼의 버튼 그림 · 확인/취소 배치」다. 지금 SDK 의 가상 패드는 종류가 없는 패드 하나뿐이라 「패드로 조작된다」만 보여 주고, 실물 패드가 꽂힌 PC 에서는 입력이 조용히 버려진다(`FakeInputSystem.cs:131` 이 `Gamepad.current` 에 `GamepadState` 를 보낸다). QA Hub 는 Android(farm · usb)만 돌리고 케이스에 키 · 패드 명령이 없다.

만들 것은 둘이다.

- **control_cli** — PlayStation(PS5 · PS4) · Switch · Xbox 가상 패드. 플랫폼을 고르면 패드 layout 이 바뀌고, 어떤 패드로 돌렸는지가 답 · 기록에 남는다. CLI 와 SDK 가 Windows 에서 돈다.
- **QA Hub(test_platform)** — Windows 게임 빌드를 실행 대상으로 받는다. 실행할 때 패드 종류를 고르면 같은 케이스가 패드별로 돌고 결과도 패드별로 남는다.

사용자 결정(2026-11-17)
- 콘솔을 실행 대상으로 더하지 않는다. 실행 대상은 **PC(Windows) 하나**이고 SDK 도 하나다(모바일 · PC 가 같은 패키지).
- 패드 종류는 **실행할 때** 고른다(케이스 안에서 바꾸지 않는다). 고르는 꼴은 「PC + 패드(없음 · PS5 · PS4 · Switch · Xbox)」이고 **패드 없음이 PC 용**(키보드 · 마우스)이다.
- Windows PC 에는 **러너를 한 벌 더** 둔다(맥 러너와 같은 방식). PC 는 사용자가 따로 준비한다.
- 1차 증적은 **스크린샷**까지. 영상은 다음.
- **PR #32 는 쓰지 않는다** — 개발사 전달용 이름 바꾸기일 뿐이다. 새 작업은 main 에서 시작한다.

## 먼저 알아 둘 사실 (탐색 · source 판독으로 확인)

- main 은 CLI 0.13.0 · Unity SDK 0.10.0 · 심볼 `CONTROL_CLI*` 다. 0.14.0 · 0.11.0 은 개발사에 넘긴 zip 이 이미 쓴 번호라 **새 판은 CLI 0.15.0 · SDK 0.12.0** 으로 건너뛴다.
- 콘솔 layout class(`DualSenseGamepadHID` · `DualShock4GamepadHID` · `SwitchProControllerHID` · `XInputControllerWindows`)는 Input System 안에서 standalone · Editor 빌드에만 들어 있다(Input System 1.18.0 source). SDK 가 그 타입을 직접 쓰면 Android 빌드가 깨진다 → **타입을 쓰지 않고 장치 설명(interface + VID/PID)으로 만든다.**
- 네 layout 모두 `Gamepad` 를 물려받는다 → `buttonSouth` · `leftStick` · `dpad` 같은 공통 control 로 한 코드가 네 패드를 다룬다.
- 입력은 `StateEvent.From(device)` + `control.WriteValueIntoEvent` + `InputSystem.QueueEvent` 로 넣는다(형식이 layout 마다 달라 `GamepadState` 는 못 쓴다).
- PS5 · PS4 의 십자키는 hat 값 하나(0~7, 중립 8)라 `WriteValueIntoEvent` 가 `NotSupportedException` 을 던진다 → 십자키만 hat 값을 상태에 직접 쓴다.
- Switch 는 오른쪽 버튼이 A(확인), 아래가 B(취소)다. Xbox 는 아래가 A 다. 같은 「A」가 다른 자리다.
- `XInputControllerWindows` 는 Windows 빌드에만 있다. 이 맥에서는 PS5 · PS4 · Switch 와 macOS 용 Xbox layout 까지만 실측된다.
- `protocol.test.ts` 가 Godot `CAPS` 도 `commands.json` 과 같기를 강제한다.
- CLI 의 PC 길(`open --pc --app` · `tcpLink` 127.0.0.1:13100)은 OS 분기가 거의 없다. `.exe` 는 이미 그대로 `spawn` 된다. 다만 Windows 에서 돌린 기록이 없고 CI 에 `npm test` 전체를 도는 job 도 없다.
- test_platform 은 control-cli `v0.8.0` 을 라이브러리로 import 한다(`packages/kit/src/runtime/game.ts`). 이번 일은 3등급(KIT · RUNNER · ADMIN · MIGRATION · SPEC)이라 명세와 `[계약 변경 필요]` 승인이 먼저다.

판독일 뿐 실행해 보지 않은 것 — C1 처음에 이 맥에서 확인한다
1. 스틱 값(-1~1)이 PS · Switch 의 byte 상태로 맞게 되돌려 쓰이는지(`AxisControl.Unpreprocess`).
2. hat 값을 직접 쓴 십자키가 읽히는지.
3. 가상 Switch 패드의 연결 절차(`HandshakeTick` 의 `ExecuteCommand`)가 해 없이 실패하는지.
4. 새로 만든 패드에서 버튼을 누르면 `PlayerInput` 이 조작 묶음을 바꾸는지.

## 진행 방식

- 단계 하나 = branch 하나 = PR 하나 = 세션 하나(이어달리기 규칙 그대로). 각 단계 세션이 자기 상세 계획(`docs/console/cN-plan.md`)을 쓰고 시작한다.
- 사용자가 2026-11-17 에 승인했다. 칸은 [checklist.md](checklist.md), 결정과 까닭은 [context-notes.md](context-notes.md). 진척 artifact 에 C · Q 칸이 있다.
- test_platform 쪽은 그 저장소의 `/tpx` 절차를 따른다(계획 파일 없음 · 명세 먼저 · 진행판 `docs/wbs.md`).

```
C1 가상 패드 ─┬─ C2 Windows CLI ── (tag v0.15.0) ─┬─ Q2 kit · 러너 ── Q3 admin ── Q4 작성 지침
              │                                    │
Q1 명세 ──────┴────────────────────────────────────┘        C3 · Q5 = Windows PC 실측(PC 가 온 뒤)
```

---

## control_cli

### C1. 콘솔별 가상 패드와 `pad` 명령 (SDK 0.12.0 · CLI 0.15.0)

**명령**
- `pad [xbox|ps5|ps4|switch|generic|off]` — 종류를 주면 앞 가상 패드를 `RemoveDevice` 하고 새 layout 으로 만든다. 종류 없이 부르면 지금 상태만 답한다.
- 답: `pad: { type, layout, buttons: { south, east, west, north … 의 표시 이름 } }` 과 `devices: [{ layout, product, vendorId, productId, native }]`(실물 장치 목록 — Steam Input · 변환 도구가 끼었는지 가리는 근거).
- 만들 수 없는 플랫폼(Android 등)이나 Input System 이 없는 게임에서는 까닭을 적어 오류로 답한다. 비슷한 layout 으로 몰래 바꾸지 않는다.
- ping 답에 `input`(`old` · `new` · `both`)을 더한다 — conform 이 옛 Input 빌드에서 패드 줄을 미실행으로 친다.

**장치 표** (타입 참조 없이 설명으로 — `Application.platform` 으로 가른다)

| type | 장치 설명 | 기대 layout |
|---|---|---|
| ps5 | HID · 0x054C / 0x0CE6 | `DualSenseGamepadHID` |
| ps4 | HID · 0x054C / 0x09CC | `DualShock4GamepadHID` |
| switch | HID · 0x057E / 0x2009 | `SwitchProControllerHID` |
| xbox | Windows: interface `XInput` · macOS: HID product `Xbox Wireless Controller` | `XInputControllerWindows` · `XboxGamepadMacOSWireless` |
| generic | layout 이름 `Gamepad` | `Gamepad` |

**버튼 이름** — `key` · `key-down` · `key-up` 이 받는 이름에 `Pad.` 이름표를 더한다.
- `JoystickButton0`~`19` 는 그대로 자리(아래 · 오른쪽 · 왼쪽 · 위 …) 기준이다.
- `Pad.<이름>` 은 고른 플랫폼의 글자다. xbox: `A B X Y LB RB LT RT View Menu LS RS` · ps5/ps4: `Cross Circle Square Triangle L1 R1 L2 R2 Create(ps4 는 Share) Options L3 R3` · switch: `A B X Y L R ZL ZR Minus Plus LS RS` · 공통: `Up Down Left Right LX LY RX RY`.
- **그 패드에 없는 이름은 거절한다**(ps5 에서 `Pad.A` → 오류와 쓸 수 있는 이름 목록). `Pad.A` 는 switch 에서 오른쪽, xbox 에서 아래로 간다. 플랫폼을 섞어 쓴 케이스가 조용히 통과하지 못하게 하는 장치다.

**고칠 곳**
- `sdk/unity/Runtime/FakePad.cs`(새 파일 + `.meta`) — 가상 패드 만들기 · 없애기 · 상태 보내기 · 이름표. `FakeInputSystem.cs:129-160` 의 패드 부분을 여기로 옮기고 `Device(ref _gamepad, Gamepad.current)` 를 없앤다. **늘 자기 장치에 보낸다**(종류를 안 골랐으면 `generic`). 터치 · 마우스 · 키보드는 그대로 둔다.
- `sdk/unity/Runtime/ControlServer.cs` — `pad` 명령 · `Caps` · ping 의 `input` · `Keys()`(758행)의 `Pad.` 이름 · `SdkVersion`.
- `sdk/unity/Runtime/FakeInput.cs` — `Reset()` 은 버튼만 뗀다(패드 종류는 유지).
- `protocol/commands.json` — `pad` 명령. 명령에 `engines`(없으면 전부)를 더해 Unity 전용으로 표시하고 `src/protocol.test.ts` 의 Godot 비교가 그것을 뺀다. Godot 는 구현하지 않는다.
- `src/game.ts`(`pad()`) · `src/cli.ts`(switch · HELP) · `src/fake-game.ts`(같은 표 · 같은 거절) · `npm run drivers`.
- `sample/Assets/Sample/InputProbe.cs` — 지금 패드의 layout · 확인/취소 표시 이름 · 십자키 · 두 스틱 · 방아쇠 값을 글자로 낸다.
- `src/conform.ts` — 패드 줄(종류마다: 만들기 → layout 확인 → 이름표 버튼 → 십자키 → 스틱 부호 → 방아쇠 → 다른 플랫폼 이름 거절 → `off`). 기존 「C 축 · 조이스틱」 줄(529행)은 키보드 키를 빼고 패드만으로 보게 고친다.
- `README.md`(275~282행 입력 설명 · 지원 표) · `docs/unity/context-notes.md`(12행 「있는 장치부터 쓴다」 결정을 패드에 한해 뒤집은 까닭).

**차례**
1. 실측부터 — 샘플을 Input System 설정으로 macOS 빌드해 위 「실행해 보지 않은 것」 네 가지를 확인한다. 어긋나면 그 control 만 상태에 직접 쓰는 길로 바꾸고 context-notes 에 적는다.
2. `fake-game` · `cli.test` · `conform.test` · `protocol.test` 에 실패하는 테스트를 먼저 쓰고 CLI 를 채운다.
3. SDK 구현 → 컴파일 검사(`tools/unity-compile-check` · Unity 2021.3 / 2022.3 / 6000.0 × 입력 설정 넷) → 이 맥 macOS 빌드 conform.

**확인**
- `npm test` 초록, CI `sdk-compile` · `sample` 초록(Android 정의로도 컴파일된다 = 타입 참조가 없다).
- 이 맥 Unity 6000.3.10f1 macOS 빌드: `open --pc --app` → `pad ps5` → `key Pad.Cross` 가 InputProbe 에 `DualSenseGamepadHID` · `Cross` 로 보인다. ps4 · switch · xbox(macOS layout)도 같다. conform 패드 줄 전부 통과.
- Boss Room(`~/Projects/boss-room` · Input System 1.18.0 · `PlayerInput`) macOS 빌드에서 패드 버튼으로 메뉴가 움직인다 — 가상 패드가 실제 게임을 움직인 첫 기록.

### C2. Windows 에서 도는 CLI

**고칠 곳**
- `src/cli.ts:864` `launch()` — `windowsHide: true`, 작업 폴더를 실행 파일 폴더로, 끝의 `\` 처리. `:834` relay 띄우기에도 `windowsHide`. `launch` · `stop` 을 라이브러리로 내보낸다(QA Hub kit 이 쓴다).
- `src/cli.test.ts:155`(sh 가짜 앱) · `:351`(Unix 소켓 usbmuxd) · `src/drivers.test.ts:23`(`sh -c`) — Windows 에서 돌거나 건너뛰게.
- `.gitattributes`(`* text=auto eol=lf`).
- `.github/workflows/cli.yml`(새로) — `npm test` 를 `ubuntu-latest` · `windows-latest` 에서.
- `.github/workflows/sample.yml` — 이미 굽는 `StandaloneWindows64` 빌드를 `windows-latest` job 이 받아 `open --pc --app sample.exe` → `conform`. **시도 항목이다** — GPU 없는 runner 에서 Unity 창이 안 뜨면 이 job 은 빼고 C3 으로 넘긴다.
- `README.md` — Windows 예시(`open --pc --app C:\…\Game.exe`), 지원 표.
- `--ios` · `--usb` 는 Windows 에서 손대지 않는다(요청 범위 밖). 쓰면 알아듣게 거절만 한다.

**확인** — CI `windows-latest` 에서 `npm test` 초록. Windows runner conform 이 되면 「통과 · 실패 0」과 `pad xbox` 가 `XInputControllerWindows` 로 나오는 것까지. 끝나면 병합하고 `v0.15.0` tag.

### C3. Windows PC 실측 (PC 가 준비된 뒤 · 사용자 손이 든다)

- 샘플과 Boss Room 의 Windows 빌드(Mono, 가능하면 IL2CPP)로 `open --pc` · conform · 패드 넷.
- 실물 Xbox 패드 · DualSense 를 꽂은 채 가상 패드 입력이 들어가는지(이번 변경의 핵심 회귀 확인).
- 게임 창이 초점을 잃은 상태의 입력, `devices` 목록에 실물 장치가 맞게 찍히는지.
- 결과를 README 지원 표의 「실기기로 확인」 칸과 context-notes 에 적는다.

---

## QA Hub (test_platform — `/tpx` 절차 · 3등급)

### Q1. 명세와 계약 변경 승인

`docs/spec/도메인/게임.md`(결정 2 · 6 · 12 · 「1차 밖」) · `공통/3-공유계약.md`(게임 테스트 타입) · `공통/4` 데이터모델 · `러너.md` 를 고치고 `[계약 변경 필요]` 로 승인을 받는다. 정할 내용은 아래다.

- **플랫폼과 패드** — 화면에서는 플랫폼 「PC(Windows)」를 고르고 그 아래에서 패드를 고른다(없음 · PS5 · PS4 · Switch · Xbox · 여러 개 선택 가능). 패드 없음은 가상 패드를 만들지 않는 PC 용 실행이다. 저장 값은 `windows`(패드 없음) · `windows-ps5` · `windows-ps4` · `windows-switch` · `windows-xbox` 로 `run_item.platform` 에 실어, 새 칸 없이 결과 · 실패 분석이 패드별로 갈리게 한다. 결과 표기는 「PC」 · 「PC · PS5 패드」처럼 쓴다(콘솔 실기 QA 로 읽히지 않게).
- **길** — `pc` 를 더한다. 게임과 러너가 같은 PC 에 있고 kit 이 `tcpLink(13100)` 로 붙는다. 포트가 하나라 PC 한 대는 한 번에 게임 하나다.
- **빌드** — `app_build` 에 `platform`(android · windows) 칸. Windows 빌드는 zip(목차에 `.exe` 가 있어야 한다).
- **러너 주소** — Windows 항목은 `PC_RUNNER_URL` 의 러너로 보낸다(토큰 · `/health` · `/files` 는 지금 것 그대로).
- **`GameDriver`** — `key` · `keyDown` · `keyUp` 과 읽기 전용 `pad`(type · 버튼 표시 이름)를 더한다. 패드를 바꾸는 메서드는 내지 않는다.
- **증적** — 실패 스크린샷(`game.screenshot()`) · `game-tree.txt` · `game-errors.txt`. 영상 · FPS 는 Windows 에서 「없음」.
- **전제** — Windows 패드 실행은 Unity Input System 을 쓰는 게임만 된다. 옛 Input Manager · Rewired · Steam Input 게임은 범위 밖으로 적는다.

### Q2. kit · 러너 — PC 길 (control-cli `v0.15.0` 으로 올린다)

- `packages/kit/src/runtime/game.ts:51` `gameLink` 에 `pc`. `openGame` 뒤에 `PLATFORM_PAD` 가 있으면 `game.pad(type)` 을 한 번 부른다.
- `packages/kit/src/runtime/test.ts:188` 옆에 PC 갈래 — Appium 없이 zip 을 풀고(`tar -xf` · Windows 10 이상에 들어 있다 · 새 npm 패키지 없음) control-cli 의 `launch` 로 띄우고 끝나면 `stop`. 스크린샷은 `game.screenshot()`.
- `apps/runner/src/execute.ts:144` `gameEnv`(`pc` 판정 · `PLATFORM_PAD`) · `:168` `npx` 띄우기와 `kill.ts` 의 Windows 처리(`shell` · `taskkill /T /F`). `gameFps` · `farmEvidence` 는 PC 에서 건너뛴다.
- `playwright.config.ts` 에 Windows 프로젝트 다섯.
- 테스트: `game.test.ts` · `execute.test.ts` 등 기존 파일에 PC 갈래를 더한다. 실측은 먼저 **이 맥의 로컬 러너 + macOS 빌드**로 같은 길을 돌려 본다(개발 확인용 · 제품 값은 Windows 만).

### Q3. admin — 빌드 · 실행 요청 · 배분 · 화면

- 마이그레이션 `app_build.platform`. `buildRoutes.ts` · `buildFile.ts` 가 Windows zip 을 받는다.
- 플랫폼 enum 이 적힌 곳(`location.ts:31` · `engineField.ts:16` · `trialRoutes` · `scenario/routes` · `catalog/rules` · `reporting/*` · `runRow.ts` · `web/ui.tsx` · `RunPickTabs.tsx` 등)에 새 값. `engine:'GAME'` 조건을 Windows 값에도.
- `dispatcher.ts:148` — Windows 항목은 팜 폰을 잡지 않고 PC 러너로 한 줄씩 보낸다. `runnerAddr.ts` 에 `PC_RUNNER_URL`.
- 실행 화면에서 「PC(Windows)」를 고르면 패드 선택이 열린다(기본 없음 = PC 용). 결과 표에 「PC」 · 「PC · PS5 패드」로 보인다.

### Q4. 케이스 작성 지침

- `.claude/skills/tpx-cases/references/game.md` · `tpx-author/references/game.md` — `open --pc`, 키 · 패드 명령, `Pad.` 이름표와 「확인/취소는 플랫폼마다 자리가 다르다」 규칙, `game.pad` 로 기대값을 가르는 본보기.
- `scripts/authoring-check-game.ts:117` 의 「platforms 는 ['android'] 하나」 규칙을 넓힌다. `authoring-prompt.ts:124`.

### Q5. Windows PC 실측 (PC 가 준비된 뒤)

- PC 에 러너 설치(Node 22 · 저장소 · 토큰) · 서버에서 PC 로 닿는 터널 · `PC_RUNNER_URL`. 절차를 `docs/SETUP.md` 에 적는다.
- Boss Room Windows 빌드로 케이스 하나를 `windows` · `windows-ps5` · `windows-switch` · `windows-xbox` 에 돌려 결과가 패드별로 남는지, 실패 스크린샷이 붙는지 본다.

---

## 이 계획에 넣지 않은 것

- 영상 녹화 · FPS(Windows) — 다음.
- 옛 Input Manager 게임의 패드 이름 · 버튼 번호 흉내, Rewired · Steam Input 게임 — 게임마다 따로 재야 한다.
- 케이스 도중의 패드 교체 · 연결 해제 시험 — 「실행할 때 고른다」로 정했다. `pad off` 는 SDK 에 있으므로 나중에 열 수 있다.
- Godot SDK 의 패드 종류.
- 콘솔 실기(kit) · relay 로 붙는 길.
- 개발사 전달용 zip 에 새 패드 기능 싣기 — 전달용 branch(`one-command-install`)의 이름 바꾸기를 새 main 위에 다시 얹어야 한다. 필요해질 때 따로 한다. **그래서 PR #32 와 그 branch 는 지우지 않고 그대로 둔다.**

## 사용자 손이 필요한 곳

- Q1 의 `[계약 변경 필요]` 승인.
- Windows PC 준비(C3 · Q5) — Windows 10/11, Steam · 패드 변환 도구 없음, 실측용 실물 Xbox 패드 · DualSense.
- Boss Room Windows 빌드를 구울 곳(이 맥의 Unity 에 Windows 빌드 모듈이 없으면 설치가 필요하다).

## 끝을 확인하는 법

1. control_cli `npm test` 가 macOS · Linux · Windows(CI)에서 초록.
2. 이 맥 macOS 빌드 conform 에서 패드 줄이 ps5 · ps4 · switch · xbox 모두 통과하고, Boss Room 이 가상 패드로 움직인다.
3. Windows(CI runner 또는 PC)에서 `open --pc --app …exe` → conform 통과, `pad xbox` 가 `XInputControllerWindows`.
4. 실물 패드를 꽂은 Windows PC 에서 가상 패드 입력이 버려지지 않는다.
5. QA Hub 에서 Windows 빌드를 올리고 PC 에 패드 「없음 · PS5 · Switch」를 골라 같은 케이스를 돌리면 결과 세 줄(「PC」 · 「PC · PS5 패드」 · 「PC · Switch 패드」)이 남고, 다른 플랫폼 버튼 이름을 쓴 케이스는 오류로 멈춘다.
