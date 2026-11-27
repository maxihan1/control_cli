# 묶음 펼치기 · 목록 원소 읽기 — 맥락 노트

- 2026-11-27 사용자 답 — 「Godot 도 같이」. 명령 형태 · 경로 문법은 답이 없어 추천안(members 넓히기 · `[i]`)으로 갔다
- 새 명령 `expand` 대신 members 를 넓혔다 — 요청서 예가 `members <주소> MonsterAI.TypeData` 이고, get 경로와 같은 글자를 그대로 쓰면 외울 것이 없다. 대가로 옛 SDK 거절이 caps 기능(`nested`)과 실패 글 덧붙이기 둘로 나뉜다
- 목록 원소는 `IList`(배열 · List<T>)만 — 리플렉션 없이 `list[i]` · `ICollection.Count` 로 읽어 IL2CPP 코드 줄이기와 상관없다. Dictionary · HashSet 은 요청에 없어 뺐다
- 칸이 원래 없는 것과 빠진 것 — 실행 중에는 가를 수 없다(빠진 칸은 리플렉션에도 안 보인다). 대신 있는 칸 이름을 붙이고, IL2CPP 빌드에서만 「빠졌을 수도」를 붙인다. Unity 직렬화 칸(public · [SerializeField])은 코드 줄이기에서 안 빠진다
