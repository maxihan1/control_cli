# 표준 화면 뿌리 — IdInput 은 영숫자만 남기고, LoginButton 은 IdInput 글자와 누른 수를 StatusText 에 적는다(conform type · click 줄)
extends Node

var _presses := 0
var _alnum := RegEx.create_from_string("[^A-Za-z0-9]")

@onready var _id: LineEdit = $SampleCanvas/IdInput
@onready var _status: Label = $SampleCanvas/StatusText

func _ready() -> void:
	_id.text_changed.connect(_on_id_changed)
	$SampleCanvas/LoginButton.pressed.connect(_on_login)

# Unity IdInput 의 Alphanumeric 거르기 — 사람이 칠 때 글자마다 걸러진다.
func _on_id_changed(text: String) -> void:
	var kept := _alnum.sub(text, "", true)
	if kept == text:
		return
	var caret := _id.caret_column - (text.length() - kept.length())
	_id.text = kept
	_id.caret_column = caret

func _on_login() -> void:
	_presses += 1
	_status.text = "login %s %d" % [_id.text, _presses]
