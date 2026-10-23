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

// 이름공간 안에 둔 `using UnityEngine;` 은 전역 이름공간의 가짜 Input 보다 먼저 잡혀 가짜 터치를 못 본다.
export function shadowsFakeInput(source: string): boolean {
  const ns = source.search(/^\s*namespace\s/m);
  if (ns < 0 || !/\bInput\s*\./.test(source)) return false;
  return /^\s*using\s+UnityEngine\s*;/m.test(source.slice(ns));
}

export interface InstrumentResult {
  asmdefs: string[];
  warnings: string[];
}

export function instrument(project: string, ref: string): InstrumentResult {
  const manifestPath = join(project, 'Packages', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  writeFileSync(manifestPath, JSON.stringify(addPackage(manifest, ref), null, 2) + '\n');

  const assets = join(project, 'Assets');
  const files = readdirSync(assets, { recursive: true, encoding: 'utf8' });
  const asmdefs: string[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    const path = join(assets, f);
    if (f.endsWith('.asmdef')) {
      const asmdef = JSON.parse(readFileSync(path, 'utf8')) as Asmdef;
      if (!addInputReference(asmdef)) continue;
      writeFileSync(path, JSON.stringify(asmdef, null, 4) + '\n');
      asmdefs.push(relative(project, path));
    } else if (f.endsWith('.cs') && shadowsFakeInput(readFileSync(path, 'utf8'))) {
      warnings.push(`${relative(project, path)} — using UnityEngine; 이 namespace 안에 있어 가짜 터치를 못 봅니다. 파일 맨 위로 옮기세요`);
    }
  }
  return { asmdefs, warnings };
}
