# 오브젝트 화면 사각형 · 화면 찍기 실측 — 체크리스트

계획: `~/.claude/plans/control-cli-rect.md`(2026-11-11). 결정과 까닭은 [context-notes.md](context-notes.md). 브랜치 `find-rect` · PR #23.

## 1. find 답에 화면 사각형
- [x] SDK `Found` 에 `rect: [x, y, w, h]` · `screen: [w, h]` — uGUI · UI Toolkit 은 `ScreenRect`, 월드 오브젝트는 bounds 꼭짓점 8개 비추기(near 면 자르기 · `camera` 칸)
- [x] `commands.json` 에 `features`(`rect`) · SDK `Caps` 끝에 `rect` · `protocol.test.ts`
- [x] TS `Found` · 가짜 게임 · conform 줄 「find 의 rect 가 x,y 를 품는다」 · 옛 SDK 면 미실행
- [x] README · SDK · CLI 0.8.0
- [ ] CI SDK 컴파일 검사(판 셋 × 입력 셋) 초록
- [ ] 샘플 빌드로 conform 실측 — rect 줄 통과

## 2. screenshot 실측
- [ ] 맥 샘플 PC 빌드 — 한 장 시간 · 찍을 때 프레임 · 찍는 중 find · 1초마다 찍을 때 FPS
- [ ] 폰(사용자가 정한 폰만) — 같은 항목

## 3. 판 올리기
- [ ] main 에 합친 뒤 `v0.8.0` 태그
