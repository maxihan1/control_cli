// 라이브러리 입구 — test_platform kit 이 CLI 를 띄우지 않고 같은 드라이버 · 두 길을 쓴다
export { Game, settled, WAIT, type Found, type GameErrors, type LayoutProblem, type Node, type TreeReply, type WaitOptions } from './game.js';
export { farmLink, tcpLink, usbLink, GAME_PORT, type Command, type Link, type Reply } from './link.js';
export { flatten, snapshot, type Entry } from './snapshot.js';
