// 폰 안 127.0.0.1 포트로 JSON 명령 한 줄을 받아 게임 메인 스레드에서 처리하고 JSON 한 줄로 답한다
using System;
using System.Collections;
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
        // protocol/commands.json 의 명령 이름과 같은 차례(src/protocol.test.ts 가 본다) — ping 의 caps 로 CLI 에 알린다.
        private static readonly string[] Caps =
        {
            "ping", "tree", "find", "click", "drag", "type", "get", "tap", "key", "screenshot", "errors", "layout",
            "call", "set", "static-call", "static-get", "static-set", "pref-get", "pref-set", "pref-delete", "pref-clear",
            "timescale-get", "timescale-set", "scenes", "scene-load", "scene-unload",
            "find-all", "find-at", "components", "members", "text-set",
        };
        // sdk/unity/package.json 의 version 과 같다(src/protocol.test.ts 가 본다).
        public const string SdkVersion = "0.4.0";

        private sealed class Request
        {
            public string Line;
            public string Reply;
            public readonly ManualResetEventSlim Done = new ManualResetEventSlim();
            // 0 기다림 · 1 게임이 가져감 · 2 시간 초과로 버림 · 3 답을 미룬 동안(터치 · 키 · 스크린샷) 시간 초과 — 먼저 바꾼 쪽만 이긴다.
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
            public string key;
            public long since;
            public float x;
            public float y;
            public string method;
            public string[] args;
            public string value;
            public string type;
            public string name;
            public string mode;
            // 0 은 멈춤이라 「칸 없음」과 갈라 둔다.
            public float scale = -1;
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
                if (Volatile.Read(ref _waiting.State) == 3) _cancel?.Invoke();
                else
                {
                    var reply = _ready();
                    if (reply == null) return;
                    _waiting.Reply = reply;
                    _waiting.Done.Set();
                }
                _waiting = null;
                _ready = null;
                _cancel = null;
            }
            while (_requests.TryDequeue(out var request))
            {
                if (Interlocked.CompareExchange(ref request.State, 1, 0) != 0) continue;
                string reply;
                try { reply = Handle(request.Line.Trim()); }
                catch (Exception e) { reply = Error(e.GetType().Name + ": " + e.Message); }
                // null 은 Handle 이 _ready 를 걸고 답을 미뤘다는 뜻이다.
                if (reply != null && !FakeTouches.Idle)
                {
                    // 람다는 변수를 잡는다 — 아래에서 reply 를 비우므로 답을 따로 둔다.
                    var done = reply;
                    _ready = () => FakeTouches.Idle ? done : null;
                    _cancel = FakeTouches.Cancel;
                    reply = null;
                }
                if (reply == null)
                {
                    _waiting = request;
                    return;
                }
                request.Reply = reply;
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
                    return "{\"ok\":true,\"app\":" + Json.Str(Application.identifier) + ",\"version\":" + Json.Str(Application.version)
                        + ",\"engine\":\"unity\",\"engineVersion\":" + Json.Str(Application.unityVersion) + ",\"sdkVersion\":\"" + SdkVersion
                        + "\",\"protocol\":2,\"caps\":[\"" + string.Join("\",\"", Caps) + "\"]}";
                case "tree":
                    return "{\"ok\":true,\"scene\":" + Json.Str(SceneManager.GetActiveScene().name) + ",\"screen\":[" + Screen.width + "," + Screen.height + "],\"tree\":" + Tree.Dump() + "}";
                case "find":
                    return FindReply(c.target);
                case "tap":
                    var point = new Vector2(c.x, c.y);
                    FakeTouches.Tap(point);
                    return Touched(point);
                case "key":
                    // 키 이름은 KeyCode 이름(대소문자 무시) — Escape 는 폰 뒤로 키와 같다(Unity 가 뒤로 키를 Escape 로 준다).
                    if (string.IsNullOrEmpty(c.key) || !Enum.TryParse<KeyCode>(c.key, true, out var key) || key == KeyCode.None)
                        return Error("모르는 키입니다: " + c.key + " (KeyCode 이름 — Escape · Space · Return · A · Alpha1 · F1 · UpArrow …)");
                    FakeKeys.Press(key);
                    return "{\"ok\":true,\"key\":" + Json.Str(key.ToString()) + "}";
                case "screenshot":
                    _shot = null;
                    _self.StartCoroutine(Capture());
                    _ready = () => _shot;
                    return null;
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
                    var go = GameObjectOf(c.target, out var problem);
                    return go == null ? Error(problem) : Props.Get(go, c.prop);
                }
                case "set":
                {
                    var go = GameObjectOf(c.target, out var problem);
                    return go == null ? Error(problem) : Props.Set(go, c.prop, c.value);
                }
                case "call":
                {
                    var go = GameObjectOf(c.target, out var problem);
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
                    return c.since < 0 ? Error("since 는 0 이상이어야 합니다") : GameErrors.Since(c.since);
                case "layout":
                    return Layout.Check(c.target ?? "");
                default:
                    return Error("모르는 명령입니다: " + c.cmd + " (" + string.Join(" · ", Caps) + ")");
            }
        }

        // 기다리기는 바깥에서 find 를 되풀이한다 — 없음은 실패가 아니라 found:false 다. 이름이 겹치는 것만 실패다.
        private static string FindReply(string target)
        {
            var item = Tree.Find(target, out var problem, out var missing);
            if (!item.Exists) return missing ? "{\"ok\":true,\"found\":false}" : Error(problem);
            var sb = new StringBuilder("{\"ok\":true,\"found\":true,\"path\":").Append(Json.Str(Tree.PathOf(item)));
            var text = Tree.TextOf(item);
            if (text != null) sb.Append(",\"text\":").Append(Json.Str(text));
            if (Tree.KindOf(item) != null) sb.Append(",\"interactable\":").Append(Tree.Interactable(item) ? "true" : "false");
            return sb.Append('}').ToString();
        }

        // 컴포넌트를 가진 게임 오브젝트 — UI Toolkit 요소는 게임 오브젝트가 아니다.
        private static GameObject GameObjectOf(string target, out string problem)
        {
            var item = Tree.Find(target, out problem);
            if (!item.Exists) return null;
            if (item.Go == null) problem = target + " 은 UI Toolkit 요소라 컴포넌트 칸이 없습니다 — text · find 로 읽습니다";
            return item.Go;
        }

        private static bool Point(string target, out Vector2 point, out string problem)
        {
            point = default;
            var item = Tree.Find(target, out problem);
            if (!item.Exists) return false;
            var p = Tree.ScreenPoint(item);
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

        // 다 그린 화면은 프레임 끝에서만 읽힌다 — Appium 이 없는 PC · iOS · 이미 켠 USB 게임의 스크린샷. JPEG 라 PNG 보다 몇 배 작다.
        private static IEnumerator Capture()
        {
            yield return new WaitForEndOfFrame();
#if CONTROL_CLI_IMAGECONVERSION
            var texture = new Texture2D(Screen.width, Screen.height, TextureFormat.RGB24, false);
            texture.ReadPixels(new Rect(0, 0, Screen.width, Screen.height), 0, 0);
            texture.Apply(false);
            var jpg = texture.EncodeToJPG(80);
            Destroy(texture);
            _shot = "{\"ok\":true,\"jpg\":\"" + Convert.ToBase64String(jpg) + "\"}";
#else
            _shot = Error("이 게임은 ImageConversion 모듈(com.unity.modules.imageconversion)을 빼서 화면을 찍을 수 없습니다");
#endif
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
