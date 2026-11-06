// QA 빌드가 장면을 구울 때 오브젝트마다 장면 파일 속 번호(GlobalObjectId)를 ControlCliId 로 붙인다 — 게임 저장소의 장면은 그대로, 빌드마다 같은 id
// ponytail: SDK 패키지를 늘 두는 게임은 release 빌드에도 붙는다(글자 칸 하나씩) — 걸리면 플레이어 어셈블리에 ControlCli.Runtime 이 드는지로 가른다.
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ControlCli.Editor
{
    internal sealed class StampIds : IProcessSceneWithReport
    {
        public int callbackOrder => 0;

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            // 에디터 재생(report 가 null)은 건너뛴다 — 그때는 instance id 로 찾는다.
            if (report == null) return;
            int stamped = 0, total = 0;
            foreach (var root in scene.GetRootGameObjects())
                foreach (var t in root.GetComponentsInChildren<Transform>(true))
                {
                    total++;
                    var gid = GlobalObjectId.GetGlobalObjectIdSlow(t.gameObject);
                    if (gid.targetObjectId == 0) continue;
                    var id = t.GetComponent<ControlCliId>();
                    if (id == null) id = t.gameObject.AddComponent<ControlCliId>();
                    id.Id = gid.targetPrefabId == 0 ? gid.targetObjectId.ToString() : gid.targetObjectId + "." + gid.targetPrefabId;
                    stamped++;
                }
            // sample 빌드 로그에서 본다 — 0/N 이면 이 Unity 판은 장면을 굽는 중에 번호를 못 준다(docs/roadmap/p2b-plan.md Task 6 Step 3).
            Debug.Log("[ControlCli] " + scene.path + " 오브젝트 " + stamped + "/" + total + "개에 영구 id");
        }
    }
}
