# Godot 로그를 받아 logs · errors 통에 넣는다 — OS.add_logger(Godot 4.5+). 다른 스레드에서도 불리고, 여기서 print 하면 되돌아온다
extends Logger

const GameState := preload("game_state.gd")
# Logger.ErrorType 차례(ERROR · WARNING · SCRIPT · SHADER) → Unity LogType 이름. 스크립트 실행 오류는 예외로 본다.
const TYPES := ["Error", "Warning", "Exception", "Error"]

func _log_message(message: String, error: bool) -> void:
	GameState.add_log(message.trim_suffix("\n"), "Error" if error else "Log", "")

func _log_error(function: String, file: String, line: int, code: String, rationale: String, editor_notify: bool, error_type: int, script_backtraces: Array[ScriptBacktrace]) -> void:
	var stack := "%s (%s:%d)" % [function, file, line]
	for b in script_backtraces:
		stack += "\n" + b.format()
	GameState.add_log(rationale if rationale != "" else code, TYPES[error_type] if error_type >= 0 and error_type < TYPES.size() else "Error", stack)
