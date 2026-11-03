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
- 판 — 2021.3.45f1 · 2022.3.62f1 · 6000.0.84f1(Ashveil). 주소는 Release API 에서 받는다(세 판 모두 `LinuxEditorInstaller/Unity-<판>.tar.xz` 확인)
- 패키지 — Input System 1.11.2(`unity: 2019.4` 라 세 판 공통) · TMP 3.0.9(2021/2022 만. Unity 6 은 ugui 2.0 안에 있다)
