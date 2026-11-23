# 인수인계 — 개발사 연동 가이드 · QA Hub 이름 · 콘솔 QA 조사 (2026-11-17)

앞 세션(job `61f1798c`)이 맥락이 차서 넘긴다. 이 문서 하나로 이어받을 수 있게 적었다. 결정의 까닭은 `docs/unity/context-notes.md` 의 2026-11-17 절들에 있다.

## 먼저 읽을 것

1. 이 문서
2. 기억 `studio-facing-wording` — 개발사가 볼 글의 이름 · 문체 · 범위(사용자가 네 번 고쳐 준 기준). 개발사용 글을 한 줄이라도 쓰기 전에 본다
3. `docs/unity/context-notes.md` 끝의 2026-11-17 절 여섯 개

## 지금 상태

| 무엇 | 상태 |
|---|---|
| PR #32 `one-command-install` | 열림 · 검사 19개 통과 · **병합 안 함** — #31 의 커밋을 포함하므로 #32 만 병합하면 된다 |
| PR #31 `worktree-external-install-docs` | 열림 · #32 에 포함됨 |
| worktree | `.claude/worktrees/external-install-docs` — branch `one-command-install` 이 여기 체크아웃돼 있다. 새 세션은 EnterWorktree 의 `path` 로 이 worktree 에 들어간다 |
| 판 | CLI 0.14.0 · Unity SDK 0.11.0 (tag 는 아직 없다 — 병합 뒤 main 커밋에 `v0.14.0`) |
| 개발사 가이드 | artifact https://claude.ai/artifact/DZsZbytpyxTEvYLUKhTA8z (10판 · 열린 댓글 0) · 저장소 원본 `docs/sdk-integration.md` — 둘은 같은 내용이어야 한다 |
| 넘길 파일 | `~/Downloads/QAhub-0.13.0.zip` (SDK 0.13.0 · CLI 0.17.0) — `npm run handoff` 로 다시 만든다 |
| 조사 보고서 | `~/Downloads/콘솔 게임 QA 방식과 적용 방안.md` |
| 오래 둘 사본 | `~/Downloads/qahub-handoff/` — 가이드 원본 `sdk-guide.html` · 조사 노트 여섯 · 보고서 · zip · `pdf2png.swift` · 이 문서 |

## 이 세션에서 한 일

- **한 줄 연동** — `node QAhub/dist/main.js instrument <Unity 프로젝트 폴더>`. instrument 가 CLI 에 실린 SDK 를 `Packages/QAHubSDK` 에 넣고(`--ref` 가 없을 때 · 기본이 바뀜) 정의 심볼을 `ProjectSettings.asset` 에 쓴다
- **깨지는 변경** — 정의 심볼 `CONTROL_CLI` → `QAHUB_SDK`, SDK 안쪽 조건 이름 여섯도 `QAHUB_SDK_*`. 옛 이름은 받지 않는다
- **저장소를 드러내지 않고 넘긴다** — `tools/handoff.mjs` 가 README · 테스트 · 주석 · 저장소 주소 · Godot SDK 없는 zip 을 만든다. 저장소 주소 글자가 남으면 만들지 않는다
- **개발사 가이드** — QA Hub 이름 · Android 만 · 준비물 → 1. SDK 넣기 → 2. 빌드와 자료 보내기(QA 빌드 · 명령 출력 · QA 서버 주소 · 테스트 계정 · 기획서 · 게임 정보) → 지원하는 Unity 버전
- **실측** — Unity 6000.3.10f1(이 맥 `/Applications/Unity/Hub/Editor/6000.3.10f1`)로 샘플 macOS 빌드 · conform 「통과 52 · 실패 0 · 미실행 1」. 6000.3 은 이번이 첫 실측
- **콘솔 QA 조사** — 여섯 갈래 조사와 보고서(아래 「조사 결론」)

## 사용자 결정을 기다리는 것

1. **PR #32 병합** — 이 세션은 병합하지 않았다(이어달리기 단계가 아니라 사용자 요청 작업이어서). 사용자가 「병합해」라고 하면 `gh pr merge 32 --merge` 뒤 main 커밋에 `v0.14.0` tag
2. **콘솔 · Windows 다음 걸음** — 보고서가 제안한 「지금 바로」 1번(가상 게임패드가 게임을 실제로 움직이는지 확인)을 시작할지. 사용자에게 물은 채 답이 없다
3. **`ControlCli` 로 시작하는 이름** — asmdef(`ControlCli.Input`) · namespace · 로그 `[ControlCli]` · 패키지 id `com.maxihan1.control-cli` 가 개발사 프로젝트에 보인다. 바꾸면 conform 기대값과 CLI ↔ SDK 약속 글자가 같이 바뀐다 — 사용자가 하라고 하기 전에는 안 한다
4. **저장소를 private 으로** — public 인 한 `maxihan1` 이름으로 찾을 수 있다. 사용자 결정 · 사용자 손
5. **가이드 문장 하나** — 「아래처럼 나오면 끝난 것입니다」가 사용자 기준 문체로는 가벼울 수 있다고 알렸다. 답이 없다

## 이 저장소 밖에 남은 일 (손대지 않았다)

- test_platform `docs/spec/도메인/게임.md` 의 「정의 심볼 CONTROL_CLI」 문구 → `QAHUB_SDK`
- Ashveil · Boss Room QA 빌드 잡 — SDK 를 0.11.0 으로 올릴 때 빌드 스크립트의 `CONTROL_CLI` 를 `QAHUB_SDK` 로. 옛 SDK 를 `--ref` 로 고정한 동안은 그대로 돈다
- test_platform 이 쓰는 control-cli 는 `v0.8.0` (`package.json`) — 올릴 때 instrument 기본이 바뀐 것(실린 SDK)을 본다
- QA Hub 에 PC 길과 키 · 패드 명령 — kit `packages/kit/src/runtime/game.ts` 가 내주는 것은 찾기 · 누르기 · 끌기 · 글자 · 값 읽기 · 터치뿐이고 길은 farm · usb 둘이다

## 조사 결론 (보고서 요지)

- 「Windows 빌드에 콘솔 패드만 있으면 똑같다」는 절반만 맞다 — 플랫폼과 무관한 기능, 꽂힌 패드를 보고 고르는 버튼 그림 · 확인/취소는 Windows 에서 본다. 콘솔 전용 코드 · 계정 · 저장 · 절전 복귀 · 성능 · 인증은 못 본다
- Windows 에서 패드가 그 콘솔 패드로 보이려면 게임이 Unity Input System 을 쓰고 Steam Input · 변환 도구(DS4Windows · BetterJoy · ViGEmBus)가 없어야 한다. Joy-Con 은 안 된다. Switch Pro 의 USB 유선은 자료가 어긋나 실제 확인이 필요하다
- 자동화는 게임 안 가상 장치가 맞다 — `InputSystem.AddDevice` 로 콘솔별 layout(DualSense · DualShock 4 · Switch Pro · Xbox)을 만들 수 있다
- **SDK 에 걸리는 것 (Unity source 판독 · 미실행)** — `sdk/unity/Runtime/FakeInputSystem.cs` 의 `Device(ref _gamepad, Gamepad.current)` 는 실물 패드가 꽂혀 있으면 그 장치에 `GamepadState` 를 보낸다. 실물 DualSense · Switch Pro · Xbox 패드는 상태 형식이 달라 입력이 예외도 로그도 없이 버려진다. 고칠 길 — 늘 자기 가상 장치를 만들어 거기에 보낸다 · 가장 작은 콘솔별 걸음은 `AddDevice<DualShockGamepad>()` · 모든 layout 에 통하는 길은 `StateEvent.From` + `control.WriteValueIntoEvent` + `InputSystem.QueueEvent`
- 가상 게임패드(`key JoystickButton0`~`19`)는 코드가 있고 컴파일은 되지만 게임을 움직여 본 기록이 없다. Windows 는 빌드만 확인했고 CLI 도 macOS 에서만 돌렸다
- 콘솔 실기는 세 곳 모두 계약 · 개발 장비 · Unity Pro 가 먼저다. 계약 없는 쪽이 맡을 수 있는 칸은 플랫폼과 무관한 기능 QA 다. 일반 판매 기기에 자동 입력 장치를 붙이는 길은 약관 위반이라 제안에서 뺐다
- 보고서의 제안 — 지금 바로: Windows 수동 QA 절차 + SDK · 도구 · 가상 패드의 Windows 실측 + 개발사에 입력 방식 질문 넷 · 다음: QA Hub 에 Windows 실행과 패드 명령, 콘솔별 가상 패드 · 나중: 개발사 장비 위에서 relay(WebSocket) 로

## 개발사에 따로 요청하는 것 (가이드에 싣지 않는다 — 사용자가 직접 요청)

상태 만드는 길(GM 채팅 명령 또는 어드민 API) · 서버 값 조회 · 데이터 되돌리기 · 상대 플레이어(봇) · 실패 · 운영 상황 만들기 · 확률 기록. QA Hub 케이스는 SDK 의 `call` · `static-call` 을 못 쓴다 — 치트는 GM 채팅 명령이나 어드민 API 여야 한다. 본보기는 Boss Room(`~/Projects/boss-room`)의 `/gm` 18개 · `/test/*` 10개 · `docs/기획서`.

## 되풀이할 때 쓰는 것

- 가이드를 고치면 — artifact(같은 주소로 다시 올린다 · 새 세션에서는 `Artifact` `action: read` 로 먼저 읽는다)와 `docs/sdk-integration.md` 를 같이 고친다. 댓글이 오면 고치고 닫는다
- PDF 확인 — headless Chrome `--print-to-pdf` 로 뽑고 `~/Downloads/qahub-handoff/pdf2png.swift` 로 쪽마다 그림을 떠서 본다(`pdftoppm` 없음)
- Unity 실측 — `sample/` 을 임시 폴더에 복사 → `ProjectVersion.txt` 를 `6000.3.10f1` 로 → Unity `-batchmode -quit` 로 한 번 열어 `ProjectSettings.asset` 을 만든다 → `SampleBuild.cs` 에서 `extraScriptingDefines` 줄을 뺀다 → zip 의 CLI 로 instrument → `-executeMethod SampleBuild.Build -buildTarget StandaloneOSX -customBuildPath …/sample.app` → `open --pc --app` · `conform` · `close`. 화면이 잠들면 `caffeinate -d -u -t 400` 을 건 채 돌린다
- 번역투 검사 — humanize-korean skill. 이 맥 설치본에 `scripts/` 가 없어 진단 → 윤문 두 단계만 돈다
- 명령을 `&&` 로 길게 묶으면 worktree 격리 검사가 막는다 — git 이 든 명령은 짧게 나눈다
