// (El simulador se vuelve a instalar en cada página: `autorizado` hace de permiso que Chrome
// recuerda entre visitas, como pasa con una balanza real ya elegida.)
// Recorrido de «Balanza y lector» en MAGRA, clic por clic, contra la app de producción (`next start`)
// sobre Postgres LOCAL (entorno.mjs; nunca Neon). Una balanza de marca desconocida:
//   · ETIQUETA: el dueño detecta el formato con una etiqueta real (prefijo 21, producto de 4, control
//     del precio, importe), le pone el PLU al vacío y el LECTOR SIMULADO (tipea los números y Enter,
//     como un lector USB) carga el renglón en Vender (mostrador, 390 px) y en Pedidos.
//   · CABLE: una BALANZA SERIE SIMULADA (Toledo continuo a 4800 baudios, src/lib/balanza-serie/
//     simulador.ts) se detecta en el asistente y «Tomar peso» completa el peso del renglón; con el
//     peso moviéndose no toma nada. Sin Web Serial (celular) no aparece nada.
// Capturas a 390 y 1440 px; falla ante cualquier error de consola.
// Uso: npm run build && npm run test:balanza-e2e [carpeta de capturas]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarEntorno, RAIZ, DUENIO, MOSTRADOR } from "./entorno.mjs";
import { armarEtiquetaDeBalanza } from "../../../lib/supermercado/balanza.ts";
import { scriptDeBalanzaSimulada, scriptSinWebSerial } from "../../../lib/balanza-serie/simulador.ts";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/balanza-e2e");
await mkdir(OUT, { recursive: true });
const filas = [];
let n = 0;
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};

const entorno = await levantarEntorno();
const BASE = entorno.url;
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const errores = [];
async function pagina(ancho, script) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: ancho < 600 ? 844 : 900 }, locale: "es-AR" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (script) await ctx.addInitScript(script);
  const p = await ctx.newPage();
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
const listo = (p) => p.waitForLoadState("networkidle").catch(() => {});
const espera = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
// El lector USB «tipea» los números y manda Enter.
async function pasarPorElLector(p, campo, codigo) {
  await campo.click();
  await p.keyboard.type(codigo, { delay: 8 });
  await p.keyboard.press("Enter");
}
async function elegirVacio(p) {
  const buscar = p.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').first();
  await buscar.click();
  await buscar.fill("vac");
  await p.getByRole("option", { name: /Vac/ }).first().click();
}

// La balanza «desconocida» del local: prefijo 21, producto de 4, control del precio e importe.
const FORMATO_DEL_LOCAL = { prefijos: ["21"], digitosProducto: 4, contenido: "importe", decimales: 0, verificadorDePrecio: true };
const ETIQUETA_VACIO = armarEtiquetaDeBalanza(FORMATO_DEL_LOCAL, "123", 15500); // 1,24 kg × $12.500
const ETIQUETA_OTRA = armarEtiquetaDeBalanza(FORMATO_DEL_LOCAL, "456", 9030);

try {
  // ── 1. El dueño encuentra «Balanza y lector» en su menú ──
  const duenio = await pagina(1440);
  await entrar(duenio.p, DUENIO);
  {
    const { p } = duenio;
    ok("1.1", /Balanza y lector/.test(await p.locator("nav").first().innerText()), "el menú de MAGRA trae «Balanza y lector»");
    await p.goto(`${BASE}/admin/vender`);
    await listo(p);
    ok("1.2", (await p.getByLabel("Etiqueta de la balanza o código").count()) === 0, "sin formato guardado, Vender no muestra el campo de la etiqueta");
    await p.goto(`${BASE}/admin/balanza`);
    await listo(p);
    ok("1.3", /Probar mi balanza/.test(await p.locator("main").last().innerText()), "la pantalla abre con «Probar mi balanza: ¿cómo te da el peso?»");
  }

  // ── 2. Etiqueta: detectar, probar y guardar el formato; el PLU del vacío ──
  {
    const { p } = duenio;
    await p.locator("#detectar-codigo-0").fill(ETIQUETA_VACIO);
    await p.getByRole("radio", { name: "El importe" }).nth(0).click();
    await p.locator("#detectar-valor-0").fill("15500");
    await p.getByRole("button", { name: "Detectar el formato" }).click();
    const candidatos = p.getByRole("button", { name: /^Usar este formato/ });
    ok("2.1", await espera(candidatos), "«Detectar con una etiqueta» propone formatos con el importe que marcó la balanza");
    await p.getByRole("button", { name: "Sumar otra etiqueta" }).click();
    await p.locator("#detectar-codigo-1").fill(ETIQUETA_OTRA);
    await p.getByRole("radio", { name: "El importe" }).nth(1).click();
    await p.locator("#detectar-valor-1").fill("9030");
    await p.getByRole("button", { name: "Detectar el formato" }).click();
    await espera(p.getByText(/Encontramos el formato|formas de leerla/));
    const primero = candidatos.first();
    const etiquetaDelPrimero = await primero.getAttribute("aria-label");
    ok("2.2", /control del precio/.test(etiquetaDelPrimero ?? "") && /21/.test(etiquetaDelPrimero ?? ""), `con dos etiquetas, el primer formato es el de la balanza: ${etiquetaDelPrimero?.replace("Usar este formato: ", "")}`);
    await primero.click();
    await p.locator("#probador-etiqueta").fill(ETIQUETA_VACIO);
    ok("2.3", await espera(p.getByText("La caja la lee bien.")), "el probador lee la etiqueta con el formato elegido");
    await foto(p, "balanza-etiqueta-1440");
    await p.getByRole("button", { name: "Guardar el formato" }).click();
    ok("2.4", await espera(p.getByText(/Listo: Vender, Pedidos y la caja ya leen/)), "guardar el formato");
    const plu = p.getByLabel("Vacío", { exact: true });
    await plu.fill("123");
    await p.locator("li", { has: plu }).getByRole("button", { name: "Guardar" }).click();
    ok("2.5", await espera(p.getByText("Vacío: código 123 en la balanza.")), "el PLU 123 queda como el vacío");
  }

  // ── 3. Lector simulado: Vender (mostrador, 390) y Pedidos (dueño, 1440) ──
  {
    const m = await pagina(390);
    await entrar(m.p, MOSTRADOR);
    const { p } = m;
    await p.goto(`${BASE}/admin/vender`);
    const campo = p.getByLabel("Etiqueta de la balanza o código");
    ok("3.1", await espera(campo), "con el formato guardado, Vender muestra el campo de la etiqueta");
    await pasarPorElLector(p, campo, ETIQUETA_VACIO);
    const peso = await p.locator('input[id^="qty-"]:not([disabled])').first().inputValue().catch(() => "");
    ok("3.2", peso === "1,24" && /15\.500/.test(await p.locator("main").last().innerText()), `el lector carga «Vacío» con ${peso} kg ($15.500, el importe de la etiqueta)`);
    await foto(p, "vender-etiqueta-390");
    await p.getByRole("radio", { name: "Efectivo" }).first().click();
    await p.getByRole("button", { name: /^Cobrar/ }).first().click();
    ok("3.3", await espera(p.getByText(/Venta #\d+ cobrada/)), "se cobra la venta leída con el lector");
    await m.ctx.close();

    await duenio.p.goto(`${BASE}/admin/pedidos`);
    await listo(duenio.p);
    // Sin «Trabaja por apps», el POS de Pedidos está en un cajón que se abre con su tecla.
    const abrir = duenio.p.getByRole("button", { name: /Nueva venta|Vender|Mostrador/ }).first();
    if (!(await duenio.p.getByLabel("Etiqueta de la balanza o código").count()) && (await abrir.count())) await abrir.click();
    const campoPedidos = duenio.p.getByLabel("Etiqueta de la balanza o código");
    ok("3.4", await espera(campoPedidos), "Pedidos también tiene el campo de la etiqueta");
    await pasarPorElLector(duenio.p, campoPedidos, ETIQUETA_VACIO);
    const pesoPedidos = await duenio.p.locator('input[id^="qty-"]:not([disabled])').first().inputValue().catch(() => "");
    ok("3.5", pesoPedidos === "1,24", `en Pedidos el lector carga el vacío con ${pesoPedidos} kg`);
    await foto(duenio.p, "pedidos-etiqueta-1440");
  }

  // ── 4. Cable: balanza serie simulada (Toledo continuo, 4800 baudios) ──
  {
    const c = await pagina(1440, scriptDeBalanzaSimulada({ protocolo: "toledo", peso: 1.25, estable: true, velocidad: 4800, bits: "8N1", autorizado: true }));
    await entrar(c.p, DUENIO);
    const { p } = c;
    await p.goto(`${BASE}/admin/balanza#cable`);
    await p.locator('[data-ui="asistente-balanza-por-cable"]').getByRole("button", { name: "Conectar balanza" }).click();
    ok("4.1", await espera(p.getByText(/1,250 kg/), 40000), "el asistente encuentra la balanza (probó velocidades y protocolos) y muestra 1,250 kg");
    ok("4.2", (await p.locator('[data-ui="crudo-balanza"]').count()) > 0, "muestra lo que llega crudo, para diagnosticar");
    await foto(p, "balanza-cable-1440");
    await p.getByRole("button", { name: "Listo, guardar en esta PC" }).click();
    ok("4.3", await espera(p.locator('[data-ui="asistente-balanza-por-cable"] [role="status"]').filter({ hasText: /reconoce la balanza/ })), "queda guardada en esta PC");

    await p.goto(`${BASE}/admin/vender`);
    await elegirVacio(p);
    const tomar = p.getByRole("button", { name: "Tomar peso" });
    ok("4.4", await espera(tomar, 20000), "en Vender aparece «Tomar peso», con la balanza recordada");
    await espera(p.locator('[data-ui="tomar-peso-de-balanza"]').getByText(/listo para tomar/i), 10000);
    await tomar.click();
    const qty = p.locator('input[id^="qty-"]:not([disabled])').first();
    ok("4.5", (await qty.inputValue()) === "1,25", `«Tomar peso» completa el peso del renglón: ${await qty.inputValue()} kg`);
    await foto(p, "vender-tomar-peso-1440");
    await qty.fill("");
    await p.evaluate(() => window.__balanzaSimulada.fijarPeso(0.8, false));
    await espera(p.locator('[data-ui="tomar-peso-de-balanza"]').getByText(/Esperando que el peso se quede quieto/), 10000);
    // El botón queda con aria-disabled (no pierde el foco): se toca igual, como lo haría la persona.
    await tomar.click({ force: true });
    ok("4.6", (await qty.inputValue()) === "" && (await tomar.getAttribute("aria-disabled")) === "true", "con el peso moviéndose, «Tomar peso» no toma nada");
    await p.evaluate(() => window.__balanzaSimulada.fijarPeso(0, true));
    await espera(p.locator('[data-ui="tomar-peso-de-balanza"]').getByText(/Peso en cero/), 10000);
    await tomar.click({ force: true });
    ok("4.7", (await qty.inputValue()) === "", "con el peso en cero, tampoco");
    await c.ctx.close();
  }

  // ── 5. Celular sin Web Serial: nada se rompe, el peso va a mano ──
  {
    const cel = await pagina(390, scriptSinWebSerial());
    await entrar(cel.p, MOSTRADOR);
    await cel.p.goto(`${BASE}/admin/vender`);
    await listo(cel.p);
    ok("5.1", (await cel.p.getByRole("button", { name: /Tomar peso|Conectar balanza/ }).count()) === 0, "en el celular no aparece «Tomar peso»: el peso se escribe a mano");
    await cel.ctx.close();
    const cfg = await pagina(390, scriptSinWebSerial());
    await entrar(cfg.p, DUENIO);
    await cfg.p.goto(`${BASE}/admin/balanza`);
    ok("5.2", await espera(cfg.p.getByText(/Este navegador no puede leer la balanza por cable/)), "en «Balanza y lector» dice claro que el cable necesita Chrome o Edge en una computadora");
    await foto(cfg.p, "balanza-390");
    const sobra = await cfg.p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok("5.3", sobra <= 1, "a 390 px la pantalla no se desplaza de costado");
    await cfg.ctx.close();
  }
  await duenio.ctx.close();
} catch (err) {
  if (process.env.DEBUG) console.log(err);
  ok("recorrido", false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
}

if (process.env.DEBUG && filas.some((f) => f.estado !== "OK")) console.log("── log del servidor ──\n" + entorno.logServidor.join("").slice(-3000));
ok("consola", errores.length === 0, `cero errores de consola${errores.length ? `: ${errores.slice(0, 3).join(" | ")}` : ""}`);
await b.close();
await entorno.cerrar();
const fallas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK · capturas en ${OUT}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify(filas, null, 1));
process.exit(fallas.length ? 1 : 0);
