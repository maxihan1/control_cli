#!/usr/bin/env node
// control-cli 명령줄 입구 — 찍을 글은 cli.ts 가 만든다
import { execFileSync } from 'node:child_process';

import { run } from './cli.js';

// 팜 토큰 — --token · PLATFORM_APPIUM_TOKEN 이 없으면 macOS Keychain 의 control-cli-farm(사용자가 한 번 넣는다).
// 세션마다 붙여 넣지 않게 한다. 테스트는 CONTROL_CLI_KEYCHAIN=0 으로 끈다(진짜 토큰이 가짜 팜으로 가지 않게).
function keychainToken(env: NodeJS.ProcessEnv): string | undefined {
  if (process.platform !== 'darwin' || env.PLATFORM_APPIUM_TOKEN || env.CONTROL_CLI_KEYCHAIN === '0') return undefined;
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'control-cli-farm', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined; // 항목이 없다 — 토큰 없이 간다(팜이 401 로 알린다)
  }
}

const token = keychainToken(process.env);
run(process.argv.slice(2), { env: token ? { ...process.env, PLATFORM_APPIUM_TOKEN: token } : process.env, dir: '.control-cli' }).then(
  (out) => {
    if (out) console.log(out);
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  },
);
