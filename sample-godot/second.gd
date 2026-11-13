# 두 번째 장면 — 실행 중 만든 SecondMarker(instance id), 장면에 저장한 SecondSaved(영구 id), SecondButton 누름 · hover 를 SecondText 에, 긴 SecondScroll
extends Node

var _presses := 0

func _ready() -> void:
	var marker := Node.new()
	marker.name = "SecondMarker"
	add_child(marker)
	$SecondButton.pressed.connect(_on_pressed)
	$SecondButton.mouse_entered.connect(_on_enter)
	for i in 40:
		var row := Label.new()
		row.text = "Second row %d" % (i + 1)
		$SecondScroll/Rows.add_child(row)

func _on_pressed() -> void:
	_presses += 1
	$SecondText.text = "second %d" % _presses

func _on_enter() -> void:
	$SecondText.text = "enter"
