# 콘솔별 가상 패드 · Windows 지원 — 체크리스트

## ▶ 다음 세션은 여기부터 (2026-11-17)

- **다음은 C2** — Windows 에서 도는 CLI. main 에서 branch 를 떼고 `c2-plan.md` 부터 쓴다. 끝나면 병합한 main 커밋에 `v0.15.0` tag 를 단다
- **C1 끝** — PR #34 합침. `pad [xbox|ps5|ps4|switch|generic|off]` · `Pad.<이름>` 이름표 · ping 의 `input` · `pads` · conform 패드 줄 넷(모두 57줄). CLI 0.15.0 · SDK 0.12.0 으로 올렸다. 설계와 실측은 [c1-plan.md](c1-plan.md) · [context-notes.md](context-notes.md)
- **`v0.15.0` tag 는 아직 없다** — C2 가 끝난 뒤에 단다(사용자). 그 사이 main 의 CLI 로 `instrument` 를 돌리면 기본 ref(`v0.15.0`)를 못 받으니 `--ref <커밋>` 을 준다
- **Boss Room 은 굽지 않는다**(사용자 2026-11-17 「보스룸 굽지마」) — C1 의 Boss Room 칸은 열어 둔 채다. 실제 게임(`PlayerInput`)으로 보는 확인은 사용자가 따로 정한다
- **C2 가 이어받을 것** — `pad xbox` 가 Windows 에서 `XInputControllerWindows` 로 나오는지는 CI runner(되면) 또는 C3 에서 본다. `XInputControllerWindows` 는 스틱이 `SHRT` · 십자키가 비트라 SDK 의 보통 길(control 로 쓰기)을 탄다 — 이 맥에서는 못 봤다
- **이 맥에서 구운 빌드의 흔들림** — Unity 6000.3.10f1 + Input System 1.18.0 으로 이 맥에서 구운 샘플은 conform 의 마우스 줄(「UI Toolkit 직접」 · 끌기)이 판마다 붙었다 떨어졌다 한다. main 의 SDK(0.10.0)로 구워도 같다 — 패드와 상관없다. 표준 기록은 CI 가 구운 6000.0 + 1.11.2 빌드로 남긴다(context-notes 「C1 conform」)
- **이 맥에서 굽는 법** — `sample/` 을 job tmp 에 복사 → `ProjectVersion.txt` 를 6000.3.10f1 로 → `instrument` → manifest 의 SDK 를 `file:<worktree>/sdk/unity` 로, `com.unity.inputsystem` 을 더한다 → `Unity -batchmode -quit -projectPath … -buildTarget StandaloneOSX -executeMethod SampleBuild.Build -customBuildPath …/sample.app -activeInputHandler 1`(40초쯤). 이 맥 Unity 에는 Windows 빌드 모듈이 없다(`AndroidPlayer` · `LinuxStandaloneSupport` · macOS 만)
- **이어달리기** — 단계 하나(`## C2` …) = main 에서 뗀 branch 하나 · PR 하나 · 세션 하나. 규칙은 [roadmap/checklist.md](../roadmap/checklist.md) 맨 위 블록 그대로(끝나면 `gh pr merge --merge` · 판을 올렸으면 tag · 진척 페이지 · 다음 세션 띄우기 · 앞 세션 `claude stop`). C3 은 Windows PC 가 와야 해서 띄우지 않는다
- **PR #32 · `one-command-install` branch 는 main 에 합치지 않는다**(사용자 2026-11-17 「pr 32는 버려 저건 SDK 전달용으로 명칭만 변경 한거야」). 지우지도 않는다 — 전달용 zip 을 다시 만들 때 쓴다. main 의 심볼은 `CONTROL_CLI*` 그대로다
- **Input System 원본** — `~/Projects/boss-room/Library/PackageCache/com.unity.inputsystem@57d0e36f6123`(1.18.0). 읽기만 한다
- **실측 장비** — 이 맥 Unity `/Applications/Unity/Hub/Editor/6000.3.10f1`. 화면이 잠들면 `caffeinate -d -u -t 900` 을 건 채 돌린다
- QA Hub(test_platform) 쪽 Q1~Q5 는 그 저장소의 `/tpx` 절차로 간다. 여기서는 고치지 않는다 — 아래 「QA Hub 다음 줄」

계획: [plan.md](plan.md)(2026-11-17 사용자 승인). 결정과 까닭은 [context-notes.md](context-notes.md).

## C1. 콘솔별 가상 패드와 `pad` 명령
- [x] 설계 · 구현 계획 — `c1-plan.md`
- [x] 실측 — 샘플 macOS 빌드(Input System)에서 스틱 값 되돌려 쓰기 · hat 십자키 · 가상 Switch 패드 연결 절차 · `PlayerInput` 조작 묶음 전환. 어긋난 것은 context-notes 에 — 스틱 음수 쪽이 어긋나 날값을 직접 쓰게 고쳤고, macOS Xbox 도 hat 이었다
- [x] `protocol/commands.json` 에 `pad` · 명령의 `engines` 칸 · `protocol.test.ts`(Godot 비교에서 Unity 전용 빼기)
- [x] CLI — `Game.pad()` · `cli.ts` switch · HELP · `fake-game.ts`(장치 표 · `Pad.` 이름표 · 다른 플랫폼 이름 거절) · `npm run drivers`
- [x] SDK — `FakePad.cs`(+ `.meta`) · `FakeInputSystem.cs` 에서 패드 부분 옮기기 · `ControlServer.cs`(`pad` · `Caps` · ping `input` · `pads` · `Keys()` 의 `Pad.`) · asmdef `allowUnsafeCode`. `FakeInput.Reset()` 은 지금도 키만 떼어 고치지 않았다
- [x] 샘플 `InputProbe.cs` — layout · 확인/취소 표시 이름 · 십자키 · 두 스틱 · 방아쇠
- [x] conform 패드 줄(ps5 · ps4 · switch · xbox) · 옛 Input 빌드 · 못 만드는 플랫폼은 미실행(ping 의 `pads`). 「C 축 · 조이스틱」 줄은 그대로 뒀다 — 키보드 키를 빼면 옛 Input 빌드 · Godot 에서 실패한다
- [x] `npm test` 초록(101개) · CI `sdk-compile`(2021.3 · 2022.3 · 6000.0) · `sample` 초록(run 44056206295 — 10개 잡, macOS 옛 Input · iOS 는 game-ci 403 으로 한 번 다시 돌림)
- [x] 이 맥 macOS 빌드 conform — 패드 줄 통과 (CI 가 구운 6000.0 + Input System 1.11.2 빌드 「통과 56 · 실패 0 · 미실행 1」 세 번 · 이 맥에서 구운 6000.3 + 1.18.0 빌드 「통과 56 · 실패 0 · 미실행 1」 · 옛 Input 「통과 52 · 실패 0 · 미실행 5」)
- [ ] Boss Room macOS 빌드가 가상 패드로 움직인다 — 굽지 않았다(사용자 2026-11-17 「보스룸 굽지마」). `PlayerInput` 조작 묶음 전환은 샘플 빌드의 측정 코드로만 봤다
- [x] README(입력 설명 · 지원 표) · `docs/unity/context-notes.md` 12행 결정 고치기 · CLI 0.15.0 · SDK 0.12.0

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
