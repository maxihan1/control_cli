# AltTester 기능 전부 + 여러 엔진 — 체크리스트

## ▶ 다음 세션은 여기부터 (2026-11-04)

- P2 끝 — 다음은 P2 묶음을 main 으로. PR #17~#18 은 `roadmap` 에 합쳐졌고, #19(`p2c` → `roadmap`) · #20(`p2d` → `p2c`, #19 가 합쳐지면 base 를 `roadmap` 으로)이 남았다. 그다음 `roadmap` → `unity-u8` … → main(PR #5~#14) 합치기 전 아래 「main 에 합치기 전에 정할 것」(instrument 기본 ref)을 사용자와 정한다. 그 뒤 P3~P10 병행(트랙마다 세션 · worktree · main 에서 브랜치 · 팜 폰 하나 — plan.md 「순차와 병행」)
- P2-D 끝 — draft PR #20 · sdk-compile run 41806656486 초록(meta · 2021.3 · 2022.3 · 6000.0) · sample run 41806656652 9개 잡 초록(macOS 옛 Input · Windows 잡은 러너 Docker 층 쓰기 실패로 한 번 다시). 팜 RF9R408GKRR 의 APK 넷(6000.0 옛 Input · 6000.0 Input System · 2022.3 둘 다 · 2021.3 옛 Input) 「통과 52 · 실패 0 · 미실행 0」, 이 맥 macOS 앱 둘(6000.0 옛 Input · Input System) 「통과 51 · 실패 0 · 미실행 1」(일시정지 줄 — PC 는 일시정지가 안 난다). AltTester 명령 목록 기준 68/68. 알림 이름 · 시각 칸 · 토큰 가리기는 Issue Bunker 정책과 맞췄다(context-notes 「P2-D 설계」)
- PR 만들기 — 자동 권한 판정이 PR 본문(다른 저장소 정책 문서 이름)을 「Data Exfiltration」으로 막은 적이 있다. 막히면 사용자가 `! gh pr create …` 로 만든다(P2-D)
- 팜 폰 — RF9R408GKRR 을 다시 써도 된다(사용자 「RF9R408GKRR 써도 됨」, 2026-11-04 P2-C 실기기 때). 세션마다 사용자가 정한 폰만 쓰고, 다 쓰면 `release`
- C# 컴파일 검사 — `.cache` 는 p2b worktree 에 받아 둔 것을 쓴다: `UNITY_REF_DIR=/Users/maxi.moff/Projects/control_cli/.claude/worktrees/p2b/tools/unity-compile-check/.cache python3 tools/unity-compile-check/check.py 6000.0`(없으면 `check.py fetch 6000.0`)
- P2-C 끝 — draft PR #19(`p2c` → `roadmap`) · sdk-compile run 41793375881 초록(meta · 2021.3 · 2022.3 · 6000.0) · sample run 41793375943 9개 잡 초록. 팜 RF9R408GKRR 의 APK 넷(6000.0 옛 Input · 6000.0 Input System · 2021.3 옛 Input · 2022.3 둘 다)과 이 맥 macOS 앱 둘(6000.0 옛 Input · Input System) 모두 conform 「통과 48 · 실패 0 · 건너뜀 0」(C 줄 15개 포함). 길게 누르기 명령은 `long-press`(세션 `hold` 와 겹쳐)
- P2-B 끝 — draft PR #18(`p2b` → `roadmap`) · sdk-compile run 41759126717 초록(meta · 2021.3 · 2022.3 · 6000.0). 팜 RF9R408GKRR 에서 sample run 41759126839 의 6000.0 옛 Input APK · 6000.0 Input System APK · 2021.3 옛 Input APK 모두, 이 맥 macOS 앱(같은 run 의 StandaloneOSX · Mono)도 conform 「통과 33 · 실패 0 · 건너뜀 0」(B 줄 10개 포함). sample run 8개 잡 모두 초록. 영구 id 빌드 훅은 sample 로그에 「Assets/Second.unity 오브젝트 1/1개에 영구 id」 — `GlobalObjectId` 가 장면을 굽는 중에도 번호를 준다. 이 맥에서도 Docker 로 C# 컴파일 검사가 된다(`tools/unity-compile-check/check.py fetch 6000.0` 뒤 `check.py 6000.0`)
- 팜 연결 — 팜은 이 맥에서 돈다(`http://127.0.0.1:4723/wd/hub`, 밖에서는 `https://farm.maxihan.com/wd/hub`). **토큰은 묻지 않는다** — control-cli 가 `--token` · `PLATFORM_APPIUM_TOKEN` 이 없으면 macOS Keychain `control-cli-farm`(사용자 maxi 의 PAT, 2026-11-04 넣음)을 읽는다. 401 이면 사용자가 새 PAT 를 복사해 두고 세션이 pbpaste → whoami 200 → Keychain 에 넣는다(context-notes 「P2-B 구현」)
- macOS 시험은 `caffeinate -d -u -t 900` — 잠금 화면은 `-d` 만으로는 13초 만에 화면을 꺼 Unity 가 멈춘다(context-notes 「P1 실기기」)
- main 에 합치기 전에 정할 것 — `instrument` 의 기본 ref `main` 과 UPM 경로 `?path=/sdk/unity` 가 엇갈린다(main 에 `sdk/unity/` 가 생기기 전엔 새 CLI 가, 생긴 뒤엔 옛 CLI 의 `?path=/sdk#main` 이 깨진다). 기본 ref 를 CLI 판 tag(`v0.3.0`)로 두는 안 — context-notes 「P0 코드 리뷰」. README MCP 절의 `npm i -g …#<태그>` 도 그때 정한 tag 로
- 차례 — P0 바탕 → P1 MCP → P2 Unity 를 AltTester 와 똑같이 → P3 relay · WebGL · Linux → P4 드라이버 → P5 인스펙터 · Recorder → P6~P10 엔진(맨 뒤 — 사용자 결정)
- P0 → P1 → P2 는 순차, P3~P10 은 P2 가 main 에 합쳐진 뒤 병행(트랙마다 세션 · worktree · 팜 폰 하나 — plan.md 「순차와 병행」)
- 브랜치 — `roadmap`(`unity-u8` 위). P0~P2 는 단계마다 브랜치 하나 · PR 하나(`p0` · `p1` · `p2a` …)를 앞 단계 위에 쌓고, P3 부터는 main 에서 트랙마다 따로
- 그 전에 Unity 넓히기 마무리(U0~U8 draft PR #5~#13 합치기 · `v0.2.0` · Ashveil 회귀 · 팜 안내 창) — [docs/unity/checklist.md](../unity/checklist.md)

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
- [ ] 설계 · 구현 계획
- [ ] `control-cli relay` — 게임이 WebSocket 으로 거는 길 · 원격 연결
- [ ] Unity WebGL 샘플 · 이 맥 브라우저에서 `conform`
- [ ] Linux 샘플 빌드 · `conform`
- [ ] iOS 역방향 연결

## P4. 드라이버
- [ ] 설계 · 구현 계획(생성기)
- [ ] Python · C# · Java · Robot — 언어마다 `conform` 을 그 언어로

## P5. 인스펙터 · Recorder
- [ ] 설계 · 구현 계획
- [ ] `control-cli inspect` — 트리 · 상세 · 스크린샷 · 누르면 명령
- [ ] Recorder — 단계 · assertion 기록 → TS · Python · C# · Java · Robot 테스트
- [ ] 기록 돌리기 · 마지막 연결 기억

## P6. Godot
- [ ] 설계 · 구현 계획(Godot 4.3+ · 엔진 낱말 표 확정)
- [ ] `sdk/godot/` 애드온 · instrument
- [ ] 표준 화면 · CI headless export(Android · PC · 웹)
- [ ] `conform` 초록 · 맞출 수 없는 칸 표에 적기

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
- P2-D — `logs(since)` · `events(since)` · `sdkLog(on)`(꼴은 control_cli `src/game.ts` 의 `GameLogs` · `GameEvents`). 게임 증적 `game-errors.txt` 는 `e.time` 대신 `e.occurredAt ?? e.time` 으로 옮긴다(SDK 0.7.0 이 둘 다 준다 — `time` 은 나중에 뗀다). 같은 자리에 `game-logs.txt`(`logs(since)` — Warning 까지, 케이스 실패 때 앞뒤 사정) · 알림 줄을 남기는 안. 증적 머리의 「들고 있는 수(200)」는 logs 면 500
- P2-C — `touchDown` · `touchMove` · `touchUp` · `swipe` · `longPress` · `mouseMove` · `scroll` · `keyDown` · `keyUp` · `tilt` · `pointer` · `resetInput`, `click` · `tap` 의 `{ count?, interval? }` · `drag` 의 `{ via?, duration? }` · `key` 의 `{ duration?, power? }` · `key` 의 `A+LeftShift`(꼴은 control_cli `src/game.ts`). `at` 은 주소 글자 또는 `{x, y}`, 시간은 초. 모두 SDK 한 명령이라 되풀이는 없다
- P2-B — `findAll` · `findAt` · `parent` · `waitForProp` · `components` · `members` · `setText`, `find` · `get` · `set` · `callMethod` · `click` · `drag` 의 마지막 옵션 `{ inactive?, camera? }`, `screenshot(format)`(꼴은 control_cli `src/game.ts`). `parent` · `waitForProp` 은 바깥 되풀이라 kit 에도 같은 되풀이가 든다. 선택자는 SDK 가 풀어 kit 은 글자를 그대로 넘긴다
- P2-A — `callMethod` · `set` · `callStatic` · `getStatic` · `setStatic` · `pref` · `setPref` · `deletePref` · `clearPrefs` · `timeScale` · `setTimeScale` · `scenes` · `loadScene` · `unloadScene` · `waitForScene`(꼴은 control_cli `src/game.ts`). `loadScene` · `unloadScene` · `waitForScene` 은 `scenes` 를 되풀이하는 바깥 기다리기라 kit 에도 같은 되풀이가 든다
