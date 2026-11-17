# C1. 콘솔별 가상 패드와 `pad` 명령 — 설계 · 구현 계획

위 계획은 [plan.md](plan.md) 의 C1 절이다. 여기에는 실측(2026-11-17 · 이 맥 Unity 6000.3.10f1 · Input System 1.18.0 · macOS Mono 빌드)으로 굳힌 설계와 구현 차례만 적는다. 결정의 까닭은 [context-notes.md](context-notes.md).

## 실측 결과 (맨 처음 한 일)

샘플을 Input System 설정으로 구워, 장치 설명으로 만든 가상 패드(ps5 · ps4 · switch · xbox · generic)에 상태 이벤트를 넣고 되읽었다.

| 본 것 | 결과 | 설계에 준 영향 |
|---|---|---|
| 장치 설명 → layout | ps5 `DualSenseGamepadHID` · ps4 `DualShock4GamepadHID` · switch `SwitchProControllerHID` · xbox(macOS) `XboxGamepadMacOSWireless`. macOS 에서 interface `XInput` 은 `ArgumentException`(layout 없음) | 계획 그대로. 못 만드는 플랫폼은 예외를 받아 오류로 답한다 |
| 1. 스틱 값 되돌려 쓰기 | **어긋남** — `WriteValueIntoEvent` 가 가운데가 0 이 아닌 축(ps5 · ps4 · switch 의 BYTE, macOS xbox 의 USHT)에서 음수 쪽을 가운데로 쓴다. `(-1, 0)` · `(0, 1)` 이 `(0, 0)` 으로 읽힌다(y 는 뒤집힌 축이라 +1 이 음수 쪽) | 그런 축은 날값을 셈해 `stateBlock.WriteFloat` 로 직접 쓴다 |
| 2. hat 십자키 | hat 값을 직접 쓰면 여덟 방향 · 중립이 다 맞게 읽힌다. **macOS xbox 도 hat** 이다(위 1 · 중립 0). switch · generic 은 비트라 control 로 써진다 | hat 값을 layout 에서 셈한다(위 = `right.minValue − 1` · 중립 = `up.nullValue`) — PS 와 macOS xbox 가 한 코드 |
| 3. Switch 연결 절차 | 3초 동안 로그 0줄 · 장치 그대로 · 입력 그대로 들어감 | 손댈 것 없음 |
| 4. `PlayerInput` 조작 묶음 | 키보드로 시작한 한 명짜리 구성에 패드를 뒤에 만들어도, 그 패드의 버튼을 누르면 `Gamepad` 묶음으로 바뀌고 action 이 불린다. 중립 상태만 보내면 안 바뀐다. 키보드를 누르면 돌아온다 | 「늘 자기 장치에 보낸다」 그대로 |
| 그 밖 | switch 는 만든 직후 스틱이 `(-0.707, 0.707)` 로 읽힌다(빈 상태 = 끝까지 꺾임). switch 방아쇠는 비트라 0.5 도 1 | 만들자마자 중립 상태를 한 번 보낸다. 방아쇠 세기는 switch 에서 뜻이 없다고 적는다 |

## 통신 꼴

- `pad` — `{"cmd":"pad","type":"ps5"}`. `type` 은 `xbox · ps5 · ps4 · switch · generic · off`, 없으면 지금 상태만.
- 답 — `{"ok":true,"pad":{"type":"ps5","layout":"DualSenseGamepadHID","buttons":{"south":"Cross","east":"Circle",…}},"devices":[{"layout":…,"product":…,"vendorId":…,"productId":…,"native":false}]}`. `buttons` 는 그 layout 이 주는 표시 이름(자리 → 글자), `devices` 는 Input System 에 붙은 패드 · 조이스틱 전부(가상 패드는 `native:false`). 패드가 없으면 `pad` 는 `{"type":"off"}`.
- `off` 는 가상 패드가 없는 처음 상태다. 그 상태에서 패드 키(`JoystickButton*` · `Pad.Up` …)가 오면 `generic` 을 만든다.
- ping 에 `input`(`old` · `new` · `both`)과 `pads`(이 빌드 · 이 플랫폼에서 만들 수 있는 종류)를 더한다. conform 은 `pads` 에 없는 종류의 줄을 미실행으로 친다 — Android Input System 빌드에서 콘솔 패드 줄이 실패로 찍히지 않게 `pads` 를 더했다(계획에는 `input` 만 있었다).
- `commands.json` 의 `pad` 에 `"engines": ["unity"]`. `protocol.test.ts` 는 Godot `CAPS` 를 `engines` 가 없거나 `godot` 이 든 명령과 견준다.

## 버튼 이름

`JoystickButton0`~`19` 는 자리 그대로다. `Pad.<이름>` 은 지금 패드의 글자이고 SDK 가 자리(`JoystickButton*`)로 바꾼다.

| 자리 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | 아래 | 오른쪽 | 왼쪽 | 위 | 왼 어깨 | 오른 어깨 | 왼 방아쇠 | 오른 방아쇠 | select | start | 왼 스틱 누름 | 오른 스틱 누름 |
| xbox | A | B | X | Y | LB | RB | LT | RT | View | Menu | LS | RS |
| ps5 | Cross | Circle | Square | Triangle | L1 | R1 | L2 | R2 | Create | Options | L3 | R3 |
| ps4 | Cross | Circle | Square | Triangle | L1 | R1 | L2 | R2 | Share | Options | L3 | R3 |
| switch | B | A | Y | X | L | R | ZL | ZR | Minus | Plus | LS | RS |

공통(어느 패드든 · 패드를 안 골라도) — `Up Down Left Right`(12~15) · `LX LY RX RY`(16~19, `power` 가 값). 그 패드에 없는 이름은 거절하고 쓸 수 있는 이름을 답에 적는다. 대소문자는 가리지 않는다.

## 고칠 곳과 차례

1. **문서** — 이 파일 · context-notes 에 실측.
2. **CLI(테스트 먼저)** — `protocol/commands.json`(`pad` · `engines`) · `src/protocol.ts` · `protocol.test.ts` → `fake-game.ts`(패드 상태 · 표 · 거절 · `PadText`) → `game.ts`(`pad()` · ping `input` · `pads`) → `cli.ts`(`pad` · HELP) → `conform.ts`(패드 줄 넷) → `npm run drivers`.
3. **SDK** — `FakePad.cs`(+ `.meta`) · `FakeInputSystem.cs`(패드 부분을 `FakePad` 로) · `ControlServer.cs`(`pad` · `Caps` · ping · `Keys()`) · asmdef `allowUnsafeCode`(상태 칸을 직접 쓰는 두 곳). `FakeInput.Reset()` 은 지금도 키만 떼므로 고치지 않는다.
4. **샘플** — `InputProbe` 가 `PadText` 에 `pad <layout> · ok <확인 글자> · no <취소 글자> · held <자리=글자> · dpad x,y · L x,y · R x,y · LT n · RT n` 을 적는다.
5. **확인** — `npm test` → 컴파일 검사(2021.3 · 2022.3 · 6000.0) → 이 맥 macOS 빌드 conform(Input System · 옛 Input) → Boss Room macOS 빌드 → CI.
6. **끝** — README · `docs/unity/context-notes.md` · 판 번호(CLI 0.15.0 · SDK 0.12.0) · checklist · 진척 페이지.

## conform 패드 줄

종류마다 한 줄 — `pad <종류>` → layout 확인 → 이름표 버튼(`Pad.Cross` → `held south=Cross`, switch 의 `Pad.A` 는 `east=A`) → 십자키(`Pad.Up+Pad.Right` → `dpad 1,1`) → 스틱 부호(`Pad.LX` −1 · `Pad.LY` +1 → `L -1,1`, `Pad.RX` +1 · `Pad.RY` −1 → `R 1,-1`) → 방아쇠 → 다른 플랫폼 이름 거절 → `pad off`. xbox 는 `XInputControllerWindows` · `XboxGamepadMacOSWireless` 둘 다 맞다고 본다.

「C 축 · 조이스틱」 줄은 그대로 둔다 — 옛 Input 빌드와 Godot 표준 화면이 그 줄의 키보드 키로 통과한다(context-notes).

## 이번에 하지 않는 것

- Linux 의 xbox(SDL layout) · WebGL 의 콘솔 패드 — `pads` 에서 빠지고 conform 은 미실행.
- 실물 패드를 꽂은 채의 확인 · `XInputControllerWindows` — C2(CI runner) · C3(PC).
