// Figurinha com som (WhatsApp, nov/2026): e uma StickerMessage que carrega uma
// AudioMessage no campo 26. O Baileys ainda nao conhece esse campo, entao:
//  - ENVIO: a codificacao da figurinha ganha o campo 26 quando registramos um audio para ela
//  - LEITURA: a decodificacao procura o campo 26 nos bytes e devolve em sticker.audioMessage
import crypto from 'node:crypto';
import { proto, prepareWAMessageMedia, downloadContentFromMessage } from 'baileys';

const SM = proto.Message.StickerMessage, AM = proto.Message.AudioMessage;
const pending = new Map(); // sha256(webp) hex -> AudioMessage (para o proximo envio dessa figurinha)
const TAG_26 = (26 << 3) | 2; // campo 26, tipo "bytes"

if (!SM.__soundPatched) {
  const origEncode = SM.encode;
  SM.encode = function (m, w) {
    const writer = origEncode.call(this, m, w);
    const key = m?.fileSha256 && Buffer.from(m.fileSha256).toString('hex');
    const audio = m?.audioMessage || (key && pending.get(key));
    if (audio) writer.uint32(TAG_26).bytes(AM.encode(audio).finish());
    return writer;
  };
  const origDecode = SM.decode;
  SM.decode = function (r, l) {
    const buf = r instanceof Uint8Array ? r : r.buf;
    const start = r instanceof Uint8Array ? 0 : r.pos;
    const end = r instanceof Uint8Array ? r.length : (l === undefined ? r.len : r.pos + l);
    const msg = origDecode.call(this, r, l);
    try { const a = findField(buf.subarray(start, end), 26); if (a) msg.audioMessage = AM.decode(a); } catch {}
    return msg;
  };
  SM.__soundPatched = true;
}

function varint(b, i) { let x = 0, s = 0, c; do { c = b[i++]; x += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80); return [x, i]; }
function findField(b, field) {
  let i = 0;
  while (i < b.length) {
    let tag; [tag, i] = varint(b, i);
    const f = Math.floor(tag / 8), wt = tag & 7;
    if (wt === 0) [, i] = varint(b, i);
    else if (wt === 1) i += 8;
    else if (wt === 5) i += 4;
    else if (wt === 2) { let len; [len, i] = varint(b, i); if (f === field) return b.subarray(i, i + len); i += len; }
    else return null;
  }
  return null;
}

// Sobe o audio (ogg/opus) e deixa registrado para a figurinha `webp`; depois e so enviar {sticker: webp}
export async function attachSound(sock, webp, oggOpus, seconds) {
  const { audioMessage } = await prepareWAMessageMedia({ audio: oggOpus, mimetype: 'audio/ogg; codecs=opus', ptt: false, seconds: Math.max(1, Math.round(seconds || 1)) }, { upload: sock.waUploadToServer });
  const key = crypto.createHash('sha256').update(webp).digest('hex');
  pending.set(key, audioMessage);
  setTimeout(() => pending.delete(key), 10 * 60_000);
  return audioMessage;
}

// Baixa o audio de uma figurinha com som recebida (ou null se nao tiver)
export async function stickerSound(stickerMessage) {
  const a = stickerMessage?.audioMessage; if (!a?.directPath && !a?.url) return null;
  const chunks = []; for await (const c of await downloadContentFromMessage(a, 'audio')) chunks.push(c);
  return { buffer: Buffer.concat(chunks), seconds: a.seconds || 0, mimetype: a.mimetype || 'audio/ogg; codecs=opus' };
}
