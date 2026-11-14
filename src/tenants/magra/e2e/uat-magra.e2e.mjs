// UAT de MAGRA (docs/tenants/magra/UAT-PRODUCCION.md), clic por clic, contra la app de PRODUCCIÓN
// (`next start`) sobre una base Postgres LOCAL recién hecha con RLS y la semilla de MAGRA (entorno.mjs).
// Nunca toca Neon. MAGRA se muestra como demo de GSG («GSG Carnes al vacío», src/lib/marca-demo.ts). Cubre:
// aislamiento, menú por espacios y matriz de acceso dueño/mostrador, el PIN del mostrador (elegirlo y
// desbloquear), la clienta que pide 1,5 kg desde el celular en la vidriera nueva (checkout y «Pagar con
// Mercado Pago» en modo stub), el aviso de la bandeja, pesar y ajustar, cobrar y entregar desde el cajón del
// pedido, anular, la venta de mostrador, caja del día, cierre del turno y del día, y catálogo con precio por
// kilo. Capturas a 390 y 1440 px; falla ante cualquier error de consola.
// Uso: npm run build && npm run test:magra-uat [carpeta de capturas]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarEntorno, RAIZ, DUENIO, MOSTRADOR } from "./entorno.mjs";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/uat-magra");
await mkdir(OUT, { recursive: true });
const filas = [];
let n = 0;
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
// "$ 33.878,00" → 33878
const plata = (t) => Number(String(t).replace(/[^\d,-]/g, "").replace(",", "."));

// Mercado Pago en modo stub y con avisos simulados: el circuito de pago de la tienda se recorre sin MP real.
const entorno = await levantarEntorno({ env: { MP_MODO: "stub", MP_SIMULAR_AVISOS: "1" } });
const { url: BASE, puerto, base } = entorno;
const HOST_AJENO = `http://${base.a.subdominio}.localhost:${puerto}`;
const duenioDb = await (await import("../../../test/base-efimera.ts")).prismaComoDuenio(base);
// MAGRA se muestra como demo de GSG (src/lib/marca-demo.ts): el nombre de la semilla queda como está y
// lo que el dueño todavía no cargó (dirección, horario, WhatsApp) queda vacío, para mirar la tienda real.
const magra = await duenioDb.tenant.findUniqueOrThrow({ where: { slug: "magra" } });
await duenioDb.businessSettings.updateMany({
  where: { tenantId: magra.id },
  data: { shortLabel: null, addressLine: null, hoursLabel: null, contactNote: null, whatsapp: null },
});
// El cobro por Mercado Pago es un módulo que se activa por negocio (no viene en la semilla de la carnicería):
// se prende acá, como lo haría el dueño, para recorrer el pago desde «gracias» con avisos simulados.
if (!magra.modules.includes("mercadopago")) {
  await duenioDb.tenant.update({ where: { id: magra.id }, data: { modules: [...magra.modules, "mercadopago"] } });
}

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const errores = [];
const RUIDO_DE_TRANSICION = /Transition was aborted because of invalid state/;
async function pagina(ancho, { reloj = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: ancho < 600 ? 844 : 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // El chat de WhatsApp no se abre de verdad: se atiende acá y se mira a qué dirección iba.
  await ctx.route(/wa\.me|whatsapp\.com/, (r) => r.fulfill({ contentType: "text/html", body: "<title>chat</title>" }));
  const p = await ctx.newPage();
  if (reloj) await p.clock.install();
  p.on("pageerror", (e) => {
    if (!RUIDO_DE_TRANSICION.test(e.message)) errores.push(`${ancho}px ${p.url()}: ${e.message}`);
  });
  p.on("console", (m) => {
    // «Transition was aborted…»: la transición de vista que corta el propio recorrido al saltar de pantalla en pantalla
    // con goto (la guardia redirige mientras la página transmite); no es un error de la app.
    if (m.type() === "error" && !/fonts\.g/.test(m.text()) && !RUIDO_DE_TRANSICION.test(m.text())) errores.push(`${ancho}px ${p.url()}: ${m.text()}`);
  });
  return { ctx, p };
}
const foto = (p, nombre) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${nombre}.png`, fullPage: true });
async function entrar(p, quien) {
  await p.goto(`${BASE}/admin/login`);
  await p.fill('input[name="email"]', quien.email);
  await p.fill('input[name="password"]', quien.clave);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 });
  // Primer ingreso: el panel ofrece elegir el PIN de desbloqueo (definir-pin). Se elige y sigue al destino.
  if (new URL(p.url()).pathname === "/admin/definir-pin") {
    await p.fill("#pin", PIN);
    await p.fill("#confirmacion", PIN);
    await p.getByRole("button", { name: "Guardar el PIN" }).click();
    await p.waitForURL((u) => u.pathname !== "/admin/definir-pin", { timeout: 30000 });
    pinElegido.add(quien.email);
  }
}
const PIN = "4826";
const pinElegido = new Set();
// Mientras la página transmite conviven un instante el <main> viejo y el nuevo: se lee al terminar.
async function textoDe(p) {
  await p.waitForLoadState("networkidle").catch(() => {});
  return p.locator("main").last().innerText();
}
// El cajón del pedido (<dialog> «Pedido #N») y «Más acciones» de su renglón en la bandeja.
const cajonDelPedido = (p, code) => p.getByRole("dialog", { name: `Pedido #${code}` });
async function abrirDelMenu(p, code, accion) {
  await p.getByRole("button", { name: new RegExp(`Más acciones del pedido #${code}$`) }).first().click();
  await p.getByRole("menu", { name: new RegExp(`Más acciones del pedido #${code}$`) }).getByText(accion, { exact: true }).click();
  await cajonDelPedido(p, code).waitFor({ timeout: 15000 });
}
const toast = (p, re) => p.getByText(re).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
// La clienta arma la bolsa en la tienda: `pasos` toques de + (0,25 kg por toque en lo que va por kilo).
// La vidriera nueva (tienda/vidriera): el «+» de cada renglón dice «Sumar 250 g de <corte>» o «Sumar uno de <producto>».
async function armarBolsa(p, corte, pasos) {
  const mas = p.locator("#carta").getByRole("button", { name: new RegExp(`^Sumar .* ${corte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first();
  for (let i = 0; i < pasos; i++) await mas.click();
}
// En el celular la bolsa es una hoja: se abre con «Ver mi pedido» de la barra de abajo.
async function abrirBolsa(p) {
  const ver = p.getByRole("button", { name: "Ver mi pedido" });
  if (await ver.isVisible().catch(() => false)) await ver.click();
}
async function datosDeLaClienta(p, { nombre, tel, retiro = false, direccion = "Los Robles 123, Canning" }) {
  await abrirBolsa(p);
  const bolsa = p.locator("#pedido");
  await bolsa.locator('input[name="customerName"]').fill(nombre);
  await bolsa.locator('input[name="customerPhone"]').fill(tel);
  const conRetiro = retiro && (await bolsa.locator('input[name="fulfillment"][value="PICKUP"]').count()) > 0;
  if (conRetiro) await bolsa.getByRole("radio", { name: "Retiro en el local" }).check();
  else {
    // La entrega puede arrancar en retiro (entregaPorDefecto): se elige el envío y se escribe la dirección.
    if ((await bolsa.locator('input[name="fulfillment"][value="DELIVERY"]').count()) > 0) await bolsa.getByRole("radio", { name: "Envío a domicilio" }).check();
    await bolsa.locator('input[name="address"]').fill(direccion);
  }
}
const enviarPedido = (p) => p.locator("#pedido").getByRole("button", { name: /^Enviar pedido/ }).click();
async function efectivoEnCaja(p) {
  await p.goto(`${BASE}/admin/caja`);
  const t = await textoDe(p);
  // «Por medio de pago»: el renglón Efectivo (al abrir · entró · salió · queda); lo que queda es el último importe
  // con centavos del renglón (en el celular el detalle va sin centavos y el saldo abajo; en la PC, en columnas).
  const desde = t.search(/\nEfectivo\s*\n/);
  if (desde < 0) return NaN;
  const renglon = t.slice(desde + 1).split(/\n(?:Mercado Pago|Lo que se movió)/)[0];
  const importes = [...renglon.matchAll(/(-|−)?\$\s*([\d.]+)\s*,\s*(\d{2})/g)];
  const ultimo = importes.at(-1);
  return ultimo ? (ultimo[1] ? -1 : 1) * plata(`${ultimo[2]},${ultimo[3]}`) : NaN;
}

try {
  // ── 0. Publicación y aislamiento ──
  {
    const { ctx, p } = await pagina(1440);
    await p.goto(`${BASE}/tienda`);
    const cuerpo = await p.locator("body").innerText();
    ok("0.1", /GSG Carnes al vacío/.test(cuerpo) && !/Magra|MAGRA|Mi negocio/.test(cuerpo), "la tienda se presenta como la demo de GSG («GSG Carnes al vacío»), sin la marca del cliente");
    const prohibidas = cuerpo.match(/\b(de prueba|de ejemplo|fictici[oa]s?|a confirmar|provisional)\b/gi) ?? [];
    ok("0.1c", (await p.getByRole("button", { name: /WhatsApp/ }).count()) === 0, "sin WhatsApp del local, la tienda no ofrece botones de WhatsApp");
    ok("0.1b", prohibidas.length === 0 && !/wa\.me\/\d/.test(await p.content()),
      `ambiente real: sin dirección, horario ni WhatsApp cargados, la tienda no muestra «a confirmar» ni inventa un número${prohibidas.length ? ` (dice: ${[...new Set(prohibidas)].join(", ")})` : ""}`);
    await foto(p, "tienda-1440");
    await p.goto(`${BASE}/admin`);
    ok("0.2", new URL(p.url()).pathname === "/admin/login", "/admin sin sesión rebota al ingreso");
    await p.goto(`${HOST_AJENO}/tienda`);
    ok("0.3", !/GSG Carnes al vacío/.test(await p.locator("body").innerText()), "otro negocio de la misma base no muestra la tienda de MAGRA");
    await entrar(p, DUENIO);
    await p.goto(`${BASE}/admin/clientes`);
    ok("0.4", !/Negocio A|Negocio B/.test(await textoDe(p)), "en Clientes de MAGRA no aparece ningún cliente de otro negocio (RLS)");
    await ctx.close();
  }

  // ── 1. Matriz de acceso: dueño y mostrador ──
  // El menú nuevo agrupa por espacios: Mostrador (pedidos y venta), Caja, Clientes y, sólo para el dueño, el resto.
  const MENU_DUENIO = ["Inicio", "Mostrador", "Caja", "Clientes", "Catálogo", "Stock", "Compras", "Facturas", "Números", "Configuración"];
  const SOLO_DUENIO = ["/admin/catalogo", "/admin/catalogo/precios", "/admin/reportes", "/admin/usuarios", "/admin/inventario", "/admin/facturacion", "/admin/localizacion", "/admin/auditoria"];
  const DE_LOS_DOS = ["/admin/pedidos", "/admin/vender", "/admin/ventas", "/admin/caja", "/admin/caja/cierre", "/admin/clientes"];
  for (const quien of [DUENIO, MOSTRADOR]) {
    const { ctx, p } = await pagina(1440);
    await entrar(p, quien);
    const menu = (await p.locator("nav").allInnerTexts()).join("\n");
    if (process.env.DEBUG) console.log("   [debug] menú:", menu.replace(/\s+/g, " ").slice(0, 300));
    await foto(p, `inicio-${quien.nombre}-1440`);
    const esDuenio = quien === DUENIO;
    ok("1.menu", esDuenio ? MENU_DUENIO.every((m) => menu.includes(m)) : !/Catálogo|Stock|Compras|Facturas|Números|Configuración/.test(menu) && /Mostrador/.test(menu) && /Caja/.test(menu),
      `${quien.nombre}: el menú ${esDuenio ? "trae todos los espacios" : "trae Mostrador y Caja, sin Catálogo, Stock, Compras, Facturas, Números ni Configuración"}`);
    const inicio = await textoDe(p);
    ok("1.plata", esDuenio === /Cobrado hoy/i.test(inicio), `${quien.nombre}: «Cobrado hoy» ${esDuenio ? "visible" : "no visible"} en el Inicio`);
    const negadas = [];
    for (const r of SOLO_DUENIO) {
      await p.goto(`${BASE}${r}`);
      // La guardia redirige desde el servidor mientras la página ya transmite: la URL cambia
      // un instante después del load. Se espera el destino o el título de la página.
      await p.waitForURL(/\/admin\/no-disponible/, { timeout: 3000 }).catch(() => {});
      if (new URL(p.url()).pathname === "/admin/no-disponible") negadas.push(r);
      else if (process.env.DEBUG) console.log("   [debug]", r, "→", p.url());
    }
    ok("1.solo-duenio", esDuenio ? negadas.length === 0 : negadas.length === SOLO_DUENIO.length, `${quien.nombre}: pantallas del dueño ${esDuenio ? "abiertas" : `negadas (${negadas.length}/${SOLO_DUENIO.length})`}`);
    const abiertas = [];
    for (const r of DE_LOS_DOS) {
      await p.goto(`${BASE}${r}`);
      if (new URL(p.url()).pathname === r) abiertas.push(r);
    }
    ok("1.mostrador", abiertas.length === DE_LOS_DOS.length, `${quien.nombre}: Pedidos, Vender, Ventas, Caja, Cierre y Clientes abren (${abiertas.length}/${DE_LOS_DOS.length})`);
    await ctx.close();
  }

  // ── 7a. Abrir la caja a la mañana (mostrador) ──
  const mostrador = await pagina(390);
  await entrar(mostrador.p, MOSTRADOR);
  {
    const { p } = mostrador;
    await p.goto(`${BASE}/admin/caja`);
    await p.fill("#openingFloat", "10000");
    await p.getByRole("button", { name: "Abrir caja" }).click();
    await p.getByRole("button", { name: "Sí, abrir caja" }).click();
    ok("7.1", await toast(p, /Caja abierta|abierta desde|turno abierto desde/i), "abrir la caja con $10.000 de fondo (confirma el sobrante contra el libro vacío)");
    await foto(p, "caja-abierta-390");
    // Ingreso del mostrador con PIN: eligió su PIN al entrar; con la pantalla bloqueada sigue con el PIN, sin la clave.
    ok("1.pin", pinElegido.has(MOSTRADOR.email), "al primer ingreso, el mostrador elige su PIN de 4 números");
    await p.evaluate(() => fetch("/admin/login/bloquear", { method: "POST" }));
    await p.goto(`${BASE}/admin/caja`);
    await p.waitForURL(/\/admin\/login\/desbloquear/, { timeout: 10000 }).catch(() => {});
    const bloqueada = new URL(p.url()).pathname === "/admin/login/desbloquear";
    await foto(p, "pin-desbloquear-390");
    if (bloqueada) {
      await p.fill("#pin", PIN);
      await p.getByRole("button", { name: "Seguir" }).click();
      await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 15000 }).catch(() => {});
    }
    ok("1.pin-desbloqueo", bloqueada && new URL(p.url()).pathname === "/admin/caja", "con la pantalla bloqueada, el mostrador vuelve a la caja con su PIN");
  }

  // ── 2 y 3. La clienta pide 1,5 kg desde el celular; la bandeja abierta lo avisa ──
  const duenio = await pagina(1440, { reloj: true });
  await entrar(duenio.p, DUENIO);
  await duenio.p.goto(`${BASE}/admin/pedidos`);
  let codigoWeb;
  {
    const { ctx, p } = await pagina(390);
    await p.goto(`${BASE}/tienda`);
    await armarBolsa(p, "Ojo de bife", 6);
    await abrirBolsa(p);
    const bolsa = await p.locator("#pedido").innerText();
    ok("2.1", /1,5 kg/.test(bolsa) && /Total estimado/i.test(bolsa) && /25\.350/.test(bolsa), "6 toques de + = 1,5 kg de ojo de bife, $25.350, «total estimado»");
    ok("2.2", /peso real/.test(bolsa), "avisa que el total se ajusta al peso real de cada pieza");
    await p.locator("#pedido").getByRole("button", { name: "Cerrar el pedido" }).click().catch(() => {});
    await armarBolsa(p, "Hamburguesas caseras x4", 1);
    await datosDeLaClienta(p, { nombre: "Clienta UAT", tel: "hola" });
    await enviarPedido(p);
    ok("2.3", await toast(p, /Revisá tu WhatsApp/), "un teléfono inválido no manda el pedido y dice qué corregir");
    await p.locator("#pedido").locator('input[name="customerPhone"]').fill("11 2345 6789");
    await foto(p, "tienda-bolsa-390");
    await enviarPedido(p);
    await p.waitForURL(/\/tienda\/gracias/, { timeout: 30000 });
    codigoWeb = new URL(p.url()).searchParams.get("pedido");
    ok("2.4", Boolean(codigoWeb) && /Pedido recibido/i.test(await p.locator("body").innerText()), `checkout: «¡Pedido recibido!» con el número #${codigoWeb}`);
    await foto(p, "tienda-gracias-390");
    // Con Mercado Pago (stub + avisos simulados), la clienta puede pagar el pedido desde la misma pantalla.
    const pagarMp = p.getByRole("link", { name: /Pagar (ahora )?con Mercado Pago/ }).or(p.getByRole("button", { name: /Pagar (ahora )?con Mercado Pago/ }));
    ok("2.4b", await pagarMp.first().waitFor({ timeout: 10000 }).then(() => true, () => false), "en «gracias» aparece «Pagar con Mercado Pago»");
    await ctx.close();
  }
  {
    const { p } = duenio;
    await p.clock.fastForward(46_000); // el refresco de la bandeja abierta (REFRESCO_DE_LA_BANDEJA_MS)
    const aviso = p.getByRole("status").getByText(`#${codigoWeb}`);
    await aviso.waitFor({ timeout: 20000 }).catch(() => {});
    ok("3.1", (await aviso.count()) > 0, `la bandeja abierta avisa sola el pedido nuevo de la tienda (#${codigoWeb})`);
    ok("3.2", /1 de la tienda esperando/.test(await textoDe(p)), "la línea de estado dice cuántos pedidos de la tienda esperan y desde cuándo");
    await foto(p, "bandeja-aviso-1440");
  }
  // WhatsApp: aunque el local tenga su número cargado, la demo GSG no lo muestra (un pedido de prueba nunca llega
  // al WhatsApp real del cliente, marca-demo.ts): el segundo pedido entra por la tienda, para retirar.
  await duenioDb.businessSettings.updateMany({ where: { tenantId: magra.id }, data: { whatsapp: "5491100000000" } });
  let codigoWa;
  {
    const { ctx, p } = await pagina(390);
    await p.goto(`${BASE}/tienda`);
    await armarBolsa(p, "Vacío", 4);
    await datosDeLaClienta(p, { nombre: "Clienta WhatsApp", tel: "11 5555 1234", retiro: true });
    const sinWa = (await p.getByRole("button", { name: /Pedir por WhatsApp/ }).count()) === 0 && !/5491100000000/.test(await p.content());
    await enviarPedido(p);
    await p.waitForURL(/\/tienda\/gracias/, { timeout: 30000 });
    codigoWa = new URL(p.url()).searchParams.get("pedido");
    ok("2.5", sinWa && Boolean(codigoWa), `la demo no ofrece el WhatsApp del local aunque esté cargado; el pedido #${codigoWa} entra por la tienda`);
    await ctx.close();
  }

  // ── 4. Preparar, pesar y ajustar, listo, cobrar y entregar (dueño, 1440) ──
  // La bandeja nueva: una tabla con la tecla del paso que sigue por pedido; el resto, en «Más acciones», y el pedido
  // entero (pesar, cobrar, anular) en un cajón.
  {
    const { p } = duenio;
    await p.goto(`${BASE}/admin/pedidos`);
    const tecla = (verbo) => p.getByRole("button", { name: new RegExp(`^${verbo}: Clienta UAT, pedido #${codigoWeb}$`) });
    await tecla("Preparar").click();
    await tecla("Marcar listo").waitFor({ timeout: 15000 });
    await abrirDelMenu(p, codigoWeb, "Pesar y ajustar");
    const cajon = cajonDelPedido(p, codigoWeb);
    const ajuste = cajon.locator('[data-seccion="ajustar"]');
    await ajuste.getByRole("button", { name: "Pesar y ajustar" }).click();
    await ajuste.getByRole("textbox", { name: /Ojo de bife/ }).fill("1,62");
    await foto(p, "pesar-1440");
    await ajuste.getByRole("button", { name: "Guardar peso real" }).click();
    // 1,62 × 16.900 + 6.500 = 33.878
    let pesado = null;
    for (let i = 0; i < 30 && Math.round(pesado?.total ?? 0) !== 33878; i++) {
      await p.waitForTimeout(500);
      pesado = await duenioDb.order.findFirst({ where: { tenantId: magra.id, code: Number(codigoWeb) } });
    }
    await cajon.getByText(/^\$\s?33\.878/).first().waitFor({ timeout: 10000 }).catch(() => {});
    ok("4.1", /Total[\s\S]{0,20}33\.878/.test(await cajon.innerText()) && Math.round(pesado?.total ?? 0) === 33878, `pesar y ajustar: 1,62 kg reales → el pedido pasa a $33.878 (${pesado?.total})`);
    await p.keyboard.press("Escape");
    await cajon.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await tecla("Marcar listo").click();
    await p.getByRole("button", { name: new RegExp(`Más acciones del pedido #${codigoWeb}$`) }).waitFor();
    await p.waitForTimeout(800);
    await abrirDelMenu(p, codigoWeb, "Ver el pedido");
    const entrega = cajon.getByRole("form", { name: `Entregar el pedido #${codigoWeb}` });
    await entrega.getByRole("radio", { name: "Efectivo" }).check();
    await entrega.getByRole("button", { name: /^Cobrar .* y entregar$/ }).click();
    await toast(p, /cobrad|entregad/i);
    let cerrado = null;
    for (let i = 0; i < 20 && !(cerrado?.status === "DELIVERED" && cerrado?.paid); i++) {
      await p.waitForTimeout(500);
      cerrado = await duenioDb.order.findFirst({ where: { tenantId: magra.id, code: Number(codigoWeb) } });
    }
    ok("4.2", cerrado?.status === "DELIVERED" && cerrado?.paid === true, `cobrar y entregar desde el cajón: el #${codigoWeb} queda entregado y cobrado`);
    const ojo = await duenioDb.product.findFirstOrThrow({ where: { tenantId: magra.id, name: "Ojo de bife" } });
    ok("4.3", Math.abs(ojo.stock - (18 - 1.62)) < 1e-6, `el stock descuenta el peso REAL: 18 → ${ojo.stock} kg`);
  }

  // ── 5. Anular (mostrador: motivo obligatorio), desde el cajón del pedido ──
  {
    const { p } = mostrador;
    await p.goto(`${BASE}/admin/pedidos`);
    await abrirDelMenu(p, codigoWa, "Anular…");
    const seccion = cajonDelPedido(p, codigoWa).locator('[data-seccion="anular"]');
    const anular = seccion.getByRole("button", { name: new RegExp(`^(Anular el pedido #${codigoWa}|Sí, anular igual)$`) });
    await anular.click();
    ok("5.1", await seccion.getByRole("alert").first().waitFor({ timeout: 10000 }).then(() => true, () => false), "el mostrador no anula sin motivo");
    await seccion.getByLabel(/Motivo/).fill("La clienta canceló por WhatsApp");
    await anular.click();
    let anulado = null;
    for (let i = 0; i < 20 && anulado?.status !== "CANCELLED"; i++) {
      await p.waitForTimeout(500);
      anulado = await duenioDb.order.findFirst({ where: { tenantId: magra.id, code: Number(codigoWa) } });
    }
    ok("5.2", anulado?.status === "CANCELLED", `con motivo, el #${codigoWa} se anula (no estaba cobrado: la caja no se toca)`);
    const vacio = await duenioDb.product.findFirstOrThrow({ where: { tenantId: magra.id, name: "Vacío" } });
    ok("5.3", Math.abs(vacio.stock - 2) < 1e-6, `al anular, el vacío vuelve al stock (${vacio.stock} kg)`);
  }

  // ── 6. Venta de mostrador (mostrador, 390) ──
  const efectivoAntes = await efectivoEnCaja(mostrador.p);
  {
    const { p } = mostrador;
    await p.goto(`${BASE}/admin/vender`);
    const buscar = p.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').first();
    await buscar.click();
    await buscar.fill("vac");
    await p.getByRole("option", { name: /Vac/ }).first().click();
    const peso = p.locator('input[id^="qty-"]:not([disabled])').first();
    await peso.fill("1500");
    const pregunta = p.getByRole("alert").filter({ hasText: "¿Son 1.500 kg de verdad?" });
    ok("6.0", await pregunta.waitFor({ timeout: 10000 }).then(() => true, () => false), "un peso imposible (1500) pregunta antes de cobrar");
    await p.getByRole("button", { name: "No, es 1,5 kg" }).click();
    await peso.fill("1,24");
    await p.getByRole("radio", { name: "Efectivo" }).first().click();
    ok("6.1", /15\.500/.test(await textoDe(p)), "1,24 kg de vacío a $12.500/kg = $15.500");
    await foto(p, "vender-390");
    await p.getByRole("button", { name: /^Cobrar/ }).first().click();
    ok("6.2", await toast(p, /Venta #\d+ cobrada/), "cobrar la venta de mostrador en efectivo: queda el ticket a la vista");
    await foto(p, "vender-ticket-390");
  }
  const efectivoDespues = await efectivoEnCaja(mostrador.p);
  ok("6.3", Math.round(efectivoDespues - efectivoAntes) === 15500, `la caja del día suma la venta: efectivo ${efectivoAntes} → ${efectivoDespues}`);

  // ── 8. Catálogo y precio por kilo (dueño) ──
  {
    const { p } = duenio;
    // El catálogo nuevo: «Más acciones de <corte>» → «Corregir precio y datos» abre el cajón con la ficha.
    const corregir = async (corte) => {
      await p.goto(`${BASE}/admin/catalogo`);
      await p.getByRole("button", { name: `Más acciones de ${corte}` }).first().click();
      await p.getByRole("menu", { name: `Más acciones de ${corte}` }).getByText("Corregir precio y datos").click();
      const cajon = p.getByRole("dialog", { name: corte });
      await cajon.waitFor({ timeout: 15000 });
      return cajon;
    };
    const edicion = await corregir("Lomo");
    await edicion.getByLabel("Precio por kilo").fill("19500");
    await edicion.getByRole("button", { name: "Guardar" }).click();
    await edicion.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
    const lomo = await duenioDb.product.findFirstOrThrow({ where: { tenantId: magra.id, name: "Lomo" } });
    ok("8.1", Math.round(lomo.pricePerKg ?? 0) === 19500, `el dueño cambia el precio por kilo del lomo a $19.500 (${lomo.pricePerKg})`);
    await foto(p, "catalogo-1440");
    const t = await pagina(390);
    await t.p.goto(`${BASE}/tienda`);
    ok("8.2", /Lomo\s*\$\s?19\.500\s*\/\s*kg/i.test((await t.p.locator("#carta").innerText()).replace(/\u00a0/g, " ")), "la tienda muestra el precio nuevo del lomo");
    await t.ctx.close();
    // 8.3 El PLU del vacío, el número con el que lo imprime la balanza.
    const edicionVacio = await corregir("Vacío");
    await edicionVacio.getByLabel("Código / PLU").fill("123");
    await edicionVacio.getByRole("button", { name: "Guardar" }).click();
    await edicionVacio.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
    const vacioConPlu = await duenioDb.product.findFirstOrThrow({ where: { tenantId: magra.id, name: "Vacío" } });
    ok("8.3", vacioConPlu.codigo === "123", "el dueño carga el Código / PLU del vacío desde el catálogo");
  }
  {
    // 8.4 En Vender, la etiqueta de la balanza (formato de fábrica, provisional) carga el renglón con su peso.
    const { FORMATO_BALANZA_POR_DEFECTO, armarEtiquetaDeBalanza } = await import("../../../lib/supermercado/balanza.ts");
    const { guardarConfigCajaEnTx } = await import("../../../lib/supermercado/config-repo.ts");
    const { p } = mostrador;
    await p.goto(`${BASE}/admin/vender`);
    const etiqueta = p.getByLabel("Etiqueta de la balanza o código");
    await textoDe(p);
    ok("8.4a", (await etiqueta.count()) === 0, "sin el formato de la balanza del negocio guardado, el campo de la etiqueta no se muestra");
    // El formato lo guarda quien configura la balanza (acá, directo en la base local).
    await guardarConfigCajaEnTx(duenioDb, magra.id, { config: { formato: FORMATO_BALANZA_POR_DEFECTO, encargados: [] }, actor: "uat:e2e", versionLeida: null });
    await p.goto(`${BASE}/admin/vender`);
    await etiqueta.fill(armarEtiquetaDeBalanza(FORMATO_BALANZA_POR_DEFECTO, "123", 1.24));
    await etiqueta.press("Enter");
    const renglon = await p.locator('input[id^="qty-"]:not([disabled])').first().inputValue().catch(() => "");
    ok("8.4", renglon === "1,24" && /15\.500/.test(await textoDe(p)), `la etiqueta de la balanza carga «Vacío» con ${renglon} kg al precio del sistema ($15.500)`);
    await etiqueta.fill("2099999012345");
    await etiqueta.press("Enter");
    ok("8.5", (await p.getByRole("status").filter({ hasText: /./ }).count()) > 0 && (await etiqueta.isEnabled()), "un código que no está en el catálogo avisa sin frenar la venta");
    await foto(p, "vender-balanza-390");
  }

  // ── 7b. Gasto, cierre del día con diferencia (dueño) ──
  {
    const { p } = duenio;
    await p.goto(`${BASE}/admin/caja`);
    // El gasto se carga en un cajón: «Cargar un gasto o retiro» abre el formulario de siempre del libro.
    await p.getByRole("button", { name: "Cargar un gasto o retiro" }).click();
    await p.fill("#libro-detail", "Hielo y bolsas");
    await p.selectOption("#libro-type", "EGRESO");
    await p.selectOption("#libro-method", "EFECTIVO");
    await p.fill("#libro-amount", "2000");
    await p.getByRole("button", { name: "Agregar movimiento" }).click();
    ok("7.2", await toast(p, /Guardado: Hielo y bolsas/), "registrar un gasto en efectivo de $2.000");
    const esperado = await efectivoEnCaja(p);
    // Primero el turno de cajero, con su conteo (faltan $100): el día no se cierra con un turno abierto.
    const contado = esperado - 100;
    await p.getByRole("button", { name: "Cerrar el turno" }).click();
    await p.fill("#counted", String(contado));
    await p.fill("#close-note", "Faltan $100: vuelto mal dado a la tarde");
    await p.getByRole("button", { name: "Cerrar caja" }).click();
    await p.getByRole("button", { name: "Sí, cerrar caja" }).click();
    ok("7.3t", await toast(p, /cerrad/i), `cerrar el turno: contó $${contado} contra $${esperado} y anotó qué pasó`);
    await p.goto(`${BASE}/admin/caja/cierre`);
    await textoDe(p);
    // Los movimientos del período van plegados: se abren para mirar la apertura.
    await p.getByText(/movimientos del período/).first().click();
    const libro = await textoDe(p);
    if (process.env.DEBUG) console.log("   [debug] cierre:", libro.replace(/\s+/g, " ").slice(0, 1500));
    const movimientos = libro.slice(libro.search(/movimientos del período/));
    ok("7.3a", /Apertura del turno[\s\S]{0,120}no suma/.test(movimientos) || /Fondo inicial[\s\S]{0,80}no suma/.test(movimientos),
      "la lista del cierre muestra la apertura como conteo del cajón, sin sumarla como ingreso");
    // El efectivo viene con lo contado al cerrar el turno: se confirma, se anota qué pasó y se desliza para cerrar.
    await p.getByLabel(/^Efectivo/).first().fill(String(contado));
    await p.getByLabel(/^Qué pasó/).fill("Faltan $100: vuelto mal dado a la tarde");
    await foto(p, "cierre-1440");
    const deslizar = p.getByRole("slider", { name: /^Cerrar el día/ });
    await deslizar.focus();
    await deslizar.press("End");
    ok("7.3", await toast(p, /Día .* cerrado/), `cierre del día: confirmó $${contado} contra $${esperado}, anotó qué pasó y el día queda cerrado`);
    await p.goto(`${BASE}/admin/caja/libro`);
    ok("7.3b", /100,00/.test(await textoDe(p)), "la diferencia de $100 queda asentada en el libro");
  }
  {
    // Con el día cerrado no se cobra otra venta de hoy (la regla de la caja).
    const { p } = mostrador;
    await p.goto(`${BASE}/admin/vender`);
    const buscar = p.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').first();
    await buscar.click();
    await buscar.fill("hambur");
    await p.getByRole("option", { name: /Hambur/ }).first().click();
    await p.locator('input[id^="qty-"]:not([disabled])').first().fill("1");
    await p.getByRole("radio", { name: "Efectivo" }).first().click();
    await p.getByRole("button", { name: /^Cobrar/ }).first().click();
    ok("7.4", await toast(p, /cerrad/i), "con el día cerrado, cobrar en efectivo se frena y dice por qué");
    await foto(p, "vender-dia-cerrado-390");
  }
  await mostrador.ctx.close();
  await duenio.ctx.close();

  // ── 9. Forma: cada pantalla del recorrido a 390 y 1440 px, sin desplazamiento horizontal ──
  const PANTALLAS = [
    ["tienda", "/tienda", null],
    ["inicio", "/admin", DUENIO],
    ["bandeja", "/admin/pedidos", DUENIO],
    ["vender", "/admin/vender", MOSTRADOR],
    ["ventas", "/admin/ventas", DUENIO],
    ["caja", "/admin/caja", MOSTRADOR],
    ["cierre", "/admin/caja/cierre", DUENIO],
    ["catalogo", "/admin/catalogo", DUENIO],
  ];
  for (const ancho of [390, 1440]) {
    const sesiones = new Map();
    const desbordan = [];
    for (const [nombre, ruta, quien] of PANTALLAS) {
      const clave = quien?.email ?? "anonimo";
      if (!sesiones.has(clave)) {
        const s = await pagina(ancho);
        if (quien) await entrar(s.p, quien);
        sesiones.set(clave, s);
      }
      const { p } = sesiones.get(clave);
      await p.goto(`${BASE}${ruta}`);
      await p.waitForLoadState("networkidle").catch(() => {});
      const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (sobra > 1) desbordan.push(`${nombre} (+${sobra}px)`);
      await foto(p, `${nombre}-${ancho}`);
    }
    ok(`9.${ancho}`, desbordan.length === 0, `a ${ancho} px, ninguna de las ${PANTALLAS.length} pantallas se desplaza de costado${desbordan.length ? `: ${desbordan.join(", ")}` : ""}`);
    for (const s of sesiones.values()) await s.ctx.close();
  }
} catch (err) {
  if (process.env.DEBUG) console.log(err);
  ok("recorrido", false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
}

if (process.env.DEBUG && filas.some((f) => f.estado !== "OK")) console.log("── log del servidor ──\n" + entorno.logServidor.join("").slice(-4000));
ok("consola", errores.length === 0, `cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
await b.close();
await entorno.cerrar();
const fallas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK · capturas en ${OUT}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify(filas, null, 1));
process.exit(fallas.length ? 1 : 0);
