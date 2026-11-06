// protocol/commands.json 이 한 벌로 맞는지 — 이름 겹침 · 칸 꼴 · Unity SDK 의 Caps · SdkVersion 과 같은지
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { COMMANDS, PROTOCOL } from './protocol.js';

test('명령 이름은 겹치지 않고 ping 이 있고 칸은 string · number · array · boolean 과 required · summary 를 갖는다', () => {
  assert.equal(new Set(COMMANDS).size, COMMANDS.length, `겹치는 이름: ${COMMANDS.join(' · ')}`);
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

const UNITY = join(import.meta.dirname, '..', 'sdk', 'unity');

test('Unity SDK 의 Caps · protocol 은 commands.json 과 같고 SdkVersion 은 sdk/unity/package.json 판과 같다', () => {
  const src = readFileSync(join(UNITY, 'Runtime', 'ControlServer.cs'), 'utf8');
  const caps = /string\[\] Caps =\s*\{([^}]*)\}/.exec(src)?.[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1));
  assert.deepEqual(caps, COMMANDS, 'ControlServer.cs 의 Caps');
  assert.equal(Number(/\\"protocol\\":(\d+)/.exec(src)?.[1]), PROTOCOL.protocol, 'ControlServer.cs ping 의 protocol');
  const version = /SdkVersion = "([^"]+)"/.exec(src)?.[1];
  assert.equal(version, (JSON.parse(readFileSync(join(UNITY, 'package.json'), 'utf8')) as { version: string }).version);
});
