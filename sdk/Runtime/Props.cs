// 오브젝트의 컴포넌트 칸(필드 · 속성)을 리플렉션으로 읽어 JSON 값으로 돌려준다 — 게임이 폰에서 셈하는 값(이동 속도 · 데미지) 확인용
using System;
using System.Globalization;
using System.Reflection;
using UnityEngine;

namespace ControlCli
{
    internal static class Props
    {
        private const BindingFlags Member = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

        // prop 은 「컴포넌트 타입 이름.칸[.칸…]」 — PlayerController.moveSpeed · Transform.position
        public static string Get(GameObject go, string prop)
        {
            var parts = (prop ?? "").Split('.');
            if (parts.Length < 2) return Fail("prop 은 「컴포넌트.칸」 꼴이어야 합니다 (예: Transform.position)");
            Component component = null;
            foreach (var c in go.GetComponents<Component>())
                if (c != null && (c.GetType().Name == parts[0] || c.GetType().FullName == parts[0])) { component = c; break; }
            if (component == null) return Fail(go.name + " 에 " + parts[0] + " 컴포넌트가 없습니다");

            object value = component;
            for (var i = 1; i < parts.Length; i++)
            {
                if (value == null) return Fail(string.Join(".", parts, 0, i) + " 이 null 이라 " + parts[i] + " 을 읽을 수 없습니다");
                if (!TryRead(value, parts[i], out value))
                    return Fail(string.Join(".", parts, 0, i) + " 에 " + parts[i] + " 칸이 없습니다 — QA 빌드 코드 줄이기에서 빠졌을 수도 있습니다");
            }
            return "{\"ok\":true,\"value\":" + Value(value) + "}";
        }

        // 부모 타입의 private 칸은 그 타입에서만 보여 위로 올라가며 찾는다.
        private static bool TryRead(object owner, string name, out object value)
        {
            for (var type = owner.GetType(); type != null; type = type.BaseType)
            {
                var field = type.GetField(name, Member | BindingFlags.DeclaredOnly);
                if (field != null) { value = field.GetValue(owner); return true; }
                var property = type.GetProperty(name, Member | BindingFlags.DeclaredOnly);
                if (property != null && property.GetIndexParameters().Length == 0 && property.GetGetMethod(true) != null)
                {
                    value = property.GetValue(owner);
                    return true;
                }
            }
            value = null;
            return false;
        }

        private static string Value(object v)
        {
            switch (v)
            {
                case null: return "null";
                case string s: return Json.Str(s);
                case bool b: return b ? "true" : "false";
                case Enum e: return Json.Str(e.ToString());
                case float f: return float.IsNaN(f) || float.IsInfinity(f) ? Json.Str(f.ToString(CultureInfo.InvariantCulture)) : f.ToString("R", CultureInfo.InvariantCulture);
                case double d: return double.IsNaN(d) || double.IsInfinity(d) ? Json.Str(d.ToString(CultureInfo.InvariantCulture)) : d.ToString("R", CultureInfo.InvariantCulture);
                case int _: case long _: case short _: case byte _: case uint _: case ulong _: case ushort _: case sbyte _: case decimal _:
                    return ((IFormattable)v).ToString(null, CultureInfo.InvariantCulture);
                case Vector2 v2: return "[" + Value(v2.x) + "," + Value(v2.y) + "]";
                case Vector3 v3: return "[" + Value(v3.x) + "," + Value(v3.y) + "," + Value(v3.z) + "]";
                case Vector4 v4: return "[" + Value(v4.x) + "," + Value(v4.y) + "," + Value(v4.z) + "," + Value(v4.w) + "]";
                case Color c: return "[" + Value(c.r) + "," + Value(c.g) + "," + Value(c.b) + "," + Value(c.a) + "]";
                // 그 밖의 타입(목록 · 게임 객체)은 글자로 — 케이스는 숫자 · 글자 칸을 읽는다.
                default: return Json.Str(v.ToString());
            }
        }

        private static string Fail(string message) => "{\"ok\":false,\"error\":" + Json.Str(message) + "}";
    }
}
