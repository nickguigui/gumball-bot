// Service worker: deixa o site abrir como app (e sem internet mostra a ultima versao salva).
// Rede primeiro para as paginas do site; a API do bot e o GitHub nunca ficam em cache.
const CACHE = 'gumball-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'galeria.js', 'commands.json', 'editor.html', 'editor.css', 'editor.js', 'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API, GitHub, fontes: direto da rede
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
