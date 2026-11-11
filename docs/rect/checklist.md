# 오브젝트 화면 사각형 · 화면 찍기 실측 — 체크리스트

## ▶ 다음 세션은 여기부터 (2026-11-11 끝)
- 코드 · 실측 끝 — 브랜치 `find-rect` · draft PR #23. 남은 것은 사용자 몫: PR 합치기 → main 에 `v0.8.0` 태그 → test_platform 이 `github:maxihan1/control_cli#v0.8.0` 으로 올린다
- 팜은 못 쓴다 — 사람 PAT 폐지(2026-11-04). control-cli 에 CLI 브라우저 로그인을 넣는 일이 따로 있어야 팜 hold · open 이 다시 된다

계획: `~/.claude/plans/control-cli-rect.md`(2026-11-11). 결정과 까닭은 [context-notes.md](context-notes.md). 브랜치 `find-rect` · PR #23.

## 1. find 답에 화면 사각형
- [x] SDK `Found` 에 `rect: [x, y, w, h]` · `screen: [w, h]` — uGUI · UI Toolkit 은 `ScreenRect`, 월드 오브젝트는 bounds 꼭짓점 8개 비추기(near 면 자르기 · `camera` 칸)
- [x] `commands.json` 에 `features`(`rect`) · SDK `Caps` 끝에 `rect` · `protocol.test.ts`
- [x] TS `Found` · 가짜 게임 · conform 줄 「find 의 rect 가 x,y 를 품는다」 · 옛 SDK 면 미실행
- [x] README · SDK · CLI 0.8.0
- [x] CI SDK 컴파일 검사(판 셋 × 입력 셋) 초록 — run 42949245903
- [x] 샘플 빌드로 conform 실측 — rect 줄 통과(RF9R408GKRR USB · 52/0/1)

## 2. screenshot 실측
- [-] 맥 샘플 PC 빌드 — 안 함(폰 숫자로 결론 · PC 는 장면 대상 아님)
- [x] 폰 RF9R408GKRR — SDK 찍기 한 번에 게임 189ms 멈춤 · 1초마다면 FPS -17% → 실시간 장면엔 Appium 유지

## 3. 판 올리기
- [ ] main 에 합친 뒤 `v0.8.0` 태그(사용자 — 합치기 · 태그)
