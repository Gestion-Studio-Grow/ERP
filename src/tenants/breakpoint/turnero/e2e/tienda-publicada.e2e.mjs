// E2E de la TIENDA en el sitio publicado de Break Point (breakpointpadel.gsgapp.com.ar), como la sirve el ERP
// (`responderSitioEstatico`, mismo montaje que sitio.e2e.mjs). Hotfix 04/11 «Pedidos para retirar no funciona»:
// sin el catálogo del club en publico.json la tienda quedaba oculta y /turnero#tienda no hacía nada.
//   1. portada → «Ver la tienda» (la tarjeta está aunque el club no haya publicado catálogo);
//   2. el celular del jugador (sitio publicado, sin WhatsApp del club): productos SIN precio, carrito → pedido T-XXXX
//      → «Mandalo por Instagram» (ig.me del club, mensaje copiado / a la vista con el código), nunca un wa.me pelado;
//   3. la compu del club (/club, otro navegador): «Cargar pedido recibido por mensaje» → aparece en «Pedidos de la
//      tienda para retirar» con los precios del club → «Entregar y cobrar» → sale de la lista; pegar el mismo
//      mensaje otra vez no lo vuelve a cargar (no se cobra dos veces);
//   4. ?demo=1 sin WhatsApp: también va por Instagram (no wa.me sin destinatario).
//
//   node src/tenants/breakpoint/empaquetar.mjs && node --import tsx src/tenants/breakpoint/turnero/e2e/tienda-publicada.e2e.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { responderSitioEstatico } from "../../../../lib/sitio-estatico.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const fallas = [];
const check = (cond, msj) => { if (!cond) { fallas.push(msj); console.error(`  ✗ ${msj}`); } else console.log(`  ✓ ${msj}`); };

const srv = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) { res.writeHead(308, { Location: url.pathname.slice(0, -1) }); return res.end(); }
  if (url.pathname.startsWith("/tenants/breakpoint/") && !url.pathname.includes("..")) {
    const b = await readFile(path.join(RAIZ, "public", url.pathname)).catch(() => null);
    res.writeHead(b ? 200 : 404, { "Content-Type": { ".woff2": "font/woff2", ".webp": "image/webp" }[path.extname(url.pathname)] ?? "application/octet-stream" });
    return res.end(b ?? undefined);
  }
  const r = await responderSitioEstatico("breakpoint", url.pathname.split("/").filter(Boolean), async (rel) => new Uint8Array(await readFile(path.join(RAIZ, rel))));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const BASE = `http://breakpointpadel.test:${srv.address().port}`;
const ARGS = [`--host-resolver-rules=MAP breakpointpadel.test 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${BASE}`];
const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ARGS }).catch(() => chromium.launch({ args: ARGS }));
const errores = [];
async function contexto(viewport) {
  const ctx = await navegador.newContext({ viewport });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // El chat de Instagram no se abre en la prueba (sería otro origen): se corta el pedido y se mira el link.
  await ctx.route(/ig\.me|instagram\.com|wa\.me/, (r) => r.abort());
  return ctx;
}
const vigilar = (p, nombre) => {
  p.on("pageerror", (e) => errores.push(`${nombre}: ${e.message}`));
  return p;
};

/** Arma un pedido en la tienda abierta: 1 tubo + 2 overgrips, con nombre y celular. Devuelve código y mensaje. */
async function encargar(t, nombre) {
  await t.waitForSelector("#dlg-tienda[open] [data-mas]", { timeout: 10000 });
  await t.click('#dlg-tienda [data-mas="p1"]');
  await t.click('#dlg-tienda [data-mas="p4"]');
  await t.click('#dlg-tienda [data-mas="p4"]');
  await t.fill("#tienda-nombre", nombre);
  await t.fill("#tienda-tel", "11 5555 0007");
  const total = await t.textContent("#carrito-total");
  await t.click("#btn-tienda-pedir");
  await t.waitForSelector("#tienda-listo:not([hidden])", { timeout: 6000 });
  return { total, codigo: (await t.textContent("#tienda-codigo")).trim(), mensaje: await t.inputValue("#tienda-texto"), href: await t.getAttribute("#tienda-wa", "href") };
}

// ───── 1 y 2. El celular del jugador, en el sitio publicado ─────
console.log("\n▶ tienda en el sitio publicado (sin WhatsApp ni catálogo del club)");
const cel = await contexto({ width: 390, height: 844 });
const portada = vigilar(await cel.newPage(), "portada");
await portada.goto(`${BASE}/`);
check(await portada.locator('a[href="/turnero#tienda"]').count() === 1, "la portada ofrece «Ver la tienda»");
await portada.click('a[href="/turnero#tienda"]');
const t = portada;
await t.waitForSelector("#dlg-tienda[open] [data-mas]", { timeout: 10000 }).catch(() => {});
check(await t.locator("#dlg-tienda[open]").count() === 1, "/turnero#tienda abre la tienda en el sitio publicado");
check(await t.isVisible("#btn-tienda"), "el encabezado del turnero publicado muestra «Tienda»");
const precios = await t.locator("#tienda-cat .prod-precio").allTextContents();
check(precios.length > 0 && precios.every((x) => x === "Precio en el club"), `sin catálogo publicado no hay precios de ejemplo (${precios.length} productos, «Precio en el club»)`);
const { total, codigo, mensaje, href } = await encargar(t, "Pedro Gómez");
check(total === "A confirmar en el club", `el total del carrito dice «A confirmar en el club» (${total})`);
check(/^T-[A-Z0-9]{4}$/.test(codigo), `el pedido sale con su código (${codigo})`);
check(href === "https://ig.me/m/breakpointpadel_" && /Instagram/.test(await t.textContent("#tienda-wa")), "«Mandalo por Instagram» al chat del club, sin wa.me pelado");
check(mensaje.includes(codigo) && /1 × Tubo de pelotas \(3\)/.test(mensaje) && /2 × Overgrip/.test(mensaje) && !/\$/.test(mensaje), `el mensaje lleva productos y código, sin precios (${mensaje.slice(0, 80)}…)`);
check(await t.isVisible("#tienda-texto"), "el pedido queda a la vista para copiarlo a mano");
await t.click("#tienda-wa");
await t.waitForFunction(() => /Copiado|No pudimos copiarlo/.test(document.querySelector("#tienda-copiado")?.textContent ?? ""), null, { timeout: 3000 }).catch(() => {});
check(/Copiado: pegalo en el chat|No pudimos copiarlo/.test(await t.textContent("#tienda-copiado")), "al tocar «Mandalo por Instagram» avisa que se copió (o deja el pedido seleccionado)");
check(await t.evaluate(() => document.documentElement.scrollWidth) <= 390, "tienda sin scroll horizontal a 390 px");
await cel.close();

// ───── 3. La compu del club: carga el pedido recibido por mensaje y lo cobra al entregar ─────
console.log("\n▶ el club carga el pedido recibido por mensaje y lo cobra una sola vez");
const pc = await contexto({ width: 1280, height: 860 });
const club = vigilar(await pc.newPage(), "club");
await club.goto(`${BASE}/club?demo=1`);
await club.waitForSelector('#tabs [data-a="tab"]', { timeout: 10000 });
const irBuffet = async () => {
  const vis = await club.$('#tabs [data-a="tab"][data-v="buffet"]');
  if (vis) await vis.click(); else { await club.click("#btn-mas"); await club.click('#mas-menu [data-v="buffet"]'); }
  await club.waitForSelector("#t-pedidos", { timeout: 5000 });
};
await irBuffet();
check(await club.isVisible('[data-a="pegarPedido"]'), "«Pedidos de la tienda para retirar» está a la vista con «Cargar pedido recibido por mensaje»");
const pegar = async (texto) => {
  await club.click('[data-a="pegarPedido"]');
  await club.fill("#pd-texto", texto);
  await club.click('[data-a="cargarPedidoPegado"]');
  await club.waitForTimeout(300);
};
await pegar(mensaje);
const tarjeta = club.locator(`.cta.pedido:has-text("${codigo} · Pedro Gómez")`);
check(await tarjeta.count() === 1, `el pedido ${codigo} aparece en «Pedidos para retirar»`);
check(/\$\s?21\.000/.test(await tarjeta.textContent()), "con los precios del club (1 tubo $12.000 + 2 overgrips $4.500 = $21.000)");
await pegar(mensaje);
check(/ya está cargado/.test(await club.textContent("body")), "pegar el mismo mensaje otra vez: «ya está cargado»");
const cerrar = club.locator('#dlg [data-a="cerrar"]').first();
if (await cerrar.isVisible().catch(() => false)) await cerrar.click();
check(await club.locator(`.cta.pedido:has-text("${codigo}")`).count() === 1, "sigue habiendo un solo pedido con ese código");
await tarjeta.locator('[data-a="entregarPedido"]').click();
await club.click('#dlg [data-a="medio"][data-v="efectivo"]');
await club.click('#dlg [data-a="confirmarEntrega"]');
await club.waitForTimeout(300);
check(/cobrado: \$\s?21\.000/.test(await club.textContent("body")), "aviso «Pedido entregado y cobrado: $21.000»");
check(await club.locator(`.cta.pedido:has-text("${codigo}")`).count() === 0, "entregado y cobrado: sale de «Pedidos para retirar»");
// Que se cobre y baje el stock UNA sola vez lo prueba el motor (motor-club.test.ts, «tienda publicada…»).
await pegar(mensaje);
check(/ya está cargado/.test(await club.textContent("body")), "pegar el mensaje de un pedido ya entregado no lo vuelve a cargar (no se cobra dos veces)");
await pc.close();

// ───── 4. Demo para prospectos sin WhatsApp del club: también Instagram ─────
console.log("\n▶ ?demo=1#tienda sin WhatsApp del club");
const demo = await contexto({ width: 390, height: 844 });
const d = vigilar(await demo.newPage(), "demo");
await d.goto(`${BASE}/turnero?demo=1#tienda`);
const r = await encargar(d, "Demo Uno");
check(r.href === "https://ig.me/m/breakpointpadel_", `demo: el pedido ${r.codigo} va por Instagram, no a un wa.me sin número`);
await demo.close();

check(errores.length === 0, `sin errores de JS${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
await navegador.close();
srv.close();
console.log(`\n${fallas.length ? `✗ ${fallas.length} falla(s)` : "✓ tienda publicada OK"}`);
process.exit(fallas.length ? 1 : 0);
