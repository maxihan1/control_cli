// control_cli 게임 SDK 를 Java 에서 모는 드라이버 — 명령 메서드는 protocol/commands.json 에서 만든다(npm run drivers)
package controlcli;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * control_cli Java 드라이버 — 의존 없는 파일 하나.
 *
 * <pre>
 * var game = new ControlCli("tcp://127.0.0.1:13100");               // PC 게임 · adb forward 뒤 폰
 * var game = new ControlCli("http://127.0.0.1:13101/games/&lt;key&gt;");  // relay — 토큰은 CONTROL_CLI_RELAY_TOKEN
 * game.click("LoginButton", Map.of("count", 2));
 * String text = (String) game.find("StatusText").get("text");
 * </pre>
 *
 * 답은 게임 답 그대로(Map · List · String · Double · Boolean · null). 게임이 실패로 답하면 {@link GameException}.
 */
public class ControlCli {
    /** 게임은 10초에 스스로 답하고 relay 는 15초에 끊는다 — 그 둘이 먼저 말하게 조금 더 기다린다(TS link.ts 와 같음) */
    static final int REPLY_TIMEOUT_MS = 20_000;

    /** 게임이 ok:false 로 답했거나 닿지 못했다 */
    public static class GameException extends RuntimeException {
        public GameException(String message) { super(message); }
        public GameException(String message, Throwable cause) { super(message, cause); }
    }

    private final String address;
    private final String token;

    public ControlCli() { this("tcp://127.0.0.1:13100"); }

    public ControlCli(String address) { this(address, System.getenv("CONTROL_CLI_RELAY_TOKEN")); }

    public ControlCli(String address, String token) {
        this.address = address.replaceAll("/+$", "");
        this.token = token;
        if (!this.address.matches("^(tcp|https?)://.+"))
            throw new IllegalArgumentException("주소는 tcp://<호스트>:<포트> 또는 http(s)://<relay>/games/<key> 꼴입니다: " + address);
    }

    /** 명령 하나를 보내고 답을 돌려준다 — null 인 칸은 싣지 않는다 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> send(String cmd, Map<String, ?> args) {
        var command = new LinkedHashMap<String, Object>();
        command.put("cmd", cmd);
        args.forEach((k, v) -> { if (v != null) command.put(k, v); });
        Object reply = address.startsWith("tcp://") ? tcp(Json.write(command)) : relay(Json.write(command));
        if (!(reply instanceof Map)) throw new GameException("게임 답이 JSON 객체가 아닙니다: " + reply);
        var r = (Map<String, Object>) reply;
        if (!Boolean.TRUE.equals(r.get("ok")))
            throw new GameException(r.get("error") instanceof String e ? e : "게임이 실패로 답했습니다: " + Json.write(r));
        return r;
    }

    // 명령마다 새로 잇는다 — 한 줄 쓰고 한 줄 읽는다.
    private Object tcp(String line) {
        String hostPort = address.substring("tcp://".length());
        int colon = hostPort.lastIndexOf(':');
        int port = Integer.parseInt(hostPort.substring(colon + 1));
        String got;
        try (var s = new Socket()) {
            s.connect(new InetSocketAddress(hostPort.substring(0, colon), port), REPLY_TIMEOUT_MS);
            s.setSoTimeout(REPLY_TIMEOUT_MS);
            s.getOutputStream().write((line + "\n").getBytes(StandardCharsets.UTF_8));
            got = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8)).readLine();
        } catch (IOException e) {
            throw new GameException("게임 포트 " + port + " 에 붙지 못했습니다 — QA 빌드가 켜져 있나요? (" + e.getMessage() + ")", e);
        }
        if (got == null) throw new GameException("게임이 답 없이 연결을 닫았습니다 — 게임이 포트 " + port + " 를 여나요?");
        return Json.read(got);
    }

    // HTTP/1.1 로 고정 — 기본값은 http:// 에 h2c Upgrade 머리를 붙이고, relay(Node)는 Upgrade 요청을 WebSocket 으로 받아 끊는다.
    private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

    @SuppressWarnings("unchecked")
    private Object relay(String body) {
        var req = HttpRequest.newBuilder(URI.create(address + "/command"))
                .timeout(Duration.ofMillis(REPLY_TIMEOUT_MS))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        if (token != null && !token.isEmpty()) req.header("Authorization", "Bearer " + token);
        HttpResponse<String> res;
        try {
            res = HTTP.send(req.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new GameException("relay " + address + " 에 닿지 못했습니다 (" + e.getMessage() + ")", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GameException("relay 명령을 기다리다 끊겼습니다", e);
        }
        Object parsed;
        try {
            parsed = Json.read(res.body());
        } catch (RuntimeException e) {
            parsed = null;
        }
        Object value = parsed instanceof Map<?, ?> m ? m.get("value") : null;
        if (res.statusCode() / 100 != 2) {
            String message = value instanceof Map<?, ?> v && v.get("message") instanceof String s ? s : null;
            throw new GameException(message != null ? message : "relay 가 게임 명령을 HTTP " + res.statusCode() + " 로 거절했습니다");
        }
        return value;
    }

    // 생성 메서드가 쓴다 — 고를 칸은 아는 이름만 받는다(틀린 이름을 조용히 버리지 않게).
    private static Map<String, Object> only(Map<String, ?> options, String... names) {
        var known = Arrays.asList(names);
        var out = new LinkedHashMap<String, Object>();
        options.forEach((k, v) -> {
            if (!known.contains(k)) throw new IllegalArgumentException("모르는 칸입니다: " + k + " — 고를 수 있는 것: " + String.join(" · ", names));
            out.put(k, v);
        });
        return out;
    }

    private static Map<String, Object> fields(Map<String, ?> base, Object... kv) {
        var out = new LinkedHashMap<String, Object>(base);
        for (int i = 0; i < kv.length; i += 2) out.put((String) kv[i], kv[i + 1]);
        return out;
    }

    // dispatch 가 쓴다 — 다리로 온 JSON 칸을 메서드 인자로.
    private static String str(Map<String, Object> a, String k) { return (String) a.get(k); }
    private static double num(Map<String, Object> a, String k) { return ((Number) a.get(k)).doubleValue(); }
    private static boolean bool(Map<String, Object> a, String k) { return (Boolean) a.get(k); }
    @SuppressWarnings("unchecked")
    private static List<String> list(Map<String, Object> a, String k) { return (List<String>) a.get(k); }
    private static Map<String, Object> without(Map<String, Object> a, String... names) {
        var out = new LinkedHashMap<>(a);
        for (var n : names) out.remove(n);
        return out;
    }

    // ── 생성: protocol/commands.json (npm run drivers) ──
    /** 게임 답 · 엔진 · SDK 판 · 할 수 있는 명령과 기능(caps)
     */
    public Map<String, Object> ping() { return send("ping", fields(Map.of())); }

    /** 켜진 오브젝트 트리 · 장면 이름 · 화면 크기
     */
    public Map<String, Object> tree() { return send("tree", fields(Map.of())); }

    /** 주소의 오브젝트 — 없으면 found:false, 여럿이 맞으면 실패. 답의 x · y 는 누를 자리, rect [x, y, w, h] 는 화면 사각형, screen 은 화면 크기(모두 픽셀 · 왼쪽 아래 0,0)
     * @param target 주소 — 이름(하나뿐일 때) · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자
     * @param options 고를 칸 — inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다 / camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
     */
    public Map<String, Object> find(String target, Map<String, ?> options) { return send("find", fields(only(options, "inactive", "camera"), "target", target)); }

    public Map<String, Object> find(String target) { return find(target, Map.of()); }

    /** 가운데를 가짜 터치로 누른다 — 게임이 처리한 뒤 답한다
     * @param target 주소 — 이름(하나뿐일 때) · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자
     * @param options 고를 칸 — camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main) / count: 누르는 횟수(기본 1) — 2 면 두 번 누르기 / interval: 누르기 사이 초(기본 0.1)
     */
    public Map<String, Object> click(String target, Map<String, ?> options) { return send("click", fields(only(options, "camera", "count", "interval"), "target", target)); }

    public Map<String, Object> click(String target) { return click(target, Map.of()); }

    /** 앞 자리에서 via 를 차례로 지나 뒤 자리로 끈다 — 마디마다 적어도 10프레임
     * @param target 끌 오브젝트 주소
     * @param to 놓을 자리 주소
     * @param options 고를 칸 — camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main) / via: 사이에 지날 자리 주소들 / duration: 처음부터 끝까지 걸리는 초(0~8, 기본 0 — 마디마다 10프레임)
     */
    public Map<String, Object> drag(String target, String to, Map<String, ?> options) { return send("drag", fields(only(options, "camera", "via", "duration"), "target", target, "to", to)); }

    public Map<String, Object> drag(String target, String to) { return drag(target, to, Map.of()); }

    /** 입력칸에 글자를 넣는다 — 그 칸의 글자 수 · 거르기를 키로 칠 때의 차례로
     * @param target 입력칸 주소
     * @param text 넣을 글자
     */
    public Map<String, Object> type(String target, String text) { return send("type", fields(Map.of(), "target", target, "text", text)); }

    /** 컴포넌트 칸 값을 읽는다 — UI Toolkit 요소는 요소 칸(value · text · layout.height)을 바로
     * @param target 오브젝트 주소
     * @param prop 컴포넌트.칸[.칸…] — Transform.position, UI Toolkit 요소는 칸[.칸…]
     * @param options 고를 칸 — inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
     */
    public Map<String, Object> get(String target, String prop, Map<String, ?> options) { return send("get", fields(only(options, "inactive"), "target", target, "prop", prop)); }

    public Map<String, Object> get(String target, String prop) { return get(target, prop, Map.of()); }

    /** 좌표를 누른다(왼쪽 아래가 0,0) — 살펴볼 때만
     * @param x 가로 픽셀
     * @param y 세로 픽셀
     * @param options 고를 칸 — count: 누르는 횟수(기본 1) / interval: 누르기 사이 초(기본 0.1)
     */
    public Map<String, Object> tap(double x, double y, Map<String, ?> options) { return send("tap", fields(only(options, "count", "interval"), "x", x, "y", y)); }

    public Map<String, Object> tap(double x, double y) { return tap(x, y, Map.of()); }

    /** 키 누르기 — duration 동안(기본 한 프레임) 누르고 뗀다. A+LeftShift 처럼 + 로 여럿을 함께
     * @param key KeyCode 이름 — Escape · Space · Return · I · Alpha1 · Mouse0 · JoystickButton0, 여럿은 A+LeftShift
     * @param options 고를 칸 — duration: 누르고 있는 초(0~8, 기본 0 — 한 프레임) / power: 세기 -1~1(기본 1) — GetAxis 값 · JoystickButton16~19 는 스틱 값
     */
    public Map<String, Object> key(String key, Map<String, ?> options) { return send("key", fields(only(options, "duration", "power"), "key", key)); }

    public Map<String, Object> key(String key) { return key(key, Map.of()); }

    /** 게임이 프레임 끝에서 찍은 화면(JPEG · PNG base64)
     * @param options 고를 칸 — format: jpg(기본 · 작다) 또는 png(무손실) — jpg · png
     */
    public Map<String, Object> screenshot(Map<String, ?> options) { return send("screenshot", fields(only(options, "format"))); }

    public Map<String, Object> screenshot() { return screenshot(Map.of()); }

    /** 게임 예외 · 에러 로그(최근 200개)
     * @param options 고를 칸 — since: 받아 둔 last — 그 번호 뒤만
     */
    public Map<String, Object> errors(Map<String, ?> options) { return send("errors", fields(only(options, "since"))); }

    public Map<String, Object> errors() { return errors(Map.of()); }

    /** 누를 수 있는 UI 가 안전 영역 밖이거나 서로 겹치는지
     * @param options 고를 칸 — target: 이 오브젝트 아래만 본다
     */
    public Map<String, Object> layout(Map<String, ?> options) { return send("layout", fields(only(options, "target"))); }

    public Map<String, Object> layout() { return layout(Map.of()); }

    /** 컴포넌트 메서드를 부르고 돌려준 값을 준다 — 인자 수가 맞고 글자를 다 바꿀 수 있는 첫 꼴
     * @param target 오브젝트 주소
     * @param method 컴포넌트.메서드 — PlayerController.Jump
     * @param options 고를 칸 — args: 인자 — 글자로 보내면 SDK 가 메서드 칸 타입으로 바꾼다('2' · 'true' · '[0,1,0]' · 열거 이름) / inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
     */
    public Map<String, Object> call(String target, String method, Map<String, ?> options) { return send("call", fields(only(options, "args", "inactive"), "target", target, "method", method)); }

    public Map<String, Object> call(String target, String method) { return call(target, method, Map.of()); }

    /** 컴포넌트 칸 값을 쓰고 다시 읽은 값을 준다
     * @param target 오브젝트 주소
     * @param prop 컴포넌트.칸[.칸…] — Transform.position.y
     * @param value get 이 주는 꼴의 글자 — '2.5' · 'true' · '[0,1,0]' · 열거 이름
     * @param options 고를 칸 — inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
     */
    public Map<String, Object> set(String target, String prop, String value, Map<String, ?> options) { return send("set", fields(only(options, "inactive"), "target", target, "prop", prop, "value", value)); }

    public Map<String, Object> set(String target, String prop, String value) { return set(target, prop, value, Map.of()); }

    /** static 메서드를 부르고 돌려준 값을 준다
     * @param method 타입.메서드 — 전체 이름(Game.Cheats.AddGold) 또는 하나뿐인 짧은 이름
     * @param options 고를 칸 — args: 인자 — call 과 같다
     */
    public Map<String, Object> staticCall(String method, Map<String, ?> options) { return send("static-call", fields(only(options, "args"), "method", method)); }

    public Map<String, Object> staticCall(String method) { return staticCall(method, Map.of()); }

    /** static 칸 값을 읽는다
     * @param prop 타입.칸[.칸…] — UnityEngine.Time.timeScale
     */
    public Map<String, Object> staticGet(String prop) { return send("static-get", fields(Map.of(), "prop", prop)); }

    /** static 칸 값을 쓰고 다시 읽은 값을 준다
     * @param prop 타입.칸[.칸…]
     * @param value set 과 같은 꼴의 글자
     */
    public Map<String, Object> staticSet(String prop, String value) { return send("static-set", fields(Map.of(), "prop", prop, "value", value)); }

    /** 저장 값(PlayerPrefs) 하나 — 없으면 found:false
     * @param key 키
     * @param options 고를 칸 — type: 넣을 때의 타입(기본 string) — string · int · float
     */
    public Map<String, Object> prefGet(String key, Map<String, ?> options) { return send("pref-get", fields(only(options, "type"), "key", key)); }

    public Map<String, Object> prefGet(String key) { return prefGet(key, Map.of()); }

    /** 저장 값을 넣고 바로 디스크에 쓴다
     * @param key 키
     * @param value 값 — int · float 도 글자로('3' · '0.5')
     * @param options 고를 칸 — type: 타입(기본 string) — string · int · float
     */
    public Map<String, Object> prefSet(String key, String value, Map<String, ?> options) { return send("pref-set", fields(only(options, "type"), "key", key, "value", value)); }

    public Map<String, Object> prefSet(String key, String value) { return prefSet(key, value, Map.of()); }

    /** 저장 값 키 하나를 지운다
     * @param key 키
     */
    public Map<String, Object> prefDelete(String key) { return send("pref-delete", fields(Map.of(), "key", key)); }

    /** 저장 값을 다 지운다
     */
    public Map<String, Object> prefClear() { return send("pref-clear", fields(Map.of())); }

    /** 시간 배율(1 이 보통 · 0 은 멈춤)
     */
    public Map<String, Object> timescaleGet() { return send("timescale-get", fields(Map.of())); }

    /** 시간 배율을 바꾼다
     * @param scale 0~100 — 0 은 멈춤, 2 는 두 배 빠르게
     */
    public Map<String, Object> timescaleSet(double scale) { return send("timescale-set", fields(Map.of(), "scale", scale)); }

    /** 지금 장면 · 열린 장면 목록 · 장면이 열리고 닫힌 수
     */
    public Map<String, Object> scenes() { return send("scenes", fields(Map.of())); }

    /** 빌드에 넣은 장면을 열기 시작한다 — 다 열렸는지는 scenes 로 본다
     * @param name 장면 이름 또는 경로(Assets/Scenes/Shop.unity)
     * @param options 고를 칸 — mode: single 은 지금 장면을 닫고(기본), add 는 위에 더한다 — single · add
     */
    public Map<String, Object> sceneLoad(String name, Map<String, ?> options) { return send("scene-load", fields(only(options, "mode"), "name", name)); }

    public Map<String, Object> sceneLoad(String name) { return sceneLoad(name, Map.of()); }

    /** 열린 장면 하나를 닫기 시작한다 — 마지막 장면은 못 닫는다
     * @param name 장면 이름
     */
    public Map<String, Object> sceneUnload(String name) { return send("scene-unload", fields(Map.of(), "name", name)); }

    /** 주소에 맞는 것 전부 — find 와 같은 꼴의 목록, 없으면 빈 목록
     * @param target 주소 — 이름 · / 로 시작하는 경로 · //*[@tag=Player] 같은 선택자
     * @param options 고를 칸 — inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다 / camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
     */
    public Map<String, Object> findAll(String target, Map<String, ?> options) { return send("find-all", fields(only(options, "inactive", "camera"), "target", target)); }

    public Map<String, Object> findAll(String target) { return findAll(target, Map.of()); }

    /** 화면 좌표(왼쪽 아래 0,0)의 맨 위 — UI Toolkit · uGUI · 물리 차례, 없으면 found:false
     * @param x 가로 픽셀
     * @param y 세로 픽셀
     * @param options 고를 칸 — camera: 물리 raycast 를 쏠 카메라 오브젝트 주소(기본 Camera.main)
     */
    public Map<String, Object> findAt(double x, double y, Map<String, ?> options) { return send("find-at", fields(only(options, "camera"), "x", x, "y", y)); }

    public Map<String, Object> findAt(double x, double y) { return findAt(x, y, Map.of()); }

    /** 붙은 컴포넌트 이름 · 전체 타입 이름
     * @param target 오브젝트 주소
     * @param options 고를 칸 — inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
     */
    public Map<String, Object> components(String target, Map<String, ?> options) { return send("components", fields(only(options, "inactive"), "target", target)); }

    public Map<String, Object> components(String target) { return components(target, Map.of()); }

    /** 컴포넌트의 필드 · 속성(타입 · 값) · 메서드(인자 타입) — Unity 부모 칸은 뺀다
     * @param target 오브젝트 주소
     * @param component 컴포넌트 타입 이름 또는 전체 이름 — TouchProbe
     * @param options 고를 칸 — inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
     */
    public Map<String, Object> members(String target, String component, Map<String, ?> options) { return send("members", fields(only(options, "inactive"), "target", target, "component", component)); }

    public Map<String, Object> members(String target, String component) { return members(target, component, Map.of()); }

    /** 글자 컴포넌트(Text · TMP · UI Toolkit Label/Button)의 글자를 바꾸고 다시 읽은 글자를 준다 — 입력칸은 type
     * @param target 글자 오브젝트 주소
     * @param text 넣을 글자
     * @param options 고를 칸 — inactive: 꺼진 오브젝트 · 숨은 요소도 본다 — 경로 순번이 꺼진 형제까지 센다
     */
    public Map<String, Object> textSet(String target, String text, Map<String, ?> options) { return send("text-set", fields(only(options, "inactive"), "target", target, "text", text)); }

    public Map<String, Object> textSet(String target, String text) { return textSet(target, text, Map.of()); }

    /** 손가락 하나를 눌러 둔다 — 답의 finger(10~19)로 touch-move · touch-up
     * @param options 고를 칸 — target: 누를 오브젝트 주소 — 없으면 x · y / x: 가로 픽셀(왼쪽 0) — target 이 없을 때 / y: 세로 픽셀(아래 0) — target 이 없을 때 / camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
     */
    public Map<String, Object> touchDown(Map<String, ?> options) { return send("touch-down", fields(only(options, "target", "x", "y", "camera"))); }

    public Map<String, Object> touchDown() { return touchDown(Map.of()); }

    /** 눌러 둔 손가락을 옮긴다(한 프레임에)
     * @param finger touch-down 이 준 번호
     * @param options 고를 칸 — target: 옮길 자리 오브젝트 주소 — 없으면 x · y / x: 가로 픽셀 — target 이 없을 때 / y: 세로 픽셀 — target 이 없을 때 / camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main)
     */
    public Map<String, Object> touchMove(double finger, Map<String, ?> options) { return send("touch-move", fields(only(options, "target", "x", "y", "camera"), "finger", finger)); }

    public Map<String, Object> touchMove(double finger) { return touchMove(finger, Map.of()); }

    /** 눌러 둔 손가락을 뗀다
     * @param finger touch-down 이 준 번호
     */
    public Map<String, Object> touchUp(double finger) { return send("touch-up", fields(Map.of(), "finger", finger)); }

    /** 좌표로 끌기 — 한 손가락이 points 를 차례로 지난다(살펴볼 때 · 케이스는 drag)
     * @param points "x,y" 글자 둘 이상 — ["540,400", "540,900"]
     * @param options 고를 칸 — duration: 처음부터 끝까지 걸리는 초(0~8, 기본 0 — 마디마다 10프레임)
     */
    public Map<String, Object> swipe(List<String> points, Map<String, ?> options) { return send("swipe", fields(only(options, "duration"), "points", points)); }

    public Map<String, Object> swipe(List<String> points) { return swipe(points, Map.of()); }

    /** 길게 누르기 — duration 초 눌렀다 뗀다
     * @param options 고를 칸 — target: 누를 오브젝트 주소 — 없으면 x · y / x: 가로 픽셀 — target 이 없을 때 / y: 세로 픽셀 — target 이 없을 때 / camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main) / duration: 누르고 있는 초(0~8, 기본 1)
     */
    public Map<String, Object> longPress(Map<String, ?> options) { return send("long-press", fields(only(options, "target", "x", "y", "camera", "duration"))); }

    public Map<String, Object> longPress() { return longPress(Map.of()); }

    /** 가짜 마우스를 옮긴다 — hover(Pointer Enter/Exit). 단추는 key Mouse0~4, 끄기는 input-reset
     * @param options 고를 칸 — target: 옮길 자리 오브젝트 주소 — 없으면 x · y / x: 가로 픽셀 — target 이 없을 때 / y: 세로 픽셀 — target 이 없을 때 / camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main) / duration: 옮기는 초(0~8, 기본 0 — 한 번에)
     */
    public Map<String, Object> mouseMove(Map<String, ?> options) { return send("mouse-move", fields(only(options, "target", "x", "y", "camera", "duration"))); }

    public Map<String, Object> mouseMove() { return mouseMove(Map.of()); }

    /** 마우스 바퀴 — 자리를 주면 먼저 그리로 옮긴다(폰은 자리를 준다)
     * @param dy 세로 바퀴 칸(위가 +, 옛 Input mouseScrollDelta 꼴)
     * @param options 고를 칸 — dx: 가로 바퀴 칸(오른쪽이 +) / target: 바퀴를 굴릴 오브젝트 주소 — 없으면 x · y, 둘 다 없으면 지금 마우스 자리 / x: 가로 픽셀 / y: 세로 픽셀 / camera: 월드 오브젝트의 화면 자리를 셀 카메라 오브젝트 주소(기본 Camera.main) / duration: 나눠 굴리는 초(0~8, 기본 0 — 한 프레임)
     */
    public Map<String, Object> scroll(double dy, Map<String, ?> options) { return send("scroll", fields(only(options, "dx", "target", "x", "y", "camera", "duration"), "dy", dy)); }

    public Map<String, Object> scroll(double dy) { return scroll(dy, Map.of()); }

    /** 키를 눌러 둔다 — key-up · input-reset 까지. A+LeftShift 처럼 여럿
     * @param key KeyCode 이름 — 여럿은 A+LeftShift
     * @param options 고를 칸 — power: 세기 -1~1(기본 1) — GetAxis 값 · JoystickButton16~19 는 스틱 값
     */
    public Map<String, Object> keyDown(String key, Map<String, ?> options) { return send("key-down", fields(only(options, "power"), "key", key)); }

    public Map<String, Object> keyDown(String key) { return keyDown(key, Map.of()); }

    /** 눌러 둔 키를 뗀다
     * @param key KeyCode 이름 — 여럿은 A+LeftShift
     */
    public Map<String, Object> keyUp(String key) { return send("key-up", fields(Map.of(), "key", key)); }

    /** 기울이기 — duration 동안 가속도(Input.acceleration · Accelerometer)를 대신한다
     * @param x 가속도 x(g)
     * @param y 가속도 y(g)
     * @param z 가속도 z(g)
     * @param options 고를 칸 — duration: 대신하는 초(0~8, 기본 0 — 한 프레임)
     */
    public Map<String, Object> tilt(double x, double y, double z, Map<String, ?> options) { return send("tilt", fields(only(options, "duration"), "x", x, "y", y, "z", z)); }

    public Map<String, Object> tilt(double x, double y, double z) { return tilt(x, y, z, Map.of()); }

    /** GameObject 하나에 Pointer 이벤트를 바로 보낸다(EventSystem 처리기 — 부모로 안 올린다)
     * @param target GameObject 주소(UI Toolkit 요소는 안 된다)
     * @param event down · up · enter · exit — down · up · enter · exit
     */
    public Map<String, Object> pointer(String target, String event) { return send("pointer", fields(Map.of(), "target", target, "event", event)); }

    /** 가짜 입력을 다 거둔다 — 눌러 둔 손가락 · 키 · 가짜 마우스 · 기울기
     */
    public Map<String, Object> inputReset() { return send("input-reset", fields(Map.of())); }

    /** 게임 로그 전부(Log · Warning · Error · Assert · Exception, 최근 500개) — 40자 넘는 영숫자 토막(토큰)은 ***
     * @param options 고를 칸 — since: 받아 둔 last — 그 번호 뒤만
     */
    public Map<String, Object> logs(Map<String, ?> options) { return send("logs", fields(only(options, "since"))); }

    public Map<String, Object> logs() { return logs(Map.of()); }

    /** 게임 알림(최근 200개) — scene.loaded · scene.unloaded · game.paused · game.resumed
     * @param options 고를 칸 — since: 받아 둔 last — 그 번호 뒤만
     */
    public Map<String, Object> events(Map<String, ?> options) { return send("events", fields(only(options, "since"))); }

    public Map<String, Object> events() { return events(Map.of()); }

    /** 켜면 SDK 가 받은 명령마다 「[ControlCli] click LoginButton — 성공」 한 줄을 게임 로그에 적는다(입력 글자 · 값은 ***). 기본 꺼짐 · 게임을 다시 켜면 꺼짐
     * @param on true 켜기 · false 끄기
     */
    public Map<String, Object> sdkLog(boolean on) { return send("sdk-log", fields(Map.of(), "on", on)); }

    /** 명령 JSON 하나를 이 드라이버 메서드로 보낸다 — conform --driver 의 다리 */
    public Map<String, Object> dispatch(String cmd, Map<String, Object> a) {
        return switch (cmd) {
            case "ping" -> ping();
            case "tree" -> tree();
            case "find" -> find(str(a, "target"), without(a, "target"));
            case "click" -> click(str(a, "target"), without(a, "target"));
            case "drag" -> drag(str(a, "target"), str(a, "to"), without(a, "target", "to"));
            case "type" -> type(str(a, "target"), str(a, "text"));
            case "get" -> get(str(a, "target"), str(a, "prop"), without(a, "target", "prop"));
            case "tap" -> tap(num(a, "x"), num(a, "y"), without(a, "x", "y"));
            case "key" -> key(str(a, "key"), without(a, "key"));
            case "screenshot" -> screenshot(without(a));
            case "errors" -> errors(without(a));
            case "layout" -> layout(without(a));
            case "call" -> call(str(a, "target"), str(a, "method"), without(a, "target", "method"));
            case "set" -> set(str(a, "target"), str(a, "prop"), str(a, "value"), without(a, "target", "prop", "value"));
            case "static-call" -> staticCall(str(a, "method"), without(a, "method"));
            case "static-get" -> staticGet(str(a, "prop"));
            case "static-set" -> staticSet(str(a, "prop"), str(a, "value"));
            case "pref-get" -> prefGet(str(a, "key"), without(a, "key"));
            case "pref-set" -> prefSet(str(a, "key"), str(a, "value"), without(a, "key", "value"));
            case "pref-delete" -> prefDelete(str(a, "key"));
            case "pref-clear" -> prefClear();
            case "timescale-get" -> timescaleGet();
            case "timescale-set" -> timescaleSet(num(a, "scale"));
            case "scenes" -> scenes();
            case "scene-load" -> sceneLoad(str(a, "name"), without(a, "name"));
            case "scene-unload" -> sceneUnload(str(a, "name"));
            case "find-all" -> findAll(str(a, "target"), without(a, "target"));
            case "find-at" -> findAt(num(a, "x"), num(a, "y"), without(a, "x", "y"));
            case "components" -> components(str(a, "target"), without(a, "target"));
            case "members" -> members(str(a, "target"), str(a, "component"), without(a, "target", "component"));
            case "text-set" -> textSet(str(a, "target"), str(a, "text"), without(a, "target", "text"));
            case "touch-down" -> touchDown(without(a));
            case "touch-move" -> touchMove(num(a, "finger"), without(a, "finger"));
            case "touch-up" -> touchUp(num(a, "finger"));
            case "swipe" -> swipe(list(a, "points"), without(a, "points"));
            case "long-press" -> longPress(without(a));
            case "mouse-move" -> mouseMove(without(a));
            case "scroll" -> scroll(num(a, "dy"), without(a, "dy"));
            case "key-down" -> keyDown(str(a, "key"), without(a, "key"));
            case "key-up" -> keyUp(str(a, "key"));
            case "tilt" -> tilt(num(a, "x"), num(a, "y"), num(a, "z"), without(a, "x", "y", "z"));
            case "pointer" -> pointer(str(a, "target"), str(a, "event"));
            case "input-reset" -> inputReset();
            case "logs" -> logs(without(a));
            case "events" -> events(without(a));
            case "sdk-log" -> sdkLog(bool(a, "on"));
            default -> throw new GameException("모르는 명령입니다: " + cmd);
        };
    }
    // ── 생성 끝 ──

    /** conform --driver 의 다리 — stdin 명령 한 줄을 이 드라이버 메서드로 보내고 답을 stdout 한 줄로 */
    @SuppressWarnings("unchecked")
    public static void main(String[] argv) throws IOException {
        if (!List.of(argv).equals(List.of("bridge"))) {
            System.err.println("java ControlCli.java bridge — CONTROL_CLI_GAME 주소의 게임으로 stdin 명령을 보낸다(control-cli conform --driver)");
            System.exit(2);
        }
        String address = System.getenv("CONTROL_CLI_GAME");
        var game = new ControlCli(address == null ? "tcp://127.0.0.1:13100" : address);
        var in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        var out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        for (String line; (line = in.readLine()) != null; ) {
            var command = new LinkedHashMap<>((Map<String, Object>) Json.read(line));
            String cmd = (String) command.remove("cmd");
            Object reply;
            try {
                reply = game.dispatch(cmd, command);
            } catch (RuntimeException e) {
                reply = Map.of("ok", false, "error", String.valueOf(e.getMessage()));
            }
            out.print(Json.write(reply) + "\n");
            out.flush();
        }
    }

    /** 작은 JSON — 객체는 LinkedHashMap, 배열은 ArrayList, 숫자는 Double. 정수인 double 은 2 로 쓴다(SDK 의 int 칸) */
    public static final class Json {
        private final String s;
        private int i;

        private Json(String s) { this.s = s; }

        public static Object read(String text) {
            var j = new Json(text);
            Object v = j.value();
            j.space();
            if (j.i != text.length()) throw j.error("값 뒤에 남은 글자");
            return v;
        }

        private RuntimeException error(String what) { return new IllegalArgumentException("JSON " + what + " (" + i + "번째 글자)"); }

        private void space() { while (i < s.length() && " \t\r\n".indexOf(s.charAt(i)) >= 0) i++; }

        private Object value() {
            space();
            if (i >= s.length()) throw error("이 끝남");
            char c = s.charAt(i);
            if (c == '{') {
                i++;
                var m = new LinkedHashMap<String, Object>();
                space();
                if (s.charAt(i) == '}') { i++; return m; }
                for (;;) {
                    space();
                    if (s.charAt(i) != '"') throw error("객체 칸 이름이 아님");
                    String k = string();
                    space();
                    if (s.charAt(i++) != ':') throw error(": 가 없음");
                    m.put(k, value());
                    space();
                    char d = s.charAt(i++);
                    if (d == '}') return m;
                    if (d != ',') throw error(", 가 없음");
                }
            }
            if (c == '[') {
                i++;
                var l = new ArrayList<Object>();
                space();
                if (s.charAt(i) == ']') { i++; return l; }
                for (;;) {
                    l.add(value());
                    space();
                    char d = s.charAt(i++);
                    if (d == ']') return l;
                    if (d != ',') throw error(", 가 없음");
                }
            }
            if (c == '"') return string();
            if (s.startsWith("true", i)) { i += 4; return true; }
            if (s.startsWith("false", i)) { i += 5; return false; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int start = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            if (start == i) throw error("모르는 글자 " + c);
            return Double.parseDouble(s.substring(start, i));
        }

        private String string() {
            i++;
            var b = new StringBuilder();
            for (;;) {
                char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c != '\\') { b.append(c); continue; }
                char e = s.charAt(i++);
                switch (e) {
                    case 'n' -> b.append('\n');
                    case 't' -> b.append('\t');
                    case 'r' -> b.append('\r');
                    case 'b' -> b.append('\b');
                    case 'f' -> b.append('\f');
                    case 'u' -> { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; }
                    default -> b.append(e);
                }
            }
        }

        public static String write(Object v) {
            var b = new StringBuilder();
            write(b, v);
            return b.toString();
        }

        private static void write(StringBuilder b, Object v) {
            if (v == null) b.append("null");
            else if (v instanceof String str) quote(b, str);
            else if (v instanceof Boolean) b.append(v);
            else if (v instanceof Number n) {
                double d = n.doubleValue();
                if (!Double.isFinite(d)) throw new IllegalArgumentException("JSON 에 쓸 수 없는 수: " + d);
                b.append(d == Math.rint(d) && Math.abs(d) < 1e15 ? Long.toString((long) d) : Double.toString(d));
            } else if (v instanceof Map<?, ?> m) {
                b.append('{');
                boolean first = true;
                for (var e : m.entrySet()) {
                    if (!first) b.append(',');
                    first = false;
                    quote(b, String.valueOf(e.getKey()));
                    b.append(':');
                    write(b, e.getValue());
                }
                b.append('}');
            } else if (v instanceof Iterable<?> l) {
                b.append('[');
                boolean first = true;
                for (var x : l) {
                    if (!first) b.append(',');
                    first = false;
                    write(b, x);
                }
                b.append(']');
            } else throw new IllegalArgumentException("JSON 에 쓸 수 없는 값: " + v.getClass().getName());
        }

        private static void quote(StringBuilder b, String str) {
            b.append('"');
            for (char c : str.toCharArray()) {
                switch (c) {
                    case '"' -> b.append("\\\"");
                    case '\\' -> b.append("\\\\");
                    case '\n' -> b.append("\\n");
                    case '\r' -> b.append("\\r");
                    case '\t' -> b.append("\\t");
                    default -> {
                        if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                        else b.append(c);
                    }
                }
            }
            b.append('"');
        }
    }
}
