// QA 빌드 직전에 Unity 프로젝트에 SDK 패키지와 asmdef 참조를 더한다 — 게임 저장소에는 SDK 를 넣지 않고 빌드 잡에서만
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const PACKAGE = 'com.maxihan1.control-cli';
export const INPUT_ASSEMBLY = 'ControlCli.Input';

export function packageUrl(ref: string): string {
  return `https://github.com/maxihan1/control_cli.git?path=/sdk#${ref}`;
}

interface Manifest {
  dependencies?: Record<string, string>;
}

export function addPackage(manifest: Manifest, ref: string): Manifest {
  return { ...manifest, dependencies: { ...manifest.dependencies, [PACKAGE]: packageUrl(ref) } };
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
}

// Visual Studio · Rider 가 붙이는 BOM 은 JSON.parse 가 못 읽는다.
function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as T;
  } catch (e) {
    throw new Error(`${path} 을 JSON 으로 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 다 읽고 고칠 것을 정한 뒤에 쓴다 — 중간에 깨진 파일이 있으면 아무것도 안 바꾼 채 멈춘다.
export function instrument(project: string, ref: string): InstrumentResult {
  const manifestPath = join(project, 'Packages', 'manifest.json');
  const writes: [string, string][] = [[manifestPath, JSON.stringify(addPackage(readJson<Manifest>(manifestPath), ref), null, 2) + '\n']];
  const asmdefs: string[] = [];
  const warnings: string[] = [];
  // Packages/ 안에 프로젝트에 내장한 패키지(게임 코드를 패키지로 나눈 게임)도 본다.
  for (const dir of [join(project, 'Assets'), join(project, 'Packages')]) {
    for (const f of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      const path = join(dir, f);
      if (f.endsWith('.asmdef')) {
        const asmdef = readJson<Asmdef>(path);
        if (!addInputReference(asmdef)) continue;
        writes.push([path, JSON.stringify(asmdef, null, 4) + '\n']);
        asmdefs.push(relative(project, path));
      } else if (f.endsWith('.cs') && shadowsFakeInput(readFileSync(path, 'utf8'))) {
        warnings.push(`${relative(project, path)} — UnityEngine.Input 이 먼저 잡혀 가짜 터치를 못 봅니다. using UnityEngine; 을 파일 맨 위로 옮기거나 namespace UnityEngine 밖으로 빼세요`);
      }
    }
  }
  for (const [path, text] of writes) writeFileSync(path, text);
  return { asmdefs, warnings };
}
