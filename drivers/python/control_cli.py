# control_cli 게임 SDK 를 Python 에서 모는 드라이버 — 명령 메서드는 protocol/commands.json 에서 만든다(npm run drivers)
"""control_cli Python 드라이버.

    from control_cli import Game
    game = Game('tcp://127.0.0.1:13100')          # PC 게임 · adb forward 뒤 폰
    game = Game('http://127.0.0.1:13101/games/<key>')  # relay — 토큰은 CONTROL_CLI_RELAY_TOKEN
    game.click('LoginButton', count=2)
    print(game.find('StatusText')['text'])

답은 게임 답 dict 그대로다. 게임이 실패로 답하면 GameError.
"""
import json
import os
import socket
import sys
import urllib.error
import urllib.request

# 게임은 10초에 스스로 답하고 relay 는 15초에 끊는다 — 그 둘이 먼저 말하게 조금 더 기다린다(TS link.ts 와 같음).
REPLY_TIMEOUT_S = 20


class GameError(Exception):
    """게임이 ok:false 로 답했거나 닿지 못했다."""


class Game:
    def __init__(self, address='tcp://127.0.0.1:13100', token=None):
        self.address = address.rstrip('/')
        self.token = token if token is not None else os.environ.get('CONTROL_CLI_RELAY_TOKEN')
        if not self.address.startswith(('tcp://', 'http://', 'https://')):
            raise ValueError(f'주소는 tcp://<호스트>:<포트> 또는 http(s)://<relay>/games/<key> 꼴입니다: {address}')

    def send(self, cmd, args=None):
        """명령 하나를 보내고 답 dict 를 돌려준다 — None 인 칸은 싣지 않는다."""
        command = {'cmd': cmd, **{k: v for k, v in (args or {}).items() if v is not None}}
        reply = self._relay(command) if self.address.startswith('http') else self._tcp(command)
        if not isinstance(reply, dict):
            raise GameError(f'게임 답이 JSON 객체가 아닙니다: {str(reply)[:200]}')
        if reply.get('ok') is not True:
            raise GameError(reply.get('error') or f'게임이 실패로 답했습니다: {json.dumps(reply, ensure_ascii=False)}')
        return reply

    # 명령마다 새로 잇는다 — 한 줄 쓰고 한 줄 읽는다.
    def _tcp(self, command):
        host, _, port = self.address[len('tcp://'):].rpartition(':')
        try:
            with socket.create_connection((host, int(port)), timeout=REPLY_TIMEOUT_S) as s:
                s.sendall((json.dumps(command, ensure_ascii=False) + '\n').encode())
                buf = b''
                while b'\n' not in buf:
                    chunk = s.recv(65536)
                    if not chunk:
                        raise GameError(f'게임이 답 없이 연결을 닫았습니다 — 게임이 포트 {port} 를 여나요?')
                    buf += chunk
        except OSError as e:
            raise GameError(f'게임 포트 {port} 에 붙지 못했습니다 — QA 빌드가 켜져 있나요? ({e})') from e
        return json.loads(buf.split(b'\n', 1)[0])

    def _relay(self, command):
        headers = {'Content-Type': 'application/json', **({'Authorization': f'Bearer {self.token}'} if self.token else {})}
        req = urllib.request.Request(f'{self.address}/command', json.dumps(command).encode(), headers, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=REPLY_TIMEOUT_S) as res:
                return json.load(res).get('value')
        except urllib.error.HTTPError as e:
            try:
                message = json.load(e).get('value', {}).get('message')
            except ValueError:
                message = None
            raise GameError(message or f'relay 가 게임 명령을 HTTP {e.code} 로 거절했습니다') from e
        except urllib.error.URLError as e:
            raise GameError(f'relay {self.address} 에 닿지 못했습니다 ({e.reason})') from e

    # ── 생성: protocol/commands.json (npm run drivers) ──
    def ping(self):
        """게임 답 · 엔진 · SDK 판 · 할 수 있는 명령과 기능(caps)
        """
        return self.send('ping')

    def tree(self):
        """켜진 오브젝트 트리 · 장면 이름 · 화면 크기
        """
        return self.send('tree')

    def find(self, target, *, inactive=None, camera=None):
        """주소의 오브젝트 — 없으면 found:false, 여럿이 맞으면 실패. 답의 x · y 는 누를 자리, rect [x, y, w, h] 는 화면 사각형, screen 은 화면 크기(모두 픽셀 · 왼쪽 아래 0,0)

        target: 주소 — 이름(하나뿐일 때) · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자
        inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        """
        return self.send('find', {'target': target, 'inactive': inactive, 'camera': camera})

    def click(self, target, *, camera=None, count=None, interval=None):
        """가운데를 가짜 터치로 누른다 — 게임이 처리한 뒤 답한다

        target: 주소 — 이름(하나뿐일 때) · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        count: 누르는 횟수(기본 1) — 2 면 두 번 누르기
        interval: 누르기 사이 초(기본 0.1)
        """
        return self.send('click', {'target': target, 'camera': camera, 'count': count, 'interval': interval})

    def drag(self, target, to, *, camera=None, via=None, duration=None):
        """앞 자리에서 via 를 차례로 지나 뒤 자리로 끈다 — 마디마다 적어도 10프레임

        target: 끌 오브젝트 주소
        to: 놓을 자리 주소
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        via: 사이에 지날 자리 주소들
        duration: 처음부터 끝까지 걸리는 초(0~8, 기본 0 — 마디마다 10프레임)
        """
        return self.send('drag', {'target': target, 'to': to, 'camera': camera, 'via': via, 'duration': duration})

    def type(self, target, text):
        """입력칸에 글자를 넣는다 — 그 칸의 글자 수 · 거르기를 키로 칠 때의 차례로

        target: 입력칸 주소
        text: 넣을 글자
        """
        return self.send('type', {'target': target, 'text': text})

    def get(self, target, prop, *, inactive=None):
        """컴포넌트 칸 값을 읽는다 — UI Toolkit 요소는 요소 칸(value · text · layout.height)을 바로

        target: 오브젝트 주소
        prop: 컴포넌트.칸[.칸…] — Transform.position, UI Toolkit 요소는 칸[.칸…]
        inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
        """
        return self.send('get', {'target': target, 'prop': prop, 'inactive': inactive})

    def tap(self, x, y, *, count=None, interval=None):
        """좌표를 누른다(왼쪽 아래가 0,0) — 살펴볼 때만

        x: 가로 픽셀
        y: 세로 픽셀
        count: 누르는 횟수(기본 1)
        interval: 누르기 사이 초(기본 0.1)
        """
        return self.send('tap', {'x': x, 'y': y, 'count': count, 'interval': interval})

    def key(self, key, *, duration=None, power=None):
        """키 누르기 — duration 동안(기본 한 프레임) 누르고 뗀다. A+LeftShift 처럼 + 로 여럿을 함께

        key: KeyCode 이름 — Escape · Space · Return · I · Alpha1 · Mouse0 · JoystickButton0, 여럿은 A+LeftShift
        duration: 누르고 있는 초(0~8, 기본 0 — 한 프레임)
        power: 세기 -1~1(기본 1) — GetAxis 값 · JoystickButton16~19 는 스틱 값
        """
        return self.send('key', {'key': key, 'duration': duration, 'power': power})

    def screenshot(self, *, format=None):
        """게임이 프레임 끝에서 찍은 화면(JPEG · PNG base64)

        format: jpg(기본 · 작다) 또는 png(무손실) — jpg · png
        """
        return self.send('screenshot', {'format': format})

    def errors(self, *, since=None):
        """게임 예외 · 에러 로그(최근 200개)

        since: 받아 둔 last — 그 번호 뒤만
        """
        return self.send('errors', {'since': since})

    def layout(self, *, target=None):
        """누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치는지

        target: 이 오브젝트 아래만 본다
        """
        return self.send('layout', {'target': target})

    def call(self, target, method, *, args=None, inactive=None):
        """컴포넌트 메서드를 부르고 돌려준 값을 준다 — 인자 수가 맞고 글자를 다 바꿀 수 있는 첫 꼴

        target: 오브젝트 주소
        method: 컴포넌트.메서드 — PlayerController.Jump
        args: 인자 — 글자로 보내면 SDK 가 메서드 칸 타입으로 바꾼다('2' · 'true' · '[0,1,0]' · 열거 이름)
        inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
        """
        return self.send('call', {'target': target, 'method': method, 'args': args, 'inactive': inactive})

    def set(self, target, prop, value, *, inactive=None):
        """컴포넌트 칸 값을 쓰고 다시 읽은 값을 준다

        target: 오브젝트 주소
        prop: 컴포넌트.칸[.칸…] — Transform.position.y
        value: get 이 주는 꼴의 글자 — '2.5' · 'true' · '[0,1,0]' · 열거 이름
        inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
        """
        return self.send('set', {'target': target, 'prop': prop, 'value': value, 'inactive': inactive})

    def static_call(self, method, *, args=None):
        """static 메서드를 부르고 돌려준 값을 준다

        method: 타입.메서드 — 전체 이름(Game.Cheats.AddGold) 또는 하나뿐인 짧은 이름
        args: 인자 — call 과 같다
        """
        return self.send('static-call', {'method': method, 'args': args})

    def static_get(self, prop):
        """static 칸 값을 읽는다

        prop: 타입.칸[.칸…] — UnityEngine.Time.timeScale
        """
        return self.send('static-get', {'prop': prop})

    def static_set(self, prop, value):
        """static 칸 값을 쓰고 다시 읽은 값을 준다

        prop: 타입.칸[.칸…]
        value: set 과 같은 꼴의 글자
        """
        return self.send('static-set', {'prop': prop, 'value': value})

    def pref_get(self, key, *, type=None):
        """저장 값(PlayerPrefs) 하나 — 없으면 found:false

        key: 키
        type: 넣을 때의 타입(기본 string) — string · int · float
        """
        return self.send('pref-get', {'key': key, 'type': type})

    def pref_set(self, key, value, *, type=None):
        """저장 값을 넣고 바로 디스크에 쓴다

        key: 키
        value: 값 — int · float 도 글자로('3' · '0.5')
        type: 타입(기본 string) — string · int · float
        """
        return self.send('pref-set', {'key': key, 'value': value, 'type': type})

    def pref_delete(self, key):
        """저장 값 키 하나를 지운다

        key: 키
        """
        return self.send('pref-delete', {'key': key})

    def pref_clear(self):
        """저장 값을 다 지운다
        """
        return self.send('pref-clear')

    def timescale_get(self):
        """시간 배율(1 이 보통 · 0 은 멈춤)
        """
        return self.send('timescale-get')

    def timescale_set(self, scale):
        """시간 배율을 바꾼다

        scale: 0~100 — 0 은 멈춤, 2 는 두 배 빠르게
        """
        return self.send('timescale-set', {'scale': scale})

    def scenes(self):
        """지금 장면 · 열린 장면 목록 · 장면이 열리고 닫힌 수
        """
        return self.send('scenes')

    def scene_load(self, name, *, mode=None):
        """빌드에 넣은 장면을 열기 시작한다 — 다 열렸는지는 scenes 로 본다

        name: 장면 이름 또는 경로(Assets/Scenes/Shop.unity)
        mode: single 은 지금 장면을 닫고(기본), add 는 위에 더한다 — single · add
        """
        return self.send('scene-load', {'name': name, 'mode': mode})

    def scene_unload(self, name):
        """열린 장면 하나를 닫기 시작한다 — 마지막 장면은 못 닫는다

        name: 장면 이름
        """
        return self.send('scene-unload', {'name': name})

    def find_all(self, target, *, inactive=None, camera=None):
        """주소에 맞는 것 전부 — find 와 같은 꼴의 목록, 없으면 빈 목록

        target: 주소 — 이름 · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자
        inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        """
        return self.send('find-all', {'target': target, 'inactive': inactive, 'camera': camera})

    def find_at(self, x, y, *, camera=None):
        """화면 좌표(왼쪽 아래 0,0)의 맨 위 — UI Toolkit · uGUI · 물리 차례, 없으면 found:false

        x: 가로 픽셀
        y: 세로 픽셀
        camera: 물리 raycast 를 쏠 카메라 오브젝트 주소(기본 Camera.main)
        """
        return self.send('find-at', {'x': x, 'y': y, 'camera': camera})

    def components(self, target, *, inactive=None):
        """붙은 컴포넌트 이름 · 전체 타입 이름

        target: 오브젝트 주소
        inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
        """
        return self.send('components', {'target': target, 'inactive': inactive})

    def members(self, target, component, *, inactive=None):
        """컴포넌트의 필드 · 속성(타입 · 값) · 메서드(인자 타입) — Unity 부모 칸은 뺀다

        target: 오브젝트 주소
        component: 컴포넌트 타입 이름 또는 전체 이름 — TouchProbe
        inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
        """
        return self.send('members', {'target': target, 'component': component, 'inactive': inactive})

    def text_set(self, target, text, *, inactive=None):
        """글자 컴포넌트(Text · TMP · UI Toolkit Label/Button)의 글자를 바꾸고 다시 읽은 글자를 준다 — 입력칸은 type

        target: 글자 오브젝트 주소
        text: 넣을 글자
        inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
        """
        return self.send('text-set', {'target': target, 'text': text, 'inactive': inactive})

    def touch_down(self, *, target=None, x=None, y=None, camera=None):
        """손가락 하나를 눌러 둔다 — 답의 finger(10~19)로 touch-move · touch-up

        target: 누를 오브젝트 주소 — 없으면 x · y
        x: 가로 픽셀(왼쪽 0) — target 이 없을 때
        y: 세로 픽셀(아래 0) — target 이 없을 때
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        """
        return self.send('touch-down', {'target': target, 'x': x, 'y': y, 'camera': camera})

    def touch_move(self, finger, *, target=None, x=None, y=None, camera=None):
        """눌러 둔 손가락을 옮긴다(한 프레임에)

        finger: touch-down 이 준 번호
        target: 옮길 자리 오브젝트 주소 — 없으면 x · y
        x: 가로 픽셀 — target 이 없을 때
        y: 세로 픽셀 — target 이 없을 때
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        """
        return self.send('touch-move', {'finger': finger, 'target': target, 'x': x, 'y': y, 'camera': camera})

    def touch_up(self, finger):
        """눌러 둔 손가락을 뗀다

        finger: touch-down 이 준 번호
        """
        return self.send('touch-up', {'finger': finger})

    def swipe(self, points, *, duration=None):
        """좌표로 끌기 — 한 손가락이 points 를 차례로 지난다(살펴볼 때 · 케이스는 drag)

        points: "x,y" 글자 둘 이상 — ["540,400", "540,900"]
        duration: 처음부터 끝까지 걸리는 초(0~8, 기본 0 — 마디마다 10프레임)
        """
        return self.send('swipe', {'points': points, 'duration': duration})

    def long_press(self, *, target=None, x=None, y=None, camera=None, duration=None):
        """길게 누르기 — duration 초 눌렀다 뗀다

        target: 누를 오브젝트 주소 — 없으면 x · y
        x: 가로 픽셀 — target 이 없을 때
        y: 세로 픽셀 — target 이 없을 때
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        duration: 누르고 있는 초(0~8, 기본 1)
        """
        return self.send('long-press', {'target': target, 'x': x, 'y': y, 'camera': camera, 'duration': duration})

    def mouse_move(self, *, target=None, x=None, y=None, camera=None, duration=None):
        """가짜 마우스를 옮긴다 — hover(Pointer Enter/Exit). 단추는 key Mouse0~4, 끄기는 input-reset

        target: 옮길 자리 오브젝트 주소 — 없으면 x · y
        x: 가로 픽셀 — target 이 없을 때
        y: 세로 픽셀 — target 이 없을 때
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        duration: 옮기는 초(0~8, 기본 0 — 한 번에)
        """
        return self.send('mouse-move', {'target': target, 'x': x, 'y': y, 'camera': camera, 'duration': duration})

    def scroll(self, dy, *, dx=None, target=None, x=None, y=None, camera=None, duration=None):
        """마우스 바퀴 — 자리를 주면 먼저 그리로 옮긴다(폰은 자리를 준다)

        dy: 세로 바퀴 칸(위가 +, 옛 Input mouseScrollDelta 꼴)
        dx: 가로 바퀴 칸(오른쪽이 +)
        target: 바퀴를 굴릴 오브젝트 주소 — 없으면 x · y, 둘 다 없으면 지금 마우스 자리
        x: 가로 픽셀
        y: 세로 픽셀
        camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
        duration: 나눠 굴리는 초(0~8, 기본 0 — 한 프레임)
        """
        return self.send('scroll', {'dy': dy, 'dx': dx, 'target': target, 'x': x, 'y': y, 'camera': camera, 'duration': duration})

    def key_down(self, key, *, power=None):
        """키를 눌러 둔다 — key-up · input-reset 까지. A+LeftShift 처럼 여럿

        key: KeyCode 이름 — 여럿은 A+LeftShift
        power: 세기 -1~1(기본 1) — GetAxis 값 · JoystickButton16~19 는 스틱 값
        """
        return self.send('key-down', {'key': key, 'power': power})

    def key_up(self, key):
        """눌러 둔 키를 뗀다

        key: KeyCode 이름 — 여럿은 A+LeftShift
        """
        return self.send('key-up', {'key': key})

    def tilt(self, x, y, z, *, duration=None):
        """기울이기 — duration 동안 가속도(Input.acceleration · Accelerometer)를 대신한다

        x: 가속도 x(g)
        y: 가속도 y(g)
        z: 가속도 z(g)
        duration: 대신하는 초(0~8, 기본 0 — 한 프레임)
        """
        return self.send('tilt', {'x': x, 'y': y, 'z': z, 'duration': duration})

    def pointer(self, target, event):
        """GameObject 하나에 Pointer 이벤트를 바로 보낸다(EventSystem 처리기 — 부모로 안 올린다)

        target: GameObject 주소(UI Toolkit 요소는 안 된다)
        event: down · up · enter · exit — down · up · enter · exit
        """
        return self.send('pointer', {'target': target, 'event': event})

    def input_reset(self):
        """가짜 입력을 다 거둔다 — 눌러 둔 손가락 · 키 · 가짜 마우스 · 기울기
        """
        return self.send('input-reset')

    def logs(self, *, since=None):
        """게임 로그 전부(Log · Warning · Error · Assert · Exception, 최근 500개) — 40자 넘는 영숫자 토막(토큰)은 ***

        since: 받아 둔 last — 그 번호 뒤만
        """
        return self.send('logs', {'since': since})

    def events(self, *, since=None):
        """게임 알림(최근 200개) — scene.loaded · scene.unloaded · game.paused · game.resumed

        since: 받아 둔 last — 그 번호 뒤만
        """
        return self.send('events', {'since': since})

    def sdk_log(self, on):
        """켜면 SDK 가 받은 명령마다 「[ControlCli] click LoginButton — 성공」 한 줄을 게임 로그에 적는다(입력 글자 · 값은 ***). 기본 꺼짐 · 게임을 다시 켜면 꺼짐

        on: true 켜기 · false 끄기
        """
        return self.send('sdk-log', {'on': on})

    # ── 생성 끝 ──


def bridge(game):
    """conform --driver 의 다리 — stdin 명령 한 줄을 이 드라이버 메서드로 보내고 답을 stdout 한 줄로."""
    for line in sys.stdin:
        command = json.loads(line)
        name = command.pop('cmd').replace('-', '_')
        try:
            reply = getattr(game, name)(**command)
        except (GameError, TypeError, AttributeError) as e:
            reply = {'ok': False, 'error': str(e)}
        sys.stdout.write(json.dumps(reply, ensure_ascii=False) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    if sys.argv[1:] != ['bridge']:
        sys.exit('python3 control_cli.py bridge — CONTROL_CLI_GAME 주소의 게임으로 stdin 명령을 보낸다(control-cli conform --driver)')
    bridge(Game(os.environ.get('CONTROL_CLI_GAME', 'tcp://127.0.0.1:13100')))
