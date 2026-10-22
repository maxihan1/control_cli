// 폰 안 127.0.0.1 포트로 명령 한 줄을 받아 게임 메인 스레드에서 처리하고 JSON 한 줄로 답한다
using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.Scripting;
using UnityEngine.UI;

// 아무도 참조하지 않는 어셈블리라 IL2CPP 코드 줄이기에서 통째로 빠지지 않게 붙잡아 둔다.
[assembly: AlwaysLinkAssembly]

namespace ControlCli
{
    [Preserve]
    public sealed class ControlServer : MonoBehaviour
    {
        // 127.0.0.1 만 연다 — 폰 밖에서는 adb forward 로만 닿는다.
        public const int Port = 13100;
        private const int ReplyTimeoutMs = 10000;

        private sealed class Request
        {
            public string Line;
            public string Reply;
            public readonly ManualResetEventSlim Done = new ManualResetEventSlim();
        }

        private readonly ConcurrentQueue<Request> _requests = new ConcurrentQueue<Request>();
        private TcpListener _listener;
        private Thread _acceptThread;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad), Preserve]
        private static void Boot()
        {
            var go = new GameObject("[ControlCli]");
            DontDestroyOnLoad(go);
            Tree.KeptScene = go.scene;
            go.AddComponent<FakeTouches>();
            go.AddComponent<ControlServer>();
        }

        private void Awake()
        {
            _listener = new TcpListener(IPAddress.Loopback, Port);
            _listener.Start();
            _acceptThread = new Thread(AcceptLoop) { IsBackground = true, Name = "ControlCli" };
            _acceptThread.Start();
            Debug.Log($"[ControlCli] 127.0.0.1:{Port} 에서 명령을 받습니다");
        }

        private void OnDestroy() => _listener?.Stop();

        private void AcceptLoop()
        {
            while (true)
            {
                TcpClient client;
                try { client = _listener.AcceptTcpClient(); }
                catch (SocketException) { return; } // Stop() 으로 닫힐 때
                catch (ObjectDisposedException) { return; }
                new Thread(() => Serve(client)) { IsBackground = true }.Start();
            }
        }

        private void Serve(TcpClient client)
        {
            using (client)
            using (var stream = client.GetStream())
            using (var reader = new StreamReader(stream, Encoding.UTF8))
            using (var writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" })
            {
                try
                {
                    string line;
                    while ((line = reader.ReadLine()) != null)
                    {
                        var request = new Request { Line = line };
                        _requests.Enqueue(request);
                        writer.WriteLine(request.Done.Wait(ReplyTimeoutMs)
                            ? request.Reply
                            : Error("게임이 10초 안에 답하지 않았습니다(멈췄거나 일시정지)"));
                    }
                }
                catch (IOException) { } // 상대가 연결을 끊었다
            }
        }

        private void Update()
        {
            while (_requests.TryDequeue(out var request))
            {
                try { request.Reply = Handle(request.Line.Trim()); }
                catch (Exception e) { request.Reply = Error(e.GetType().Name + ": " + e.Message); }
                request.Done.Set();
            }
        }

        private static string Handle(string line)
        {
            var space = line.IndexOf(' ');
            var cmd = space < 0 ? line : line.Substring(0, space);
            var arg = space < 0 ? "" : line.Substring(space + 1).Trim();
            switch (cmd)
            {
                case "ping":
                    return "{\"ok\":true,\"app\":" + Json.Str(Application.identifier) + ",\"version\":" + Json.Str(Application.version) + "}";
                case "tree":
                    return "{\"ok\":true,\"screen\":[" + Screen.width + "," + Screen.height + "],\"tree\":" + Tree.Dump() + "}";
                case "tap":
                    var xy = arg.Split(' ');
                    if (xy.Length != 2) return Error("tap <x> <y> 꼴이어야 합니다");
                    var point = new Vector2(float.Parse(xy[0], CultureInfo.InvariantCulture), float.Parse(xy[1], CultureInfo.InvariantCulture));
                    FakeTouches.Tap(point);
                    return Tapped(point);
                case "click":
                    var target = Tree.Find(arg, out var problem);
                    if (target == null) return Error(problem);
                    var center = Tree.ScreenCenter(target);
                    if (center == null) return Error(arg + " 은 화면 위 UI(RectTransform)가 아닙니다");
                    FakeTouches.Tap(center.Value);
                    return Tapped(center.Value);
                default:
                    return Error("모르는 명령입니다: " + cmd + " (ping · tree · tap · click)");
            }
        }

        private static string Tapped(Vector2 p) =>
            "{\"ok\":true,\"x\":" + Mathf.RoundToInt(p.x) + ",\"y\":" + Mathf.RoundToInt(p.y) + "}";

        private static string Error(string message) => "{\"ok\":false,\"error\":" + Json.Str(message) + "}";
    }

    internal static class Json
    {
        public static string Str(string s)
        {
            if (s == null) return "null";
            var sb = new StringBuilder(s.Length + 2).Append('"');
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }
    }

    internal static class Tree
    {
        // 켜진 오브젝트만 담는다 — 꺼진 것은 화면에 없어 누를 수 없다.
        public static string Dump()
        {
            var sb = new StringBuilder("[");
            var first = true;
            foreach (var root in Roots())
            {
                if (!root.activeInHierarchy) continue;
                if (!first) sb.Append(',');
                first = false;
                Node(root.transform, sb);
            }
            return sb.Append(']').ToString();
        }

        private static void Node(Transform t, StringBuilder sb)
        {
            sb.Append("{\"name\":").Append(Json.Str(t.name));
            var text = TextOf(t.gameObject);
            if (text != null) sb.Append(",\"text\":").Append(Json.Str(text));
            var selectable = t.GetComponent<Selectable>();
            if (selectable != null) sb.Append(",\"interactable\":").Append(selectable.IsInteractable() ? "true" : "false");
            var children = false;
            foreach (Transform child in t)
            {
                if (!child.gameObject.activeInHierarchy) continue;
                sb.Append(children ? "," : ",\"children\":[");
                children = true;
                Node(child, sb);
            }
            if (children) sb.Append(']');
            sb.Append('}');
        }

        private static string TextOf(GameObject go)
        {
            var input = go.GetComponent<InputField>();
            // 비밀번호는 글자를 가리되 비었는지는 보이게 한다 — 「입력 안 됨」을 케이스가 확인할 수 있어야 한다.
            if (input != null) return input.inputType == InputField.InputType.Password && input.text.Length > 0 ? "***" : input.text;
            var label = go.GetComponent<Text>();
            return label != null ? label.text : null;
        }

        // 이름이 겹치면 고르지 않고 알린다 — 엉뚱한 것을 누르면 케이스가 틀린 곳에서 통과한다.
        public static GameObject Find(string name, out string problem)
        {
            problem = null;
            GameObject found = null;
            var count = 0;
            foreach (var root in Roots())
                foreach (var t in root.GetComponentsInChildren<Transform>(false))
                    if (t.name == name) { found ??= t.gameObject; count++; }
            if (count == 0) problem = "켜진 오브젝트 중에 " + name + " 이 없습니다";
            else if (count > 1) { problem = name + " 이 " + count + "개라 하나를 고를 수 없습니다"; found = null; }
            return found;
        }

        public static Vector2? ScreenCenter(GameObject go)
        {
            if (!(go.transform is RectTransform rect)) return null;
            var corners = new Vector3[4];
            rect.GetWorldCorners(corners);
            var world = (corners[0] + corners[2]) / 2f;
            var canvas = go.GetComponentInParent<Canvas>();
            var cam = canvas == null || canvas.rootCanvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.rootCanvas.worldCamera;
            return RectTransformUtility.WorldToScreenPoint(cam, world);
        }

        // DontDestroyOnLoad 로 옮긴 오브젝트는 장면 목록에 없어 우리 오브젝트가 있는 그 장면으로 따로 읽는다.
        public static Scene KeptScene;

        private static System.Collections.Generic.IEnumerable<GameObject> Roots()
        {
            for (var i = 0; i < SceneManager.sceneCount; i++)
                foreach (var go in SceneManager.GetSceneAt(i).GetRootGameObjects())
                    yield return go;
            if (KeptScene.IsValid())
                foreach (var go in KeptScene.GetRootGameObjects())
                    if (go.name != "[ControlCli]") yield return go;
        }
    }
}
