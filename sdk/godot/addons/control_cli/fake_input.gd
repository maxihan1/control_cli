# 가짜 입력 — Input.parse_input_event 로 손가락(ScreenTouch · ScreenDrag) · 마우스 · 키 · 패드 · 기울기를 넣는다. 다음 프레임에 처리되니 프레임을 기다린 뒤 끝난다
extends RefCounted

# 명령 하나는 이 초 안 — SDK 답이 늦으면 CLI 가 20초에 끊는다.
const LONGEST := 8.0
const G := 9.80665
const FINGERS := 10

# 눌러 둔 손가락 index(0~9) → 창 픽셀(왼쪽 위 0,0). 통신 꼴의 손가락 번호는 10 + index.
static var fingers := {}
# 눌러 둔 키 이름(작은 글자) → 누름 이벤트 — 뗄 때 같은 꼴로 뗀다.
static var held := {}
static var mouse := Vector2(-1, -1)
static var buttons := 0
static var _accel_before = null

static func _tree() -> SceneTree:
	return Engine.get_main_loop() as SceneTree

static func frames(n: int) -> void:
	for i in n:
		await _tree().process_frame

static func seconds(s: float) -> void:
	if s > 0:
		await _tree().create_timer(s, true, false, true).timeout

static func free_finger() -> int:
	for i in FINGERS:
		if not fingers.has(i):
			return i
	return -1

static func touch(i: int, p: Vector2, pressed: bool) -> void:
	var e := InputEventScreenTouch.new()
	e.index = i
	e.position = p
	e.pressed = pressed
	Input.parse_input_event(e)
	if pressed:
		fingers[i] = p
	else:
		fingers.erase(i)

static func move(i: int, p: Vector2) -> void:
	var e := InputEventScreenDrag.new()
	e.index = i
	e.position = p
	e.relative = p - fingers.get(i, p)
	e.screen_relative = e.relative
	Input.parse_input_event(e)
	fingers[i] = p

# 누르고 2프레임 · 떼고 2프레임 — 게임이 누름과 뗌을 다른 프레임에 본다.
static func tap(i: int, p: Vector2, count: int, interval: float) -> void:
	for k in count:
		touch(i, p, true)
		await frames(2)
		touch(i, p, false)
		await frames(2)
		if k < count - 1:
			await seconds(interval)

# 첫 점에서 눌러 마디마다 적어도 10프레임 · duration 을 나눈 초 동안 옮기고 마지막 점에서 뗀다.
static func path(i: int, points: Array, duration: float) -> void:
	touch(i, points[0], true)
	await frames(1)
	var seg_ms := duration * 1000.0 / (points.size() - 1)
	for k in range(1, points.size()):
		var a: Vector2 = points[k - 1]
		var b: Vector2 = points[k]
		var start := Time.get_ticks_msec()
		var f := 0
		while true:
			f += 1
			var t := minf(1.0, f / 10.0) if seg_ms <= 0 else minf(1.0, (Time.get_ticks_msec() - start) / seg_ms)
			move(i, a.lerp(b, t))
			await frames(1)
			if t >= 1.0 and f >= 10:
				break
	touch(i, points[-1], false)
	await frames(2)

static func hold(i: int, p: Vector2, s: float) -> void:
	touch(i, p, true)
	await frames(1)
	await seconds(s)
	touch(i, p, false)
	await frames(2)

static func _motion(p: Vector2) -> void:
	var e := InputEventMouseMotion.new()
	e.position = p
	e.global_position = p
	e.relative = p - mouse if mouse.x >= 0 else Vector2.ZERO
	e.screen_relative = e.relative
	e.button_mask = buttons
	Input.parse_input_event(e)
	mouse = p

static func mouse_to(p: Vector2, s: float) -> void:
	var from := mouse if mouse.x >= 0 else p
	var start := Time.get_ticks_msec()
	while s > 0 and Time.get_ticks_msec() - start < s * 1000.0:
		_motion(from.lerp(p, (Time.get_ticks_msec() - start) / (s * 1000.0)))
		await frames(1)
	_motion(p)
	await frames(2)

# 바퀴 — dy 는 위가 +(Unity mouseScrollDelta 꼴), 한 칸이 바퀴 한 번(factor).
static func scroll(at, d: Vector2, s: float) -> void:
	if at != null:
		await mouse_to(at, 0)
	var steps := maxi(1, ceili(s * 30))
	for k in steps:
		_wheel(MOUSE_BUTTON_WHEEL_UP if d.y > 0 else MOUSE_BUTTON_WHEEL_DOWN, absf(d.y) / steps)
		_wheel(MOUSE_BUTTON_WHEEL_RIGHT if d.x > 0 else MOUSE_BUTTON_WHEEL_LEFT, absf(d.x) / steps)
		await frames(1)
	await frames(1)

static func _wheel(button: MouseButton, factor: float) -> void:
	if factor <= 0:
		return
	for pressed in [true, false]:
		var e := InputEventMouseButton.new()
		e.button_index = button
		e.factor = factor
		e.pressed = pressed
		e.position = mouse
		e.global_position = mouse
		e.button_mask = buttons
		Input.parse_input_event(e)

# Unity KeyCode 이름 → Godot Key. 글자 · F1 같은 이름은 Godot 이름으로 찾는다(OS.find_keycode_from_string).
const UNITY_KEYS := {
	"return": KEY_ENTER, "keypadenter": KEY_KP_ENTER, "escape": KEY_ESCAPE, "space": KEY_SPACE, "backspace": KEY_BACKSPACE,
	"tab": KEY_TAB, "delete": KEY_DELETE, "insert": KEY_INSERT, "home": KEY_HOME, "end": KEY_END, "pageup": KEY_PAGEUP, "pagedown": KEY_PAGEDOWN,
	"uparrow": KEY_UP, "downarrow": KEY_DOWN, "leftarrow": KEY_LEFT, "rightarrow": KEY_RIGHT, "capslock": KEY_CAPSLOCK,
	"leftshift": KEY_SHIFT, "rightshift": KEY_SHIFT, "leftcontrol": KEY_CTRL, "rightcontrol": KEY_CTRL, "leftalt": KEY_ALT, "rightalt": KEY_ALT,
	"leftcommand": KEY_META, "rightcommand": KEY_META, "leftmeta": KEY_META, "rightmeta": KEY_META, "leftwindows": KEY_META, "rightwindows": KEY_META,
}
# 패드 — AltTester 와 같은 짝: JoystickButton0~15 는 단추, 16~19 는 왼 스틱 x · y · 오른 스틱 x · y(값 = 세기).
const STICKS := [JOY_AXIS_LEFT_X, JOY_AXIS_LEFT_Y, JOY_AXIS_RIGHT_X, JOY_AXIS_RIGHT_Y]

# 키 이름 하나 → 누름(pressed) · 뗌 이벤트. 모르는 이름은 null.
static func key_event(name: String, pressed: bool, power: float) -> InputEvent:
	var low := name.strip_edges().to_lower()
	if low.begins_with("mouse") and low.substr(5).is_valid_int():
		var n := low.substr(5).to_int()
		if n < 0 or n > 4:
			return null
		var m := InputEventMouseButton.new()
		m.button_index = [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_XBUTTON1, MOUSE_BUTTON_XBUTTON2][n]
		m.pressed = pressed
		m.position = mouse
		m.global_position = mouse
		return m
	if low.begins_with("joystickbutton") and low.substr(14).is_valid_int():
		var n := low.substr(14).to_int()
		if n >= 0 and n < 16:
			var b := InputEventJoypadButton.new()
			b.button_index = n
			b.pressed = pressed
			b.pressure = 1.0 if pressed else 0.0
			return b
		if n >= 16 and n < 20:
			var a := InputEventJoypadMotion.new()
			a.axis = STICKS[n - 16]
			a.axis_value = power if pressed else 0.0
			return a
		return null
	var code: int = UNITY_KEYS.get(low, KEY_NONE)
	if low.begins_with("alpha") and low.length() == 6 and low[5].is_valid_int():
		code = KEY_0 + low[5].to_int()
	elif low.begins_with("keypad") and low.length() == 7 and low[6].is_valid_int():
		code = KEY_KP_0 + low[6].to_int()
	elif code == KEY_NONE:
		code = OS.find_keycode_from_string(name.strip_edges())
	if code == KEY_NONE:
		return null
	var k := InputEventKey.new()
	k.keycode = code
	k.physical_keycode = code
	k.pressed = pressed
	if low.begins_with("left"):
		k.location = KEY_LOCATION_LEFT
	elif low.begins_with("right") and low != "rightarrow":
		k.location = KEY_LOCATION_RIGHT
	return k

static func _send(e) -> void:
	if e is InputEventMouseButton:
		var bit: int = 1 << (e.button_index - 1)
		buttons = buttons | bit if e.pressed else buttons & ~bit
		e.button_mask = buttons
	Input.parse_input_event(e)

static func press(name: String, power: float) -> void:
	var e := key_event(name, true, power)
	held[name.to_lower()] = name
	_send(e)

static func release(name: String) -> void:
	held.erase(name.to_lower())
	_send(key_event(name, false, 0))

# 키 여럿을 함께 눌렀다(duration 초, 기본 한 프레임) 뗀다.
static func keys(names: Array, power: float, s: float) -> void:
	for n in names:
		press(n, power)
	await frames(1)
	await seconds(s)
	for n in names:
		release(n)
	await frames(2)

# 기울기 — duration 동안(적어도 한 프레임) 가속도를 대신하고 앞 값으로 되돌린다. 단위는 g, Godot 는 m/s².
static func tilt(v: Vector3, s: float) -> void:
	if _accel_before == null:
		_accel_before = Input.get_accelerometer()
	var end := Time.get_ticks_msec() + s * 1000.0
	Input.set_accelerometer(v * G)
	await frames(1)
	while Time.get_ticks_msec() < end:
		Input.set_accelerometer(v * G)
		await frames(1)
	_restore_tilt()

static func _restore_tilt() -> void:
	if _accel_before != null:
		Input.set_accelerometer(_accel_before)
		_accel_before = null

# 가짜 입력을 다 거둔다 — 눌러 둔 손가락 · 키(마우스 단추 · 패드 포함) · 기울기.
static func reset() -> void:
	for i in fingers.keys():
		touch(i, fingers[i], false)
	for n in held.values():
		release(n)
	_restore_tilt()
