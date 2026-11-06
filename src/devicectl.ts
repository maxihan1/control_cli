// Xcode devicectl 로 USB iPhone 에 서명된 .app 을 깔고 켜고 끈다 — Xcode 15+ · iOS 17+ (Appium 없이)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 표 출력 대신 --json-output 파일을 읽는다.
function devicectl(args: string[]): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'control-cli-devicectl-'));
  const out = join(dir, 'out.json');
  try {
    execFileSync('xcrun', ['devicectl', ...args, '--quiet', '--json-output', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    return JSON.parse(readFileSync(out, 'utf8'));
  } catch (e) {
    const why = (e as { stderr?: Buffer }).stderr?.toString().trim() || (e instanceof Error ? e.message : String(e));
    throw new Error(`devicectl ${args.slice(0, 3).join(' ')} 실패 — Xcode 15+ · iOS 17+ · 폰의 개발자 모드가 필요합니다 (${why})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function bundleId(app: string): string {
  return execFileSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', join(app, 'Info.plist')], { encoding: 'utf8' }).trim();
}

/** 깔고 켠다 — 이미 켜져 있으면 끄고 다시 켠다. pid 는 close 가 끌 때 쓴다 */
export function installAndLaunch(udid: string, app: string): { bundle: string; pid?: number } {
  const bundle = bundleId(app);
  devicectl(['device', 'install', 'app', '--device', udid, app]);
  const launched = devicectl(['device', 'process', 'launch', '--device', udid, '--terminate-existing', bundle]) as { result?: { process?: { processIdentifier?: number } } };
  return { bundle, pid: launched.result?.process?.processIdentifier };
}

export function terminate(udid: string, pid: number): void {
  devicectl(['device', 'process', 'terminate', '--device', udid, '--pid', String(pid)]);
}
