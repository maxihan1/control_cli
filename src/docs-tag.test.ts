// README 의 설치 예시 tag 가 package.json 판과 같은지 본다 — 판만 올리고 예시를 두면 옛 판을 받는다
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { VERSION } from './mcp.js';

test(`README 의 설치 예시 tag 는 v${VERSION} 이다`, () => {
  const text = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8');
  const tags = [...text.matchAll(/control_cli#(v\d+\.\d+\.\d+)/g)].map((m) => m[1]);
  assert.ok(tags.length > 0, '설치 예시를 못 찾았습니다');
  assert.deepEqual(tags.filter((t) => t !== `v${VERSION}`), [], `v${VERSION} 로 고칩니다`);
});
