# P6 Godot — 설계 · 구현 계획

로드맵은 [plan.md](plan.md) P6, 할 일 체크는 [checklist.md](checklist.md) P6, 결정은 [context-notes.md](context-notes.md) 「P6 설계」.

## Context

통신 꼴(한 줄 JSON · `ping` caps · relay)과 CLI · MCP · 드라이버는 엔진과 무관하다. Godot 에도 같은 꼴로 답하는 SDK 만 있으면 도구가 모두 따라온다. Godot 은 열린 소스 · 라이선스 없는 headless CI · 동적 `get` · `set` · `call` 이라 Unity 다음 엔진으로 가장 싸다(plan.md 「차례 까닭」).

## 그림

```
sdk/godot/addons/control_cli/      GDScript 애드온 — autoload 하나(ControlCli)
  control_cli.gd   TCP 13100 · relay(WebSocketPeer) · 명령 차례 · ping
  nodes.gd         트리 · 선택자(src/select.ts 를 옮김) · 화면 자리
  props.gd         get · set · call · static · components · members · 값 바꾸기
  fake_input.gd    Input.parse_input_event 로 터치 · 마우스 · 키 · 조이스틱 · 기울기
  game_state.gd    저장 값(ConfigFile) · 시간 배율 · 장면 · 알림 · 로그 통
  game_logger.gd   Logger(4.5+) — logs · errors

control-cli instrument <Godot 프로젝트>   project.godot 를 알아보고
  → GitHub <ref> 의 sdk/godot/addons/control_cli 를 받아 넣고 [autoload] · [control_cli] relay 를 쓴다

sample-godot/   표준 화면(Sample.tscn · Second.tscn) — Unity 표준 화면과 같은 이름 · 같은 반응
CI godot.yml    Godot 4.5 · 최신 판으로 xvfb 위에서 샘플을 띄워 conform · macOS 앱 export(결과물)
```

## 설계

1. **판** — Godot 4.5 이상. 스크립트에서 로그를 받는 `Logger`(`OS.add_logger`)가 4.5 부터라 logs · errors 가 그 아래로는 안 된다. CI 는 4.5(바닥)와 최신 판 둘
2. **낱말 표** — 오브젝트 = Node, 뿌리 = 열린 장면 뿌리 노드의 자식(+ autoload 노드), 「꺼짐」 = `is_visible_in_tree()` 가 거짓, 컴포넌트 = 노드 클래스 줄기 + 붙은 스크립트(`class_name`), tag = group(밑줄로 시작하는 엔진 group 은 뺌), layer = 이름 붙인 렌더 · 물리 layer, 영구 id = 열린 장면 파일 경로 + 그 뿌리부터의 노드 경로를 hash(실행 중 만든 노드는 instance id), 장면 = `.tscn` 파일 이름, 저장 값 = `ConfigFile`(`control_cli/prefs_file`, 기본 `user://prefs.cfg` · 키 `구역/키`, 구역이 없으면 `prefs`), 시간 배율 = `Engine.time_scale`, static = autoload · 엔진 싱글턴 · `class_name` 스크립트의 static
3. **칸 주소** — `[클래스.]칸[.칸…]`. 앞 낱말이 노드의 클래스(`Label.text`) · 스크립트 이름(`TouchProbe.Say`)이면 떼고 나머지를 `get_indexed`(`position.y` → `position:y`)로. Unity 의 `컴포넌트.칸` 꼴을 그대로 받아 같은 시험 코드가 돈다
4. **자리** — 답은 Unity 와 같이 창 픽셀 · 왼쪽 아래 0,0. Control 은 `get_global_transform_with_canvas` · 3D 는 카메라 `unproject_position`, 둘 다 root 창의 늘이기(`get_final_transform`)를 지난다. 가짜 입력은 창 픽셀로 `Input.parse_input_event` 에 넣는다
5. **가짜 입력** — 손가락 = `InputEventScreenTouch` · `ScreenDrag`(번호 10~19 → index 0~9). 단추 · Control 은 Godot 의 「터치로 마우스 흉내」(`emulate_mouse_from_touch`, 기본 켬)로 눌린다. 마우스 옮기기 · 바퀴 · `Mouse0~4` 는 마우스 이벤트, 키는 Unity KeyCode 이름 → Godot `Key`(LeftShift 는 `location`), `JoystickButton0~15` 는 패드 단추 · 16~19 는 스틱 축, 기울기는 `Input.set_accelerometer`(g × 9.80665). 다음 프레임에 처리되니 명령은 프레임을 기다려 답한다
6. **type** — 입력칸에 초점을 주고 글자마다 `InputEventKey(unicode)` 를 그 Viewport 에 바로 밀어 넣는다(`push_input`). 글자 수 · `text_changed` 거르기가 사람이 칠 때 차례 그대로. 화면 키보드는 그동안 끈다
7. **pointer** — down · up 은 그 Control 의 `gui_input` 신호 · `_gui_input` 만, enter · exit 은 `NOTIFICATION_MOUSE_ENTER/EXIT` — 부모로 안 올린다(AltTester 와 같음)
8. **relay** — `WebSocketPeer` 한 벌이 PC · 폰 · 웹 모두. 주소는 instrument 가 `project.godot` 의 `control_cli/relay` 에 굽고, 웹은 페이지 주소 `?controlcli=` 가 먼저(P3-B 와 같음)
9. **conform 엔진 표** — `ping.engine` 으로 표준 화면 낱말 표를 고른다(Unity 그대로 · Godot). Unity 에만 있는 UI(TMP · UI Toolkit)를 쓰는 줄은 Godot 에서 「미실행 — godot 표준 화면에 없음」. 같은 이름 형제를 못 두는 Godot 은 `Bag/Slot0~3` 이라 칸 주소도 표에서
10. **판** — CLI 0.12.0(instrument Godot · conform 엔진 표), Unity SDK 0.10.0 그대로, Godot SDK 0.1.0

## 맞출 수 없는 칸

- TMP · UI Toolkit 줄(type · click · get · text-set 의 Tmp* · Uitk*) — Godot UI 는 Control 한 벌
- 일시정지 알림 — PC 는 안 난다(Unity PC 와 같음). 폰(Android export)은 다음 칸

## 확인할 위험

- 가짜 마우스로 hover(`mouse_entered`)가 나나 — 진짜 마우스가 창 밖이면 Viewport 가 hover 를 안 셀 수 있다
- xvfb · Mesa llvmpipe(gl_compatibility)에서 화면 찍기 · 3D 자리
- Linux 러너에서 구운 macOS 앱(ad-hoc 서명)이 이 맥에서 뜨나

## 끝 기준

- CI `godot` 잡 — Godot 4.5 · 최신 판에서 샘플 conform 실패 0(미실행은 위 「맞출 수 없는 칸」만)
- 이 맥 — CI 의 macOS 앱을 `open --pc --app` 으로 conform 실패 0
- 웹 · Android 도 같은 PR 에서 — 이 맥 Chrome(relay) · RF9R408GKRR(USB) 47/0/6
