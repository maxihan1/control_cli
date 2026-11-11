// relay 주소를 구운 iOS QA 빌드의 Info.plist 에 로컬 네트워크 사용 문구를 넣는다 — 같은 Wi-Fi 의 relay 로 걸면 iOS 가 허락을 묻는다(P3-A)
using System.IO;
using UnityEditor;
using UnityEditor.Callbacks;

namespace ControlCli.Editor
{
    internal static class LocalNetwork
    {
        private const string Key = "NSLocalNetworkUsageDescription";
        // instrument --relay 가 쓰는 파일(src/instrument.ts RELAY_FILE) — 없으면 relay 가 꺼진 빌드라 손대지 않는다.
        private const string RelayFile = "Assets/ControlCli/Resources/ControlCliRelay.txt";

        [PostProcessBuild]
        private static void Add(BuildTarget target, string path)
        {
            if (target != BuildTarget.iOS || !File.Exists(RelayFile)) return;
            var plist = Path.Combine(path, "Info.plist");
            var text = File.ReadAllText(plist);
            if (text.Contains("<key>" + Key + "</key>")) return;
            var end = text.LastIndexOf("</dict>");
            File.WriteAllText(plist, text.Substring(0, end) + "\t<key>" + Key + "</key>\n\t<string>QA 빌드가 같은 네트워크의 control-cli relay 에 연결합니다</string>\n" + text.Substring(end));
        }
    }
}
