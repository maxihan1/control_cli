# Unity 지원 넓히기 — 결정 기록

일하면서 정한 것과 까닭을 붙여 쓴다. 할 일 목록은 [checklist.md](checklist.md).

## 2026-11-03 — 범위 (사용자 질문)

- 사용자 「이 기능들 모두 적용하려고 함 먼저 Unity 먼저 적용하자」 — 엔진 목록(Unreal · Unity · Godot · GameMaker · CryEngine · RPG Maker) 중 Unity 부터
- 지금 SDK 는 Ashveil(Unity 6000.0.84f1 · uGUI 옛 `Text` · 옛 Input · Android) 모양에만 맞는다. Ashveil 은 TMP · 새 Input System · UI Toolkit 을 한 파일도 안 쓴다
- 고른 것 — TMP · 새 Input System · Unity 2021.3/2022.3 LTS · UI Toolkit · 플랫폼 Android + PC + iOS · 검증은 컴파일 검사 + 샘플 실측 · 여러 엔진 구조(`sdk/unity/`)는 나중
- 범위 밖 — `UnityEngine.Input` 전체 이름 호출 · DLL plugin 안 입력 · UI Toolkit `layout` · 키로 축 흉내 · iOS 17 아래

## 2026-11-03 — 계획 검토에서 고친 것

- Input System 은 새 장치를 만들지 않고 `Touchscreen.current` 를 먼저 쓴다 — 새 장치는 PlayerInput 짝짓기 밖이다
- `UnityEngine.TouchPhase` 와 `InputSystem.TouchPhase` 는 숫자가 달라(Began 0 vs 1) 명시적으로 짝짓는다
- UI Toolkit 「옛 Input + EventSystem 없음」은 SDK 가 EventSystem 을 만들지 않고 panel 에 Pointer 이벤트를 보낸다 — 만들면 QA 빌드에서만 `EventSystem.current` 가 달라진다
- 하네스 플랫폼 축은 뺀다 — SDK 에 플랫폼 `#if` 가 없고, 플랫폼 API 차이(예: CS0117 IsJoystickPreconfigured)는 PlaybackEngines DLL 에서 나와 정의로는 못 잡는다
- instrument 의 판 검사는 뺀다 — package.json `"unity"` 로 UPM 이 막는다

## 2026-11-03 — U0 하네스

- Ashveil 하네스는 어셈블리 목록을 손으로 적는다. 여기서는 TMP · Input System 같은 남의 패키지 소스까지 컴파일해야 해서 asmdef 를 읽어 잡는다
- 남의 패키지는 asmdef 참조가 실제와 다르다 — TMP 3.0.9 는 `references: []` 인데 `UnityEngine.UI` 를 쓰고, Input System 은 없는 이름 `Unity.ugui` 를 적는다. 검사 대상이 아니므로 적힌 참조에 `UnityEngine.UI` 를 늘 더해 너그럽게 둔다. SDK · 확인 어셈블리만 적힌 참조 그대로, 건너 참조도 끄고 엄격하게
- SDK · 확인 어셈블리에서 참조로 닿는 어셈블리만 빌드한다 — U0 에서는 TMP · Input System 이 아직 안 닿아 `UnityEngine.UI` 만 함께 빌드된다. U3 · U4 가 참조를 더하면 그때 소스로 빌드된다
- 판 — 2021.3.45f1 · 2022.3.62f1 · 6000.0.84f1(Ashveil). 주소는 Release API 에서 받는다(세 판 모두 `LinuxEditorInstaller/Unity-<판>.tar.xz` 확인)
- 패키지 — Input System 1.11.2(`unity: 2019.4` 라 세 판 공통) · TMP 3.0.9(2021/2022 만. Unity 6 은 ugui 2.0 안에 있다)
- CI 첫 실행(PR #5, run 41595760258) — 9개 구성 모두 성공. 받기 2~6분, 컴파일 30초 안팎

## 2026-11-03 — U1 샘플

- 샘플은 텍스트 파일만 둔다 — Ashveil 도 `ProjectSettings/` 에 `ProjectVersion.txt` 하나만 두고 나머지는 Unity 가 만든다. 장면은 빌드 스크립트가 `NewScene` 으로, 화면은 런타임 스크립트가 `DefaultControls` 로 만든다(판마다 YAML 을 따로 안 둔다)
- SDK 는 `file:` 경로가 아니라 CI 에서 `instrument --ref <PR 머리 커밋>` 으로 넣는다 — 게임 QA 빌드 잡과 같은 길이라 instrument · git UPM 받기까지 같이 본다. 합침 커밋은 UPM 이 못 받을 수 있어 머리 커밋을 쓴다
- Personal 좌석은 취소된 잡에서 반납되지 않을 수 있다(Ashveil D-34) — 취소 안 함 · `max-parallel: 1`
- control_cli 저장소에 Secret 이 없다(2026-11-03 확인). 값은 Ashveil 에서 읽어 올 수 없어 사용자가 넣는다. 없으면 `sample` 은 경고만 남기고 건너뛴다
- 이 셸에 팜 연결값(`PLATFORM_APPIUM_URL` · `PLATFORM_APPIUM_TOKEN`)이 없다 — 실기기 실측 때 사용자에게 받는다

## 2026-11-03 — U2 옛 LTS

- SDK 코드는 고칠 것이 없었다 — U0 하네스가 2021.3 · 2022.3 에서 처음부터 초록이었다. `package.json` 의 `unity` · ugui 의존만 낮춘다
- ugui 는 판에 묶인 core 패키지라 의존을 `1.0.0` 으로 적어도 Unity 6 에서는 2.0.0 이 잡힌다(계획 검토). 샘플 6000.0 빌드의 packages-lock 으로 실측한다
- 샘플 workflow 는 판마다 `ProjectVersion.txt` · manifest ugui 판을 그 판으로 바꿔 연다 — 낮은 판이 높은 판 프로젝트를 여는 내려가기를 피한다

## 2026-11-03 — U3 TextMeshPro

- **TMP 3.0.9 `TMP_InputField.SetText` 는 글자 수 제한 · 거르기 코드가 주석 처리돼 있다** — `text =` 로 넣으면 `characterLimit` · `contentType` 이 안 먹는다. uGUI `InputField` 는 setter 가 둘 다 한다. README 의 「글자 수 제한 · 거르기는 그 칸 규칙대로」를 지키려고 SDK 가 키로 칠 때(`Append`)와 같은 차례로 `onValidateInput` → `CustomValidator`(`inputValidator`) → 내장 `Validate`(protected 라 reflection)를 글자마다 부른다
- `Append` 를 그대로 부르지 않은 까닭 — caret 위치 · `textInfo` 에 기대 초점 없이 부르면 깨지기 쉽다
- TMP 입력칸은 글자 칸 끝에 caret 자리용 `​` 를 붙인다(`m_TextComponent.text = processed + "​"`) — `TextOf` 가 뗀다
- 샘플은 TMP Essential Resources 를 빌드 스크립트가 가져온다 — TMP 소스도 같은 `AssetDatabase.ImportPackage("Packages/<패키지>/Package Resources/…")` 길을 쓴다. 실제 게임은 늘 가지고 있다

## 2026-11-03 — U4 입력

- 답 미루기 일반화는 U6 로 미룬다 — Input System 이벤트가 처리될 때까지 `FakeTouches.Idle` 이 바쁨으로 남으면 지금 `_touching` 길로 충분하다. 스크린샷이 생길 때 필요한 만큼만 넓힌다
- 처리 확인은 `InputState.updateCount` 가 넣을 때보다 커졌는지로 본다 — FixedUpdate 에서 처리하는 게임도 같다
- 옛 Input 마우스 흉내는 `simulateMouseWithTouches`(기본 켜짐)일 때만 — PC 에서도 기본이 켜짐이라 U6 의 「옛 Input 게임 가짜 마우스」가 여기서 같이 풀린다. 뗀 프레임에는 `GetMouseButtonUp` 만 참(Unity 와 같게)
- 샘플 입력 설정은 빌드 스크립트가 `PlayerSettings` 를 직렬화로 고친다(`activeInputHandler`) — 공개 API 가 없고 Input System 패키지 설정 창도 같은 길이다. 같은 실행 안에서 플레이어 컴파일 정의에 먹는지는 샘플 빌드로 확인한다
- 샘플 matrix 는 4개 — 6000.0 옛 Input(Ashveil 모양) · 6000.0 Input System 만 · 2022.3 둘 다 · 2021.3 옛 Input. Personal 좌석이라 차례로 돌아 하나에 수십 분이다

## 2026-11-03 — U5 UI Toolkit

- 게임 오브젝트와 요소를 한 `Item` 으로 담고, 트리 · 이름 찾기 · 경로 찾기 · `PathOf` 가 모두 `ChildrenOf` 하나로 내려간다 — CLI `flatten` 이 트리에서 셈한 경로와 SDK 가 받는 경로가 늘 같아야 한다
- `PathOf` 는 위로 올라가지 않는다 — 요소의 `parent` 사슬에는 트리에 없는 속 칸(ScrollView 내용 칸)이 끼어 아래로 내려간 경로와 어긋난다
- 컨트롤 속은 내보내지 않는다 — 안쪽 요소는 컨트롤의 일부이고, 비밀번호 TextField 속 글자 칸이 실제 글자를 드러낼 수 있다
- 누를 자리 — 공개 `RuntimePanelUtils.ScreenToPanel` 은 내부 `screenToPanelSpace(screen) / scale` 이라(UnityCsReference 2022.3 `Panel.cs`) 위아래 뒤집은 화면 좌표의 1차식이다. 두 점으로 거꾸로 풀어 배율 · 화면 맞춤 여백까지 맞춘다
- EventSystem 이 없는 옛 Input 게임 — 기본 이벤트 시스템은 `UnityEngine.Input` 을 바로 읽는다(`DefaultEventSystem.ProcessTouchEvents`). SDK 가 EventSystem 을 만들면 QA 빌드에서만 `EventSystem.current` 가 달라져, 같은 차례(뒤집기 → `ScreenToPanel` → `GetPooled(touch)` → `visualTree.SendEvent`)로 panel 에 직접 보낸다. 이 길은 샘플에 없어(샘플은 EventSystem 이 있다) 실제 게임에서 본다
- 하네스가 2021.3 에서 CS0104 를 잡았다 — `UnityEngine.UI` 와 `UnityEngine.UIElements` 둘 다 `Button` · `Toggle` · `Slider` 가 있다. UI Toolkit 쪽을 전체 이름으로 쓴다
- `layout` 은 uGUI 만 본다(범위 밖) — UI Toolkit 요소를 범위로 주면 거절한다

## 2026-11-03 — U6 PC

- 답 미루기를 「준비되면 답」 하나로 — `_ready`(준비 전 null) · `_cancel`(시간 초과 때). 터치 · 키 · 스크린샷이 같은 길이다. 람다가 `reply` 변수를 잡아 아래에서 비우면 영원히 null 이라 답을 따로 둔다
- 스크린샷은 `ReadPixels` + `EncodeToJPG(80)` — ScreenCapture 모듈 없이 ImageConversion 하나만 쓴다(`versionDefines` 로 없으면 실패 답). JPEG 라 PNG 보다 몇 배 작다. 팜은 수 MB 를 HTTP 로 나르지 않게 지금처럼 Appium
- Appium 이 없으면 CLI 가 SDK 스크린샷을 쓴다 — PC 뿐 아니라 「USB 로 이미 켠 게임」도 이제 스크린샷이 생긴다
- 키 — 한 프레임 누름 → 한 프레임 뗌. KeyCode 이름만 받는다. `GetKey(string)` 은 KeyCode 와 이름이 일대일이 아니라 섞지 않는다. Unity 는 Android 뒤로 키를 `Escape` 로 줘서 창 훑기의 뒤로 키를 Appium 없이 `key Escape` 로 한다
- Input System 은 standalone 에서 `Touchscreen` 대신 `Mouse` — 둘 다 넣으면 UI 입력 모듈이 두 번 누른다. 플랫폼은 `#if UNITY_STANDALONE` 이 아니라 `Application.isMobilePlatform` 으로 가른다 — 하네스에 플랫폼 축이 없어 `#if` 안은 컴파일 검사를 못 받는다
- 창 초점 — `runInBackground` · Input System `backgroundBehavior = IgnoreFocus`(1.1.0 부터 있어 `CONTROL_CLI_INPUTSYSTEM` 조건을 1.1.0 이상으로 올렸다 · Unity 2021.3 용은 1.3 이상) · uGUI 는 `StandaloneInputModule` 이 `!isFocused` 면 입력을 버려 가짜 터치가 나가는 프레임에 EventSystem 의 `OnApplicationFocus(true)` 를 reflection 으로 부른다(SendMessage 는 같은 오브젝트의 게임 스크립트까지 부른다)
- `open --pc` 는 팜용 `PLATFORM_APP`(APK)을 보지 않는다. macOS `.app` 은 `Contents/MacOS` 안 실행 파일을 바로 띄워야 프로세스 번호를 잡아 `close` 가 끈다
- 샘플 PC 빌드는 Mono — 리눅스 CI 는 mac · Windows IL2CPP 를 못 굽는다

## 2026-11-03 — U7 iOS

- 폰 포트는 usbmuxd 로 명령마다 잇는다 — `/var/run/usbmuxd` 는 누구나 쓸 수 있는 유닉스 소켓(이 맥 확인)이고, plist `Connect`(DeviceID · network byte order 포트)가 `Result 0` 이면 그 소켓이 그대로 폰의 13100 이다. iproxy 처럼 떠 있는 프로세스를 세션마다 맡을 일이 없다
- plist 는 다 풀지 않는다 — 기기마다 Properties 키가 알파벳 차례라 `ConnectionType → DeviceID → SerialNumber` 로 읽는다. 같은 폰이 USB · Wi-Fi 로 두 번 나와 USB 만 고른다
- Connect 답을 읽고 소켓을 `pause()` 해 둔다 — 명시적으로 멈춘 소켓은 `data` listener 를 붙여도 안 흐르므로 `talk` 가 `resume()` 한다
- 깔기 · 켜기 · 끄기는 `xcrun devicectl`(Xcode 15+ · iOS 17+, 이 맥 Xcode 26.3) — Appium XCUITest 의 WebDriverAgent 서명 없이 된다. `install app` 은 `.app` 묶음을 받고, bundle id 는 `plutil` 로 `Info.plist` 에서 읽는다. 결과는 표 대신 `--json-output` 파일을 읽는다(`result.process.processIdentifier`). 실기기 없이 확인 못 한 부분이다
- `open --ios` 는 Android 용 `PLATFORM_APP` · `PLATFORM_DEVICE_UDID` 를 보지 않는다. 뒤로 키가 없어 창 훑기는 `back` 없이 돈다
- 테스트는 libimobiledevice 와 같은 환경값 `USBMUXD_SOCKET_ADDRESS` 로 가짜 usbmuxd 를 띄운다 — Wi-Fi(7) · USB(9) 두 줄에서 9 로, 포트 13100 으로 잇는지 본다
- PC 테스트 스크립트를 `exec sleep` 으로 — `sh` 만 끄면 `sleep` 이 고아로 남는다

## 2026-11-03 — 샘플 첫 빌드 (Secret 등록 뒤, run 41604854616)

- Secret 은 Ashveil 과 같은 CI 전용 Unity 계정으로 사용자가 넣었다(이 맥 Unity Hub 에 로그인된 계정과 같다). 같은 계정이라 Ashveil CI 와 동시에 돌면 좌석을 다툴 수 있다
- 6000.0 · 옛 Input · Android 첫 빌드 초록 — Unity 로그인 · Personal 좌석 받기 · 끝에 돌려주기, instrument 가 PR 머리 커밋(16ff5bc)의 SDK 를 git UPM 으로 받음, IL2CPP 빌드에 `ControlCli.Runtime` · `ControlCli.Input` · `Sample` 이 든다, APK 28MB, SDK 경고 0
- U2 확인 — 의존을 `1.0.0` 으로 적어도 Unity 6 에서 `com.unity.ugui@2.0.0` 이 잡힌다
- **TMP 기본 리소스가 안 들어왔다** — 공개 `AssetDatabase.ImportPackage` 는 `DelayedImportPackageAssets`(UnityCsReference 6000.0 `PackageUtility.bindings.cs`)로 미뤄 가져오고, game-ci 가 빌드 메서드 뒤 Unity 를 꺼 끝내 안 들어온다. 빌드 스크립트가 `.unitypackage`(tar.gz · GUID 폴더마다 asset · asset.meta · pathname — TMP 3.0.9 로 모양 확인)를 직접 풀고 `Refresh(ForceSynchronousImport)` 한다. 자리는 `PackageInfo.FindForAssetPath` 의 실제 폴더로
- 이 고침은 맨 위 U8 에만 넣었다 — U3~U8 을 차례로 올리면 PR 여섯의 샘플 빌드가 한꺼번에 돌아 Personal 좌석을 다툰다. 차례대로 합치면 main 은 맞다

## 2026-11-03 — 첫 실기기 시험 (팜 SM-G996N · 6000.0 옛 Input APK · 커밋 16ff5bc)

- 됨 — 팜 `hold` → 로컬 APK 경로로 `open`(팜 Appium 이 이 맥 파일을 읽는다) → SDK 답. 트리에 uGUI · TMP(`TMP_InputField`) · UI Toolkit(`TextField` · `Button`)이 다 나온다. `type` 결과 — TMP `qauser01` · UI Toolkit `qa_user0`(maxLength 8 · 거르기 없음) · TMP · UI Toolkit 비밀번호 칸 `***` · Ran 줄도 `'***'`. 게임 코드(`TouchProbe`)는 가짜 터치를 받는다
- **SDK 버그 — 가짜 손가락 번호 99** — UI Toolkit 은 터치 손가락을 0~19 만 받아(`PointerId.touchPointerCount`) EventSystem 의 `PanelRaycaster.Raycast` → `PointerDispatchState.GetCapturingElement` 가 `IndexOutOfRangeException` 을 던진다. 그 터치의 EventSystem 처리가 통째로 깨져 **uGUI · UI Toolkit 버튼이 다 안 눌렸다**. Ashveil(0단계)은 UI Toolkit 화면이 없어 몰랐다. 19 로 바꿨다(Input System `touchId` 도 같은 번호)
- 샘플 — UI Toolkit 뿌리가 테마 없이 높이 0 이라 아래 붙임 패널이 화면 밖(안 보임) → 뿌리를 화면 가득으로. `BoxCollider` 를 엔진 코드 줄이기가 빼 큐브 누르기가 안 됨 → 샘플은 `stripEngineCode = false`. 큐브가 분홍(기본 셰이더 빠짐)인 것은 모양뿐이라 두었다
- **열린 결정 — uGUI `type` 의 글자 수 · 거르기 차례** — uGUI `InputField.text` setter 는 먼저 `characterLimit` 로 자르고 거른다: `qa_user01!` → `qa_user0` → `qauser0`(7자). 키로 치면 한 글자씩 걸러 `qauser01`(8자)이고 TMP 는 SDK 가 그 차례로 거른다. uGUI 도 키 입력 차례로 바꿀지(지금 Ashveil 이 쓰는 길이 바뀐다) 사용자에게 묻는다

## 2026-11-03 — 샘플 iOS 빌드 실패 · 가짜 Input 에서 location 뺌

- run 41604854616 의 iOS 잡만 빨강 — `LocationService class is used but Location Usage Description is empty in Player Settings`. 샘플 게임 코드는 위치를 안 쓴다. 가짜 `Input` 이 `UnityEngine.Input` 을 전부 감싸며 `location` 까지 적어 IL 에 LocationService 가 남았다(엔진 코드 줄이기를 켠 16ff5bc 에서도 실패 — 샘플 설정 탓이 아니다)
- 같은 까닭으로 Android QA 빌드는 위치 권한을 얻었다 — 2021.3 APK `aapt dump permissions` 에 `ACCESS_FINE_LOCATION` · `ACCESS_COARSE_LOCATION`. Ashveil QA 빌드도 같았을 것이다
- 고침 — `location` 을 감싸지 않는다. 대가는 `Input.location` 을 적은 게임 파일이 QA 빌드에서만 CS0117(`UnityEngine.Input.location` 으로 적으면 풀림). 위치를 쓰는 게임은 드물고 권한 · iOS 빌드 부작용은 모든 게임에 생겨 빼는 쪽을 골랐다

## 2026-11-03 — uGUI type 차례 (사용자 결정)

- 키 입력 차례로 — uGUI 도 TMP 처럼 SDK 가 글자마다 거르고(`onValidateInput` 이 있으면 그것, 없으면 비공개 `Validate(string, int, char)`) 거른 결과가 `characterLimit` 에 차면 멈춘다. 그 결과를 `text` 에 넣으면 setter 는 이미 맞는 글자라 더 자르지 않는다
- 까닭 — `type` 은 사람이 친 결과를 흉내 낸다. uGUI · TMP 가 같은 답(`qauser01`)을 낸다
- 대가 — Ashveil 이 쓰는 uGUI 길이 바뀐다. 글자 수를 넘는 글자를 거르는 칸에 넣는 케이스만 결과가 달라진다(전에는 더 짧았다). test_platform 다음 줄 1번(Ashveil 회귀)에서 본다
