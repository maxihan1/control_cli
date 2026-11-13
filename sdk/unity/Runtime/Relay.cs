// relay 주소가 있는 QA 빌드에서 게임이 relay 로 WebSocket 을 걸어 명령을 받는다 — 못 붙거나 끊기면 2초마다 다시(P3-A, WebGL 은 브라우저 WebSocket P3-B)
using System;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#else
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
#endif
using UnityEngine;

namespace ControlCli
{
    internal static class Relay
    {
        private const int RetryMs = 2000;

        // instrument --relay 로 구운 주소 — 없으면 빈 글자(relay 꺼짐).
        private static string Baked()
        {
            var file = Resources.Load<TextAsset>("ControlCliRelay");
            return file == null ? "" : file.text.Trim();
        }

        private static Uri GameUri(string address)
        {
            if (address.Length == 0) return null;
            try { return new Uri(address.TrimEnd('/') + "/game"); }
            catch (UriFormatException) { Debug.LogWarning("[ControlCli] relay 주소를 읽지 못했습니다: " + address); return null; }
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        // 브라우저 쪽은 Plugins/WebGL/ControlCliRelay.jslib — 받은 줄은 C# 이 매 프레임 꺼내 간다(콜백 없음).
        [DllImport("__Internal")] private static extern void ControlCliRelayOpen(string url, string hello);
        [DllImport("__Internal")] private static extern string ControlCliRelayNext();
        [DllImport("__Internal")] private static extern void ControlCliRelaySend(string text);
        [DllImport("__Internal")] private static extern int ControlCliRelayState();
        [DllImport("__Internal")] private static extern string ControlCliRelayTabId();

        private static Uri _uri;
        // jslib 의 State — 0 아직 · 1 붙음 · 2 끊김. 바뀔 때만 한 줄 남긴다.
        private static int _state;

        // 페이지 주소 ?controlcli=<주소> 가 먼저, 없으면 구운 주소. 메인 스레드(Awake)에서 부른다.
        public static void StartWeb()
        {
            _uri = GameUri(PageAddress() ?? Baked());
            if (_uri == null)
            {
                Debug.Log("[ControlCli] relay 주소가 없습니다 — 페이지 주소에 ?controlcli=ws://<relay>:13101 을 붙이면 붙습니다");
                return;
            }
            // 기기 id 는 탭마다 하나 — 같은 브라우저의 탭 둘이 같은 key 로 서로를 밀어내지 않게.
            ControlCliRelayOpen(_uri.ToString(), "hello " + Hello(ControlCliRelayTabId()));
        }

        // ControlServer.Update 맨 앞 — 받은 명령을 큐에 넣고, 답은 Update 가 정하는 대로 같은 번호로 보낸다.
        public static void Tick()
        {
            if (_uri == null) return;
            var state = ControlCliRelayState();
            if (state != _state)
            {
                if (state == 1) Debug.Log("[ControlCli] relay " + _uri + " 에 붙었습니다");
                else if (_state == 1) Debug.Log("[ControlCli] relay " + _uri + " 와 끊겼습니다 — " + RetryMs / 1000 + "초마다 다시 겁니다");
                else Debug.Log("[ControlCli] relay " + _uri + " 에 붙지 못했습니다 — " + RetryMs / 1000 + "초마다 다시 겁니다");
                _state = state;
            }
            string message;
            while ((message = ControlCliRelayNext()) != null)
            {
                var space = message.IndexOf(' ');
                if (space <= 0) continue;
                var number = message.Substring(0, space);
                ControlServer.Post(message.Substring(space + 1).Trim(), reply => ControlCliRelaySend(number + " " + reply));
            }
        }

        private static string PageAddress()
        {
            var url = Application.absoluteURL;
            var q = url.IndexOf('?');
            if (q < 0) return null;
            var hash = url.IndexOf('#', q);
            var query = hash < 0 ? url.Substring(q + 1) : url.Substring(q + 1, hash - q - 1);
            foreach (var pair in query.Split('&'))
            {
                if (!pair.StartsWith("controlcli=")) continue;
                var value = Uri.UnescapeDataString(pair.Substring("controlcli=".Length).Replace('+', ' ')).Trim();
                if (value.Length > 0) return value;
            }
            return null;
        }
#else
        // 메인 스레드(Awake)에서 부른다 — 주소 파일 · hello 는 여기서 읽고, 연결은 백그라운드 스레드가 맡는다.
        public static void Start(Func<string, string> ask)
        {
            var uri = GameUri(Baked());
            if (uri == null) return; // instrument --relay 를 안 줬다 — relay 는 꺼짐
            var hello = "hello " + Hello(SystemInfo.deviceUniqueIdentifier);
            new Thread(() => Loop(uri, hello, ask)) { IsBackground = true, Name = "ControlCli relay" }.Start();
        }

        private static void Loop(Uri uri, string hello, Func<string, string> ask)
        {
            // 상태가 바뀔 때만 한 줄 — 2초마다 쌓여 logs 를 덮지 않게.
            var up = false;
            var told = false;
            while (true)
            {
                try
                {
                    using (var ws = new ClientWebSocket())
                    {
                        ws.ConnectAsync(uri, CancellationToken.None).Wait();
                        Send(ws, hello);
                        up = true;
                        told = false;
                        Debug.Log("[ControlCli] relay " + uri + " 에 붙었습니다");
                        string message;
                        while ((message = Receive(ws)) != null)
                        {
                            var space = message.IndexOf(' ');
                            if (space > 0) Send(ws, message.Substring(0, space) + " " + ask(message.Substring(space + 1).Trim()));
                        }
                    }
                }
                catch (Exception e)
                {
                    if (!up && !told)
                    {
                        Debug.Log("[ControlCli] relay " + uri + " 에 붙지 못했습니다(" + e.GetBaseException().Message + ") — " + RetryMs / 1000 + "초마다 다시 겁니다");
                        told = true;
                    }
                }
                if (up) Debug.Log("[ControlCli] relay " + uri + " 와 끊겼습니다 — " + RetryMs / 1000 + "초마다 다시 겁니다");
                up = false;
                Thread.Sleep(RetryMs);
            }
        }

        private static void Send(ClientWebSocket ws, string text) =>
            ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text)), WebSocketMessageType.Text, true, CancellationToken.None).Wait();

        // 여러 조각 메시지를 다 모은다 — 닫히면 null. ping 은 ClientWebSocket 이 받는 동안 스스로 pong 한다.
        private static string Receive(ClientWebSocket ws)
        {
            var buffer = new ArraySegment<byte>(new byte[8192]);
            using (var all = new MemoryStream())
            {
                while (true)
                {
                    var r = ws.ReceiveAsync(buffer, CancellationToken.None).Result;
                    if (r.MessageType == WebSocketMessageType.Close) return null;
                    all.Write(buffer.Array, 0, r.Count);
                    if (r.EndOfMessage) return Encoding.UTF8.GetString(all.ToArray());
                }
            }
        }
#endif

        // ping 답에 플랫폼 · 기종 · 기기 이름 · 기기 id 를 더한다 — relay 는 <앱>@<기기 id 앞 8자>로 게임을 알아본다. Application · SystemInfo 는 메인 스레드에서만.
        private static string Hello(string deviceId)
        {
            var ping = ControlServer.PingReply();
            return ping.Substring(0, ping.Length - 1)
                + ",\"platform\":" + Json.Str(PlatformName()) + ",\"model\":" + Json.Str(SystemInfo.deviceModel)
                + ",\"device\":" + Json.Str(SystemInfo.deviceName) + ",\"deviceId\":" + Json.Str(deviceId) + "}";
        }

        private static string PlatformName()
        {
            switch (Application.platform)
            {
                case RuntimePlatform.Android: return "Android";
                case RuntimePlatform.IPhonePlayer: return "iOS";
                case RuntimePlatform.OSXPlayer: case RuntimePlatform.OSXEditor: return "macOS";
                case RuntimePlatform.WindowsPlayer: case RuntimePlatform.WindowsEditor: return "Windows";
                case RuntimePlatform.LinuxPlayer: case RuntimePlatform.LinuxEditor: return "Linux";
                case RuntimePlatform.WebGLPlayer: return "WebGL";
                default: return Application.platform.ToString();
            }
        }
    }
}
