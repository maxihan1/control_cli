// 브라우저 WebSocket 으로 relay 에 건다 — 받은 줄은 C#(Relay.cs)이 매 프레임 꺼내 간다, 끊기면 2초마다 다시(P3-B)
var ControlCliRelayLib = {
  $ControlCliRelay: { ws: null, inbox: [], state: 0 },

  $ControlCliRelayString: function (text) {
    var size = lengthBytesUTF8(text) + 1;
    var buffer = _malloc(size);
    stringToUTF8(text, buffer, size);
    return buffer;
  },

  // state — 0 아직 · 1 붙음 · 2 끊김. onerror 뒤에는 늘 onclose 가 온다.
  ControlCliRelayOpen: function (urlPtr, helloPtr) {
    var url = UTF8ToString(urlPtr);
    var hello = UTF8ToString(helloPtr);
    function connect() {
      var ws;
      try { ws = new WebSocket(url); } catch (e) { ControlCliRelay.state = 2; setTimeout(connect, 2000); return; }
      ControlCliRelay.ws = ws;
      ws.onopen = function () { ws.send(hello); ControlCliRelay.state = 1; };
      ws.onmessage = function (e) { if (typeof e.data === 'string') ControlCliRelay.inbox.push(e.data); };
      ws.onclose = function () {
        if (ControlCliRelay.ws !== ws) return;
        ControlCliRelay.ws = null;
        ControlCliRelay.state = 2;
        setTimeout(connect, 2000);
      };
    }
    connect();
  },

  ControlCliRelayNext__deps: ['$ControlCliRelayString'],
  ControlCliRelayNext: function () {
    return ControlCliRelay.inbox.length ? ControlCliRelayString(ControlCliRelay.inbox.shift()) : 0;
  },

  // 끊긴 동안의 답은 버린다 — relay 가 이미 502 로 끊었다.
  ControlCliRelaySend: function (textPtr) {
    var ws = ControlCliRelay.ws;
    if (ws && ws.readyState === 1) ws.send(UTF8ToString(textPtr));
  },

  ControlCliRelayState: function () {
    return ControlCliRelay.state;
  },

  // 탭마다 하나 — sessionStorage 라 새로 고침에도 같고 탭끼리는 다르다. 막혔으면 이번 로드만.
  ControlCliRelayTabId__deps: ['$ControlCliRelayString'],
  ControlCliRelayTabId: function () {
    var make = function () { return (Math.random().toString(16) + '00000000').slice(2, 10) + Date.now().toString(16); };
    var id;
    try {
      id = sessionStorage.getItem('controlcli-tab');
      if (!id) { id = make(); sessionStorage.setItem('controlcli-tab', id); }
    } catch (e) {
      id = ControlCliRelay.tab || (ControlCliRelay.tab = make());
    }
    return ControlCliRelayString(id);
  },
};

autoAddDeps(ControlCliRelayLib, '$ControlCliRelay');
mergeInto(LibraryManager.library, ControlCliRelayLib);
