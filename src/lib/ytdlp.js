// Downloads via yt-dlp (+ ffmpeg para extrair mp3 128 kbps, como o Zenitsu).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { tmpdir } from './media.js';
import { UserError } from './http.js';

const run = promisify(execFile);
const base = () => ['--no-playlist', '--no-warnings', '--ffmpeg-location', config.ffmpeg, '--max-filesize', `${config.maxDownloadMB}M`];

export async function search(query, n = 1) {
  const { stdout } = await run(config.ytdlp, ['--dump-json', '--flat-playlist', '--no-warnings', `ytsearch${n}:${query}`], { maxBuffer: 32 << 20, timeout: 60000 });
  return stdout.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).map(v => ({
    id: v.id, title: v.title, url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
    duration: v.duration, channel: v.channel || v.uploader, views: v.view_count,
  }));
}
export const isUrl = s => /^https?:\/\//i.test(s || '');

async function download(target, args, wantExt) {
  const dir = await tmpdir();
  try {
    await run(config.ytdlp, [...base(), ...args, '-o', path.join(dir, 'media.%(ext)s'), target], { maxBuffer: 32 << 20, timeout: 300000 })
      .catch(e => { throw new UserError(/max-filesize|larger than/i.test(e.stderr || '') ? `Arquivo maior que ${config.maxDownloadMB} MB.` : 'Não consegui baixar esse conteúdo. Verifique o link ou tente outro.'); });
    const files = (await readdir(dir)).filter(f => f.startsWith('media.'));
    const file = files.find(f => !wantExt || f.endsWith('.' + wantExt)) || files[0];
    if (!file) throw new UserError('O download não gerou nenhum arquivo.');
    const st = await stat(path.join(dir, file));
    if (st.size > config.maxDownloadMB * 1024 * 1024) throw new UserError(`Arquivo maior que ${config.maxDownloadMB} MB.`);
    return { buffer: await readFile(path.join(dir, file)), ext: path.extname(file).slice(1) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function audio(target) {
  return download(target, ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '128K'], 'mp3');
}
export async function video(target, maxH = 720) {
  return download(target, ['-f', `bv*[height<=${maxH}][ext=mp4]+ba[ext=m4a]/b[height<=${maxH}][ext=mp4]/b`, '--merge-output-format', 'mp4', '--recode-video', 'mp4'], 'mp4');
}
export async function any(target) { // TikTok/Insta/X/Kwai/Pinterest etc.
  return download(target, ['-f', 'b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4'], null);
}
export async function info(target) {
  const { stdout } = await run(config.ytdlp, ['--dump-json', '--no-playlist', '--no-warnings', target], { maxBuffer: 32 << 20, timeout: 60000 });
  return JSON.parse(stdout);
}
