// sdk/unity/ 의 파일 · 폴더마다 .meta 가 하나씩 있고 guid 가 겹치지 않는지 본다 — git 으로 받은 UPM 패키지는 Unity 가 .meta 를 못 만든다
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const SDK = join(import.meta.dirname, '..', 'sdk', 'unity');

// Unity 는 . 으로 시작하거나 ~ 로 끝나는 이름을 가져오지 않아 .meta 도 없다.
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name.endsWith('~')) return [];
    const p = join(dir, e.name);
    return [p, ...(e.isDirectory() ? walk(p) : [])];
  });

test('sdk/unity/ 의 파일 · 폴더마다 .meta 가 하나씩 있고 guid 가 겹치지 않는다', () => {
  const all = walk(SDK);
  const rel = (p: string) => relative(SDK, p);
  const assets = new Set(all.filter((p) => !p.endsWith('.meta')));
  const metas = all.filter((p) => p.endsWith('.meta'));
  assert.deepEqual([...assets].filter((p) => !all.includes(`${p}.meta`)).map(rel), [], '.meta 가 없는 파일 · 폴더');
  assert.deepEqual(metas.filter((m) => !assets.has(m.slice(0, -'.meta'.length))).map(rel), [], '짝이 없는 .meta');
  const seen = new Map<string, string>();
  for (const m of metas) {
    const guid = /^guid: ([0-9a-f]{32})$/m.exec(readFileSync(m, 'utf8'))?.[1];
    assert.ok(guid, `${rel(m)} 에 guid 가 없습니다`);
    assert.equal(seen.get(guid), undefined, `${rel(m)} 의 guid 가 ${seen.get(guid)} 와 겹칩니다`);
    seen.set(guid, rel(m));
  }
});
