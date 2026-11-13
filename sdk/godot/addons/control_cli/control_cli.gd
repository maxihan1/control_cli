# 게임 안 127.0.0.1:13100(와 relay)으로 JSON 명령 한 줄을 받아 메인 스레드에서 차례로 처리하고 JSON 한 줄로 답하는 autoload(ControlCli)
extends Node

const PORT := 13100
# sdk/godot/addons/control_cli/plugin.cfg 의 version 과 같다(src/protocol.test.ts 가 본다).
const SDK_VERSION := "0.1.0"
# protocol/commands.json 의 명령 이름과 같은 차례(src/protocol.test.ts 가 본다) — 명령 뒤는 기능(rect).
const CAPS := [
	"ping", "tree", "find", "click", "drag", "type", "get", "tap", "key", "screenshot", "errors", "layout",
	"call", "set", "static-call", "static-get", "static-set", "pref-get", "pref-set", "pref-delete", "pref-clear",
	"timescale-get", "timescale-set", "scenes", "scene-load", "scene-unload",
	"find-all", "find-at", "components", "members", "text-set",
	"touch-down", "touch-move", "touch-up", "swipe", "long-press", "mouse-move", "scroll", "key-down", "key-up", "tilt", "pointer", "input-reset",
	"logs", "events", "sdk-log",
	"rect",
]
const RETRY_MS := 2000

const Nodes := preload("nodes.gd")
const Props := preload("props.gd")
const FakeInput := preload("fake_input.gd")
const GameState := preload("game_state.gd")
const GameLogger := preload("game_logger.gd")

var _server: TCPServer
# 열린 TCP 연결 — [peer, 받다 만 바이트].
var _peers := []
# 받은 차례 — {line, answer}. 답을 미루는 명령(누르기 · 끌기 · 키 · 스크린샷)이 끝나야 다음을 꺼낸다.
var _queue := []
var _busy := false
var _sdk_log := false
var _ws: WebSocketPeer
var _relay_url := ""
var _relay_up := false
var _relay_told := false
var _relay_retry_at := 0

func _init() -> void:
	# 첫 장면보다 먼저 듣기 시작해야 켜지자마자 난 오류도 잡힌다.
	OS.add_logger(GameLogger.new())

func _ready() -> void:
	# 트리를 멈춰도(get_tree().paused) 명령은 받는다.
	process_mode = Node.PROCESS_MODE_ALWAYS
	Nodes.sdk = self
	if not OS.has_feature("web"):
		_server = TCPServer.new()
		var err := _server.listen(PORT, "127.0.0.1")
		if err == OK:
			print("[ControlCli] 127.0.0.1:%d 에서 명령을 받습니다" % PORT)
		else:
			push_warning("[ControlCli] 127.0.0.1:%d 를 열지 못했습니다(%s)" % [PORT, error_string(err)])
	var address := _page_address() if OS.has_feature("web") else ""
	if address == "":
		address = str(ProjectSettings.get_setting("control_cli/relay", "")).strip_edges()
	if address != "":
		_relay_url = address.trim_suffix("/") + "/game"
	elif OS.has_feature("web"):
		print("[ControlCli] relay 주소가 없습니다 — 페이지 주소에 ?controlcli=ws://<relay>:13101 을 붙이면 붙습니다")

func _notification(what: int) -> void:
	# 앱이 뒤로 가고 돌아올 때 — events 의 game.paused · game.resumed(폰).
	if what == NOTIFICATION_APPLICATION_PAUSED:
		GameState.event("game.paused")
	elif what == NOTIFICATION_APPLICATION_RESUMED:
		GameState.event("game.resumed")

func _process(_delta: float) -> void:
	GameState.tick()
	_poll_tcp()
	_poll_relay()
	while not _busy and not _queue.is_empty():
		_busy = true
		_run(_queue.pop_front())

func _poll_tcp() -> void:
	if _server == null:
		return
	while _server.is_connection_available():
		_peers.append([_server.take_connection(), PackedByteArray()])
	for p in _peers.duplicate():
		var peer: StreamPeerTCP = p[0]
		peer.poll()
		if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			_peers.erase(p)
			continue
		var n := peer.get_available_bytes()
		if n <= 0:
			continue
		# Packed 배열은 값으로 오간다 — 꺼내 고친 뒤 다시 넣는다.
		var buf: PackedByteArray = p[1]
		buf.append_array(peer.get_data(n)[1])
		var nl := buf.find(10)
		while nl >= 0:
			var line := buf.slice(0, nl).get_string_from_utf8()
			buf = buf.slice(nl + 1)
			_queue.append({"line": line, "answer": func(text: String): peer.put_data((text + "\n").to_utf8_buffer())})
			nl = buf.find(10)
		p[1] = buf

# relay — 못 붙거나 끊기면 2초마다 다시. 상태가 바뀔 때만 한 줄 남긴다.
func _poll_relay() -> void:
	if _relay_url == "":
		return
	if _ws == null:
		if Time.get_ticks_msec() < _relay_retry_at:
			return
		_ws = WebSocketPeer.new()
		# 스크린샷 답은 수 MB base64 다.
		_ws.outbound_buffer_size = 16 << 20
		_ws.inbound_buffer_size = 1 << 20
		if _ws.connect_to_url(_relay_url) != OK:
			_relay_down()
			return
	_ws.poll()
	match _ws.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			if not _relay_up:
				_relay_up = true
				_relay_told = false
				_ws.send_text("hello " + JSON.stringify(_hello(), "", false))
				print("[ControlCli] relay %s 에 붙었습니다" % _relay_url)
			while _ws.get_available_packet_count() > 0:
				var message := _ws.get_packet().get_string_from_utf8()
				var space := message.find(" ")
				if space <= 0:
					continue
				var number := message.left(space)
				var ws := _ws
				_queue.append({"line": message.substr(space + 1).strip_edges(), "answer": func(text: String): _relay_send(ws, number + " " + text)})
		WebSocketPeer.STATE_CLOSED:
			if _relay_up:
				print("[ControlCli] relay %s 와 끊겼습니다 — %d초마다 다시 겁니다" % [_relay_url, RETRY_MS / 1000])
			elif not _relay_told:
				print("[ControlCli] relay %s 에 붙지 못했습니다 — %d초마다 다시 겁니다" % [_relay_url, RETRY_MS / 1000])
				_relay_told = true
			_relay_down()

# 답할 때 이미 끊겼으면 버린다 — relay 가 CLI 에 「명령 중에 끊김」으로 알린다.
func _relay_send(ws: WebSocketPeer, text: String) -> void:
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(text)

func _relay_down() -> void:
	_ws = null
	_relay_up = false
	_relay_retry_at = Time.get_ticks_msec() + RETRY_MS

# 웹 — 페이지 주소 ?controlcli=<주소> 가 구운 주소보다 먼저(P3-B 와 같음).
func _page_address() -> String:
	var v = JavaScriptBridge.eval("new URLSearchParams(location.search).get('controlcli') || ''", true)
	return str(v).strip_edges() if v != null else ""

# ping 답에 플랫폼 · 기종 · 기기 이름 · 기기 id 를 더한다 — relay 는 <앱>@<기기 id 앞 8자>로 게임을 알아본다.
func _hello() -> Dictionary:
	var h := _ping()
	var id := ""
	if OS.has_feature("web"):
		# 탭마다 하나 — 같은 브라우저의 탭 둘이 같은 key 로 서로를 밀어내지 않게.
		id = str(JavaScriptBridge.eval("sessionStorage.controlcliTab || (sessionStorage.controlcliTab = Math.random().toString(36).slice(2) + Date.now().toString(36))", true))
	else:
		id = OS.get_unique_id()
	h.merge({"platform": OS.get_name(), "model": OS.get_model_name(), "device": OS.get_model_name(), "deviceId": id})
	return h

func _ping() -> Dictionary:
	return {
		"ok": true, "app": str(ProjectSettings.get_setting("application/config/name", "")), "version": str(ProjectSettings.get_setting("application/config/version", "")),
		"engine": "godot", "engineVersion": Engine.get_version_info()["string"], "sdkVersion": SDK_VERSION, "protocol": 2, "caps": CAPS,
	}

func _run(item: Dictionary) -> void:
	var c = JSON.parse_string(item["line"]) if item["line"].begins_with("{") else null
	var reply
	if c is Dictionary:
		reply = await _handle(c)
		# 스크립트 오류로 명령이 중간에 멎으면 null 이 온다 — 게임 로그(logs)에 까닭이 있다.
		if not (reply is Dictionary):
			reply = Props.fail("SDK 가 %s 을 처리하다 멈췄습니다 — logs 의 Error 를 봅니다" % c.get("cmd", ""))
	else:
		reply = Props.fail('명령은 JSON 한 줄이어야 합니다 — {"cmd":"ping"}')
		c = {}
	if _sdk_log:
		_write_sdk_log(c, reply)
	item["answer"].call(JSON.stringify(Props.plain(reply), "", false))
	_busy = false

# sdk-log — 이름 칸은 그대로, 값 칸(text · value · args)은 「이름=***」. 실패 글에 섞인 입력값도 ***(Unity SdkLog.cs 와 같은 줄).
func _write_sdk_log(c: Dictionary, reply: Dictionary) -> void:
	var cmd := str(c.get("cmd", ""))
	if cmd in ["logs", "events", "errors", "sdk-log"]:
		return
	var head := "[ControlCli] " + cmd
	for k in ["target", "to", "name", "method", "prop", "key"]:
		if str(c.get(k, "")) != "":
			head += " " + str(c[k])
	var secrets := []
	for k in ["text", "value"]:
		if str(c.get(k, "")) != "":
			head += " %s=***" % k
			secrets.append(str(c[k]))
	var args: Array = c.get("args", []) if c.get("args") is Array else []
	if not args.filter(func(a): return str(a) != "").is_empty():
		head += " args=***"
		secrets.append_array(args.map(func(a): return str(a)).filter(func(a): return a != ""))
	if reply["ok"]:
		print(head + " — 성공")
		return
	var error := str(reply.get("error", ""))
	for s in secrets:
		error = error.replace(s, "***")
	print(head + " — 실패: " + error)

func _num(c: Dictionary, k: String, fallback: float) -> float:
	var v = c.get(k)
	return float(v) if v is float or v is int else fallback

# 명령 하나는 8초 안 — 누름마다 2프레임 · 끌기 한 마디에 10프레임을 30fps 로 어림(Unity SDK 와 같은 셈). 횟수 · 세기 칸도 여기서 본다.
func _limits(c: Dictionary) -> String:
	var cmd := str(c.get("cmd", ""))
	var count := _num(c, "count", 1)
	if count < 1:
		return "count 는 1 이상입니다"
	var power := _num(c, "power", 1)
	if power < -1 or power > 1:
		return "power 는 -1~1 입니다"
	var via: int = c.get("via").size() if c.get("via") is Array else 0
	var points: int = c.get("points").size() if c.get("points") is Array else 0
	var frames := (count * 2 if cmd in ["tap", "click"] else 0.0) + ((via + 1) * 10 if cmd == "drag" else 0) + (maxi(points - 1, 0) * 10 if cmd == "swipe" else 0)
	var s := maxf(_num(c, "duration", 0), 0) + (count - 1) * maxf(_num(c, "interval", 0.1), 0) + frames / 30.0
	if s > FakeInput.LONGEST:
		return "%s 은 %d초 안이어야 합니다 — 더 길게는 touch-down · key-down 뒤 touch-up · key-up" % [cmd, FakeInput.LONGEST]
	return ""

func _handle(c: Dictionary):
	var cmd := str(c.get("cmd", ""))
	var limit := _limits(c)
	if limit != "":
		return Props.fail(limit)
	var target := str(c.get("target", ""))
	var all: bool = c.get("inactive", false) == true
	match cmd:
		"ping":
			return _ping()
		"tree":
			var size := Nodes.screen()
			return {"ok": true, "scene": GameState.scenes()["active"], "screen": [size.x, size.y], "tree": Nodes.dump()}
		"find":
			var cam = _camera(c)
			if cam is String:
				return Props.fail(cam)
			var f := Nodes.find(target, all)
			if not f.has("trail"):
				return {"ok": true, "found": false} if f["missing"] else Props.fail(f["problem"])
			return _found(f["trail"], all, cam, {"ok": true, "found": true})
		"find-all":
			var cam = _camera(c)
			if cam is String:
				return Props.fail(cam)
			var trails = Nodes.find_all(target, all)
			if trails is String:
				return Props.fail(trails)
			return {"ok": true, "found": trails.map(func(t): return _found(t, all, cam, {}))}
		"find-at":
			if not (c.has("x") and c.has("y")):
				return Props.fail("find-at 에 x · y 가 필요합니다")
			var cam = _camera(c)
			if cam is String:
				return Props.fail(cam)
			var hit := Nodes.at(Vector2(c["x"], c["y"]), cam)
			var trail := Nodes.trail_of(hit) if hit != null else []
			return {"ok": true, "found": false} if trail.is_empty() else _found(trail, false, cam, {"ok": true, "found": true})
		"components", "members", "get", "set", "call", "text-set":
			var f := Nodes.find(target, all)
			if not f.has("trail"):
				return Props.fail(f["problem"])
			var n: Node = f["trail"][-1]
			match cmd:
				"components":
					return Props.components(n)
				"members":
					return Props.members(n, str(c.get("component", "")))
				"get":
					return Props.get_prop(n, str(c.get("prop", "")))
				"set":
					return Props.set_prop(n, str(c.get("prop", "")), str(c.get("value", "")))
				"call":
					return Props.call_on(n, str(c.get("method", "")), c.get("args", []) if c.get("args") is Array else [])
				_:
					return _set_text(n, target, str(c.get("text", "")))
		"static-call":
			return Props.call_static(str(c.get("method", "")), c.get("args", []) if c.get("args") is Array else [])
		"static-get":
			return Props.get_static(str(c.get("prop", "")))
		"static-set":
			return Props.set_static(str(c.get("prop", "")), str(c.get("value", "")))
		"pref-get":
			return GameState.pref_get(str(c.get("key", "")), str(c.get("type", "")))
		"pref-set":
			return GameState.pref_set(str(c.get("key", "")), str(c.get("value", "")), str(c.get("type", "")))
		"pref-delete":
			return GameState.pref_delete(str(c.get("key", "")))
		"pref-clear":
			return GameState.pref_clear()
		"timescale-get":
			return GameState.time_scale()
		"timescale-set":
			return GameState.set_time_scale(c)
		"scenes":
			return GameState.scenes()
		"scene-load":
			return GameState.load_scene(str(c.get("name", "")), str(c.get("mode", "")))
		"scene-unload":
			return GameState.unload_scene(str(c.get("name", "")))
		"errors", "logs", "events":
			var since := _num(c, "since", 0)
			if since < 0:
				return Props.fail("since 는 0 이상이어야 합니다")
			var feed = GameState.errors if cmd == "errors" else GameState.logs if cmd == "logs" else GameState.events
			return feed.since(int(since))
		"sdk-log":
			_sdk_log = c.get("on", false) == true
			return {"ok": true, "on": _sdk_log}
		"layout":
			return Nodes.layout(target)
		"type":
			return await _type_text(target, str(c.get("text", "")))
		"screenshot":
			var format := str(c.get("format", ""))
			if format != "" and format != "jpg" and format != "png":
				return Props.fail("format 은 jpg · png 중 하나입니다")
			# 다 그린 화면은 프레임을 그린 뒤에 읽힌다.
			await RenderingServer.frame_post_draw
			var image := get_viewport().get_texture().get_image()
			var bytes := image.save_png_to_buffer() if format == "png" else image.save_jpg_to_buffer(0.8)
			return {"ok": true, ("png" if format == "png" else "jpg"): Marshalls.raw_to_base64(bytes)}
		"click", "tap", "drag", "swipe", "long-press":
			var cam = _camera(c)
			if cam is String:
				return Props.fail(cam)
			var points := []
			if cmd == "click" or cmd == "drag":
				var stops := [target]
				if cmd == "drag":
					stops.append_array(c.get("via", []) if c.get("via") is Array else [])
					stops.append(str(c.get("to", "")))
				for s in stops:
					var p = _point(str(s), cam)
					if p is String:
						return Props.fail(p)
					points.append(p)
			elif cmd == "tap":
				if not (c.has("x") and c.has("y")):
					return Props.fail("tap 에 x · y 가 필요합니다")
				points.append(Vector2(c["x"], c["y"]))
			elif cmd == "swipe":
				for s in (c.get("points", []) if c.get("points") is Array else []):
					var xy := str(s).split(",")
					if xy.size() != 2 or not xy[0].strip_edges().is_valid_float() or not xy[1].strip_edges().is_valid_float():
						return Props.fail(POINTS_FORM)
					points.append(Vector2(xy[0].to_float(), xy[1].to_float()))
				if points.size() < 2:
					return Props.fail(POINTS_FORM)
			else:
				var p = _at(c, cam)
				if p is String:
					return Props.fail(p)
				points.append(p)
			var finger := FakeInput.free_finger()
			if finger < 0:
				return Props.fail(ALL_DOWN)
			var gp := points.map(func(p): return Nodes.flip(p))
			match cmd:
				"click", "tap":
					await FakeInput.tap(finger, gp[0], int(_num(c, "count", 1)), maxf(_num(c, "interval", 0.1), 0))
				"long-press":
					await FakeInput.hold(finger, gp[0], maxf(_num(c, "duration", 1), 0))
				_:
					await FakeInput.path(finger, gp, maxf(_num(c, "duration", 0), 0))
			return _touched(points[-1])
		"touch-down":
			var cam = _camera(c)
			if cam is String:
				return Props.fail(cam)
			var p = _at(c, cam)
			if p is String:
				return Props.fail(p)
			var finger := FakeInput.free_finger()
			if finger < 0:
				return Props.fail(ALL_DOWN)
			FakeInput.touch(finger, Nodes.flip(p), true)
			await FakeInput.frames(2)
			return {"ok": true, "finger": 10 + finger, "x": roundi(p.x), "y": roundi(p.y)}
		"touch-move", "touch-up":
			var finger := int(_num(c, "finger", -1)) - 10
			if not FakeInput.fingers.has(finger):
				return Props.fail("손가락 %d 은 눌려 있지 않습니다 — touch-down 이 준 번호를 씁니다" % (finger + 10))
			if cmd == "touch-up":
				FakeInput.touch(finger, FakeInput.fingers[finger], false)
				await FakeInput.frames(2)
				return {"ok": true}
			var cam = _camera(c)
			if cam is String:
				return Props.fail(cam)
			var p = _at(c, cam)
			if p is String:
				return Props.fail(p)
			FakeInput.move(finger, Nodes.flip(p))
			await FakeInput.frames(2)
			return _touched(p)
		"mouse-move", "scroll":
			var cam = _camera(c)
			if cam is String:
				return Props.fail(cam)
			var p = null
			if cmd == "mouse-move" or target != "" or c.has("x") or c.has("y"):
				p = _at(c, cam)
				if p is String:
					return Props.fail(p)
			var s := maxf(_num(c, "duration", 0), 0)
			if cmd == "mouse-move":
				await FakeInput.mouse_to(Nodes.flip(p), s)
				return _touched(p)
			await FakeInput.scroll(Nodes.flip(p) if p != null else null, Vector2(_num(c, "dx", 0), _num(c, "dy", 0)), s)
			return {"ok": true}
		"key", "key-down", "key-up":
			var names := str(c.get("key", "")).split("+")
			for k in names:
				if FakeInput.key_event(k, true, 1) == null:
					return Props.fail("모르는 키입니다: %s (KeyCode 이름 — Escape · Space · Return · A · Alpha1 · F1 · UpArrow · Mouse0 · JoystickButton0 …, 여럿은 A+LeftShift)" % k)
			var power := _num(c, "power", 1)
			match cmd:
				"key":
					await FakeInput.keys(Array(names), power, maxf(_num(c, "duration", 0), 0))
					return {"ok": true, "key": "+".join(names)}
				"key-down":
					for k in names:
						FakeInput.press(k, power)
				_:
					for k in names:
						FakeInput.release(k)
			await FakeInput.frames(2)
			return {"ok": true}
		"tilt":
			if not (c.has("x") and c.has("y") and c.has("z")):
				return Props.fail("tilt 에 x · y · z 가 필요합니다")
			await FakeInput.tilt(Vector3(c["x"], c["y"], c["z"]), maxf(_num(c, "duration", 0), 0))
			return {"ok": true}
		"pointer":
			return _pointer(target, str(c.get("event", "")))
		"input-reset":
			FakeInput.reset()
			await FakeInput.frames(2)
			return {"ok": true}
	return Props.fail("모르는 명령입니다: %s (%s)" % [cmd, " · ".join(CAPS)])

const ALL_DOWN := "손가락 10개가 다 눌려 있습니다 — touch-up · input-reset 으로 뗍니다"
const POINTS_FORM := "swipe 의 points 는 \"x,y\" 글자 둘 이상입니다 — [\"540,400\", \"540,900\"]"

# find · find-all · find-at 답 한 칸 — 경로 · 글자 · 누를 수 있나 · id · 누를 자리 · 화면 사각형(켜진 것만) · 화면 크기 · 꺼짐.
func _found(trail: Array, all: bool, cam, into: Dictionary) -> Dictionary:
	var n: Node = trail[-1]
	into["path"] = Nodes.path_of(trail, all)
	var text = Nodes.text_of(n)
	if text != null:
		into["text"] = text
	if Nodes.kind_of(n) != "":
		into["interactable"] = Nodes.interactable(n)
	into["id"] = Nodes.id_of(n)
	if Nodes.active(trail):
		var p = Nodes.point(n, cam)
		if p != null:
			into["x"] = roundi(p.x)
			into["y"] = roundi(p.y)
		var r = Nodes.box(n, cam)
		if r != null:
			var x0 := roundi(r.position.x)
			var y0 := roundi(r.position.y)
			into["rect"] = [x0, y0, roundi(r.end.x) - x0, roundi(r.end.y) - y0]
	else:
		into["active"] = false
	var size := Nodes.screen()
	into["screen"] = [size.x, size.y]
	return into

# camera 칸 — 비면 null(지금 Viewport 카메라), 있으면 Camera3D. 틀리면 까닭 글자.
func _camera(c: Dictionary):
	var address := str(c.get("camera", ""))
	if address == "":
		return null
	var f := Nodes.find(address, false)
	if not f.has("trail"):
		return f["problem"]
	var n: Node = f["trail"][-1]
	return n if n is Camera3D else "%s 에 Camera3D 가 없습니다" % address

# 누르기 · 끌기는 켜진 것만 — 꺼진 것을 누르면 그 자리의 다른 것이 눌린다.
func _point(target: String, cam):
	var f := Nodes.find(target, false)
	if not f.has("trail"):
		return f["problem"]
	var p = Nodes.point(f["trail"][-1], cam)
	return p if p != null else "%s 은 화면에 비친 자리가 없습니다(Control · Node2D 도 아니고 카메라 앞도 아님)" % target

# 한 점 명령의 자리 — target 이 있으면 그 노드 화면 가운데, 없으면 x · y(통신 꼴).
func _at(c: Dictionary, cam):
	var target := str(c.get("target", ""))
	if target != "":
		return _point(target, cam)
	if not (c.has("x") and c.has("y")):
		return "%s 에 target 또는 x · y 가 필요합니다" % c.get("cmd", "")
	return Vector2(c["x"], c["y"])

func _touched(p: Vector2) -> Dictionary:
	return {"ok": true, "x": roundi(p.x), "y": roundi(p.y)}

# 글자 노드에 글자를 바로 넣는다 — 입력칸은 type(글자 수 · 거르기를 사람이 칠 때 차례로)이 맡는다.
func _set_text(n: Node, target: String, text: String) -> Dictionary:
	if n is LineEdit or n is TextEdit:
		return Props.fail("%s 은 입력칸이라 type 으로 넣습니다" % target)
	if not ("text" in n) or typeof(n.get("text")) != TYPE_STRING:
		return Props.fail("%s 에 글자 칸(text — Label · Button · RichTextLabel)이 없습니다" % target)
	n.set("text", text)
	return {"ok": true, "text": Nodes.text_of(n)}

# 화면 키보드를 띄우지 않고 글자마다 키 이벤트(unicode)를 그 Viewport 에 바로 밀어 넣는다 — 글자 수 · text_changed 거르기가 사람이 칠 때 차례 그대로.
func _type_text(target: String, text: String) -> Dictionary:
	var f := Nodes.find(target, false)
	if not f.has("trail"):
		return Props.fail(f["problem"])
	var n = f["trail"][-1]
	if not (n is LineEdit or n is TextEdit):
		return Props.fail("%s 은 입력칸(LineEdit · TextEdit)이 아닙니다" % target)
	if not n.editable:
		return Props.fail("%s 은 잠겨 있어 글자를 넣을 수 없습니다" % target)
	var keyboard: bool = n.virtual_keyboard_enabled
	n.virtual_keyboard_enabled = false
	n.grab_focus()
	if n.has_method("edit"):
		n.edit()
	n.clear()
	var vp: Viewport = n.get_viewport()
	# LineEdit 는 text_changed 를 프레임 끝으로 미룬다 — 사람이 칠 때처럼 글자마다 한 프레임을 넘겨 거르기가 글자마다 돈다.
	for ch in text:
		for pressed in [true, false]:
			var e := InputEventKey.new()
			e.unicode = ch.unicode_at(0)
			e.pressed = pressed
			vp.push_input(e)
		await FakeInput.frames(1)
	await FakeInput.frames(1)
	if n.has_method("unedit"):
		n.unedit()
	n.release_focus()
	n.virtual_keyboard_enabled = keyboard
	return {"ok": true, "text": Nodes.text_of(n)}

# AltTester PointerDown/Up/Enter/Exit — 그 Control 하나에만(부모로 안 올린다). down · up 은 gui_input, enter · exit 은 마우스 알림.
func _pointer(target: String, event: String) -> Dictionary:
	var f := Nodes.find(target, false)
	if not f.has("trail"):
		return Props.fail(f["problem"])
	var n = f["trail"][-1]
	if not (n is Control):
		return Props.fail("%s 은 Control 이 아니라 pointer 를 못 보냅니다 — click · touch-down 으로" % target)
	match event:
		"enter":
			FakeInput.notify(n, Control.NOTIFICATION_MOUSE_ENTER, n.mouse_entered)
		"exit":
			FakeInput.notify(n, Control.NOTIFICATION_MOUSE_EXIT, n.mouse_exited)
		"down", "up":
			var e := InputEventMouseButton.new()
			e.button_index = MOUSE_BUTTON_LEFT
			e.pressed = event == "down"
			e.position = n.size / 2
			e.global_position = n.get_global_transform_with_canvas() * e.position
			if n.has_method("_gui_input"):
				n._gui_input(e)
			n.gui_input.emit(e)
		_:
			return Props.fail("event 는 down · up · enter · exit 중 하나입니다")
	return {"ok": true}
