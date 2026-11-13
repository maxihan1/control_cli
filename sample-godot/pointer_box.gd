# 누르면 PointerText 에 마지막 Pointer 이벤트(down · up · enter · exit)와 누른 초를 적는 칸 — long-press · mouse-move · pointer 명령 확인용
extends ColorRect

@export var Output: Label
var _down_at := 0
var _held := "-"

func _ready() -> void:
	mouse_entered.connect(_show.bind("enter"))
	mouse_exited.connect(_show.bind("exit"))
	_show("-")

func _gui_input(event) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_down_at = Time.get_ticks_msec()
			_show("down")
		else:
			_held = "%.1f" % ((Time.get_ticks_msec() - _down_at) / 1000.0)
			_show("up")

func _show(last: String) -> void:
	Output.text = "last %s · held %s" % [last, _held]
