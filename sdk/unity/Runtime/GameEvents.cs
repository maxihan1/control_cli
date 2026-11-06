// 장면 열림 · 닫힘 · 앱 일시정지 알림에 번호를 붙여 들고 있다가 events 명령에 돌려준다 — 이름은 Issue Bunker 이벤트 꼴(대상.과거분사)
using System;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.Scripting;

namespace ControlCli
{
    internal static class GameEvents
    {
        public static readonly Feed Items = new Feed("events", 200);
        private static bool _paused;

        // 첫 장면보다 먼저 — 첫 장면 열림도 잡는다(GameState.Watch 는 AfterSceneLoad 라 놓친다).
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration), Preserve]
        private static void Listen()
        {
            SceneManager.sceneLoaded -= Loaded;
            SceneManager.sceneLoaded += Loaded;
            SceneManager.sceneUnloaded -= Unloaded;
            SceneManager.sceneUnloaded += Unloaded;
        }

        private static void Loaded(Scene scene, LoadSceneMode mode) =>
            Add("scene.loaded", ",\"scene\":" + Json.Str(scene.name) + ",\"mode\":\"" + (mode == LoadSceneMode.Additive ? "add" : "single") + "\"");

        private static void Unloaded(Scene scene) => Add("scene.unloaded", ",\"scene\":" + Json.Str(scene.name));

        // Unity 는 켤 때도 OnApplicationPause(false) 를 부른다 — 바뀔 때만 적는다. PC 는 SDK 가 runInBackground 를 켜 불리지 않는다.
        public static void Pause(bool paused)
        {
            if (paused == _paused) return;
            _paused = paused;
            Add(paused ? "game.paused" : "game.resumed", "");
        }

        private static void Add(string type, string fields) =>
            Items.Add(",\"occurredAt\":" + Json.Str(Feed.Stamp(DateTime.UtcNow)) + ",\"type\":\"" + type + "\"" + fields);
    }
}
