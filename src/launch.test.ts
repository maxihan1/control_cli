// launch · stop — 띄운 게임의 작업 폴더 · 상대 경로 · 끄기를 node 를 게임 삼아 본다
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';

import { launch, stop } from './launch.js';

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

// 인자를 못 주니 NODE_OPTIONS 로 모듈을 물린다 — 작업 폴더를 파일에 적고 멈춰 있는다.
async function withGame(app: string): Promise<{ pid: number; cwd: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'control-cli-launch-'));
  const out = join(dir, 'cwd.txt');
  await writeFile(join(dir, 'stay.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(out)}, process.cwd());\nsetInterval(() => {}, 1000);\n`);
  process.env.NODE_OPTIONS = `--require "${join(dir, 'stay.cjs').replaceAll('\\', '/')}"`;
  try {
    const pid = launch(app);
    for (let i = 0; i < 100; i++) {
      const cwd = await readFile(out, 'utf8').catch(() => '');
      if (cwd) return { pid, cwd };
      await sleep(50);
    }
    stop(pid);
    throw new Error('띄운 게임이 5초 안에 작업 폴더를 적지 않았습니다');
  } finally {
    delete process.env.NODE_OPTIONS;
  }
}

test('launch — 상대 경로로 줘도 뜨고 작업 폴더는 실행 파일 폴더, stop 은 끄고 두 번째는 false', async () => {
  const { pid, cwd } = await withGame(relative(process.cwd(), process.execPath));
  assert.equal(await realpath(cwd), await realpath(dirname(process.execPath)));
  assert.equal(stop(pid), true);
  // 꺼지는 데 한 박자 걸린다 — 꺼진 뒤에는 false.
  for (let i = 0; i < 100 && stop(pid); i++) await sleep(50);
  assert.equal(stop(pid), false);
});

test('launch — 없는 파일은 띄우기 전에 거절한다', () => {
  assert.throws(() => launch(join(tmpdir(), 'no-such-game.exe')), /게임 실행 파일이 없습니다: .*no-such-game\.exe/);
});
