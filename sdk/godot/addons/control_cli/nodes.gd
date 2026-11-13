# 노드 트리 · 주소(선택자 — src/select.ts 를 옮김) · 화면 자리(창 픽셀, 왼쪽 아래 0,0)를 맡는다
extends RefCounted

const KEYS := ["name", "tag", "layer", "component", "text", "id"]

# 트리에서 빼는 SDK autoload — control_cli.gd 가 넣는다.
static var sdk: Node
# scene-load add 로 연 장면 뿌리 — 지금 장면(current_scene)과 함께 「열린 장면」이다.
static var added: Array[Node] = []

static func tree() -> SceneTree:
	return Engine.get_main_loop() as SceneTree

# 열린 장면 뿌리 — 지금 장면이 먼저.
static func scenes() -> Array[Node]:
	var out: Array[Node] = []
	var cs := tree().current_scene
	if cs != null:
		out.append(cs)
	for r in added:
		if is_instance_valid(r) and r.is_inside_tree():
			out.append(r)
	return out

# 장면 이름 — Unity 처럼 장면 파일 이름(Sample.tscn → Sample). 파일이 없으면 노드 이름.
static func scene_name(n: Node) -> String:
	return n.scene_file_path.get_file().get_basename() if n.scene_file_path != "" else String(n.name)

static func shown(n) -> bool:
	return not ("visible" in n) or n.visible

# 뿌리 — 열린 장면 뿌리 노드의 자식들 + 그 밖의 /root 자식(autoload). SDK 는 뺀다.
static func roots(all: bool) -> Array:
	var open := scenes()
	var out := []
	for n in tree().root.get_children():
		if n == sdk:
			continue
		if open.has(n):
			for k in n.get_children():
				if all or shown(k):
					out.append(k)
		elif all or shown(n):
			out.append(n)
	return out

static func children(n: Node, all: bool) -> Array:
	return n.get_children().filter(func(k): return all or shown(k))

# 줄 하나가 다 켜졌나 — 뿌리부터 하나라도 숨었으면 꺼짐.
static func active(trail: Array) -> bool:
	return trail.all(func(n): return shown(n))

# 클래스 줄기 — 스크립트 이름(class_name, 없으면 파일 이름)이 먼저, 그 뒤 엔진 클래스(Object 는 뺀다).
static func classes(n: Object) -> Array:
	var out := []
	var s: Script = n.get_script()
	while s != null:
		out.append(script_name(s))
		s = s.get_base_script()
	var c := n.get_class()
	while c != "" and c != "Object":
		out.append(c)
		c = ClassDB.get_parent_class(c)
	return out

static func script_name(s: Script) -> String:
	var g := String(s.get_global_name())
	return g if g != "" else s.resource_path.get_file().get_basename()

static func attr(n: Node, key: String) -> Array:
	match key:
		"name":
			return [String(n.name)]
		"tag":
			# 엔진 · 에디터가 붙이는 group 은 밑줄로 시작한다.
			return n.get_groups().map(func(g): return String(g)).filter(func(g): return not g.begins_with("_"))
		"layer":
			return layers(n)
		"component":
			return classes(n)
		"text":
			var t = text_of(n)
			return [] if t == null else [t]
		"id":
			return [id_of(n)]
	return []

# 이름 붙인 layer(프로젝트 설정 layer_names) — 물리는 collision_layer, 그림은 layers · visibility_layer.
static func layers(n) -> Array:
	var out := []
	var pairs := []
	if n is CollisionObject3D:
		pairs.append(["3d_physics", n.collision_layer])
	if n is CollisionObject2D:
		pairs.append(["2d_physics", n.collision_layer])
	if n is VisualInstance3D:
		pairs.append(["3d_render", n.layers])
	if n is CanvasItem:
		pairs.append(["2d_render", n.visibility_layer])
	for p in pairs:
		for i in 32:
			if p[1] & (1 << i):
				var name := str(ProjectSettings.get_setting("layer_names/%s/layer_%d" % [p[0], i + 1], ""))
				if name != "" and not out.has(name):
					out.append(name)
	return out

# 영구 id — 열린 장면 파일에 저장된 노드는 「장면 파일 :: 뿌리부터 경로」의 hash 라 다시 열어도 같다. 실행 중 만든 노드는 instance id.
static func id_of(n: Node) -> String:
	var top := n
	while top.owner != null:
		top = top.owner
	if top.scene_file_path != "" and scenes().has(top):
		return str((top.scene_file_path + "::" + str(top.get_path_to(n))).hash())
	return str(n.get_instance_id())

static func text_of(n):
	if n is LineEdit:
		return "***" if n.secret and n.text != "" else n.text
	if n is RichTextLabel:
		return n.get_parsed_text()
	if "text" in n and typeof(n.get("text")) == TYPE_STRING:
		return n.get("text")
	return null

# 누를 수 있는 것의 종류 — 창 훑기 · tree 가 누를 것을 고른다.
static func kind_of(n) -> String:
	if n is BaseButton or n is LineEdit or n is TextEdit or n is Slider or n is SpinBox:
		return n.get_class()
	return ""

static func interactable(n) -> bool:
	if n is BaseButton:
		return not n.disabled
	if n is LineEdit or n is TextEdit or n is Slider or n is SpinBox:
		return n.editable
	return false

static func dump() -> Array:
	return roots(false).map(func(n): return _dump(n))

static func _dump(n: Node) -> Dictionary:
	var d := {"name": String(n.name)}
	var t = text_of(n)
	if t != null:
		d["text"] = t
	var k := kind_of(n)
	if k != "":
		d["kind"] = k
		d["interactable"] = interactable(n)
	var kids := children(n, false).map(func(c): return _dump(c))
	if not kids.is_empty():
		d["children"] = kids
	return d

# ── 주소 ──────────────────────────────────────────────

static func _bad(target: String, why: String) -> String:
	return "주소 %s 의 꼴이 틀렸습니다 — %s" % [target, why]

static func _re(p: String) -> RegEx:
	return RegEx.create_from_string(p)

# / 로 시작하지 않으면 이름 그대로(아래 어디서나 그 이름). 꼴이 틀리면 까닭 글자를 돌려준다.
static func steps(target: String):
	if target == "":
		return "주소가 비었습니다"
	if not target.begins_with("/"):
		return [{"raw": target, "deep": true, "name": target, "conds": [], "index": null}]
	var out := []
	var i := 0
	var digits := _re("^-?\\d+$")
	while i < target.length():
		var start := i
		var deep := target.substr(i, 2) == "//"
		i += 2 if deep else 1
		var name_start := i
		var name := ""
		while i < target.length() and target[i] != "/" and target[i] != "[":
			name += target[i]
			i += 1
		var step := {"raw": "", "deep": deep, "name": name, "conds": [], "index": null}
		while i < target.length() and target[i] == "[":
			var end := target.find("]", i)
			if end < 0:
				return _bad(target, "%s 를 닫는 ] 가 없습니다" % target.substr(i))
			var inside := target.substr(i + 1, end - i - 1)
			# 조건 · 순번 꼴이 아닌 [ ] 는 이름의 일부다([DOTween] · Slot[A]) — 단계 전체가 이름이고 끝의 [숫자]만 순번.
			if digits.search(inside) == null and not inside.begins_with("@") and not inside.begins_with("contains("):
				var slash := target.find("/", name_start)
				i = target.length() if slash < 0 else slash
				var whole := target.substr(name_start, i - name_start)
				var m := _re("^(.+)\\[(\\d+)\\]$").search(whole)
				step["name"] = m.get_string(1) if m else whole
				step["conds"] = []
				step["index"] = int(m.get_string(2)) if m else null
				break
			var problem = _cond(step, inside, target)
			if problem != null:
				return problem
			i = end + 1
		if i < target.length() and target[i] != "/":
			return _bad(target, "] 뒤에는 / 가 와야 합니다")
		if step["name"] == "":
			return _bad(target, "단계마다 이름이나 * 가 있어야 합니다 (예: //*[@tag=Player])")
		if step["name"] == ".." and (deep or not step["conds"].is_empty() or step["index"] != null):
			return _bad(target, ".. 은 /.. 꼴로만 씁니다")
		var raw := target.substr(start, i - start)
		while raw.begins_with("/"):
			raw = raw.substr(1)
		step["raw"] = raw
		out.append(step)
	return out

static func _cond(step: Dictionary, inside: String, target: String):
	if _re("^-?\\d+$").search(inside) != null:
		if step["index"] != null:
			return _bad(target, "순번이 둘입니다 [%s]" % inside)
		step["index"] = int(inside)
		return null
	var m := _re("(?s)^@(\\w+)=(.*)$").search(inside)
	if m == null:
		m = _re("(?s)^contains\\(@(\\w+),(.*)\\)$").search(inside)
	if m == null:
		return _bad(target, "[%s] 는 [@칸=값] · [contains(@칸,값)] · [순번] 중 하나여야 합니다" % inside)
	if not KEYS.has(m.get_string(1)):
		return _bad(target, "모르는 칸 @%s — %s" % [m.get_string(1), " · ".join(KEYS)])
	var value := m.get_string(2).strip_edges()
	var q := _re("(?s)^(['\"])(.*)\\1$").search(value)
	if q:
		value = q.get_string(2)
	step["conds"].append({"key": m.get_string(1), "value": value, "part": inside.begins_with("contains(")})
	return null

static func _fits(n: Node, s: Dictionary) -> bool:
	if s["name"] != "*" and String(n.name) != s["name"]:
		return false
	for c in s["conds"]:
		var hit := false
		for x in attr(n, c["key"]):
			if (c["part"] and x.contains(c["value"])) or (not c["part"] and x == c["value"]):
				hit = true
				break
		if not hit:
			return false
	return true

# 맞은 것마다 뿌리에서 그것까지의 줄(마지막이 맞은 것). 비면 stop 이 끊긴 단계 번호.
static func select(path: Array, all: bool) -> Dictionary:
	var trails := [[]]
	for k in path.size():
		var s: Dictionary = path[k]
		var next := []
		for t in trails:
			if s["name"] == "..":
				if t.size() > 1:
					next.append(t.slice(0, -1))
				continue
			# 형제 묶음마다 순번을 센다 — // 는 아래 모든 층의 묶음이다.
			var groups := []
			_gather(groups, t, roots(all) if t.is_empty() else children(t[-1], all), s["deep"], all)
			for g in groups:
				var hit: Array = g[1].filter(func(n): return _fits(n, s))
				if s["index"] == null:
					for n in hit:
						next.append(g[0] + [n])
				else:
					var at: int = s["index"] if s["index"] >= 0 else hit.size() + s["index"]
					if at >= 0 and at < hit.size():
						next.append(g[0] + [hit[at]])
		# 같은 것에 두 길로 닿으면(// 를 두 번 · 형제의 ..) 하나만 남긴다.
		var seen := {}
		trails = []
		for t in next:
			if not seen.has(t[-1]):
				seen[t[-1]] = true
				trails.append(t)
		if trails.is_empty():
			return {"trails": trails, "stop": k}
	return {"trails": trails}

static func _gather(groups: Array, trail: Array, under: Array, deep: bool, all: bool) -> void:
	groups.append([trail, under])
	if deep:
		for n in under:
			_gather(groups, trail + [n], children(n, all), deep, all)

# 줄을 SDK 가 받는 경로로 — 같은 이름 형제가 있으면 [순번](Godot 는 형제 이름이 겹치지 않아 뿌리끼리만).
static func path_of(trail: Array, all: bool) -> String:
	var level := roots(all)
	var out := ""
	for n in trail:
		var twins := level.filter(func(x): return x.name == n.name)
		out += "/" + (("%s[%d]" % [n.name, twins.find(n)]) if twins.size() > 1 else String(n.name))
		level = children(n, all)
	return out

# 한 것을 짚는 명령 — {trail} 또는 {problem, missing}. missing 이면 기다리기가 되풀이할 수 있다.
static func find(target: String, all: bool) -> Dictionary:
	var path = steps(target)
	if path is String:
		return {"problem": path, "missing": false}
	var r := select(path, all)
	var trails: Array = r["trails"]
	if trails.size() == 1:
		return {"trail": trails[0]}
	var bare := not target.begins_with("/")
	if trails.is_empty():
		var where := "" if bare or not r.has("stop") else " (%s 에서 끊김)" % path[r["stop"]]["raw"]
		return {"problem": "%s오브젝트 중에 %s 이 없습니다%s" % ["" if all else "켜진 ", target, where], "missing": true}
	if bare:
		return {"problem": "%s 이 %d개라 하나를 고를 수 없습니다 — 경로로 주소를 씁니다" % [target, trails.size()], "missing": false}
	return {"problem": "%s 에 맞는 것이 %d개라 하나를 고를 수 없습니다 — [순번] · 조건을 더하거나 find-all 로 경로를 봅니다" % [target, trails.size()], "missing": false}

static func find_all(target: String, all: bool):
	var path = steps(target)
	if path is String:
		return path
	return select(path, all)["trails"]

# 노드에서 뿌리까지 거슬러 올라간 줄 — 뿌리 밖(SDK · 열린 장면 뿌리 자신)이면 빈 배열.
static func trail_of(n: Node) -> Array:
	var tops := roots(true)
	var out := []
	while n != null:
		out.push_front(n)
		if tops.has(n):
			return out
		n = n.get_parent()
	return []

# ── 화면 자리 ─────────────────────────────────────────

static func screen() -> Vector2i:
	return tree().root.size

# 창 픽셀(왼쪽 위 0,0) ↔ 통신 꼴(왼쪽 아래 0,0) — 같은 셈이 두 쪽으로 간다.
static func flip(p: Vector2) -> Vector2:
	return Vector2(p.x, screen().y - p.y)

# Viewport 자리 → 창 픽셀. root 창의 늘이기(stretch)를 지난다.
static func to_window(vp: Viewport, p: Vector2) -> Vector2:
	return vp.get_final_transform() * p

static func from_window(vp: Viewport, p: Vector2) -> Vector2:
	return vp.get_final_transform().affine_inverse() * p

# 누를 자리(통신 꼴) — Control 은 가운데, Node2D 는 자리, Node3D 는 카메라에 비친 자리. 없으면 null.
static func point(n, cam: Camera3D = null):
	var vp: Viewport = n.get_viewport()
	if n is Control:
		return flip(to_window(vp, n.get_global_transform_with_canvas() * (n.size / 2)))
	if n is Node2D:
		return flip(to_window(vp, n.get_global_transform_with_canvas().origin))
	if n is Node3D:
		var c := cam if cam != null else vp.get_camera_3d()
		if c == null or c.is_position_behind(n.global_position):
			return null
		return flip(to_window(vp, c.unproject_position(n.global_position)))
	return null

# 화면 사각형 [x, y, w, h](통신 꼴) — Control 은 제 사각형, Node3D 는 자신과 아래 VisualInstance3D 의 AABB 를 비춘 것. 없으면 null.
static func box(n, cam: Camera3D = null):
	var vp: Viewport = n.get_viewport()
	var pts := []
	if n is Control:
		var xf: Transform2D = n.get_global_transform_with_canvas()
		for c in [Vector2.ZERO, Vector2(n.size.x, 0), Vector2(0, n.size.y), n.size]:
			pts.append(flip(to_window(vp, xf * c)))
	elif n is Node3D:
		var c := cam if cam != null else vp.get_camera_3d()
		if c == null:
			return null
		for v in [n] + n.find_children("*", "VisualInstance3D", true, false):
			if not (v is VisualInstance3D) or not v.is_visible_in_tree():
				continue
			var aabb: AABB = v.global_transform * v.get_aabb()
			for i in 8:
				var corner := aabb.get_endpoint(i)
				if not c.is_position_behind(corner):
					pts.append(flip(to_window(vp, c.unproject_position(corner))))
	if pts.is_empty():
		return null
	var r := Rect2(pts[0], Vector2.ZERO)
	for p in pts:
		r = r.expand(p)
	return r

# 화면 좌표(통신 꼴)의 맨 위 — 마우스를 받는 Control(나중에 그린 것이 위) · 그다음 3D 물리 차례.
static func at(p: Vector2, cam: Camera3D) -> Node:
	var vp := tree().root
	var local := from_window(vp, flip(p))
	var hit: Node = null
	for n in _controls(roots(false)):
		if n.mouse_filter == Control.MOUSE_FILTER_IGNORE:
			continue
		var q: Vector2 = n.get_global_transform_with_canvas().affine_inverse() * local
		if Rect2(Vector2.ZERO, n.size).has_point(q):
			hit = n
	if hit != null:
		return hit
	var c := cam if cam != null else vp.get_camera_3d()
	if c == null:
		return null
	var from := c.project_ray_origin(local)
	var query := PhysicsRayQueryParameters3D.create(from, from + c.project_ray_normal(local) * c.far)
	var r := c.get_world_3d().direct_space_state.intersect_ray(query)
	return r.get("collider") as Node if not r.is_empty() else null

static func _controls(under: Array) -> Array:
	var out := []
	for n in under:
		if n is Control:
			out.append(n)
		out.append_array(_controls(children(n, false)))
	return out

# ── 창 훑기 ───────────────────────────────────────────

# 누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치는지 — 부모 · 자식 사이는 겹침으로 안 본다.
static func layout(target: String) -> Dictionary:
	var under := roots(false)
	if target != "":
		var f := find(target, false)
		if not f.has("trail"):
			return {"ok": false, "error": f["problem"]}
		under = [f["trail"][-1]]
	var items := []
	for n in _all(under):
		if kind_of(n) == "":
			continue
		var r = box(n)
		if r != null:
			items.append([n, r])
	var size := screen()
	var safe := Rect2(Vector2.ZERO, Vector2(size))
	if OS.has_feature("mobile"):
		var area := DisplayServer.get_display_safe_area()
		safe = Rect2(flip(Vector2(area.position.x, area.end.y)), Vector2(area.size))
	var problems := []
	for i in items.size():
		var a = items[i]
		if not safe.encloses(a[1]):
			problems.append({"kind": "outside", "name": String(a[0].name), "path": _path(a[0]), "rect": _rect(a[1])})
		for j in range(i + 1, items.size()):
			var b = items[j]
			if a[1].intersects(b[1]) and not a[0].is_ancestor_of(b[0]) and not b[0].is_ancestor_of(a[0]):
				problems.append({"kind": "overlap", "name": String(a[0].name), "path": _path(a[0]), "other": String(b[0].name), "otherPath": _path(b[0])})
	return {"ok": true, "screen": [size.x, size.y], "safeArea": _rect(safe), "checked": items.size(), "problems": problems}

static func _all(under: Array) -> Array:
	var out := []
	for n in under:
		out.append(n)
		out.append_array(_all(children(n, false)))
	return out

static func _path(n: Node) -> String:
	return path_of(trail_of(n), false)

static func _rect(r: Rect2) -> Array:
	return [roundi(r.position.x), roundi(r.position.y), roundi(r.size.x), roundi(r.size.y)]
