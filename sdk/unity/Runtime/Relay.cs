// relay 주소가 구워진 QA 빌드에서 게임이 relay 로 WebSocket 을 걸어 명령을 받는다 — 못 붙거나 끊기면 2초마다 다시(P3-A)
#if !UNITY_WEBGL || UNITY_EDITOR
using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using UnityEngine;

namespace ControlCli
{
    internal static class Relay
    {
        private const int RetryMs = 2000;

        // 메인 스레드(Awake)에서 부른다 — 주소 파일 · hello 는 여기서 읽고, 연결은 백그라운드 스레드가 맡는다.
        public static void Start(Func<string, string> ask)
        {
            var file = Resources.Load<TextAsset>("ControlCliRelay");
            var address = file == null ? "" : file.text.Trim();
            if (address.Length == 0) return; // instrument --relay 를 안 줬다 — relay 는 꺼짐
            Uri uri;
            try { uri = new Uri(address.TrimEnd('/') + "/game"); }
            catch (UriFormatException) { Debug.LogWarning("[ControlCli] relay 주소를 읽지 못했습니다: " + address); return; }
            var hello = "hello " + Hello();
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

        // ping 답에 플랫폼 · 기종 · 기기 이름 · 기기 id 를 더한다 — relay 는 <앱>@<기기 id 앞 8자>로 게임을 알아본다. Application · SystemInfo 는 메인 스레드에서만.
        private static string Hello()
        {
            var ping = ControlServer.PingReply();
            return ping.Substring(0, ping.Length - 1)
                + ",\"platform\":" + Json.Str(PlatformName()) + ",\"model\":" + Json.Str(SystemInfo.deviceModel)
                + ",\"device\":" + Json.Str(SystemInfo.deviceName) + ",\"deviceId\":" + Json.Str(SystemInfo.deviceUniqueIdentifier) + "}";
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
                default: return Application.platform.ToString();
            }
        }
    }
}
#endif
