// 바깥 명령이 누른 키를 한 프레임 눌렀다 다음 프레임에 뗀다 — 옛 Input 감싸기(GetKey*)와 Input System 키보드가 같이 본다
using System.Collections.Generic;
using UnityEngine;

namespace ControlCli
{
    public static class FakeKeys
    {
        private static readonly Queue<KeyCode> Pending = new Queue<KeyCode>();
        // 이번 프레임에 누른 키 · 뗀 키 — 누름 한 프레임 → 뗌 한 프레임 → 다음 키.
        private static KeyCode? _down;
        private static KeyCode? _up;

        public static void Press(KeyCode key) => Pending.Enqueue(key);

        public static bool Idle => Pending.Count == 0 && _down == null && _up == null;

        public static bool Held(KeyCode key) => _down == key;
        public static bool Down(KeyCode key) => _down == key;
        public static bool Up(KeyCode key) => _up == key;
        public static bool Any => _down != null;

        // FakeTouches 가 게임 Update 보다 먼저 프레임마다 부른다.
        internal static void Tick()
        {
            _up = _down;
            _down = null;
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            if (_up != null) FakeInputSystem.Key(_up.Value, false);
#endif
            if (_up != null || Pending.Count == 0) return;
            _down = Pending.Dequeue();
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            FakeInputSystem.Key(_down.Value, true);
#endif
        }

        // 거둘 때는 누른 키를 떼 준다 — 게임이 눌림에 갇히지 않게.
        internal static void Cancel()
        {
            Pending.Clear();
            if (_down == null) return;
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            FakeInputSystem.Key(_down.Value, false);
#endif
            _up = _down;
            _down = null;
        }
    }
}
