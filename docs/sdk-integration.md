# control_cli SDK 연동 가이드

control_cli SDK 연동 가이드는 Unity 게임의 QA 빌드에 control_cli SDK를 적용하는 방법을 안내합니다. 본 가이드에 따라 SDK를 적용한 QA 빌드를 생성하여 전달하면, 전달받은 측에서 자동화 테스트를 작성하고 실행합니다.

| 지원 엔진 | 버전 |
|---|---|
| Unity 2021.3 LTS 이상 | CLI 0.14.0 · SDK 0.10.0 |

> 이 문서는 개발사에 넘기는 가이드의 원본입니다. 문체는 NHN Cloud 빠른 시작 가이드를 따릅니다(합니다체 · 조사를 붙여 씀). 넘길 때는 같은 내용의 PDF와 `npm run handoff`가 만든 `control-cli.zip`을 함께 전달합니다.

## 연동 목표

본 가이드에서 수행할 내용은 다음과 같습니다.

1. SDK 적용
2. QA 빌드 생성
3. 적용 결과 확인
4. 빌드 전달

> **알아두기**
>
> - 게임 코드를 수정하지 않습니다. SDK는 게임을 실행하면 자동으로 초기화되며, 초기화 코드를 호출하거나 씬에 프리팹을 배치할 필요가 없습니다.
> - SDK는 QA 빌드에만 포함됩니다. Scripting Define Symbols에 `CONTROL_CLI`가 정의되지 않은 Release 빌드에는 SDK 코드가 컴파일되지 않습니다.
> - SDK는 기기 내부 주소(`127.0.0.1:13100`)에서만 명령을 수신합니다. 기기 외부에서는 직접 접근할 수 없습니다.

## 시작하기 전에

SDK를 연동하기 위해서는 다음 사항을 준비해야 합니다.

- **Unity 프로젝트**
    - Unity 2021.3 LTS 이상 버전을 사용하는 프로젝트여야 합니다.
    - 버전별 지원 여부는 「지원 환경」을 참고하세요.
- **Node.js**
    - Node.js 22 이상 버전이 설치되어 있어야 합니다.
    - SDK 적용 도구를 실행하는 데 사용합니다.
- **control-cli.zip**
    - 본 가이드와 함께 전달받은 파일입니다. 압축을 해제하면 `control-cli` 폴더가 생성됩니다.
    - 별도의 설치 과정과 인터넷 연결이 필요하지 않습니다.

## SDK 연동

### 단계 1. SDK 적용하기

명령어를 한 번 실행하여 Unity 프로젝트에 SDK를 적용합니다.

1. `control-cli.zip` 파일의 압축을 해제합니다.
2. Unity 에디터가 실행 중이면 종료합니다.
3. 터미널에서 `control-cli` 폴더가 있는 경로로 이동한 후 아래 명령어를 실행합니다.

```bash
node control-cli/dist/main.js instrument <Unity 프로젝트 폴더>
```

`<Unity 프로젝트 폴더>`에는 `Assets` 폴더와 `Packages` 폴더가 있는 경로를 입력합니다. Windows, macOS, Linux에서 동일한 명령어를 사용합니다.

아래와 같은 내용이 출력되면 SDK 적용이 완료된 것입니다.

```
SDK(0.10.0)를 Packages/com.maxihan1.control-cli에 추가했습니다
asmdef 참조 추가: Assets/…/Game.asmdef
Scripting Define Symbols에 CONTROL_CLI를 추가했습니다(ProjectSettings/ProjectSettings.asset). 이대로 빌드하면 SDK가 포함됩니다. 변경된 파일은 커밋하지 마십시오.
```

#### 변경되는 항목

명령어를 실행하면 Unity 프로젝트의 다음 항목이 변경됩니다.

| 대상 | 변경 내용 |
|---|---|
| `Packages/com.maxihan1.control-cli/` | SDK 폴더가 추가됩니다. `Packages/manifest.json` 파일은 변경되지 않습니다. |
| 게임의 asmdef 파일(`Assets/`, `Packages/` 하위) | `references`에 `ControlCli.Input`이 추가됩니다. 에디터 전용 asmdef 파일은 변경되지 않습니다. |
| `ProjectSettings/ProjectSettings.asset` | Scripting Define Symbols에 `CONTROL_CLI`가 추가됩니다. |

> **주의**
>
> - 변경된 항목을 게임 저장소에 커밋하지 않습니다. 커밋할 경우 Release 빌드에도 SDK가 포함됩니다.
> - CI를 사용하는 경우 QA 빌드 작업에서만 위 명령어를 실행합니다.
> - 수동으로 빌드하는 경우 빌드를 완료한 후 변경 사항을 되돌립니다. 추가된 SDK 폴더를 삭제하고, Unity가 수정한 `Packages/packages-lock.json` 파일도 함께 되돌립니다.

> **알아두기**
>
> - 출력 내용에 `경고:`로 시작하는 줄이 있으면 해당 파일에서는 터치 입력이 전달되지 않습니다. 「제약 사항」의 1번 항목을 참고하세요.

### 단계 2. QA 빌드 생성하기

기존과 동일한 방법으로 QA 빌드를 생성합니다. 빌드 스크립트와 에디터 설정을 변경할 필요가 없습니다.

> **알아두기**
>
> - Release 빌드는 단계 1을 수행하지 않은 상태에서 생성합니다. 단계 1을 수행하지 않으면 SDK가 포함되지 않습니다.

#### CONTROL_CLI를 직접 추가해야 하는 경우

다음에 해당하는 경우에는 빌드 스크립트에서 `CONTROL_CLI`를 직접 추가해야 합니다.

- 단계 1의 출력 마지막 줄에 `수정하지 못했습니다`가 포함된 경우입니다. `ProjectSettings.asset` 파일이 텍스트 형식이 아닐 때 발생합니다(바이너리 직렬화를 사용하거나 Git LFS 파일을 내려받지 않은 경우).
- 빌드 스크립트에서 `PlayerSettings.SetScriptingDefineSymbols`로 Scripting Define Symbols를 덮어쓰는 경우입니다. 단계 1에서 추가된 값이 삭제됩니다.

```csharp
var options = new BuildPlayerOptions
{
    // 기존 설정
    extraScriptingDefines = new[] { "CONTROL_CLI" },
};
BuildPipeline.BuildPlayer(options);
```

### 단계 3. 적용 결과 확인하기

1. 생성한 빌드를 실행합니다.
2. 로그에 아래 메시지가 출력되는지 확인합니다.

```
[ControlCli] 127.0.0.1:13100 에서 명령을 받습니다
```

메시지가 출력되지 않으면 `CONTROL_CLI`가 정의되지 않은 빌드입니다. 단계 2의 「CONTROL_CLI를 직접 추가해야 하는 경우」를 확인합니다.

#### 플랫폼별 로그 확인 위치

| 플랫폼 | 확인 위치 |
|---|---|
| Android | `adb logcat -s Unity` |
| macOS | `~/Library/Logs/<회사명>/<제품명>/Player.log` |
| Windows | `%USERPROFILE%\AppData\LocalLow\<회사명>\<제품명>\Player.log` |
| iOS | Xcode 콘솔 |
| WebGL | 브라우저 콘솔. WebGL 빌드는 포트를 열 수 없으므로 `[ControlCli] relay`로 시작하는 메시지가 대신 출력됩니다. |

#### 명령 전송 확인하기 (선택)

빌드를 실행한 상태에서 아래 명령어를 순서대로 실행합니다. `ping` 명령어의 결과로 게임 이름과 SDK 버전이 출력되면 정상입니다.

```bash
node control-cli/dist/main.js open --usb
node control-cli/dist/main.js ping
node control-cli/dist/main.js close
```

> **알아두기**
>
> - `open --usb`는 USB로 연결한 Android 기기에서 실행 중인 게임에 연결합니다.
> - PC 빌드는 `open --usb` 대신 `open --pc`를 사용합니다.

### 단계 4. 빌드 전달하기

다음 항목을 전달합니다.

- **빌드 파일**: Android는 APK 파일, PC는 빌드 폴더 전체(`.app` 또는 `.exe` 파일과 `_Data` 폴더), WebGL은 빌드 폴더 전체를 전달합니다.
- **단계 1의 명령어 출력 내용**: `경고:`로 시작하는 줄을 포함하여 출력 내용 전체를 전달합니다.
- **게임 정보**: Unity 버전, 입력 방식(Input Manager, Input System, 둘 다 사용), UI 구성(uGUI, TextMesh Pro, UI Toolkit)을 전달합니다.

> **알아두기**
>
> - Android 빌드는 빌드할 때마다 versionCode를 증가시켜야 합니다. versionCode가 동일하면 테스트 기기에 새 빌드가 설치되지 않습니다.
> - iOS 빌드는 테스트 기기에서 실행할 수 있도록 서명된 `.app` 파일이 필요하므로 사전에 협의해야 합니다.

## 제약 사항

SDK는 QA 빌드에서 `UnityEngine.Input`을 동일한 이름의 대체 클래스로 바꾸어 터치 입력을 전달합니다. 이로 인해 다음에 해당하는 경우 터치 입력이 전달되지 않거나 QA 빌드에서 컴파일 오류가 발생할 수 있습니다.

| 번호 | 해당하는 경우 | 증상 | 조치 방법 |
|---|---|---|---|
| 1 | `namespace` 블록 안에 `using UnityEngine;`을 선언한 파일, 또는 `namespace UnityEngine.*` 안에 작성한 파일 | 터치 입력이 전달되지 않습니다. | `using UnityEngine;`을 파일 최상단으로 이동합니다. 해당 파일은 단계 1의 출력에서 `경고:`로 안내됩니다. |
| 2 | `UnityEngine.Input.GetTouch()`와 같이 전체 이름으로 호출하는 코드 | 터치 입력이 전달되지 않습니다. | `Input.GetTouch()`와 같이 수정합니다. |
| 3 | DLL 플러그인 내부의 입력 처리 | 터치 입력이 전달되지 않습니다. | 지원하지 않습니다. |
| 4 | 펜 입력, `Input.mousePositionDelta`, `Input.location`을 사용하는 코드 | QA 빌드에서 컴파일 오류가 발생합니다. | `location`은 `UnityEngine.Input.location`으로 수정합니다. 그 외 항목은 사용 중인 항목을 전달하면 SDK에 추가합니다. |
| 5 | `Assets/Plugins` 폴더의 스크립트에서 4번 항목을 사용하는 경우 | QA 빌드에서 컴파일 오류가 발생합니다. | 4번 항목과 동일합니다. |

> **알아두기**
>
> - Input System 패키지만 사용하는 게임은 `Touchscreen` 장치 이벤트로 터치 입력을 전달하므로 1번, 2번 항목의 영향을 받지 않습니다.

## 지원 환경

#### Unity 버전

Unity 2021.3 LTS 이상 버전을 지원합니다.

| Unity 버전 | 지원 여부 | 검증 내용 |
|---|---|---|
| 2020.3 이하 | 미지원 | - |
| 2021.3 LTS, 2022.3 LTS | 지원 | 컴파일 검사를 수행하며, Android 샘플 빌드를 실제 기기에서 검증했습니다. |
| 2023.1, 2023.2 | 미검증 | 검증하지 않은 버전입니다. 인접 버전에서 정상 동작하므로 동작할 것으로 예상하지만, 최초 적용 시 문제가 발생할 수 있습니다. |
| 6000.0 | 지원 | 컴파일 검사를 수행하며, 실제 게임(Android)과 샘플 빌드(macOS, Linux, WebGL)를 실제 기기에서 검증했습니다. |
| 6000.1, 6000.2 | 미검증 | 검증하지 않은 버전입니다. 인접 버전에서 정상 동작하므로 동작할 것으로 예상하지만, 최초 적용 시 문제가 발생할 수 있습니다. |
| 6000.3 | 지원 | 샘플 빌드(macOS)를 실제 기기에서 검증했습니다(6000.3.10f1). |

#### 구성 요소

| 구분 | 실제 기기 검증 완료 | 컴파일 검사만 완료 |
|---|---|---|
| UI | uGUI | TextMesh Pro, UI Toolkit |
| 입력 | Input Manager | Input System |
| 플랫폼 | Android, macOS, Linux, WebGL(Chrome) | Windows, iOS |

> **알아두기**
>
> - 미검증 버전 또는 컴파일 검사만 완료된 구성 요소를 사용하는 경우, 단계 4의 게임 정보를 사전에 전달하면 먼저 검증을 진행합니다.
