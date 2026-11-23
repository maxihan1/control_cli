// 콘솔별 가상 패드 — 종류(xbox · ps5 · ps4 · switch · generic)를 고르면 그 패드의 장치 설명으로 Input System 장치를 만들고, 누른 JoystickButton 을 늘 그 장치에 넣는다. Pad.<이름> 이름표도 여기서 자리로 바꾼다
using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
#if QAHUB_SDK_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.Layouts;
using UnityEngine.InputSystem.LowLevel;
#endif

namespace ControlCli
{
    internal static class FakePad
    {
        // 지금 가상 패드 — off 는 없음. 그 상태에서 패드 키가 오면 generic 을 만든다.
        public static string Type { get; private set; } = "off";

        private static readonly string[] Types = { "xbox", "ps5", "ps4", "switch", "generic", "off" };
        // 어느 패드든 같은 이름 — JoystickButton12~19(십자키 · 왼 스틱 x · y · 오른 스틱 x · y).
        private static readonly string[] Common = { "Up", "Down", "Left", "Right", "LX", "LY", "RX", "RY" };

        // 자리(JoystickButton0~11 — 아래 · 오른쪽 · 왼쪽 · 위 · 어깨 둘 · 방아쇠 둘 · select · start · 스틱 누름 둘) 차례의 그 패드 글자. Switch 는 A 가 오른쪽이다.
        private static string[] Labels(string type)
        {
            switch (type)
            {
                case "xbox": return new[] { "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS" };
                case "ps5": return new[] { "Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3" };
                case "ps4": return new[] { "Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3" };
                case "switch": return new[] { "B", "A", "Y", "X", "L", "R", "ZL", "ZR", "Minus", "Plus", "LS", "RS" };
                default: return null;
            }
        }

        // Pad.<이름> → 자리(JoystickButton*). 지금 패드에 없는 글자는 거절한다 — 플랫폼을 섞어 쓴 케이스가 다른 자리를 누르고 통과하지 않게.
        public static bool TryKey(string name, out KeyCode key, out string problem)
        {
            var label = name.Substring(4);
            var labels = Labels(Type);
            var usable = new List<string>();
            for (var i = 0; i < 20; i++)
            {
                var known = i < 12 ? labels?[i] : Common[i - 12];
                if (known == null) continue;
                if (string.Equals(known, label, StringComparison.OrdinalIgnoreCase))
                {
                    key = KeyCode.JoystickButton0 + i;
                    problem = null;
                    return true;
                }
                usable.Add("Pad." + known);
            }
            key = KeyCode.None;
            var names = string.Join(" · ", usable);
            problem = labels != null ? Type + " 패드에 없는 이름입니다: " + name + " (쓸 수 있는 이름 — " + names + ")"
                : name + " 는 콘솔 패드를 골라야 씁니다(pad xbox · ps5 · ps4 · switch) — 지금 쓸 수 있는 이름: " + names;
            return false;
        }

#if QAHUB_SDK_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
        private static Gamepad _device;
        // 한 번이라도 누른 상태를 보냈으면 다 뗄 때도 보낸다.
        private static bool _sent;

        public static bool Sent => _sent;

        // 이 빌드 · 이 플랫폼에서 만들 수 있는 종류 — ping 의 pads.
        public static List<string> Makeable()
        {
            var list = new List<string> { "generic" };
            foreach (var type in Types)
                if (Describe(type, out _)) list.Add(type);
            return list;
        }

        // 그 종류의 장치 설명 — 콘솔 layout 타입은 Input System 의 standalone · Editor 빌드에만 있어(타입을 직접 쓰면 Android 빌드가 깨진다) 설명으로 고르게 한다.
        private static bool Describe(string type, out InputDeviceDescription description)
        {
            description = default;
            var platform = Application.platform;
            var windows = platform == RuntimePlatform.WindowsPlayer || platform == RuntimePlatform.WindowsEditor;
            var mac = platform == RuntimePlatform.OSXPlayer || platform == RuntimePlatform.OSXEditor;
            var desktop = windows || mac || platform == RuntimePlatform.LinuxPlayer || platform == RuntimePlatform.LinuxEditor;
            switch (type)
            {
                case "ps5": description = Hid(0x054C, 0x0CE6); return desktop;
                case "ps4": description = Hid(0x054C, 0x09CC); return desktop;
                case "switch": description = Hid(0x057E, 0x2009); return desktop;
                case "xbox":
                    // Windows 는 XInput, macOS 는 블루투스 Xbox 패드(HID). Linux 의 Xbox layout 은 SDL 쪽이라 하지 않는다.
                    description = windows ? new InputDeviceDescription { interfaceName = "XInput" } : new InputDeviceDescription { interfaceName = "HID", product = "Xbox Wireless Controller" };
                    return windows || mac;
                default: return false;
            }
        }

        private static InputDeviceDescription Hid(int vendor, int product) =>
            new InputDeviceDescription { interfaceName = "HID", capabilities = "{\"vendorId\":" + vendor + ",\"productId\":" + product + "}" };

        // 종류를 바꾼다 — 앞 가상 패드를 없애고 새로 만든다. 못 만들면 까닭을 돌려주고 앞 패드는 그대로 둔다(비슷한 layout 으로 몰래 바꾸지 않는다).
        public static string Use(string type)
        {
            type = (type ?? "").ToLowerInvariant();
            if (Array.IndexOf(Types, type) < 0) return "type 은 " + string.Join(" · ", Types) + " 중 하나입니다";
            Gamepad made = null;
            if (type != "off")
            {
                made = Make(type, out var problem);
                if (made == null) return problem;
            }
            if (_device != null && _device.added) InputSystem.RemoveDevice(_device);
            _device = made;
            Type = type;
            _sent = false;
            // 만들자마자 지금 눌린 상태(없으면 중립)를 보낸다 — Switch 는 빈 상태가 스틱을 끝까지 꺾은 값으로 읽힌다.
            if (made != null) Publish();
            return null;
        }

        private static Gamepad Make(string type, out string problem)
        {
            problem = null;
            InputDevice device;
            if (type == "generic") device = InputSystem.AddDevice("Gamepad");
            else
            {
                if (!Describe(type, out var description))
                {
                    problem = "이 플랫폼(" + Application.platform + ")에서는 " + type + " 패드를 만들 수 없습니다 — 만들 수 있는 종류: " + string.Join(" · ", Makeable());
                    return null;
                }
                // 그 설명에 맞는 layout 이 없으면 ArgumentException — Input System 이 그 패드를 뺀 채 빌드된 게임.
                try { device = InputSystem.AddDevice(description); }
                catch (ArgumentException e)
                {
                    problem = "이 게임의 Input System 에 " + type + " 패드 layout 이 없습니다: " + e.Message;
                    return null;
                }
            }
            if (device is Gamepad pad) return pad;
            problem = type + " 패드가 Gamepad 가 아닌 " + device.layout + " 으로 만들어졌습니다";
            InputSystem.RemoveDevice(device);
            return null;
        }

        // 패드 키(JoystickButton0~19)인가 — FakeInputSystem 이 키보드 키와 가른다.
        public static bool Is(KeyCode code) => code >= KeyCode.JoystickButton0 && code <= KeyCode.JoystickButton19;

        // 누른 패드 키 전부를 한 상태로 — 실물 패드가 꽂혀 있어도 늘 자기 장치에 보낸다(실물은 상태 형식이 달라 그리로 보낸 입력은 버려진다).
        // AltTester 와 같은 짝 — JoystickButton0~15 는 버튼(6 · 7 은 방아쇠 값), 16~19 는 왼 스틱 x · y · 오른 스틱 x · y(값 = 세기).
        public static void Publish()
        {
            // 게임이 장치를 없앴으면 같은 종류로 다시 만든다. 못 만들면(그럴 일은 없다) 보내지 않는다.
            if (_device == null || !_device.added)
            {
                _device = Make(Type == "off" ? "generic" : Type, out _);
                if (_device == null) return;
                if (Type == "off") Type = "generic";
            }
            var pad = _device;
            var held = new float[20];
            var any = false;
            foreach (var kv in FakeKeys.All)
            {
                if (!Is(kv.Key)) continue;
                held[kv.Key - KeyCode.JoystickButton0] = kv.Value;
                any = true;
            }
            // 형식이 layout 마다 다르다 — 지금 상태를 복사한 전체 상태 이벤트에 control 로 값을 쓴다. PS 계열은 바뀐 칸만 보낸 이벤트를 버린다.
            using (StateEvent.From(pad, out var ptr))
            {
                var buttons = new[] { pad.buttonSouth, pad.buttonEast, pad.buttonWest, pad.buttonNorth, pad.leftShoulder, pad.rightShoulder, null, null, pad.selectButton, pad.startButton, pad.leftStickButton, pad.rightStickButton };
                for (var i = 0; i < buttons.Length; i++)
                    if (buttons[i] != null) buttons[i].WriteValueIntoEvent(held[i] != 0 ? 1f : 0f, ptr);
                Axis(pad.leftTrigger, Mathf.Abs(held[6]), ptr);
                Axis(pad.rightTrigger, Mathf.Abs(held[7]), ptr);
                Dpad(pad, held[12] != 0, held[13] != 0, held[14] != 0, held[15] != 0, ptr);
                Axis(pad.leftStick.x, held[16], ptr);
                Axis(pad.leftStick.y, held[17], ptr);
                Axis(pad.rightStick.x, held[18], ptr);
                Axis(pad.rightStick.y, held[19], ptr);
                InputSystem.QueueEvent(ptr);
            }
            _sent = any;
            FakeInputSystem.Queued();
        }

        // 축 값을 이벤트에 — 가운데가 0 이 아닌 축(PS · Switch 의 byte, macOS Xbox 의 ushort)은 Input System 의 되돌려 쓰기가 음수 쪽을 가운데로 쓴다(1.18.0 실측 — Denormalize).
        // 그런 축은 날값을 셈해 상태 칸에 바로 쓴다. Input System 이 그 버그를 고쳐도 결과가 같다.
        private static unsafe void Axis(AxisControl axis, float value, InputEventPtr ptr)
        {
            if (!axis.normalize || axis.normalizeZero <= axis.normalizeMin)
            {
                axis.WriteValueIntoEvent(value, ptr);
                return;
            }
            if (axis.invert) value = -value;
            var raw = axis.normalizeZero + (value < 0 ? axis.normalizeZero - axis.normalizeMin : axis.normalizeMax - axis.normalizeZero) * value;
            var state = axis.GetStatePtrFromStateEvent(ptr);
            if (state != null) axis.stateBlock.WriteFloat(state, raw);
        }

        // 위 · 오른쪽 위 · 오른쪽 … 왼쪽 위 차례의 hat 걸음 — (x + 1) * 3 + (y + 1) 로 찾는다. 가운데(4)는 중립.
        private static readonly int[] HatStep = { 5, 6, 7, 4, -1, 0, 3, 2, 1 };

        // 십자키 — 비트면(Switch · Windows Xbox · generic) control 로 쓴다. hat 이면(PS · macOS Xbox) 방향 하나가 값 범위라 control 로는 못 쓴다(NotSupportedException) — hat 값을 바로 쓴다.
        // hat 값은 위부터 시계 방향으로 1 씩 — 위 값 = right 의 minValue − 1, 중립 = up 의 nullValue(PS 는 0 · 8, macOS Xbox 는 1 · 0).
        private static unsafe void Dpad(Gamepad pad, bool up, bool down, bool left, bool right, InputEventPtr ptr)
        {
            var dpad = pad.dpad;
            if (!(dpad.up is DiscreteButtonControl hatUp) || !(dpad.right is DiscreteButtonControl hatRight))
            {
                dpad.up.WriteValueIntoEvent(up ? 1f : 0f, ptr);
                dpad.down.WriteValueIntoEvent(down ? 1f : 0f, ptr);
                dpad.left.WriteValueIntoEvent(left ? 1f : 0f, ptr);
                dpad.right.WriteValueIntoEvent(right ? 1f : 0f, ptr);
                return;
            }
            var step = HatStep[((right ? 1 : 0) - (left ? 1 : 0) + 1) * 3 + (up ? 1 : 0) - (down ? 1 : 0) + 1];
            var state = hatUp.GetStatePtrFromStateEvent(ptr);
            if (state != null) hatUp.stateBlock.WriteInt(state, step < 0 ? hatUp.nullValue : hatRight.minValue - 1 + step);
        }

        [Serializable]
        private sealed class HidIds
        {
            public int vendorId;
            public int productId;
        }

        // pad 답 — 지금 가상 패드(종류 · layout · 그 layout 이 주는 버튼 표시 이름)와 붙은 패드 · 조이스틱 전부.
        // devices 는 Steam Input · 변환 도구가 끼어 실물 패드가 다른 layout 으로 보이는 것을 시험 실패와 가르는 근거다.
        public static string Reply()
        {
            var sb = new StringBuilder("{\"ok\":true,\"pad\":{\"type\":").Append(Json.Str(Type));
            var pad = _device != null && _device.added ? _device : null;
            if (pad != null)
            {
                sb.Append(",\"layout\":").Append(Json.Str(pad.layout)).Append(",\"buttons\":{");
                var spots = new[] { "south", "east", "west", "north", "leftShoulder", "rightShoulder", "leftTrigger", "rightTrigger", "select", "start", "leftStick", "rightStick" };
                var controls = new InputControl[] { pad.buttonSouth, pad.buttonEast, pad.buttonWest, pad.buttonNorth, pad.leftShoulder, pad.rightShoulder, pad.leftTrigger, pad.rightTrigger, pad.selectButton, pad.startButton, pad.leftStickButton, pad.rightStickButton };
                for (var i = 0; i < spots.Length; i++)
                    sb.Append(i > 0 ? "," : "").Append('"').Append(spots[i]).Append("\":").Append(Json.Str(controls[i].displayName));
                sb.Append('}');
            }
            sb.Append("},\"devices\":[");
            var first = true;
            foreach (var device in InputSystem.devices)
            {
                if (!(device is Gamepad) && !(device is Joystick)) continue;
                sb.Append(first ? "" : ",").Append("{\"layout\":").Append(Json.Str(device.layout));
                first = false;
                var description = device.description;
                if (!string.IsNullOrEmpty(description.product)) sb.Append(",\"product\":").Append(Json.Str(description.product));
                // HID 장치는 capabilities 가 JSON 이다 — 꼴이 다르면 번호 없이 싣는다.
                if (description.interfaceName == "HID" && !string.IsNullOrEmpty(description.capabilities))
                {
                    try
                    {
                        var ids = JsonUtility.FromJson<HidIds>(description.capabilities);
                        if (ids != null && ids.vendorId != 0) sb.Append(",\"vendorId\":").Append(ids.vendorId).Append(",\"productId\":").Append(ids.productId);
                    }
                    catch (ArgumentException) { }
                }
                sb.Append(",\"native\":").Append(device.native ? "true" : "false").Append('}');
            }
            return sb.Append("]}").ToString();
        }
#endif
    }
}
