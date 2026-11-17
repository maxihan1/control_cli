// QA 빌드 직전 손질이 패키지 · asmdef 참조를 바르게 더하고 가짜 터치를 가리는 파일을 찾는지 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDefine, addInputReference, addPackage, dropPackage, godotSetting, instrument, instrumentGodot, packageUrl, shadowsFakeInput, EMBEDDED, INPUT_ASSEMBLY, PACKAGE, RELAY_FILE, SETTINGS_FILE } from './instrument.js';

test('패키지는 다른 의존을 남기고 고른 ref 로 더한다', () => {
  const out = addPackage({ dependencies: { 'com.unity.ugui': '2.0.0' } }, 'abc123');
  assert.deepEqual(out.dependencies, { 'com.unity.ugui': '2.0.0', [PACKAGE]: packageUrl('abc123') });
  assert.match(packageUrl('abc123'), /\?path=\/sdk\/unity#abc123$/);
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

test('ref 가 없으면 실린 SDK 를 Packages 에 넣고 manifest 의 옛 SDK 줄을 지운다 — 다시 돌려도 SDK 의 asmdef 는 안 고친다', () => {
  const root = mkdtempSync(join(tmpdir(), 'instrument-embed-'));
  mkdirSync(join(root, 'Packages'));
  mkdirSync(join(root, 'Assets'));
  const manifestPath = join(root, 'Packages', 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ dependencies: { 'com.unity.ugui': '2.0.0', [PACKAGE]: packageUrl('old') } }));

  assert.deepEqual(instrument(root, undefined).asmdefs, []);
  assert.deepEqual(JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies, { 'com.unity.ugui': '2.0.0' });
  const runtime = join(root, EMBEDDED, 'Runtime', 'ControlCli.Runtime.asmdef');
  const before = readFileSync(runtime, 'utf8');
  assert.ok(existsSync(runtime + '.meta'), '.meta 도 같이');

  assert.deepEqual(instrument(root, undefined).asmdefs, []);
  assert.equal(readFileSync(runtime, 'utf8'), before);
  // --ref 로 바꾸면 넣어 둔 SDK 를 치운다 — 같은 패키지가 두 곳에 있으면 안 된다.
  instrument(root, 'v1');
  assert.equal(existsSync(join(root, EMBEDDED)), false);
  assert.deepEqual(dropPackage({}).dependencies, {});
  assert.throws(() => packageUrl('v1', ''), /--ref 는 받지 않습니다/);
});

const settings = (symbols: string) => `PlayerSettings:\n  productName: Game\n  scriptingDefineSymbols:${symbols}\n  additionalCompilerArguments: {}\n`;

test('정의 심볼 QAHUB_SDK 를 있는 플랫폼 줄과 SDK 가 받는 플랫폼에 한 번씩 더한다', () => {
  const none = addDefine(settings(' {}'));
  assert.equal(none, settings('\n    Android: QAHUB_SDK\n    iPhone: QAHUB_SDK\n    Standalone: QAHUB_SDK\n    WebGL: QAHUB_SDK'));
  const some = addDefine(settings('\n    Android: A;B\n    Nintendo Switch: A\n    Standalone: '));
  assert.equal(some, settings('\n    Android: A;B;QAHUB_SDK\n    Nintendo Switch: A;QAHUB_SDK\n    Standalone: QAHUB_SDK\n    iPhone: QAHUB_SDK\n    WebGL: QAHUB_SDK'));
  assert.equal(addDefine(some!), some, '두 번 돌려도 그대로');
  // Windows 에서 git 이 줄 끝을 CRLF 로 바꾼 파일 — 줄 끝을 그대로 둔다.
  const crlf = addDefine(settings('\n    Android: A').replaceAll('\n', '\r\n'));
  assert.match(crlf!, /    Android: A;QAHUB_SDK\r\n    iPhone: QAHUB_SDK\r\n/);
  assert.equal(crlf!.replaceAll('\r\n', '').includes('\n'), false);
});

test('못 알아보는 ProjectSettings 는 고치지 않는다 — 숫자 키(옛 판) · LFS 포인터 · 이진', () => {
  assert.equal(addDefine(settings('\n    1: A\n    7: B')), undefined);
  assert.equal(addDefine('version https://git-lfs.github.com/spec/v1\noid sha256:25524b\nsize 25665\n'), undefined);
  assert.equal(addDefine('\u0000\u0001binary'), undefined);
});

test('ProjectSettings.asset 이 있으면 QAHUB_SDK 를 쓰고, 없으면 define 을 false 로 돌려준다', () => {
  const root = mkdtempSync(join(tmpdir(), 'instrument-define-'));
  mkdirSync(join(root, 'Packages'));
  mkdirSync(join(root, 'Assets'));
  mkdirSync(join(root, 'ProjectSettings'));
  writeFileSync(join(root, 'Packages', 'manifest.json'), JSON.stringify({ dependencies: {} }));
  assert.equal(instrument(root, 'v1').define, false);
  writeFileSync(join(root, SETTINGS_FILE), settings(' {}'));
  assert.equal(instrument(root, 'v1').define, true);
  assert.match(readFileSync(join(root, SETTINGS_FILE), 'utf8'), /^    Android: QAHUB_SDK$/m);
});

test('relay 주소를 주면 Resources 에 주소 파일을 넣고, 안 주면 남은 파일을 지운다', () => {
  const root = mkdtempSync(join(tmpdir(), 'instrument-relay-'));
  mkdirSync(join(root, 'Packages'));
  mkdirSync(join(root, 'Assets'));
  writeFileSync(join(root, 'Packages', 'manifest.json'), JSON.stringify({ dependencies: {} }));
  instrument(root, 'v1', 'ws://192.168.0.10:13101');
  assert.equal(readFileSync(join(root, RELAY_FILE), 'utf8'), 'ws://192.168.0.10:13101\n');
  instrument(root, 'v1');
  assert.equal(existsSync(join(root, RELAY_FILE)), false);
});

test('Godot — 애드온을 넣고 autoload 를 한 줄로, relay 는 주면 쓰고 안 주면 지운다', () => {
  const root = mkdtempSync(join(tmpdir(), 'instrument-godot-'));
  writeFileSync(join(root, 'project.godot'), 'config_version=5\n\n[application]\n\nconfig/name="g"\n\n[autoload]\n\nGame="*res://game.gd"\n');
  instrumentGodot(root, 'ws://192.168.0.10:13101');
  instrumentGodot(root, 'ws://192.168.0.10:13101');
  let text = readFileSync(join(root, 'project.godot'), 'utf8');
  assert.equal(text.match(/^ControlCli=/gm)?.length, 1);
  assert.match(text, /\[autoload\]\n\nControlCli="\*res:\/\/addons\/control_cli\/control_cli\.gd"\n\nGame=/);
  assert.match(text, /\[control_cli\]\n\nrelay="ws:\/\/192\.168\.0\.10:13101"\n$/);
  assert.ok(existsSync(join(root, 'addons', 'control_cli', 'control_cli.gd')));
  instrumentGodot(root);
  text = readFileSync(join(root, 'project.godot'), 'utf8');
  assert.doesNotMatch(text, /relay=/);
  assert.equal(godotSetting('[a]\n\nx=1\n', 'b', 'y', undefined), '[a]\n\nx=1\n');
});
