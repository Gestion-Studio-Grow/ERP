/*
 * FACTURITA · Service worker MÍNIMO y SEGURO (alcance: /facturita/).
 *
 * Qué hace: guarda SÓLO la página «sin conexión» y los íconos (estáticos y públicos). Cuando una
 * pantalla de Facturita no se puede abrir porque no hay internet, muestra esa página en vez del
 * dinosaurio del navegador.
 *
 * Qué NO hace, nunca (es la regla de la casa, ver src/lib/facturita-pwa.ts y el antecedente en
 * src/app/api/pwa/admin.webmanifest/route.ts):
 *   - no guarda navegaciones ni respuestas de la app con sesión (/facturita/app/**);
 *   - no guarda server actions, POST, /api ni nada con datos fiscales;
 *   - no toca pedidos fuera de /facturita/ ni de otro origen;
 *   - no sirve nada viejo: lo que tiene red, va a la red.
 *
 * Para publicar una versión nueva: cambiar VERSION. El `activate` borra las cachés viejas de
 * Facturita (y sólo las de Facturita).
 */

const VERSION = "facturita-v1";
const PREFIJO_CACHE = "facturita-";
const OFFLINE_URL = "/facturita/sin-conexion.html";
const PRECACHE = [
  OFFLINE_URL,
  "/facturita/icon.svg",
  "/facturita/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((clave) => clave.startsWith(PREFIJO_CACHE) && clave !== VERSION)
            .map((clave) => caches.delete(clave)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const pedido = event.request;
  if (pedido.method !== "GET") return; // server actions, formularios: siempre red, sin tocar
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/facturita/") && url.pathname !== "/facturita") return;

  // Los estáticos precargados (íconos, la página sin conexión): de la caché, que son públicos.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((guardado) => guardado || fetch(pedido)));
    return;
  }

  // Navegaciones: SIEMPRE a la red. Sólo si la red falla, la página «sin conexión».
  // La respuesta de la red NO se guarda (puede traer datos de la sesión).
  if (pedido.mode === "navigate") {
    event.respondWith(
      fetch(pedido).catch(() =>
        caches.match(OFFLINE_URL).then(
          (pagina) =>
            pagina ||
            new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }),
        ),
      ),
    );
  }
  // Todo lo demás (RSC, chunks, datos): el navegador hace lo de siempre.
});
