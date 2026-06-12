// Websocket client: auto-reconnect, resume-token auth, pub/sub message bus.

const listeners = new Map();
let ws = null;
let openP = null;
let reconnectDelay = 500;

export const net = {
  connected: false,

  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },

  send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  },

  connect() {
    if (openP) return openP;
    openP = new Promise((resolve) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        net.connected = true;
        reconnectDelay = 500;
        emit('_open', {});
        resolve();
      };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        emit(msg.t, msg);
      };
      ws.onclose = () => {
        net.connected = false;
        openP = null;
        emit('_close', {});
        setTimeout(() => net.connect(), reconnectDelay);
        reconnectDelay = Math.min(8000, reconnectDelay * 2);
      };
      ws.onerror = () => {};
    });
    return openP;
  },
};

function emit(type, msg) {
  for (const fn of listeners.get(type) || []) fn(msg);
}
