# 게임에 control_cli SDK 붙이기 (개발사용)

QA 빌드에 control_cli SDK 를 넣어 빌드 파일을 넘기는 안내다. 테스트 작성과 실행은 빌드를 받은 쪽이 한다.

- **게임 코드는 고치지 않는다.** SDK 는 게임이 켜질 때 스스로 시작한다. 초기화 호출도, 장면에 놓을 prefab 도 없다
- **QA 빌드에만 들어간다.** define symbol `CONTROL_CLI` 가 없는 빌드(Release)에는 SDK 코드가 컴파일되지 않는다
- **기기 안에서만 연다.** SDK 는 `127.0.0.1:13100` 만 열어 기기 밖에서 바로 붙을 수 없다

## 준비

| 무엇 | 조건 |
|---|---|
| Unity | 2021.3 LTS 이상 (2021.3 · 2022.3 · 6000.0) |
| Node.js | 22 이상 — SDK 를 넣는 도구를 돌린다 |
| git | 빌드 기계에서 `github.com` 에 닿아야 한다 — Unity 가 SDK 패키지를 git 주소로 받는다 |

Godot 게임은 맨 아래 「Godot」 절을 본다.

## 1. SDK 넣기

Unity 를 켜기 전에 한 번 돌린다.

```bash
git clone -q --depth 1 --branch v0.13.0 https://github.com/maxihan1/control_cli.git /tmp/control_cli
npm --prefix /tmp/control_cli ci
node /tmp/control_cli/dist/main.js instrument <Unity 프로젝트 폴더>
```

이렇게 나오면 됐다.

```
SDK(v0.13.0) 를 Packages/manifest.json 에 더했습니다
asmdef 참조 더함: Assets/…/Game.asmdef
QA 빌드 정의 심볼에 CONTROL_CLI 가 있어야 SDK 가 빌드에 들어갑니다
```

이 명령이 바꾸는 파일은 두 가지다.

- `Packages/manifest.json` — SDK 패키지 `com.maxihan1.control-cli` 한 줄을 더한다
- `Assets/` · `Packages/` 아래 게임 asmdef — `references` 에 `ControlCli.Input` 을 더한다(에디터 전용 asmdef 는 건너뛴다)

**바뀐 파일은 게임 저장소에 커밋하지 않는다.** CI 가 있으면 QA 빌드 잡에서만 이 세 줄을 돌리고, 손으로 빌드하면 빌드 뒤에 되돌린다(Unity 가 고친 `Packages/packages-lock.json` 도 같이).

`경고:` 줄이 나오면 그 파일에서는 터치가 안 먹는다. 아래 「걸릴 수 있는 곳」의 1번을 본다.

## 2. QA 빌드에 `CONTROL_CLI` 켜기

빌드 스크립트가 있으면 한 줄을 더한다.

```csharp
var options = new BuildPlayerOptions
{
    // …기존 설정…
    extraScriptingDefines = new[] { "CONTROL_CLI" },
};
BuildPipeline.BuildPlayer(options);
```

에디터에서 손으로 빌드하면 Edit → Project Settings → Player → Other Settings → Scripting Define Symbols 에 `CONTROL_CLI` 를 더한다. 이 값도 커밋하지 않는다.

Release 빌드는 아무것도 하지 않으면 된다.

## 3. 들어갔는지 확인

빌드한 게임을 켜고 로그에서 이 줄을 찾는다.

```
[ControlCli] 127.0.0.1:13100 에서 명령을 받습니다
```

| 플랫폼 | 로그 보는 곳 |
|---|---|
| Android | `adb logcat -s Unity` |
| macOS | `~/Library/Logs/<회사>/<제품>/Player.log` |
| Windows | `%USERPROFILE%\AppData\LocalLow\<회사>\<제품>\Player.log` |
| iOS | Xcode 콘솔 |
| WebGL | 브라우저 콘솔 — 포트를 못 열어 `[ControlCli] relay …` 줄이 대신 나온다 |

이 줄이 없으면 `CONTROL_CLI` 가 빠진 빌드다.

명령까지 보내 보려면(선택) 같은 도구로 붙는다. `ping` 이 게임 이름과 SDK 버전을 답하면 된다.

```bash
node /tmp/control_cli/dist/main.js open --usb      # Android — USB 로 이은 폰에서 켜 둔 게임. PC 빌드는 --pc
node /tmp/control_cli/dist/main.js ping
node /tmp/control_cli/dist/main.js close
```

## 4. 넘길 것

1. **빌드 파일** — Android 는 APK, PC 는 빌드 폴더(`.app` · `.exe` 와 `_Data`), WebGL 은 빌드 폴더
2. **`instrument` 가 찍은 글 전부** — `경고:` 줄 포함
3. **게임 정보** — Unity 버전, 입력(옛 Input · Input System · 둘 다), UI(uGUI · TextMeshPro · UI Toolkit)

Android 는 빌드마다 versionCode 를 올린다. 같은 값이면 테스트 기기에 새 빌드가 깔리지 않는다.
iOS 는 받는 쪽 기기에서 켜지게 서명한 `.app` 이어야 해서 먼저 상의한다.

## 걸릴 수 있는 곳

SDK 는 빌드 때 `Input` 을 이름이 같은 가짜로 바꿔 터치를 넣는다. 그래서 다음 경우에 터치가 안 먹거나 QA 빌드만 컴파일이 깨진다.

1. **`namespace` 안에 `using UnityEngine;` 을 둔 파일 · `namespace UnityEngine.*` 안의 파일** — 진짜 `Input` 이 먼저 잡힌다. `instrument` 가 `경고:` 로 파일 이름을 알려 준다. `using UnityEngine;` 을 파일 맨 위로 옮긴다
2. **`UnityEngine.Input.GetTouch(…)` 처럼 전체 이름으로 부르는 곳** — 가짜를 거치지 않는다. `Input.GetTouch(…)` 로 적는다
3. **DLL plugin 안의 입력 처리** — 가로채지 못한다
4. **펜 · `mousePositionDelta` · `location`** — 가짜 `Input` 에 없어 QA 빌드에서 컴파일이 깨진다. `location` 은 `UnityEngine.Input.location` 으로 적고, 나머지는 알려 주면 SDK 에 더한다
5. **`Assets/Plugins` 의 스크립트** — 같은 가짜 `Input` 을 보므로 4번과 같은 멤버를 쓰면 QA 빌드만 깨진다

새 Input System 만 쓰는 게임은 `Touchscreen` 장치 이벤트로 넣어 위 1 · 2번과 상관없다.

## 확인된 범위

| 무엇 | 실기기로 확인 | 컴파일만 확인 |
|---|---|---|
| Unity | 6000.0 | 2021.3 · 2022.3 |
| UI | uGUI | TextMeshPro · UI Toolkit |
| 입력 | 옛 Input | Input System |
| 플랫폼 | Android · macOS · Linux · WebGL(Chrome) | Windows · iOS |

「컴파일만 확인」 칸의 게임은 처음 붙일 때 문제가 나올 수 있다. 4번 「넘길 것」의 게임 정보로 미리 가른다.

## Godot

Godot 4.5 이상. 같은 도구가 `project.godot` 를 보고 Godot 로 알아본다.

```bash
node /tmp/control_cli/dist/main.js instrument <Godot 프로젝트 폴더>
```

`addons/control_cli` 에 애드온을 넣고 `project.godot` 의 `[autoload]` 에 한 줄을 더한다. define symbol 은 없다 — Release 빌드에서는 이 명령을 돌리지 않으면 된다. 바뀐 파일은 Unity 와 같이 커밋하지 않는다.
