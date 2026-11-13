# 저장 값(ConfigFile) · 시간 배율 · 장면 열기 · 닫기 · 목록 · 알림과 로그 통(errors · logs · events)
extends RefCounted

const Nodes := preload("nodes.gd")

# 번호를 붙여 최근 것만 들고 있다가 「이 번호 뒤」를 돌려주는 통 — 로그는 다른 스레드에서도 넣는다.
class Feed:
	var key: String
	var keep: int
	var items := []
	var last := 0
	var gate := Mutex.new()

	func _init(k: String, n: int) -> void:
		key = k
		keep = n

	func add(fields: Dictionary) -> void:
		gate.lock()
		last += 1
		var d := {"seq": last}
		d.merge(fields)
		items.append(d)
		while items.size() > keep:
			items.pop_front()
		gate.unlock()

	# 게임이 다시 켜지면 번호가 1 부터 다시 센다 — 받아 둔 번호가 더 크면 다 주고 알린다.
	func since(n: int) -> Dictionary:
		gate.lock()
		var r := {"ok": true, "last": last}
		if n > last:
			r["restarted"] = true
			n = 0
		var out := []
		var dropped := 0
		for e in items:
			if e["seq"] <= n:
				continue
			if out.is_empty():
				dropped = e["seq"] - n - 1
			out.append(e)
		r[key] = out
		if dropped > 0:
			r["dropped"] = dropped
		gate.unlock()
		return r

static var errors := Feed.new("errors", 200)
static var logs := Feed.new("logs", 500)
static var events := Feed.new("events", 200)

# Issue Bunker 로그 규칙과 같다 — 영숫자 · _ · - 가 40자 넘게 이어진 토막(토큰 · 키)을 가린다.
static var _token := RegEx.create_from_string("[A-Za-z0-9_-]{40,}")

static func mask(s: String) -> String:
	return _token.sub(s, "***", true)

# Issue Bunker occurredAt 과 같은 꼴 — UTC, ms 3자리(JS toISOString 과 같다).
static func stamp() -> String:
	var t := Time.get_unix_time_from_system()
	return "%s.%03dZ" % [Time.get_datetime_string_from_unix_time(int(t)), int(fmod(t, 1.0) * 1000)]

# game_logger.gd 가 부른다 — 다른 스레드에서도 온다. type 은 Unity LogType 이름(Log · Warning · Error · Exception).
static func add_log(message: String, type: String, stack: String) -> void:
	var at := stamp()
	var fields := {"occurredAt": at, "type": type, "message": mask(message), "stack": mask(stack)}
	logs.add(fields)
	if type == "Log" or type == "Warning":
		return
	# time 은 Unity SDK 0.7.0 전 꼴 — test_platform kit 증적 · 옛 CLI 가 읽는다.
	var e := {"time": at}
	e.merge(fields)
	errors.add(e)

static func event(type: String, fields: Dictionary = {}) -> void:
	var d := {"occurredAt": stamp(), "type": type}
	d.merge(fields)
	events.add(d)

# ── 장면 ──────────────────────────────────────────────

static var loads := 0
static var unloads := 0
static var _current_id := 0
static var _current_name := ""

# 매 프레임 — 게임이 스스로 바꾼 장면(change_scene_to_*)도 센다. 처음 장면도 한 번 열림이다(Unity sceneLoaded 와 같음).
static func tick() -> void:
	var cs := Nodes.tree().current_scene
	var id := cs.get_instance_id() if cs != null else 0
	if id == _current_id:
		return
	if _current_name != "":
		_closed(_current_name)
	_current_id = id
	_current_name = Nodes.scene_name(cs) if cs != null else ""
	if cs != null:
		loads += 1
		event("scene.loaded", {"scene": _current_name, "mode": "single"})

static func _closed(name: String) -> void:
	unloads += 1
	event("scene.unloaded", {"scene": name})

static func scenes() -> Dictionary:
	tick()
	return {"ok": true, "active": _current_name, "loaded": Nodes.scenes().map(func(n): return Nodes.scene_name(n)), "loads": loads, "unloads": unloads}

static var _files := []

# 장면 이름 → res:// 경로. 내보낸 빌드는 .tscn 이 .tscn.remap 으로 바뀌어 있다.
static func scene_path(name: String) -> String:
	if name.begins_with("res://"):
		return name if ResourceLoader.exists(name) else ""
	if _files.is_empty():
		_scan("res://")
	for f in _files:
		if f.get_file().get_basename() == name:
			return f
	return ""

static func _scan(dir: String) -> void:
	for d in DirAccess.get_directories_at(dir):
		if not d.begins_with("."):
			_scan(dir.path_join(d))
	for file in DirAccess.get_files_at(dir):
		var f := file.trim_suffix(".remap")
		if f.ends_with(".tscn") or f.ends_with(".scn"):
			_files.append(dir.path_join(f))

# 바로 답하고 장면은 뒤에 열린다(single 은 다음 프레임). 답의 loads 는 열기 전 수 — CLI 가 그보다 커질 때까지 기다린다.
static func load_scene(name: String, mode: String) -> Dictionary:
	if name == "":
		return {"ok": false, "error": "name 이 비었습니다"}
	if mode != "" and mode != "single" and mode != "add":
		return {"ok": false, "error": "mode 는 single · add 중 하나입니다"}
	var path := scene_path(name)
	if path == "":
		return {"ok": false, "error": "장면 %s 은 프로젝트에 없습니다(.tscn 파일 이름 · res:// 경로)" % name}
	var before := loads
	var tree := Nodes.tree()
	if mode == "add":
		var root: Node = load(path).instantiate()
		tree.root.add_child(root)
		Nodes.added.append(root)
		loads += 1
		event("scene.loaded", {"scene": Nodes.scene_name(root), "mode": "add"})
	else:
		for r in Nodes.added:
			if is_instance_valid(r):
				tree.root.remove_child(r)
				r.queue_free()
				_closed(Nodes.scene_name(r))
		Nodes.added.clear()
		tree.change_scene_to_file(path)
	return {"ok": true, "loads": before}

static func unload_scene(name: String) -> Dictionary:
	if name == "":
		return {"ok": false, "error": "name 이 비었습니다"}
	var before := unloads
	var tree := Nodes.tree()
	for r in Nodes.added:
		if Nodes.scene_name(r) == name:
			Nodes.added.erase(r)
			tree.root.remove_child(r)
			r.queue_free()
			_closed(name)
			return {"ok": true, "unloads": before}
	if name == _current_name and tree.current_scene != null:
		if Nodes.added.is_empty():
			return {"ok": false, "error": "마지막 장면 %s 은 닫을 수 없습니다" % name}
		var old := tree.current_scene
		var next: Node = Nodes.added.pop_front()
		tree.root.remove_child(old)
		old.queue_free()
		tree.current_scene = next
		_closed(name)
		_current_id = next.get_instance_id()
		_current_name = Nodes.scene_name(next)
		return {"ok": true, "unloads": before}
	return {"ok": false, "error": "열린 장면 중에 %s 이 없습니다" % name}

# ── 저장 값 ───────────────────────────────────────────

# 게임마다 저장 파일이 달라 프로젝트 설정 control_cli/prefs_file 로 고른다. 키는 「구역/키」, 구역이 없으면 prefs.
static func _prefs() -> ConfigFile:
	var cfg := ConfigFile.new()
	var path := _prefs_path()
	if FileAccess.file_exists(path):
		cfg.load(path)
	return cfg

static func _prefs_path() -> String:
	return str(ProjectSettings.get_setting("control_cli/prefs_file", "user://prefs.cfg"))

static func _split(key: String) -> Array:
	var i := key.rfind("/")
	return ["prefs", key] if i < 0 else [key.left(i), key.substr(i + 1)]

static func _typed(type: String) -> String:
	return "string" if type == "" else type if type in ["string", "int", "float"] else ""

const BAD_TYPE := "type 은 string · int · float 중 하나입니다"

static func pref_get(key: String, type: String) -> Dictionary:
	if key == "":
		return {"ok": false, "error": "key 가 비었습니다"}
	type = _typed(type)
	if type == "":
		return {"ok": false, "error": BAD_TYPE}
	var k := _split(key)
	var cfg := _prefs()
	if not cfg.has_section_key(k[0], k[1]):
		return {"ok": true, "found": false}
	var v = cfg.get_value(k[0], k[1])
	var number := typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT
	var value = (int(v) if number else 0) if type == "int" else (float(v) if number else 0.0) if type == "float" else str(v)
	return {"ok": true, "found": true, "value": value}

static func pref_set(key: String, text: String, type: String) -> Dictionary:
	if key == "":
		return {"ok": false, "error": "key 가 비었습니다"}
	type = _typed(type)
	if type == "":
		return {"ok": false, "error": BAD_TYPE}
	if type == "int" and not text.is_valid_int():
		return {"ok": false, "error": "「%s」은 int 가 아닙니다" % text}
	if type == "float" and not text.is_valid_float():
		return {"ok": false, "error": "「%s」은 float 가 아닙니다" % text}
	var k := _split(key)
	var cfg := _prefs()
	cfg.set_value(k[0], k[1], text.to_int() if type == "int" else text.to_float() if type == "float" else text)
	return _save(cfg)

static func pref_delete(key: String) -> Dictionary:
	if key == "":
		return {"ok": false, "error": "key 가 비었습니다"}
	var k := _split(key)
	var cfg := _prefs()
	if cfg.has_section_key(k[0], k[1]):
		cfg.erase_section_key(k[0], k[1])
	return _save(cfg)

static func pref_clear() -> Dictionary:
	return _save(ConfigFile.new())

static func _save(cfg: ConfigFile) -> Dictionary:
	var err := cfg.save(_prefs_path())
	return {"ok": true} if err == OK else {"ok": false, "error": "%s 에 쓰지 못했습니다(%s)" % [_prefs_path(), error_string(err)]}

# ── 시간 배율 ─────────────────────────────────────────

static func time_scale() -> Dictionary:
	return {"ok": true, "timeScale": Engine.time_scale}

static func set_time_scale(c: Dictionary) -> Dictionary:
	var s = c.get("scale")
	if not (s is float or s is int) or s < 0 or s > 100:
		return {"ok": false, "error": "scale 은 0~100 입니다"}
	Engine.time_scale = s
	return time_scale()
