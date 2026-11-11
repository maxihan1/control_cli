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
