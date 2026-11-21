// The relay's WebSocket endpoint for the app tab (S-BACK-034). Listens on
// 127.0.0.1 only. A connection must come from an app origin with a
// loopback Host, then send { type: 'hello', code } with the pairing code
// within helloTimeoutMs; after { type: 'welcome' } every text message is a
// JSON-RPC message between the relay core and the tab.

import http from 'node:http';
import { acceptKey, closePayload, createFrameDecoder, encodeFrame, hostAllowed, originAllowed, OP, WsProtocolError } from './ws.mjs';

export function createBridgeServer({ relay, port, host = '127.0.0.1', helloTimeoutMs = 10_000, maxPayload = 32 * 1024 * 1024, log = () => {} }) {
  const server = http.createServer((req, res) => {
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('floorball-3d MCP relay: WebSocket only\n');
  });

  server.on('upgrade', (req, socket) => {
    const deny = (why) => {
      log(`refused a connection: ${why}`);
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    };
    const actualPort = server.address().port;
    const key = req.headers['sec-websocket-key'];
    if ((req.headers.upgrade || '').toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' || !key) return deny('not a WebSocket handshake');
    if (!originAllowed(req.headers.origin)) return deny(`origin ${JSON.stringify(req.headers.origin ?? null)}`);
    if (!hostAllowed(req.headers.host, actualPort)) return deny(`host ${JSON.stringify(req.headers.host ?? null)}`);

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey(key)}`,
      '', '',
    ].join('\r\n'));
    socket.setNoDelay(true);

    let paired = false;
    let closed = false;
    const conn = {
      send(msg) { if (!closed) socket.write(encodeFrame(OP.TEXT, JSON.stringify(msg))); },
      close(code, reason) {
        if (closed) return;
        closed = true;
        socket.end(encodeFrame(OP.CLOSE, closePayload(code, reason)));
      },
    };
    const helloTimer = setTimeout(() => conn.close(4000, 'no pairing code'), helloTimeoutMs);
    const decoder = createFrameDecoder({ maxPayload });

    function onText(text) {
      let msg;
      try { msg = JSON.parse(text); } catch { return conn.close(1007, 'not JSON'); }
      if (paired) return relay.onPageMessage(conn, msg);
      clearTimeout(helloTimer);
      if (msg?.type !== 'hello') return conn.close(4000, 'no pairing code');
      const verdict = relay.checkCode(msg.code);
      if (verdict === 'locked') return conn.close(4003, 'pairing locked: restart the relay');
      if (verdict !== 'ok') return conn.close(4001, 'wrong pairing code');
      paired = true;
      conn.send({ type: 'welcome' });
      relay.attachPage(conn);
    }

    socket.on('data', (chunk) => {
      if (closed) return;
      let events;
      try {
        events = decoder.push(chunk);
      } catch (e) {
        return conn.close(e instanceof WsProtocolError ? e.closeCode : 1011, e.message);
      }
      for (const ev of events) {
        if (closed) break;
        if (ev.type === 'message') onText(ev.data);
        else if (ev.type === 'ping') socket.write(encodeFrame(OP.PONG, ev.data));
        else if (ev.type === 'close') conn.close(1000, '');
      }
    });
    const gone = () => {
      closed = true;
      clearTimeout(helloTimer);
      if (paired) relay.detachPage(conn);
    };
    socket.on('close', gone);
    socket.on('error', () => socket.destroy());
  });

  server.listen(port, host);
  return server;
}
