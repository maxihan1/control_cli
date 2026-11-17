# 게임에 control_cli SDK 붙이기 (개발사용)

QA 빌드에 control_cli SDK 를 넣어 빌드 파일을 넘기는 안내다. 테스트 작성과 실행은 빌드를 받은 쪽이 한다.

- **게임 코드는 고치지 않는다.** SDK 는 게임이 켜질 때 스스로 시작한다. 초기화 호출도, 장면에 놓을 prefab 도 없다
- **QA 빌드에만 들어간다.** define symbol(빌드에 특정 코드를 넣을지 정하는 스위치) `CONTROL_CLI` 가 없는 빌드(Release)에는 SDK 코드가 컴파일되지 않는다
- **기기 안에서만 연다.** SDK 는 `127.0.0.1:13100` 만 열어 기기 밖에서 바로 붙을 수 없다

## 준비

| 무엇 | 조건 |
|---|---|
| Unity | 2021.3 LTS 이상 (2021.3 · 2022.3 · 6000.0) |
| Node.js | 22 이상 — SDK 를 넣는 도구를 돌린다 |
| `control-cli.zip` | 같이 받은 파일. 풀면 `control-cli` 폴더 하나가 나온다 — 따로 깔 것은 없고 인터넷도 쓰지 않는다 |

Godot 게임은 맨 아래 「Godot」 절을 본다.

## 1. SDK 넣기

`control-cli.zip` 을 풀고, Unity 를 켜기 전에 `control-cli` 폴더가 있는 자리에서 한 번 돌린다. 이 한 줄이 연동의 전부다.

```bash
node control-cli/dist/main.js instrument <Unity 프로젝트 폴더>
```

이렇게 나오면 됐다.

```
SDK(0.10.0) 를 Packages/com.maxihan1.control-cli 에 넣었습니다
asmdef 참조 더함: Assets/…/Game.asmdef
정의 심볼 CONTROL_CLI 를 ProjectSettings/ProjectSettings.asset 에 더했습니다 — 이대로 빌드하면 SDK 가 들어갑니다. 이 파일들은 커밋하지 않습니다
```

이 명령이 바꾸는 것은 세 가지다.

- `Packages/com.maxihan1.control-cli/` — SDK 폴더를 새로 넣는다. `Packages/manifest.json` 은 그대로다
- `Assets/` · `Packages/` 아래 게임 asmdef — `references` 에 `ControlCli.Input` 을 더한다(에디터 전용 asmdef 는 건너뛴다)
- `ProjectSettings/ProjectSettings.asset` — define symbol 에 `CONTROL_CLI` 를 더한다

**바뀐 파일은 게임 저장소에 커밋하지 않는다 — 커밋하면 Release 빌드에도 SDK 가 들어간다.** CI 가 있으면 QA 빌드 잡에서만 이 한 줄을 돌리고, 손으로 빌드하면 빌드 뒤에 되돌린다(SDK 폴더는 지우고, Unity 가 고친 `Packages/packages-lock.json` 도 같이).

`경고:` 줄이 나오면 그 파일에서는 터치가 안 먹는다. 아래 「걸릴 수 있는 곳」의 1번을 본다.

## 2. 평소대로 QA 빌드

빌드 스크립트도, 에디터 설정도 고칠 것이 없다. 평소 하던 대로 빌드한다. Release 빌드는 1번을 돌리지 않으면 된다.

다음 두 경우에만 `CONTROL_CLI` 를 직접 더한다.

- 1번의 마지막 줄이 `…고치지 못했습니다` 일 때 — `ProjectSettings.asset` 이 글자 꼴이 아니다(이진 직렬화 · git LFS 를 받지 않은 포인터 파일)
- 빌드 스크립트가 define symbol 을 통째로 바꿔 쓸 때(`PlayerSettings.SetScriptingDefineSymbols`) — 1번이 넣은 값이 지워진다

```csharp
var options = new BuildPlayerOptions
{
    // …기존 설정…
    extraScriptingDefines = new[] { "CONTROL_CLI" },
};
BuildPipeline.BuildPlayer(options);
```

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

이 줄이 없으면 `CONTROL_CLI` 가 빠진 빌드다. 2번의 두 경우를 본다.

명령까지 보내 보려면(선택) 같은 도구로 붙는다. `ping` 이 게임 이름과 SDK 버전을 답하면 된다.

```bash
node control-cli/dist/main.js open --usb      # Android — USB 로 이은 폰에서 켜 둔 게임. PC 빌드는 --pc
node control-cli/dist/main.js ping
node control-cli/dist/main.js close
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

Unity 2021.3 LTS 이상을 받는다. 2020.3 이하는 받지 않는다.

| Unity | 무엇으로 확인했나 |
|---|---|
| 2021.3 · 2022.3 | 바뀔 때마다 컴파일 검사 · 샘플 Android 빌드를 실기기에서 |
| 6000.0 | 바뀔 때마다 컴파일 검사 · 실제 게임(Android)과 샘플(macOS · Linux · WebGL)을 실기기에서 |
| 6000.3 | 샘플 macOS 빌드를 실기기에서(6000.3.10f1) |
| 2023.1 · 2023.2 · 6000.1 · 6000.2 | 확인한 적 없다 — 양옆 버전이 되므로 될 것으로 보지만 처음 붙일 때 문제가 나올 수 있다 |

| 무엇 | 실기기로 확인 | 컴파일만 확인 |
|---|---|---|
| UI | uGUI | TextMeshPro · UI Toolkit |
| 입력 | 옛 Input | Input System |
| 플랫폼 | Android · macOS · Linux · WebGL(Chrome) | Windows · iOS |

「확인한 적 없다」 · 「컴파일만 확인」에 드는 게임은 4번 「넘길 것」의 게임 정보로 미리 가른다.

## Godot

Godot 4.5 이상. 같은 도구가 `project.godot` 를 보고 Godot 로 알아본다.

```bash
node control-cli/dist/main.js instrument <Godot 프로젝트 폴더>
```

`addons/control_cli` 에 애드온을 넣고 `project.godot` 의 `[autoload]` 에 한 줄을 더한다. define symbol 은 없다 — Release 빌드에서는 이 명령을 돌리지 않으면 된다. 바뀐 파일은 Unity 와 같이 커밋하지 않는다.
