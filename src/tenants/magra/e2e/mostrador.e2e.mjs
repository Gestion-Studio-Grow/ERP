// UN SOLO MOSTRADOR — la venta de mostrador de Pedidos (la que usa MAGRA desde el celular) es la
// misma que Vender. Clic por clic, contra la app de producción (`next start`) y Postgres LOCAL
// (entorno.mjs; nunca Neon): venta por kilo en efectivo con vuelto, venta por unidad con Mercado
// Pago, pedido con envío, y la factura con la facturación apagada (el porqué en criollo) y prendida
// en homologación (queda en trámite: nada sale a ARCA). Mide que el total y «Cobrar» se vean sin
// desplazar en celular, tablet horizontal y terminal; falla ante cualquier error de consola.
// Uso: npm run build && npm run test:mostrador-e2e [carpeta de capturas]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarEntorno, RAIZ, DUENIO, MOSTRADOR } from "./entorno.mjs";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/mostrador-e2e");
await mkdir(OUT, { recursive: true });
const filas = [];
let n = 0;
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
const errores = [];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());

async function pagina(base, [w, h], quien) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "es-AR", hasTouch: w < 800 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errores.push(`${w}px ${p.url()}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.g/.test(m.text())) errores.push(`${w}px ${p.url()}: ${m.text()}`);
  });
  await p.goto(`${base}/admin/login`);
  await p.fill('input[name="email"]', quien.email);
  await p.fill('input[name="password"]', quien.clave);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 });
  await p.goto(`${base}/admin/pedidos`);
  await p.waitForLoadState("networkidle").catch(() => {});
  return { ctx, p };
}
const foto = (p, nombre) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${nombre}.png` });
const espera = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
async function sumar(p, que, cantidad) {
  const buscar = p.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').last();
  await buscar.click();
  await buscar.fill(que);
  // Con el teclado, como el cajero: la primera coincidencia y Enter.
  const lista = p.locator(`#${await buscar.getAttribute("aria-controls")}`);
  await lista.getByRole("option", { name: new RegExp(que, "i") }).first().waitFor();
  await buscar.press("Enter");
  await p.locator('input[id^="qty-"]:not([disabled])').last().fill(cantidad);
  await p.keyboard.press("Enter");
}
// «Cobrar» del mostrador (la bandeja de abajo tiene su propio «Cobrar» por pedido).
const cobrar = (p) => p.locator('form[data-vender="mostrador"]').getByRole("button", { name: /^Cobrar/ }).click();
/** ¿El total y «Cobrar» se ven sin desplazar? (con la página arriba de todo) */
async function cobrarALaVista(p, h) {
  await p.evaluate(() => window.scrollTo(0, 0));
  const r = await p.locator('form[data-vender="mostrador"] button[type="submit"]').last().boundingBox();
  const t = await p.locator('form[data-vender="mostrador"]').getByText(/^Total/).last().boundingBox();
  return !!r && !!t && r.y >= 0 && r.y + r.height <= h && t.y >= 0 && t.y + t.height <= h;
}

// El nombre real del local (la semilla trae el de la base local), como en el UAT.
const conNombreReal = async (e) => {
  const { prismaComoDuenio } = await import("../../../test/base-efimera.ts");
  await (await prismaComoDuenio(e.base)).tenant.update({ where: { slug: "magra" }, data: { name: "Magra" } });
  return e;
};

let entorno = await conNombreReal(await levantarEntorno());
try {
  // ── 1. Pedidos de un comercio usa el mostrador de Vender ──
  {
    const { ctx, p } = await pagina(entorno.url, [390, 844], MOSTRADOR);
    ok("1.1", (await p.locator('form[data-vender="mostrador"]').count()) === 1, "Pedidos → venta de mostrador es el mismo formulario que Vender");
    // ── 2. Venta por kilo, efectivo, vuelto (mostrador, celular) ──
    await sumar(p, "vac", "1,24");
    await p.getByRole("radio", { name: "Efectivo" }).first().click();
    await p.getByText("Pagó con").locator("..").locator("input").fill("20000");
    ok("2.1", await espera(p.getByText(/Vuelto\s*\$\s?4\.500/)), "efectivo: con $20.000 dice el vuelto, $4.500");
    ok("2.2", await cobrarALaVista(p, 844), "a 390 px el total y «Cobrar» se ven sin desplazar");
    await foto(p, "kilo-efectivo-390");
    await cobrar(p);
    ok("2.3", await espera(p.getByText(/Venta #\d+ cobrada · \$\s?15\.500,00 · vuelto \$\s?4\.500/)), "cobrada, con el vuelto en la confirmación");
    ok("2.4", await espera(p.locator('[data-vender="factura"]').getByText(/la hace el dueño, desde Ventas del día/)), "el mostrador ve por qué no factura él");
    await foto(p, "cobrada-390");
    await ctx.close();
  }
  // ── 3. Venta por unidad con Mercado Pago y factura con la facturación APAGADA (dueño, 1024×768) ──
  {
    const { ctx, p } = await pagina(entorno.url, [1024, 768], DUENIO);
    await sumar(p, "hamb", "2");
    await p.getByRole("radio", { name: "Mercado Pago" }).first().click();
    ok("3.1", await cobrarALaVista(p, 768), "tablet horizontal (1024×768): dos columnas, el total y «Cobrar» a la vista");
    await foto(p, "unidad-mp-1024");
    await cobrar(p);
    ok("3.2", await espera(p.getByText(/Venta #\d+ cobrada · \$\s?13\.000,00/)), "2 hamburguesas por Mercado Pago, cobradas");
    ok("3.3", await espera(p.locator('[data-vender="factura"]').getByText(/^Sale a consumidor final\. .*\$\s?10\.000\.000/)), "dice a quién sale la factura y desde cuánto hay que identificar al cliente");
    await p.getByRole("button", { name: "Facturar" }).click();
    ok("3.4", await espera(p.getByRole("status").getByText(/^Sin factura: /)), `con la facturación apagada, dice por qué no sale: «${(await p.getByRole("status").getByText(/^Sin factura: /).first().innerText().catch(() => "")).slice(0, 90)}»`);
    await foto(p, "factura-apagada-1024");
    await ctx.close();
  }
  // ── 4. Pedido con envío (dueño, 1366×768): el cliente se despliega y va a la bandeja ──
  {
    const { ctx, p } = await pagina(entorno.url, [1366, 768], DUENIO);
    await p.getByRole("button", { name: "Pedido (retiro / envío)" }).click();
    await sumar(p, "lomo", "2");
    const nombre = p.locator('input[name="customerName"]');
    ok("4.1", await espera(nombre), "en un pedido, los datos del cliente aparecen solos");
    await nombre.fill("Clienta Envío");
    await p.locator('input[name="customerPhone"]').fill("11 4444 5555");
    const envio = p.getByRole("button", { name: /Envío/ });
    if (await envio.count()) await envio.first().click();
    const dir = p.locator('input[name="address"]');
    if (await dir.count()) await dir.fill("Los Robles 123, Canning");
    await foto(p, "pedido-envio-1366");
    await p.locator('form[data-vender="mostrador"] button[type="submit"]').last().click();
    await espera(p.getByText(/Pedido (#\d+|registrado)/));
    await p.goto(`${entorno.url}/admin/pedidos`);
    ok("4.2", await espera(p.locator("div.rounded-lg.border.p-4", { hasText: "Clienta Envío" })), "el pedido con envío queda en la bandeja");
    await ctx.close();
  }
  // ── 5.0 Celular de 5", venta vacía: la barra no se fija y el buscador (primer paso) no queda tapado ──
  {
    const { ctx, p } = await pagina(entorno.url, [360, 640], MOSTRADOR);
    const libre = await p.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').last().evaluate((el) => {
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el === encima || el.contains(encima);
    });
    ok("5.0", libre, "360×640 con la venta vacía: el buscador se ve y no lo tapa la barra de cobro");
    await ctx.close();
  }
  // ── 5. Celulares y terminales: el total y «Cobrar» siempre a la vista, sin desplazamiento horizontal ──
  for (const [nombre, w, h] of [["pos-5in", 360, 640], ["pos-8in", 600, 960], ["tablet-v", 768, 1024], ["tablet-820", 820, 1180], ["term-1366", 1366, 768], ["term-1280", 1280, 800], ["pc-1920", 1920, 1080]]) {
    const { ctx, p } = await pagina(entorno.url, [w, h], MOSTRADOR);
    await sumar(p, "vac", "1,24");
    await sumar(p, "hamb", "2");
    const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`5.${nombre}`, (await cobrarALaVista(p, h)) && sobra <= 1, `${w}×${h}: total y «Cobrar» a la vista, sin desplazar de costado`);
    await ctx.close();
  }
} catch (err) {
  if (process.env.DEBUG) console.log(String(err).split("\n").filter((l) => /intercepts|waiting for/.test(l)).slice(0, 4).join("\n"));
  ok("recorrido", false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
}
await entorno.cerrar();

// ── 7. «Diseño nuevo» prendido sin «Trabaja por apps»: «Cobrar en el mostrador» abre Vender entero
// (antes el formulario iba en un cajón de 30rem y desde 1024 px sus dos columnas se pisaban) ──
entorno = await conNombreReal(await levantarEntorno({ log: () => {} }));
try {
  const { prismaComoDuenio } = await import("../../../test/base-efimera.ts");
  const { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, PREFIJO_ACTOR_OPERADOR } = await import("../../../cambios/interruptores.ts");
  const duenio = await prismaComoDuenio(entorno.base);
  const t = await duenio.tenant.findUniqueOrThrow({ where: { slug: "magra" } });
  await duenio.auditLog.create({
    data: { tenantId: t.id, entity: ENTIDAD_INTERRUPTOR, entityId: "diseno-nuevo", action: ACCION_ENCENDER, channel: CANAL_INTERRUPTOR, actor: PREFIJO_ACTOR_OPERADOR + "e2e" },
  });
  for (const [w, h] of [[1280, 800], [1024, 768]]) {
    const { ctx, p } = await pagina(entorno.url, [w, h], DUENIO);
    await p.getByRole("link", { name: "Cobrar en el mostrador" }).click();
    await p.waitForURL(/\/admin\/vender/);
    await sumar(p, "vac", "1,24");
    const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const buscador = await p.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').last().boundingBox();
    ok(`7.${w}`, sobra <= 1 && !!buscador && buscador.width > 200, `diseño nuevo ${w}×${h}: el mostrador abre Vender entero, con buscador y sin pisarse`);
    if (w === 1024) await foto(p, "diseno-nuevo-1024");
    await ctx.close();
  }
} catch (err) {
  if (process.env.DEBUG) console.log(String(err).split("\n").slice(0, 4).join("\n"));
  ok("recorrido-diseno-nuevo", false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
}
await entorno.cerrar();

// ── 6. Facturación PRENDIDA en homologación: la factura queda en trámite (nada sale a ARCA) ──
entorno = await levantarEntorno({ env: { ARCA_INVOICING_ENABLED: "true", ARCA_MODO: "homologacion" } });
try {
  const { prismaComoDuenio } = await import("../../../test/base-efimera.ts");
  const duenio = await prismaComoDuenio(entorno.base);
  const t = await duenio.tenant.findUniqueOrThrow({ where: { slug: "magra" } });
  await duenio.tenant.update({
    where: { id: t.id },
    data: { name: "Magra", arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, modules: [...new Set([...t.modules, "arca"])] },
  });
  const { ctx, p } = await pagina(entorno.url, [1440, 900], DUENIO);
  await sumar(p, "vac", "1,24");
  await p.getByRole("radio", { name: "Efectivo" }).first().click();
  await cobrar(p);
  await espera(p.getByText(/Venta #\d+ cobrada/));
  await p.getByRole("button", { name: "Facturar" }).click();
  const estado = p.getByRole("status").getByText(/Factura en trámite con ARCA|Factura .* emitida/);
  ok("6.1", await espera(estado, 20000), `con la facturación prendida (homologación), la venta se factura: «${(await estado.first().innerText().catch(() => "")).slice(0, 60)}»`);
  await foto(p, "factura-homologacion-1440");
  await ctx.close();
} catch (err) {
  if (process.env.DEBUG) console.log(String(err).split("\n").slice(0, 4).join("\n"));
  ok("recorrido-factura", false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
}
if (process.env.DEBUG && filas.some((f) => f.estado !== "OK")) console.log("── log del servidor ──\n" + entorno.logServidor.join("").slice(-3000));
await entorno.cerrar();

ok("consola", errores.length === 0, `cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
await b.close();
const fallas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK · capturas en ${OUT}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify(filas, null, 1));
process.exit(fallas.length ? 1 : 0);
