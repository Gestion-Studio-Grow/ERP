// LA PÁGINA DE UNA DIRECCIÓN SIN NEGOCIO (E1, fuga de marca, 29/10/2026). El apex y cualquier subdominio que no lleva a
// un negocio (mal escrito, inventado, todavía no publicado) mostraban la landing de CH con los nombres de su equipo.
// Ahora ven esta página: de GSG, sin marca de ningún cliente, y con una salida para el dueño.
//
// HTML autocontenido a propósito (como los sitios estáticos de src/lib/sitio-estatico.ts): 0 JavaScript, 0 imágenes,
// CSS en línea y UNA letra (Geist latin, la del producto GSG, auto-hospedada en public/gsg/). Pesa ~40 KB con la letra,
// contra ~380 KB de la landing que servía antes. PURA: recibe el host ya leído y devuelve el texto.

import { logoGsgSvg, ISOTIPO_GSG_PATHS } from "./marca-svg";
import { buildWhatsAppHref } from "@/lib/whatsapp-cta";

/** Escapa texto para meterlo en HTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** El host tal como se muestra: sin puerto, en minúscula y sólo con caracteres de nombre de dominio. PURA. */
export function hostVisible(host: string | null | undefined): string | null {
  const h = (host ?? "").split(",")[0].trim().toLowerCase().split(":")[0];
  return /^[a-z0-9.-]{1,253}$/.test(h) ? h : null;
}

/**
 * La cáscara común de las páginas neutras de GSG (sin negocio, servicio caído): `<head>` con la letra de GSG, la paleta
 * neutra y el ícono. PURA. `indexable: false` agrega `<meta name="robots" content="noindex">` (además del header que
 * manda cada ruta: un HTML guardado o servido por un CDN sigue diciendo lo mismo).
 */
function cabezaGsg({ titulo, descripcion, indexable }: { titulo: string; descripcion: string; indexable: boolean }): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">${indexable ? "" : `
<meta name="robots" content="noindex, nofollow">`}
<meta name="theme-color" content="#f4f5f4">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#191b1c'/><g transform='translate(12 13) scale(1.1)' color='#f4f5f4'>${ISOTIPO_GSG_PATHS.replace(/"/g, "'")}</g></svg>`)}">
<link rel="preload" href="/gsg/geist-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;src:url(/gsg/geist-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+2215}
:root{--papel:#f4f5f4;--tarjeta:#fff;--tinta:#191b1c;--cuerpo:#35363a;--apagado:#5f6065;--linea:#e2e2df;color-scheme:light}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100dvh;display:flex;flex-direction:column;background:var(--papel);color:var(--cuerpo);font:400 17px/1.6 Geist,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;
background-image:radial-gradient(rgba(25,27,28,.07) .8px,transparent .9px);background-size:24px 24px}
a{color:inherit}
:focus-visible{outline:2px solid var(--tinta);outline-offset:3px;border-radius:6px}
.marco{width:100%;max-width:72rem;margin:0 auto;padding:0 1.5rem}
header .marco{height:72px;display:flex;align-items:center;justify-content:space-between;gap:1rem}
.logo{display:inline-flex;color:var(--tinta);text-decoration:none;min-height:44px;align-items:center}
.entrar{display:inline-flex;align-items:center;min-height:44px;padding:0 .25rem;font-size:15px;font-weight:550;color:var(--tinta);text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px}
main{flex:1}
.col{max-width:46rem;padding-top:96px}
.host{font-size:13px;font-weight:550;letter-spacing:.14em;text-transform:uppercase;color:var(--apagado);font-variant-numeric:tabular-nums;margin:0 0 20px;overflow-wrap:anywhere}
h1{margin:0;font-size:56px;line-height:1.05;font-weight:620;letter-spacing:-.025em;color:var(--tinta);text-wrap:balance}
.bajada{margin:24px 0 0;font-size:19px;max-width:38rem;text-wrap:pretty}
.tarjetas{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:56px;max-width:60rem}
.tarjeta{background:var(--tarjeta);border:1px solid var(--linea);border-radius:16px;padding:28px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 2px rgba(25,27,28,.04),0 8px 24px -12px rgba(25,27,28,.12)}
.tarjeta h2{margin:0;font-size:22px;line-height:1.25;font-weight:620;letter-spacing:-.015em;color:var(--tinta)}
.tarjeta p{margin:0}
.tarjeta .acciones{margin-top:auto;padding-top:8px;display:flex;flex-wrap:wrap;gap:12px}
.dir{font-variant-numeric:tabular-nums;color:var(--tinta);font-weight:550;overflow-wrap:anywhere}
.dir i{font-style:normal;background:#ecece8;border-radius:4px;padding:0 .3em}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:12px;font-size:16px;font-weight:600;text-decoration:none;transition:transform .12s ease,box-shadow .12s ease}
.btn-solido{background:var(--tinta);color:#fff}
.btn-solido:hover{box-shadow:0 6px 18px -6px rgba(25,27,28,.45);transform:translateY(-1px)}
.btn-linea{border:1px solid #c9c9c4;color:var(--tinta);background:transparent}
.btn-linea:hover{border-color:var(--tinta)}
footer{margin-top:96px}
footer .marco{border-top:1px solid var(--linea);padding-top:24px;padding-bottom:32px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:13px;color:var(--apagado)}
@media (max-width:720px){
 header .marco{height:64px}
 .col{padding-top:56px}
 h1{font-size:36px;line-height:1.1}
 .bajada{font-size:17px;margin-top:18px}
 .tarjetas{grid-template-columns:1fr;margin-top:40px;gap:16px}
 .tarjeta{padding:22px}
 .tarjeta .acciones .btn{flex:1}
 footer{margin-top:64px}
}
@media (prefers-reduced-motion:reduce){.btn{transition:none}.btn-solido:hover{transform:none}}
</style>
</head>
`;
}

export function htmlSinNegocio({ host, whatsappGsg, indexable = false }: { host: string | null; whatsappGsg: string | null; indexable?: boolean }): string {
  const visible = hostVisible(host);
  const wa = whatsappGsg
    ? buildWhatsAppHref(whatsappGsg, `Hola, entré a ${visible ?? "una dirección de gsgapp"} y dice que todavía no hay un negocio publicado.`)
    : null;
  return `${cabezaGsg({ titulo: "GSG — Gestión Studio Grow", descripcion: "Esta dirección es de GSG, la plataforma de gestión de Gestión Studio Grow. Todavía no hay un negocio publicado acá.", indexable })}<body>
<header><div class="marco">
<a class="logo" href="https://gsgapp.com.ar/" aria-label="GSG — Gestión Studio Grow">${logoGsgSvg({ alto: 32 })}</a>
<a class="entrar" href="/admin/login">Entrar a tu panel</a>
</div></header>
<main><div class="marco"><div class="col">
${visible ? `<p class="host">${esc(visible)}</p>` : ""}
<h1>Acá todavía no hay un negocio publicado.</h1>
<p class="bajada">Esta dirección es de GSG, la plataforma de gestión de Gestión Studio Grow. Si te la pasaron, puede estar mal escrita o todavía no estar activa.</p>
</div>
<div class="tarjetas">
<section class="tarjeta" aria-labelledby="t-duenio">
<h2 id="t-duenio">¿Sos el dueño del negocio?</h2>
<p>Tu panel vive en la dirección de tu negocio: <span class="dir"><i>tunegocio</i>.gsgapp.com.ar/admin</span>.</p>
<div class="acciones"><a class="btn btn-solido" href="/admin/login">Entrar a tu panel</a></div>
</section>
<section class="tarjeta" aria-labelledby="t-gsg">
<h2 id="t-gsg">¿Qué es GSG?</h2>
<p>Un sistema de gestión para negocios reales: turnos, ventas, stock, cobros y facturación, con la vidriera y la marca de cada cliente.</p>
${wa ? `<div class="acciones"><a class="btn btn-linea" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">Escribinos por WhatsApp</a></div>` : ""}
</section>
</div></div></main>
<footer><div class="marco"><span>© 2026 Gestión Studio Grow</span><span>powered by GSG</span></div></footer>
</body>
</html>`;
}

/**
 * La página de una dirección CON negocio cuando la base no responde (P0 ronda 2, 30/10/2026). Antes, «no sé si hay
 * negocio» se trataba como «hay negocio» y cualquier host pintaba la landing de CH con su copy. Ahora: una página de
 * GSG, sin marca de ningún cliente, que dice lo que pasa y ofrece reintentar. No lee nada (la base está caída): sólo el
 * host del pedido para mostrarlo. Siempre `noindex`: un buscador no debe guardar una caída.
 */
export function htmlSinServicio({ host }: { host: string | null }): string {
  const visible = hostVisible(host);
  return `${cabezaGsg({ titulo: "Volvemos en un rato · GSG", descripcion: "El sitio no está disponible en este momento. Probá de nuevo en unos minutos.", indexable: false })}<body>
<header><div class="marco">
<span class="logo" aria-label="GSG — Gestión Studio Grow">${logoGsgSvg({ alto: 32 })}</span>
</div></header>
<main><div class="marco"><div class="col">
${visible ? `<p class="host">${esc(visible)}</p>` : ""}
<h1>Volvemos en un rato.</h1>
<p class="bajada">El sitio no está disponible en este momento: es un problema nuestro, no de tu conexión. Probá de nuevo en unos minutos.</p>
<div class="tarjetas" style="grid-template-columns:1fr;max-width:28rem"><section class="tarjeta" aria-labelledby="t-reintentar">
<h2 id="t-reintentar">¿Ibas a reservar o a comprar?</h2>
<p>No se perdió nada: cuando vuelva, empezás de nuevo desde el inicio.</p>
<div class="acciones"><a class="btn btn-solido" href="/">Probar de nuevo</a></div>
</section></div>
</div></div></main>
<footer><div class="marco"><span>© ${new Date().getFullYear()} Gestión Studio Grow</span><span>powered by GSG</span></div></footer>
</body>
</html>`;
}
