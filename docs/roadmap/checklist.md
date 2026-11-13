# AltTester 기능 전부 + 여러 엔진 — 체크리스트

## ▶ 다음 세션은 여기부터 (2026-11-13)

- **이어달리기(test_platform 방식, 사용자 2026-11-13)** — 단계 하나(`## P5` · `## P7` …) = main 에서 뗀 브랜치 하나 · PR 하나 · 세션 하나. 끝나면 묻지 않고 `gh pr merge --merge` 로 main 에 합치고(사용자 「작업 끝나면 메인에 머지까지」), 판을 올렸으면 그 main 커밋에 tag, 진척 페이지 db 갱신, 이 블록을 다음 단계로 고쳐 PR 에 싣고, `claude --bg "<다음 단계> — 이어 달리기: …"` 로 다음 세션을 띄운다. 차례 P5 → P7 → P8 → P9(P6 끝). P10 은 「할지 말지」 사용자 결정이라 띄우지 않는다. 막히면(사용자 결정 · 라이선스 · 실기기) 띄우지 않고 까닭을 보고한다. 서버를 다시 빌드하거나 배포하지 않는다
- **끝난 세션 닫기(사용자 2026-11-13 「작업 끝난 세션은 닫아줘」)** — 새 세션은 시작하면 앞 세션을 `claude stop <앞 job id>` 로 멈춘다(대화 · worktree 는 남는다, `claude rm` 은 안 함). `claude agents --json` 의 `state: done` 이 끝난 세션
- **P4 드라이버 끝** — PR #27 합침 · `v0.11.0`(CLI 0.11.0 · SDK 0.10.0 그대로). `drivers/` 에 Python · C# · Java(파일 하나씩, `npm run drivers` 가 commands.json 에서 생성 칸을 다시 씀) · Robot(Python 드라이버를 라이브러리로). conform 은 `conform --driver '<다리 명령>'` — 이 맥 macOS 앱 Python · Java 52/0/1, C# · Robot 은 CI `drivers` 잡(가짜 표준 화면). 남은 칸 하나 — C# · Robot 실기기(이 맥에 dotnet · robot 깔기를 자동 권한이 막음 → 사용자 몫). `protocol/commands.json` 에 명령을 더하면 `npm run drivers` 도 같이 — `drivers.test` 가 잡는다
- **P6 Godot 끝** — PR #28 합침 · `v0.12.0`(CLI 0.12.0 · Unity SDK 0.10.0 그대로 · Godot SDK 0.1.0). `sdk/godot/addons/control_cli` GDScript autoload, `instrument <Godot 프로젝트>` 가 실린 애드온을 넣는다. conform 은 `ping.engine` 으로 표준 화면 낱말 표(`src/conform.ts` 의 `UNITY` · `GODOT`)를 고른다. CI `godot` 잡 · 이 맥 macOS 앱 · 웹 모두 47/0/6. Android(USB 폰)도 47/0/6 — P6 칸 다 닫음. Godot 은 이 맥에 없다 — CI 결과물(`godot-sample-4.7.2`)을 받아 실측(README 「개발」)
- **다음 P5 인스펙터 · Recorder** — 이 파일 P5 「설계 · 구현 계획」. 설계 · 구현 계획(`p5-plan.md`)부터 쓰고 바로 구현. 짐작 — `control-cli inspect` 는 로컬 웹 화면(plan.md 「인스펙터 모양」 — 설치 없음, CLI 가 HTTP 서버를 띄우고 브라우저로 연다): 트리(`tree`) · 상세(`components` · `members` · `get`) · 스크린샷 · 누르면 명령(`find-at` → `click`). Recorder 는 누른 차례를 단계로 적어 TS(`Ran:` 줄 꼴) · Python · C# · Java · Robot 테스트로 내보낸다(드라이버 메서드 이름은 `src/drivers.ts` 가 아는 꼴). 「기록 돌리기」는 내보낸 TS 를 다시 돌려 초록. Unity 가짜 표준 화면(`src/fake-game.ts`)으로 테스트하고, 실측은 이 맥 macOS 앱(Unity sample · Godot 결과물 둘 다)으로. 한 PR 에 다 못 넣으면 inspect 먼저, Recorder 는 칸으로 나눈다
- 진척 페이지(전체) — https://claude.ai/artifact/Y4ZUdJiXPeE4NGSx8oxNWK (db 의 `meta/state` · `phases`(U0~U8 · P0~P10 · 번외, `done`/`total` 은 체크리스트 칸 수) · `tasks`(지금 단계 Task) · `log`). 체크리스트 칸을 바꾸거나 Task 가 끝날 때마다 ArtifactData 로 고친다(`status` 는 done · partial · doing · blocked · todo) — 페이지는 다시 publish 하지 않는다
- 실기기 길 — 팜 토큰 길이 401(아래 「팜 연결」)이라 이 맥에 USB 로 꽂힌 폰에 adb 로 깔고 켠다(`open --relay` 는 깔기와 상관없이 붙는다). CI APK 는 잡마다 서명 키가 달라 다른 빌드로 바꿀 때 `adb uninstall` 이 먼저다 — 자동 권한이 막아 사용자가 `! ~/Library/Android/sdk/platform-tools/adb -s <serial> uninstall com.maxihan1.controlcli.sample` 로 지운다. `adb install` 출력은 자르지 말고 끝까지 본다(실패를 놓치면 옛 앱이 돈다)
- 밖 공개 relay 시험 — cloudflared quick tunnel(`cloudflared tunnel --url http://127.0.0.1:<토큰 relay 포트>`, 계정 없는 임시 `trycloudflare.com` 주소)이 `wss` 를 그대로 넘긴다. 토큰은 job tmp 에만, 시험 뒤 터널 · relay 를 끈다. `farm.maxihan.com` 은 Devicefarm 의 SSH 터널이라 손대지 않는다

- P0~P2 · U0~U8 모두 main 에 들어갔다 — PR #5~#21 합침(위에서부터 merge commit, main `b4bdb10` = 옛 `roadmap`), tag `v0.7.0`(SDK · CLI 0.7.0). 그 뒤 #23 find rect 로 main `6f6511a` · tag `v0.8.0`. AltTester 명령 목록 기준 68/68
- 다음은 P3~P10 병행 — 트랙마다 세션 하나 · worktree 하나 · **main 에서 뗀 브랜치** · 팜 폰 하나(plan.md 「순차와 병행」). 1차 묶음은 P3 연결 · 플랫폼(`relay` · WebGL · Linux · iOS 역방향) · P4 드라이버(Python · C# · Java · Robot — `protocol/commands.json` 에서) · P6 Godot. 트랙을 시작하는 세션은 이 파일의 그 단계 「설계 · 구현 계획」부터
- 병행 규칙 — 통신 꼴(`protocol/commands.json` · SDK 답 꼴)을 바꾸는 일은 작은 PR 로 main 에 먼저, 다른 트랙은 그 위로 다시 올린다. README 지원 표 · AltTester 표는 트랙 PR 마다 자기 칸만
- 판 · tag — instrument 는 `--ref` 가 없으면 `v<package.json 판>` 을 받는다(context-notes 「instrument 기본 ref」). 판을 올리는 PR 을 main 에 합치면 그 커밋에 같은 tag 를 바로 찍는다 — 안 찍으면 새 CLI 의 기본값이 SDK 를 못 받는다
- PR 만들기 — 자동 권한 판정이 PR 본문(다른 저장소 정책 문서 이름)을 「Data Exfiltration」으로 막은 적이 있다. 막히면 사용자가 `! gh pr create …` 로 만든다(P2-D)
- CI 빨간 줄 — sample 잡이 러너 사정(`no space left on device` · Unity 라이선스 `Access token is unavailable` · Maven `Could not resolve org.jetbrains.kotlin` · game-ci CLI `GitHub API returned 403`)으로 자주 떨어진다. 로그를 읽어 그거면 `gh run rerun <run> --failed`
- 팜 폰 — RF9R408GKRR 을 다시 써도 된다(사용자 「RF9R408GKRR 써도 됨」, 2026-11-04 P2-C 실기기 때). 세션마다 사용자가 정한 폰만 쓰고, 다 쓰면 `release`
- C# 컴파일 검사 — `.cache` 는 p2b worktree 에 받아 둔 것을 쓴다: `UNITY_REF_DIR=/Users/maxi.moff/Projects/control_cli/.claude/worktrees/p2b/tools/unity-compile-check/.cache python3 tools/unity-compile-check/check.py 6000.0`(없으면 `check.py fetch 6000.0`)
- 팜 연결 — 팜은 이 맥에서 돈다(`http://127.0.0.1:4723/wd/hub`, 밖에서는 `https://farm.maxihan.com/wd/hub`). **2026-11-04 토큰 정책이 바뀌어 사람 PAT 가 없어졌다** — Keychain `control-cli-farm` 의 PAT 는 401 이고, 사용자에게 PAT 를 달라고 하지 않는다. CLI 브라우저 로그인이 생기기 전까지 실기기는 USB(위 「실기기 길」)
- macOS 시험은 `caffeinate -d -u -t 900` — 잠금 화면은 `-d` 만으로는 13초 만에 화면을 꺼 Unity 가 멈춘다(context-notes 「P1 실기기」)
- Unity 넓히기 U0~U8 닫음(2026-11-11) — iPhone 실측 · `v0.2.0` tag · panel 직접은 「안 함」(사용자). test_platform 쪽 Ashveil 회귀 · 팜 안내 창은 그 저장소 다음 줄로 남는다 — [docs/unity/checklist.md](../unity/checklist.md)

단계마다 「설계 → 구현 계획 → 구현 → `conform` 초록(CI + 실기기) → README 지원 표 · AltTester 표 갱신 → test_platform kit 다음 줄」 차례다.

## P0. 바탕
- [x] 설계 · 구현 계획 — [p0-plan.md](p0-plan.md)(태스크 9개)
- [x] `ping` 이 `engine` · `engineVersion` · `protocol` · `caps` 를 준다 · CLI 가 `caps` 밖 명령을 미리 거절 — SDK 0.3.0 · protocol 2(453c351), 세션 파일에 caps(b6a6b64). 팜 `open` 줄 「· unity 6000.0.84f1 · SDK 0.3.0」
- [x] `protocol/commands.json` — 지금 SDK 명령 12개(56dacce) · `src/protocol.test.ts` 가 Unity `Caps` · `SdkVersion` 과 대조 · npm 패키지에 실림(07062ec)
- [x] `control-cli conform` — 표준 화면 차례 · 기대값 · 엔진 × 기능 결과 표 — 16줄(1c1f0ed) · 명령 · 실패면 종료 코드 1(d1a4ba5). 전체 `npm test` 32 통과
- [x] `sdk/` → `sdk/unity/` · instrument 경로 · 하네스 · sample 워크플로 — c6a60c1. sdk-compile run 41642344008 초록(meta · 2021.3 · 2022.3 · 6000.0), 워크플로 `paths` 는 `sdk/**` 라 그대로
- [x] Unity 샘플 `conform` 초록(팜 · 이 맥) — 팜 RF9R408GKRR 초록: sample run 41642343858(7개 초록, 6000.0 옛 Input 은 Maven 저장소 못 닿음으로 rerun 한 번)의 APK 넷(6000.0 옛 Input · 6000.0 Input System · 2022.3 둘 다 · 2021.3 옛 Input) 모두 「통과 16 · 실패 0 · 건너뜀 0」. 이 맥 macOS 앱(같은 run 의 StandaloneOSX · 세로 창 540×1200)도 「통과 16 · 실패 0 · 건너뜀 0」(2026-11-04 — 잠든 화면을 `caffeinate -u` 로 깨우고 `caffeinate -d` 를 건 채)

## P1. MCP
- [x] 설계 · 구현 계획 — [p1-plan.md](p1-plan.md)(태스크 6개)
- [x] `control-cli mcp` — stdio MCP 서버 · 도구 목록은 `protocol/commands.json` 에서 — 손으로 쓴 JSON-RPC(`src/mcp.ts` · 5c839ee), 게임 도구 12개 + 세션 도구 `hold` · `open` · `close` · `release`(da722f9). sdk-compile meta 잡이 `mcp.test` 도 돈다(58d4aeb)
- [x] Claude Desktop 설정 한 줄 · README — MCP 절 · 도구 표(f7719f6). 세션 파일은 `~/.control-cli/`
- [x] Unity 샘플 `conform` 차례를 MCP 도구로 돌려 초록 — 테스트(가짜 표준 화면 · `dist/main.js mcp` 를 띄워) 16/16, 이 맥 macOS 앱 · 팜 RF9R408GKRR(6000.0 Input System) 모두 「통과 16 · 실패 0 · 건너뜀 0」(run 41642343858 결과물). Claude Code headless · Claude Desktop(대화) 이 진짜 MCP 클라이언트로 붙어 open → … → close

## P2-A. Unity 게임 상태
- [x] 설계 · 구현 계획 — [p2a-plan.md](p2a-plan.md)(태스크 6개) · 명령 14개(b2ab0d5 · 7e114b6)
- [x] 컴포넌트 메서드 호출 · 속성 쓰기 · static 메서드 · static 속성 읽기/쓰기 — `call` · `set` · `static-call` · `static-get` · `static-set`(Props.cs · 8f022b5). 값 타입 칸(`Transform.position.y`)은 사본을 거꾸로 다시 써 넣는다
- [x] PlayerPrefs 읽기 · 쓰기 · 키 지우기 · 다 지우기 — `pref-get` · `pref-set` · `pref-delete` · `pref-clear`(`type` string · int · float, GameState.cs)
- [x] timeScale 읽기 · 쓰기 — `timescale-get` · `timescale-set`(0~100)
- [x] 장면 열기(하나 · 더하기) · 닫기 · 열린 목록 · 이 장면이 될 때까지 기다리기 — `scene-load [--add]` · `scene-unload` · `scenes` · CLI `scene-wait`(Game 이 `loads` · `unloads` 수로 기다림). CLI · MCP · Ran 줄 63522c1, sdk-compile run 41742741341 초록(meta · 2021.3 · 2022.3 · 6000.0)
- [x] 표준 화면 · `conform` A 줄 · 팜 초록 — 표준 화면에 `Second` 장면 · `SecondMarker` · `TouchProbe.Say` · `Add` · `Note`(94ea620), A 줄 7개 → 23줄. 팜 RF9R408GKRR(sample run 41742741513 · 6000.0 옛 Input · 2021.3 옛 Input · 둘 다 IL2CPP) · 이 맥 macOS 앱(Mono) 모두 「통과 23 · 실패 0 · 건너뜀 0」

## P2-B. Unity 찾기 · 설정
- [x] 설계 · 구현 계획 — [p2b-plan.md](p2b-plan.md)(태스크 9개). 선택자 = AltTester PATH 꼴 일부(`//` · `*` · `..` · `[@칸=값]` · `contains` · `[n]` · `[-1]`), 새 명령 5개 · 칸 셋(`inactive` · `camera` · `format`), conform B 10줄 → 33줄, 0.5.0
- [x] 선택자 — `src/select.ts`(가짜 SDK · 기준 · c3484be · 678f070 대괄호 이름) · `Select.cs`(ad7de28) · 옛 SDK 거절(4bed3c1)
- [x] 여러 개 찾기 · 좌표로 찾기 · 꺼진 오브젝트 · 카메라 고르기 — `find-all` · `find-at` · `inactive` · `camera`
- [x] 부모 · 화면 좌표 · 속성 값이 될 때까지 기다리기 — `parent` · find 답 `x,y` · `wait-prop`(CLI · 3644ffa)
- [x] 컴포넌트 · 필드 · 메서드 목록(인스펙터 바탕) — `components` · `members`
- [x] UI Toolkit 요소 속성 읽기 · 기다리기 — 요소에 `get` · `wait-prop`
- [x] 글자 컴포넌트에 글자 쓰기(입력칸 밖) — `text-set`
- [x] 기본 기다림 설정 · PNG 스크린샷 — `config --wait` · `screenshot {format: png}`. 명령 시간 초과 · 명령 뒤 쉼은 뺌(사용자 — 기다리기가 바깥 되풀이)
- [x] 영구 id — QA 빌드 훅(b523962)이 장면 오브젝트에 fileID. sample run 41759126839 로그 「Assets/Second.unity 오브젝트 1/1개에 영구 id」 · conform B 영구 id 줄 초록(다시 열어도 같은 id, SecondMarker 는 바뀜)
- [x] `conform` B 줄 초록(팜 · 33줄) — RF9R408GKRR · 6000.0 옛 Input · 6000.0 Input System · 2021.3 옛 Input(IL2CPP) · 이 맥 macOS 앱(Mono) 모두 「통과 33 · 실패 0 · 건너뜀 0」

## P2-C. Unity 입력
- [x] 설계 · 구현 계획 — [p2c-plan.md](p2c-plan.md)(태스크 10개). 입력 상태 한 벌(손가락 10 · 키 세기 · 가짜 마우스 · 기울기) + 프레임 일(iterator), 새 명령 12개 · 바뀐 칸(count · interval · via · duration · power · `A+B`), 옛 Input 축 표 빌드 훅, conform C 15줄 → 48줄, 0.6.0
- [x] 명령 정의 · Game · 가짜 SDK · conform C 줄 · CLI(Task 1~4) — b28a642 · 2f3ef3b · 3002024 · d7586b4, 검토 반영 3c5c72e · e2c87ec · 45131f8 · 9ae459b. 길게 누르기는 `long-press`(세션 `hold` 와 겹침 — context-notes 「P2-C 구현」)
- [x] `FakeTouches` 손가락 여럿 · 터치 누름/움직임/뗌 따로 · 여러 점 끌기 · 끌기 시간(Task 5 — 5a80ef1, 검토 반영 e1e418a)
- [x] 스크롤 · 길게 누르기 · 마우스 옮기기 · Pointer Down/Up/Enter/Exit(Task 5 · 7 — f25c826)
- [x] 키 누름 · 뗌 따로 · 여러 키 함께 · 누른 채 두기 · 옛 Input 축(Task 5 · 6 · 7 — 축 표 9791970)
- [x] 기울이기(가속도) · 조이스틱(Task 5 · 7)
- [x] 입력 거두기(ResetInput)(Task 5 · 7)
- [x] 표준 화면 C 칸 · macOS Input System 빌드(Task 8 — 0395d33) · README · AltTester 표(Task 9 — 54dae52 · 57031ac). 컴파일은 이 맥 6000.0 셋 초록, 2021.3 · 2022.3 · 장면은 PR #19 CI
- [x] 옛 Input · Input System · UI Toolkit 직접 길 모두 · `conform` C 줄 초록(Android · macOS)(Task 10) — sample run 41793375943(27feaef · 2021.3 Android 잡은 Docker 층 쓰기 실패로 한 번 다시)의 팜 RF9R408GKRR 6000.0 옛 Input · 6000.0 Input System · 2021.3 옛 Input · 2022.3 둘 다, 이 맥 macOS 6000.0 옛 Input · Input System 모두 「통과 48 · 실패 0 · 건너뜀 0」. 빌드 로그 「축 18개」. 샘플 SecondScroll 을 두 번 고침(테마 없는 panel — context-notes 「P2-C 실기기」)

## P2-D. Unity 알림
- [x] 설계 · 구현 계획 — [p2d-plan.md](p2d-plan.md). AltTester 셈 다시 — 명령 64 + 알림 4 = 68, P2-C 뒤 63/68. `logs` · `events` · `sdk-log` 셋, Issue Bunker 정책과 맞춤(알림 이름 `scene.loaded` 꼴 · `occurredAt` · 토큰 `***` · conform 「미실행」), conform D 4줄 → 52줄, 0.7.0
- [x] 장면 열림 · 닫힘 · 로그 · 일시정지 알림(번호 뒤만 가져가기) — `events` · `logs`, `errors` 에 `occurredAt` · 가리기(88140b5 · f1a5fef)
- [x] SDK 로그 켜고 끄기 — `sdk-log on|off`(팜 손 확인 — 비밀번호 `text=***` · 실패 글 속 값 `「***」은 int 가 아닙니다`)
- [x] `conform` D 줄 초록 — sample run 41806656652 의 팜 RF9R408GKRR APK 넷 「통과 52 · 실패 0 · 미실행 0」 · 이 맥 macOS 둘 「통과 51 · 실패 0 · 미실행 1」(PC 는 일시정지가 안 난다)

## P3. 연결 · 플랫폼

셋으로 나눔(사용자 2026-11-06) — P3-A relay → P3-B Unity WebGL → P3-C Linux. 설계 · 구현 계획은 [p3a-plan.md](p3a-plan.md).

### P3-A. relay (0.9.0 — 0.8.0 은 #23 find rect 가 먼저 씀)
- [x] 설계 · 구현 계획 — [p3a-plan.md](p3a-plan.md)(태스크 10개)
- [x] `control-cli relay` · `relay status` · `open --relay [주소] [--game]` · `relayLink` — 손으로 짠 WebSocket · 권한(루프백 · 토큰) · ping · 번호 붙은 명령, 로컬 relay 는 `open` 이 띄운다(2dd9e22 · 67c2b9c · c91cc72)
- [x] MCP `open {relay, game}` · `instrument --relay`(9617e24 · 9017863)
- [x] Unity SDK 0.9.0 `Relay.cs` · `Ask` · `PingReply`(2dc191f) · iOS `NSLocalNetworkUsageDescription` 훅(aa8206e) · sample 입력 `relay`(2ee984b)
- [x] README relay 절 · 연결 표 · relay 통신 꼴 · plan.md AltTester 연결 줄
- [x] CI — sdk-compile 초록(run 42978856970) · PR sample 9개 잡 초록(run 42978856957 — relay 없는 TCP 길 회귀 없음). relay 를 구운 sample — Wi-Fi run 42979434816 은 9/9(Maven 못 닿음으로 떨어진 6000.0 옛 Input Android 를 다시 돌려 초록), `wss` run 42979606389 은 8/9(같은 잡이 game-ci CLI API 403 — 러너 사정), relay 를 구운 iOS 빌드(로컬 네트워크 훅)까지 초록
- [x] 실기기 — 이 맥 macOS 앱 · RF9R408GKRR 같은 Wi-Fi · RF9R408GKRR 밖 공개 `wss`(토큰) 모두 「통과 52 · 실패 0 · 미실행 1」. 폰은 팜 토큰 길이 막혀 USB(adb)로 깔아 일시정지 줄이 미실행(53 대신 52) — 일시정지는 손으로 확인. 위험 셋 결과는 context-notes 「P3-A 실기기」
- [-] iOS 역방향(케이블 없는 iPhone → relay) 실측 — 안 함(iPhone 실측 못 함 · U7 과 같은 결정, 2026-11-11). 빌드 훅까지만

### P3-B. Unity WebGL
- [x] 설계 · 구현 계획 — [p3b-plan.md](p3b-plan.md). 브라우저 WebSocket(jslib) 으로 P3-A relay 에, 페이지 주소 `?controlcli=<주소>` 가 먼저 · C# 이 매 프레임 받은 줄을 꺼내 간다 · SDK 0.10.0
- [x] Unity WebGL 샘플 · 이 맥 브라우저에서 `conform` — sample run 43365234863 의 WebGL(6000.0 · 옛 Input) 을 이 맥 Chrome 157 에서 「통과 52 · 실패 0 · 미실행 1」(일시정지 — PC 와 같음), 고친 판 run 43376280037(fb87e43)도 52/0/1. 늦추기를 끈 Chrome 을 따로 띄워서(context-notes 「P3-B 실기기」)

### P3-C. Linux
- [x] 설계 · 구현 계획 — [p3c-plan.md](p3c-plan.md). SDK · CLI 는 그대로(PC 길), sample 에 `StandaloneLinux64` 잡. PR sample run 43387721549 11개 잡 초록(a4f15de)
- [x] Linux 샘플 빌드 · `conform` — sample run 43387721549(IL2CPP · a4f15de)을 이 맥 Docker `linux/amd64` 컨테이너(Xvfb · Mesa llvmpipe)에서 CLI 와 함께 돌려 「통과 52 · 실패 0 · 미실행 1」(일시정지 — PC 와 같음) 두 번. 첫 Mono 판(run 43381678078)은 Rosetta 위 Mono JIT 가 죽어 IL2CPP 로 바꿨다(context-notes 「P3-C 실기기」)

## P4. 드라이버
- [x] 설계 · 구현 계획(생성기) — [p4-plan.md](p4-plan.md). 언어마다 의존 없는 파일 하나, `npm run drivers` 가 「생성」 표시 줄 사이만 다시 쓴다. conform 은 다리(`conform --driver`)로 — 차례 · 기대값은 TS 한 벌, 명령은 그 언어 드라이버가 보낸다. CLI 0.11.0
- [x] Python · Java — 가짜 표준 화면(TCP · 토큰 relay) 52/0/1 · 이 맥 macOS 앱(sample run 43387721549 · 6000.0 옛 Input) `conform --driver` 「통과 52 · 실패 0 · 미실행 1」
- [x] C# · Robot — CI `drivers` 잡(run 43396730311): C# 다리 TCP · 토큰 relay 52/0/1 · Robot suite(Python 드라이버를 라이브러리로) 7줄 초록
- [ ] C# · Robot 실기기 — 이 맥에 dotnet · robot 이 없고 깔기(`brew install dotnet` · venv pip · dotnet 컨테이너)를 자동 권한이 막았다. 사용자가 `! brew install dotnet` · `! pipx install robotframework` 로 깔면 README 「드라이버」 명령 그대로

## P5. 인스펙터 · Recorder
- [ ] 설계 · 구현 계획
- [ ] `control-cli inspect` — 트리 · 상세 · 스크린샷 · 누르면 명령
- [ ] Recorder — 단계 · assertion 기록 → TS · Python · C# · Java · Robot 테스트
- [ ] 기록 돌리기 · 마지막 연결 기억

## P6. Godot
- [x] 설계 · 구현 계획 — [p6-plan.md](p6-plan.md). Godot 4.5 이상(로그를 받는 `Logger` 가 4.5 부터) · 낱말 표(Node · group · 이름 붙인 layer · `[클래스.]칸` · ConfigFile · `.tscn` 이름) · conform 엔진 표
- [x] `sdk/godot/` 애드온 · instrument — GDScript autoload `ControlCli`(TCP 13100 · relay `WebSocketPeer`) · 46 명령 + rect · SDK 0.1.0. `instrument` 가 `project.godot` 를 알아보고 CLI 에 실린 애드온을 넣는다(`--ref` 없음) · CLI 0.12.0
- [x] 표준 화면 · CI export(PC · 웹) — `sample-godot/`(Unity 표준 화면과 같은 이름 · 같은 반응, Bag 칸은 `Slot0~3`). CI `godot.yml` 이 Godot 4.5.2 · 4.7.2 를 받아 xvfb 위에서 conform · 4.7.2 로 macOS 앱(ad-hoc 서명 universal) · 웹(스레드 없음) export
- [x] `conform` 초록 · 맞출 수 없는 칸 표에 적기 — CI 4.5.2 · 4.7.2(run 43402118931) · 이 맥 macOS 앱 · 이 맥 Chrome 웹(relay) 모두 「통과 47 · 실패 0 · 미실행 6」. 미실행 = TMP · UI Toolkit 줄 다섯(Godot UI 는 Control 한 벌) + 일시정지(PC · 웹은 앱을 뒤로 보낼 길 없음) — p6-plan.md 「맞출 수 없는 칸」 · README 지원 표
- [x] Android export · USB conform — CI export 잡이 미리 지은 템플릿 APK 로 디버그 APK(arm64 · 잡마다 새 debug keystore, 패키지 `com.maxihan1.controlcli.godot`)를 굽는다. run 43402867597 의 APK 를 RF9R408GKRR 에 adb 로 깔아 `open --usb` → 「통과 47 · 실패 0 · 미실행 6」(일시정지 줄은 Appium 없는 USB 라 미실행), adb 로 홈 → 다시 켜기에 `events` 가 `game.paused` · `game.resumed` 를 줬다(손 확인)

## P7. Unreal
- [ ] 설계 · 구현 계획(판 · CI 러너 정함)
- [ ] `sdk/unreal/` 플러그인 · instrument
- [ ] 표준 화면(UMG) · CI
- [ ] `conform` 초록

## P8. GameMaker
- [ ] 설계 · 구현 계획(주소 꼴 · 라이선스 빌드)
- [ ] `sdk/gamemaker/` 확장 · instrument
- [ ] 표준 화면 · CI · HTML5 는 relay
- [ ] `conform` 초록

## P9. RPG Maker
- [ ] 설계 · 구현 계획(MZ 먼저)
- [ ] `sdk/rpgmaker/` 플러그인 · instrument
- [ ] 표준 화면 · NW.js(TCP) · 웹(relay)
- [ ] `conform` 초록

## P10. CryEngine
- [ ] 할지 말지 — 이 엔진으로 만든 실제 게임이 있나(사용자)
- [ ] 설계 · 구현 계획 · `sdk/cryengine/` · 표준 화면 · `conform`

### test_platform 다음 줄 (이 저장소에서는 고치지 않는다)
- 단계마다 새 명령의 `game.*` 함수를 kit(`packages/kit/src/runtime/game.ts`)에 같은 이름으로 더한다 — 안 그러면 `Ran:` 줄이 케이스에서 안 돈다
- P3-A — 팜 화면에 relay 연결 표시(`GET /games` 꼴 · key `<앱>@<기기 id 앞 8자>`). kit `game.*` 은 그대로(명령 꼴이 같다) — 라이브러리로 붙을 때는 `relayLink(url, headers, key)`
- P2-D — `logs(since)` · `events(since)` · `sdkLog(on)`(꼴은 control_cli `src/game.ts` 의 `GameLogs` · `GameEvents`). 게임 증적 `game-errors.txt` 는 `e.time` 대신 `e.occurredAt ?? e.time` 으로 옮긴다(SDK 0.7.0 이 둘 다 준다 — `time` 은 나중에 뗀다). 같은 자리에 `game-logs.txt`(`logs(since)` — Warning 까지, 케이스 실패 때 앞뒤 사정) · 알림 줄을 남기는 안. 증적 머리의 「들고 있는 수(200)」는 logs 면 500
- P2-C — `touchDown` · `touchMove` · `touchUp` · `swipe` · `longPress` · `mouseMove` · `scroll` · `keyDown` · `keyUp` · `tilt` · `pointer` · `resetInput`, `click` · `tap` 의 `{ count?, interval? }` · `drag` 의 `{ via?, duration? }` · `key` 의 `{ duration?, power? }` · `key` 의 `A+LeftShift`(꼴은 control_cli `src/game.ts`). `at` 은 주소 글자 또는 `{x, y}`, 시간은 초. 모두 SDK 한 명령이라 되풀이는 없다
- P2-B — `findAll` · `findAt` · `parent` · `waitForProp` · `components` · `members` · `setText`, `find` · `get` · `set` · `callMethod` · `click` · `drag` 의 마지막 옵션 `{ inactive?, camera? }`, `screenshot(format)`(꼴은 control_cli `src/game.ts`). `parent` · `waitForProp` 은 바깥 되풀이라 kit 에도 같은 되풀이가 든다. 선택자는 SDK 가 풀어 kit 은 글자를 그대로 넘긴다
- P2-A — `callMethod` · `set` · `callStatic` · `getStatic` · `setStatic` · `pref` · `setPref` · `deletePref` · `clearPrefs` · `timeScale` · `setTimeScale` · `scenes` · `loadScene` · `unloadScene` · `waitForScene`(꼴은 control_cli `src/game.ts`). `loadScene` · `unloadScene` · `waitForScene` 은 `scenes` 를 되풀이하는 바깥 기다리기라 kit 에도 같은 되풀이가 든다
