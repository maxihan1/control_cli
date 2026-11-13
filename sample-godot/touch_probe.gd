# 게임 코드처럼 터치 · 키를 읽어 TouchText 에 적는다 — 가짜 터치가 게임 코드에 닿는지 · 월드 큐브를 누르는지. conform A 줄이 부르는 메서드 · static 칸
class_name TouchProbe
extends Control

@export var Output: Label
var _cube := 0

# conform A 줄 — call 이 부르는 메서드 · static-call · static-get/set 이 보는 칸(Unity TouchProbe 와 같은 이름).
static var Note := ""

func Say(word: String, times: int) -> String:
	Output.text = "%s %d" % [word, times]
	return Output.text

static func Add(a: int, b: int) -> int:
	return a + b

# conform D 로그 줄 — static-call 로 게임 로그 한 줄을 남긴다(logs 가 받는지 · 토큰을 가리는지).
static func Log(text: String) -> void:
	print(text)

func _input(event) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_I:
		Output.text = "key I"
	elif event is InputEventScreenTouch and event.pressed:
		_began(event.position)

func _began(p: Vector2) -> void:
	Output.text = "touch %d,%d" % [roundi(p.x), roundi(p.y)]
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return
	var from := cam.project_ray_origin(p)
	var hit := cam.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from, from + cam.project_ray_normal(p) * 100.0))
	if not hit.is_empty() and hit["collider"].name == "WorldCube":
		_cube += 1
		Output.text = "cube %d" % _cube
