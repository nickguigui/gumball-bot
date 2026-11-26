// Efeitos de video e audio via ffmpeg + TTS / transcricao.
import { ffmpeg } from '../lib/media.js';
import { http, getBuffer, UserError } from '../lib/http.js';
import { config } from '../config.js';
import { esc } from '../lib/media.js';

const VID = '🎥 VÍDEO', AUD = '🎵 ÁUDIO', EXT = '🧰 MAIS UTILIDADES';
const extOf = mt => (mt.includes('ogg') ? 'ogg' : mt.includes('mp4') && mt.startsWith('audio') ? 'm4a' : mt.includes('mpeg') ? 'mp3' : mt.startsWith('video') ? 'mp4' : 'bin');
async function needMedia(ctx, kinds, what) {
  const m = await ctx.media(kinds);
  if (!m) throw new UserError(`Envie ou responda ${what} com */${ctx.cmd}*.`);
  return m;
}
function parseRange(args) { // "10 30" | "0:10 0:30" -> [inicio, duracao]
  const t = s => s?.includes(':') ? s.split(':').reduce((a, b) => a * 60 + +b, 0) : Number(s);
  const a = t(args[0]), b = t(args[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return [a, b - a];
}
const AUDIO_FX = {
  estourar: ['💥', ['-af', 'volume=12,acrusher=bits=8:mode=log:aa=1']],
  grave: ['🔊', ['-af', 'bass=g=18,volume=1.4']],
  reverb: ['🌌', ['-af', 'aecho=0.8:0.88:60|120:0.4|0.3']],
  audioreverso: ['⏪', ['-af', 'areverse']],
  audiorapido: ['⏩', ['-af', 'atempo=1.6']],
  audiolento: ['🐢', ['-af', 'atempo=0.7']],
  voz: ['🐿️', ['-af', 'asetrate=44100*1.45,aresample=44100,atempo=0.8']],
};
const VIDEO_FX = {
  videoreverso: ['⏪', ['-vf', 'reverse', '-af', 'areverse']],
  videolento: ['🐢', ['-vf', 'setpts=2.0*PTS', '-af', 'atempo=0.5']],
  videorapido: ['⏩', ['-vf', 'setpts=0.5*PTS', '-af', 'atempo=2.0']],
};

export const commands = [
  ...Object.entries(AUDIO_FX).map(([name, [emoji, args]]) => ({
    name, category: AUD, react: emoji, done: '✅', run: async ctx => {
      const m = await needMedia(ctx, ['audioMessage', 'videoMessage'], 'um áudio');
      const out = await ffmpeg(m.buffer, extOf(m.mimetype), ['-vn', ...args, '-c:a', 'libopus', '-b:a', '64k'], 'ogg');
      return ctx.audio(out, 'audio/ogg; codecs=opus', true);
    },
  })),
  {
    name: 'tomp3', category: AUD, react: '🎵', done: '✅', run: async ctx => {
      const m = await needMedia(ctx, ['videoMessage', 'audioMessage'], 'um vídeo');
      return ctx.audio(await ffmpeg(m.buffer, extOf(m.mimetype), ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k'], 'mp3'), 'audio/mpeg');
    },
  },
  {
    name: 'cortaraudio', category: AUD, react: '✂️', done: '✅', run: async ctx => {
      const r = parseRange(ctx.args); if (!r) return ctx.reply('✂️ *Uso:* responda um áudio com */cortaraudio 0:10 0:40*');
      const m = await needMedia(ctx, ['audioMessage', 'videoMessage'], 'um áudio');
      return ctx.audio(await ffmpeg(m.buffer, extOf(m.mimetype), ['-ss', String(r[0]), '-t', String(r[1]), '-vn', '-c:a', 'libmp3lame', '-b:a', '128k'], 'mp3'), 'audio/mpeg');
    },
  },
  ...Object.entries(VIDEO_FX).map(([name, [emoji, args]]) => ({
    name, category: VID, react: emoji, done: '✅', run: async ctx => {
      const m = await needMedia(ctx, ['videoMessage'], 'um vídeo');
      if ((m.seconds || 0) > 60) return ctx.reply('⏱️ O vídeo precisa ter até 60 segundos.');
      return ctx.video(await ffmpeg(m.buffer, 'mp4', [...args, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', 'faststart'], 'mp4'));
    },
  })),
  {
    name: 'cortarvideo', category: VID, react: '✂️', done: '✅', run: async ctx => {
      const r = parseRange(ctx.args); if (!r) return ctx.reply('✂️ *Uso:* responda um vídeo com */cortarvideo 0:05 0:20*');
      const m = await needMedia(ctx, ['videoMessage'], 'um vídeo');
      return ctx.video(await ffmpeg(m.buffer, 'mp4', ['-ss', String(r[0]), '-t', String(r[1]), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-movflags', 'faststart'], 'mp4'));
    },
  },
  {
    name: 'letreiro', category: VID, react: '🎬', done: '✅', run: async ctx => {
      if (!ctx.q) return ctx.reply('🎬 *Uso:* /letreiro seu texto');
      const txt = ctx.q.slice(0, 60).replace(/[\\':]/g, ' ');
      const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
      const { tmpdir } = await import('../lib/media.js'); const fs = await import('node:fs/promises'); const path = await import('node:path');
      const dir = await tmpdir(); const file = path.join(dir, 'l.mp4');
      try {
        await promisify(execFile)(config.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=6:r=30',
          '-vf', `drawtext=text='${txt}':fontcolor=0x00ff99:fontsize=72:y=(h-text_h)/2:x=w-mod(t*220\\,w+tw):shadowcolor=0x00ff99@0.5:shadowx=0:shadowy=0:borderw=2:bordercolor=0x003322`,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'faststart', file], { timeout: 60000 });
        return ctx.send({ video: await fs.readFile(file), gifPlayback: true }, { quoted: ctx.m });
      } finally { await fs.rm(dir, { recursive: true, force: true }); }
    },
  },
  {
    name: 'falar', category: EXT, react: '🗣️', done: '✅', run: async ctx => {
      const text = (ctx.q || ctx.quoted?.text || '').slice(0, 200); if (!text) return ctx.reply('🗣️ *Uso:* /falar seu texto');
      const mp3 = await getBuffer(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pt-BR&q=${encodeURIComponent(text)}`);
      return ctx.audio(await ffmpeg(mp3, 'mp3', ['-c:a', 'libopus', '-b:a', '48k'], 'ogg'), 'audio/ogg; codecs=opus', true);
    },
  },
  {
    name: 'transcrever', category: EXT, react: '📝', done: '✅', run: async ctx => {
      if (!config.openaiKey) throw new UserError('Transcrição precisa de OPENAI_API_KEY configurada.');
      const m = await needMedia(ctx, ['audioMessage', 'videoMessage'], 'um áudio');
      const mp3 = await ffmpeg(m.buffer, extOf(m.mimetype), ['-vn', '-ac', '1', '-b:a', '48k'], 'mp3');
      const fd = new FormData(); fd.append('file', new Blob([mp3], { type: 'audio/mpeg' }), 'a.mp3'); fd.append('model', 'whisper-1'); fd.append('language', 'pt');
      const r = await http(`${config.openaiBase}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${config.openaiKey}` }, body: fd, timeout: 120000 });
      if (!r.ok) throw new UserError('Falha ao transcrever o áudio.');
      return ctx.reply(`📝 *TRANSCRIÇÃO*\n\n${(await r.json()).text}`);
    },
  },
];
