// Envio para canal (newsletter) do WhatsApp.
// O Baileys 7 monta mal mensagens de canal com mídia/enquete e o servidor rejeita
// (erro 479) sem avisar. Aqui montamos tudo no formato que o WhatsApp espera:
// - mídia: upload no endpoint /newsletter/..., sem criptografia, e "media_id" na mensagem
// - enquete: pollCreationMessageV3 + nó <meta polltype="creation">
// E esperamos a confirmação (ack) do servidor: se ele recusar, dá erro de verdade.
import crypto from 'node:crypto';
import sharp from 'sharp';
import { generateWAMessage, proto } from 'baileys';

const ORIGIN = 'https://web.whatsapp.com';
const CAMINHO = {
  image: '/newsletter/newsletter-image',
  video: '/newsletter/newsletter-video',
  audio: '/newsletter/newsletter-audio',
  document: '/newsletter/newsletter-document',
  sticker: '/newsletter/newsletter-sticker',
};

async function uploadCanal(sock, buffer, tipo) {
  const sha = crypto.createHash('sha256').update(buffer).digest();
  const token = sha.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let conn = await sock.refreshMediaConn(false);
  let ultimoErro;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    for (const { hostname } of conn.hosts) {
      try {
        const url = `https://${hostname}${CAMINHO[tipo]}/${token}?auth=${encodeURIComponent(conn.auth)}&token=${token}`;
        const r = await fetch(url, {
          method: 'POST',
          body: buffer,
          headers: { 'Content-Type': 'application/octet-stream', Origin: ORIGIN },
          signal: AbortSignal.timeout(60_000),
        });
        const j = await r.json().catch(() => ({}));
        if (process.env.DEBUG_CANAL) console.log('upload:', JSON.stringify(j));
        if (j.direct_path || j.url) return { url: j.url, directPath: j.direct_path, handle: j.handle, thumb: j.thumbnail_info, sha, tamanho: buffer.length };
        ultimoErro = new Error(`upload recusado: ${JSON.stringify(j).slice(0, 200)}`);
      } catch (e) { ultimoErro = e; }
    }
    conn = await sock.refreshMediaConn(true);
  }
  throw ultimoErro || new Error('upload falhou');
}

async function montarMidia(sock, content) {
  if (content.image) {
    const buf = content.image;
    const up = await uploadCanal(sock, buf, 'image');
    const meta = await sharp(buf).metadata();
    const thumb = await sharp(buf).resize(96, 96, { fit: 'inside' }).jpeg({ quality: 60 }).toBuffer();
    return {
      tipo: 'image', handle: up.handle,
      msg: proto.Message.fromObject({
        imageMessage: {
          url: up.url, directPath: up.directPath, fileSha256: up.sha, fileLength: up.tamanho,
          mimetype: meta.format === 'png' ? 'image/png' : 'image/jpeg',
          width: meta.width, height: meta.height, jpegThumbnail: thumb,
          caption: content.caption || undefined,
          ...(up.thumb ? { thumbnailDirectPath: up.thumb.thumbnail_direct_path, thumbnailSha256: Buffer.from(up.thumb.thumbnail_sha256, 'base64') } : {}),
        },
      }),
    };
  }
  if (content.sticker) {
    // figurinha = webp 512x512; no canal ela sobe pelo endpoint de imagem
    const up = await uploadCanal(sock, content.sticker, process.env.STICKER_PATH || 'image');
    return {
      tipo: 'sticker', handle: up.handle,
      msg: proto.Message.fromObject({
        stickerMessage: {
          url: up.url, directPath: up.directPath, fileSha256: up.sha, fileLength: up.tamanho,
          mimetype: 'image/webp', width: 512, height: 512, isAnimated: false,
          stickerSentTs: Date.now(),
        },
      }),
    };
  }
  if (content.audio) {
    // canal só mostra áudio como mensagem de voz (ptt) em OGG/Opus
    const up = await uploadCanal(sock, content.audio, 'audio');
    return {
      tipo: content.ptt ? 'ptt' : 'audio', handle: up.handle,
      msg: proto.Message.fromObject({
        audioMessage: {
          url: up.url, directPath: up.directPath, fileSha256: up.sha, fileLength: up.tamanho,
          mimetype: content.mimetype || 'audio/ogg; codecs=opus', seconds: content.seconds || 30,
          ptt: !!content.ptt,
          ...(content.waveform ? { waveform: content.waveform } : {}),
        },
      }),
    };
  }
  return null;
}

export async function enviarCanal(sock, jid, content, { timeoutMs = 15_000 } = {}) {
  let msg, midia = null, handle;
  const m = await montarMidia(sock, content);
  if (m) { msg = m.msg; midia = m.tipo; handle = m.handle; }
  else {
    msg = (await generateWAMessage(jid, content, { userJid: sock.user.id, upload: sock.waUploadToServer, logger: sock.logger })).message;
  }

  // enquete de canal = pollCreationMessageV3, sem segredo de criptografia
  let enquete = false;
  const poll = msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3;
  if (poll) {
    enquete = true;
    delete msg.pollCreationMessage; delete msg.pollCreationMessageV2;
    msg.pollCreationMessageV3 = poll;
    delete msg.messageContextInfo;
  }

  const id = crypto.randomBytes(9).toString('hex').toUpperCase().replace(/^/, '3EB0').slice(0, 22);
  const stanza = {
    tag: 'message',
    attrs: {
      to: jid, id,
      type: enquete ? 'poll' : midia ? 'media' : 'text',
      ...(handle ? { media_id: handle } : {}),
    },
    content: [
      { tag: 'plaintext', attrs: midia ? { mediatype: midia } : {}, content: proto.Message.encode(msg).finish() },
      ...(enquete ? [{ tag: 'meta', attrs: { polltype: 'creation' } }] : []),
    ],
  };

  // espera o "ack" do servidor: se vier com erro, a mensagem NÃO foi publicada
  const resultado = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); resolve('sem-confirmacao'); }, timeoutMs);
    const handler = (node) => {
      if (node.attrs?.id !== id) return;
      clearTimeout(timer); off();
      if (node.attrs.error) reject(new Error(`WhatsApp rejeitou a mensagem (erro ${node.attrs.error})`));
      else resolve('ok');
    };
    const off = () => sock.ws.off('CB:ack,class:message', handler);
    sock.ws.on('CB:ack,class:message', handler);
  });
  await sock.sendNode(stanza);
  return resultado;
}
