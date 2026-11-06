// QA 빌드가 장면을 구울 때 InputManager 축 표를 [ControlCliAxes] 오브젝트로 넣는다 — Unity 는 실행 중에 축 설정을 읽는 API 가 없어, 옛 Input 의 GetAxis · GetButton 이 가짜 키를 따르게 한다
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ControlCli.Editor
{
    internal sealed class BakeAxes : IProcessSceneWithReport
    {
        public int callbackOrder => 0;

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            // 에디터 재생(report 가 null)은 건너뛴다.
            if (report == null) return;
            var axes = Read();
            var go = new GameObject("[ControlCliAxes]");
            SceneManager.MoveGameObjectToScene(go, scene);
            go.AddComponent<ControlCliAxes>().axes = axes;
            // sample 빌드 로그에서 본다 — 0 이면 InputManager.asset 을 못 읽었다.
            Debug.Log("[ControlCli] " + scene.path + " 축 " + axes.Length + "개");
        }

        private static ControlCliAxes.Axis[] Read()
        {
            var list = new List<ControlCliAxes.Axis>();
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset");
            if (assets.Length == 0) return list.ToArray();
            var all = new SerializedObject(assets[0]).FindProperty("m_Axes");
            for (var i = 0; i < all.arraySize; i++)
            {
                var a = all.GetArrayElementAtIndex(i);
                var invert = a.FindPropertyRelative("invert");
                list.Add(new ControlCliAxes.Axis
                {
                    name = a.FindPropertyRelative("m_Name").stringValue,
                    positive = a.FindPropertyRelative("positiveButton").stringValue,
                    negative = a.FindPropertyRelative("negativeButton").stringValue,
                    altPositive = a.FindPropertyRelative("altPositiveButton").stringValue,
                    altNegative = a.FindPropertyRelative("altNegativeButton").stringValue,
                    sensitivity = a.FindPropertyRelative("sensitivity").floatValue,
                    invert = invert.propertyType == SerializedPropertyType.Boolean ? invert.boolValue : invert.intValue != 0,
                    type = a.FindPropertyRelative("type").intValue,
                    axis = a.FindPropertyRelative("axis").intValue,
                });
            }
            return list.ToArray();
        }
    }
}
