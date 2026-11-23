// protocol/commands.json 이 한 벌로 맞는지 — 이름 겹침 · 칸 꼴 · Unity SDK 의 Caps · SdkVersion 과 같은지
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { COMMANDS, FEATURES, PROTOCOL } from './protocol.js';

test('명령 · 기능 이름은 겹치지 않고 ping 이 있고 칸은 string · number · array · boolean 과 required · summary 를 갖는다', () => {
  assert.equal(new Set([...COMMANDS, ...FEATURES]).size, COMMANDS.length + FEATURES.length, `겹치는 이름: ${[...COMMANDS, ...FEATURES].join(' · ')}`);
  assert.ok(COMMANDS.includes('ping'), 'open 이 ping 으로 게임 답을 기다린다');
  for (const c of PROTOCOL.commands) {
    assert.ok(c.summary, `${c.name} 에 summary 가 없습니다`);
    for (const [k, a] of Object.entries(c.args)) {
      assert.ok(['string', 'number', 'array', 'boolean'].includes(a.type), `${c.name}.${k} 의 type`);
      assert.equal(typeof a.required, 'boolean', `${c.name}.${k} 의 required`);
      assert.ok(a.summary, `${c.name}.${k} 의 summary`);
      // 고를 글자는 글자 칸에만 — MCP 도구 꼴의 enum 이 된다.
      if (a.enum !== undefined) assert.ok(a.type === 'string' && a.enum.length > 0 && a.enum.every((e) => typeof e === 'string'), `${c.name}.${k} 의 enum`);
    }
  }
});

// 그 엔진 SDK 가 caps 에 실어야 하는 것 — engines 가 없는 명령은 전부, 있으면 든 엔진만.
const capsOf = (engine: string) => [...PROTOCOL.commands.filter((c) => !c.engines || c.engines.includes(engine)).map((c) => c.name), ...FEATURES];

test('engines 는 아는 엔진 이름만 적는다', () => {
  for (const c of PROTOCOL.commands) for (const e of c.engines ?? []) assert.ok(['unity', 'godot'].includes(e), `${c.name} 의 engines: ${e}`);
});

const UNITY = join(import.meta.dirname, '..', 'sdk', 'unity');

test('Unity SDK 의 Caps · protocol 은 commands.json 과 같고 SdkVersion 은 sdk/unity/package.json 판과 같다', () => {
  const src = readFileSync(join(UNITY, 'Runtime', 'ControlServer.cs'), 'utf8');
  const caps = /string\[\] Caps =\s*\{([^}]*)\}/.exec(src)?.[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1));
  assert.deepEqual(caps, capsOf('unity'), 'ControlServer.cs 의 Caps — 명령 뒤에 기능');
  assert.equal(Number(/\\"protocol\\":(\d+)/.exec(src)?.[1]), PROTOCOL.protocol, 'ControlServer.cs ping 의 protocol');
  const version = /SdkVersion = "([^"]+)"/.exec(src)?.[1];
  assert.equal(version, (JSON.parse(readFileSync(join(UNITY, 'package.json'), 'utf8')) as { version: string }).version);
});

const GODOT = join(import.meta.dirname, '..', 'sdk', 'godot', 'addons', 'control_cli');

test('Godot SDK 의 CAPS · protocol 은 commands.json 과 같고 SDK_VERSION 은 plugin.cfg 판과 같다', () => {
  const src = readFileSync(join(GODOT, 'control_cli.gd'), 'utf8');
  const caps = /const CAPS := \[([^\]]*)\]/.exec(src)?.[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1));
  assert.deepEqual(caps, capsOf('godot'), 'control_cli.gd 의 CAPS — 명령 뒤에 기능(Unity 전용 명령은 뺀다)');
  assert.equal(Number(/"protocol": (\d+)/.exec(src)?.[1]), PROTOCOL.protocol, 'control_cli.gd ping 의 protocol');
  assert.equal(/SDK_VERSION := "([^"]+)"/.exec(src)?.[1], /^version="([^"]+)"/m.exec(readFileSync(join(GODOT, 'plugin.cfg'), 'utf8'))?.[1]);
});
