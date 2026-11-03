# Unity 지원 넓히기 — 체크리스트

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
- [ ] asmdef 참조 · versionDefines
- [ ] TextOf · TypeText · FindReply
- [ ] 샘플 TMP 화면 · characterLimit 확인

## U4. 입력
- [ ] 옛 Input 마우스 비추기
- [ ] Input System 가짜 터치 · updateCount 확인
- [ ] 답 미루기 일반화
- [ ] 샘플 matrix New · Both

## U5. UI Toolkit
- [ ] 노드 refactoring
- [ ] 트리 · 찾기 · 누를 자리 · 누르기 · type
- [ ] 샘플 UIDocument 화면

## U6. PC
- [ ] `open --pc` · screenshot · key · 포커스
- [ ] 샘플 StandaloneOSX 실측

## U7. iOS
- [ ] usbmuxd 연결 · devicectl
- [ ] iPhone 실측

## U8. 마무리
- [ ] README 지원 표 · help · 0.2.0
- [ ] test_platform 다음 줄 목록
