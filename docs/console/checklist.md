# 콘솔별 가상 패드 · Windows 지원 — 체크리스트

## ▶ 다음 세션은 여기부터 (2026-11-17)

- **다음은 C1** — 콘솔별 가상 패드와 `pad` 명령(SDK 0.12.0 · CLI 0.15.0). main 에서 branch 를 떼고 `c1-plan.md` 부터 쓴다. 맨 처음 할 일은 실측 네 가지(아래 C1 첫 칸)다
- **이어달리기** — 단계 하나(`## C1` …) = main 에서 뗀 branch 하나 · PR 하나 · 세션 하나. 규칙은 [roadmap/checklist.md](../roadmap/checklist.md) 맨 위 블록 그대로(끝나면 `gh pr merge --merge` · 판을 올렸으면 tag · 진척 페이지 · 다음 세션 띄우기 · 앞 세션 `claude stop`). 차례 C1 → C2. C3 은 Windows PC 가 와야 해서 띄우지 않는다
- **판 번호** — 새 판은 CLI 0.15.0 · SDK 0.12.0. 0.14.0 · 0.11.0 은 개발사에 넘긴 zip(`one-command-install` branch · PR #32)이 이미 썼다
- **PR #32 · `one-command-install` branch 는 main 에 합치지 않는다**(사용자 2026-11-17 「pr 32는 버려 저건 SDK 전달용으로 명칭만 변경 한거야」). 지우지도 않는다 — 전달용 zip 을 다시 만들 때 쓴다. main 의 심볼은 `CONTROL_CLI*` 그대로다
- **Input System 원본** — `~/Projects/boss-room/Library/PackageCache/com.unity.inputsystem@57d0e36f6123`(1.18.0). layout 등록 조건 · 상태 구조를 여기서 읽었다
- **실측 장비** — 이 맥 Unity `/Applications/Unity/Hub/Editor/6000.3.10f1`. 화면이 잠들면 `caffeinate -d -u -t 900` 을 건 채 돌린다
- QA Hub(test_platform) 쪽 Q1~Q5 는 그 저장소의 `/tpx` 절차로 간다. 여기서는 고치지 않는다 — 아래 「QA Hub 다음 줄」

계획: [plan.md](plan.md)(2026-11-17 사용자 승인). 결정과 까닭은 [context-notes.md](context-notes.md).

## C1. 콘솔별 가상 패드와 `pad` 명령
- [ ] 설계 · 구현 계획 — `c1-plan.md`
- [ ] 실측 — 샘플 macOS 빌드(Input System)에서 스틱 값 되돌려 쓰기 · hat 십자키 · 가상 Switch 패드 연결 절차 · `PlayerInput` 조작 묶음 전환. 어긋난 것은 context-notes 에
- [ ] `protocol/commands.json` 에 `pad` · 명령의 `engines` 칸 · `protocol.test.ts`(Godot 비교에서 Unity 전용 빼기)
- [ ] CLI — `Game.pad()` · `cli.ts` switch · HELP · `fake-game.ts`(장치 표 · `Pad.` 이름표 · 다른 플랫폼 이름 거절) · `npm run drivers`
- [ ] SDK — `FakePad.cs`(+ `.meta`) · `FakeInputSystem.cs` 에서 패드 부분 옮기기 · `ControlServer.cs`(`pad` · `Caps` · ping `input` · `Keys()` 의 `Pad.`) · `FakeInput.Reset()`
- [ ] 샘플 `InputProbe.cs` — layout · 확인/취소 표시 이름 · 십자키 · 두 스틱 · 방아쇠
- [ ] conform 패드 줄(ps5 · ps4 · switch · xbox) · 「C 축 · 조이스틱」 줄을 패드만으로 · 옛 Input 빌드는 미실행
- [ ] `npm test` 초록 · CI `sdk-compile` · `sample` 초록
- [ ] 이 맥 macOS 빌드 conform — 패드 줄 통과
- [ ] Boss Room macOS 빌드가 가상 패드로 움직인다
- [ ] README(입력 설명 · 지원 표) · `docs/unity/context-notes.md` 12행 결정 고치기 · CLI 0.15.0 · SDK 0.12.0

## C2. Windows 에서 도는 CLI
- [ ] 설계 · 구현 계획 — `c2-plan.md`
- [ ] `launch()` — `windowsHide` · 작업 폴더 · 끝의 `\` · relay 띄우기 `windowsHide` · `launch` · `stop` 을 라이브러리로 내보내기
- [ ] 테스트를 Windows 에서 돌거나 건너뛰게 — `cli.test.ts`(가짜 앱 · usbmuxd) · `drivers.test.ts`
- [ ] `.gitattributes`
- [ ] CI `cli.yml` — `npm test` 를 `ubuntu-latest` · `windows-latest` 에서
- [ ] CI `sample.yml` — Windows runner 에서 샘플 `.exe` conform(시도 — 창이 안 뜨면 빼고 C3 으로)
- [ ] README Windows 예시 · 지원 표
- [ ] 합친 뒤 `v0.15.0` tag

## C3. Windows PC 실측 (PC 가 준비된 뒤)
- [ ] 샘플 · Boss Room Windows 빌드로 `open --pc` · conform · 패드 넷(`pad xbox` 가 `XInputControllerWindows`)
- [ ] 실물 Xbox 패드 · DualSense 를 꽂은 채 가상 패드 입력이 들어간다
- [ ] 창이 초점을 잃은 상태의 입력 · `devices` 목록
- [ ] IL2CPP 빌드
- [ ] README 지원 표 「실기기로 확인」 · context-notes

## QA Hub 다음 줄 (이 저장소에서는 고치지 않는다)
- [ ] Q1 명세와 `[계약 변경 필요]` 승인 — 플랫폼과 패드 · `pc` 길 · `app_build.platform` · `PC_RUNNER_URL` · `GameDriver` 의 키 · 패드 · 증적
- [ ] Q2 kit · 러너 — PC 길(control-cli `v0.15.0`)
- [ ] Q3 admin — 빌드 · 실행 요청 · 배분 · 화면
- [ ] Q4 케이스 작성 지침
- [ ] Q5 Windows PC 실측
