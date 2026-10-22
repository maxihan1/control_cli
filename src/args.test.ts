// 명령줄 인자 해석이 SDK 로 보낼 한 줄을 바르게 만드는지 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, DEFAULT_PORT } from './args.js';

test('click 은 이름 하나를 붙여 한 줄로 만든다', () => {
  assert.deepEqual(parseArgs(['click', 'LoginButton']), { serial: undefined, port: DEFAULT_PORT, line: 'click LoginButton' });
});

test('--serial · --port 는 줄에서 빠지고 설정으로 간다', () => {
  assert.deepEqual(parseArgs(['-s', 'R3CR', 'tap', '540', '1200', '--port', '13200']), { serial: 'R3CR', port: 13200, line: 'tap 540 1200' });
});

test('틀린 꼴은 보내기 전에 거른다', () => {
  assert.throws(() => parseArgs([]), /명령이 없습니다/);
  assert.throws(() => parseArgs(['jump']), /모르는 명령/);
  assert.throws(() => parseArgs(['tap', '1']), /tap <x> <y>/);
  assert.throws(() => parseArgs(['click']), /click </);
  assert.throws(() => parseArgs(['ping', '--port', 'x']), /--port/);
  assert.throws(() => parseArgs(['ping', '--serial']), /값이 없습니다/);
});
