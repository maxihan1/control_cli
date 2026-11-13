# 줄 30개를 든 스크롤 목록 — 끌면 따라 움직이고, vertical_normalized 는 Unity ScrollRect 처럼 맨 위 1 · 맨 아래 0(conform swipe · scroll 줄)
extends ScrollContainer

var vertical_normalized: float:
	get:
		var bar := get_v_scroll_bar()
		var room := bar.max_value - bar.page
		return 1.0 if room <= 0 else 1.0 - scroll_vertical / room

func _ready() -> void:
	for i in 30:
		var row := Label.new()
		row.text = "Row %d" % (i + 1)
		$Rows.add_child(row)

# PC 의 ScrollContainer 는 끌어 움직이지 않는다(터치 화면만) — Unity ScrollRect 처럼 누른 채 끌면 움직이게.
func _gui_input(event) -> void:
	if event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
		scroll_vertical -= roundi(event.relative.y)
