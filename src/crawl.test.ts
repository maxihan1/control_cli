// 창 훑기를 가짜 HUD 에 돌려 새 창 찍기 · 닫기 · 위험 버튼 건너뛰기 · 대표 슬롯 · 상한을 본다
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { connect } from './appium.js';
import { crawl, type WindowRecord } from './crawl.js';
import { button, fakeFarm, FakeGame, node, type FakeNode } from './fake-game.js';
import { Game, SETTLE } from './game.js';

Object.assign(SETTLE, { maxMs: 20, stepMs: 5 });

function hud(): FakeGame {
  const layer = node('PanelLayer', {}, []);
  const add = (n: FakeNode) => () => void layer.children!.push(n);
  const remove = (n: FakeNode) => () => void layer.children!.splice(layer.children!.indexOf(n), 1);
  const confirm: FakeNode = node('ConfirmPopup', {}, [node('Msg', { text: '살까요?' })]);
  confirm.children!.push(button('CancelButton', '취소', remove(confirm)));
  const shop: FakeNode = node('ShopPanel', {}, [node('Title', { text: '상점' }), button('BuyButton', '구매', add(confirm))]);
  shop.children!.push(button('CloseButton', '닫기', remove(shop)));
  const tip: FakeNode = node('ItemTip', {}, [node('Name', { text: '검' })]);
  tip.children!.push(button('CloseButton', '닫기', remove(tip)));
  const inventory = node('InventoryPanel', {}, [node('Grid', {}, [button('Slot', '검', add(tip)), button('Slot', '방패', add(tip))])]);
  const game = new FakeGame([
    node('HudCanvas', {}, [
      layer,
      button('ShopButton', '상점', add(shop)),
      button('InvenButton', '가방', add(inventory)),
      button('LogoutButton', '로그아웃', () => assert.fail('로그아웃을 눌렀다')),
      button('NoopButton', '아무것도'),
    ]),
  ], 'World');
  game.onBack = () => {
    const i = layer.children!.indexOf(inventory);
    if (i >= 0) layer.children!.splice(i, 1);
  };
  return game;
}

const gameOf = (fake: FakeGame) => new Game(async (c) => fake.handle(c));

test('버튼을 하나씩 눌러 새 창을 찍고 닫는다 — 창 안은 한 단계 더 · 로그아웃 · 둘째 슬롯은 안 누른다', async () => {
  const fake = hud();
  const farm = await fakeFarm(fake);
  const out = await mkdtemp(join(tmpdir(), 'crawl-'));
  try {
    const summary = await crawl(gameOf(fake), { back: { conn: connect(farm.url), sessionId: 'S1' }, out, exclude: [] });
    assert.match(summary, /- 창 5개 · 누른 버튼 5개/);
    assert.match(summary, /- 멈춘 까닭: 끝까지 훑음/);
    const list = JSON.parse(await readFile(join(out, 'list.json'), 'utf8')) as WindowRecord[];
    assert.deepEqual(
      list.map((r) => [r.주소, r.이름, r.연곳 && `${r.연곳.창} ${r.연곳.버튼} ${r.연곳.글자}`]),
      [
        ['scene:World', 'World', null],
        ['/HudCanvas/PanelLayer/ShopPanel', '상점', 'scene:World ShopButton 상점'],
        ['/HudCanvas/PanelLayer/ConfirmPopup', 'ConfirmPopup', '/HudCanvas/PanelLayer/ShopPanel BuyButton 구매'],
        ['/HudCanvas/PanelLayer/InventoryPanel', 'InventoryPanel', 'scene:World InvenButton 가방'],
        ['/HudCanvas/PanelLayer/ItemTip', 'ItemTip', '/HudCanvas/PanelLayer/InventoryPanel /HudCanvas/PanelLayer/InventoryPanel/Grid/Slot[0] 검'],
      ],
    );
    assert.equal(await readFile(join(out, '002.yml'), 'utf8'), '# /HudCanvas/PanelLayer/ShopPanel\n# 연 곳: scene:World 의 ShopButton 「상점」\n- ShopPanel\n  - Text Title "상점"\n  - Button BuyButton\n    - Text Text "구매"\n  - Button CloseButton\n    - Text Text "닫기"\n');
    assert.ok(!fake.clicks.some((p) => p.includes('Slot[1]')));
    // 다 닫고 처음 화면으로 돌아왔다
    assert.equal(fake.roots[0].children![0].children!.length, 0);
    assert.ok(farm.seen.includes('POST /wd/hub/session/S1/back'));
  } finally {
    farm.server.close();
  }
});

test('창 상한에서 멈추고 열어 둔 창은 닫는다', async () => {
  const fake = hud();
  const out = await mkdtemp(join(tmpdir(), 'crawl-'));
  assert.match(await crawl(gameOf(fake), { out, exclude: [], maxWindows: 2 }), /- 창 2개 · 누른 버튼 1개 · \d+초\n- 멈춘 까닭: 창 상한 2개/);
  assert.equal(fake.roots[0].children![0].children!.length, 0);
});

test('--exclude 에 맞는 버튼은 안 누르고, 뒤로 키 없이 못 닫는 창에서 멈춘다', async () => {
  const fake = hud();
  const out = await mkdtemp(join(tmpdir(), 'crawl-'));
  assert.match(await crawl(gameOf(fake), { out, exclude: ['/상점/'] }), /멈춘 까닭: scene:World 의 InvenButton 뒤 화면을 되돌리지 못함/);
  assert.ok(!fake.clicks.includes('/HudCanvas/ShopButton'));
});
