# 묶음 펼치기 · 목록 원소 읽기 — 체크리스트

계획: [plan.md](plan.md). 결정과 이유: [context-notes.md](context-notes.md).

- [x] 약속 — `commands.json` 기능 `nested` · get · members 칸 설명
- [x] Unity SDK — `Props.cs` 경로 `[i]` · `.Count` · members 경로 · 칸 없음 글 · set 거절 · Caps · 0.14.0
- [x] Godot SDK — `props.gd` 같은 것 · CAPS · 0.2.0
- [x] CLI — `Game` 옛 SDK 거절 · Members 형태 · HELP · fake-game · 테스트 · `npm run drivers` · 0.18.0
- [x] 표준 화면 · conform 줄 — Unity `TouchProbe`(+ `ProbeData.cs`) · Godot `touch_probe.gd`
- [x] 확인(이 맥) — `npm test` · C# 컴파일 검사 4구성 · macOS 샘플(Unity 6000.3.10f1 · 옛 Input · Mono) conform 「통과 55 · 실패 0 · 미실행 5」(미실행은 패드 넷 · 일시정지)
- [x] 확인(CI) — sdk-compile 3판 · sample 빌드 11개(Android IL2CPP · iOS · WebGL 포함) · Windows conform 「통과 59 · 실패 0 · 미실행 1」 · Godot 4.5.2 · 4.7.2 conform 「통과 50 · 실패 0 · 미실행 10」(첫 판은 `props.gd` 변수 이름 겹침으로 Godot 이 안 켜졌다 — c3471f8)
- [x] PR #49 · 병합 · tag `v0.18.0`
- [ ] Boss Room `showcase` 의 `CONTROL_CLI_REF` 를 `v0.18.0` 으로(사용자 2026-11-27 「배포 끝나면 boss room 에 sdk 연동해서 배포」)
