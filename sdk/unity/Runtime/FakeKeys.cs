// 바깥 명령이 누른 키 — 누른 동안 · 이번 프레임 누름/뗌 · 세기. 옛 Input 감싸기(GetKey*) · uGUI 마우스 단추 · Input System 장치가 같이 본다
using System.Collections.Generic;
using UnityEngine;

namespace ControlCli
{
    public static class FakeKeys
    {
        // 일이 정한 눌림(키 → 세기)과 내보낸 눌림 — 프레임마다 견줘 이번 프레임 누름 · 뗌을 낸다.
        private static readonly Dictionary<KeyCode, float> Wanted = new Dictionary<KeyCode, float>();
        private static readonly Dictionary<KeyCode, float> Shown = new Dictionary<KeyCode, float>();
        private static readonly HashSet<KeyCode> DownNow = new HashSet<KeyCode>();
        private static readonly HashSet<KeyCode> UpNow = new HashSet<KeyCode>();

        // 이번 프레임에 눌림 · 세기가 바뀌었나 — Input System 이 바뀐 프레임에만 상태를 보낸다.
        public static bool Changed { get; private set; }

        internal static void Press(KeyCode key, float power) => Wanted[key] = power;
        internal static void Release(KeyCode key) => Wanted.Remove(key);
        internal static void ReleaseAll() => Wanted.Clear();

        public static bool Held(KeyCode key) => Shown.ContainsKey(key);
        public static bool Down(KeyCode key) => DownNow.Contains(key);
        public static bool Up(KeyCode key) => UpNow.Contains(key);
        public static bool Any => Shown.Count > 0;
        public static bool AnyDown => DownNow.Count > 0;
        // 지금 누른 키와 세기 — Input System 이 한 상태로 보낸다.
        internal static Dictionary<KeyCode, float> All => Shown;

        // 마우스 단추 번호 → KeyCode(Mouse0~6), 밖이면 None — GetMouseButton(7) 이 JoystickButton0 이 되지 않게.
        public static KeyCode MouseKey(int button) => button >= 0 && button <= 6 ? KeyCode.Mouse0 + button : KeyCode.None;

        // 드라이버(FakeTouches)가 프레임마다 일(FakeInput) 다음에 부른다.
        internal static void Tick()
        {
            DownNow.Clear();
            UpNow.Clear();
            Changed = false;
            foreach (var k in Shown.Keys)
                if (!Wanted.ContainsKey(k)) UpNow.Add(k);
            foreach (var kv in Wanted)
                if (!Shown.TryGetValue(kv.Key, out var p)) DownNow.Add(kv.Key);
                else if (!Mathf.Approximately(p, kv.Value)) Changed = true;
            Changed |= DownNow.Count > 0 || UpNow.Count > 0;
            if (!Changed) return;
            Shown.Clear();
            foreach (var kv in Wanted) Shown[kv.Key] = kv.Value;
        }
    }
}
