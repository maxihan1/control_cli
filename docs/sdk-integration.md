# QA Hub SDK 연동 가이드

Unity 게임의 QA 빌드에 QA Hub SDK를 넣는 방법입니다. 명령 한 줄을 실행하고 평소처럼 빌드해서 보내 주시면 됩니다.

## 준비물

- Unity 2021.3 LTS 이상으로 만든 Android 게임 프로젝트
- Node.js 22 이상
- QAhub.zip (이 가이드와 함께 받은 파일)

## 1. SDK 넣기

1. QAhub.zip의 압축을 풉니다. QAhub 폴더가 생깁니다.
2. Unity 에디터를 닫습니다.
3. 터미널에서 QAhub 폴더가 있는 위치로 이동해 아래 명령을 실행합니다.

```
node QAhub/dist/main.js instrument <Unity 프로젝트 폴더>
```

`<Unity 프로젝트 폴더>` 자리에는 프로젝트 폴더의 경로를 씁니다. Assets 폴더와 Packages 폴더가 들어 있는 폴더입니다.

아래처럼 나오면 끝난 것입니다.

```
QA Hub SDK(0.11.0)를 Packages/QAHubSDK에 추가했습니다
asmdef 참조 추가: Assets/…/Game.asmdef
QA 빌드 설정을 ProjectSettings/ProjectSettings.asset에 추가했습니다. 이대로 빌드하면 SDK가 들어갑니다. 바뀐 파일은 커밋하지 마세요.
```

이 명령은 프로젝트에서 세 군데를 바꿉니다.

| 바뀌는 곳 | 내용 |
|---|---|
| `Packages/QAHubSDK` 폴더 | SDK가 들어 있는 폴더가 새로 생깁니다. |
| 게임의 asmdef 파일 | SDK를 참조하는 줄이 하나 늘어납니다. |
| `ProjectSettings/ProjectSettings.asset` | QA 빌드에만 SDK를 넣는 설정이 들어갑니다. |

**주의**

- 바뀐 내용은 게임 저장소에 커밋하지 마세요. 커밋하면 출시 빌드에도 SDK가 들어갑니다.
- 빌드 서버를 쓴다면 QA 빌드를 만들 때만 이 명령을 실행합니다.
- 직접 빌드한다면 빌드가 끝난 뒤 바뀐 내용을 되돌립니다. 새로 생긴 `Packages/QAHubSDK` 폴더도 지웁니다.

출력에 `경고:`로 시작하는 줄이 있으면 그 파일에서는 터치 입력이 들어가지 않습니다. 고치는 방법은 아래 「알려진 제약」 1번에 있습니다.

## 2. QA 빌드 만들기

평소 하던 대로 QA 빌드를 만듭니다. 빌드 스크립트나 에디터 설정은 건드리지 않아도 됩니다.

출시 빌드는 1번 명령을 실행하지 않은 프로젝트에서 만듭니다. 그러면 SDK가 들어가지 않습니다.

아래 두 가지 중 하나라도 맞으면 빌드하기 전에 알려 주세요.

- 1번 명령의 출력에 `고치지 못했습니다`라는 말이 있을 때
- 빌드 스크립트가 Scripting Define Symbols를 직접 덮어쓸 때

## 3. 빌드 보내기

아래 세 가지를 보내 주세요.

- **빌드 파일**: Android APK
- **1번 명령의 출력**: 화면에 나온 내용 전부
- **게임 정보**: Unity 버전, 입력 방식(Input Manager, Input System, 둘 다), 사용하는 UI(uGUI, TextMesh Pro, UI Toolkit)

빌드할 때마다 versionCode를 올려 주세요. 값이 같으면 테스트 기기에 새 빌드가 깔리지 않습니다.

## 알려진 제약

SDK는 QA 빌드에서 Unity의 `Input` 클래스를 이름이 같은 클래스로 바꿔 터치 입력을 넣습니다. 그래서 아래 코드에서는 터치가 들어가지 않거나 QA 빌드에서 컴파일 오류가 납니다.

| 번호 | 코드 | 증상 | 고치는 방법 |
|---|---|---|---|
| 1 | `namespace` 블록 안에 `using UnityEngine;`을 쓴 파일, `namespace UnityEngine.*` 안에 있는 파일 | 터치가 들어가지 않습니다. | `using UnityEngine;`을 파일 맨 위로 옮깁니다. |
| 2 | `UnityEngine.Input.GetTouch()`처럼 전체 이름으로 부르는 코드 | 터치가 들어가지 않습니다. | `Input.GetTouch()`로 바꿉니다. |
| 3 | DLL 플러그인 안에서 입력을 읽는 코드 | 터치가 들어가지 않습니다. | 고칠 방법이 없습니다. |
| 4 | 펜 입력, `Input.mousePositionDelta`, `Input.location`을 쓰는 코드(`Assets/Plugins` 폴더의 스크립트 포함) | QA 빌드에서 컴파일 오류가 납니다. | `Input.location`은 `UnityEngine.Input.location`으로 바꿉니다. 나머지는 알려 주시면 SDK에 넣겠습니다. |

Input System만 쓰는 게임은 1번, 2번과 상관없습니다.

## 지원하는 Unity 버전

| Unity 버전 | 지원 여부 |
|---|---|
| 2021.3 LTS, 2022.3 LTS, 6000.0, 6000.3 | 지원합니다. |
| 2023.1, 2023.2, 6000.1, 6000.2 | 아직 확인하지 못했습니다. 앞뒤 버전에서 문제가 없었으니 아마 될 것입니다. 그래도 이 버전을 쓴다면 미리 알려 주세요. |
| 2020.3 이하 | 지원하지 않습니다. |
