# 오브젝트 화면 사각형 · 화면 찍기 실측 — 결정 노트

## 2026-11-11 rect 꼴
- **새 명령 대신 `find` 답 넓히기** — 이미 가운데(x · y)를 주고, kit 은 다룬 오브젝트를 `find` 로 다시 물으면 된다. `find-all` · `find-at` · `parent` 도 같은 `Found` 라 같이 받는다
- **`rect: [x, y, w, h]`** — `layout` 답의 `rect` 와 같은 배열 꼴 · 같은 좌표(왼쪽 아래 0,0). 정수 픽셀, 모서리를 반올림한 뒤 뺀 값이 w · h
- **`screen: [w, h]` 를 `Found` 마다** — `tree` 에도 있지만 `tree` 는 트리 전체를 덤프해 장면마다 묻기엔 무겁다. 게임이 `Screen.SetResolution` 으로 기기보다 낮게 그리면 Appium 스크린샷 크기와 다르므로 비율로 바꿀 값이 같은 답에 있어야 한다. find-all 에서 겹쳐 싣는 바이트는 무시할 만하다
- **화면 밖은 자르지 않는다** — x · y 도 지금 안 자른다. 그리는 쪽이 `screen` 으로 자른다

## 월드 오브젝트
- 켜진 렌더러(`GetComponentsInChildren<Renderer>`, `enabled`)의 bounds 를 다 합친다 — 캐릭터는 뿌리에 렌더러가 없고 몸 · 무기가 자식 렌더러 여럿이라 첫 렌더러만 보면 윤곽이 작다. 큰 파티클 · 그림자 판이 붙으면 커진다(코드에 `ponytail:` 표시)
- 누를 자리(x · y)는 그대로 첫 렌더러 가운데 — 누르기 동작을 안 바꾼다. 그래서 rect 가운데와 x · y 가 다를 수 있다
- 카메라 앞뒤에 걸친 상자 — 뒤 꼭짓점을 그대로 비추면 화면 반대편으로 뒤집힌다. 모서리 12개 중 near 면을 지나는 것은 near 면에서 자른 점을 쓴다(깊이는 월드 좌표의 1차식이라 선형 보간으로 맞다). 다 뒤면 rect 없음
- 렌더러가 없으면 rect 없음(콜라이더만 있는 오브젝트도)

## caps
- 지금까지 caps 는 명령 이름 목록이었고 「새 명령이 있으면 그 판의 새 칸도 안다」로 판을 갈랐다(`find-all` → 선택자, `touch-down` → 횟수). rect 는 새 명령이 없어 `commands.json` 에 `features` 를 두고 SDK `Caps` 는 명령 뒤에 기능 이름을 싣는다. `protocol.test.ts` 가 `[...COMMANDS, ...FEATURES]` 와 견준다
- 기능 이름은 명령 이름과 안 겹친다(테스트) — `Game.call` 의 `caps.includes(cmd)` 가 헷갈리지 않는다

## 2026-11-11 실기기 확인 · screenshot 실측
- **팜을 못 거쳤다** — 2026-11-04 토큰 정책(Auth_platform `docs/token-policy.md`)으로 사람 PAT 가 다 폐기돼 Keychain 의 PAT 가 401. control-cli 에는 CLI 브라우저 로그인이 아직 없다. 사용자가 「USB 로 바로」를 골라 이 맥에 꽂힌 RF9R408GKRR(SM-A325N · Android 13 · 1080×2400)에 adb 로 깔고 `open --usb` 로 붙었다. 팜 잡기 없이 썼다
- **conform** — PR #23 CI 샘플(6000.0 · 옛 Input · run 42949245895) APK, SDK 0.8.0 · caps 끝 `rect`. 통과 52 · 실패 0 · 미실행 1(일시정지 줄 — USB 는 앱을 뒤로 못 보냄). 새 줄 「find 의 rect 가 x,y 를 품는다」 통과
- **실제 답** —
  - `LoginButton`(uGUI) `{"x":270,"y":1630,"rect":[20,1560,500,140],"screen":[1080,2400]}`
  - `UitkLoginButton`(UI Toolkit) `{"x":540,"y":130,"rect":[40,90,1000,80],"screen":[1080,2400]}`
  - `WorldCube`(월드) `{"x":540,"y":680,"rect":[431,544,218,260],"screen":[1080,2400]}`
- **screenshot 실측**(같은 폰 · 샘플 30 FPS · 측정 스크립트는 job tmp `shot-bench.mjs` — 저장소에 안 넣음). 프레임 시간은 `static-get UnityEngine.Time.unscaledDeltaTime` 을 쉬지 않고 물어 표본을 얻었다

  | | SDK `screenshot` (jpg 80) | 게임 밖 `adb screencap` (Appium 과 같은 SurfaceFlinger 캡처) |
  |---|---|---|
  | 한 장 (adb forward 포함) | 가운데 235~251ms · 88KB (png 352~364ms · 118KB) | 가운데 713ms · png 86KB |
  | 찍을 때 가장 긴 게임 프레임 | **189ms**(평소 33ms — 약 5프레임 멈춤) | 33ms(멈춤 없음) |
  | 찍는 중에 보낸 find | 가운데 245~341ms · 가장 김 1.2초(평소 33ms) | 가운데 294ms(adb 길이 붐빔 — 게임은 안 멈춤) |
  | 1초마다 찍을 때 FPS | 30 → 25 (**-17%**) | 30 → 29.9 |

- **까닭** — `Capture` 가 메인 스레드에서 `ReadPixels`(GPU 기다림) · `EncodeToJPG` · Base64 를 한 프레임 안에 다 한다. 그동안 `_waiting` 이 다음 명령을 안 꺼내 click · find 도 기다린다
- **의견** — 1초마다 찍는 실시간 장면에는 **Appium 대신 쓰지 않는다**. 매초 게임이 0.19초 멈춰 끊김이 보이고, 그 사이 케이스 명령이 밀리며, 시간에 민감한 입력(drag duration · long-press)도 흔들릴 수 있다. 한 장씩 찍는 증거 스크린샷(케이스 끝 · 실패 때)에는 써도 된다 — 좌표가 게임 화면 기준이고 Appium 보다 빠르다
- **SDK 로 1초 장면을 하려면(이번에 안 함)** — `AsyncGPUReadback` 으로 읽고 `ImageConversion.EncodeArrayToJPG` 를 일꾼 스레드에서 하면 메인 스레드 멈춤이 거의 없어질 것으로 본다. 해상도를 반으로 줄여 찍는 칸도 같이. 재 보지 않았다
- 맥 PC 빌드 실측은 하지 않았다 — 폰 숫자로 결론이 났고 PC 는 장면 대상이 아니다
