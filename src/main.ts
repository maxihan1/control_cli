#!/usr/bin/env node
// control-cli 명령줄 입구 — 찍을 글은 cli.ts 가 만든다
import { execFileSync } from 'node:child_process';

import { run } from './cli.js';

// 팜 · relay 토큰 — 환경 변수가 없으면 macOS Keychain(사용자가 한 번 넣는다). 테스트는 CONTROL_CLI_KEYCHAIN=0 으로 끈다(진짜 토큰이 가짜로 가지 않게).
function keychain(env: NodeJS.ProcessEnv, name: string, service: string): string | undefined {
  if (process.platform !== 'darwin' || env[name] || env.CONTROL_CLI_KEYCHAIN === '0') return undefined;
  try {
    return execFileSync('security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined; // 항목이 없다 — 토큰 없이 간다(팜 · relay 가 401 · 403 으로 알린다)
  }
}

const env = { ...process.env };
for (const [name, service] of [['PLATFORM_APPIUM_TOKEN', 'control-cli-farm'], ['CONTROL_CLI_RELAY_TOKEN', 'control-cli-relay']]) {
  const token = keychain(process.env, name, service);
  if (token) env[name] = token;
}
run(process.argv.slice(2), { env, dir: '.control-cli' }).then(
  (out) => {
    if (out) console.log(out);
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  },
);
