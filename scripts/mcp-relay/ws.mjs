// A minimal RFC 6455 WebSocket server side for the MCP relay (S-BACK-034):
// the handshake key, frame encode / decode, and the origin / host checks.
// Dependency-free on purpose (like serve-static.mjs): the relay only needs
// text messages from one local tab, so ~150 lines replace a package.
// Text frames only, no extensions (RSV bits must be 0), a payload limit.

import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const OP = Object.freeze({ CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa });

export const acceptKey = (key) => createHash('sha1').update(key + GUID).digest('base64');

// The only pages allowed to connect: the app on a local dev server and the
// deployed site. Browsers always send Origin on a WebSocket handshake and
// a page cannot fake it, so another web page cannot drive the relay.
const APP_ORIGINS = new Set(['https://brndkfr.github.io']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function originAllowed(origin) {
  if (typeof origin !== 'string' || !origin) return false;
  let u;
  try { u = new URL(origin); } catch { return false; }
  if (u.origin !== origin) return false;   // an Origin header is scheme://host[:port], nothing else
  if (APP_ORIGINS.has(u.origin)) return true;
  return u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname);
}

// Host must name the loopback interface the relay listens on (defence
// against DNS rebinding, on top of the Origin check).
export function hostAllowed(host, port) {
  return typeof host === 'string' && (host === `127.0.0.1:${port}` || host === `localhost:${port}`);
}

export class WsProtocolError extends Error {
  constructor(closeCode, message) { super(message); this.closeCode = closeCode; }
}

export function closePayload(code, reason = '') {
  const r = Buffer.from(reason, 'utf8');
  const b = Buffer.alloc(2 + r.length);
  b.writeUInt16BE(code, 0);
  r.copy(b, 2);
  return b;
}

// One frame. Server frames are unmasked; `mask` (4 bytes) is for tests and
// clients. `fin: false` starts or continues a fragmented message.
export function encodeFrame(opcode, payload = Buffer.alloc(0), { mask = null, fin = true } = {}) {
  const data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  const len = data.length;
  const ext = len < 126 ? 0 : len < 65536 ? 2 : 8;
  const head = Buffer.alloc(2 + ext + (mask ? 4 : 0));
  head[0] = (fin ? 0x80 : 0) | opcode;
  head[1] = (mask ? 0x80 : 0) | (ext === 0 ? len : ext === 2 ? 126 : 127);
  if (ext === 2) head.writeUInt16BE(len, 2);
  if (ext === 8) head.writeBigUInt64BE(BigInt(len), 2);
  if (!mask) return Buffer.concat([head, data]);
  mask.copy(head, 2 + ext);
  const body = Buffer.alloc(len);
  for (let i = 0; i < len; i++) body[i] = data[i] ^ mask[i & 3];
  return Buffer.concat([head, body]);
}

// push(chunk) returns the complete events so far:
//   { type: 'message', data } | { type: 'ping', data } | { type: 'pong' } | { type: 'close', code, reason }
// and throws WsProtocolError (with the close code to send) on bad input.
export function createFrameDecoder({ maxPayload = 32 * 1024 * 1024, requireMask = true } = {}) {
  let buf = Buffer.alloc(0);
  let parts = null;   // fragments of a text message in progress
  let partsLen = 0;
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const text = (b) => {
    try { return utf8.decode(b); } catch { throw new WsProtocolError(1007, 'invalid UTF-8'); }
  };

  return {
    push(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const events = [];
      for (;;) {
        if (buf.length < 2) break;
        const fin = (buf[0] & 0x80) !== 0;
        if (buf[0] & 0x70) throw new WsProtocolError(1002, 'reserved bits set');
        const op = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        if (requireMask && !masked) throw new WsProtocolError(1002, 'client frames must be masked');
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (buf.length < 4) break;
          len = buf.readUInt16BE(2); off = 4;
        } else if (len === 127) {
          if (buf.length < 10) break;
          const big = buf.readBigUInt64BE(2);
          if (big > BigInt(maxPayload)) throw new WsProtocolError(1009, 'message too big');
          len = Number(big); off = 10;
        }
        const control = op >= 0x8;
        if (control && (!fin || len > 125)) throw new WsProtocolError(1002, 'bad control frame');
        if (!control && partsLen + len > maxPayload) throw new WsProtocolError(1009, 'message too big');
        const maskOff = off;
        if (masked) off += 4;
        if (buf.length < off + len) break;
        let data = buf.subarray(off, off + len);
        if (masked) {
          const m = buf.subarray(maskOff, maskOff + 4);
          const out = Buffer.alloc(len);
          for (let i = 0; i < len; i++) out[i] = data[i] ^ m[i & 3];
          data = out;
        } else {
          data = Buffer.from(data);
        }
        buf = buf.subarray(off + len);

        if (op === OP.PING) events.push({ type: 'ping', data });
        else if (op === OP.PONG) events.push({ type: 'pong' });
        else if (op === OP.CLOSE) {
          const code = data.length >= 2 ? data.readUInt16BE(0) : 1005;
          events.push({ type: 'close', code, reason: data.length > 2 ? text(data.subarray(2)) : '' });
        } else if (op === OP.TEXT) {
          if (parts) throw new WsProtocolError(1002, 'new message inside a fragmented one');
          if (fin) events.push({ type: 'message', data: text(data) });
          else { parts = [data]; partsLen = len; }
        } else if (op === OP.CONT) {
          if (!parts) throw new WsProtocolError(1002, 'continuation without a message');
          parts.push(data);
          partsLen += len;
          if (fin) {
            events.push({ type: 'message', data: text(Buffer.concat(parts)) });
            parts = null; partsLen = 0;
          }
        } else if (op === OP.BINARY) {
          throw new WsProtocolError(1003, 'binary messages are not accepted');
        } else {
          throw new WsProtocolError(1002, `unknown opcode ${op}`);
        }
      }
      return events;
    },
  };
}
