// Unboxing Fest: deja los juegos y Three.js guardados para jugar sin señal (el 4G colapsa en los festivales).
const V = 'unboxingfest-v1';
const BASE = new URL('./', self.location).pathname;
const LOCAL = ['', 'index.html', 'farmaonline-abrilo-vos.html', 'farmaonline-ruta-del-pedido.html', 'farmaonline-cuidado-en-el-festi.html'].map(f => BASE + f);
const REMOTE = ['https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => Promise.all([...LOCAL, ...REMOTE].map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return; // los envíos a la planilla nunca pasan por la caché
  const mine = u.origin === location.origin && u.pathname.startsWith(BASE);
  const cdn = u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (!mine && !cdn) return;
  // red primero para los juegos (para tomar la última versión), caché si no hay señal; caché primero para lo externo
  if (mine) e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); return res; })));
});
