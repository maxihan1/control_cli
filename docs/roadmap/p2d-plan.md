# P2-D Unity 알림 — 구현 계획 (Issue Bunker 정책과 통일)

로드맵은 [plan.md](plan.md) P2-D, 할 일 체크는 [checklist.md](checklist.md) P2-D, 결정은 [context-notes.md](context-notes.md) 「P2-D 설계」.

## Context

로드맵 P2-D(docs/roadmap/plan.md). AltTester 명령 목록으로 다시 세면 명령 64 + 알림 4 = 68이고, P2-C 뒤 control_cli 는 63/68 이다. 남은 다섯은 알림 넷(장면 열림 · 닫힘 · 로그 · 앱 일시정지)과 `SetServerLogging` 이다. 우리 통신은 요청-답 한 줄이라 밀어 주는 길이 없다. 그래서 알림은 `errors` 처럼 「이 번호 뒤만 가져가기」로 한다.

사용자 결정(2026-11-04).
- 명령은 `logs` + `events` 둘로 나눈다.
- `sdk-log on|off` 를 넣는다.
- Issue Bunker(`~/projects/bts`)의 정책을 다 읽고 최대한 통일한다.
- `errors` 에 `occurredAt` 을 더하고 `time` 은 남긴다.
- conform 의 「건너뜀」은 「미실행」으로 바꾼다.

끝 기준.
- 팜 Android APK 넷은 conform 「통과 52 · 실패 0 · 미실행 0」.
- 이 맥 macOS 앱 둘은 「통과 51 · 실패 0 · 미실행 1」이다. PC 는 SDK 가 `runInBackground` 를 켜 일시정지가 안 나므로 일시정지 줄이 미실행이다.
- 브랜치 `p2d` 는 `origin/p2c` 위에 있다(PR #19 가 아직 안 합쳐짐). worktree 는 `.claude/worktrees/p2d` 이고, PR 은 `roadmap` 으로 낸다.

## 설계 — Bunker 정책과 맞춘 것 · 안 맞춘 것

| 정할 것 | 고른 것 | Bunker 근거 |
|---|---|---|
| 알림 종류 이름 | `scene.loaded {scene, mode:'single'\|'add'}` · `scene.unloaded {scene}` · `game.paused` · `game.resumed` | `issue.<과거분사>` · 사실 하나에 이벤트 하나(IssueDomainEvent.kt:19) |
| 시각 칸 | `occurredAt` — UTC, ms 3자리(`yyyy-MM-ddTHH:mm:ss.fffZ`, JS `toISOString` 과 같음) | `occurredAt: Instant`(IssueDomainEvent · Slack 큐 계약 · webhook envelope) |
| `errors` | `occurredAt` 을 더하고 `time`(옛 `"o"` 꼴)은 남긴다 — kit `game-errors.txt` 가 `e.time` 을 읽는다 | 「nullable 칸을 더해 하위호환」(IssueDomainEvent.kt:86-90) |
| 토큰 가리기 | `logs` · `errors` 의 message · stack 에서 `[A-Za-z0-9_-]{40,}` 을 `***` 로 바꾼다. SDK 안에서 바꿔 폰 밖으로 원문이 안 나간다 | nginx-access-log-token-masking ADR :50 · DEVELOPMENT.md:18 「로그에 PII/비밀번호/토큰 출력 금지」 |
| `sdk-log` 줄 꼴 | `[ControlCli] type IdInput text=*** — 성공` · `[ControlCli] pref-set lv value=*** — 실패: <글>` | 프론트 `[모듈] 설명 — 결과 key=값`. 값은 빼지 않고 `***`(`passwordHash=***`) |
| `sdk-log` 이 적는 것 | 이름 칸(target · to · name · method · prop · key)은 그대로, 값 칸(text · value · args)은 `이름=***`. 실패 글 속 입력값도 `***` 로 바꾼다. 알림 읽기(`logs` · `events` · `errors`)와 `sdk-log` 자신은 안 적는다. 기본 꺼짐이고 게임을 다시 켜면 꺼진다 | prod 기본은 warn/error 만(frontend-logging ADR) |
| conform 결과 말 | `통과 N · 실패 N · 미실행 N`, 줄 끝 `(미실행 — 까닭)` | QA Hub 공통 UI 정책 §8 「통과 · 실패 · 미실행」 |
| 안 맞춤 — 껍데기 | `{ok, last, logs\|events, restarted?, dropped?}` · `since` · `seq` 그대로 | Bunker `{data, meta.page.next}` 는 최신순 페이지 넘기기다. 우리는 오래된 것부터 tail 을 따라간다. `dropped` 는 Bunker 의 「조용히 잘라내지 않는다」(IssueController.kt:85)와 같은 뜻이다 |
| 안 맞춤 — 목록 키 | `logs` · `events`(`items` 아님) | Bunker 안에서도 `data` · `items` 가 섞여 있다. 우리 `errors` 와 같은 꼴을 지킨다 |
| 안 맞춤 — 로그 `type` | Unity LogType 이름 그대로(Log · Warning · Error · Assert · Exception) | Bunker 에는 로그 항목 스키마가 없다 |

그 밖의 정할 것.
- 들고 있는 수는 errors 200 · logs 500 · events 200 이다.
- 듣기 시작은 `SubsystemRegistration` 이다. 첫 장면 열림과 SDK 가 서기 전 로그까지 잡힌다.
- 일시정지는 `ControlServer.OnApplicationPause` 에서 받는다. 상태가 바뀔 때만 적는다(Unity 가 켤 때 false 를 한 번 부른다). 멈춘 동안 명령은 10초 시간 초과가 나니 돌아온 뒤 `events` 로 본다.
- 판은 SDK · CLI 0.7.0 이고 protocol 2 그대로다(옛 SDK 는 caps 로 걸러진다).

## 파일

| 파일 | 하는 일 |
|---|---|
| `sdk/unity/Runtime/Feed.cs`(+ .meta 새로) | 번호 · 고리 · `Since`(restarted · dropped) · `Mask` · `Stamp` — 지금 `GameErrors.Since` 를 옮겨 셋이 같이 쓴다 |
| `sdk/unity/Runtime/GameErrors.cs` | `Errors`(200) · `Logs`(500) 두 Feed. OnLog 가 logs 엔 다, errors 엔 Log · Warning 빼고 넣는다 |
| `sdk/unity/Runtime/GameEvents.cs`(+ .meta 새로) | 장면 listener(`SubsystemRegistration`) · `Pause(bool)` |
| `sdk/unity/Runtime/SdkLog.cs`(+ .meta 새로) | `On` · `Write(Command, reply)` |
| `sdk/unity/Runtime/ControlServer.cs` | Caps 셋 더함 · `Command.on` · `Command` 를 internal 로 · `Request.Command` · Update 의 답 확정 세 곳에서 `SdkLog.Write` · `OnApplicationPause` · case `logs` · `events` · `sdk-log` · SdkVersion 0.7.0 |
| `sdk/unity/package.json` · `package.json` | 0.7.0 |
| `protocol/commands.json` | `logs` · `events` · `sdk-log {on: boolean}` |
| `sample/Assets/Sample/TouchProbe.cs` | `[Preserve] public static void Log(string text) => Debug.Log(text);`(conform D 로그 줄) |
| `src/game.ts` | `logs()` · `events()` · `sdkLog(on)` · 타입 `GameLog` · `GameEvent` · `GameLogs` · `GameEvents`, `GameErrors` 항목에 `occurredAt?` |
| `src/appium.ts` | `backgroundApp(c, sessionId, seconds)` — `POST /session/:id/execute/sync {script:'mobile: backgroundApp', args:[{seconds}]}`(팜 Appium 3.8 · UiAutomator2 8.7 은 execute/sync 를 넘긴다) |
| `src/conform.ts` | `ConformHooks {background?}` · Step 에 `needs?: 'background'` · D 4줄(`errors` 줄 앞) · 「미실행」 |
| `src/cli.ts` | `logs [번호]` · `events [번호]`(`errors` case 에 합침) · `sdk-log on\|off`(Ran: `game.sdkLog(true)`) · conform 에 `background`(Appium 세션이 있을 때) · HELP |
| `src/fake-game.ts` | 가짜 logs · events Feed(SDK 처럼 가리기), `background()`, 장면 열기 · 닫기 알림, sdk-log 줄(`handle` 을 `reply` 로 감쌈), `Sample.TouchProbe.Log`, 가짜 팜 `/wd/hub/session/S1/execute/sync` |
| 테스트 | `conform.test.ts`(52줄 · hook 없으면 미실행 1 · 「미실행」 글) · `cli.test.ts`(logs · events · sdk-log Ran 줄 · 팜 conform 52 · PC 51/0/1) · `protocol.test.ts`(Caps 자동) · `mcp.test.ts`(도구 목록 자동) |
| 문서 | README(명령 표 · SDK 명령 표 · MCP 도구 줄 · conform 결과 말) · `docs/roadmap/p2d-plan.md`(이 계획) · `plan.md` 1절 셈(63/68 → 68/68, 알림 줄 ✓) · `checklist.md` · `context-notes.md` 「P2-D 설계」(Bunker 정합 표 · 안 맞춘 까닭) · kit 다음 줄 P2-D |

## 핵심 코드

**Feed.cs** — `GameErrors.Since` 의 restarted · dropped 셈을 그대로 옮긴다. 항목은 `(seq, fields)`, fields 는 `,"occurredAt":…` 꼴(앞 쉼표 포함)로 넣을 때 만든다.
```csharp
private static readonly Regex Token = new Regex("[A-Za-z0-9_-]{40,}");   // Issue Bunker nginx 규칙
public static string Mask(string s) => string.IsNullOrEmpty(s) ? "" : Token.Replace(s, "***");
public static string Stamp(DateTime utc) => utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
public void Add(string fields) { lock (_gate) { _items.Enqueue((++_last, fields)); while (_items.Count > _keep) _items.Dequeue(); } }
public string Since(long since)  // {"ok":true,"last":N[,"restarted":true],"<key>":[{"seq":n<fields>}…][,"dropped":d]}
```
**GameErrors.OnLog** — `fields = ,occurredAt,type,message(Mask),stack(Mask)` 를 만든다. `Logs.Add(fields)` 하고, Log · Warning 이 아니면 `Errors.Add(",\"time\":" + now.ToString("o") + fields)` 한다. `Json.Str` 이 다른 스레드에서 불려도 되는지(공유 StringBuilder 없음) 먼저 본다.

**GameEvents** — `scene.loaded`(mode `add`/`single`) · `scene.unloaded` · `Pause(bool)` 가 바뀔 때만 `game.paused`/`game.resumed` 를 넣는다. 필드 이름은 `Items`(타입 `Feed` 와 겹치지 않게).

**SdkLog.Write(Command c, string reply)** — 이렇게 적는다.
- `On` 이 꺼져 있거나 `c` 가 null 이거나 Quiet 명령이면 적지 않는다.
- head 는 `[ControlCli] <cmd>` 뒤에 이름 칸 값과 값 칸 `k=***` 를 잇는다.
- 답은 `JsonUtility.FromJson<ReplyHead>`(ok · error)로 읽는다. 성공이면 `head — 성공`, 실패면 error 속 text · value · args 값을 `***` 로 바꿔 `head — 실패: …` 로 `Debug.Log` 한다.
- 값 칸은 비어 있지 않을 때만 싣는다(배열은 길이가 1 이상일 때). 가짜 SDK 도 같은 규칙이다.

ControlServer Update 에서 거는 곳은 다음과 같다.
- Handle 이 파싱한 Command 를 static `_parsed` 에 두고, `request.Command` 로 옮긴다.
- 답을 바로 낼 때와 미룬 답이 준비됐을 때 `SdkLog.Write` 를 부른다.
- 시간 초과로 거둘 때는 `Error("시간 초과")` 로 부른다.

**conform D 4줄**(`errors` 줄 앞). 줄마다 받아 둔 `last` 뒤만 보므로 다시 돌려도 앞 판 알림에 속지 않는다.
1. `D 장면 알림 — scene-load Second --add · scene-unload Second → scene.loaded · scene.unloaded`
   - cmds 는 `events` · `scene-load` · `scene-unload` · `scenes` 다.
   - 새 알림의 `scene.*` 가 `['scene.loaded Second add', 'scene.unloaded Second']` 이어야 한다.
2. `D 로그 — static-call Sample.TouchProbe.Log 'conform-<n> token=<x×48>' → Log 「conform-<n> token=***」`
   - cmds 는 `logs` · `static-call` 이다.
   - 가리기도 여기서 확인한다.
3. `D sdk-log — 켜면 type IdInput 이 「[ControlCli] type IdInput text=*** — 성공」, 끄면 안 남는다`
   - cmds 는 `sdk-log` · `logs` · `type` 이다.
   - 넣은 글자 `secret<n>` 이 어느 로그에도 없어야 한다.
4. `D 일시정지 알림 — 앱을 2초 뒤로 → game.paused · game.resumed`
   - cmds 는 `events`, needs 는 `background` 다.
   - `hooks.background()` 뒤 `poll` 로 확인하고, 돌아오는 동안 오는 `events` 실패는 빈 목록으로 본다.
   - hook 이 없으면 `- … (미실행 — 앱을 뒤로 보낼 길 없음: PC · iPhone · Appium 없는 USB)` 로 남긴다.

테스트 수는 이렇게 맞춘다. conform.test 는 `hooks = (g) => ({ background: async () => g.background() })` 를 넘겨 기존 수에 +4 통과로 고친다. caps 를 빼는 테스트는 D 줄 cmds 에 걸리는 만큼 미실행이 는다 — 돌려 보고 수를 하나씩 확인해 고친다.

## 차례 (커밋 단위)

1. **문서** — `docs/roadmap/p2d-plan.md` 에 이 계획을 옮기고, context-notes 「P2-D 설계」 · checklist P2-D 줄을 쓴다. 커밋 「P2-D 설계 · 구현 계획 — Issue Bunker 정책과 맞춤」.
2. **명령 정의 · TS** — commands.json, game.ts, fake-game.ts, conform.ts(D 4줄 · 미실행), cli.ts, appium.ts, 테스트를 고치고 `npm run -s build && node --test dist/{protocol,conform,cli,mcp}.test.js` 를 초록으로 만든다. protocol.test 는 C# Caps 를 고치기 전이라 빨갛다 — 3과 같은 커밋으로 묶거나 3을 먼저 한다.
3. **SDK** — Feed · GameErrors · GameEvents · SdkLog · ControlServer · .meta 셋 · 0.7.0 · 샘플 TouchProbe.Log. 이 맥 C# 컴파일은 `UNITY_REF_DIR=/Users/maxi.moff/Projects/control_cli/.claude/worktrees/p2b/tools/unity-compile-check/.cache python3 tools/unity-compile-check/check.py 6000.0` 로 초록을 보고, `node --test dist/protocol.test.js dist/sdk-meta.test.js` 를 돌린다.
4. **README** — 명령 · SDK 명령 표 · MCP 도구 줄 · conform 결과 말 · plan.md 1절 셈.
5. **push · draft PR** — `p2d` 를 `roadmap` 으로 올린다. 그 전에 전체 `npm test` 를 한 번 돌린다. sdk-compile · sample CI 가 초록이어야 한다(sample 은 약 40분).
6. **실기기**
   - 팜 RF9R408GKRR(checklist 「다시 써도 된다」)로 한다. 지금 팜에 「잡힌 폰 1대」가 있으니, 잡혀 있으면 사용자에게 묻는다.
   - sample run 결과물 APK 넷을 `hold --udid RF9R408GKRR` → `open --app` → `conform` → `close` 로 돌리고, 끝에 `release` 한다.
   - 이 맥은 `caffeinate -d -u -t 900` 을 건 채 macOS 앱 둘을 `open --pc --app` → `conform` 으로 돌린다.
7. **마무리** — checklist P2-D 를 [x] 로 고치고, 「다음 세션은 여기부터」를 P3 로 쓰고, context-notes 「P2-D 실기기」, kit 다음 줄 P2-D(`logs` · `events` · `sdkLog`, `errors` 의 `occurredAt` 으로 옮기기, 증적 `game-logs.txt` 제안)를 쓴다. push 한다.

## 검증

- 대상 테스트: `npm run -s build && node --test dist/protocol.test.js dist/conform.test.js dist/cli.test.js dist/mcp.test.js dist/sdk-meta.test.js`. 전체 `npm test` 는 push 전에 한 번.
- C# 은 이 맥 6000.0 compile check, 그다음 CI sdk-compile(2021.3 · 2022.3 · 6000.0)과 sample run 초록.
- 팜 APK 넷: 「통과 52 · 실패 0 · 미실행 0」. `open` 줄에 「SDK 0.7.0」이 나와야 한다.
- macOS 둘: 「통과 51 · 실패 0 · 미실행 1」.
- 손 확인(팜 한 번)
  - `sdk-log on` → `click LoginButton` → `logs <번호>` 에 `[ControlCli] click LoginButton — 성공` 이 있어야 한다.
  - `type PasswordInput x` 뒤에는 `text=***` 만 있어야 한다.
  - `events` 에 `scene.loaded Sample single` 이 있어야 한다(게임 켤 때 — SubsystemRegistration 효과).

## 시간

TS · SDK 구현과 테스트는 3~4시간이다. CI 는 약 1시간(sample 빌드)이다. 실기기는 APK 넷과 macOS 둘에 약 30분이다.
