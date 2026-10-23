// QA 빌드 직전 손질이 패키지 · asmdef 참조를 바르게 더하고 가짜 터치를 가리는 파일을 찾는지 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addInputReference, addPackage, instrument, packageUrl, shadowsFakeInput, INPUT_ASSEMBLY, PACKAGE } from './instrument.js';

test('패키지는 다른 의존을 남기고 고른 ref 로 더한다', () => {
  const out = addPackage({ dependencies: { 'com.unity.ugui': '2.0.0' } }, 'abc123');
  assert.deepEqual(out.dependencies, { 'com.unity.ugui': '2.0.0', [PACKAGE]: packageUrl('abc123') });
  assert.match(packageUrl('abc123'), /\?path=\/sdk#abc123$/);
});

test('게임 어셈블리에만 참조를 한 번 더한다', () => {
  const game = { references: ['UnityEngine.UI'] };
  assert.equal(addInputReference(game), true);
  assert.deepEqual(game.references, ['UnityEngine.UI', INPUT_ASSEMBLY]);
  assert.equal(addInputReference(game), false);
  assert.equal(addInputReference({ includePlatforms: ['Editor'] }), false);
  assert.equal(addInputReference({ noEngineReferences: true }), false);
  const bare: { references?: string[] } = {};
  assert.equal(addInputReference(bare), true);
  assert.deepEqual(bare.references, [INPUT_ASSEMBLY]);
});

test('namespace 안의 using UnityEngine 만 가짜 터치를 가린다고 본다', () => {
  assert.equal(shadowsFakeInput('using UnityEngine;\nnamespace A\n{\n  class B { int n = Input.touchCount; }\n}'), false);
  assert.equal(shadowsFakeInput('namespace A\n{\n  using UnityEngine;\n  class B { int n = Input.touchCount; }\n}'), true);
  assert.equal(shadowsFakeInput('namespace A;\nusing UnityEngine;\nclass B { int n = Input.touchCount; }'), true);
  assert.equal(shadowsFakeInput('namespace A\n{\n  using UnityEngine;\n  class B { }\n}'), false);
  assert.equal(shadowsFakeInput('using UnityEngine;\nnamespace UnityEngine.UI.Extensions\n{\n  class B { int n = Input.touchCount; }\n}'), true);
  assert.equal(shadowsFakeInput('// namespace Old\nusing UnityEngine;\nclass B { int n = Input.touchCount; }'), false);
});

test('BOM 붙은 파일 · Packages 안 내장 패키지도 고친다', () => {
  const root = mkdtempSync(join(tmpdir(), 'instrument-'));
  mkdirSync(join(root, 'Packages', 'com.studio.game', 'Runtime'), { recursive: true });
  mkdirSync(join(root, 'Assets'));
  writeFileSync(join(root, 'Packages', 'manifest.json'), '﻿' + JSON.stringify({ dependencies: {} }));
  writeFileSync(join(root, 'Packages', 'com.studio.game', 'Runtime', 'Game.asmdef'), '﻿' + JSON.stringify({ name: 'Game' }));

  const result = instrument(root, 'v1');

  assert.deepEqual(result.asmdefs, [join('Packages', 'com.studio.game', 'Runtime', 'Game.asmdef')]);
  const manifest = JSON.parse(readFileSync(join(root, 'Packages', 'manifest.json'), 'utf8'));
  assert.equal(manifest.dependencies[PACKAGE], packageUrl('v1'));
});

test('깨진 asmdef 가 있으면 파일 이름을 알리고 아무것도 안 바꾼다', () => {
  const root = mkdtempSync(join(tmpdir(), 'instrument-'));
  mkdirSync(join(root, 'Packages'));
  mkdirSync(join(root, 'Assets'));
  const manifest = JSON.stringify({ dependencies: {} });
  writeFileSync(join(root, 'Packages', 'manifest.json'), manifest);
  writeFileSync(join(root, 'Assets', 'A.asmdef'), JSON.stringify({ name: 'A' }));
  writeFileSync(join(root, 'Assets', 'Broken.asmdef'), '{ "name": ');

  assert.throws(() => instrument(root, 'v1'), /Broken\.asmdef/);
  assert.equal(readFileSync(join(root, 'Packages', 'manifest.json'), 'utf8'), manifest);
  assert.equal(readFileSync(join(root, 'Assets', 'A.asmdef'), 'utf8'), JSON.stringify({ name: 'A' }));
});

test('프로젝트 폴더를 고치고 무엇을 바꿨는지 돌려준다', () => {
  const root = mkdtempSync(join(tmpdir(), 'instrument-'));
  mkdirSync(join(root, 'Packages'));
  mkdirSync(join(root, 'Assets', 'Game', 'Editor'), { recursive: true });
  writeFileSync(join(root, 'Packages', 'manifest.json'), JSON.stringify({ dependencies: {} }));
  writeFileSync(join(root, 'Assets', 'Game', 'Game.asmdef'), JSON.stringify({ name: 'Game', references: [] }));
  writeFileSync(join(root, 'Assets', 'Game', 'Editor', 'Game.Editor.asmdef'), JSON.stringify({ name: 'Game.Editor', includePlatforms: ['Editor'] }));
  writeFileSync(join(root, 'Assets', 'Game', 'Hidden.cs'), 'namespace G {\n using UnityEngine;\n class H { bool t = Input.touchCount > 0; }\n}');

  const result = instrument(root, 'v1');

  assert.deepEqual(result.asmdefs, [join('Assets', 'Game', 'Game.asmdef')]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Hidden\.cs/);
  const manifest = JSON.parse(readFileSync(join(root, 'Packages', 'manifest.json'), 'utf8'));
  assert.equal(manifest.dependencies[PACKAGE], packageUrl('v1'));
  const editor = JSON.parse(readFileSync(join(root, 'Assets', 'Game', 'Editor', 'Game.Editor.asmdef'), 'utf8'));
  assert.equal(editor.references, undefined);
});
