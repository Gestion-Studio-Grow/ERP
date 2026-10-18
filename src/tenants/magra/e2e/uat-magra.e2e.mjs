// UAT de MAGRA (docs/tenants/magra/UAT-PRODUCCION.md), clic por clic, contra la app de PRODUCCIÓN
// (`next start`) sobre una base Postgres LOCAL recién hecha con RLS y la semilla de MAGRA (entorno.mjs).
// Nunca toca Neon. Cubre: aislamiento, matriz de acceso dueño/mostrador, la clienta que pide 1,5 kg
// desde el celular (checkout y WhatsApp), el aviso de la bandeja, pesar y ajustar, cobrar, entregar,
// anular, la venta de mostrador, caja del día y cierre, y catálogo con precio por kilo. Capturas a
// 390 y 1440 px; falla ante cualquier error de consola.
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

const entorno = await levantarEntorno();
const { url: BASE, puerto, base } = entorno;
const HOST_AJENO = `http://${base.a.subdominio}.localhost:${puerto}`;
const duenioDb = await (await import("../../../test/base-efimera.ts")).prismaComoDuenio(base);
const magra = await duenioDb.tenant.findUniqueOrThrow({ where: { slug: "magra" } });

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const errores = [];
async function pagina(ancho, { reloj = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: ancho < 600 ? 844 : 900 }, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // El chat de WhatsApp no se abre de verdad: se atiende acá y se mira a qué dirección iba.
  await ctx.route(/wa\.me|whatsapp\.com/, (r) => r.fulfill({ contentType: "text/html", body: "<title>chat</title>" }));
  const p = await ctx.newPage();
  if (reloj) await p.clock.install();
  p.on("pageerror", (e) => errores.push(`${ancho}px ${p.url()}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.g/.test(m.text())) errores.push(`${ancho}px ${p.url()}: ${m.text()}`);
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
}
// Mientras la página transmite conviven un instante el <main> viejo y el nuevo: se lee al terminar.
async function textoDe(p) {
  await p.waitForLoadState("networkidle").catch(() => {});
  return p.locator("main").last().innerText();
}
const filaPedido = (p, texto) => p.locator("div.rounded-lg.border.p-4", { hasText: texto }).first();
const toast = (p, re) => p.getByText(re).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
// La clienta arma la bolsa en la tienda: `pasos` toques de + (0,25 kg por toque en lo que va por kilo).
async function armarBolsa(p, corte, pasos) {
  const mas = p.getByRole("button", { name: `Agregar ${corte}` }).first();
  for (let i = 0; i < pasos; i++) await mas.click();
}
async function datosDeLaClienta(p, { nombre, tel, retiro = false, direccion = "Los Robles 123, Canning" }) {
  await p.fill('input[name="customerName"]', nombre);
  await p.fill('input[name="customerPhone"]', tel);
  if (retiro) await p.selectOption('select[name="fulfillment"]', "PICKUP");
  else await p.fill('input[name="address"]', direccion);
}
async function efectivoEnCaja(p) {
  await p.goto(`${BASE}/admin/caja`);
  const t = await textoDe(p);
  return plata(t.match(/Efectivo\s*\n\s*(\$[\d.,]+)/)?.[1] ?? "NaN");
}

try {
  // ── 0. Publicación y aislamiento ──
  {
    const { ctx, p } = await pagina(1440);
    await p.goto(`${BASE}/tienda`);
    const cuerpo = await p.locator("body").innerText();
    ok("0.1", /ESTO NO ES UNA CARNICERÍA/i.test(cuerpo) && !/Mi negocio/.test(cuerpo), "la tienda es la de MAGRA, no la vidriera genérica");
    ok("0.1b", /WhatsApp a confirmar/.test(cuerpo), "sin WhatsApp cargado, la tienda lo dice («a confirmar»), no inventa un número");
    await foto(p, "tienda-1440");
    await p.goto(`${BASE}/admin`);
    ok("0.2", new URL(p.url()).pathname === "/admin/login", "/admin sin sesión rebota al ingreso");
    await p.goto(`${HOST_AJENO}/tienda`);
    ok("0.3", !/ESTO NO ES UNA CARNICERÍA/i.test(await p.locator("body").innerText()), "otro negocio de la misma base no muestra la tienda de MAGRA");
    await entrar(p, DUENIO);
    await p.goto(`${BASE}/admin/clientes`);
    ok("0.4", !/Negocio A|Negocio B/.test(await textoDe(p)), "en Clientes de MAGRA no aparece ningún cliente de otro negocio (RLS)");
    await ctx.close();
  }

  // ── 1. Matriz de acceso: dueño y mostrador ──
  const MENU_DUENIO = ["Inicio", "Clientes", "Pedidos", "Caja", "Cierre del día", "Catálogo", "Reportes", "Usuarios"];
  const SOLO_DUENIO = ["/admin/catalogo", "/admin/catalogo/precios", "/admin/reportes", "/admin/usuarios", "/admin/inventario", "/admin/facturacion", "/admin/localizacion", "/admin/auditoria"];
  const DE_LOS_DOS = ["/admin/pedidos", "/admin/vender", "/admin/ventas", "/admin/caja", "/admin/caja/cierre", "/admin/clientes"];
  for (const quien of [DUENIO, MOSTRADOR]) {
    const { ctx, p } = await pagina(1440);
    await entrar(p, quien);
    const menu = await p.locator("nav").first().innerText();
    const esDuenio = quien === DUENIO;
    ok("1.menu", esDuenio ? MENU_DUENIO.every((m) => menu.includes(m)) : !/Catálogo|Reportes|Usuarios|Auditoría/.test(menu) && /Pedidos/.test(menu) && /Caja/.test(menu),
      `${quien.nombre}: el menú ${esDuenio ? "trae todo" : "trae Pedidos y Caja, sin Catálogo, Reportes, Usuarios ni Auditoría"}`);
    const inicio = await textoDe(p);
    ok("1.plata", esDuenio === /Ingresos hoy/.test(inicio), `${quien.nombre}: «Ingresos hoy» ${esDuenio ? "visible" : "no visible"} en el Inicio`);
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
    ok("7.1", await toast(p, /Caja abierta|abierta desde/i), "abrir la caja con $10.000 de fondo (confirma el sobrante contra el libro vacío)");
    await foto(p, "caja-abierta-390");
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
    const bolsa = await p.locator("#pedido").innerText();
    ok("2.1", /1,5 kg/.test(bolsa) && /Total estimado/i.test(bolsa) && /25\.350/.test(bolsa), "6 toques de + = 1,5 kg de ojo de bife, $25.350, «total estimado»");
    ok("2.2", (await p.locator("#pedido .mf-nota-peso").count()) === 1, "avisa que el total se ajusta al peso real de cada pieza");
    await armarBolsa(p, "Hamburguesas caseras x4", 1);
    await datosDeLaClienta(p, { nombre: "Clienta UAT", tel: "hola" });
    await p.locator(".mf-rail-submit").click();
    ok("2.3", await toast(p, /Revisá tu WhatsApp/), "un teléfono inválido no manda el pedido y dice qué corregir");
    await p.fill('input[name="customerPhone"]', "11 2345 6789");
    await foto(p, "tienda-bolsa-390");
    await p.locator(".mf-rail-submit").click();
    await p.waitForURL(/\/tienda\/gracias/, { timeout: 30000 });
    codigoWeb = new URL(p.url()).searchParams.get("pedido");
    ok("2.4", Boolean(codigoWeb) && /Pedido recibido/i.test(await p.locator("body").innerText()), `checkout: «¡Pedido recibido!» con el número #${codigoWeb}`);
    await foto(p, "tienda-gracias-390");
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
  // WhatsApp: con el número del local cargado (en esta base local; el real es dato del dueño).
  await duenioDb.businessSettings.updateMany({ where: { tenantId: magra.id }, data: { whatsapp: "5491100000000" } });
  let codigoWa;
  {
    const { ctx, p } = await pagina(390);
    await p.goto(`${BASE}/tienda`);
    await armarBolsa(p, "Vacío", 4);
    await datosDeLaClienta(p, { nombre: "Clienta WhatsApp", tel: "11 5555 1234", retiro: true });
    const [chat] = await Promise.all([ctx.waitForEvent("page", { timeout: 20000 }), p.locator(".mf-rail-wa").click()]);
    await chat.waitForURL(/wa\.me|whatsapp/, { timeout: 20000 }).catch(() => {});
    const destino = decodeURIComponent(chat.url());
    codigoWa = destino.match(/#(\d+)/)?.[1];
    if (process.env.DEBUG) console.log("   [debug] chat:", destino);
    ok("2.5", /5491100000000/.test(destino) && Boolean(codigoWa), `«Pedir por WhatsApp» registra el pedido y abre el chat del local con el número #${codigoWa}`);
    await ctx.close();
  }

  // ── 4. Preparar, pesar y ajustar, listo, cobrar y entregar (dueño, 1440) ──
  {
    const { p } = duenio;
    await p.goto(`${BASE}/admin/pedidos`);
    const fila = () => filaPedido(p, "Clienta UAT");
    await fila().getByRole("button", { name: "Preparar" }).click();
    await fila().getByText("En preparación").waitFor();
    await fila().getByRole("button", { name: "Pesar y ajustar" }).click();
    await fila().getByRole("textbox", { name: /Ojo de bife/ }).fill("1,62");
    await foto(p, "pesar-1440");
    await fila().getByRole("button", { name: "Guardar peso real" }).click();
    // 1,62 × 16.900 + 6.500 = 33.878
    await fila().getByText("1,62 kg · Ojo de bife").waitFor({ timeout: 15000 }).catch(() => {});
    if (process.env.DEBUG) console.log("   [debug] fila:", await fila().innerText());
    ok("4.1", /1,62 kg · Ojo de bife/.test(await fila().innerText()) && /\$33\.878,00/.test(await fila().innerText()), "pesar y ajustar: 1,62 kg reales → el pedido pasa a $33.878");
    await fila().getByRole("button", { name: "Marcar listo" }).click();
    await fila().getByRole("button", { name: "Entregar" }).click();
    await fila().getByLabel(/¿Cómo pagó el pedido/).first().selectOption("EFECTIVO");
    await fila().getByRole("button", { name: "Cobrar y entregar" }).click();
    await p.getByText(`#${codigoWeb}`).first().waitFor();
    await p.waitForTimeout(800);
    const cerrado = await textoDe(p);
    ok("4.2", new RegExp(`#${codigoWeb}[\\s\\S]{0,40}Entregado`).test(cerrado), `cobrar y entregar: el #${codigoWeb} queda entregado y cobrado`);
    const ojo = await duenioDb.product.findFirstOrThrow({ where: { tenantId: magra.id, name: "Ojo de bife" } });
    ok("4.3", Math.abs(ojo.stock - (18 - 1.62)) < 1e-6, `el stock descuenta el peso REAL: 18 → ${ojo.stock} kg`);
  }

  // ── 5. Anular (mostrador: motivo obligatorio) ──
  {
    const { p } = mostrador;
    await p.goto(`${BASE}/admin/pedidos`);
    const fila = () => filaPedido(p, "Clienta WhatsApp");
    await fila().getByRole("button", { name: "Anular…" }).click();
    await fila().getByRole("button", { name: "Sí, anular" }).click();
    if (process.env.DEBUG) console.log("   [debug] anular:", await fila().innerText());
    ok("5.1", await fila().getByRole("alert").waitFor({ timeout: 10000 }).then(() => true, () => false), "el mostrador no anula sin motivo");
    await fila().getByLabel(/Motivo/).fill("La clienta canceló por WhatsApp");
    await fila().getByRole("button", { name: "Sí, anular" }).click();
    ok("5.2", await toast(p, new RegExp(`#${codigoWa}.*anulado|anulado`, "i")), `con motivo, el #${codigoWa} se anula (no estaba cobrado: la caja no se toca)`);
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
    await p.goto(`${BASE}/admin/catalogo`);
    const fila = p.locator("tr", { hasText: "Lomo" }).first();
    await fila.getByRole("button", { name: "Editar" }).click();
    const edicion = p.locator('form:has([id^="edit-"][id$="-name"])');
    await edicion.getByLabel("Precio por kilo").fill("19500");
    await edicion.getByRole("button", { name: "Guardar" }).click();
    await p.locator("tr", { hasText: "Lomo" }).getByText("$19.500,00/kg").waitFor({ timeout: 15000 }).catch(() => {});
    ok("8.1", (await p.locator("tr", { hasText: "Lomo" }).getByText("$19.500,00/kg").count()) > 0, "el dueño cambia el precio por kilo del lomo a $19.500");
    await foto(p, "catalogo-1440");
    const t = await pagina(390);
    await t.p.goto(`${BASE}/tienda`);
    ok("8.2", /LOMO\s*\$ 19\.500\s*\/ kg/i.test((await t.p.locator("body").innerText()).replace(/ /g, " ")), "la tienda muestra el precio nuevo del lomo");
    await t.ctx.close();
    // 8.3 El PLU del vacío, el número con el que lo imprime la balanza.
    await p.goto(`${BASE}/admin/catalogo`);
    await p.locator("tr", { hasText: "Vacío" }).first().getByRole("button", { name: "Editar" }).click();
    const edicionVacio = p.locator('form:has([id^="edit-"][id$="-name"])');
    await edicionVacio.getByLabel("Código / PLU").fill("123");
    await edicionVacio.getByRole("button", { name: "Guardar" }).click();
    await edicionVacio.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const vacioConPlu = await duenioDb.product.findFirstOrThrow({ where: { tenantId: magra.id, name: "Vacío" } });
    ok("8.3", vacioConPlu.codigo === "123", "el dueño carga el Código / PLU del vacío desde el catálogo");
  }
  {
    // 8.4 En Vender, la etiqueta de la balanza (formato de fábrica, provisional) carga el renglón con su peso.
    const { FORMATO_BALANZA_POR_DEFECTO, armarEtiquetaDeBalanza } = await import("../../../lib/supermercado/balanza.ts");
    const { p } = mostrador;
    await p.goto(`${BASE}/admin/vender`);
    const etiqueta = p.getByLabel("Etiqueta de la balanza o código");
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
    await p.fill("#libro-detail", "Hielo y bolsas");
    await p.selectOption("#libro-type", "EGRESO");
    await p.selectOption("#libro-method", "EFECTIVO");
    await p.fill("#libro-amount", "2000");
    await p.getByRole("button", { name: "Agregar movimiento" }).click();
    ok("7.2", await toast(p, /Guardado: Hielo y bolsas/), "registrar un gasto en efectivo de $2.000");
    const esperado = await efectivoEnCaja(p);
    await p.goto(`${BASE}/admin/caja/cierre`);
    const contado = esperado - 100;
    const libro = await textoDe(p);
    const movimientos = libro.slice(libro.indexOf("Movimientos del período"));
    ok("7.3a", /Apertura del turno: conteo del cajón de \$\s?10\.000,00, no suma/.test(movimientos),
      "la lista del cierre muestra la apertura como conteo del cajón, sin sumarla como ingreso");
    await p.getByLabel(/^Efectivo/).first().fill(String(contado));
    await p.getByLabel("Qué pasó").fill("Faltan $100: vuelto mal dado a la tarde");
    await foto(p, "cierre-1440");
    await p.getByRole("button", { name: "Cerrar el día" }).click();
    await p.getByRole("button", { name: "Sí, cerrar el día" }).click();
    ok("7.3", await toast(p, /Día .* cerrado/), `cierre: contó $${contado} contra $${esperado}, anotó qué pasó y el día queda cerrado`);
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

ok("consola", errores.length === 0, `cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
await b.close();
await entorno.cerrar();
const fallas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK · capturas en ${OUT}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify(filas, null, 1));
process.exit(fallas.length ? 1 : 0);
