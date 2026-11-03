// 엔진 낱말 명령 — 저장 값(PlayerPrefs) · 시간 배율(Time.timeScale) · 장면 열기 · 닫기 · 목록. 다른 엔진 SDK 도 같은 명령을 낸다(docs/roadmap/plan.md 엔진 표)
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ControlCli
{
    internal static class GameState
    {
        private const string Ok = "{\"ok\":true}";
        private const string BadType = "type 은 string · int · float 중 하나입니다";

        // 게임이 켜진 뒤 장면이 열리고 닫힌 수 — CLI 는 scene-load 답의 수보다 커져야 이번 열기가 끝났다고 본다(같은 장면을 다시 열어도 갈린다).
        private static int _loads, _unloads;

        public static void Watch()
        {
            SceneManager.sceneLoaded += (scene, mode) => _loads++;
            SceneManager.sceneUnloaded += scene => _unloads++;
        }

        // Unity PlayerPrefs 는 담긴 타입을 알려 주지 않는다 — 넣을 때의 type 으로 읽는다. 다른 타입으로 읽으면 기본값(0 · 빈 글자)이 온다.
        public static string PrefGet(string key, string type)
        {
            if (string.IsNullOrEmpty(key)) return Fail("key 가 비었습니다");
            if (!Typed(ref type)) return Fail(BadType);
            if (!PlayerPrefs.HasKey(key)) return "{\"ok\":true,\"found\":false}";
            var value = type == "int" ? PlayerPrefs.GetInt(key).ToString(CultureInfo.InvariantCulture)
                : type == "float" ? Props.Value(PlayerPrefs.GetFloat(key))
                : Json.Str(PlayerPrefs.GetString(key));
            return "{\"ok\":true,\"found\":true,\"value\":" + value + "}";
        }

        public static string PrefSet(string key, string value, string type)
        {
            if (string.IsNullOrEmpty(key)) return Fail("key 가 비었습니다");
            if (!Typed(ref type)) return Fail(BadType);
            value = value ?? "";
            if (type == "int")
            {
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)) return Fail("「" + value + "」은 int 가 아닙니다");
                PlayerPrefs.SetInt(key, i);
            }
            else if (type == "float")
            {
                if (!float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var f)) return Fail("「" + value + "」은 float 가 아닙니다");
                PlayerPrefs.SetFloat(key, f);
            }
            else PlayerPrefs.SetString(key, value);
            // 게임이 죽어도 남게 바로 디스크에 쓴다.
            PlayerPrefs.Save();
            return Ok;
        }

        public static string PrefDelete(string key)
        {
            if (string.IsNullOrEmpty(key)) return Fail("key 가 비었습니다");
            PlayerPrefs.DeleteKey(key);
            PlayerPrefs.Save();
            return Ok;
        }

        public static string PrefClear()
        {
            PlayerPrefs.DeleteAll();
            PlayerPrefs.Save();
            return Ok;
        }

        // JsonUtility 는 없는 글자 칸을 null 이나 빈 글자로 준다 — 그때는 string.
        private static bool Typed(ref string type)
        {
            if (string.IsNullOrEmpty(type)) type = "string";
            return type == "string" || type == "int" || type == "float";
        }

        public static string TimeScale() => "{\"ok\":true,\"timeScale\":" + Props.Value(Time.timeScale) + "}";

        public static string SetTimeScale(float scale)
        {
            // Unity 는 0~100 밖을 에러 로그로 거절한다(errors 에 잡힌다).
            if (!(scale >= 0 && scale <= 100)) return Fail("scale 은 0~100 입니다(0 은 멈춤) — 받은 값 " + Props.Value(scale));
            Time.timeScale = scale;
            return TimeScale();
        }

        // 열리는 중인 장면은 isLoaded 가 아니다 — 다 열린 장면만 싣는다.
        public static string Scenes()
        {
            var sb = new StringBuilder("{\"ok\":true,\"active\":").Append(Json.Str(SceneManager.GetActiveScene().name)).Append(",\"loaded\":[");
            var first = true;
            for (var i = 0; i < SceneManager.sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (!scene.isLoaded) continue;
                if (!first) sb.Append(',');
                first = false;
                sb.Append(Json.Str(scene.name));
            }
            return sb.Append("],\"loads\":").Append(_loads).Append(",\"unloads\":").Append(_unloads).Append('}').ToString();
        }

        // 바로 답하고 장면은 뒤에 열린다 — 큰 장면은 SDK 10초 한도를 넘는다. 답의 loads 는 열기 전 수.
        public static string Load(string name, string mode)
        {
            if (string.IsNullOrEmpty(name)) return Fail("name 이 비었습니다");
            var add = mode == "add";
            if (!add && !string.IsNullOrEmpty(mode) && mode != "single") return Fail("mode 는 single · add 중 하나입니다");
            // 빌드에 없는 장면은 Unity 가 에러 로그를 남긴다 — 먼저 거절한다.
            if (!Application.CanStreamedLevelBeLoaded(name)) return Fail("장면 " + name + " 은 빌드에 없습니다(Build Settings 의 Scenes In Build 이름 · 경로)");
            var loads = _loads;
            SceneManager.LoadSceneAsync(name, add ? LoadSceneMode.Additive : LoadSceneMode.Single);
            return "{\"ok\":true,\"loads\":" + loads + "}";
        }

        public static string Unload(string name)
        {
            if (string.IsNullOrEmpty(name)) return Fail("name 이 비었습니다");
            var scene = SceneManager.GetSceneByName(name);
            if (!scene.IsValid() || !scene.isLoaded) return Fail("열린 장면 중에 " + name + " 이 없습니다");
            var loaded = 0;
            for (var i = 0; i < SceneManager.sceneCount; i++)
                if (SceneManager.GetSceneAt(i).isLoaded) loaded++;
            // 마지막 장면 닫기는 Unity 가 에러 로그로 거절한다.
            if (loaded < 2) return Fail("마지막 장면은 닫을 수 없습니다 — 다른 장면을 먼저 엽니다");
            var unloads = _unloads;
            SceneManager.UnloadSceneAsync(scene);
            return "{\"ok\":true,\"unloads\":" + unloads + "}";
        }

        private static string Fail(string message) => "{\"ok\":false,\"error\":" + Json.Str(message) + "}";
    }
}
