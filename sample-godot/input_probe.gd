# 게임 코드처럼 손가락 수 · 누른 키 · 축 · 가상 단추 · 기울기를 읽어 InputText 에 적는다 — conform C 줄이 본다(Unity InputProbe 와 같은 글자)
extends Label

var _fingers := {}
var _tilt := "-"

# Unity InputManager 기본 축과 같은 짝 — Horizontal(화살표 · 왼 스틱 x) · Fire1(left ctrl · 패드 단추 0).
func _ready() -> void:
	_action("move_left", [_key(KEY_LEFT), _stick(-1.0)])
	_action("move_right", [_key(KEY_RIGHT), _stick(1.0)])
	_action("fire", [_key(KEY_CTRL), _pad(JOY_BUTTON_A)])

func _action(name: String, events: Array) -> void:
	if not InputMap.has_action(name):
		InputMap.add_action(name)
	for e in events:
		InputMap.action_add_event(name, e)

func _key(code: Key) -> InputEventKey:
	var e := InputEventKey.new()
	e.device = -1
	e.keycode = code
	return e

func _stick(value: float) -> InputEventJoypadMotion:
	var e := InputEventJoypadMotion.new()
	e.device = -1
	e.axis = JOY_AXIS_LEFT_X
	e.axis_value = value
	return e

func _pad(button: JoyButton) -> InputEventJoypadButton:
	var e := InputEventJoypadButton.new()
	e.device = -1
	e.button_index = button
	return e

func _input(event) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			_fingers[event.index] = true
		else:
			_fingers.erase(event.index)

func _process(_delta: float) -> void:
	var keys := []
	for k in [[KEY_A, "A"], [KEY_SHIFT, "LeftShift"], [KEY_W, "W"]]:
		if Input.is_key_pressed(k[0]):
			keys.append(k[1])
	# 진짜 기울기는 늘 흔들린다 — 사람이 못 내는 큰 값(conform 은 20~49 g)만 남긴다.
	var tilt := Input.get_accelerometer().y / 9.80665
	if absf(tilt) > 10:
		_tilt = str(roundi(tilt))
	var t := "fingers %d · keys %s · axis %d · fire %d · tilt %s" % [_fingers.size(), " ".join(keys) if not keys.is_empty() else "-", roundi(Input.get_axis("move_left", "move_right")), 1 if Input.is_action_pressed("fire") else 0, _tilt]
	if text != t:
		text = t
