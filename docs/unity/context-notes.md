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
- 판 — 2021.3.45f1 · 2022.3.62f1 · 6000.0.84f1(Ashveil). 주소는 Release API 에서 받는다(세 판 모두 `LinuxEditorInstaller/Unity-<판>.tar.xz` 확인)
- 패키지 — Input System 1.11.2(`unity: 2019.4` 라 세 판 공통) · TMP 3.0.9(2021/2022 만. Unity 6 은 ugui 2.0 안에 있다)
