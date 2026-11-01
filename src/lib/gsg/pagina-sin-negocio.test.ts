import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlSinNegocio, hostVisible } from "./pagina-sin-negocio";

test("no lleva NADA de CH ni de ningún cliente (la fuga del 29/10)", () => {
  const html = htmlSinNegocio({ host: "redsur.gsgapp.com.ar", whatsappGsg: null });
  for (const fuga of ["Carolina", "Macarena", "Romina", "Alameda", "ch-hero", "Estética", "Panel de gestión"]) assert.ok(!html.includes(fuga), fuga);
  assert.ok(!/\bspa\b/i.test(html), "spa");
  assert.match(html, /Acá todavía no hay un negocio publicado\./);
  assert.match(html, /<title>GSG — Gestión Studio Grow<\/title>/);
});

test("liviana: sin JavaScript ni imágenes raster, una sola letra", () => {
  const html = htmlSinNegocio({ host: "x.gsgapp.com.ar", whatsappGsg: "5491100000000" });
  assert.ok(!/<script/i.test(html));
  assert.ok(!/\.(png|jpe?g|webp|avif)/i.test(html));
  assert.equal(html.match(/\.woff2/g)?.length, 2); // el preload y el @font-face del mismo archivo
  assert.ok(Buffer.byteLength(html) < 12_000, `pesa ${Buffer.byteLength(html)} B`);
});

test("el host se muestra escapado y sólo si es un nombre de dominio", () => {
  assert.equal(hostVisible("Redsur.GSGapp.com.ar:443"), "redsur.gsgapp.com.ar");
  assert.equal(hostVisible('x"><script>alert(1)</script>'), null);
  const html = htmlSinNegocio({ host: '<img src=x onerror=alert(1)>', whatsappGsg: null });
  assert.ok(!html.includes("<img src=x"));
});

test("WhatsApp de GSG sólo si está cargado: no se inventa contacto", () => {
  assert.ok(!htmlSinNegocio({ host: null, whatsappGsg: null }).includes("wa.me"));
  assert.ok(htmlSinNegocio({ host: null, whatsappGsg: "5491122223333" }).includes("Escribinos por WhatsApp"));
});

// P0 ronda 2 (fail-open): con la base caída, cualquier host veía la landing de CH. Ahora ve esta página.
test("servicio caído: neutra, sin nada de CH, sin indexar y con salida", async () => {
  const { htmlSinServicio } = await import("./pagina-sin-negocio");
  const html = htmlSinServicio({ host: "chestetica.gsgapp.com.ar" });
  for (const fuga of ["Carolina", "Macarena", "Romina", "Alameda", "CH Estética", "Haponiuk", "Panel de gestión"]) assert.ok(!html.includes(fuga), fuga);
  assert.match(html, /Volvemos en un rato\./);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /href="\/">Probar de nuevo</);
  assert.ok(!/<script/i.test(html));
});

test("el apex tampoco se indexa (SEO ronda 2)", () => {
  assert.match(htmlSinNegocio({ host: "www.gsgapp.com.ar", whatsappGsg: null }), /<meta name="robots" content="noindex, nofollow">/);
});
