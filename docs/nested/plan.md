# 묶음 펼치기 · 목록 원소 읽기 — 계획 (2026-11-27)

요청서 `~/.claude/plans/control-cli-nested-members-request.md`(test_platform 감시 세션). Commander 게임 작성 AI 가 플레이 전에 적 · 설치물 능력치, 웨이브 구성을 읽으려는데, 칸이 ScriptableObject · 배열 · List 면 지금은 `"…WaveData[]"` 같은 글자만 나온다.

## 정한 형태 (사용자 2026-11-27 — Godot 도 같이 · 나머지는 추천안)

- 경로 문법 — `get` · `wait-prop` · `static-get` · `members` 의 칸 경로에 `[i]` 를 붙인다. `MonsterSpawner.WaveDatas[5].Monsters[0].MaxHP`. `[-1]` 은 마지막. 길이는 `.Count`(배열도 받는다, Unity 배열은 `.Length` 도)
- 펼치기 — `members <주소> <컴포넌트>.<칸…>`. 컴포넌트 이름이 맞으면 예전처럼 그 컴포넌트, 아니면 가장 긴 앞부분이 컴포넌트이고 뒤가 칸 경로다. 답은 members 와 같은 형태(fields · properties · methods), 목록이면 `count` · `items` 가 붙는다. 칸 목록의 목록 칸에는 `count` 가 붙는다
- 읽기 전용 — `set` · `static-set` 경로에 `[` 가 있으면 SDK 가 「목록 원소는 읽기만」으로 거절한다
- 옛 SDK — `protocol/commands.json` 기능 `nested` 를 caps 에 싣는다. CLI 는 caps 에 `nested` 가 없으면 `[` 가 든 경로를 보내기 전에 거절하고, `members` 의 컴포넌트 칸에 점이 있는데 옛 SDK 가 실패하면 「칸 펼치기는 SDK 0.14.0 부터」를 붙여 던진다(점 든 전체 이름 컴포넌트는 옛 SDK 에서도 그대로 된다)
- 칸이 없을 때 — 그 타입의 칸 이름을 붙여 준다. 「코드 줄이기에서 빠졌을 수도」는 IL2CPP 빌드에서만 붙인다(Mono 는 정말 없는 것)

## 판

CLI 0.18.0 · Unity SDK 0.14.0 · Godot SDK 0.2.0. main 은 전달판 번호(CLI 0.17.0 · SDK 0.13.0)를 건너뛴다.

## 확인

- `npm test`(fake-game 이 `nested` 를 흉내 · CLI 옛 SDK 거절 · protocol 대조)
- conform 줄 「B 칸 경로 · 묶음 펼치기」 — 표준 화면 TouchProbe 에 `Data`(ScriptableObject · Godot Resource) · `Waves`(목록) · `Breaks`(float 배열)
- C# 컴파일 검사 · CI sample · godot 잡, 이 맥 macOS 샘플 conform
