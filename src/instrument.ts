// QA 빌드 직전에 Unity 프로젝트에 SDK 패키지 · asmdef 참조 · 정의 심볼 CONTROL_CLI 를, Godot 프로젝트에 애드온과 autoload 를 더한다 — 게임 저장소에는 SDK 를 넣지 않고 빌드 잡에서만
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

export const PACKAGE = 'com.maxihan1.control-cli';
export const INPUT_ASSEMBLY = 'ControlCli.Input';

// CLI 에 실린 Unity SDK — npm 패키지 files 에 sdk/unity 가 든다. --ref 가 없으면 이것을 프로젝트의 Packages/ 에 넣는다(Godot 와 같은 길).
export const UNITY_SDK = join(import.meta.dirname, '..', 'sdk', 'unity');
export const UNITY_SDK_VERSION = (JSON.parse(readFileSync(join(UNITY_SDK, 'package.json'), 'utf8')) as { version: string }).version;
// 폴더 이름은 패키지 이름과 달라도 된다(Unity 는 안의 package.json 으로 알아본다) — 개발사에는 QA Hub 라는 이름만 보인다.
export const EMBEDDED = join('Packages', 'QAHubSDK');

// 저장소는 package.json 의 repository 에서 읽는다 — 개발사에 파일로 넘기는 tarball(tools/handoff.mjs)은 그 칸을 지워 저장소를 모른다.
const REPOSITORY = (JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { repository?: string }).repository;

// --ref 로 고정할 때 Unity 가 SDK 를 받는 git 주소.
export function packageUrl(ref: string, repository = REPOSITORY): string {
  if (!repository) throw new Error('이 CLI 는 실린 SDK 만 넣습니다 — --ref 는 받지 않습니다');
  return `${repository}?path=/sdk/unity#${ref}`;
}

interface Manifest {
  dependencies?: Record<string, string>;
}

export function addPackage(manifest: Manifest, ref: string): Manifest {
  return { ...manifest, dependencies: { ...manifest.dependencies, [PACKAGE]: packageUrl(ref) } };
}

// 실린 SDK 를 Packages/ 에 넣을 때 — 전에 --ref 로 더한 줄이 남으면 Unity 가 같은 패키지를 두 곳에서 본다.
export function dropPackage(manifest: Manifest): Manifest {
  const { [PACKAGE]: _, ...dependencies } = manifest.dependencies ?? {};
  return { ...manifest, dependencies };
}

interface Asmdef {
  references?: string[];
  includePlatforms?: string[];
  noEngineReferences?: boolean;
}

// 에디터 전용 · 엔진을 안 쓰는 어셈블리는 터치를 읽을 일이 없어 건너뛴다. 이미 있으면 그대로. 바뀌었으면 true.
export function addInputReference(asmdef: Asmdef): boolean {
  const editorOnly = asmdef.includePlatforms?.length === 1 && asmdef.includePlatforms[0] === 'Editor';
  if (editorOnly || asmdef.noEngineReferences === true) return false;
  const refs = asmdef.references ?? [];
  if (refs.includes(INPUT_ASSEMBLY)) return false;
  asmdef.references = [...refs, INPUT_ASSEMBLY];
  return true;
}

// 전역 이름공간의 가짜 Input 보다 UnityEngine.Input 이 먼저 잡히는 두 경우 — 이름공간 안에 둔 `using UnityEngine;` ·
// `namespace UnityEngine.*` 안의 코드. 주석은 보지 않는다.
export function shadowsFakeInput(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (!/\bInput\s*\./.test(code)) return false;
  if (/^\s*namespace\s+UnityEngine\b/m.test(code)) return true;
  const ns = code.search(/^\s*namespace\s/m);
  return ns >= 0 && /^\s*using\s+UnityEngine\s*;/m.test(code.slice(ns));
}

export interface InstrumentResult {
  asmdefs: string[];
  warnings: string[];
  // CONTROL_CLI 를 ProjectSettings.asset 에 썼는지 — false 면 QA 빌드 스크립트가 직접 더해야 한다.
  define: boolean;
}

export const DEFINE = 'CONTROL_CLI';
export const SETTINGS_FILE = join('ProjectSettings', 'ProjectSettings.asset');
// SDK 가 받는 플랫폼 — 정의 심볼이 하나도 없는 플랫폼은 줄이 없어 새로 더한다.
const DEFINE_PLATFORMS = ['Android', 'iPhone', 'Standalone', 'WebGL'];

// PlayerSettings 의 정의 심볼에 CONTROL_CLI 를 더한다 — Unity 2021.2 부터 플랫폼 이름마다 한 줄(`    Android: A;B`), 없으면 `{}`.
// 못 알아보는 꼴(이진 직렬화 · git LFS 포인터 · 옛 판의 숫자 키)은 undefined — 틀리게 고치느니 손으로 더하라고 알린다.
export function addDefine(settings: string): string | undefined {
  const eol = settings.includes('\r\n') ? '\r\n' : '\n';
  const lines = settings.split(eol);
  const head = lines.findIndex((l) => /^  scriptingDefineSymbols:\s*(\{\})?$/.test(l));
  if (head < 0) return undefined;
  let end = head + 1;
  while (end < lines.length && lines[end].startsWith('    ')) end++;
  const symbols = new Map<string, string[]>();
  for (const line of lines.slice(head + 1, end)) {
    const m = /^    ([^:]+):\s*(.*)$/.exec(line);
    if (!m || /^\d+$/.test(m[1])) return undefined;
    symbols.set(m[1], m[2].split(';').filter(Boolean));
  }
  for (const platform of DEFINE_PLATFORMS) if (!symbols.has(platform)) symbols.set(platform, []);
  const block = [...symbols].map(([platform, list]) => `    ${platform}: ${(list.includes(DEFINE) ? list : [...list, DEFINE]).join(';')}`);
  lines.splice(head, end - head, '  scriptingDefineSymbols:', ...block);
  return lines.join(eol);
}

// Visual Studio · Rider 가 붙이는 BOM 은 JSON.parse 가 못 읽는다.
function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as T;
  } catch (e) {
    throw new Error(`${path} 을 JSON 으로 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// SDK Relay.cs 가 Resources.Load 로 읽는다 — 이 파일이 없으면 relay 는 꺼짐.
export const RELAY_FILE = join('Assets', 'ControlCli', 'Resources', 'ControlCliRelay.txt');

// 다 읽고 고칠 것을 정한 뒤에 쓴다 — 중간에 깨진 파일이 있으면 아무것도 안 바꾼 채 멈춘다.
// ref 가 있으면 SDK 를 그 tag · 커밋의 git 주소로 manifest 에 고정하고, 없으면 이 CLI 에 실린 SDK 를 Packages/ 에 넣는다.
export function instrument(project: string, ref: string | undefined, relayAddress?: string): InstrumentResult {
  const manifestPath = join(project, 'Packages', 'manifest.json');
  const manifest = readJson<Manifest>(manifestPath);
  const writes: [string, string][] = [];
  // 실린 SDK 를 넣을 때 manifest 에 SDK 줄이 없으면 그 파일은 건드리지 않는다.
  if (ref !== undefined || manifest.dependencies?.[PACKAGE] !== undefined)
    writes.push([manifestPath, JSON.stringify(ref === undefined ? dropPackage(manifest) : addPackage(manifest, ref), null, 2) + '\n']);
  const sdk = join(project, EMBEDDED);
  const asmdefs: string[] = [];
  const warnings: string[] = [];
  // Packages/ 안에 프로젝트에 내장한 패키지(게임 코드를 패키지로 나눈 게임)도 본다.
  for (const dir of [join(project, 'Assets'), join(project, 'Packages')]) {
    for (const f of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      const path = join(dir, f);
      // 전에 넣어 둔 SDK 는 게임 코드가 아니다 — 참조를 더하면 SDK 가 자기를 참조한다.
      if (path.startsWith(sdk + sep)) continue;
      if (f.endsWith('.asmdef')) {
        const asmdef = readJson<Asmdef>(path);
        if (!addInputReference(asmdef)) continue;
        writes.push([path, JSON.stringify(asmdef, null, 4) + '\n']);
        asmdefs.push(relative(project, path));
      } else if (f.endsWith('.cs') && shadowsFakeInput(readFileSync(path, 'utf8'))) {
        warnings.push(`${relative(project, path)} — 이 파일에서는 터치 입력이 들어가지 않습니다. using UnityEngine;을 파일 맨 위로 옮기거나, 코드를 namespace UnityEngine 밖으로 빼세요.`);
      }
    }
  }
  const settingsPath = join(project, SETTINGS_FILE);
  const settings = existsSync(settingsPath) ? addDefine(readFileSync(settingsPath, 'utf8')) : undefined;
  if (settings !== undefined) writes.push([settingsPath, settings]);
  for (const [path, text] of writes) writeFileSync(path, text);
  rmSync(sdk, { recursive: true, force: true });
  if (ref === undefined) cpSync(UNITY_SDK, sdk, { recursive: true });
  const relayPath = join(project, RELAY_FILE);
  if (relayAddress) {
    mkdirSync(dirname(relayPath), { recursive: true });
    writeFileSync(relayPath, relayAddress + '\n');
  } else if (existsSync(relayPath)) rmSync(relayPath);
  return { asmdefs, warnings, define: settings !== undefined };
}

// ── Godot ──────────────────────────────────────────────

// CLI 에 실린 Godot SDK — npm 패키지 files 에 sdk/godot 이 든다. CLI 판 = SDK 판이라 --ref 를 받지 않는다.
export const GODOT_SDK = join(import.meta.dirname, '..', 'sdk', 'godot', 'addons', 'control_cli');
export const GODOT_AUTOLOAD = '"*res://addons/control_cli/control_cli.gd"';

// project.godot 의 [구역] 안 key 줄을 바꾼다 — value 가 undefined 면 지운다. 구역이 없으면 끝에 더한다.
export function godotSetting(text: string, section: string, key: string, value: string | undefined): string {
  const lines = text.split('\n');
  const head = lines.findIndex((l) => l.trim() === `[${section}]`);
  if (head < 0) return value === undefined ? text : `${text.replace(/\n*$/, '\n')}\n[${section}]\n\n${key}=${value}\n`;
  let end = lines.findIndex((l, i) => i > head && l.startsWith('['));
  if (end < 0) end = lines.length;
  const at = lines.findIndex((l, i) => i > head && i < end && l.startsWith(`${key}=`));
  if (at >= 0) lines.splice(at, 1, ...(value === undefined ? [] : [`${key}=${value}`]));
  else if (value !== undefined) lines.splice(head + 1, 0, '', `${key}=${value}`);
  return lines.join('\n');
}

// Godot QA 빌드 직전 — 애드온을 addons/control_cli 에 새로 넣고 autoload ControlCli · relay 주소(control_cli/relay)를 project.godot 에 쓴다.
export function instrumentGodot(project: string, relayAddress?: string): void {
  const file = join(project, 'project.godot');
  let text = readFileSync(file, 'utf8');
  text = godotSetting(text, 'autoload', 'ControlCli', GODOT_AUTOLOAD);
  text = godotSetting(text, 'control_cli', 'relay', relayAddress === undefined ? undefined : JSON.stringify(relayAddress));
  const dest = join(project, 'addons', 'control_cli');
  rmSync(dest, { recursive: true, force: true });
  cpSync(GODOT_SDK, dest, { recursive: true });
  writeFileSync(file, text);
}
