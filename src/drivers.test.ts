// 언어 드라이버 — 생성 칸이 commands.json 과 같은지, 언어마다 다리로 가짜 표준 화면에 conform 이 통과하는지 본다(없는 언어 도구는 건너뜀)
import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { run } from './cli.js';
import { CONFORM, conform, report } from './conform.js';
import { drivers } from './drivers.js';
import { exec, fakeRelayGame, fakeTcp, RECORDED, standardScreen } from './fake-game.js';
import { Game, WAIT } from './game.js';
import { driverLink } from './link.js';
import { exportTest, FILES, type Lang } from './recorder.js';
import { relay } from './relay.js';

Object.assign(WAIT, { intervalMs: 5 });
Object.assign(CONFORM, { waitMs: 200, holdS: 0.1, dragS: 0, keyS: 0 });

const ROOT = join(import.meta.dirname, '..');
const has = (tool: string) => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0;

test('드라이버 파일의 생성 칸이 protocol/commands.json 과 같다 — 다르면 npm run drivers', () => {
  for (const d of drivers()) assert.equal(d.now, d.want, `${d.file} 가 commands.json 과 다릅니다 — npm run drivers`);
});

// 다리 명령 — 저장소 뿌리에서 돈다.
const BRIDGES = [
  { lang: 'Python', tool: 'python3', cmd: `python3 ${join(ROOT, 'drivers/python/control_cli.py')} bridge` },
  { lang: 'Java', tool: 'java', cmd: `java ${join(ROOT, 'drivers/java/controlcli/ControlCli.java')} bridge` },
  { lang: 'C#', tool: 'dotnet', cmd: `dotnet run --project ${join(ROOT, 'drivers/csharp')}` },
];

for (const b of BRIDGES) {
  test(`${b.lang} 다리 — 가짜 표준 화면(TCP)에 conform 52줄 통과 · 일시정지만 미실행`, { skip: !has(b.tool) && `${b.tool} 없음` }, async () => {
    const pc = await fakeTcp(standardScreen());
    const d = driverLink(b.cmd, { ...process.env, CONTROL_CLI_GAME: `tcp://127.0.0.1:${pc.port}` });
    try {
      const r = await conform(new Game(d.link));
      assert.deepEqual([r.passed, r.failed, r.skipped], [52, 0, 1], report(r));
    } finally {
      d.close();
      pc.server.close();
    }
  });

  test(`${b.lang} 다리 — 토큰 relay 로도 conform 이 통과하고, 토큰이 틀리면 relay 의 거절 글로 실패`, { skip: !has(b.tool) && `${b.tool} 없음` }, async () => {
    const server = relay({ token: 's3cret' });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ws = await fakeRelayGame(standardScreen(), url);
    const d = driverLink(b.cmd, { ...process.env, CONTROL_CLI_GAME: `${url}/games/${encodeURIComponent('com.fake.game@fake-dev')}`, CONTROL_CLI_RELAY_TOKEN: 's3cret' });
    const wrong = driverLink(b.cmd, { ...process.env, CONTROL_CLI_GAME: `${url}/games/x`, CONTROL_CLI_RELAY_TOKEN: 'nope' });
    try {
      const games = (await (await fetch(`${url}/games`, { headers: { Authorization: 'Bearer s3cret' } })).json()) as { value: { key: string }[] };
      assert.deepEqual(games.value.map((g) => g.key), ['com.fake.game@fake-dev']);
      const r = await conform(new Game(d.link));
      assert.deepEqual([r.passed, r.failed, r.skipped], [52, 0, 1], report(r));
      await assert.rejects(new Game(wrong.link).ping(), /토큰/);
    } finally {
      d.close();
      wrong.close();
      ws.close();
      server.closeAllConnections();
      server.close();
    }
  });
}

test('다리가 죽으면 그 까닭(stderr)으로 실패한다', { skip: !has('python3') && 'python3 없음' }, async () => {
  const d = driverLink(`python3 ${join(ROOT, 'drivers/python/control_cli.py')} nope`, process.env);
  await assert.rejects(new Game(d.link).ping(), /드라이버 다리 .*종료 코드 1.*control_cli\.py bridge/s);
});

test('CLI conform --driver — PC 세션 주소를 다리에 넘기고 머리에 드라이버를 적는다', { skip: !has('python3') && 'python3 없음' }, async () => {
  const pc = await fakeTcp(standardScreen());
  const dir = await mkdtemp(join(tmpdir(), 'control-cli-'));
  const cli = (...argv: string[]) => run(argv, { env: {}, dir });
  try {
    await cli('-s=drv', 'open', '--pc', '--port', String(pc.port));
    const out = await cli('-s=drv', 'conform', '--port', String(pc.port), '--driver', BRIDGES[0].cmd);
    assert.match(out, /^드라이버 — python3 .*\nconform — com\.fake\.game/);
    assert.match(out, /통과 52 · 실패 0 · 미실행 1$/);
    await cli('-s=drv', 'close');
  } finally {
    pc.server.close();
  }
});

test('Robot — Python 드라이버를 라이브러리로 표준 화면 suite 가 통과한다', { skip: !has('robot') && 'robot 없음' }, async () => {
  const pc = await fakeTcp(standardScreen());
  const out = await mkdtemp(join(tmpdir(), 'control-cli-robot-'));
  try {
    // 동기 실행은 이벤트 루프를 막아 가짜 게임이 못 답한다 — 따로 띄운다.
    const r = await new Promise<{ code: number | null; text: string }>((resolve) => {
      const args = ['--pythonpath', join(ROOT, 'drivers/python'), '--variable', `GAME:tcp://127.0.0.1:${pc.port}`, '--outputdir', out, '--console', 'dotted', join(ROOT, 'drivers/robot/standard.robot')];
      const p = spawn('robot', args);
      let text = '';
      p.stdout.on('data', (b) => (text += b));
      p.stderr.on('data', (b) => (text += b));
      p.on('close', (code) => resolve({ code, text }));
    });
    assert.equal(r.code, 0, r.text);
  } finally {
    pc.server.close();
  }
});

// 다리 없이 드라이버를 그대로 쓰는 꼴 — 고를 칸 · 실패 답 · 틀린 칸 이름
test('Python 드라이버를 바로 — 고를 칸은 이름으로, 실패 답은 GameError', { skip: !has('python3') && 'python3 없음' }, async () => {
  const pc = await fakeTcp(standardScreen());
  const script = `
import sys; sys.path.insert(0, ${JSON.stringify(join(ROOT, 'drivers/python'))})
from control_cli import Game, GameError
g = Game('tcp://127.0.0.1:${pc.port}')
assert g.find('LoginButton')['found'] is True
assert g.find('HiddenText', inactive=True)['active'] is False
assert [f['path'] for f in g.find_all('//Bag/Slot')['found']][-1] == '/SampleCanvas/Bag/Slot[3]'
try:
    g.text_set('IdInput', 'x'); raise SystemExit('실패여야 함')
except GameError as e:
    assert 'type' in str(e), e
print('ok')
`;
  try {
    const out = await new Promise<string>((resolve, reject) => execFile('python3', ['-c', script], (e, stdout, stderr) => (e ? reject(new Error(stderr || e.message)) : resolve(stdout))));
    assert.equal(out.trim(), 'ok');
  } finally {
    pc.server.close();
  }
});

// Recorder 가 내보낸 테스트 파일을 그 언어 도구로 실제로 돌린다 — 같은 기록(RECORDED)이 가짜 표준 화면에 초록
type Ran = { code: number | null; text: string };
const EXPORTS: { lang: Lang; tool: string; run: (dir: string, file: string, env: NodeJS.ProcessEnv) => Promise<Ran> }[] = [
  { lang: 'py', tool: 'python3', run: (dir, file, env) => exec('python3', [file], { ...env, PYTHONPATH: join(ROOT, 'drivers/python') }, dir) },
  {
    lang: 'java',
    tool: 'java',
    run: async (dir, file, env) => {
      const built = await exec('javac', ['-d', dir, join(ROOT, 'drivers/java/controlcli/ControlCli.java')]);
      return built.code === 0 ? exec('java', ['-cp', dir, file], env, dir) : built;
    },
  },
  {
    lang: 'cs',
    tool: 'dotnet',
    run: async (dir, _file, env) => {
      // 드라이버 csproj 를 그대로 — 폴더의 .cs 를 다 넣는다(Bridge.cs 대신 내보낸 Recorded.cs 가 최상위 문장).
      await copyFile(join(ROOT, 'drivers/csharp/ControlCli.csproj'), join(dir, 'Recorded.csproj'));
      await copyFile(join(ROOT, 'drivers/csharp/ControlCli.cs'), join(dir, 'ControlCli.cs'));
      return exec('dotnet', ['run', '--project', dir], env);
    },
  },
  { lang: 'robot', tool: 'robot', run: (dir, file, env) => exec('robot', ['--pythonpath', join(ROOT, 'drivers/python'), '--outputdir', dir, '--console', 'dotted', file], env) },
];

for (const x of EXPORTS) {
  test(`Recorder ${x.lang} 내보내기 — ${x.tool} 로 돌리면 가짜 표준 화면에 초록`, { skip: !has(x.tool) && `${x.tool} 없음`, timeout: 180_000 }, async () => {
    const pc = await fakeTcp(standardScreen());
    const dir = await mkdtemp(join(tmpdir(), `control-cli-rec-${x.lang}-`));
    try {
      const file = join(dir, FILES[x.lang]);
      await writeFile(file, exportTest(RECORDED, x.lang));
      const r = await x.run(dir, file, { CONTROL_CLI_GAME: `tcp://127.0.0.1:${pc.port}` });
      assert.equal(r.code, 0, r.text);
    } finally {
      pc.server.close();
    }
  });
}
