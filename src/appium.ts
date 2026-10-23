// Appium(디바이스 팜 입구 또는 내 컴퓨터) 에 W3C 요청을 보내는 얇은 클라이언트 — 게임 설치 · 실행 · 스크린샷 · 폰 잡기
export interface Conn {
  base: string;
  headers: Record<string, string>;
}

// 팜은 개인 토큰을 Bearer 로 받는다(Devicefarm 안내서 4절)
export function connect(url: string, token?: string): Conn {
  return { base: url.replace(/\/+$/, ''), headers: token ? { Authorization: `Bearer ${token}` } : {} };
}

// 잡기 · 게임 명령 주소는 Appium 주소에서 /wd/hub 를 뗀 곳에 있다(Devicefarm 안내서 4절 · 12절)
export const farmOf = (c: Conn): Conn => ({ ...c, base: c.base.replace(/\/wd\/hub$/, '') });

// 첫 연결은 APK 설치까지 해서 오래 걸린다 — 게임 APK 는 앱보다 크다.
const TIMEOUT_MS = 180_000;

export async function call(c: Conn, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${c.base}${path}`, {
    method,
    headers: { ...c.headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json: unknown = await res.json().catch(() => null);
  // W3C 는 { value } 로 싸서 주고, 팜의 잡기 주소는 { held } · { refused } 를 그대로 준다
  const v = json !== null && typeof json === 'object' && 'value' in json ? json.value : json;
  if (!res.ok) {
    const e = (v ?? {}) as { message?: string; refused?: string };
    const why = e.message ?? e.refused ?? '';
    throw new Error(`${c.base} 이 HTTP ${res.status} 로 답했습니다${why === '' ? '' : `: ${why}`}`);
  }
  return v;
}

// udid 가 없으면 Appium 이 하나뿐인 폰을 고른다(USB)
export function capabilities(app: string, udid?: string): Record<string, unknown> {
  return {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:app': app,
    ...(udid ? { 'appium:udid': udid } : {}),
    // 기본 60초면 AI 가 다음 명령을 고르는 사이 세션이 끊긴다
    'appium:newCommandTimeout': 300,
  };
}

export async function openSession(c: Conn, app: string, udid?: string): Promise<string> {
  const v = (await call(c, 'POST', '/session', { capabilities: { alwaysMatch: capabilities(app, udid) } })) as { sessionId?: string } | null;
  if (!v?.sessionId) throw new Error('Appium 이 세션 번호를 주지 않았습니다');
  return v.sessionId;
}

export async function screenshot(c: Conn, sessionId: string): Promise<Buffer> {
  const b64 = await call(c, 'GET', `/session/${sessionId}/screenshot`);
  if (typeof b64 !== 'string') throw new Error('Appium 이 스크린샷을 주지 않았습니다');
  return Buffer.from(b64, 'base64');
}

/** 폰의 뒤로 키 — 닫기 버튼이 없는 창을 닫을 때 */
export const back = (c: Conn, sessionId: string) => call(c, 'POST', `/session/${sessionId}/back`, {});
