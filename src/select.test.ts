// 주소 풀기 · 고르기 — AltTester PATH 꼴의 일부가 지금 주소(이름 · /a/b[n])와 같은 규칙으로 도는지
import assert from 'node:assert/strict';
import test from 'node:test';

import { one, pathOf, select, steps, type View } from './select.js';

interface N { name: string; tag?: string; text?: string; components?: string[]; children?: N[] }
const n = (name: string, extra: Partial<N> = {}, children?: N[]): N => ({ name, ...extra, ...(children ? { children } : {}) });
const roots = [
  n('Canvas', { components: ['Canvas'] }, [
    n('Bag', {}, [n('Slot', {}, [n('Item', { tag: 'Loot' })]), n('Slot'), n('Slot')]),
    n('LoginButton', { components: ['Button'] }, [n('Text', { text: 'Login' })]),
    n('TmpLoginButton', { components: ['Button'] }, [n('Text', { text: 'TMP Login' })]),
  ]),
  n('Cube', { tag: 'Player' }),
];
const view: View<N> = {
  roots,
  children: (x) => x.children ?? [],
  attr: (x, k) => (k === 'name' ? [x.name] : k === 'tag' ? (x.tag ? [x.tag] : []) : k === 'text' ? (x.text === undefined ? [] : [x.text]) : k === 'component' ? (x.components ?? []) : []),
};
const paths = (target: string) => select(steps(target), view).trails.map((t) => pathOf(t, view));

test('지금 주소 — 이름 · /a/b[n] 은 뜻이 그대로다', () => {
  assert.deepEqual(paths('Item'), ['/Canvas/Bag/Slot[0]/Item']);
  assert.deepEqual(paths('/Canvas/Bag/Slot[1]'), ['/Canvas/Bag/Slot[1]']);
  assert.deepEqual(paths('Text'), ['/Canvas/LoginButton/Text', '/Canvas/TmpLoginButton/Text']);
  // 단계마다 모아 내려간다 — Slot 이 셋이어도 Item 은 하나다.
  assert.deepEqual(paths('/Canvas/Bag/Slot/Item'), ['/Canvas/Bag/Slot[0]/Item']);
});

test('조건 · 순번 꼴이 아닌 [ ] 는 이름의 일부다 — 옛 경로 규칙 그대로', () => {
  const odd: View<N> = { ...view, roots: [n('[DOTween]', {}, [n('Slot[A]'), n('Slot[A]')])] };
  const at = (t: string) => select(steps(t), odd).trails.map((x) => pathOf(x, odd));
  assert.deepEqual(at('/[DOTween]/Slot[A][1]'), ['/[DOTween]/Slot[A][1]']);
  assert.deepEqual(at('[DOTween]'), ['/[DOTween]']);
  assert.deepEqual(at('//Slot[A]'), ['/[DOTween]/Slot[A][0]', '/[DOTween]/Slot[A][1]']);
  // @ · contains( 로 시작하면 조건이라 꼴을 본다.
  assert.throws(() => steps('//*[@colour=red]'), /모르는 칸/);
});

test('// · * · 조건 · contains · 이어 붙이기 · [-1] · ..', () => {
  assert.deepEqual(paths('//*[@tag=Player]'), ['/Cube']);
  assert.deepEqual(paths('//*[@component=Button]'), ['/Canvas/LoginButton', '/Canvas/TmpLoginButton']);
  assert.deepEqual(paths("//*[@text='TMP Login']"), ['/Canvas/TmpLoginButton/Text']);
  assert.deepEqual(paths('//*[contains(@name, LoginButton)]'), ['/Canvas/LoginButton', '/Canvas/TmpLoginButton']);
  assert.deepEqual(paths('//*[@component=Button][contains(@name,Tmp)]'), ['/Canvas/TmpLoginButton']);
  assert.deepEqual(paths('//Bag/Slot[-1]'), ['/Canvas/Bag/Slot[2]']);
  assert.deepEqual(paths('//*[@text=Login]/..'), ['/Canvas/LoginButton']);
  assert.deepEqual(paths('/Canvas/Bag/Slot/..'), ['/Canvas/Bag']);
  assert.deepEqual(paths('/Cube/..'), []);
  assert.deepEqual(paths('/Canvas/*'), ['/Canvas/Bag', '/Canvas/LoginButton', '/Canvas/TmpLoginButton']);
});

test('꼴이 틀리면 까닭을 던지고, 없음 · 여럿은 하나 고르기가 갈라 말한다', () => {
  assert.throws(() => steps('//[@tag=x]'), /이름이나 \* 가 있어야 합니다/);
  assert.throws(() => steps('//*[@colour=red]'), /모르는 칸 @colour/);
  assert.throws(() => steps('//*[@tag=x'), /닫는 \] 가 없습니다/);
  assert.throws(() => steps('/a/'), /이름이나 \* 가 있어야 합니다/);
  const r = (t: string) => one(t, select(steps(t), view), true);
  assert.match(r('Nope').problem!, /^켜진 오브젝트 중에 Nope 이 없습니다$/);
  assert.equal(r('Nope').missing, true);
  assert.match(r('/Canvas/Box/Item').problem!, /\(Box 에서 끊김\)/);
  assert.match(r('Text').problem!, /^Text 이 2개라 하나를 고를 수 없습니다 — 경로로 주소를 씁니다$/);
  assert.match(r('//*[@component=Button]').problem!, /맞는 것이 2개라 하나를 고를 수 없습니다 — \[순번\] · 조건을 더하거나 find-all 로 경로를 봅니다/);
  assert.equal(r('//*[@component=Button]').missing, false);
});
