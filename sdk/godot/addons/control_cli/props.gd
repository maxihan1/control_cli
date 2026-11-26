# 노드 칸 읽기 · 쓰기 · 메서드 부르기 · static(autoload · 엔진 싱글턴 · class_name 스크립트) · 컴포넌트 · 멤버 목록 · 값을 JSON 꼴로
extends RefCounted

const Nodes := preload("nodes.gd")

static func ok(fields: Dictionary = {}) -> Dictionary:
	var d := {"ok": true}
	d.merge(fields)
	return d

static func fail(message: String) -> Dictionary:
	return {"ok": false, "error": message}

# Godot 값 → JSON 값 — 벡터 · 색은 숫자 배열, 노드는 이름, 리소스는 경로.
static func plain(v):
	match typeof(v):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_STRING:
			return v
		TYPE_FLOAT:
			return v if is_finite(v) else str(v)
		TYPE_VECTOR2, TYPE_VECTOR2I:
			return [v.x, v.y]
		TYPE_VECTOR3, TYPE_VECTOR3I:
			return [v.x, v.y, v.z]
		TYPE_VECTOR4, TYPE_VECTOR4I, TYPE_QUATERNION:
			return [v.x, v.y, v.z, v.w]
		TYPE_COLOR:
			return [v.r, v.g, v.b, v.a]
		TYPE_RECT2, TYPE_RECT2I:
			return [v.position.x, v.position.y, v.size.x, v.size.y]
		TYPE_DICTIONARY:
			var out := {}
			for k in v:
				out[str(k)] = plain(v[k])
			return out
		TYPE_OBJECT:
			if not is_instance_valid(v):
				return null
			if v is Node:
				return String(v.name)
			if v is Resource and v.resource_path != "":
				return v.resource_path
			return v.get_class()
	if typeof(v) >= TYPE_ARRAY:
		return Array(v).map(func(x): return plain(x))
	return str(v)

# 글자 → 지금 값(like)과 같은 타입. [true, 값] 또는 [false, 까닭].
static func parse(text: String, like) -> Array:
	var t := typeof(like)
	match t:
		TYPE_STRING:
			return [true, text]
		TYPE_STRING_NAME:
			return [true, StringName(text)]
		TYPE_BOOL:
			if text.to_lower() in ["true", "false"]:
				return [true, text.to_lower() == "true"]
		TYPE_INT:
			if text.is_valid_int():
				return [true, text.to_int()]
		TYPE_FLOAT:
			if text.is_valid_float():
				return [true, text.to_float()]
		TYPE_NIL:
			var j = JSON.parse_string(text)
			return [true, text if j == null and text != "null" else j]
		_:
			var j = JSON.parse_string(text)
			if j is Array and j.all(func(x): return typeof(x) == TYPE_FLOAT):
				var v = _vector(t, j)
				if v != null:
					return [true, v]
	return [false, "「%s」은 %s 가 아닙니다" % [text, type_string(t)]]

static func _vector(t: int, a: Array):
	match [t, a.size()]:
		[TYPE_VECTOR2, 2]: return Vector2(a[0], a[1])
		[TYPE_VECTOR2I, 2]: return Vector2i(a[0], a[1])
		[TYPE_VECTOR3, 3]: return Vector3(a[0], a[1], a[2])
		[TYPE_VECTOR3I, 3]: return Vector3i(a[0], a[1], a[2])
		[TYPE_VECTOR4, 4]: return Vector4(a[0], a[1], a[2], a[3])
		[TYPE_QUATERNION, 4]: return Quaternion(a[0], a[1], a[2], a[3])
		[TYPE_COLOR, 3]: return Color(a[0], a[1], a[2])
		[TYPE_COLOR, 4]: return Color(a[0], a[1], a[2], a[3])
	return null

# JSON 인자 → 메서드 칸 타입. 글자는 parse, 숫자는 int · float 로.
static func _arg(v, t: int) -> Array:
	if v is String and t != TYPE_STRING and t != TYPE_NIL:
		return parse(v, _blank(t))
	if v is float and t == TYPE_INT:
		return [true, int(v)] if v == floorf(v) else [false, "%s 은 int 가 아닙니다" % v]
	if (v is float or v is int) and t == TYPE_STRING:
		return [true, str(v)]
	return [true, v]

static func _blank(t: int):
	match t:
		TYPE_BOOL: return false
		TYPE_INT: return 0
		TYPE_FLOAT: return 0.0
		TYPE_STRING_NAME: return &""
		TYPE_VECTOR2: return Vector2()
		TYPE_VECTOR2I: return Vector2i()
		TYPE_VECTOR3: return Vector3()
		TYPE_VECTOR3I: return Vector3i()
		TYPE_VECTOR4: return Vector4()
		TYPE_QUATERNION: return Quaternion()
		TYPE_COLOR: return Color()
	return null

# Unity 꼴 「컴포넌트.칸」도 받는다 — 앞 낱말이 노드 클래스 줄기에 있으면 뗀다(Label.text · TouchProbe.Say).
static func names(o: Object, path: String) -> PackedStringArray:
	var parts := path.split(".")
	if parts.size() > 1 and Nodes.classes(o).has(parts[0]):
		parts.remove_at(0)
	return parts

# 「칸[i][j]」 → [이름, [i, j]]. 대괄호 안이 정수가 아니면 [null, []].
static func _indexed(part: String) -> Array:
	var open := part.find("[")
	if open < 0:
		return [part, []]
	var at := []
	var rest := part.substr(open)
	while rest != "":
		var close := rest.find("]")
		var inner := rest.substr(1, close - 1) if close > 0 else ""
		if not rest.begins_with("[") or not inner.is_valid_int():
			return [null, []]
		at.append(inner.to_int())
		rest = rest.substr(close + 1)
	return [part.left(open), at]

# 칸 줄을 따라 읽는다 — [true, 값] 또는 [false, 까닭]. 배열은 [i]([-1] 은 마지막) · Count, 객체는 칸, 사전은 키, 벡터 · 색은 x · r 같은 칸.
static func _walk(o: Object, parts: PackedStringArray) -> Array:
	var v = o
	var shown := ""
	for part in parts:
		var r := _indexed(part)
		var k = r[0]
		if k == null:
			return [false, "%s — 원소 번호는 [0] · [-1] 처럼 정수로 씁니다" % part]
		if typeof(v) >= TYPE_ARRAY and k == "Count" and r[1].is_empty():
			v = v.size()
		elif v is Object and is_instance_valid(v) and k != "" and k in v:
			v = v.get(k)
		elif v is Dictionary and v.has(k):
			v = v[k]
		elif typeof(v) > TYPE_STRING and typeof(v) < TYPE_OBJECT and k in ["x", "y", "z", "w", "r", "g", "b", "a", "h", "s", "v", "position", "size", "end", "origin", "basis"]:
			v = v[k]
		elif shown == "":
			return [false, "%s 에 %s 칸이 없습니다%s" % [_label(o), ".".join(parts), _known(v)]]
		else:
			return [false, "%s 의 %s 에 %s 칸이 없습니다%s" % [_label(o), shown, k, _known(v)]]
		shown += ("." if shown != "" else "") + k
		for i in r[1]:
			if typeof(v) < TYPE_ARRAY:
				return [false, "%s 의 %s 은 배열이 아니라 [%d] 을 읽을 수 없습니다" % [_label(o), shown, i]]
			var j: int = i + v.size() if i < 0 else i
			if j < 0 or j >= v.size():
				return [false, "%s 의 %s 은 %d개라 [%d] 이 없습니다" % [_label(o), shown, v.size(), i]]
			v = v[j]
			shown += "[%d]" % i
	return [true, v]

# 칸 이름을 몰라 짐작하지 않게 있는 칸을 붙인다 — 스크립트 변수 · 사전 키.
static func _known(v) -> String:
	var names := []
	if v is Object and is_instance_valid(v) and v.get_script() != null:
		for p in v.get_script().get_script_property_list():
			if not (p["usage"] & (PROPERTY_USAGE_CATEGORY | PROPERTY_USAGE_GROUP | PROPERTY_USAGE_SUBGROUP)):
				names.append(p["name"])
	elif v is Dictionary:
		names = v.keys().map(func(k): return str(k))
	return "" if names.is_empty() else " — 있는 칸: " + " · ".join(names)

static func _label(o: Object) -> String:
	return str(o.get("name")) if o is Node else o.get_class()

static func get_prop(o: Object, path: String) -> Dictionary:
	var r := _walk(o, names(o, path))
	return ok({"value": plain(r[1])}) if r[0] else fail(r[1])

static func set_prop(o: Object, path: String, text: String) -> Dictionary:
	if "[" in path:
		return fail("%s — 목록 원소([i])는 읽기만 합니다" % path)
	var parts := names(o, path)
	var r := _walk(o, parts)
	if not r[0]:
		return fail(r[1])
	var np := NodePath(":".join(parts))
	var r := parse(text, o.get_indexed(np))
	if not r[0]:
		return fail(r[1])
	o.set_indexed(np, r[1])
	return ok({"value": plain(o.get_indexed(np))})

# 메서드 꼴 — 인자 수가 맞아야 부른다(틀린 수는 Godot 가 에러 로그를 남긴다).
static func _invoke(o: Object, name: String, info: Dictionary, args: Array) -> Dictionary:
	var want: Array = info.get("args", [])
	var optional: int = info.get("default_args", []).size()
	var vararg: bool = info.get("flags", 0) & METHOD_FLAG_VARARG != 0
	if not vararg and (args.size() > want.size() or args.size() < want.size() - optional):
		return fail("%s 은 인자 %d개를 받습니다(받은 것 %d개)" % [name, want.size(), args.size()])
	var given := []
	for i in args.size():
		var r := _arg(args[i], want[i]["type"] if i < want.size() else TYPE_NIL)
		if not r[0]:
			return fail(r[1])
		given.append(r[1])
	return ok({"value": plain(o.callv(name, given))})

static func _method(list: Array, name: String) -> Dictionary:
	for m in list:
		if m["name"] == name:
			return m
	return {}

static func call_on(o: Object, method: String, args: Array) -> Dictionary:
	var parts := names(o, method)
	if parts.size() != 1 or not o.has_method(parts[0]):
		return fail("%s 에 메서드 %s 이 없습니다(%s)" % [_label(o), method, " · ".join(Nodes.classes(o))])
	var list: Array = o.get_method_list()
	if o.get_script() != null:
		list = o.get_script().get_script_method_list() + list
	return _invoke(o, parts[0], _method(list, parts[0]), args)

# static 주소 「타입.칸」의 타입 — autoload 노드 · 엔진 싱글턴(Engine · OS …) · class_name 스크립트 차례.
static func owner_of(path: String) -> Array:
	var dot := path.rfind(".")
	if dot <= 0:
		return [null, "", "%s 은 타입.칸 꼴이어야 합니다 — Engine.time_scale · TouchProbe.Add" % path]
	var type := path.left(dot)
	var member := path.substr(dot + 1)
	var auto := Nodes.tree().root.get_node_or_null(NodePath(type))
	if auto != null and auto != Nodes.sdk:
		return [auto, member, ""]
	if Engine.has_singleton(type):
		return [Engine.get_singleton(type), member, ""]
	for c in ProjectSettings.get_global_class_list():
		if c["class"] == type:
			return [load(c["path"]), member, ""]
	return [null, "", "타입 %s 이 없습니다(autoload · 엔진 싱글턴 · class_name 스크립트)" % type]

static func call_static(path: String, args: Array) -> Dictionary:
	var r := owner_of(path)
	if r[0] == null:
		return fail(r[2])
	var o = r[0]
	if o is Script:
		var info := _method(o.get_script_method_list(), r[1])
		if info.is_empty() or not (info["flags"] & METHOD_FLAG_STATIC):
			return fail("%s 에 static 메서드 %s 이 없습니다" % [path.left(path.rfind(".")), r[1]])
		return _invoke(o, r[1], info, args)
	return call_on(o, r[1], args)

static func get_static(path: String) -> Dictionary:
	var r := owner_of(path)
	return fail(r[2]) if r[0] == null else get_prop(r[0], r[1])

static func set_static(path: String, text: String) -> Dictionary:
	var r := owner_of(path)
	return fail(r[2]) if r[0] == null else set_prop(r[0], r[1], text)

# 붙은 것 — 엔진 클래스 하나 + 스크립트 줄기(class_name 또는 파일 이름 · 타입은 스크립트 경로).
static func components(n: Node) -> Dictionary:
	var list := [{"name": n.get_class(), "type": n.get_class()}]
	var s: Script = n.get_script()
	while s != null:
		list.append({"name": Nodes.script_name(s), "type": s.resource_path})
		s = s.get_base_script()
	return ok({"components": list})

static func _type(p: Dictionary) -> String:
	if p["type"] == TYPE_OBJECT:
		return p["class_name"] if p["class_name"] != "" else "Object"
	if p["type"] == TYPE_NIL:
		return "Variant" if p.get("usage", 0) & PROPERTY_USAGE_NIL_IS_VARIANT else "void"
	return type_string(p["type"])

static func _fields(list: Array, read: Callable) -> Array:
	var out := []
	for p in list:
		if p["usage"] & (PROPERTY_USAGE_CATEGORY | PROPERTY_USAGE_GROUP | PROPERTY_USAGE_SUBGROUP):
			continue
		out.append(_entry(p["name"], _type(p), read.call(p["name"])))
	return out

# 배열 칸에는 길이(count)를 붙인다 — 펼칠지 정할 때 본다.
static func _entry(name, type: String, v) -> Dictionary:
	var d := {"name": name, "type": type, "value": plain(v)}
	if typeof(v) >= TYPE_ARRAY:
		d["count"] = v.size()
	return d

static func _methods(list: Array) -> Array:
	var out := []
	for m in list:
		if String(m["name"]).begins_with("@"):
			continue
		var d := {"name": m["name"], "args": m["args"].map(func(a): return _type(a)), "returns": _type(m["return"])}
		if m["flags"] & METHOD_FLAG_STATIC:
			d["static"] = true
		out.append(d)
	return out

# 스크립트면 그 스크립트가 선언한 변수(fields) · 메서드, 엔진 클래스면 그 클래스만의 칸(properties) · 메서드 — 부모 클래스 칸은 뺀다.
static func members(n: Node, component: String) -> Dictionary:
	var s: Script = n.get_script()
	while s != null:
		if component in [Nodes.script_name(s), s.resource_path]:
			return ok({"fields": _fields(s.get_script_property_list(), func(k): return n.get(k)), "properties": [], "methods": _methods(s.get_script_method_list())})
		s = s.get_base_script()
	if n.is_class(component) and ClassDB.class_exists(component):
		return ok({"fields": [], "properties": _fields(ClassDB.class_get_property_list(component, true), func(k): return n.get(k)), "methods": _methods(ClassDB.class_get_method_list(component, true))})
	# 「컴포넌트.칸[i]…」 — 그 칸이 가리키는 것을 펼친다(Unity 와 같은 주소). 칸은 노드에서 바로 읽는다.
	var parts := component.split(".")
	if parts.size() > 1 and Nodes.classes(n).has(parts[0]):
		var r := _walk(n, parts.slice(1))
		return _describe(r[1], component) if r[0] else fail(r[1])
	return fail("%s 에 컴포넌트 %s 이 없습니다(%s)" % [n.name, component, " · ".join(Nodes.classes(n))])

# 칸이 가리키는 것을 members 형태로 — 객체는 스크립트 변수(fields) 또는 그 엔진 클래스 칸(properties), 사전은 키, 배열은 count · items.
static func _describe(v, what: String) -> Dictionary:
	if typeof(v) >= TYPE_ARRAY:
		return ok({"fields": [], "properties": [], "methods": [], "count": v.size(), "items": plain(v)})
	if v is Dictionary:
		var list := []
		for k in v:
			list.append(_entry(str(k), type_string(typeof(v[k])), v[k]))
		return ok({"fields": list, "properties": [], "methods": []})
	if v is Object and is_instance_valid(v):
		var s: Script = v.get_script()
		if s != null:
			return ok({"fields": _fields(s.get_script_property_list(), func(k): return v.get(k)), "properties": [], "methods": _methods(s.get_script_method_list())})
		var c: String = v.get_class()
		return ok({"fields": [], "properties": _fields(ClassDB.class_get_property_list(c, true), func(k): return v.get(k)), "methods": _methods(ClassDB.class_get_method_list(c, true))})
	if typeof(v) == TYPE_NIL:
		return fail("%s 이 null 입니다" % what)
	return fail("%s 은 값(%s)이라 펼칠 칸이 없습니다 — get 으로 읽습니다" % [what, JSON.stringify(plain(v))])
