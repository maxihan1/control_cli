// 줄인 목록 · 주소 셈이 SDK 의 이름 · 경로 찾기와 같은지, USB 길이 JSON 한 줄을 주고받는지 본다
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import { button, node } from './fake-game.js';
import { tcpLink } from './link.js';
import { flatten, snapshot } from './snapshot.js';

test('같은 이름 형제는 [순번] 경로가 주소고, 하나뿐인 이름은 이름이 주소다', () => {
  const tree = [node('Hud', {}, [node('Grid', {}, [button('Slot', '검'), button('Slot', '방패')]), button('ShopButton', '상점')])];
  const byPath = Object.fromEntries(flatten(tree).map((e) => [e.path, e.address]));
  assert.equal(byPath['/Hud/Grid/Slot[0]'], '/Hud/Grid/Slot[0]');
  assert.equal(byPath['/Hud/Grid/Slot[1]/Text'], '/Hud/Grid/Slot[1]/Text');
  assert.equal(byPath['/Hud/ShopButton'], 'ShopButton');
});

test('글자 · 버튼 없는 외길 오브젝트는 줄에서 빠지고 갈림길만 남는다', () => {
  const { text, refs } = snapshot({
    scene: 'World',
    screen: [100, 50],
    tree: [node('Root', {}, [node('Canvas', {}, [node('Panel', {}, [node('Title', { text: '상점' }), node('Buy', { kind: 'Button', interactable: false })])])]), node('Light')],
  });
  assert.equal(text, '# 장면 World · 화면 100×50\n- Panel [ref=e1]\n  - Text Title "상점" [ref=e2]\n  - Button Buy 잠김 [ref=e3]\n');
  assert.deepEqual(refs, { e1: 'Panel', e2: 'Title', e3: 'Buy' });
});

test('USB 길은 명령을 JSON 한 줄로 보내고 답 한 줄을 받는다', async () => {
  const got: string[] = [];
  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    socket.on('data', (line: string) => {
      got.push(line);
      socket.write('{"ok":true,"app":"a"}\n');
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  try {
    const reply = await tcpLink((server.address() as AddressInfo).port)({ cmd: 'click', target: 'LoginButton' });
    assert.deepEqual(reply, { ok: true, app: 'a' });
    assert.deepEqual(got, ['{"cmd":"click","target":"LoginButton"}\n']);
  } finally {
    server.close();
  }
});
