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

        // 옛 Input 축 — QA 빌드가 구운 InputManager 축 표에서 그 이름 축들을 본다(같은 이름이 여럿이면 절댓값이 큰 것, Unity 와 같게).
        // 단추 축은 양쪽 키(positive · alt positive)가 +세기, 음쪽이 −세기 · 마우스 축은 가짜 마우스 이동량 × sensitivity. 조이스틱 축은 흉내 내지 않는다(AltTester 도).
        public static float Axis(string name)
        {
            var table = ControlCliAxes.Table;
            if (table == null) return 0;
            float best = 0;
            foreach (var a in table)
            {
                if (a.name != name) continue;
                float v;
                if (a.type == 0) v = Mathf.Clamp(Strength(a.positive, a.altPositive) - Strength(a.negative, a.altNegative), -1, 1);
                else if (a.type == 1) v = (a.axis == 0 ? FakeMouse.Delta.x : a.axis == 1 ? FakeMouse.Delta.y : FakeMouse.Scroll.y) * a.sensitivity;
                else continue;
                if (a.invert) v = -v;
                if (Mathf.Abs(v) > Mathf.Abs(best)) best = v;
            }
            return best;
        }

        // GetButton* — 그 이름 축의 양쪽 키를 가짜로 누름 · 이번 프레임 누름 · 뗌
        public static bool ButtonHeld(string name) => Named(name, Shown.Keys);
        public static bool ButtonDown(string name) => Named(name, DownNow);
        public static bool ButtonUp(string name) => Named(name, UpNow);

        private static bool Named(string axis, IEnumerable<KeyCode> keys)
        {
            var table = ControlCliAxes.Table;
            if (table == null) return false;
            foreach (var k in keys)
            {
                var n = NameOf(k);
                foreach (var a in table)
                    if (a.name == axis && a.type == 0 && (a.positive == n || a.altPositive == n)) return true;
            }
            return false;
        }

        // 그 단추 이름들 중 누른 것의 세기(없으면 0)
        private static float Strength(string a, string b)
        {
            foreach (var kv in Shown)
            {
                var n = NameOf(kv.Key);
                if ((n == a || n == b) && !string.IsNullOrEmpty(n)) return kv.Value;
            }
            return 0;
        }

        // KeyCode → InputManager 단추 이름(a · 1 · [1] · up · left shift · left ctrl · mouse 0 · joystick button 0 · joystick 1 button 0 · f1)
        internal static string NameOf(KeyCode k)
        {
            if (k >= KeyCode.A && k <= KeyCode.Z) return ((char)('a' + (k - KeyCode.A))).ToString();
            if (k >= KeyCode.Alpha0 && k <= KeyCode.Alpha9) return ((char)('0' + (k - KeyCode.Alpha0))).ToString();
            if (k >= KeyCode.Keypad0 && k <= KeyCode.Keypad9) return "[" + (k - KeyCode.Keypad0) + "]";
            if (k >= KeyCode.Mouse0 && k <= KeyCode.Mouse6) return "mouse " + (k - KeyCode.Mouse0);
            if (k >= KeyCode.JoystickButton0 && k <= KeyCode.JoystickButton19) return "joystick button " + (k - KeyCode.JoystickButton0);
            if (k >= KeyCode.Joystick1Button0 && k <= KeyCode.Joystick8Button19)
            {
                var n = k - KeyCode.Joystick1Button0;
                return "joystick " + (n / 20 + 1) + " button " + n % 20;
            }
            switch (k)
            {
                case KeyCode.UpArrow: return "up";
                case KeyCode.DownArrow: return "down";
                case KeyCode.LeftArrow: return "left";
                case KeyCode.RightArrow: return "right";
                case KeyCode.LeftControl: return "left ctrl";
                case KeyCode.RightControl: return "right ctrl";
                case KeyCode.LeftCommand: return "left cmd";
                case KeyCode.RightCommand: return "right cmd";
                case KeyCode.KeypadPlus: return "[+]";
                case KeyCode.KeypadMinus: return "[-]";
                case KeyCode.KeypadMultiply: return "[*]";
                case KeyCode.KeypadDivide: return "[/]";
                case KeyCode.KeypadPeriod: return "[.]";
                case KeyCode.KeypadEnter: return "enter";
            }
            // 나머지는 낱말 사이를 띄우고 작게 — LeftShift → left shift · PageUp → page up · F1 → f1 · Space → space
            // ponytail: 기호 키(BackQuote · Equals …)는 InputManager 이름(` · =)과 다르다 — 그 키를 축에 쓰는 게임이 오면 짝을 더한다.
            var s = k.ToString();
            var b = new System.Text.StringBuilder(s.Length + 4);
            for (var i = 0; i < s.Length; i++)
            {
                if (i > 0 && char.IsUpper(s[i]) && !char.IsUpper(s[i - 1])) b.Append(' ');
                b.Append(char.ToLowerInvariant(s[i]));
            }
            return b.ToString();
        }

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
