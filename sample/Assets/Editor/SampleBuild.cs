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
        EditorSceneManager.SaveScene(EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single), Scene);
        PlayerSettings.productName = "control_cli sample";
        PlayerSettings.SetApplicationIdentifier(named, "com.maxihan1.controlcli.sample");
        PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
        // QA 빌드처럼 IL2CPP — 코드 줄이기 뒤에도 SDK 가 남는지까지 본다.
        PlayerSettings.SetScriptingBackend(named, ScriptingImplementation.IL2CPP);
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

    private static string Arg(string name)
    {
        var argv = Environment.GetCommandLineArgs();
        var i = Array.IndexOf(argv, "-" + name);
        return i >= 0 && i + 1 < argv.Length ? argv[i + 1] : null;
    }
}
