// game-ci 가 부르는 샘플 빌드 — 빈 장면을 만들어 정의 심볼 CONTROL_CLI 를 켠 QA 빌드로 굽는다(장면 YAML 을 저장소에 두지 않는다)
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;

public static class SampleBuild
{
    private const string Scene = "Assets/Sample.unity";

    // buildMethod: SampleBuild.Build — 대상은 game-ci 가 켠 빌드 대상, 출력 자리는 -customBuildPath.
    public static void Build()
    {
        var target = EditorUserBuildSettings.activeBuildTarget;
        var group = BuildPipeline.GetBuildTargetGroup(target);
        var named = NamedBuildTarget.FromBuildTargetGroup(group);
        ImportTmpResources();
        SetInputHandler(Arg("activeInputHandler"));
        EditorSceneManager.SaveScene(EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single), Scene);
        PlayerSettings.productName = "control_cli sample";
        PlayerSettings.SetApplicationIdentifier(named, "com.maxihan1.controlcli.sample");
        PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
        // 폰은 QA 빌드처럼 IL2CPP — 코드 줄이기 뒤에도 SDK 가 남는지까지 본다. PC 는 Mono(리눅스 CI 는 mac · Windows IL2CPP 를 못 굽는다).
        var standalone = target == BuildTarget.StandaloneOSX || target == BuildTarget.StandaloneWindows64;
        PlayerSettings.SetScriptingBackend(named, standalone ? ScriptingImplementation.Mono2x : ScriptingImplementation.IL2CPP);
        if (target == BuildTarget.Android) PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;

        var output = Arg("customBuildPath") ?? "Builds/sample";
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)) ?? ".");
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { Scene },
            target = target,
            targetGroup = group,
            locationPathName = output,
            options = BuildOptions.Development,
            extraScriptingDefines = new[] { "CONTROL_CLI" },
        });
        if (report.summary.result != BuildResult.Succeeded)
            throw new Exception("샘플 빌드 실패: " + report.summary.result + " (오류 " + report.summary.totalErrors + "개)");
        // game-ci 는 로그에서 이 문구를 찾아 성공으로 본다.
        Console.WriteLine("Build succeeded!");
    }

    // TMP 를 쓰는 게임은 기본 글꼴 · 설정(TMP Essential Resources)을 가져와 둔다 — 샘플도 같게. Unity 6 은 ugui 안, 옛 판은 textmeshpro 패키지에 있고 TMP 가 없는 구성은 건너뛴다.
    private static void ImportTmpResources()
    {
        foreach (var package in new[] { "Packages/com.unity.ugui", "Packages/com.unity.textmeshpro" })
        {
            var resources = package + "/Package Resources/TMP Essential Resources.unitypackage";
            if (!File.Exists(Path.GetFullPath(resources))) continue;
            AssetDatabase.ImportPackage(resources, false);
            AssetDatabase.Refresh();
            return;
        }
    }

    // Active Input Handling — 0 옛 Input · 1 Input System · 2 둘 다. 공개 API 가 없어 Input System 패키지 설정 창과 같이 PlayerSettings 를 직렬화로 고친다.
    private static void SetInputHandler(string value)
    {
        if (value == null) return;
        var settings = new SerializedObject(Unsupported.GetSerializedAssetInterfaceSingleton("PlayerSettings"));
        settings.FindProperty("activeInputHandler").intValue = int.Parse(value);
        settings.ApplyModifiedProperties();
    }

    private static string Arg(string name)
    {
        var argv = Environment.GetCommandLineArgs();
        var i = Array.IndexOf(argv, "-" + name);
        return i >= 0 && i + 1 < argv.Length ? argv[i + 1] : null;
    }
}
