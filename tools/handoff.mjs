// 개발사에 파일로 넘길 zip 을 만든다 — instrument 입구(dist/main.js · instrument.js)와 sdk/unity 만. README · 테스트 · 주석 · 저장소 주소 · 나머지 CLI 는 없다 (docs/sdk-integration.md)
// 개발사에는 Unity 만 받는다(사용자 2026-11-17) — Godot SDK 는 싣지 않는다.
// node tools/handoff.mjs [나갈 파일] — 기본 ./QAhub.zip. 풀면 QAhub/ 폴더 하나, 받은 쪽은 node QAhub/dist/main.js 로 돌린다
// 개발사에는 QA Hub 라는 이름만 보인다(사용자 2026-11-17) — zip · 폴더 · package.json 이름에 control-cli 를 쓰지 않는다.
// npm tarball 로 넘기지 않는다 — npx --package=./control-cli.tgz 는 상대 경로를 현재 폴더가 아닌 곳에서 풀어 「파일 없음」으로 실패한다(npm 10.9.2).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? 'QAhub.zip');
const work = mkdtempSync(join(tmpdir(), 'control-cli-handoff-'));
const stage = join(work, 'QAhub');

execFileSync('npx', ['tsc', '--removeComments', '--outDir', join(stage, 'dist')], { cwd: root, stdio: 'inherit' });
// 개발사는 instrument 만 쓴다 — 입구는 handoff-main.js 를 main.js 로(가이드의 node QAhub/dist/main.js 그대로), 나머지 CLI 는 싣지 않는다.
const dist = join(stage, 'dist');
for (const f of readdirSync(dist)) if (!['handoff-main.js', 'instrument.js'].includes(f)) rmSync(join(dist, f), { recursive: true });
renameSync(join(dist, 'handoff-main.js'), join(dist, 'main.js'));
for (const name of [join('sdk', 'unity'), 'LICENSE']) cpSync(join(root, name), join(stage, name), { recursive: true });
// repository 가 없으면 CLI 가 저장소를 몰라 실린 SDK 만 넣는다(src/instrument.ts packageUrl).
const { scripts, devDependencies, repository, files, description, bin, exports, ...pkg } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(join(stage, 'package.json'), JSON.stringify({ ...pkg, name: 'qahub' }, null, 2) + '\n');

// 저장소를 가리키는 글자가 하나라도 남으면 넘기지 않는다.
const leaks = readdirSync(stage, { recursive: true, encoding: 'utf8' }).filter((f) => {
  const path = join(stage, f);
  return statSync(path).isFile() && /github\.com|control_cli\.git/.test(readFileSync(path, 'utf8'));
});
if (leaks.length > 0) throw new Error(`저장소 주소가 남았습니다: ${leaks.join(', ')}`);

rmSync(out, { force: true });
mkdirSync(dirname(out), { recursive: true });
execFileSync('zip', ['-rqX', out, 'QAhub'], { cwd: work });
rmSync(work, { recursive: true });
console.log(out);
