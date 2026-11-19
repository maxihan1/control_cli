// VISION 윈도우 PC 기기(Devicefarm ADR-061)를 깔고 켜고 끈다 — CLI 와 라이브러리(QA Hub kit)가 같이 쓴다. 게임 명령은 폰과 같은 farmLink
import { call, type Conn } from './appium.js';

/** VISION 은 PC serial 을 pc-<이름> 으로 정했다(ADR-061 §3.3) */
export const isPc = (serial: string) => serial.startsWith('pc-');

const at = (serial: string, op: string) => `/api/devices/${encodeURIComponent(serial)}/${op}`;

/** zip(Unity 빌드 폴더 통째)을 깔고 VISION 이 붙인 게임 이름(exe 이름)을 돌려준다 */
export async function pcInstall(farm: Conn, serial: string, zip: Uint8Array<ArrayBuffer>): Promise<string> {
  // VISION 은 1GB 까지 받고 다 받은 뒤 풀기를 5분까지 기다린다 — JSON 만 싣는 call 대신 바이트를 그대로 보낸다.
  const res = await fetch(`${farm.base}${at(serial, 'install')}`, {
    method: 'POST',
    headers: { ...farm.headers, 'Content-Type': 'application/zip' },
    body: zip,
    signal: AbortSignal.timeout(600_000),
  });
  const json = (await res.json().catch(() => null)) as { game?: string; value?: { message?: string }; refused?: string; message?: string } | null;
  if (!res.ok) {
    const why = json?.value?.message ?? json?.message ?? json?.refused ?? '';
    throw new Error(`VISION 이 PC 게임 깔기를 HTTP ${res.status} 로 거절했습니다${why === '' ? '' : `: ${why}`}`);
  }
  if (!json?.game) throw new Error('VISION 이 깐 게임 이름을 주지 않았습니다');
  return json.game;
}

/** VISION 게임 목록의 이름으로 켠다 — 프로세스가 뜨면 답한다. SDK 준비는 게임 ping 으로 기다린다 */
export async function pcLaunch(farm: Conn, serial: string, game: string): Promise<number> {
  const v = (await call(farm, 'POST', at(serial, 'launch'), { game })) as { pid?: number } | null;
  if (typeof v?.pid !== 'number') throw new Error('VISION 이 켠 게임의 프로세스 번호를 주지 않았습니다');
  return v.pid;
}

/** VISION 이 켠 게임을 끈다 — 이미 꺼졌으면 false */
export async function pcStop(farm: Conn, serial: string): Promise<boolean> {
  const v = (await call(farm, 'POST', at(serial, 'stop'), {})) as { stopped?: boolean } | null;
  return v?.stopped === true;
}
