#!/usr/bin/env python3
# Unity 에디터 없이 Unity 판 · 입력 설정마다 control_cli SDK 를 컴파일만 해 보는 하네스
"""
Unity 리눅스 에디터 배포본에서 관리 DLL · 내장 패키지만 뽑고, 레지스트리 패키지(TMP · Input System)를 받아
asmdef 를 읽어 만든 csproj 를 Docker 의 .NET SDK 로 빌드한다. Unity 라이선스가 필요 없다.

사용:
  python3 tools/unity-compile-check/check.py fetch [판 ...]   받기 (.cache — 판마다 수 GB 를 내려받아 일부만 푼다)
  python3 tools/unity-compile-check/check.py [판 ...]         판마다 입력 설정 셋으로 컴파일
판은 2021.3 · 2022.3 · 6000.0, 없으면 셋 다.

SDK(sdk/)와 게임 쪽 확인 어셈블리(probe/)는 asmdef 에 적힌 참조만 본다 — 검사 대상이다.
남의 패키지는 적힌 참조가 실제와 달라(TMP 3.0.9 는 references 가 비었는데 UnityEngine.UI 를 쓴다) UnityEngine.UI 를 늘 더한다.
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CACHE = Path(os.environ.get("UNITY_REF_DIR", HERE / ".cache")).resolve()
WORK = HERE / ".work"
BUILTIN = "Editor/Data/Resources/PackageManager/BuiltInPackages"

VERSIONS = {"2021.3": "2021.3.45f1", "2022.3": "2022.3.62f1", "6000.0": "6000.0.84f1"}
# 레지스트리에서 받는 패키지 — Unity 6 의 TMP 는 내장 ugui 2.0 안에 있다.
REGISTRY = {
    "2021.3": {"com.unity.inputsystem": "1.11.2", "com.unity.textmeshpro": "3.0.9"},
    "2022.3": {"com.unity.inputsystem": "1.11.2", "com.unity.textmeshpro": "3.0.9"},
    "6000.0": {"com.unity.inputsystem": "1.11.2"},
}
# Active Input Handling 마다 (정의, 레지스트리 패키지가 드나) — 옛 Input 게임은 패키지가 하나도 없어도 돌아야 한다.
INPUTS = {
    "legacy": (["ENABLE_LEGACY_INPUT_MANAGER"], False),
    "both": (["ENABLE_LEGACY_INPUT_MANAGER", "ENABLE_INPUT_SYSTEM"], True),
    "new": (["ENABLE_INPUT_SYSTEM"], True),
}
# QA Android 플레이어 빌드 — 플랫폼 API 차이는 실빌드(샘플 CI)가 잡는다.
PLAYER = ["UNITY_ANDROID", "ENABLE_IL2CPP", "DEVELOPMENT_BUILD", "CONTROL_CLI", "NET_STANDARD_2_1", "NET_STANDARD", "CSHARP_7_3_OR_NEWER"]
# UNITY_<판>_OR_NEWER 를 셀 판 목록 (Unity 6 도 UNITY_2023_3_OR_NEWER 를 정의한다)
LINES = ["5.3", "5.4", "5.5", "5.6"] + [f"{y}.{m}" for y in range(2017, 2024) for m in ((1, 2, 3, 4) if y < 2020 else (1, 2, 3))] + ["6000.0"]
# 샘플 런타임 코드도 판마다 본다 — Unity 빌드(수십 분)에 앞서 컴파일 오류를 잡는다. 빌드 스크립트(Assets/Editor)는 asmdef 가 없어 빠진다.
OURS = [ROOT / "sdk", HERE / "probe", ROOT / "sample" / "Assets"]
NOWARN = "CS0618;CS0649;CS0414;CS0169;CS0067;CS1701;CS1702;CS0436;MSB3277;CS8632;NU1701"


def vkey(v):
    """2022.3.16f1 · 1.0.0-pre.1 · 1 → 견줄 수 있는 숫자 줄. 알파 a < 베타 b < 정식 f < 패치 p"""
    nums = [int(x) if x.isdigit() else "abfp".index(x) for x in re.findall(r"\d+|[abfp]", v.split("-")[0])]
    return tuple(nums + [0] * (6 - len(nums)))


def satisfies(version, expr):
    """asmdef versionDefines 식 — 「x」는 x 이상, [x,y) · (x,y] 범위, [x] 는 그 판"""
    expr = expr.strip()
    if not expr:
        return True
    v = vkey(version)
    if expr[0] not in "[(":
        return v >= vkey(expr)
    lo, comma, hi = expr[1:-1].partition(",")
    if not comma:
        return v == vkey(lo)
    if lo.strip() and not (v >= vkey(lo) if expr[0] == "[" else v > vkey(lo)):
        return False
    if hi.strip() and not (v <= vkey(hi) if expr[-1] == "]" else v < vkey(hi)):
        return False
    return True


def editor(line):
    return CACHE / VERSIONS[line]


def fetch(line):
    version = VERSIONS[line]
    dest = editor(line)
    if not (dest / ".complete").exists():
        api = f"https://services.api.unity.com/unity/editor/release/v1/releases?version={version}&platform=LINUX&architecture=X86_64"
        release = json.load(urllib.request.urlopen(api))["results"][0]
        url = next(d["url"] for d in release["downloads"] if d["url"].endswith(".tar.xz"))
        patterns = ["Editor/Data/Managed/*", f"{BUILTIN}/*"]
        gnu = "GNU tar" in subprocess.run(["tar", "--version"], capture_output=True, text=True).stdout
        args = ["tar", "-xJf", "-", "-C", str(dest)] + (["--wildcards", *patterns] if gnu else [x for p in patterns for x in ("--include", p)])
        dest.mkdir(parents=True, exist_ok=True)
        print(f"받는 중: {url} -> {dest}", flush=True)
        curl = subprocess.Popen(["curl", "-fsSL", url], stdout=subprocess.PIPE)
        subprocess.run(args, stdin=curl.stdout, check=True)
        if curl.wait() != 0:
            sys.exit(f"내려받기 실패: {url}")
        (dest / ".complete").touch()
    for name, ver in REGISTRY[line].items():
        pkg = CACHE / "packages" / f"{name}-{ver}"
        if (pkg / "package").exists():
            continue
        data = urllib.request.urlopen(f"https://download.packages.unity.com/{name}/-/{name}-{ver}.tgz").read()
        with tarfile.open(fileobj=io.BytesIO(data)) as t:
            t.extractall(pkg, filter="data")
        print(f"받음: {name} {ver}", flush=True)


def packages(line, registry):
    """이 구성에 든 패키지 {이름: (판, 폴더)} — 내장 모듈 · ugui 는 늘, 레지스트리 패키지는 입력 설정에 따라"""
    found = {}
    for pj in (editor(line) / BUILTIN).glob("*/package.json"):
        name = pj.parent.name
        if name.startswith("com.unity.modules.") or name == "com.unity.ugui":
            found[name] = (json.loads(pj.read_text(encoding="utf-8-sig"))["version"], pj.parent)
    if registry:
        for name, ver in REGISTRY[line].items():
            found[name] = (ver, CACHE / "packages" / f"{name}-{ver}" / "package")
    return found


def hidden(rel):
    # Unity 는 . 으로 시작하거나 ~ 로 끝나는 폴더 · 파일을 가져오지 않는다(Samples~ · Documentation~).
    return any(p.startswith(".") or p.endswith("~") for p in rel.parts)


def scan(root, ours):
    """root 아래 asmdef 마다 {이름: 정보}. 하위 폴더에 다른 asmdef · asmref 가 있으면 그 소스는 그쪽 몫이다"""
    owners, found, guids = {}, {}, {}
    for a in sorted(root.rglob("*.asmdef")):
        if hidden(a.relative_to(root)):
            continue
        d = json.loads(a.read_text(encoding="utf-8-sig"))
        found[d["name"]] = {"def": d, "sources": [], "ours": ours}
        owners[a.parent] = d["name"]
        meta = a.with_name(a.name + ".meta")
        m = re.search(r"^guid: (\w+)", meta.read_text(), re.M) if meta.exists() else None
        if m:
            guids[m.group(1)] = d["name"]
    for r in sorted(root.rglob("*.asmref")):
        if not hidden(r.relative_to(root)):
            ref = json.loads(r.read_text(encoding="utf-8-sig"))["reference"]
            owners[r.parent] = guids.get(ref[5:], ref) if ref.startswith("GUID:") else ref
    for cs in sorted(root.rglob("*.cs")):
        if hidden(cs.relative_to(root)):
            continue
        owner = next((owners[p] for p in [cs.parent, *cs.parents] if p in owners), None)
        if owner in found:
            found[owner]["sources"].append(cs)
    return found, guids


def defines_of(a, line, pkgs, base):
    defs = list(base)
    for vd in a["def"].get("versionDefines", []):
        name, expr = vd["name"], vd.get("expression", "")
        have = VERSIONS[line] if name == "Unity" else pkgs.get(name, (None,))[0]
        if have is not None and satisfies(have, expr):
            defs.append(vd["define"])
    return defs


def included(a, defs):
    """Android 플레이어에 드는 어셈블리인가 — 플랫폼 · 정의 제약 · 옛 테스트 표시"""
    d = a["def"]
    inc, exc = d.get("includePlatforms", []), d.get("excludePlatforms", [])
    if (inc and "Android" not in inc) or "Android" in exc or "TestAssemblies" in d.get("optionalUnityReferences", []):
        return False
    return all((c[1:] not in defs) if c.startswith("!") else (c in defs) for c in d.get("defineConstraints", []))


def configure(line, inp):
    input_defines, registry = INPUTS[inp]
    base = [f"UNITY_{x.replace('.', '_')}_OR_NEWER" for x in LINES if vkey(x) <= vkey(line)]
    base += [f"UNITY_{line.replace('.', '_')}", *PLAYER, *input_defines]
    pkgs = packages(line, registry)
    every, guids = {}, {}
    for _, folder in sorted(pkgs.values(), key=lambda p: str(p[1])):
        f, g = scan(folder, False)
        every.update(f)
        guids.update(g)
    for root in OURS:
        f, g = scan(root, True)
        every.update(f)
        guids.update(g)
    for a in every.values():
        a["defines"] = defines_of(a, line, pkgs, base)
    for a in every.values():
        # 없는 이름 · GUID 참조는 Unity 처럼 조용히 버린다.
        refs = [guids.get(r[5:]) if r.startswith("GUID:") else r for r in a["def"].get("references", [])]
        if not a["ours"]:
            refs.append("UnityEngine.UI")
        a["refs"] = [r for r in dict.fromkeys(refs) if r in every and r != a["def"]["name"]]

    # SDK · 확인 어셈블리에서 닿는 것만 빌드한다.
    want, todo = [], [n for n, a in every.items() if a["ours"] and included(a, a["defines"])]
    while todo:
        n = todo.pop()
        if n in want or not included(every[n], every[n]["defines"]):
            continue
        want.append(n)
        todo += every[n]["refs"]
    return {n: every[n] for n in want}


def engine_dlls(line):
    managed = editor(line) / "Editor/Data/Managed/UnityEngine"
    return [d for d in sorted(managed.glob("UnityEngine*.dll")) if d.name != "UnityEngine.dll"] + [managed / "UnityEngine.dll"]


def write_csproj(out, name, a, assemblies, dlls):
    d = a["def"]
    lines = [
        '<Project Sdk="Microsoft.NET.Sdk">',
        "  <PropertyGroup>",
        "    <TargetFramework>netstandard2.1</TargetFramework>",
        "    <LangVersion>9.0</LangVersion>",
        "    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>",
        "    <Nullable>disable</Nullable>",
        f"    <AllowUnsafeBlocks>{'true' if d.get('allowUnsafeCode') else 'false'}</AllowUnsafeBlocks>",
        f"    <AssemblyName>{name}</AssemblyName>",
        f"    <DefineConstants>{';'.join(a['defines'])}</DefineConstants>",
        f"    <NoWarn>{NOWARN}</NoWarn>",
        f"    <TreatWarningsAsErrors>{'true' if a['ours'] else 'false'}</TreatWarningsAsErrors>",
        # Unity 는 참조의 참조를 물려주지 않는다 — SDK 가 asmdef 에 안 적은 어셈블리를 쓰면 여기서도 깨져야 한다.
        f"    <DisableTransitiveProjectReferences>{'true' if a['ours'] else 'false'}</DisableTransitiveProjectReferences>",
        "    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>",
        "    <ProduceReferenceAssembly>false</ProduceReferenceAssembly>",
        "  </PropertyGroup>",
        "  <ItemGroup>",
        *[f'    <Compile Include="{escape(str(s))}" />' for s in a["sources"]],
        *[f'    <Reference Include="{p.stem}"><HintPath>{escape(str(p))}</HintPath><Private>false</Private></Reference>' for p in dlls],
        *[f'    <ProjectReference Include="../{r}/{r}.csproj" />' for r in a["refs"] if r in assemblies],
        "  </ItemGroup>",
        "</Project>",
    ]
    (out / name).mkdir(parents=True, exist_ok=True)
    (out / name / f"{name}.csproj").write_text("\n".join(lines), encoding="utf-8")


def main():
    args = sys.argv[1:]
    if args[:1] == ["fetch"]:
        for line in args[1:] or list(VERSIONS):
            fetch(line)
        return
    lines = args or list(VERSIONS)
    for line in lines:
        if line not in VERSIONS:
            sys.exit(f"모르는 판입니다: {line} ({' · '.join(VERSIONS)})")
        if not (editor(line) / ".complete").exists():
            sys.exit(f"Unity {VERSIONS[line]} 참조가 없습니다 — 먼저 check.py fetch {line}")
    shutil.rmtree(WORK, ignore_errors=True)
    builds = []
    for line in lines:
        for inp in INPUTS:
            out = WORK / f"{line}-{inp}"
            assemblies = configure(line, inp)
            dlls = engine_dlls(line)
            for name, a in assemblies.items():
                write_csproj(out, name, a, assemblies, dlls)
            ours = [n for n, a in assemblies.items() if a["ours"]]
            print(f"== {line} · {inp}: {', '.join(sorted(assemblies))}", flush=True)
            builds.append((out.name, ours))
    # 구성마다 SDK · 확인 어셈블리를 빌드하면 참조한 패키지 어셈블리가 따라 빌드된다. 컨테이너는 하나만 띄운다.
    script = ["fail=0"]
    for config, ours in builds:
        targets = " ".join(f"{n}/{n}.csproj" for n in ours)
        script.append(
            f'cd "{WORK / config}" && for p in {targets}; do dotnet build "$p" -nologo -v q -clp:NoSummary 2>&1 | grep -E "error|warning CS" | sort -u; '
            f'[ "${{PIPESTATUS[0]}}" = 0 ] || {{ echo "실패: {config} $p"; fail=1; }}; done'
        )
    script.append('exit "$fail"')
    mounts = [x for p in dict.fromkeys([ROOT, CACHE]) for x in ("-v", f"{p}:{p}")]
    result = subprocess.run([
        "docker", "run", "--rm", *mounts,
        "-v", "control-cli-nuget:/root/.nuget/packages",
        "-e", "DOTNET_CLI_TELEMETRY_OPTOUT=1", "-e", "DOTNET_NOLOGO=1",
        "mcr.microsoft.com/dotnet/sdk:10.0", "bash", "-c", "\n".join(script),
    ])
    if result.returncode != 0:
        sys.exit("컴파일 실패 — 위 「실패:」 줄의 구성")
    print(f"모든 구성 컴파일 성공 ({len(builds)}개)")


if __name__ == "__main__":
    main()
