# 0단계 실측 결과 (2026-10-22 · test_platform 진행판 GAME-F1-03)

직접 만든 SDK 로 Unity 게임을 조작할 수 있는지 실제 폰에서 확인했다. 대상은 Ashveil QA 빌드, 폰은 SM-G996N(Android 15, SIM 없음)이다.

## 결과

| 확인할 것 | 결과 | 근거 |
|---|---|---|
| SDK 가 폰 안 `127.0.0.1` 에 포트를 여나 | 된다 · 포트 13100 | logcat `[ControlCli] 127.0.0.1:13100 에서 명령을 받습니다` · `control-cli ping` → `{"ok":true,"app":"com.nimbusgames.ashveil.qa","version":"0.1.27"}` |
| 트리를 읽나 | 된다 | `control-cli tree` 에 `/Boot/BootCanvas/LoginView/Form/LoginButton` 등 로그인 화면이 다 나온다. 화면은 2400×1080 |
| UI 를 누르나(`LoginButton`) | 된다 | `click LoginButton` → `(1020, 410)` 을 눌러 `StatusText` 가 빈 칸에서 「아이디는 4~16자의 영문 소문자, 숫자, 밑줄만 쓸 수 있습니다.」로 바뀐다. EventSystem `inputOverride` 로 넣은 가짜 터치라 진짜 터치 경로를 지난다 |
| 가짜 `Input` 이 IL2CPP 에서 되나 | 된다 | 게임 어셈블리(`Ashveil.Presentation`) 안 확인용 스크립트가 `Input` 을 `Input, ControlCli.Input` 으로 잡고 `finger=99 phase=Began` → `Ended` 를 받았다. APK 는 IL2CPP(`libil2cpp.so`) |
| 디바이스 팜 Appium 으로 연결을 끊나 | 와이파이는 된다 | 팜 세션에서 `mobile: setConnectivity {wifi:false}` → `Wifi is disabled`, 되돌리면 `Wifi is enabled`. 모바일 데이터는 SIM 이 없어 확인할 수 없다(`getConnectivity` 는 `data:true` 로 남는다) |
| QA 빌드를 어디서 만드나 | Ashveil GitHub Actions | 시험 브랜치 `spike/control-cli-step0` 의 unity-ci 실행 39726824954 — 컴파일 검사 · 테스트 · QA APK 모두 통과. 이 맥에 Unity 를 깔 필요가 없다 |

## 정한 것과 배운 것

1. **게임 포트는 13100** — AltTester 의 13000 과 겹치지 않게 했다
2. **git 으로 받는 UPM 패키지는 `.meta` 를 저장소에 넣어야 한다** — Unity 가 git 패키지 폴더에 `.meta` 를 만들지 못한다. 파일을 더할 때마다 `.meta` 도 같이 넣는다
3. **SDK 는 정의 심볼 `CONTROL_CLI` 가 있을 때만 빌드에 들어간다** — 두 어셈블리 모두 `defineConstraints` 로 묶었다. 릴리스 빌드에는 코드가 아예 없다
4. **아무도 참조하지 않는 런타임 어셈블리는 `[assembly: AlwaysLinkAssembly]` 로 붙잡았다** — IL2CPP 코드 줄이기를 지나 APK 에 남았다
5. **바꿔치기 `Input` 은 전역 이름공간에 둔다** — 게임 파일의 `using UnityEngine;` 보다 이름공간 멤버가 먼저 잡힌다. `using` 을 이름공간 안에 둔 파일은 `UnityEngine.Input` 이 이긴다(GAME-F1-04 에서 확인 대상)
6. 게임이 꺼져 있어도 adb 는 연결을 받았다가 바로 닫는다 — CLI 는 이때 「QA 빌드가 켜져 있나」로 안내한다

## 시험 브랜치에서만 한 것 (GAME-F1-04 가 정식으로)

- `Ashveil.Presentation.asmdef` 에 `ControlCli.Input` 참조를 손으로 더했다 → QA 빌드 스크립트가 자동으로
- `CiBuild.QaInstrumentation` 을 `CONTROL_CLI` 를 더하는 것으로 바꿨다 → AltTester 계측을 걷어내고 정식으로
- 확인용 `Step0InputProbe.cs` → 정식에서는 넣지 않는다
- 워크플로에서 AltTester 단계를 빼고 QA 만 빌드했다

## 아직 안 본 것

- 끌기 · 글자 넣기 · 속성 읽기 · 기다리기 · 스크린샷 (GAME-F1-06 CLI 첫 태그)
- 월드 탭 — 서버가 없어 로그인 뒤로 못 갔다. 가짜 `Input` 은 위 확인용 스크립트로 같은 경로를 확인했다
- 디바이스 팜이 잡을 때 `adb forward` 로 게임 포트를 잇는 것 (GAME-F1-05)
