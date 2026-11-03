// game-ci 가 부르는 샘플 빌드 — 빈 장면을 만들어 정의 심볼 CONTROL_CLI 를 켠 QA 빌드로 굽는다(장면 YAML 을 저장소에 두지 않는다)
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
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
        // PC 도 폰과 같은 세로 창 — 가로 전체 화면이면 아래 붙인 UI Toolkit 패널이 uGUI 칸을 덮어 누르기 · 끌기가 패널에 먹힌다(이 맥 실측).
        if (standalone)
        {
            PlayerSettings.fullScreenMode = UnityEngine.FullScreenMode.Windowed;
            PlayerSettings.defaultScreenWidth = 540;
            PlayerSettings.defaultScreenHeight = 1200;
        }
        // 큐브의 BoxCollider 는 코드가 안 불러 엔진 코드 줄이기가 뺀다(실기기 「class 'BoxCollider' doesn't exist」) — 샘플은 줄이지 않는다.
        PlayerSettings.stripEngineCode = false;

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
    // AssetDatabase.ImportPackage 는 미뤄서 가져와(DelayedImportPackageAssets) game-ci 가 빌드 뒤 Unity 를 끄면 안 들어온다 — 직접 풀고 Refresh 로 바로 가져온다.
    private static void ImportTmpResources()
    {
        foreach (var name in new[] { "com.unity.ugui", "com.unity.textmeshpro" })
        {
            var package = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/" + name);
            var file = package == null ? null : Path.Combine(package.resolvedPath, "Package Resources", "TMP Essential Resources.unitypackage");
            if (file == null || !File.Exists(file)) continue;
            Unpack(file);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            Console.WriteLine("[SampleBuild] TMP Essential Resources 를 가져왔습니다: " + file);
            return;
        }
    }

    // .unitypackage 는 tar.gz 다 — GUID 폴더마다 asset(없으면 폴더) · asset.meta · pathname(프로젝트 안 자리).
    private static void Unpack(string file)
    {
        var entries = new Dictionary<string, Dictionary<string, byte[]>>();
        using (var gz = new GZipStream(File.OpenRead(file), CompressionMode.Decompress))
        {
            var header = new byte[512];
            while (ReadFull(gz, header) && header[0] != 0)
            {
                var name = Encoding.ASCII.GetString(header, 0, 100).TrimEnd('\0');
                var size = Convert.ToInt64(Encoding.ASCII.GetString(header, 124, 12).Trim('\0', ' '), 8);
                var data = new byte[size];
                ReadFull(gz, data);
                ReadFull(gz, new byte[(512 - size % 512) % 512]);
                var parts = name.StartsWith("./") ? name.Substring(2).Split('/') : name.Split('/');
                if (parts.Length != 2 || parts[1].Length == 0) continue;
                if (!entries.TryGetValue(parts[0], out var entry)) entries[parts[0]] = entry = new Dictionary<string, byte[]>();
                entry[parts[1]] = data;
            }
        }
        foreach (var entry in entries.Values)
        {
            if (!entry.TryGetValue("pathname", out var pathname)) continue;
            var path = Encoding.UTF8.GetString(pathname).Split('\n')[0].Trim();
            if (entry.TryGetValue("asset", out var asset))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");
                File.WriteAllBytes(path, asset);
            }
            else Directory.CreateDirectory(path);
            if (entry.TryGetValue("asset.meta", out var meta)) File.WriteAllBytes(path + ".meta", meta);
        }
    }

    private static bool ReadFull(Stream stream, byte[] buffer)
    {
        var read = 0;
        while (read < buffer.Length)
        {
            var n = stream.Read(buffer, read, buffer.Length - read);
            if (n == 0) return false;
            read += n;
        }
        return true;
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
