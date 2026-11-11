// 폰 안 127.0.0.1 포트로 JSON 명령 한 줄을 받아 게임 메인 스레드에서 처리하고 JSON 한 줄로 답한다
using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;
using UnityEngine.EventSystems;
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
        // protocol/commands.json 의 명령 이름과 같은 차례(src/protocol.test.ts 가 본다) — ping 의 caps 로 CLI 에 알린다.
        private static readonly string[] Caps =
        {
            "ping", "tree", "find", "click", "drag", "type", "get", "tap", "key", "screenshot", "errors", "layout",
            "call", "set", "static-call", "static-get", "static-set", "pref-get", "pref-set", "pref-delete", "pref-clear",
            "timescale-get", "timescale-set", "scenes", "scene-load", "scene-unload",
            "find-all", "find-at", "components", "members", "text-set",
            "touch-down", "touch-move", "touch-up", "swipe", "long-press", "mouse-move", "scroll", "key-down", "key-up", "tilt", "pointer", "input-reset",
            "logs", "events", "sdk-log",
            // 명령 뒤는 기능(commands.json 의 features) — rect 는 find 답의 화면 사각형.
            "rect",
        };
        // sdk/unity/package.json 의 version 과 같다(src/protocol.test.ts 가 본다).
        public const string SdkVersion = "0.8.0";

        private sealed class Request
        {
            public string Line;
            public string Reply;
            public readonly ManualResetEventSlim Done = new ManualResetEventSlim();
            // Handle 이 읽은 명령 — sdk-log 가 답이 정해질 때 한 줄을 적는다.
            public Command Command;
            // 0 기다림 · 1 게임이 가져감 · 2 시간 초과로 버림 · 3 답을 미룬 동안(터치 · 키 · 스크린샷) 시간 초과 — 먼저 바꾼 쪽만 이긴다.
            public int State;
        }

        // 디바이스 팜은 본문 JSON 객체를 그대로 한 줄로 넘긴다(Devicefarm ADR-048). 쓰는 칸만 읽고 없는 칸은 기본값이다.
        [Serializable]
        internal sealed class Command
        {
            public string cmd;
            public string target;
            public string to;
            public string text;
            public string prop;
            public string key;
            public long since;
            public float x = float.NaN;
            public float y = float.NaN;
            public string method;
            public string[] args;
            public string value;
            public string type;
            public string name;
            public string mode;
            // 0 은 멈춤이라 「칸 없음」과 갈라 둔다.
            public float scale = -1;
            // 꺼진 오브젝트 · 숨은 요소도 찾는다(읽기 · 쓰기 명령만 — 누르기 · 끌기는 켜진 것만).
            public bool inactive;
            // 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소 — 비면 Camera.main.
            public string camera;
            public string component;
            public string format;
            // 입력(P2-C) — 0 이 뜻 있는 칸은 「칸 없음」과 갈라 둔다.
            public int finger = -1;
            public float duration = -1;
            public int count = 1;
            public float interval = 0.1f;
            public float power = 1;
            public string[] via;
            public string[] points;
            public float dx;
            public float dy;
            public float z = float.NaN;
            public string @event;
            // sdk-log(P2-D)
            public bool on;
        }

        private readonly ConcurrentQueue<Request> _requests = new ConcurrentQueue<Request>();
        private TcpListener _listener;
        private Thread _acceptThread;
        // 답을 미룬 명령 — 누르기 · 끌기 · 키는 가짜 입력이 다 나가고 게임이 처리한 뒤에, 스크린샷은 프레임 끝에서 찍은 뒤에 답한다.
        // _ready 는 준비 전이면 null, 준비되면 답을 준다. 그동안 다음 명령은 꺼내지 않는다(받은 차례대로).
        private Request _waiting;
        private static Func<string> _ready;
        private static Action _cancel;
        private static ControlServer _self;
        // Handle 이 마지막으로 읽은 명령 — Update 가 그 요청에 붙인다(메인 스레드만).
        private static Command _parsed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad), Preserve]
        private static void Boot()
        {
            var go = new GameObject("[ControlCli]");
            DontDestroyOnLoad(go);
            Tree.KeptScene = go.scene;
            // PC 는 터미널이 창 초점을 가져가면 게임이 멈추고(Update 가 안 돌아 명령이 10초에 실패) 입력을 버린다. 폰에서는 둘 다 영향이 없다.
            Application.runInBackground = true;
#if CONTROL_CLI_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
            UnityEngine.InputSystem.InputSystem.settings.backgroundBehavior = UnityEngine.InputSystem.InputSettings.BackgroundBehavior.IgnoreFocus;
#endif
            go.AddComponent<FakeTouches>();
            GameState.Watch();
            _self = go.AddComponent<ControlServer>();
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

        // 앱이 뒤로 가고(true) 돌아올 때(false) — events 의 game.paused · game.resumed.
        private void OnApplicationPause(bool paused) => GameEvents.Pause(paused);

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
                        // 게임이 가져간 명령이 답을 미룬 채 멈추면(백그라운드) Done 이 안 온다 — 버림으로 바꾸면 Update 가 남은 가짜 입력을 거둔다.
                        if (!timedOut && !request.Done.IsSet) timedOut = Interlocked.CompareExchange(ref request.State, 3, 1) == 1;
                        if (!timedOut) request.Done.Wait();
                        writer.WriteLine(timedOut ? Error("게임이 10초 안에 답하지 않았습니다(멈췄거나 일시정지)") : request.Reply);
                    }
                }
                catch (IOException) { } // 상대가 연결을 끊었다
            }
        }

        private void Update()
        {
            // 답을 미룬 명령이 있으면 준비될 때까지 다음 명령을 꺼내지 않는다 — 명령은 받은 차례대로 돈다.
            if (_waiting != null)
            {
                // 시간 초과(3)면 답할 곳이 없다 — 남은 가짜 입력을 거두고 넘어간다.
                var cancelled = Volatile.Read(ref _waiting.State) == 3;
                if (cancelled)
                {
                    _cancel?.Invoke();
                    SdkLog.Write(_waiting.Command, Error("시간 초과"));
                }
                else
                {
                    var reply = _ready();
                    if (reply == null) return;
                    SdkLog.Write(_waiting.Command, reply);
                    _waiting.Reply = reply;
                    _waiting.Done.Set();
                }
                _waiting = null;
                _ready = null;
                _cancel = null;
                // 거둔 Canceled · 뗌은 다음 프레임에 나간다 — 같은 프레임에 다음 명령을 걸면 새 손가락의 Began 과 한 Mouse 상태로 섞여 끌기로 읽힌다.
                if (cancelled) return;
            }
            while (_requests.TryDequeue(out var request))
            {
                if (Interlocked.CompareExchange(ref request.State, 1, 0) != 0) continue;
                string reply;
                _parsed = null;
                try { reply = Handle(request.Line.Trim()); }
                catch (Exception e) { reply = Error(e.GetType().Name + ": " + e.Message); }
                request.Command = _parsed;
                // null 은 Handle 이 _ready 를 걸고 답을 미뤘다는 뜻이다.
                if (reply != null && !FakeInput.Idle)
                {
                    // 람다는 변수를 잡는다 — 아래에서 reply 를 비우므로 답을 따로 둔다.
                    var done = reply;
                    _ready = () => FakeInput.Idle ? done : null;
                    _cancel = FakeInput.Reset;
                    reply = null;
                }
                if (reply == null)
                {
                    _waiting = request;
                    return;
                }
                SdkLog.Write(request.Command, reply);
                request.Reply = reply;
                request.Done.Set();
            }
        }

        private static string Handle(string line)
        {
            if (!line.StartsWith("{")) return Error("명령은 JSON 한 줄이어야 합니다 — {\"cmd\":\"ping\"}");
            var c = JsonUtility.FromJson<Command>(line);
            _parsed = c;
            if (Limits(c) is string limit) return limit;
            switch (c.cmd)
            {
                case "ping":
                    return "{\"ok\":true,\"app\":" + Json.Str(Application.identifier) + ",\"version\":" + Json.Str(Application.version)
                        + ",\"engine\":\"unity\",\"engineVersion\":" + Json.Str(Application.unityVersion) + ",\"sdkVersion\":\"" + SdkVersion
                        + "\",\"protocol\":2,\"caps\":[\"" + string.Join("\",\"", Caps) + "\"]}";
                case "tree":
                    return "{\"ok\":true,\"scene\":" + Json.Str(SceneManager.GetActiveScene().name) + ",\"screen\":[" + Screen.width + "," + Screen.height + "],\"tree\":" + Tree.Dump() + "}";
                case "find":
                    return FindReply(c.target, c.inactive, c.camera);
                case "find-all":
                    return FindAllReply(c.target, c.inactive, c.camera);
                case "find-at":
                {
                    if (float.IsNaN(c.x) || float.IsNaN(c.y)) return Error(c.cmd + " 에 x · y 가 필요합니다");
                    if (!CameraOf(c.camera, out var cam, out var problem)) return Error(problem);
                    var hit = Select.At(new Vector2(c.x, c.y), cam);
                    var trail = hit.Exists ? Tree.TrailOf(hit, false) : null;
                    return trail == null ? "{\"ok\":true,\"found\":false}" : "{\"ok\":true,\"found\":true," + Found(trail, false, cam) + "}";
                }
                case "components":
                {
                    var go = GameObjectOf(c.target, c.inactive, out var problem);
                    return go == null ? Error(problem) : Props.Components(go);
                }
                case "members":
                {
                    var go = GameObjectOf(c.target, c.inactive, out var problem);
                    return go == null ? Error(problem) : Props.Members(go, c.component);
                }
                case "text-set":
                    return SetText(c.target, c.text ?? "", c.inactive);
                case "tap":
                {
                    if (float.IsNaN(c.x) || float.IsNaN(c.y)) return Error(c.cmd + " 에 x · y 가 필요합니다");
                    var point = new Vector2(c.x, c.y);
                    return WithFinger(f => FakeInput.Tap(f, point, c.count, c.interval), Touched(point));
                }
                case "key":
                {
                    // 키 이름은 KeyCode 이름(대소문자 무시) — Escape 는 폰 뒤로 키와 같다(Unity 가 뒤로 키를 Escape 로 준다).
                    if (!Keys(c.key, out var keys, out var problem)) return Error(problem);
                    FakeInput.Run(FakeInput.Keys(keys, c.power, Mathf.Max(c.duration, 0)));
                    return "{\"ok\":true,\"key\":" + Json.Str(string.Join("+", keys)) + "}";
                }
                case "screenshot":
                    if (!string.IsNullOrEmpty(c.format) && c.format != "jpg" && c.format != "png") return Error("format 은 jpg · png 중 하나입니다");
                    _shot = null;
                    _self.StartCoroutine(Capture(c.format == "png"));
                    _ready = () => _shot;
                    return null;
                case "click":
                {
                    if (!CameraOf(c.camera, out var cam, out var problem)) return Error(problem);
                    if (!Point(c.target, cam, out var at, out problem)) return Error(problem);
                    return WithFinger(f => FakeInput.Tap(f, at, c.count, c.interval), Touched(at));
                }
                case "drag":
                {
                    if (!CameraOf(c.camera, out var cam, out var problem)) return Error(problem);
                    var stops = new List<string> { c.target };
                    if (c.via != null) stops.AddRange(c.via);
                    stops.Add(c.to);
                    var points = new Vector2[stops.Count];
                    for (var i = 0; i < stops.Count; i++)
                        if (!Point(stops[i], cam, out points[i], out problem)) return Error(problem);
                    return WithFinger(f => FakeInput.Path(f, points, Mathf.Max(c.duration, 0)), Touched(points[points.Length - 1]));
                }
                case "touch-down":
                {
                    if (!At(c, out var p, out var problem)) return Error(problem);
                    var f = FakeTouches.Free();
                    if (f < 0) return Error(AllDown);
                    FakeTouches.Press(f, p, 1);
                    FakeInput.Run(FakeInput.Settle());
                    return "{\"ok\":true,\"finger\":" + f + ",\"x\":" + Mathf.RoundToInt(p.x) + ",\"y\":" + Mathf.RoundToInt(p.y) + "}";
                }
                case "touch-move":
                {
                    if (!FakeTouches.IsDown(c.finger)) return Error(NotDown(c.finger));
                    if (!At(c, out var p, out var problem)) return Error(problem);
                    FakeTouches.Move(c.finger, p);
                    FakeInput.Run(FakeInput.Settle());
                    return Touched(p);
                }
                case "touch-up":
                    if (!FakeTouches.IsDown(c.finger)) return Error(NotDown(c.finger));
                    FakeTouches.Release(c.finger);
                    FakeInput.Run(FakeInput.Settle());
                    return "{\"ok\":true}";
                case "swipe":
                {
                    var points = new List<Vector2>();
                    foreach (var s in c.points ?? new string[0])
                    {
                        var xy = s.Split(',');
                        if (xy.Length != 2 || !float.TryParse(xy[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var px) || !float.TryParse(xy[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var py)
                            || float.IsNaN(px) || float.IsInfinity(px) || float.IsNaN(py) || float.IsInfinity(py)) return Error(PointsForm);
                        points.Add(new Vector2(px, py));
                    }
                    if (points.Count < 2) return Error(PointsForm);
                    return WithFinger(f => FakeInput.Path(f, points.ToArray(), Mathf.Max(c.duration, 0)), Touched(points[points.Count - 1]));
                }
                case "long-press":
                {
                    if (!At(c, out var p, out var problem)) return Error(problem);
                    var seconds = c.duration < 0 ? 1 : c.duration;
                    return WithFinger(f => FakeInput.Hold(f, p, seconds), Touched(p));
                }
                case "mouse-move":
                {
                    if (!At(c, out var p, out var problem)) return Error(problem);
                    FakeInput.Run(FakeInput.MouseTo(p, Mathf.Max(c.duration, 0)));
                    return Touched(p);
                }
                case "scroll":
                {
                    Vector2? at = null;
                    if (!string.IsNullOrEmpty(c.target) || !float.IsNaN(c.x) || !float.IsNaN(c.y))
                    {
                        if (!At(c, out var p, out var problem)) return Error(problem);
                        at = p;
                    }
                    FakeInput.Run(FakeInput.Scroll(at, new Vector2(c.dx, c.dy), Mathf.Max(c.duration, 0)));
                    return "{\"ok\":true}";
                }
                case "key-down":
                case "key-up":
                {
                    if (!Keys(c.key, out var keys, out var problem)) return Error(problem);
                    foreach (var k in keys)
                        if (c.cmd == "key-down") FakeKeys.Press(k, c.power);
                        else FakeKeys.Release(k);
                    FakeInput.Run(FakeInput.Settle());
                    return "{\"ok\":true}";
                }
                case "tilt":
                    if (float.IsNaN(c.x) || float.IsNaN(c.y) || float.IsNaN(c.z)) return Error("tilt 에 x · y · z 가 필요합니다");
                    FakeInput.Run(FakeInput.TiltFor(new Vector3(c.x, c.y, c.z), Mathf.Max(c.duration, 0)));
                    return "{\"ok\":true}";
                case "pointer":
                    return PointerReply(c);
                case "input-reset":
                    FakeInput.Reset();
                    FakeInput.Run(FakeInput.Settle());
                    return "{\"ok\":true}";
                case "type":
                    return TypeText(c.target, c.text ?? "");
                case "get":
                {
                    var item = Tree.Find(c.target, c.inactive, out var problem, out _, out _);
                    if (!item.Exists) return Error(problem);
#if CONTROL_CLI_UITK
                    // UI Toolkit 요소는 컴포넌트가 없다 — 요소 칸(value · text · layout.height)을 바로 읽는다.
                    if (item.Ve != null) return Props.GetOn(item.Ve, c.prop);
#endif
                    return Props.Get(item.Go, c.prop);
                }
                case "set":
                {
                    var go = GameObjectOf(c.target, c.inactive, out var problem);
                    return go == null ? Error(problem) : Props.Set(go, c.prop, c.value);
                }
                case "call":
                {
                    var go = GameObjectOf(c.target, c.inactive, out var problem);
                    return go == null ? Error(problem) : Props.Call(go, c.method, c.args);
                }
                case "static-call":
                    return Props.CallStatic(c.method, c.args);
                case "static-get":
                    return Props.GetStatic(c.prop);
                case "static-set":
                    return Props.SetStatic(c.prop, c.value);
                case "pref-get":
                    return GameState.PrefGet(c.key, c.type);
                case "pref-set":
                    return GameState.PrefSet(c.key, c.value, c.type);
                case "pref-delete":
                    return GameState.PrefDelete(c.key);
                case "pref-clear":
                    return GameState.PrefClear();
                case "timescale-get":
                    return GameState.TimeScale();
                case "timescale-set":
                    return GameState.SetTimeScale(c.scale);
                case "scenes":
                    return GameState.Scenes();
                case "scene-load":
                    return GameState.Load(c.name, c.mode);
                case "scene-unload":
                    return GameState.Unload(c.name);
                case "errors":
                case "logs":
                case "events":
                    if (c.since < 0) return Error("since 는 0 이상이어야 합니다");
                    return (c.cmd == "errors" ? GameErrors.Errors : c.cmd == "logs" ? GameErrors.Logs : GameEvents.Items).Since(c.since);
                case "sdk-log":
                    SdkLog.On = c.on;
                    return "{\"ok\":true,\"on\":" + (c.on ? "true" : "false") + "}";
                case "layout":
                    return Layout.Check(c.target ?? "");
                default:
                    return Error("모르는 명령입니다: " + c.cmd + " (" + string.Join(" · ", Caps) + ")");
            }
        }

        // 기다리기는 바깥에서 find 를 되풀이한다 — 없음은 실패가 아니라 found:false 다. 여럿이 맞거나 꼴이 틀린 것만 실패다.
        private static string FindReply(string target, bool all, string camera)
        {
            if (!CameraOf(camera, out var cam, out var problem)) return Error(problem);
            var item = Tree.Find(target, all, out problem, out var missing, out var trail);
            if (!item.Exists) return missing ? "{\"ok\":true,\"found\":false}" : Error(problem);
            return "{\"ok\":true,\"found\":true," + Found(trail, all, cam) + "}";
        }

        private static string FindAllReply(string target, bool all, string camera)
        {
            if (!CameraOf(camera, out var cam, out var problem)) return Error(problem);
            var trails = Select.All(target, all, out problem);
            if (trails == null) return Error(problem);
            var sb = new StringBuilder("{\"ok\":true,\"found\":[");
            for (var i = 0; i < trails.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('{').Append(Found(trails[i], all, cam)).Append('}');
            }
            return sb.Append("]}").ToString();
        }

        // find · find-all · find-at 답 한 칸(중괄호 안) — 경로 · 글자 · 누를 수 있나 · id · 누를 자리 · 화면 사각형(켜진 것만) · 화면 크기 · 꺼짐.
        private static string Found(List<Item> trail, bool all, Camera cam)
        {
            var item = trail[trail.Count - 1];
            var sb = new StringBuilder("\"path\":").Append(Json.Str(Select.PathOf(trail, all)));
            var text = Tree.TextOf(item);
            if (text != null) sb.Append(",\"text\":").Append(Json.Str(text));
            if (Tree.KindOf(item) != null) sb.Append(",\"interactable\":").Append(Tree.Interactable(item) ? "true" : "false");
            var ids = Select.Attr(item, "id");
            if (ids.Count > 0) sb.Append(",\"id\":").Append(Json.Str(ids[0]));
            if (Tree.Active(trail))
            {
                var p = Tree.ScreenPoint(item, cam);
                if (p != null) sb.Append(",\"x\":").Append(Mathf.RoundToInt(p.Value.x)).Append(",\"y\":").Append(Mathf.RoundToInt(p.Value.y));
                var r = Tree.ScreenBox(item, cam);
                if (r != null)
                {
                    int x0 = Mathf.RoundToInt(r.Value.xMin), y0 = Mathf.RoundToInt(r.Value.yMin);
                    sb.Append(",\"rect\":[").Append(x0).Append(',').Append(y0).Append(',')
                        .Append(Mathf.RoundToInt(r.Value.xMax) - x0).Append(',').Append(Mathf.RoundToInt(r.Value.yMax) - y0).Append(']');
                }
            }
            else sb.Append(",\"active\":false");
            sb.Append(",\"screen\":[").Append(Screen.width).Append(',').Append(Screen.height).Append(']');
            return sb.ToString();
        }

        // camera 칸 — 비면 null(Camera.main). 꺼진 Camera 컴포넌트도 화면 자리를 셈할 수 있다.
        private static bool CameraOf(string address, out Camera cam, out string problem)
        {
            cam = null;
            problem = null;
            if (string.IsNullOrEmpty(address)) return true;
            var item = Tree.Find(address, out problem);
            if (!item.Exists) return false;
            cam = item.Go != null ? item.Go.GetComponent<Camera>() : null;
            if (cam == null) problem = address + " 에 Camera 가 없습니다";
            return cam != null;
        }

        // 컴포넌트를 가진 게임 오브젝트 — UI Toolkit 요소는 게임 오브젝트가 아니다.
        private static GameObject GameObjectOf(string target, bool all, out string problem)
        {
            var item = Tree.Find(target, all, out problem, out _, out _);
            if (!item.Exists) return null;
            if (item.Go == null) problem = target + " 은 UI Toolkit 요소라 컴포넌트가 없습니다 — get 은 요소 칸(value · text)을 바로 읽습니다";
            return item.Go;
        }

        // 글자 컴포넌트에 글자를 바로 넣는다 — 입력칸은 type(글자 수 · 거르기를 키로 칠 때의 차례로)이 맡는다.
        private static string SetText(string target, string text, bool all)
        {
            var item = Tree.Find(target, all, out var problem, out _, out _);
            if (!item.Exists) return Error(problem);
            const string none = " 에 글자 컴포넌트(Text · TMP_Text · UI Toolkit Label/Button)가 없습니다";
#if CONTROL_CLI_UITK
            if (item.Ve != null)
            {
                if (item.Ve is UnityEngine.UIElements.TextField) return Error(target + " 은 입력칸이라 type 으로 넣습니다");
                if (!(item.Ve is UnityEngine.UIElements.TextElement label)) return Error(target + none);
                label.text = text;
                return "{\"ok\":true,\"text\":" + Json.Str(Tree.TextOf(item)) + "}";
            }
#endif
            var go = item.Go;
            var input = go.GetComponent<InputField>() != null;
#if CONTROL_CLI_TMP
            input = input || go.GetComponent<TMPro.TMP_InputField>() != null;
#endif
            if (input) return Error(target + " 은 입력칸이라 type 으로 넣습니다");
            var ugui = go.GetComponent<Text>();
            if (ugui != null)
            {
                ugui.text = text;
                return "{\"ok\":true,\"text\":" + Json.Str(Tree.TextOf(item)) + "}";
            }
#if CONTROL_CLI_TMP
            var tmp = go.GetComponent<TMPro.TMP_Text>();
            if (tmp != null)
            {
                tmp.text = text;
                return "{\"ok\":true,\"text\":" + Json.Str(Tree.TextOf(item)) + "}";
            }
#endif
            return Error(target + none);
        }

        // 누르기 · 끌기는 켜진 것만 — 꺼진 것을 누르면 그 자리의 다른 것이 눌린다.
        private static bool Point(string target, Camera cam, out Vector2 point, out string problem)
        {
            point = default;
            var item = Tree.Find(target, out problem);
            if (!item.Exists) return false;
            var p = Tree.ScreenPoint(item, cam);
            if (p == null)
            {
                problem = target + " 은 화면에 비친 자리가 없습니다(UI 도 아니고 주 카메라 앞도 아님)";
                return false;
            }
            point = p.Value;
            return true;
        }

        // 화면 키보드를 띄우지 않고 글자를 바로 넣는다. 글자 수 제한 · 글자 종류 거르기는 입력칸 규칙 그대로다.
        private static string TypeText(string target, string text)
        {
            var item = Tree.Find(target, out var problem);
            if (!item.Exists) return Error(problem);
#if CONTROL_CLI_UITK
            if (item.Ve != null)
            {
                if (!(item.Ve is UnityEngine.UIElements.TextField box)) return Error(target + " 은 입력칸(InputField · TMP_InputField · TextField)이 아닙니다");
                if (!box.enabledInHierarchy || box.isReadOnly) return Error(target + " 은 잠겨 있어 글자를 넣을 수 없습니다");
                // TextField.value 는 넣을 때 글자 수를 자르지 않는다 — 키로 칠 때처럼 maxLength 로 자른다.
                box.value = box.maxLength >= 0 && text.Length > box.maxLength ? text.Substring(0, box.maxLength) : text;
                return "{\"ok\":true,\"text\":" + Json.Str(Tree.TextOf(item)) + "}";
            }
#endif
            var go = item.Go;
            var field = go.GetComponent<InputField>();
            if (field != null)
            {
                if (!field.IsInteractable()) return Error(target + " 은 잠겨 있어 글자를 넣을 수 없습니다");
                field.text = UguiFiltered(field, text);
                field.onEndEdit.Invoke(field.text);
                return "{\"ok\":true,\"text\":" + Json.Str(Tree.TextOf(item)) + "}";
            }
#if CONTROL_CLI_TMP
            var tmp = go.GetComponent<TMPro.TMP_InputField>();
            if (tmp != null)
            {
                if (!tmp.IsInteractable()) return Error(target + " 은 잠겨 있어 글자를 넣을 수 없습니다");
                tmp.text = TmpFiltered(tmp, text);
                tmp.onEndEdit.Invoke(tmp.text);
                return "{\"ok\":true,\"text\":" + Json.Str(Tree.TextOf(item)) + "}";
            }
#endif
            return Error(target + " 은 입력칸(InputField · TMP_InputField · TextField)이 아닙니다");
        }

        private static readonly System.Reflection.MethodInfo UguiValidate = typeof(InputField).GetMethod(
            "Validate", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic, null, new[] { typeof(string), typeof(int), typeof(char) }, null);

        // uGUI text setter 는 넣을 글자를 먼저 글자 수로 자르고 거른다(qa_user01! → qa_user0 → qauser0) — 키로 칠 때처럼 글자마다 거르고 거른 결과로 자른다(qauser01).
        private static string UguiFiltered(InputField field, string text)
        {
            var result = "";
            foreach (var c in text)
            {
                if (field.characterLimit > 0 && result.Length >= field.characterLimit) break;
                var ch = field.onValidateInput != null ? field.onValidateInput(result, result.Length, c)
                    : field.characterValidation != InputField.CharacterValidation.None && UguiValidate != null ? (char)UguiValidate.Invoke(field, new object[] { result, result.Length, c })
                    : c;
                if (ch != 0) result += ch;
            }
            return result;
        }

#if CONTROL_CLI_TMP
        private static readonly System.Reflection.MethodInfo TmpValidate = typeof(TMPro.TMP_InputField).GetMethod(
            "Validate", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic, null, new[] { typeof(string), typeof(int), typeof(char) }, null);

        // TMP 는 text 를 넣을 때 글자 수 제한 · 거르기를 하지 않는다(3.0.9 SetText 에서 주석 처리) — 키로 칠 때(Append)와 같은 차례로 거르개를 글자마다 부른다.
        private static string TmpFiltered(TMPro.TMP_InputField field, string text)
        {
            var result = "";
            foreach (var c in text)
            {
                if (field.characterLimit > 0 && result.Length >= field.characterLimit) break;
                if (field.onValidateInput != null)
                {
                    var ch = field.onValidateInput(result, result.Length, c);
                    if (ch != 0) result += ch;
                }
                else if (field.characterValidation == TMPro.TMP_InputField.CharacterValidation.CustomValidator && field.inputValidator != null)
                {
                    // 사용자 거르개는 글자를 스스로 끼워 넣는다.
                    var pos = result.Length;
                    field.inputValidator.Validate(ref result, ref pos, c);
                }
                else if (field.characterValidation != TMPro.TMP_InputField.CharacterValidation.None && TmpValidate != null)
                {
                    var ch = (char)TmpValidate.Invoke(field, new object[] { result, result.Length, c });
                    if (ch != 0) result += ch;
                }
                else result += c;
            }
            return result;
        }
#endif

        private static string _shot;

        // 다 그린 화면은 프레임 끝에서만 읽힌다 — Appium 이 없는 PC · iOS · 이미 켠 USB 게임의 스크린샷. 기본 JPEG 는 PNG 보다 몇 배 작고, png 는 무손실(비교용).
        private static IEnumerator Capture(bool png)
        {
            yield return new WaitForEndOfFrame();
#if CONTROL_CLI_IMAGECONVERSION
            var texture = new Texture2D(Screen.width, Screen.height, TextureFormat.RGB24, false);
            texture.ReadPixels(new Rect(0, 0, Screen.width, Screen.height), 0, 0);
            texture.Apply(false);
            var bytes = png ? texture.EncodeToPNG() : texture.EncodeToJPG(80);
            Destroy(texture);
            _shot = "{\"ok\":true,\"" + (png ? "png" : "jpg") + "\":\"" + Convert.ToBase64String(bytes) + "\"}";
#else
            _shot = Error("이 게임은 ImageConversion 모듈(com.unity.modules.imageconversion)을 빼서 화면을 찍을 수 없습니다");
#endif
        }

        private const string AllDown = "손가락 10개가 다 눌려 있습니다 — touch-up · input-reset 으로 뗍니다";

        // 비어 있는 손가락으로 일을 건다 — 10개가 다 눌려 있으면 실패 글.
        private static string WithFinger(Func<int, IEnumerator> job, string reply)
        {
            var finger = FakeTouches.Free();
            if (finger < 0) return Error(AllDown);
            FakeInput.Run(job(finger));
            return reply;
        }

        private const string PointsForm = "swipe 의 points 는 \"x,y\" 글자 둘 이상입니다 — [\"540,400\", \"540,900\"]";

        // 명령 하나는 8초 안 — SDK 답 한도 10초 · 팜 15초. 더 오래 누르기는 down/up 두 명령으로. 횟수 · 세기 칸도 여기서 본다.
        private static string Limits(Command c)
        {
            if (c.count < 1) return Error("count 는 1 이상입니다");
            if (c.power < -1 || c.power > 1) return Error("power 는 -1~1 입니다");
            // 프레임도 센다 — 누름마다 2프레임 · 끌기 한 마디에 적어도 10프레임을 30fps 로 어림(TS 가짜 SDK 와 같은 셈). 2L 은 count 가 아주 클 때 넘침을 막는다.
            var frames = (c.cmd == "tap" || c.cmd == "click" ? c.count * 2L : 0) + (c.cmd == "drag" ? ((c.via?.Length ?? 0) + 1) * 10 : 0) + (c.cmd == "swipe" ? Math.Max((c.points?.Length ?? 0) - 1, 0) * 10 : 0);
            var seconds = Mathf.Max(c.duration, 0) + (c.count - 1) * Mathf.Max(c.interval, 0) + frames / 30f;
            return seconds > FakeInput.LongestSeconds ? Error(c.cmd + " 은 " + FakeInput.LongestSeconds + "초 안이어야 합니다 — 더 길게는 touch-down · key-down 뒤 touch-up · key-up") : null;
        }

        // 한 점 명령의 자리 — target 이 있으면 그 오브젝트 화면 가운데, 없으면 x · y.
        private static bool At(Command c, out Vector2 point, out string problem)
        {
            point = default;
            if (!CameraOf(c.camera, out var cam, out problem)) return false;
            if (!string.IsNullOrEmpty(c.target)) return Point(c.target, cam, out point, out problem);
            if (float.IsNaN(c.x) || float.IsNaN(c.y))
            {
                problem = c.cmd + " 에 target 또는 x · y 가 필요합니다";
                return false;
            }
            point = new Vector2(c.x, c.y);
            return true;
        }

        // A+LeftShift — KeyCode 이름을 + 로 이어 함께 누른다(대소문자 무시).
        private static bool Keys(string text, out KeyCode[] keys, out string problem)
        {
            var parts = (text ?? "").Split('+');
            keys = new KeyCode[parts.Length];
            problem = null;
            for (var i = 0; i < parts.Length; i++)
            {
                // Enum.TryParse 는 숫자(8 → Backspace) · 쉼표(A,B → 두 값을 OR)도 받는다 — 이름으로 있는 키만.
                var name = parts[i].Trim();
                if (!int.TryParse(name, out _) && name.IndexOf(',') < 0 && Enum.TryParse(name, true, out keys[i]) && keys[i] != KeyCode.None && Enum.IsDefined(typeof(KeyCode), keys[i])) continue;
                problem = "모르는 키입니다: " + parts[i] + " (KeyCode 이름 — Escape · Space · Return · A · Alpha1 · F1 · UpArrow · Mouse0 · JoystickButton0 …, 여럿은 A+LeftShift)";
                return false;
            }
            return true;
        }

        private static string NotDown(int finger) => "손가락 " + finger + " 은 눌려 있지 않습니다 — touch-down 이 준 번호를 씁니다";

        // AltTester PointerDown/Up/Enter/Exit — 그 GameObject 하나의 EventSystem 처리기를 바로 부른다(부모로 안 올린다). position 은 그 오브젝트 화면 가운데.
        private static string PointerReply(Command c)
        {
            var item = Tree.Find(c.target, out var problem);
            if (!item.Exists) return Error(problem);
            if (item.Go == null) return Error(c.target + " 은 UI Toolkit 요소라 pointer 를 못 보냅니다 — mouse-move · touch-down 으로");
            var data = new PointerEventData(EventSystem.current) { position = Tree.ScreenPoint(item) ?? Vector2.zero, pointerEnter = item.Go, pointerPress = item.Go };
            switch (c.@event)
            {
                case "down": ExecuteEvents.Execute(item.Go, data, ExecuteEvents.pointerDownHandler); break;
                case "up": ExecuteEvents.Execute(item.Go, data, ExecuteEvents.pointerUpHandler); break;
                case "enter": ExecuteEvents.Execute(item.Go, data, ExecuteEvents.pointerEnterHandler); break;
                case "exit": ExecuteEvents.Execute(item.Go, data, ExecuteEvents.pointerExitHandler); break;
                default: return Error("event 는 down · up · enter · exit 중 하나입니다");
            }
            return "{\"ok\":true}";
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
