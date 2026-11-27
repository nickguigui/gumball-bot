// Editor de figurinhas do Gumball. Abre pelo link do /editarfig (#token).
// Tudo e desenhado aqui num quadro 512x512; no envio o site sobe os arquivos e o bot monta e manda no WhatsApp.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const REPO = 'nickguigui/gumball-bot';
const TOKEN = location.hash.slice(1).replace(/^t=/, '');
const S = 512; // tamanho da figurinha
const fmt = n => n.toFixed(1).replace('.', ',') + ' s';

// ---------- servidor ----------
let API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : '';
async function apiBase(force) {
  if (API && !force) return API;
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/endpoint.json?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  if (!j?.url) throw new Error(j?.trocando ? 'O bot está reiniciando. Tente de novo em 2 minutos.' : 'O bot está fora do ar agora. Tente de novo em alguns minutos.');
  return (API = j.url);
}
async function api(path, opts = {}) {
  const go = b => fetch(b + path + (path.includes('?') ? '&' : '?') + 't=' + TOKEN, opts);
  let r = await go(await apiBase()).catch(() => null);
  if (!r || r.status === 502 || r.status === 530) r = await go(await apiBase(true)).catch(() => null);
  if (!r) throw new Error('Não consegui falar com o bot. Confira sua internet e tente de novo.');
  return r;
}
async function apiJson(path, opts) { const r = await api(path, opts); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`); return j; }
// envio com barra de progresso
function upload(campo, blob, ext, onProgress) {
  return new Promise(async (res, rej) => {
    const base = await apiBase().catch(rej); if (!base) return;
    const x = new XMLHttpRequest();
    x.open('POST', `${base}/api/fig/arquivo?t=${TOKEN}&campo=${campo}&ext=${ext}`);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} x.status === 200 ? res(j) : rej(new Error(j.erro || `Erro ${x.status}`)); };
    x.onerror = () => rej(new Error('A conexão caiu no envio. Tente de novo.'));
    x.send(blob);
  });
}

// ---------- estado ----------
const cv = $('#cv'), ctx = cv.getContext('2d');
const paint = Object.assign(document.createElement('canvas'), { width: S, height: S }), pctx = paint.getContext('2d');
const st = {
  kind: null,            // 'image' | 'video' | 'blank'
  img: null, video: null, srcW: 0, srcH: 0,
  videoFile: null, videoFromBase: false, uploadedVideo: null,
  s: 1, x: 0, y: 0, rot: 0, flip: false, filt: { bri: 100, con: 100, sat: 100 }, bg: '',
  items: [], sel: -1, tool: 'move',
  brush: { color: '#ffffff', size: 12 }, eraser: 30,
  vStart: 0, vDur: 8,
  som: 'nenhum', audioFile: null, audioName: '', audioDur: 0, sStart: 0, sDur: 10, uploadedAudio: null,
};
let meta = null;
const COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#af52de', '#ff2d92', '#8ace00', '#a2845e'];
const FONTS = [['Nunito', 900, 'Gumball'], ['Anton', 400, 'Impacto'], ['Bangers', 400, 'Gibi'], ['Permanent Marker', 400, 'Caneta'], ['Pacifico', 400, 'Letra'], ['Arial Black', 900, 'Clássica']];
const EMOJIS = '😂🤣😭😍🥰😎🤡💀👀🔥✨💖💔👍👎🙏😡🤬😱🤯🥺😴🤔🙄😏🤪🫠🎉👑💯⭐🌈🍕🐱🐶🦆🐸'.match(/\p{Extended_Pictographic}(‍\p{Extended_Pictographic})*/gu);

// ---------- historico (desfazer / refazer) ----------
const hist = [], redoStack = [];
function snapshot() { return { paint: pctx.getImageData(0, 0, S, S), items: JSON.parse(JSON.stringify(st.items)) }; }
function pushHist() { hist.push(snapshot()); if (hist.length > 40) hist.shift(); redoStack.length = 0; syncUndo(); }
function restore(s) { pctx.putImageData(s.paint, 0, 0); st.items = s.items; st.sel = -1; showSel(); }
$('#undo').onclick = () => { if (!hist.length) return; redoStack.push(snapshot()); restore(hist.pop()); syncUndo(); };
$('#redo').onclick = () => { if (!redoStack.length) return; hist.push(snapshot()); restore(redoStack.pop()); syncUndo(); };
const syncUndo = () => { $('#undo').disabled = !hist.length; $('#redo').disabled = !redoStack.length; };

// ---------- desenho do quadro ----------
function baseDims() { const r = st.rot % 180 !== 0; return [r ? st.srcH : st.srcW, r ? st.srcW : st.srcH]; }
function fit(mode) {
  const [w, h] = baseDims(); if (!w) return;
  st.s = mode === 'cover' ? Math.max(S / w, S / h) : Math.min(S / w, S / h);
  st.x = (S - w * st.s) / 2; st.y = (S - h * st.s) / 2; syncZoom();
}
function drawBase(c, forExport) {
  if (st.bg) { c.fillStyle = st.bg; c.fillRect(0, 0, S, S); }
  const src = st.kind === 'image' ? st.img : st.kind === 'video' ? st.video : null;
  if (!src || !st.srcW) return;
  if (st.kind === 'video' && forExport) return; // no envio o video vai separado; o bot monta igual
  const [w, h] = baseDims();
  c.save();
  if (st.kind === 'image') c.filter = `brightness(${st.filt.bri}%) contrast(${st.filt.con}%) saturate(${st.filt.sat}%)`;
  c.translate(st.x + w * st.s / 2, st.y + h * st.s / 2);
  c.rotate(st.rot * Math.PI / 180); if (st.flip) c.scale(-1, 1);
  c.drawImage(src, -st.srcW * st.s / 2, -st.srcH * st.s / 2, st.srcW * st.s, st.srcH * st.s);
  c.restore();
}
function textLines(it) { return String(it.text || '').split('\n'); }
function itemFont(it) { const f = FONTS.find(f => f[0] === it.font) || FONTS[0]; return `${f[1]} ${it.size}px "${f[0]}", "Nunito", sans-serif`; }
function measure(c, it) {
  c.font = itemFont(it); const lines = textLines(it);
  const w = Math.max(...lines.map(l => c.measureText(l).width), 10), h = lines.length * it.size * 1.12;
  return { w, h };
}
function drawItems(c) {
  for (const it of st.items) {
    c.save(); c.font = itemFont(it); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const lines = textLines(it), lh = it.size * 1.12, top = it.y - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => {
      if (it.strokeOn && !it.emoji) { c.lineWidth = Math.max(3, it.size / 7); c.strokeStyle = it.strokeColor; c.strokeText(l, it.x, top + i * lh); }
      c.fillStyle = it.color; c.fillText(l, it.x, top + i * lh);
    });
    c.restore();
  }
}
function render() {
  ctx.clearRect(0, 0, S, S);
  drawBase(ctx, false);
  ctx.drawImage(paint, 0, 0);
  drawItems(ctx);
  const it = st.items[st.sel];
  if (it) { const { w, h } = measure(ctx, it); ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = '#7bdb9b'; ctx.strokeRect(it.x - w / 2 - 8, it.y - h / 2 - 6, w + 16, h + 12); ctx.restore(); }
  if (st.kind === 'video' && st.video && !st.video.paused && st.video.currentTime >= st.vStart + st.vDur) st.video.currentTime = st.vStart;
  if (st.kind === 'video' && st.video) $('#v-time').textContent = fmt(Math.max(0, st.video.currentTime - st.vStart));
  requestAnimationFrame(render);
}

// ---------- ponteiro: mover, zoom com dois dedos, pintar, arrastar textos ----------
const pts = new Map(); let drag = null, pinch = null, last = null;
const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * S / r.width, y: (e.clientY - r.top) * S / r.height }; };
function hitItem(p) {
  for (let i = st.items.length - 1; i >= 0; i--) { const it = st.items[i]; const { w, h } = measure(ctx, it); if (Math.abs(p.x - it.x) <= w / 2 + 12 && Math.abs(p.y - it.y) <= h / 2 + 10) return i; }
  return -1;
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, toCanvas(e));
  const p = toCanvas(e);
  if (pts.size === 2 && st.tool === 'move') { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: st.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, x: st.x, y: st.y }; drag = null; return; }
  if (st.tool === 'brush' || st.tool === 'eraser') { pushHist(); last = p; stroke(p, p); return; }
  const hit = hitItem(p);
  if (hit >= 0) { st.sel = hit; showSel(); pushHist(); drag = { item: hit, dx: p.x - st.items[hit].x, dy: p.y - st.items[hit].y }; return; }
  if (st.tool === 'text') { addText(p); return; }
  if (st.sel >= 0) { st.sel = -1; showSel(); }
  if (st.kind === 'image' || st.kind === 'video') drag = { base: true, sx: p.x - st.x, sy: p.y - st.y };
});
cv.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, toCanvas(e)); const p = toCanvas(e);
  if (pinch && pts.size === 2) {
    const [a, b] = [...pts.values()]; const k = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d;
    zoomAround(pinch.s * k, pinch.cx, pinch.cy, pinch); return;
  }
  if (last) { stroke(last, p); last = p; return; }
  if (drag?.base) { st.x = p.x - drag.sx; st.y = p.y - drag.sy; return; }
  if (drag) { const it = st.items[drag.item]; it.x = p.x - drag.dx; it.y = p.y - drag.dy; }
});
const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { drag = null; last = null; } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { if (st.tool !== 'move' || !st.srcW) return; e.preventDefault(); const p = toCanvas(e); zoomAround(st.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08), p.x, p.y); }, { passive: false });
function zoomAround(ns, cx, cy, from = null) {
  ns = Math.min(Math.max(ns, 0.02), 40); const o = from || { s: st.s, x: st.x, y: st.y };
  st.x = cx - (cx - o.x) * ns / o.s; st.y = cy - (cy - o.y) * ns / o.s; st.s = ns; syncZoom();
}
function stroke(a, b) {
  pctx.save(); pctx.lineCap = pctx.lineJoin = 'round';
  if (st.tool === 'eraser') { pctx.globalCompositeOperation = 'destination-out'; pctx.lineWidth = st.eraser; pctx.strokeStyle = '#000'; }
  else { pctx.lineWidth = st.brush.size; pctx.strokeStyle = st.brush.color; }
  pctx.beginPath(); pctx.moveTo(a.x, a.y); pctx.lineTo(b.x + 0.01, b.y); pctx.stroke(); pctx.restore();
}

// ---------- ferramentas ----------
const HINTS = { move: 'Arraste para mover. Use dois dedos (ou a rodinha do mouse) para dar zoom.', brush: 'Desenhe com o dedo ou o mouse.', eraser: 'Passe por cima do desenho para apagar.', text: 'Toque na figurinha para colocar um texto; toque num texto para editar ou arrastar.', emoji: 'Escolha um emoji; depois arraste ele na figurinha.' };
function setTool(t) {
  st.tool = t; $$('.tool[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('#stage').classList.toggle('draw', t === 'brush' || t === 'eraser');
  for (const p of ['brush', 'eraser', 'text', 'emoji']) $('#p-' + p).hidden = p !== t;
  $('#p-move').hidden = t !== 'move' || st.kind === 'blank';
  $('#hint').textContent = HINTS[t];
}
$$('.tool[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
function swatches(el, get, set) {
  el.innerHTML = COLORS.map(c => `<button style="background:${c}" data-c="${c}" aria-label="Cor ${c}"></button>`).join('') + '<label aria-label="Outra cor"><input type="color"></label>';
  const sync = () => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === get())));
  el.onclick = e => { const b = e.target.closest('button'); if (b) { set(b.dataset.c); sync(); } };
  el.querySelector('input').oninput = e => { set(e.target.value); sync(); };
  sync(); return sync;
}
swatches($('#sw-brush'), () => st.brush.color, c => { st.brush.color = c; });
const bindRange = (id, fn, out = v => v) => { const i = $(id); const o = i.parentElement.querySelector('output'); const go = () => { fn(+i.value); o.textContent = out(+i.value); }; i.oninput = go; return i; };
bindRange('#brush-size', v => { st.brush.size = v; });
bindRange('#eraser-size', v => { st.eraser = v; });
$('#clear-paint').onclick = () => { pushHist(); pctx.clearRect(0, 0, S, S); };

// textos e emojis
function addText(p) {
  pushHist();
  st.items.push({ text: 'Texto', x: p?.x ?? S / 2, y: p?.y ?? S * 0.82, size: 64, font: 'Nunito', color: '#ffffff', strokeOn: true, strokeColor: '#000000' });
  st.sel = st.items.length - 1; setTool('text'); showSel(); $('#t-val').select();
}
$('#add-text').onclick = () => addText();
function addEmoji(e) { pushHist(); st.items.push({ text: e, emoji: true, x: S / 2, y: S / 2, size: 120, font: 'Nunito', color: '#000', strokeOn: false, strokeColor: '#000' }); st.sel = st.items.length - 1; showSel(); }
$('#emojis').innerHTML = EMOJIS.map(e => `<button aria-label="${e}">${e}</button>`).join('');
$('#emojis').onclick = e => { const b = e.target.closest('button'); if (b) addEmoji(b.textContent); };
$('#emoji-any').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { addEmoji(e.target.value.trim()); e.target.value = ''; } };
$('#t-fonts').innerHTML = FONTS.map(([f, w, n]) => `<button data-f="${f}" style="font-family:'${f}';font-weight:${w}">${n}</button>`).join('');
const syncTextColor = swatches($('#sw-text'), () => st.items[st.sel]?.color, c => { const it = st.items[st.sel]; if (it) it.color = c; });
const syncStrokeColor = swatches($('#sw-stroke'), () => st.items[st.sel]?.strokeColor, c => { const it = st.items[st.sel]; if (it) it.strokeColor = c; });
function showSel() {
  const it = st.items[st.sel];
  $('#text-edit').hidden = !it; $('#text-tip').hidden = !!it;
  if (!it) return;
  if (st.tool !== 'text') setTool('text');
  $('#t-val').value = it.text; $('#t-size').value = it.size; $('#t-size-o').textContent = it.size; $('#t-stroke').checked = it.strokeOn;
  $('#t-val').closest('label').hidden = !!it.emoji; $('#t-fonts').hidden = $('#sw-text').hidden = $('#sw-stroke').hidden = !!it.emoji;
  $('#t-stroke').closest('.row-sw').hidden = !!it.emoji;
  $$('#t-fonts button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === it.font)));
  syncTextColor(); syncStrokeColor();
}
$('#t-val').oninput = e => { const it = st.items[st.sel]; if (it) it.text = e.target.value; };
$('#t-fonts').onclick = e => { const b = e.target.closest('button'); const it = st.items[st.sel]; if (b && it) { it.font = b.dataset.f; showSel(); document.fonts?.load(`40px "${b.dataset.f}"`); } };
bindRange('#t-size', v => { const it = st.items[st.sel]; if (it) it.size = v; });
$('#t-stroke').onchange = e => { const it = st.items[st.sel]; if (it) it.strokeOn = e.target.checked; };
$('#t-del').onclick = () => { if (st.sel < 0) return; pushHist(); st.items.splice(st.sel, 1); st.sel = -1; showSel(); };
addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel >= 0) { pushHist(); st.items.splice(st.sel, 1); st.sel = -1; showSel(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#redo') : $('#undo')).click(); }
});

// enquadrar / ajustes
function syncZoom() { const [w, h] = baseDims(); const base = w ? Math.min(S / w, S / h) : 1; const pct = Math.round(st.s / base * 100); $('#zoom').value = Math.min(400, Math.max(10, pct)); $('#zoom-o').textContent = pct + '%'; }
$('#zoom').oninput = e => { const [w, h] = baseDims(); if (!w) return; zoomAround(Math.min(S / w, S / h) * e.target.value / 100, S / 2, S / 2); };
$('#fit-contain').onclick = () => fit('contain'); $('#fit-cover').onclick = () => fit('cover');
$('#rotate').onclick = () => { st.rot = (st.rot + 90) % 360; fit('contain'); };
$('#flip').onclick = () => { st.flip = !st.flip; };
for (const [id, k] of [['#f-bri', 'bri'], ['#f-con', 'con'], ['#f-sat', 'sat']]) bindRange(id, v => { st.filt[k] = v; });
$('#bgs').onchange = () => { const v = $('input[name=bg]:checked').value; st.bg = v === 'custom' ? $('#bg-custom').value : v; };
$('#bg-custom').oninput = e => { $('input[name=bg][value=custom]').checked = true; st.bg = e.target.value; };

// ---------- carregar a midia ----------
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não consegui abrir essa imagem.')); i.src = src; });
}
function loadVideo(src) {
  return new Promise((res, rej) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.loop = false; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.onended = () => { v.currentTime = st.vStart; v.play().catch(() => {}); }; // volta para o comeco do trecho
    v.onloadeddata = () => res(v); v.onerror = () => rej(new Error('Não consegui abrir esse vídeo. Tente MP4.')); v.src = src;
  });
}
async function start(kind, { file, base } = {}) {
  showMsg('Abrindo…', true);
  try {
    st.kind = kind; st.img = st.video = null; st.srcW = st.srcH = 0; st.rot = 0; st.flip = false; st.videoFile = null; st.videoFromBase = false; st.uploadedVideo = null;
    if (kind === 'image') {
      const src = base ? URL.createObjectURL(await (await api('/api/fig/midia')).blob()) : URL.createObjectURL(file);
      st.img = await loadImage(src); st.srcW = st.img.naturalWidth; st.srcH = st.img.naturalHeight; fit('contain');
    } else if (kind === 'video') {
      if (file && file.size > 60 * 1024 * 1024) throw new Error('Esse vídeo passa de 60 MB. Escolha um menor ou corte antes.');
      const src = base ? URL.createObjectURL(await (await api('/api/fig/midia')).blob()) : URL.createObjectURL(file);
      st.video = await loadVideo(src); st.srcW = st.video.videoWidth; st.srcH = st.video.videoHeight; st.videoFile = file || null; st.videoFromBase = !!base;
      const dur = isFinite(st.video.duration) ? st.video.duration : 8;
      $('#v-start').max = Math.max(0, dur - 0.5).toFixed(1); $('#v-dur').max = Math.min(8, dur).toFixed(1); $('#v-dur').value = Math.min(8, dur).toFixed(1);
      st.vStart = 0; st.vDur = +$('#v-dur').value; $('#v-start').value = 0; $('#v-start-o').textContent = fmt(0); $('#v-dur-o').textContent = fmt(st.vDur);
      fit('contain'); st.video.play().catch(() => {});
    }
    $$('.img-only').forEach(e => { e.hidden = kind !== 'image'; }); $('#snd-len').hidden = kind === 'video' || !['mp3', 'outro', 'gravar'].includes(st.som);
    $$('.vid-only').forEach(e => { e.hidden = kind !== 'video'; });
    $('#p-video').hidden = kind !== 'video';
    $('#move-title').textContent = kind === 'video' ? 'Enquadrar o vídeo' : 'Enquadrar a foto';
    if (kind === 'blank') { st.bg = ''; }
    if (st.som === 'video' && kind !== 'video') { $('input[name=som][value=nenhum]').checked = true; setSom('nenhum'); }
    $('#ed-start').hidden = true; $('#ed-msg').hidden = true; $('#ed-main').hidden = false;
    setTool(kind === 'blank' ? 'brush' : 'move'); syncUndo();
  } catch (e) { showMsg(e.message, false, true); }
}
$$('[data-pick]').forEach(b => b.onclick = () => {
  const k = b.dataset.pick; if (k === 'blank') return start('blank');
  const inp = k === 'image' ? $('#file-image') : $('#file-video'); inp.value = ''; inp.click();
});
$('#file-image').onchange = e => e.target.files[0] && start('image', { file: e.target.files[0] });
$('#file-video').onchange = e => { const f = e.target.files[0]; if (!f) return; start(f.type === 'image/gif' ? 'video' : 'video', { file: f }); };
$('#pk-base').onclick = () => start(meta.base, { base: true });
$('#restart').onclick = () => {
  if ((hist.length || st.items.length) && !confirm('Começar outra figurinha? O que você fez nesta vai sumir.')) return;
  pctx.clearRect(0, 0, S, S); st.items = []; st.sel = -1; hist.length = 0; redoStack.length = 0; st.video?.pause();
  $('#ed-main').hidden = true; $('#ed-start').hidden = false; $('#send-msg').textContent = ''; scrollTo(0, 0);
};

// trecho do video
bindRange('#v-start', v => { st.vStart = v; if (st.video) st.video.currentTime = v; }, fmt);
bindRange('#v-dur', v => { st.vDur = v; }, fmt);
$('#v-play').onclick = () => { const v = st.video; if (!v) return; if (v.paused) { v.play(); $('#v-play .ms').textContent = 'pause'; } else { v.pause(); $('#v-play .ms').textContent = 'play_arrow'; } };

// ---------- som ----------
const aud = $('#aud');
function setSom(v) {
  st.som = v;
  const needFile = v === 'mp3' || v === 'outro';
  $('#snd-file').hidden = !(needFile && st.audioFile && st.audioKind === v);
  $('#snd-rec').hidden = v !== 'gravar';
  $('#snd-len').hidden = st.kind === 'video' || !['mp3', 'outro', 'gravar'].includes(v);
  $('#snd-play').hidden = v === 'nenhum' || ((needFile || v === 'gravar') && !(st.audioFile && st.audioKind === v));
  if (st.video) st.video.muted = v !== 'video';
  if (needFile && !(st.audioFile && st.audioKind === v)) { const inp = v === 'mp3' ? $('#file-mp3') : $('#file-outro'); inp.value = ''; inp.click(); }
}
$('#snd').onchange = e => { if (e.target.name === 'som') setSom(e.target.value); };
async function useAudio(blob, name, kind) {
  st.audioFile = blob; st.audioName = name; st.audioKind = kind; st.uploadedAudio = null;
  aud.src = URL.createObjectURL(blob);
  await new Promise(r => { aud.onloadedmetadata = r; aud.onerror = r; setTimeout(r, 4000); });
  st.audioDur = isFinite(aud.duration) ? aud.duration : 30;
  $('#snd-name').textContent = name; $('#snd-start').max = Math.max(0, st.audioDur - 0.5).toFixed(1); $('#snd-start').value = 0; st.sStart = 0; $('#snd-start-o').textContent = fmt(0);
  $('#snd-dur').max = Math.min(30, Math.max(1, st.audioDur)).toFixed(1); st.sDur = Math.min(+$('#snd-dur').value, +$('#snd-dur').max); $('#snd-dur').value = st.sDur; $('#snd-dur-o').textContent = st.sDur + ' s';
  setSom(kind);
}
$('#file-mp3').onchange = e => e.target.files[0] && useAudio(e.target.files[0], e.target.files[0].name, 'mp3');
$('#file-outro').onchange = e => e.target.files[0] && useAudio(e.target.files[0], e.target.files[0].name, 'outro');
$('#snd-change').onclick = () => { const inp = st.som === 'outro' ? $('#file-outro') : $('#file-mp3'); inp.value = ''; inp.click(); };
bindRange('#snd-start', v => { st.sStart = v; }, fmt);
bindRange('#snd-dur', v => { st.sDur = v; }, v => v + ' s');
let playT = null;
$('#snd-play').onclick = () => {
  clearTimeout(playT);
  if (st.som === 'video' && st.video) { st.video.currentTime = st.vStart; st.video.muted = false; st.video.play(); return; }
  const len = st.kind === 'video' ? st.vDur : st.sDur;
  aud.currentTime = st.som === 'gravar' ? 0 : st.sStart; aud.play();
  if (st.kind === 'video' && st.video) { st.video.currentTime = st.vStart; st.video.play(); }
  playT = setTimeout(() => aud.pause(), len * 1000);
};
// gravar na hora
let rec = null, recT0 = 0, recTimer = null;
$('#rec-btn').onclick = async () => {
  if (rec) { rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
    const chunks = []; rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); clearInterval(recTimer);
      $('#rec-btn').classList.remove('on'); $('#rec-btn').innerHTML = '<span class="ms">mic</span>Gravar de novo';
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); rec = null;
      const secs = (Date.now() - recT0) / 1000;
      await useAudio(blob, `Gravação de ${fmt(secs)}`, 'gravar');
      st.audioDur = secs; $('#snd-dur').max = Math.min(30, Math.max(1, secs)).toFixed(1); st.sDur = Math.min(30, Math.max(1, +secs.toFixed(1))); $('#snd-dur').value = st.sDur; $('#snd-dur-o').textContent = st.sDur + ' s';
      $('#rec-tip').textContent = 'Pronto! Toque em "Ouvir o trecho" para conferir.';
    };
    rec.start(250); recT0 = Date.now();
    $('#rec-btn').classList.add('on'); $('#rec-btn').innerHTML = '<span class="ms">stop</span>Parar';
    const max = st.kind === 'video' ? st.vDur : 30;
    recTimer = setInterval(() => { const s = (Date.now() - recT0) / 1000; $('#rec-time').textContent = fmt(s); if (s >= max) rec?.stop(); }, 100);
    if (st.kind === 'video' && st.video) { st.video.currentTime = st.vStart; st.video.play(); } // grava vendo o video
  } catch { $('#rec-tip').textContent = 'Não consegui usar o microfone. Libere o microfone para este site nas configurações do navegador.'; }
};
const extOf = (name, type) => { const m = /\.([a-z0-9]{2,4})$/i.exec(name || ''); if (m) return m[1].toLowerCase(); return /ogg/.test(type) ? 'ogg' : /mp4|m4a|aac/.test(type) ? 'm4a' : /mpeg|mp3/.test(type) ? 'mp3' : 'webm'; };

// ---------- enviar ----------
function exportCanvas(withBase) {
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S }), x = c.getContext('2d');
  if (withBase) drawBase(x, true); else if (st.kind === 'blank' && st.bg) { x.fillStyle = st.bg; x.fillRect(0, 0, S, S); }
  x.drawImage(paint, 0, 0); drawItems(x);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
const say = (t, cls = '') => { const m = $('#send-msg'); m.textContent = t; m.className = 'send-msg ' + cls; };
$('#send').onclick = async () => {
  const btn = $('#send'); btn.disabled = true;
  try {
    if (['mp3', 'outro', 'gravar'].includes(st.som) && !st.audioFile) throw new Error('Escolha ou grave o áudio primeiro (ou marque "Sem som").');
    const opts = { tipo: st.kind === 'video' ? 'video' : 'image', som: st.som === 'video' ? 'video' : st.som === 'nenhum' ? 'nenhum' : 'arquivo', pacote: $('#pack').value.trim(), autor: $('#author').value.trim() };
    if (st.kind === 'video') {
      say('Preparando o desenho…');
      await upload('overlay', await exportCanvas(false), 'png');
      if (st.videoFile && st.uploadedVideo !== st.videoFile) {
        await upload('video', st.videoFile, extOf(st.videoFile.name, st.videoFile.type), p => say(`Enviando o vídeo… ${Math.round(p * 100)}%`));
        st.uploadedVideo = st.videoFile;
      }
      Object.assign(opts, { inicio: st.vStart, duracao: st.vDur, escala: st.s, largura: st.srcW, altura: st.srcH, x: st.x, y: st.y, fundo: st.bg });
    } else {
      say('Preparando a imagem…');
      // com fundo transparente e "so desenho", o fundo fica vazio mesmo
      await upload('final', await exportCanvas(true), 'png');
    }
    if (opts.som === 'arquivo') {
      if (st.uploadedAudio !== st.audioFile) { await upload('audio', st.audioFile, extOf(st.audioName, st.audioFile.type), p => say(`Enviando o áudio… ${Math.round(p * 100)}%`)); st.uploadedAudio = st.audioFile; }
      Object.assign(opts, { somInicio: st.som === 'gravar' ? 0 : st.sStart, somDuracao: st.sDur });
    }
    say(st.kind === 'video' ? 'Montando a figurinha animada… (uns 10 segundos)' : 'Montando a figurinha…');
    const r = await apiJson('/api/fig/criar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) });
    say(`✓ Pronto! A figurinha${r.comSom ? ' com som' : ''} chegou ${meta.chat && meta.chat !== 'conversa privada' ? `no grupo "${meta.chat}"` : 'no WhatsApp'}.`, 'ok');
  } catch (e) { say(e.message || 'Deu erro. Tente de novo.', 'err'); }
  btn.disabled = false;
};

// ---------- abrir ----------
function showMsg(text, loading, error) {
  $('#ed-msg').hidden = false; $('#ed-msg').innerHTML = `<span class="ms ${loading ? 'spin' : ''}">${loading ? 'progress_activity' : error ? 'link_off' : 'info'}</span><p>${text}</p>`;
}
(async () => {
  setTool('move');
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(TOKEN)) return showMsg('Abra este editor pelo link que o bot manda quando você usa <b>/editarfig</b> no WhatsApp.', false, true);
  try {
    meta = await apiJson('/api/fig');
    $('#ed-chat').textContent = meta.chat ? `A figurinha vai para: ${meta.chat === 'conversa privada' ? 'a conversa onde você pediu' : `"${meta.chat}"`}` : '';
    if (meta.pacote) $('#pack').value = meta.pacote; if (meta.autor) $('#author').value = meta.autor;
    if (meta.base) { $('#pk-base').hidden = false; $('#pk-base-sub').textContent = meta.base === 'video' ? 'Vídeo ou figurinha animada' : 'Imagem'; }
    $('#ed-msg').hidden = true; $('#ed-start').hidden = false;
    requestAnimationFrame(render);
    // ja carrega as fontes do texto
    for (const [f] of FONTS) document.fonts?.load(`40px "${f}"`).catch(() => {});
  } catch (e) { showMsg(e.message, false, true); }
})();
