// 폰 안 127.0.0.1 포트로 JSON 명령 한 줄을 받아 게임 메인 스레드에서 처리하고 JSON 한 줄로 답한다
using System;
using System.Collections.Concurrent;
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
        private const string Commands = "ping · tree · find · click · drag · type · get · tap · errors · layout";

        private sealed class Request
        {
            public string Line;
            public string Reply;
            public readonly ManualResetEventSlim Done = new ManualResetEventSlim();
            // 0 기다림 · 1 게임이 가져감 · 2 시간 초과로 버림 — 둘 중 먼저 바꾼 쪽만 이긴다.
            public int State;
        }

        // 디바이스 팜은 본문 JSON 객체를 그대로 한 줄로 넘긴다(Devicefarm ADR-048). 쓰는 칸만 읽고 없는 칸은 기본값이다.
        [Serializable]
        private sealed class Command
        {
            public string cmd;
            public string target;
            public string to;
            public string text;
            public string prop;
            public long since;
            public float x;
            public float y;
        }

        private readonly ConcurrentQueue<Request> _requests = new ConcurrentQueue<Request>();
        private TcpListener _listener;
        private Thread _acceptThread;
        // 누르기 · 끌기는 가짜 터치가 다 나가고 게임이 처리한 뒤에 답한다 — 답 다음 명령이 바뀐 화면을 보게.
        private Request _touching;

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
                        // 실패로 답한 명령이 게임이 깨어난 뒤 늦게 눌리면 다음 명령이 엉뚱한 화면에서 돈다. 버린 요청은 Update 가 건너뛴다.
                        var timedOut = !request.Done.Wait(ReplyTimeoutMs) && Interlocked.CompareExchange(ref request.State, 2, 0) == 0;
                        if (!timedOut) request.Done.Wait();
                        writer.WriteLine(timedOut ? Error("게임이 10초 안에 답하지 않았습니다(멈췄거나 일시정지)") : request.Reply);
                    }
                }
                catch (IOException) { } // 상대가 연결을 끊었다
            }
        }

        private void Update()
        {
            // 터치가 도는 동안은 다음 명령을 꺼내지 않는다 — 명령은 받은 차례대로 돈다.
            if (_touching != null)
            {
                if (!FakeTouches.Idle) return;
                _touching.Done.Set();
                _touching = null;
            }
            while (_requests.TryDequeue(out var request))
            {
                if (Interlocked.CompareExchange(ref request.State, 1, 0) != 0) continue;
                try { request.Reply = Handle(request.Line.Trim()); }
                catch (Exception e) { request.Reply = Error(e.GetType().Name + ": " + e.Message); }
                if (!FakeTouches.Idle)
                {
                    _touching = request;
                    return;
                }
                request.Done.Set();
            }
        }

        private static string Handle(string line)
        {
            if (!line.StartsWith("{")) return Error("명령은 JSON 한 줄이어야 합니다 — {\"cmd\":\"ping\"}");
            var c = JsonUtility.FromJson<Command>(line);
            switch (c.cmd)
            {
                case "ping":
                    return "{\"ok\":true,\"app\":" + Json.Str(Application.identifier) + ",\"version\":" + Json.Str(Application.version) + "}";
                case "tree":
                    return "{\"ok\":true,\"scene\":" + Json.Str(SceneManager.GetActiveScene().name) + ",\"screen\":[" + Screen.width + "," + Screen.height + "],\"tree\":" + Tree.Dump() + "}";
                case "find":
                    return FindReply(c.target);
                case "tap":
                    var point = new Vector2(c.x, c.y);
                    FakeTouches.Tap(point);
                    return Touched(point);
                case "click":
                {
                    if (!Point(c.target, out var at, out var problem)) return Error(problem);
                    FakeTouches.Tap(at);
                    return Touched(at);
                }
                case "drag":
                {
                    if (!Point(c.target, out var from, out var problem)) return Error(problem);
                    if (!Point(c.to, out var to, out problem)) return Error(problem);
                    FakeTouches.Drag(from, to);
                    return Touched(to);
                }
                case "type":
                    return TypeText(c.target, c.text ?? "");
                case "get":
                {
                    var go = Tree.Find(c.target, out var problem);
                    return go == null ? Error(problem) : Props.Get(go, c.prop);
                }
                case "errors":
                    return c.since < 0 ? Error("since 는 0 이상이어야 합니다") : GameErrors.Since(c.since);
                case "layout":
                    return Layout.Check(c.target ?? "");
                default:
                    return Error("모르는 명령입니다: " + c.cmd + " (" + Commands + ")");
            }
        }

        // 기다리기는 바깥에서 find 를 되풀이한다 — 없음은 실패가 아니라 found:false 다. 이름이 겹치는 것만 실패다.
        private static string FindReply(string target)
        {
            var go = Tree.Find(target, out var problem, out var missing);
            if (go == null) return missing ? "{\"ok\":true,\"found\":false}" : Error(problem);
            var sb = new StringBuilder("{\"ok\":true,\"found\":true,\"path\":").Append(Json.Str(Tree.PathOf(go.transform)));
            var text = Tree.TextOf(go);
            if (text != null) sb.Append(",\"text\":").Append(Json.Str(text));
            var selectable = go.GetComponent<Selectable>();
            if (selectable != null) sb.Append(",\"interactable\":").Append(selectable.IsInteractable() ? "true" : "false");
            return sb.Append('}').ToString();
        }

        private static bool Point(string target, out Vector2 point, out string problem)
        {
            point = default;
            var go = Tree.Find(target, out problem);
            if (go == null) return false;
            var p = Tree.ScreenPoint(go);
            if (p == null)
            {
                problem = target + " 은 화면에 비친 자리가 없습니다(UI 도 아니고 주 카메라 앞도 아님)";
                return false;
            }
            point = p.Value;
            return true;
        }

        // 화면 키보드를 띄우지 않고 글자를 바로 넣는다. 글자 수 제한 · 글자 종류 거르기는 InputField 가 그대로 한다.
        private static string TypeText(string target, string text)
        {
            var go = Tree.Find(target, out var problem);
            if (go == null) return Error(problem);
            var field = go.GetComponent<InputField>();
            if (field == null) return Error(target + " 은 InputField 가 아닙니다");
            if (!field.IsInteractable()) return Error(target + " 은 잠겨 있어 글자를 넣을 수 없습니다");
            field.text = text;
            field.onEndEdit.Invoke(field.text);
            return "{\"ok\":true,\"text\":" + Json.Str(Tree.TextOf(go)) + "}";
        }

        private static string Touched(Vector2 p) =>
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
}
