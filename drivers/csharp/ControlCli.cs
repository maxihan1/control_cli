// control_cli 게임 SDK 를 C# 에서 모는 드라이버 — 명령 메서드는 protocol/commands.json 에서 만든다(npm run drivers)
#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ControlCli;

/// <summary>게임이 ok:false 로 답했거나 닿지 못했다</summary>
public class GameException : Exception
{
    public GameException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>
/// control_cli C# 드라이버 — 의존 없는 파일 하나(System.Text.Json).
/// <code>
/// var game = new Game("tcp://127.0.0.1:13100");                 // PC 게임 · adb forward 뒤 폰
/// var game = new Game("http://127.0.0.1:13101/games/&lt;key&gt;");    // relay — 토큰은 CONTROL_CLI_RELAY_TOKEN
/// game.Click("LoginButton", count: 2);
/// var text = (string?)game.Find("StatusText")["text"];
/// </code>
/// 답은 게임 답 JsonObject 그대로. 게임이 실패로 답하면 <see cref="GameException"/>.
/// </summary>
public class Game
{
    /// <summary>게임은 10초에 스스로 답하고 relay 는 15초에 끊는다 — 그 둘이 먼저 말하게 조금 더 기다린다(TS link.ts 와 같음)</summary>
    public static readonly TimeSpan ReplyTimeout = TimeSpan.FromSeconds(20);
    static readonly HttpClient Http = new() { Timeout = ReplyTimeout };

    readonly string address;
    readonly string? token;

    public Game(string address = "tcp://127.0.0.1:13100", string? token = null)
    {
        this.address = address.TrimEnd('/');
        this.token = token ?? Environment.GetEnvironmentVariable("CONTROL_CLI_RELAY_TOKEN");
        if (!(this.address.StartsWith("tcp://") || this.address.StartsWith("http://") || this.address.StartsWith("https://")))
            throw new ArgumentException($"주소는 tcp://<호스트>:<포트> 또는 http(s)://<relay>/games/<key> 꼴입니다: {address}");
    }

    /// <summary>명령 하나를 보내고 답을 돌려준다 — null 인 칸은 싣지 않는다</summary>
    public JsonObject Send(string cmd, JsonObject args)
    {
        var command = new JsonObject { ["cmd"] = cmd };
        foreach (var (k, v) in args.ToList())
            if (v is not null) command[k] = v.DeepClone();
        var line = command.ToJsonString();
        var reply = address.StartsWith("tcp://") ? Tcp(line) : Relay(line);
        if (reply is not JsonObject r) throw new GameException($"게임 답이 JSON 객체가 아닙니다: {reply?.ToJsonString()}");
        if (r["ok"]?.GetValueKind() != JsonValueKind.True)
            throw new GameException(r["error"]?.GetValueKind() == JsonValueKind.String ? (string)r["error"]! : $"게임이 실패로 답했습니다: {r.ToJsonString()}");
        return r;
    }

    // 명령마다 새로 잇는다 — 한 줄 쓰고 한 줄 읽는다.
    JsonNode? Tcp(string line)
    {
        var hostPort = address["tcp://".Length..];
        var colon = hostPort.LastIndexOf(':');
        var port = int.Parse(hostPort[(colon + 1)..]);
        string? got;
        try
        {
            using var client = new TcpClient { ReceiveTimeout = (int)ReplyTimeout.TotalMilliseconds, SendTimeout = (int)ReplyTimeout.TotalMilliseconds };
            client.Connect(hostPort[..colon], port);
            using var stream = client.GetStream();
            stream.Write(Encoding.UTF8.GetBytes(line + "\n"));
            got = new StreamReader(stream, new UTF8Encoding(false)).ReadLine();
        }
        catch (Exception e) when (e is SocketException or IOException)
        {
            throw new GameException($"게임 포트 {port} 에 붙지 못했습니다 — QA 빌드가 켜져 있나요? ({e.Message})", e);
        }
        if (got is null) throw new GameException($"게임이 답 없이 연결을 닫았습니다 — 게임이 포트 {port} 를 여나요?");
        return JsonNode.Parse(got);
    }

    JsonNode? Relay(string body)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, address + "/command") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        if (!string.IsNullOrEmpty(token)) req.Headers.Authorization = new("Bearer", token);
        HttpResponseMessage res;
        try
        {
            res = Http.Send(req);
        }
        catch (HttpRequestException e)
        {
            throw new GameException($"relay {address} 에 닿지 못했습니다 ({e.Message})", e);
        }
        using (res)
        {
            JsonNode? value = null;
            try { value = JsonNode.Parse(res.Content.ReadAsStream())?["value"]; } catch (JsonException) { }
            if (!res.IsSuccessStatusCode)
                throw new GameException(value?["message"]?.GetValueKind() == JsonValueKind.String ? (string)value["message"]! : $"relay 가 게임 명령을 HTTP {(int)res.StatusCode} 로 거절했습니다");
            return value?.DeepClone();
        }
    }

    // 생성 메서드 · Dispatch 가 쓴다.
    static JsonArray? Arr(IEnumerable<string>? xs) => xs is null ? null : new JsonArray(xs.Select(x => (JsonNode?)x).ToArray());
    static string? S(JsonObject a, string k) => (string?)a[k];
    static double? N(JsonObject a, string k) => (double?)a[k];
    static bool? B(JsonObject a, string k) => (bool?)a[k];
    static IEnumerable<string>? A(JsonObject a, string k) => a[k]?.AsArray().Select(x => (string)x!).ToList();

    // ── 생성: protocol/commands.json (npm run drivers) ──
    /// <summary>게임 답 · 엔진 · SDK 판 · 할 수 있는 명령과 기능(caps)</summary>
    public JsonObject Ping() => Send("ping", new());

    /// <summary>켜진 오브젝트 트리 · 장면 이름 · 화면 크기</summary>
    public JsonObject Tree() => Send("tree", new());

    /// <summary>주소의 오브젝트 — 없으면 found:false, 여럿이 맞으면 실패. 답의 x · y 는 누를 자리, rect [x, y, w, h] 는 화면 사각형, screen 은 화면 크기(모두 픽셀 · 왼쪽 아래 0,0)</summary>
    /// <param name="target">주소 — 이름(하나뿐일 때) · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자</param>
    /// <param name="inactive">꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    public JsonObject Find(string target, bool? inactive = null, string? camera = null) => Send("find", new() { ["target"] = target, ["inactive"] = inactive, ["camera"] = camera });

    /// <summary>가운데를 가짜 터치로 누른다 — 게임이 처리한 뒤 답한다</summary>
    /// <param name="target">주소 — 이름(하나뿐일 때) · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    /// <param name="count">누르는 횟수(기본 1) — 2 면 두 번 누르기</param>
    /// <param name="interval">누르기 사이 초(기본 0.1)</param>
    public JsonObject Click(string target, string? camera = null, double? count = null, double? interval = null) => Send("click", new() { ["target"] = target, ["camera"] = camera, ["count"] = count, ["interval"] = interval });

    /// <summary>앞 자리에서 via 를 차례로 지나 뒤 자리로 끈다 — 마디마다 적어도 10프레임</summary>
    /// <param name="target">끌 오브젝트 주소</param>
    /// <param name="to">놓을 자리 주소</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    /// <param name="via">사이에 지날 자리 주소들</param>
    /// <param name="duration">처음부터 끝까지 걸리는 초(0~8, 기본 0 — 마디마다 10프레임)</param>
    public JsonObject Drag(string target, string to, string? camera = null, IEnumerable<string>? via = null, double? duration = null) => Send("drag", new() { ["target"] = target, ["to"] = to, ["camera"] = camera, ["via"] = Arr(via), ["duration"] = duration });

    /// <summary>입력칸에 글자를 넣는다 — 그 칸의 글자 수 · 거르기를 키로 칠 때의 차례로</summary>
    /// <param name="target">입력칸 주소</param>
    /// <param name="text">넣을 글자</param>
    public JsonObject Type(string target, string text) => Send("type", new() { ["target"] = target, ["text"] = text });

    /// <summary>컴포넌트 칸 값을 읽는다 — UI Toolkit 요소는 요소 칸(value · text · layout.height)을 바로</summary>
    /// <param name="target">오브젝트 주소</param>
    /// <param name="prop">컴포넌트.칸[.칸…] — Transform.position, UI Toolkit 요소는 칸[.칸…]</param>
    /// <param name="inactive">꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다</param>
    public JsonObject Get(string target, string prop, bool? inactive = null) => Send("get", new() { ["target"] = target, ["prop"] = prop, ["inactive"] = inactive });

    /// <summary>좌표를 누른다(왼쪽 아래가 0,0) — 살펴볼 때만</summary>
    /// <param name="x">가로 픽셀</param>
    /// <param name="y">세로 픽셀</param>
    /// <param name="count">누르는 횟수(기본 1)</param>
    /// <param name="interval">누르기 사이 초(기본 0.1)</param>
    public JsonObject Tap(double x, double y, double? count = null, double? interval = null) => Send("tap", new() { ["x"] = x, ["y"] = y, ["count"] = count, ["interval"] = interval });

    /// <summary>키 누르기 — duration 동안(기본 한 프레임) 누르고 뗀다. A+LeftShift 처럼 + 로 여럿을 함께</summary>
    /// <param name="key">KeyCode 이름 — Escape · Space · Return · I · Alpha1 · Mouse0 · JoystickButton0, 여럿은 A+LeftShift</param>
    /// <param name="duration">누르고 있는 초(0~8, 기본 0 — 한 프레임)</param>
    /// <param name="power">세기 -1~1(기본 1) — GetAxis 값 · JoystickButton16~19 는 스틱 값</param>
    public JsonObject Key(string key, double? duration = null, double? power = null) => Send("key", new() { ["key"] = key, ["duration"] = duration, ["power"] = power });

    /// <summary>게임이 프레임 끝에서 찍은 화면(JPEG · PNG base64)</summary>
    /// <param name="format">jpg(기본 · 작다) 또는 png(무손실) — jpg · png</param>
    public JsonObject Screenshot(string? format = null) => Send("screenshot", new() { ["format"] = format });

    /// <summary>게임 예외 · 에러 로그(최근 200개)</summary>
    /// <param name="since">받아 둔 last — 그 번호 뒤만</param>
    public JsonObject Errors(double? since = null) => Send("errors", new() { ["since"] = since });

    /// <summary>누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치는지</summary>
    /// <param name="target">이 오브젝트 아래만 본다</param>
    public JsonObject Layout(string? target = null) => Send("layout", new() { ["target"] = target });

    /// <summary>컴포넌트 메서드를 부르고 돌려준 값을 준다 — 인자 수가 맞고 글자를 다 바꿀 수 있는 첫 꼴</summary>
    /// <param name="target">오브젝트 주소</param>
    /// <param name="method">컴포넌트.메서드 — PlayerController.Jump</param>
    /// <param name="args">인자 — 글자로 보내면 SDK 가 메서드 칸 타입으로 바꾼다('2' · 'true' · '[0,1,0]' · 열거 이름)</param>
    /// <param name="inactive">꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다</param>
    public JsonObject Call(string target, string method, IEnumerable<string>? args = null, bool? inactive = null) => Send("call", new() { ["target"] = target, ["method"] = method, ["args"] = Arr(args), ["inactive"] = inactive });

    /// <summary>컴포넌트 칸 값을 쓰고 다시 읽은 값을 준다</summary>
    /// <param name="target">오브젝트 주소</param>
    /// <param name="prop">컴포넌트.칸[.칸…] — Transform.position.y</param>
    /// <param name="value">get 이 주는 꼴의 글자 — '2.5' · 'true' · '[0,1,0]' · 열거 이름</param>
    /// <param name="inactive">꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다</param>
    public JsonObject Set(string target, string prop, string value, bool? inactive = null) => Send("set", new() { ["target"] = target, ["prop"] = prop, ["value"] = value, ["inactive"] = inactive });

    /// <summary>static 메서드를 부르고 돌려준 값을 준다</summary>
    /// <param name="method">타입.메서드 — 전체 이름(Game.Cheats.AddGold) 또는 하나뿐인 짧은 이름</param>
    /// <param name="args">인자 — call 과 같다</param>
    public JsonObject StaticCall(string method, IEnumerable<string>? args = null) => Send("static-call", new() { ["method"] = method, ["args"] = Arr(args) });

    /// <summary>static 칸 값을 읽는다</summary>
    /// <param name="prop">타입.칸[.칸…] — UnityEngine.Time.timeScale</param>
    public JsonObject StaticGet(string prop) => Send("static-get", new() { ["prop"] = prop });

    /// <summary>static 칸 값을 쓰고 다시 읽은 값을 준다</summary>
    /// <param name="prop">타입.칸[.칸…]</param>
    /// <param name="value">set 과 같은 꼴의 글자</param>
    public JsonObject StaticSet(string prop, string value) => Send("static-set", new() { ["prop"] = prop, ["value"] = value });

    /// <summary>저장 값(PlayerPrefs) 하나 — 없으면 found:false</summary>
    /// <param name="key">키</param>
    /// <param name="type">넣을 때의 타입(기본 string) — string · int · float</param>
    public JsonObject PrefGet(string key, string? type = null) => Send("pref-get", new() { ["key"] = key, ["type"] = type });

    /// <summary>저장 값을 넣고 바로 디스크에 쓴다</summary>
    /// <param name="key">키</param>
    /// <param name="value">값 — int · float 도 글자로('3' · '0.5')</param>
    /// <param name="type">타입(기본 string) — string · int · float</param>
    public JsonObject PrefSet(string key, string value, string? type = null) => Send("pref-set", new() { ["key"] = key, ["value"] = value, ["type"] = type });

    /// <summary>저장 값 키 하나를 지운다</summary>
    /// <param name="key">키</param>
    public JsonObject PrefDelete(string key) => Send("pref-delete", new() { ["key"] = key });

    /// <summary>저장 값을 다 지운다</summary>
    public JsonObject PrefClear() => Send("pref-clear", new());

    /// <summary>시간 배율(1 이 보통 · 0 은 멈춤)</summary>
    public JsonObject TimescaleGet() => Send("timescale-get", new());

    /// <summary>시간 배율을 바꾼다</summary>
    /// <param name="scale">0~100 — 0 은 멈춤, 2 는 두 배 빠르게</param>
    public JsonObject TimescaleSet(double scale) => Send("timescale-set", new() { ["scale"] = scale });

    /// <summary>지금 장면 · 열린 장면 목록 · 장면이 열리고 닫힌 수</summary>
    public JsonObject Scenes() => Send("scenes", new());

    /// <summary>빌드에 넣은 장면을 열기 시작한다 — 다 열렸는지는 scenes 로 본다</summary>
    /// <param name="name">장면 이름 또는 경로(Assets/Scenes/Shop.unity)</param>
    /// <param name="mode">single 은 지금 장면을 닫고(기본), add 는 위에 더한다 — single · add</param>
    public JsonObject SceneLoad(string name, string? mode = null) => Send("scene-load", new() { ["name"] = name, ["mode"] = mode });

    /// <summary>열린 장면 하나를 닫기 시작한다 — 마지막 장면은 못 닫는다</summary>
    /// <param name="name">장면 이름</param>
    public JsonObject SceneUnload(string name) => Send("scene-unload", new() { ["name"] = name });

    /// <summary>주소에 맞는 것 전부 — find 와 같은 꼴의 목록, 없으면 빈 목록</summary>
    /// <param name="target">주소 — 이름 · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자</param>
    /// <param name="inactive">꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    public JsonObject FindAll(string target, bool? inactive = null, string? camera = null) => Send("find-all", new() { ["target"] = target, ["inactive"] = inactive, ["camera"] = camera });

    /// <summary>화면 좌표(왼쪽 아래 0,0)의 맨 위 — UI Toolkit · uGUI · 물리 차례, 없으면 found:false</summary>
    /// <param name="x">가로 픽셀</param>
    /// <param name="y">세로 픽셀</param>
    /// <param name="camera">물리 raycast 를 쏠 카메라 오브젝트 주소(기본 Camera.main)</param>
    public JsonObject FindAt(double x, double y, string? camera = null) => Send("find-at", new() { ["x"] = x, ["y"] = y, ["camera"] = camera });

    /// <summary>붙은 컴포넌트 이름 · 전체 타입 이름</summary>
    /// <param name="target">오브젝트 주소</param>
    /// <param name="inactive">꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다</param>
    public JsonObject Components(string target, bool? inactive = null) => Send("components", new() { ["target"] = target, ["inactive"] = inactive });

    /// <summary>컴포넌트의 필드 · 속성(타입 · 값) · 메서드(인자 타입) — Unity 부모 칸은 뺀다</summary>
    /// <param name="target">오브젝트 주소</param>
    /// <param name="component">컴포넌트 타입 이름 또는 전체 이름 — TouchProbe</param>
    /// <param name="inactive">꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다</param>
    public JsonObject Members(string target, string component, bool? inactive = null) => Send("members", new() { ["target"] = target, ["component"] = component, ["inactive"] = inactive });

    /// <summary>글자 컴포넌트(Text · TMP · UI Toolkit Label/Button)의 글자를 바꾸고 다시 읽은 글자를 준다 — 입력칸은 type</summary>
    /// <param name="target">글자 오브젝트 주소</param>
    /// <param name="text">넣을 글자</param>
    /// <param name="inactive">꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다</param>
    public JsonObject TextSet(string target, string text, bool? inactive = null) => Send("text-set", new() { ["target"] = target, ["text"] = text, ["inactive"] = inactive });

    /// <summary>손가락 하나를 눌러 둔다 — 답의 finger(10~19)로 touch-move · touch-up</summary>
    /// <param name="target">누를 오브젝트 주소 — 없으면 x · y</param>
    /// <param name="x">가로 픽셀(왼쪽 0) — target 이 없을 때</param>
    /// <param name="y">세로 픽셀(아래 0) — target 이 없을 때</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    public JsonObject TouchDown(string? target = null, double? x = null, double? y = null, string? camera = null) => Send("touch-down", new() { ["target"] = target, ["x"] = x, ["y"] = y, ["camera"] = camera });

    /// <summary>눌러 둔 손가락을 옮긴다(한 프레임에)</summary>
    /// <param name="finger">touch-down 이 준 번호</param>
    /// <param name="target">옮길 자리 오브젝트 주소 — 없으면 x · y</param>
    /// <param name="x">가로 픽셀 — target 이 없을 때</param>
    /// <param name="y">세로 픽셀 — target 이 없을 때</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    public JsonObject TouchMove(double finger, string? target = null, double? x = null, double? y = null, string? camera = null) => Send("touch-move", new() { ["finger"] = finger, ["target"] = target, ["x"] = x, ["y"] = y, ["camera"] = camera });

    /// <summary>눌러 둔 손가락을 뗀다</summary>
    /// <param name="finger">touch-down 이 준 번호</param>
    public JsonObject TouchUp(double finger) => Send("touch-up", new() { ["finger"] = finger });

    /// <summary>좌표로 끌기 — 한 손가락이 points 를 차례로 지난다(살펴볼 때 · 케이스는 drag)</summary>
    /// <param name="points">"x,y" 글자 둘 이상 — ["540,400", "540,900"]</param>
    /// <param name="duration">처음부터 끝까지 걸리는 초(0~8, 기본 0 — 마디마다 10프레임)</param>
    public JsonObject Swipe(IEnumerable<string> points, double? duration = null) => Send("swipe", new() { ["points"] = Arr(points), ["duration"] = duration });

    /// <summary>길게 누르기 — duration 초 눌렀다 뗀다</summary>
    /// <param name="target">누를 오브젝트 주소 — 없으면 x · y</param>
    /// <param name="x">가로 픽셀 — target 이 없을 때</param>
    /// <param name="y">세로 픽셀 — target 이 없을 때</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    /// <param name="duration">누르고 있는 초(0~8, 기본 1)</param>
    public JsonObject LongPress(string? target = null, double? x = null, double? y = null, string? camera = null, double? duration = null) => Send("long-press", new() { ["target"] = target, ["x"] = x, ["y"] = y, ["camera"] = camera, ["duration"] = duration });

    /// <summary>가짜 마우스를 옮긴다 — hover(Pointer Enter/Exit). 단추는 key Mouse0~4, 끄기는 input-reset</summary>
    /// <param name="target">옮길 자리 오브젝트 주소 — 없으면 x · y</param>
    /// <param name="x">가로 픽셀 — target 이 없을 때</param>
    /// <param name="y">세로 픽셀 — target 이 없을 때</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    /// <param name="duration">옮기는 초(0~8, 기본 0 — 한 번에)</param>
    public JsonObject MouseMove(string? target = null, double? x = null, double? y = null, string? camera = null, double? duration = null) => Send("mouse-move", new() { ["target"] = target, ["x"] = x, ["y"] = y, ["camera"] = camera, ["duration"] = duration });

    /// <summary>마우스 바퀴 — 자리를 주면 먼저 그리로 옮긴다(폰은 자리를 준다)</summary>
    /// <param name="dy">세로 바퀴 칸(위가 +, 옛 Input mouseScrollDelta 꼴)</param>
    /// <param name="dx">가로 바퀴 칸(오른쪽이 +)</param>
    /// <param name="target">바퀴를 굴릴 오브젝트 주소 — 없으면 x · y, 둘 다 없으면 지금 마우스 자리</param>
    /// <param name="x">가로 픽셀</param>
    /// <param name="y">세로 픽셀</param>
    /// <param name="camera">월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)</param>
    /// <param name="duration">나눠 굴리는 초(0~8, 기본 0 — 한 프레임)</param>
    public JsonObject Scroll(double dy, double? dx = null, string? target = null, double? x = null, double? y = null, string? camera = null, double? duration = null) => Send("scroll", new() { ["dy"] = dy, ["dx"] = dx, ["target"] = target, ["x"] = x, ["y"] = y, ["camera"] = camera, ["duration"] = duration });

    /// <summary>키를 눌러 둔다 — key-up · input-reset 까지. A+LeftShift 처럼 여럿</summary>
    /// <param name="key">KeyCode 이름 — 여럿은 A+LeftShift</param>
    /// <param name="power">세기 -1~1(기본 1) — GetAxis 값 · JoystickButton16~19 는 스틱 값</param>
    public JsonObject KeyDown(string key, double? power = null) => Send("key-down", new() { ["key"] = key, ["power"] = power });

    /// <summary>눌러 둔 키를 뗀다</summary>
    /// <param name="key">KeyCode 이름 — 여럿은 A+LeftShift</param>
    public JsonObject KeyUp(string key) => Send("key-up", new() { ["key"] = key });

    /// <summary>기울이기 — duration 동안 가속도(Input.acceleration · Accelerometer)를 대신한다</summary>
    /// <param name="x">가속도 x(g)</param>
    /// <param name="y">가속도 y(g)</param>
    /// <param name="z">가속도 z(g)</param>
    /// <param name="duration">대신하는 초(0~8, 기본 0 — 한 프레임)</param>
    public JsonObject Tilt(double x, double y, double z, double? duration = null) => Send("tilt", new() { ["x"] = x, ["y"] = y, ["z"] = z, ["duration"] = duration });

    /// <summary>GameObject 하나에 Pointer 이벤트를 바로 보낸다(EventSystem 처리기 — 부모로 안 올린다)</summary>
    /// <param name="target">GameObject 주소(UI Toolkit 요소는 안 된다)</param>
    /// <param name="event">down · up · enter · exit — down · up · enter · exit</param>
    public JsonObject Pointer(string target, string @event) => Send("pointer", new() { ["target"] = target, ["event"] = @event });

    /// <summary>가짜 입력을 다 거둔다 — 눌러 둔 손가락 · 키 · 가짜 마우스 · 기울기</summary>
    public JsonObject InputReset() => Send("input-reset", new());

    /// <summary>게임 로그 전부(Log · Warning · Error · Assert · Exception, 최근 500개) — 40자 넘는 영숫자 토막(토큰)은 ***</summary>
    /// <param name="since">받아 둔 last — 그 번호 뒤만</param>
    public JsonObject Logs(double? since = null) => Send("logs", new() { ["since"] = since });

    /// <summary>게임 알림(최근 200개) — scene.loaded · scene.unloaded · game.paused · game.resumed</summary>
    /// <param name="since">받아 둔 last — 그 번호 뒤만</param>
    public JsonObject Events(double? since = null) => Send("events", new() { ["since"] = since });

    /// <summary>켜면 SDK 가 받은 명령마다 「[ControlCli] click LoginButton — 성공」 한 줄을 게임 로그에 적는다(입력 글자 · 값은 ***). 기본 꺼짐 · 게임을 다시 켜면 꺼짐</summary>
    /// <param name="on">true 켜기 · false 끄기</param>
    public JsonObject SdkLog(bool on) => Send("sdk-log", new() { ["on"] = on });

    /// <summary>명령 JSON 하나를 이 드라이버 메서드로 보낸다 — conform --driver 의 다리</summary>
    public JsonObject Dispatch(string cmd, JsonObject a) => cmd switch
    {
        "ping" => Ping(),
        "tree" => Tree(),
        "find" => Find(S(a, "target")!, inactive: B(a, "inactive"), camera: S(a, "camera")),
        "click" => Click(S(a, "target")!, camera: S(a, "camera"), count: N(a, "count"), interval: N(a, "interval")),
        "drag" => Drag(S(a, "target")!, S(a, "to")!, camera: S(a, "camera"), via: A(a, "via"), duration: N(a, "duration")),
        "type" => Type(S(a, "target")!, S(a, "text")!),
        "get" => Get(S(a, "target")!, S(a, "prop")!, inactive: B(a, "inactive")),
        "tap" => Tap(N(a, "x")!.Value, N(a, "y")!.Value, count: N(a, "count"), interval: N(a, "interval")),
        "key" => Key(S(a, "key")!, duration: N(a, "duration"), power: N(a, "power")),
        "screenshot" => Screenshot(format: S(a, "format")),
        "errors" => Errors(since: N(a, "since")),
        "layout" => Layout(target: S(a, "target")),
        "call" => Call(S(a, "target")!, S(a, "method")!, args: A(a, "args"), inactive: B(a, "inactive")),
        "set" => Set(S(a, "target")!, S(a, "prop")!, S(a, "value")!, inactive: B(a, "inactive")),
        "static-call" => StaticCall(S(a, "method")!, args: A(a, "args")),
        "static-get" => StaticGet(S(a, "prop")!),
        "static-set" => StaticSet(S(a, "prop")!, S(a, "value")!),
        "pref-get" => PrefGet(S(a, "key")!, type: S(a, "type")),
        "pref-set" => PrefSet(S(a, "key")!, S(a, "value")!, type: S(a, "type")),
        "pref-delete" => PrefDelete(S(a, "key")!),
        "pref-clear" => PrefClear(),
        "timescale-get" => TimescaleGet(),
        "timescale-set" => TimescaleSet(N(a, "scale")!.Value),
        "scenes" => Scenes(),
        "scene-load" => SceneLoad(S(a, "name")!, mode: S(a, "mode")),
        "scene-unload" => SceneUnload(S(a, "name")!),
        "find-all" => FindAll(S(a, "target")!, inactive: B(a, "inactive"), camera: S(a, "camera")),
        "find-at" => FindAt(N(a, "x")!.Value, N(a, "y")!.Value, camera: S(a, "camera")),
        "components" => Components(S(a, "target")!, inactive: B(a, "inactive")),
        "members" => Members(S(a, "target")!, S(a, "component")!, inactive: B(a, "inactive")),
        "text-set" => TextSet(S(a, "target")!, S(a, "text")!, inactive: B(a, "inactive")),
        "touch-down" => TouchDown(target: S(a, "target"), x: N(a, "x"), y: N(a, "y"), camera: S(a, "camera")),
        "touch-move" => TouchMove(N(a, "finger")!.Value, target: S(a, "target"), x: N(a, "x"), y: N(a, "y"), camera: S(a, "camera")),
        "touch-up" => TouchUp(N(a, "finger")!.Value),
        "swipe" => Swipe(A(a, "points")!, duration: N(a, "duration")),
        "long-press" => LongPress(target: S(a, "target"), x: N(a, "x"), y: N(a, "y"), camera: S(a, "camera"), duration: N(a, "duration")),
        "mouse-move" => MouseMove(target: S(a, "target"), x: N(a, "x"), y: N(a, "y"), camera: S(a, "camera"), duration: N(a, "duration")),
        "scroll" => Scroll(N(a, "dy")!.Value, dx: N(a, "dx"), target: S(a, "target"), x: N(a, "x"), y: N(a, "y"), camera: S(a, "camera"), duration: N(a, "duration")),
        "key-down" => KeyDown(S(a, "key")!, power: N(a, "power")),
        "key-up" => KeyUp(S(a, "key")!),
        "tilt" => Tilt(N(a, "x")!.Value, N(a, "y")!.Value, N(a, "z")!.Value, duration: N(a, "duration")),
        "pointer" => Pointer(S(a, "target")!, S(a, "event")!),
        "input-reset" => InputReset(),
        "logs" => Logs(since: N(a, "since")),
        "events" => Events(since: N(a, "since")),
        "sdk-log" => SdkLog(B(a, "on")!.Value),
        _ => throw new GameException($"모르는 명령입니다: {cmd}"),
    };
    // ── 생성 끝 ──

    /// <summary>conform --driver 의 다리 — stdin 명령 한 줄을 이 드라이버 메서드로 보내고 답을 stdout 한 줄로</summary>
    public static void Bridge(Game game)
    {
        var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        for (string? line; (line = stdin.ReadLine()) is not null;)
        {
            var command = JsonNode.Parse(line)!.AsObject();
            var cmd = (string)command["cmd"]!;
            command.Remove("cmd");
            JsonNode reply;
            try { reply = game.Dispatch(cmd, command); }
            catch (Exception e) when (e is GameException or InvalidOperationException or FormatException)
            {
                reply = new JsonObject { ["ok"] = false, ["error"] = e.Message };
            }
            stdout.Write(reply.ToJsonString(new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) + "\n");
        }
    }
}
