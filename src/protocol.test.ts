// protocol/commands.json 이 한 벌로 맞는지 — 이름 겹침 · 칸 꼴 · Unity SDK 의 Caps · SdkVersion 과 같은지
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMANDS, PROTOCOL } from './protocol.js';

test('명령 12개 · 이름은 겹치지 않고 칸은 string · number 와 required · summary 를 갖는다', () => {
  assert.equal(PROTOCOL.protocol, 2);
  assert.deepEqual(COMMANDS, ['ping', 'tree', 'find', 'click', 'drag', 'type', 'get', 'tap', 'key', 'screenshot', 'errors', 'layout']);
  for (const c of PROTOCOL.commands) {
    assert.ok(c.summary, `${c.name} 에 summary 가 없습니다`);
    for (const [k, a] of Object.entries(c.args)) {
      assert.ok(a.type === 'string' || a.type === 'number', `${c.name}.${k} 의 type`);
      assert.equal(typeof a.required, 'boolean', `${c.name}.${k} 의 required`);
      assert.ok(a.summary, `${c.name}.${k} 의 summary`);
    }
  }
});
