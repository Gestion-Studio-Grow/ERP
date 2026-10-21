// EL MOSTRADOR ÚNICO EN CH (aprobado por el dueño el 21/10): la solapa «Productos» de Caja y pedidos es
// la misma venta que Vender, sin balanza ni peso y con la palabra de la casa («clienta»); «Servicios»
// sigue siendo el alta del turno con su profesional, su seña y su cupón, ahora con tarjetas por servicio.
// Clic por clic, contra la app de producción (`next start`) y Postgres LOCAL (entorno-ch.mjs; nunca
// Neon): un servicio y un producto, efectivo con vuelto, Mercado Pago, factura apagada (el porqué) y
// prendida en homologación (queda en trámite: nada sale a ARCA), el cajón de «Diseño nuevo» y el cobro
// a la vista en 390, 1024×768 y 1366×768. Falla ante cualquier error de consola.
// Uso: npm run build && npm run test:ch-mostrador-e2e [carpeta de capturas]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarEntornoCH, RAIZ, CLAVE_DE_PRUEBA } from "./entorno-ch.mjs";
import { prepararMostradorCH } from "./preparar-mostrador-ch.mjs";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/ch-mostrador-e2e");
await mkdir(OUT, { recursive: true });
const filas = [];
let n = 0;
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
const errores = [];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const manana = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() + 86_400_000));

async function pagina(e, [w, h]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "es-AR", hasTouch: w < 800 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", (err) => errores.push(`${w}px ${p.url()}: ${err.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.g/.test(m.text())) errores.push(`${w}px ${p.url()}: ${m.text()}`);
  });
  await p.goto(`${e.url}/admin/login`);
  await p.fill('input[name="email"]', e.base.a.duenia.email);
  await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 });
  await p.goto(`${e.url}/admin/pedidos`);
  await p.waitForLoadState("networkidle").catch(() => {});
  return { ctx, p };
}
const foto = (p, nombre) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${nombre}.png` });
const espera = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
// El formulario del mostrador: `mostrador` en la pantalla clásica, `formulario` en la de «Diseño nuevo».
const form = (p) => p.locator('form:is([data-vender="mostrador"], [data-vender="formulario"])');
async function sumar(p, que, cantidad) {
  const buscar = form(p).locator('#vender-buscar, input[role="combobox"][id^="prod-"]').last();
  await buscar.click();
  await buscar.fill(que);
  const lista = p.locator(`#${await buscar.getAttribute("aria-controls")}`);
  await lista.getByRole("option", { name: new RegExp(que, "i") }).first().waitFor();
  await buscar.press("Enter");
  await form(p).locator('input[id^="qty-"]:not([disabled])').last().fill(cantidad);
}
const cobrar = (p) => form(p).getByRole("button", { name: /^Cobrar/ }).click();
async function cobrarALaVista(p, h) {
  await p.evaluate(() => window.scrollTo(0, 0));
  const r = await form(p).getByRole("button", { name: /^Cobrar/ }).boundingBox();
  return !!r && r.y >= 0 && r.y + r.height <= h;
}
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1);

// ── Pantalla clásica ──
let e = await levantarEntornoCH();
try {
  const db = await prepararMostradorCH(e);
  {
    const { ctx, p } = await pagina(e, [1366, 768]);
    // 1 · Productos: la misma venta que Vender, sin nada de peso
    ok("1.1", (await form(p).count()) === 1, "«Productos» de CH es el mostrador único (el mismo formulario que Vender)");
    const pesoVisible = await p.getByRole("button", { name: /Conectar balanza|Tomar peso/ }).count();
    const etiqueta = await p.getByLabel(/etiqueta/i).count();
    ok("1.2", pesoVisible === 0 && etiqueta === 0, "sin balanza, sin «Tomar peso» y sin campo de etiqueta");
    ok("1.3", (await form(p).getByRole("button", { name: "Clienta" }).count()) === 1, "la palabra de la casa: «Clienta»");

    // 2 · Servicio: la tarjeta elige servicio y profesional de una; el turno se crea y se cobra
    await p.getByRole("tab", { name: /Servicios/ }).click();
    const tarjeta = p.locator('[data-ui="card"]', { hasText: "Masaje descontracturante" });
    ok("2.1", await espera(tarjeta.getByText(/60 min/)), "tarjeta del servicio con su duración y su precio");
    await tarjeta.getByRole("button", { name: "Laura Gómez" }).click();
    const prof = await p.locator("#na-professional").inputValue();
    const serv = await p.locator("#na-service").inputValue();
    ok("2.2", prof === e.semilla.profesionales.laura && serv === e.semilla.servicios.masaje, "un toque en la profesional completa profesional y servicio");
    await foto(p, "servicio-tarjetas-1366");
    await p.fill("#na-date", manana);
    const horario = p.locator('[aria-labelledby="na-horario"] button').nth(1);
    await horario.waitFor({ timeout: 15_000 });
    await horario.click();
    await p.fill("#na-client-name", "Sofía Mostrador");
    await p.fill("#na-client-phone", "11 3000 0090");
    const queCobra = (await p.locator("#na-que-cobrar option:checked").textContent()) ?? "";
    await p.click('button:has-text("Crear turno")');
    let turno = null;
    for (let i = 0; i < 30 && !turno; i++) {
      turno = await db.appointment.findFirst({
        where: { tenantId: e.base.a.id, client: { name: "Sofía Mostrador" } },
        select: { professionalId: true, serviceId: true, collections: { select: { amount: true } } },
      });
      if (!turno) await p.waitForTimeout(500);
    }
    const cobrado = (turno?.collections ?? []).reduce((a, c) => a + Number(c.amount), 0);
    ok(
      "2.3",
      turno?.professionalId === e.semilla.profesionales.laura && turno?.serviceId === e.semilla.servicios.masaje && cobrado === 15000,
      `el turno queda con su profesional y su servicio, y cobrado en el acto (propuso «${queCobra.trim()}», cobró $${cobrado})`,
    );

    // 3 · Producto en efectivo con vuelto
    await p.getByRole("tab", { name: /Productos/ }).click();
    await sumar(p, "sérum", "1");
    await form(p).getByRole("radio", { name: "Efectivo" }).click();
    await form(p).getByText("Pagó con").locator("..").locator("input").fill("20000");
    ok("3.1", await espera(form(p).getByText(/Vuelto\s*\$\s?2\.000/)), "efectivo: con $20.000 el vuelto es $2.000");
    ok("3.2", await cobrarALaVista(p, 768), "1366×768: el total y «Cobrar» a la vista");
    await foto(p, "producto-efectivo-1366");
    await cobrar(p);
    ok("3.3", await espera(p.getByText(/Venta #\d+ cobrada · \$\s?18\.000,00 · vuelto \$\s?2\.000/)), "cobrada, con el vuelto en la confirmación");
    await ctx.close();
  }
  // 4 · Mercado Pago a 1024×768, y la factura con la facturación apagada
  {
    const { ctx, p } = await pagina(e, [1024, 768]);
    await sumar(p, "crema", "2");
    await form(p).getByRole("radio", { name: "Mercado Pago" }).click();
    const elegido = await form(p).getByRole("radio", { name: "Mercado Pago" }).evaluate((el) => {
      const c = getComputedStyle(el);
      return c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.color !== getComputedStyle(document.body).color;
    });
    ok("4.1", elegido, "el medio elegido se ve con el acento de la casa (fondo y texto propios)");
    ok("4.2", await cobrarALaVista(p, 768), "1024×768: el total y «Cobrar» a la vista");
    await foto(p, "producto-mp-1024");
    await cobrar(p);
    ok("4.3", await espera(p.getByText(/Venta #\d+ cobrada · \$\s?25\.000,00/)), "2 cremas por Mercado Pago, cobradas");
    const facturar = p.getByRole("button", { name: "Facturar" });
    if (await facturar.count()) {
      await facturar.click();
      ok("4.4", await espera(p.getByRole("status").getByText(/^Sin factura: /)), "facturación apagada: dice por qué no sale");
    } else {
      ok("4.4", await espera(p.locator('[data-vender="factura"]')), `facturación apagada: «${(await p.locator('[data-vender="factura"]').first().innerText().catch(() => "")).slice(0, 80)}»`);
    }
    await foto(p, "factura-apagada-1024");
    await ctx.close();
  }
  // 5 · Celular: el cobro fijo abajo y nada desborda
  {
    const { ctx, p } = await pagina(e, [390, 844]);
    await sumar(p, "sérum", "1");
    await form(p).getByRole("radio", { name: "Efectivo" }).click();
    await foto(p, "producto-390");
    ok("5.1", (await cobrarALaVista(p, 844)) && (await sinDesborde(p)), "390 px: total y «Cobrar» a la vista, sin desplazar de costado");
    await ctx.close();
  }
} catch (err) {
  console.log(String(err).split("\n").slice(0, 4).join("\n"));
  ok("recorrido", false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
}
await e.cerrar();

// ── «Diseño nuevo»: el mostrador va en el cajón, en una columna ──
e = await levantarEntornoCH({ log: () => {} });
try {
  await prepararMostradorCH(e, { nuevo: true });
  for (const [w, h] of [[390, 844], [1024, 768], [1366, 768]]) {
    const { ctx, p } = await pagina(e, [w, h]);
    await p.getByRole("button", { name: "Cobrar en el mostrador" }).click();
    await p.getByRole("tab", { name: /Productos/ }).click();
    await sumar(p, "sérum", "1");
    const buscador = await form(p).locator('#vender-buscar, input[role="combobox"]').last().boundingBox();
    const dentro = await p.locator("dialog[open]").evaluate((d) => d.scrollWidth <= d.clientWidth + 1);
    ok(`6.${w}`, dentro && !!buscador && buscador.width > 200, `diseño nuevo ${w}×${h}: el cajón en una columna, con buscador y sin desbordar`);
    if (w === 1024) await foto(p, "cajon-1024");
    await ctx.close();
  }
} catch (err) {
  console.log(String(err).split("\n").slice(0, 4).join("\n"));
  ok("recorrido-cajon", false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
}
await e.cerrar();

// ── Facturación PRENDIDA en homologación: la factura queda en trámite (nada sale a ARCA) ──
e = await levantarEntornoCH({ log: () => {}, env: { ARCA_INVOICING_ENABLED: "true" } });
try {
  const db = await prepararMostradorCH(e);
  const t = await db.tenant.findUniqueOrThrow({ where: { id: e.base.a.id } });
  await db.tenant.update({
    where: { id: t.id },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, modules: [...new Set([...t.modules, "arca"])] },
  });
  const { ctx, p } = await pagina(e, [1366, 768]);
  await sumar(p, "sérum", "1");
  await form(p).getByRole("radio", { name: "Efectivo" }).click();
  await cobrar(p);
  await espera(p.getByText(/Venta #\d+ cobrada/));
  await p.getByRole("button", { name: "Facturar" }).click();
  const estado = p.getByRole("status").getByText(/Factura en trámite con ARCA|^Factura [ABC] \d{4}-\d{8}/);
  ok("7.1", await espera(estado, 20000), `facturación prendida (homologación): «${(await estado.first().innerText().catch(() => "")).slice(0, 60)}»`);
  await foto(p, "factura-homologacion-1366");
  await ctx.close();
} catch (err) {
  console.log(String(err).split("\n").slice(0, 4).join("\n"));
  ok("recorrido-factura", false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
}
await e.cerrar();

ok("consola", errores.length === 0, `cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
await b.close();
const fallas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK · capturas en ${OUT}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify(filas, null, 1));
process.exit(fallas.length ? 1 : 0);
