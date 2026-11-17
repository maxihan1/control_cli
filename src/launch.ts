// PC 게임을 띄우고 끈다 — open --pc --app 과 라이브러리(QA Hub kit)가 같이 쓴다
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** 게임을 띄우고 프로세스 번호를 돌려준다 — macOS .app 은 Contents/MacOS 안 실행 파일을 바로 띄워야 번호를 잡아 stop 이 끌 수 있다 */
export function launch(app: string): number {
  // 끝의 / 는 떼고 본다(셸이 폴더 이름 뒤에 붙인다) — Windows 는 \ 도.
  let exe = resolve(app.replace(process.platform === 'win32' ? /[\\/]+$/ : /\/+$/, ''));
  if (exe.endsWith('.app')) {
    const dir = join(exe, 'Contents', 'MacOS');
    const files = existsSync(dir) ? readdirSync(dir) : [];
    if (files.length !== 1) throw new Error(`${dir} 에서 실행 파일 하나를 찾지 못했습니다(${files.join(', ') || '없음'})`);
    exe = join(dir, files[0]);
  }
  if (!existsSync(exe)) throw new Error(`게임 실행 파일이 없습니다: ${exe}`);
  // 작업 폴더는 실행 파일 폴더 — 탐색기에서 두 번 눌러 띄운 것과 같게(옆 파일을 상대 경로로 읽는 게임).
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', cwd: dirname(exe), windowsHide: true });
  // 띄우기 실패는 나중에 이벤트로 온다 — 그때는 게임이 답하지 않는 것으로 드러난다.
  child.on('error', () => {});
  child.unref();
  if (child.pid === undefined) throw new Error(`${app} 을 띄우지 못했습니다`);
  return child.pid;
}

/** launch 로 띄운 게임을 끈다 — 이미 꺼졌으면 false */
export function stop(pid: number): boolean {
  try {
    process.kill(pid);
    return true;
  } catch {
    return false;
  }
}
