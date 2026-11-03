# Unity 지원 넓히기 — 체크리스트

## ▶ 다음 세션은 여기부터 (2026-11-03 세션 끝)

- 코드 · PR — U0~U8 이 draft PR #5~#13 으로 쌓여 있다(브랜치 `unity-u0` … `unity-u8`, 맨 위 `unity-u8` 에서 이어 일한다). 맨 위에만 넣은 고침(TMP 리소스 직접 풀기 · 손가락 19 · 샘플 두 고침)은 차례로 합치면 main 에 들어간다
- 샘플 빌드 — `unity-u8` push 로 PR #13 의 `sample` 이 새로 돈다(좌석 하나 · 7개 · 1~2시간). 그 APK 로 아래 실측을 다시 한다. 결과물은 `gh run download <run> -R maxihan1/control_cli`
- 실측 차례 — 팜 `hold --udid R3CR10TCVCD` → `open --app <APK 경로>` → `type IdInput/TmpIdInput/UitkIdInput 'qa_user01!'` → `click LoginButton/TmpLoginButton/UitkLoginButton`(상태 글자 바뀌나) → `drag Item /SampleCanvas/Bag/Slot[3]` → `click WorldCube`(TouchText `cube 1`) → `key I`(TouchText `key I`) → `errors` → `close` · `release`. APK 넷(6000.0 옛 Input · 6000.0 Input System · 2022.3 둘 다 · 2021.3 옛 Input)마다. macOS 앱은 이 맥에서 `open --pc --app`
- 팜 연결값 — `PLATFORM_APPIUM_URL=https://vision.maxihan.com/wd/hub` · `PLATFORM_APPIUM_TOKEN`(팜 PAT `pat_…`, 사용자에게 받는다 — 저장소에 적지 않는다)
- ~~열린 결정 — uGUI `type` 의 글자 수 · 거르기 차례~~ → 키 입력 차례로 정함(사용자, [context-notes](context-notes.md) 「uGUI type 차례」)

계획: TMP · 새 Input System · Unity 2021.3/2022.3 LTS · UI Toolkit · PC · iOS (2026-11-03 사용자 선택). 결정과 까닭은 [context-notes.md](context-notes.md).
한 줄(U번호)이 브랜치 하나 · PR 하나다.

## U0. 컴파일 검사 하네스
- [x] `tools/unity-compile-check/check.py` — 받기(`fetch`) · 컴파일 · 구성 9개(판 셋 × 입력 셋)
- [x] asmdef 를 읽어 어셈블리를 잡는다 — SDK 는 적힌 참조만, 남의 패키지는 적힌 참조 + `UnityEngine.UI`. SDK 에서 닿는 것만 빌드
- [x] `versionDefines` 식(`Unity` · 패키지 판 범위) 흉내
- [x] 게임 쪽 확인 어셈블리(`probe/`)
- [x] `src/sdk-meta.test.ts` — `.meta` 빠짐 · 남은 `.meta` · guid 겹침
- [x] `.github/workflows/sdk-compile.yml`
- [x] 실제로 돌려 9개 초록 (이 맥 Docker 또는 CI)

## U1. 샘플 Unity 프로젝트 + 실측 CI
- [x] `sample/` 빌드 스크립트 · 런타임 화면
- [x] `.github/workflows/sample.yml` (Unity 6 · uGUI · 옛 Input · Android)
- [ ] Secret 등록 뒤 샘플 빌드 초록 (사용자 — `UNITY_EMAIL` · `UNITY_PASSWORD`)
- [ ] 팜 폰 CLI 루프 (팜 연결값 필요)

## U2. Unity 2021.3 · 2022.3 LTS
- [x] `sdk/package.json` 판 · ugui 의존
- [x] 컴파일 차이 고치기 — 없었다(U0 에서 이미 초록)
- [x] 샘플 matrix (2021.3 · 2022.3 · 6000.0)
- [ ] 샘플 세 판 빌드 · 6000.0 packages-lock 의 ugui 2.0.0 확인

## U3. TextMeshPro
- [x] asmdef 참조 · versionDefines
- [x] TextOf · TypeText · FindReply
- [x] 샘플 TMP 화면
- [x] uGUI `type` 도 키 입력 차례로 거른다(`UguiFiltered` — 첫 실기기 시험에서 uGUI 만 `qauser0`)
- [ ] 샘플에서 `type IdInput 'qa_user01!'` · `type TmpIdInput 'qa_user01!'` 가 둘 다 `qauser01`

## U4. 입력
- [x] 옛 Input 마우스 비추기
- [x] Input System 가짜 터치 · updateCount 확인
- [ ] 답 미루기 일반화 — U6 로 미룸(U4 는 Idle 로 충분)
- [x] 샘플 matrix New · Both
- [ ] 샘플 Input System 빌드에서 click · drag · TouchText

## U5. UI Toolkit
- [x] 노드 refactoring
- [x] 트리 · 찾기 · 누를 자리 · 누르기 · type
- [x] 샘플 UIDocument 화면
- [ ] 샘플에서 `tree` 의 `UitkDocument/UitkPanel/…` · `type UitkIdInput` · `click UitkLoginButton`
- [ ] EventSystem 없는 옛 Input 게임에서 panel 직접 보내기 (샘플에 없음 — 실제 게임)

## U6. PC
- [x] 답 미루기 일반화(`_ready` · `_cancel`)
- [x] `open --pc` · screenshot · key · 포커스
- [x] CLI 테스트 — PC 열기 · jpg 스크린샷 · key Ran 줄 · close 가 게임 끔
- [x] 샘플 StandaloneOSX · StandaloneWindows64 matrix
- [ ] 샘플 StandaloneOSX 실측 (이 맥 — 샘플 빌드 뒤)

## U7. iOS
- [x] usbmuxd 연결(`src/usbmux.ts` · `iosLink`)
- [x] devicectl 깔기 · 켜기 · 끄기(`src/devicectl.ts`)
- [x] CLI 테스트 — 가짜 usbmuxd 로 열기 · 누르기 · jpg 스크린샷 · 없는 UDID 거절
- [x] 샘플 iOS(Xcode 프로젝트) matrix
- [x] 가짜 `Input` 에서 `location` 뺌 — iOS 빌드가 위치 사용 문구를 요구해 깨지고 Android 는 위치 권한이 붙었다
- [ ] 샘플 iOS 빌드 초록 · Android APK 에 위치 권한 없음(`aapt dump permissions`)
- [ ] iPhone 실측 (사용자 — iOS 17+ iPhone · Apple 팀 서명)

## U8. 마무리
- [x] README 지원 표(실기기 확인 / 컴파일만 확인을 나눠) · 개발 절 · help · CLI · SDK 판 0.2.0
- [x] test_platform 다음 줄 목록 (아래)
- [ ] 합친 뒤 `v0.2.0` 태그 (사용자 — main 에 합친 뒤)

### test_platform 다음 줄 (이 저장소에서는 고치지 않는다)
1. **Ashveil 회귀 한 번** — QA 빌드 `instrument --ref` 를 0.2.0 으로 올려 스모크 · 회귀를 돈다. U5 트리 refactoring(`Item` · 경로를 내려가며 셈)과 U6 답 미루기 일반화가 지금 쓰는 uGUI · 옛 Input 길을 지난다. QA 빌드에 붙던 위치 권한(`ACCESS_FINE_LOCATION` · `ACCESS_COARSE_LOCATION`)이 빠진다
2. 명세 `docs/spec/도메인/게임.md` 「1차 밖」 — 새 Input System · iOS · Unity 6 밖의 판을 뺀다(Unreal 은 남는다). 결정 2 의 「새 Input System · DLL 플러그인 · 전체 이름 호출은 1차 밖」에서 새 Input System 을 뺀다
3. kit `packages/kit/src/runtime/game.ts` — `PLATFORM_GAME_LINK` 에 `pc` · `ios` (`tcpLink` · `iosLink`). 러너 — iOS · PC 게임 케이스는 팜이 없어 내 컴퓨터 테스트 실행만
4. 작성 지침(`tpx-cases` 게임 갈래) — `game.key()` · UI Toolkit 주소 꼴(`/UitkDocument/…`) · TMP 칸도 `type` 이 거른다는 것
5. 디바이스 팜 iOS(Devicefarm Phase 5 · D7) — 팜이 iOS 를 받으면 `iosLink` 자리에 팜 길을 더한다
