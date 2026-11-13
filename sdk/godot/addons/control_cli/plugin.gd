# 에디터에서 애드온을 켜면 autoload ControlCli 를 더하고 끄면 뺀다 — instrument 는 project.godot 에 바로 쓴다
@tool
extends EditorPlugin

func _enable_plugin() -> void:
	add_autoload_singleton("ControlCli", "res://addons/control_cli/control_cli.gd")

func _disable_plugin() -> void:
	remove_autoload_singleton("ControlCli")
