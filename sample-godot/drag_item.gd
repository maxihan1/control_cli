# Bag 칸의 Item — 누른 채 끌어 다른 칸 위에서 떼면 그 칸으로 옮겨 간다(conform drag · touch-move 줄)
extends ColorRect

func _gui_input(event) -> void:
	if not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed):
		return
	var p: Vector2 = get_global_transform_with_canvas() * event.position
	for slot in get_parent().get_parent().get_children():
		if slot != get_parent() and slot is Control and Rect2(Vector2.ZERO, slot.size).has_point(slot.get_global_transform_with_canvas().affine_inverse() * p):
			_move_to.call_deferred(slot)
			return

func _move_to(slot: Control) -> void:
	reparent(slot, false)
	position = Vector2(10, 10)
