// 오브젝트 · static 타입의 칸(필드 · 속성)을 리플렉션으로 읽고 쓰고 메서드를 부른다 — 게임이 폰에서 셈하는 값 확인 · QA 치트(골드 넣기 · 단계 건너뛰기)
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using UnityEngine;

namespace ControlCli
{
    internal static class Props
    {
        private const BindingFlags Member = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        private const BindingFlags StaticMember = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        // 읽기만 해도 사본을 만들어 게임을 바꾸는 Unity 속성 — 공유본(sharedMaterial · sharedMesh)을 읽게 한다.
        private static readonly string[] Copying = { "material", "materials", "mesh" };

        // prop 은 「컴포넌트 타입 이름.칸[.칸…]」 — PlayerController.moveSpeed · Transform.position
        public static string Get(GameObject go, string prop)
        {
            if (!Owner(go, prop, out var component, out var parts, out var problem)) return Fail(problem);
            return Guard(prop, () => Read(component, null, parts, 1, prop));
        }

        // value 는 get 이 주는 꼴의 글자 — 2.5 · true · [0,1,0] · 열거 이름. 바꾼 뒤 다시 읽어 준다.
        public static string Set(GameObject go, string prop, string value)
        {
            if (!Owner(go, prop, out var component, out var parts, out var problem)) return Fail(problem);
            return Guard(prop, () => Write(component, null, parts, 1, value, prop));
        }

        // method 는 「컴포넌트.메서드」 — 컴포넌트는 타입 이름 또는 전체 이름(Game.PlayerController.Jump)
        public static string Call(GameObject go, string method, string[] args)
        {
            var dot = (method ?? "").LastIndexOf('.');
            if (dot <= 0 || dot == method.Length - 1) return Fail("method 는 「컴포넌트.메서드」 꼴이어야 합니다 (예: PlayerController.Jump)");
            var component = ComponentOf(go, method.Substring(0, dot));
            if (component == null) return Fail(go.name + " 에 " + method.Substring(0, dot) + " 컴포넌트가 없습니다");
            return Guard(method, () => Invoke(component, component.GetType(), method.Substring(dot + 1), args, method));
        }

        // prop 은 「타입.칸[.칸…]」 — UnityEngine.Time.timeScale
        public static string GetStatic(string prop)
        {
            if (!StaticOwner(prop, out var type, out var parts, out var start, out var problem)) return Fail(problem);
            return Guard(prop, () => Read(null, type, parts, start, prop));
        }

        public static string SetStatic(string prop, string value)
        {
            if (!StaticOwner(prop, out var type, out var parts, out var start, out var problem)) return Fail(problem);
            return Guard(prop, () => Write(null, type, parts, start, value, prop));
        }

        // method 는 「타입.메서드」 — Game.Cheats.AddGold · 하나뿐인 짧은 이름이면 Cheats.AddGold
        public static string CallStatic(string method, string[] args)
        {
            var dot = (method ?? "").LastIndexOf('.');
            if (dot <= 0 || dot == method.Length - 1) return Fail("method 는 「타입.메서드」 꼴이어야 합니다 (예: Game.Cheats.AddGold)");
            var type = TypeNamed(method.Substring(0, dot), out var problem);
            if (type == null) return Fail(problem ?? method.Substring(0, dot) + " 타입이 없습니다 — 전체 이름(네임스페이스.타입)을 씁니다");
            return Guard(method, () => Invoke(null, type, method.Substring(dot + 1), args, method));
        }

        private static bool Owner(GameObject go, string prop, out Component component, out string[] parts, out string problem)
        {
            problem = null;
            parts = (prop ?? "").Split('.');
            component = parts.Length < 2 ? null : ComponentOf(go, parts[0]);
            if (parts.Length < 2) problem = "prop 은 「컴포넌트.칸」 꼴이어야 합니다 (예: Transform.position)";
            else if (component == null) problem = go.name + " 에 " + parts[0] + " 컴포넌트가 없습니다";
            return component != null;
        }

        private static Component ComponentOf(GameObject go, string name)
        {
            foreach (var c in go.GetComponents<Component>())
                if (c != null && (c.GetType().Name == name || c.GetType().FullName == name)) return c;
            return null;
        }

        // 「타입.칸[.칸…]」에서 가장 긴 앞부분이 타입이다 — UnityEngine.Time.timeScale 은 UnityEngine.Time 의 timeScale.
        private static bool StaticOwner(string prop, out Type type, out string[] parts, out int start, out string problem)
        {
            type = null;
            problem = null;
            parts = (prop ?? "").Split('.');
            for (start = parts.Length - 1; start >= 1; start--)
            {
                type = TypeNamed(string.Join(".", parts, 0, start), out problem);
                if (type != null) return true;
                if (problem != null) return false;
            }
            problem = parts.Length < 2 ? "prop 은 「타입.칸」 꼴이어야 합니다 (예: UnityEngine.Time.timeScale)" : prop + " 에서 타입을 찾지 못했습니다 — 전체 이름(네임스페이스.타입)을 씁니다";
            return false;
        }

        // 전체 이름은 바로, 점 없는 짧은 이름은 하나뿐일 때만 — 겹치면 고르지 않는다(Tree.Find 와 같은 규칙).
        private static Type TypeNamed(string name, out string problem)
        {
            problem = null;
            var assemblies = AppDomain.CurrentDomain.GetAssemblies();
            foreach (var a in assemblies)
            {
                var t = a.GetType(name, false);
                if (t != null) return t;
            }
            if (name.IndexOf('.') >= 0) return null;
            Type found = null;
            var count = 0;
            foreach (var a in assemblies)
            {
                Type[] types;
                try { types = a.GetTypes(); }
                catch (ReflectionTypeLoadException e) { types = e.Types; }
                foreach (var t in types)
                    if (t != null && t.Name == name && count++ == 0) found = t;
            }
            if (count > 1) problem = name + " 타입이 " + count + "개라 고를 수 없습니다 — 전체 이름(네임스페이스.타입)을 씁니다";
            return count == 1 ? found : null;
        }

        // 게임 코드가 던진 예외는 감싸져 온다 — 게임 쪽 까닭을 그대로 보인다.
        private static string Guard(string what, Func<string> body)
        {
            try { return body(); }
            catch (TargetInvocationException e) { return Fail(what + " 에서 게임이 던졌습니다: " + (e.InnerException ?? e).Message); }
        }

        // owner 가 null 이면 첫 칸은 type 의 static 칸이다.
        private static string Read(object owner, Type type, string[] parts, int start, string prop)
        {
            if (!Walk(owner, type, parts, start, true, out var value, out _, out _, out var problem)) return Fail(problem);
            return "{\"ok\":true,\"value\":" + Value(value) + "}";
        }

        private static string Write(object owner, Type type, string[] parts, int start, string text, string prop)
        {
            if (!Walk(owner, type, parts, start, false, out _, out var owners, out var members, out var problem)) return Fail(problem);
            var last = parts.Length - 1;
            if (!Writable(members[last])) return Fail(prop + " 은 읽기 전용입니다");
            if (!Parse(text, TypeOfMember(members[last]), out var value, out problem)) return Fail(prop + " — " + problem);
            WriteMember(members[last], owners[last], value);
            // 값 타입(Vector3 같은 구조체)은 읽으면 사본이다 — 바꾼 사본을 위 칸에 거꾸로 써 넣어야 Transform.position.y 가 position 을 바꾼다.
            for (var i = last; i > start && owners[i] != null && owners[i].GetType().IsValueType; i--)
            {
                if (!Writable(members[i - 1])) return Fail(string.Join(".", parts, 0, i) + " 은 읽기 전용이라 " + parts[i] + " 을 바꿔도 남지 않습니다");
                WriteMember(members[i - 1], owners[i - 1], owners[i]);
            }
            return Read(owner, type, parts, start, prop);
        }

        // 칸 길을 따라 내려간다 — owners[i] 는 parts[i] 칸을 가진 값(static 첫 칸은 null), 끝 칸 값은 readLast 일 때만 읽는다.
        private static bool Walk(object owner, Type type, string[] parts, int start, bool readLast, out object value, out object[] owners, out MemberInfo[] members, out string problem)
        {
            owners = new object[parts.Length];
            members = new MemberInfo[parts.Length];
            value = owner;
            problem = null;
            for (var i = start; i < parts.Length; i++)
            {
                var path = string.Join(".", parts, 0, i);
                var statics = i == start && owner == null;
                if (!statics && value == null)
                {
                    problem = path + " 이 null 이라 " + parts[i] + " 을 읽을 수 없습니다";
                    return false;
                }
                if (Array.IndexOf(Copying, parts[i]) >= 0 && value is Component)
                {
                    problem = parts[i] + " 은 읽기만 해도 사본을 만들어 게임을 바꿉니다 — shared" + char.ToUpperInvariant(parts[i][0]) + parts[i].Substring(1) + " 을 씁니다";
                    return false;
                }
                var member = MemberOf(statics ? type : value.GetType(), parts[i], statics ? StaticMember : Member);
                if (member == null)
                {
                    problem = path + " 에 " + parts[i] + " 칸이 없습니다 — QA 빌드 코드 줄이기에서 빠졌을 수도 있습니다";
                    return false;
                }
                owners[i] = value;
                members[i] = member;
                if (i < parts.Length - 1 || readLast) value = member is FieldInfo f ? f.GetValue(value) : ((PropertyInfo)member).GetValue(value);
            }
            return true;
        }

        // 부모 타입의 private 칸은 그 타입에서만 보여 위로 올라가며 찾는다. 인덱스 속성(this[i])은 칸이 아니다.
        private static MemberInfo MemberOf(Type type, string name, BindingFlags flags)
        {
            for (var t = type; t != null; t = t.BaseType)
            {
                var field = t.GetField(name, flags | BindingFlags.DeclaredOnly);
                if (field != null) return field;
                var property = t.GetProperty(name, flags | BindingFlags.DeclaredOnly);
                if (property != null && property.GetIndexParameters().Length == 0 && property.GetGetMethod(true) != null) return property;
            }
            return null;
        }

        private static bool Writable(MemberInfo m) => m is FieldInfo f ? !f.IsInitOnly && !f.IsLiteral : ((PropertyInfo)m).GetSetMethod(true) != null;

        private static Type TypeOfMember(MemberInfo m) => m is FieldInfo f ? f.FieldType : ((PropertyInfo)m).PropertyType;

        private static void WriteMember(MemberInfo m, object owner, object value)
        {
            if (m is FieldInfo f) f.SetValue(owner, value);
            else ((PropertyInfo)m).SetValue(owner, value);
        }

        // 인자 수가 맞고 글자를 다 그 칸 타입으로 바꿀 수 있는 첫 꼴을 부른다. 아래(파생) 타입의 것을 먼저 본다 — override 가 이긴다.
        private static string Invoke(object owner, Type type, string name, string[] args, string what)
        {
            args = args ?? new string[0];
            var flags = (owner == null ? BindingFlags.Static : BindingFlags.Instance) | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;
            var shapes = new List<string>();
            for (var t = type; t != null; t = t.BaseType)
                foreach (var m in t.GetMethods(flags))
                {
                    if (m.Name != name || m.ContainsGenericParameters) continue;
                    var ps = m.GetParameters();
                    shapes.Add(Shape(m, ps));
                    if (ps.Length != args.Length) continue;
                    var values = new object[ps.Length];
                    var fits = true;
                    for (var i = 0; i < ps.Length && fits; i++) fits = Parse(args[i], ps[i].ParameterType, out values[i], out _);
                    if (!fits) continue;
                    var result = m.Invoke(owner, values);
                    return "{\"ok\":true,\"value\":" + (m.ReturnType == typeof(void) ? "null" : Value(result)) + "}";
                }
            if (shapes.Count == 0) return Fail(what + " 메서드가 없습니다 — QA 빌드 코드 줄이기에서 빠졌을 수도 있습니다");
            return Fail(what + " 을 인자 " + args.Length + "개(" + string.Join(", ", args) + ")로 부를 꼴이 없습니다 — 있는 꼴: " + string.Join(" · ", shapes));
        }

        private static string Shape(MethodInfo m, ParameterInfo[] ps)
        {
            var names = new string[ps.Length];
            for (var i = 0; i < ps.Length; i++) names[i] = ps[i].ParameterType.Name;
            return m.Name + "(" + string.Join(", ", names) + ")";
        }

        // 글자 → 칸 타입 — get 이 주는 꼴(숫자 · 글자 · 참거짓 · 열거 이름 · [x,y,z] 벡터 · 색)을 그대로 받는다.
        private static bool Parse(string text, Type type, out object value, out string problem)
        {
            value = null;
            problem = null;
            text = text ?? "";
            try
            {
                if (type == typeof(string) || type == typeof(object)) value = text;
                else if (type == typeof(bool)) value = bool.Parse(text);
                else if (type.IsEnum) value = Enum.Parse(type, text, true);
                else if (type.IsPrimitive || type == typeof(decimal)) value = Convert.ChangeType(text, type, CultureInfo.InvariantCulture);
                else
                {
                    var size = type == typeof(Vector2) ? 2 : type == typeof(Vector3) ? 3 : type == typeof(Vector4) || type == typeof(Color) ? 4 : 0;
                    if (size == 0)
                    {
                        problem = type.Name + " 칸은 글자로 넣을 수 없습니다 — 글자 · 숫자 · 참거짓 · 열거 이름 · [x,y,z] 벡터 · 색만";
                        return false;
                    }
                    var n = text.Trim().TrimStart('[').TrimEnd(']').Split(',');
                    // 색은 알파를 빼면 1 이다.
                    if (n.Length != size && !(type == typeof(Color) && n.Length == 3))
                    {
                        problem = "「" + text + "」은 " + type.Name + " 꼴([" + (size == 2 ? "x,y" : size == 3 ? "x,y,z" : "x,y,z,w") + "])이 아닙니다";
                        return false;
                    }
                    var f = new float[] { 0, 0, 0, 1 };
                    for (var i = 0; i < n.Length; i++) f[i] = float.Parse(n[i].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture);
                    value = type == typeof(Vector2) ? new Vector2(f[0], f[1])
                        : type == typeof(Vector3) ? new Vector3(f[0], f[1], f[2])
                        : type == typeof(Vector4) ? new Vector4(f[0], f[1], f[2], f[3])
                        : (object)new Color(f[0], f[1], f[2], f[3]);
                }
                return true;
            }
            catch (Exception e) when (e is FormatException || e is OverflowException || e is ArgumentException || e is InvalidCastException)
            {
                problem = "「" + text + "」을 " + type.Name + " 로 바꿀 수 없습니다";
                return false;
            }
        }

        internal static string Value(object v)
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
