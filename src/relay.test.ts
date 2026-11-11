// relay 가 게임 WebSocket 을 붙잡고 HTTP 명령을 번호로 넘기며, 권한 · 시간 초과 · 끊김 · 다시 붙기를 가르는지 본다
import assert from 'node:assert/strict';
import { connect as tcp, type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

import { fakeRelayGame, standardScreen } from './fake-game.js';
import { relayLink } from './link.js';
import { allowed, frame, reader, relay, RELAY, type GameInfo } from './relay.js';

Object.assign(RELAY, { replyMs: 100, pingMs: 30 });
const server = relay();
let url = '';
let port = 0;
before(async () => {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as AddressInfo).port;
  url = `http://127.0.0.1:${port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const games = async () => ((await (await fetch(`${url}/games`)).json()) as { value: GameInfo[] }).value;
const post = (key: string, body: unknown) => fetch(`${url}/games/${encodeURIComponent(key)}/command`, { method: 'POST', body: JSON.stringify(body) });
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const until = async (ok: () => Promise<boolean>) => {
  for (let i = 0; i < 200 && !(await ok()); i++) await sleep(5);
};

test('frame 을 조각내어 넣어도 reader 가 글 하나로 모은다 — 가린 frame · 126 길이 · FIN 0 이어 붙이기', () => {
  const masked = (op: number, fin: boolean, text: string) => {
    const p = Buffer.from(text);
    const m = Buffer.from([1, 2, 3, 4]);
    const b0 = (fin ? 0x80 : 0) | op;
    const head = p.length < 126 ? Buffer.from([b0, 0x80 | p.length]) : Buffer.from([b0, 0x80 | 126, p.length >> 8, p.length & 255]);
    return Buffer.concat([head, m, Buffer.from(p.map((b, i) => b ^ m[i & 3]))]);
  };
  const got: string[] = [];
  const read = reader((t) => got.push(t), () => {});
  const long = '가'.repeat(100);
  const all = Buffer.concat([masked(1, false, 'a'), masked(0, true, 'b'), masked(1, true, long)]);
  for (let i = 0; i < all.length; i += 7) read(all.subarray(i, i + 7));
  assert.deepEqual(got, ['ab', long]);
  assert.deepEqual([...frame(1, Buffer.from('hi'))], [0x81, 2, 104, 105]);
});

test('토큰 없는 relay 는 이 컴퓨터 요청만, 토큰 relay 는 늘 토큰을 본다(터널은 127.0.0.1 로 넘긴다)', () => {
  assert.equal(allowed('127.0.0.1', undefined, undefined), undefined);
  assert.equal(allowed('::ffff:127.0.0.1', undefined, undefined), undefined);
  assert.match(allowed('192.168.0.7', undefined, undefined)!, /그 컴퓨터 안에서만/);
  assert.match(allowed('127.0.0.1', undefined, 's3cret')!, /토큰이 맞지 않습니다/);
  assert.match(allowed('127.0.0.1', 'Bearer nope', 's3cret')!, /토큰이 맞지 않습니다/);
  assert.equal(allowed('203.0.113.9', 'Bearer s3cret', 's3cret'), undefined);
});

test('붙은 게임이 목록에 나오고 명령이 번호를 달고 가서 답이 돌아온다 · 끊기면 목록에서 빠진다', async () => {
  const ws = await fakeRelayGame(standardScreen(), url);
  await until(async () => (await games()).length === 1);
  const [g] = await games();
  assert.deepEqual([g.key, g.app, g.platform, g.model], ['com.fake.game@fake-dev', 'com.fake.game', 'macOS', 'FakeBook']);
  assert.equal((await relayLink(url, {}, g.key)({ cmd: 'ping' })).app, 'com.fake.game');
  ws.close();
  await until(async () => (await games()).length === 0);
  await assert.rejects(relayLink(url, {}, g.key)({ cmd: 'ping' }), /게임 com\.fake\.game@fake-dev 이 relay 에 붙어 있지 않습니다/);
});

test('늦은 답은 번호가 달라 다음 명령의 답이 되지 않고, 명령 중 끊기면 502', async () => {
  const ws = new WebSocket(`${url.replace('http', 'ws')}/game`);
  await new Promise((ok) => (ws.onopen = ok));
  ws.send(`hello ${JSON.stringify({ app: 'slow', deviceId: 'slow-device' })}`);
  ws.onmessage = (e) => {
    const text = String(e.data);
    const id = text.slice(0, text.indexOf(' '));
    const cmd = (JSON.parse(text.slice(text.indexOf(' ') + 1)) as { cmd: string }).cmd;
    if (cmd === 'tree') setTimeout(() => ws.send(`${id} {"ok":true,"late":true}`), RELAY.replyMs * 2);
    else if (cmd === 'ping') ws.send(`${id} {"ok":true,"pong":true}`);
    else ws.close();
  };
  await until(async () => (await games()).some((g) => g.key === 'slow@slow-dev'));
  assert.equal((await post('slow@slow-dev', { cmd: 'tree' })).status, 504);
  assert.deepEqual(await (await post('slow@slow-dev', { cmd: 'ping' })).json(), { value: { ok: true, pong: true } });
  await sleep(RELAY.replyMs * 2); // 늦은 tree 답이 이때 온다 — 버려야 한다
  assert.deepEqual(await (await post('slow@slow-dev', { cmd: 'ping' })).json(), { value: { ok: true, pong: true } });
  const gone = await post('slow@slow-dev', { cmd: 'click' });
  assert.equal(gone.status, 502);
  assert.match(((await gone.json()) as { value: { message: string } }).value.message, /실행됐을 수도/);
});

test('토큰 relay 는 토큰 없는 명령을 403, 없는 게임은 404, 명령 꼴이 틀리면 400', async () => {
  const locked = relay({ token: 's3cret' });
  await new Promise<void>((ok) => locked.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(locked.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/games`)).status, 403);
    const headers = { Authorization: 'Bearer s3cret' };
    assert.equal((await fetch(`${base}/games`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/games/nope/command`, { method: 'POST', headers, body: '{"cmd":"ping"}' })).status, 404);
    assert.equal((await fetch(`${base}/games/nope/command`, { method: 'POST', headers, body: 'ping' })).status, 400);
  } finally {
    locked.close();
  }
});

test('같은 게임이 다시 붙으면 새 연결로 바꾸고, ping 에 답하지 않는 연결은 뺀다', async () => {
  const a = await fakeRelayGame(standardScreen(), url, { deviceId: 'again-01' });
  await until(async () => (await games()).some((g) => g.key === 'com.fake.game@again-01'));
  const b = await fakeRelayGame(standardScreen(), url, { deviceId: 'again-01' });
  await until(async () => a.readyState === WebSocket.CLOSED);
  assert.equal(a.readyState, WebSocket.CLOSED);
  assert.equal((await post('com.fake.game@again-01', { cmd: 'ping' })).status, 200);
  b.close();

  // hello 만 보내고 ping 에 pong 을 하지 않는 연결 — 잠든 폰. 요청과 같은 조각에 frame 을 실어 head 길도 본다.
  const raw = tcp(port, '127.0.0.1');
  raw.on('error', () => {});
  raw.write(Buffer.concat([
    Buffer.from('GET /game HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'),
    frame(1, Buffer.from('hello {"app":"mute","deviceId":"mute-dev"}')),
  ]));
  await until(async () => (await games()).some((g) => g.key === 'mute@mute-dev'));
  await until(async () => !(await games()).some((g) => g.key === 'mute@mute-dev'));
  assert.ok(!(await games()).some((g) => g.key === 'mute@mute-dev'));
  raw.destroy();
});
