// QA de recorrido de la gestión de TESVO (demo): clic por clic con los tres roles, en escritorio, celular (claro y
// oscuro) y teclado. Corre contra el archivo que sirve el ERP (o contra la fuente) con un servidor local.
//
//   node src/tenants/tesvo/qa-recorrido.e2e.mjs [carpeta] [carpeta-capturas] [archivo.html]
//   (por defecto: src/tenants/tesvo/sitio · <tmp>/qa-tesvo · gestion.html)
//
// Usa el Chromium de Playwright (o CHROMIUM_PATH). Sale con 1 si algo falla.
import http from "node:http";
import os from "node:os";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const RAIZ = path.resolve(process.argv[2] ?? "src/tenants/tesvo/sitio");
const OUT = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), "qa-tesvo"));
const PAGINA = process.argv[4] ?? "gestion.html";
mkdirSync(OUT, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css" };
const srv = http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(RAIZ, ruta === "/" ? PAGINA : ruta);
  if (!f.startsWith(RAIZ) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TIPOS[path.extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(0);
const URL_BASE = `http://127.0.0.1:${srv.address().port}/`;

const fallos = [];
const ok = (cond, msg) => { if (!cond) { fallos.push(msg); console.log("  ✗", msg); } else console.log("  ✓", msg); };

// Si el Chromium instalado no es el de esta versión de Playwright: CHROMIUM_PATH=/ruta/al/chrome.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function nueva(viewport, esquema = "light") {
  const ctx = await browser.newContext({ viewport, colorScheme: esquema });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errores = [];
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|ERR_FAILED/.test(m.text())) errores.push(m.text()); });
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(URL_BASE);
  await page.waitForSelector("#principal h1");
  return { ctx, page, errores };
}
const toast = async (page) => (await page.locator("#toast").textContent())?.trim();
const sinScroll = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const usuario = async (page, id) => { await page.selectOption("#usuario", id); await page.waitForTimeout(50); };
const tab = async (page, nombre) => { await page.locator("#pestanas button", { hasText: nombre }).first().click(); await page.waitForTimeout(50); };

// ── Escritorio ──
{
  console.log("Escritorio 1366");
  const { ctx, page, errores } = await nueva({ width: 1366, height: 900 });
  ok((await page.title()) === "TESVO · Gestión", "título");
  ok(await page.locator('meta[name="generator"][content="Gestión Studio Grow"]').count() === 1, "sello GSG en meta");
  const items = await page.locator(".bandeja .item").count();
  ok(items >= 5, `bandeja de Atención con ítems (${items})`);
  await page.screenshot({ path: `${OUT}/01-hoy-atencion.png`, fullPage: true });

  // Cobrar saldo desde la bandeja
  const saldo = page.locator(".item", { hasText: "Saldo por cobrar" });
  ok(await saldo.count() === 1, "ítem de saldo");
  await saldo.getByRole("button", { name: "Cobrar" }).click();
  ok(await page.locator("#dlg[open]").count() === 1, "abre diálogo de cobro");
  await page.screenshot({ path: `${OUT}/02-cobrar.png` });
  await page.locator("#dlg").getByRole("button", { name: "Cobrar" }).click();
  await page.waitForTimeout(50);
  ok(/Saldo en cero/.test(await toast(page)), `cobro total → ${await toast(page)}`);
  await page.keyboard.press("Escape");
  ok(await page.locator(".item", { hasText: "Saldo por cobrar" }).count() === 0, "saldo sale de la bandeja");

  // Ajuste por peso
  const peso = page.locator(".item", { hasText: "Diferencia de peso" });
  await peso.getByRole("button", { name: /Aplicar/ }).click();
  ok(/Ajuste/.test(await toast(page)), "ajuste de peso aplicado");

  // Dañado: lo resuelve Atención después de hablar con el cliente
  await page.locator(".item", { hasText: "Llegó dañado" }).getByRole("button", { name: "Sigue igual" }).click();
  ok(/Sigue igual/.test(await toast(page)), "Atención carga la decisión del cliente sobre el daño");

  // Envíos: filtro y ficha
  await tab(page, "Envíos");
  await page.locator(".chips button", { hasText: "Todos" }).click();
  const filas = await page.locator("#principal tbody tr").count();
  ok(filas >= 10, `tabla de envíos (${filas})`);
  await page.fill('[data-in="busca"]', "laura");
  const nLaura = await page.locator("#principal tbody tr").count();
  ok(nLaura === 2, `buscar por cliente (${nLaura}: ${(await page.locator("#principal tbody").textContent()).slice(0, 200)})`);
  ok(await page.locator('[data-in="busca"]').evaluate((el) => el === document.activeElement), "el buscador conserva el foco");
  await page.locator("#principal tbody tr").first().locator("button.codigo").click();
  ok(await page.locator("#dlg[open] .linea li").count() === 9, "ficha con línea de tiempo");
  await page.screenshot({ path: `${OUT}/03-ficha.png` });
  await page.keyboard.press("Escape");
  await page.fill('[data-in="busca"]', "");

  // Cotizar
  await tab(page, "Cotizar");
  await page.fill('[data-cot="item.0.descripcion"]', "Notebook");
  await page.fill('[data-cot="item.0.valor"]', "900");
  await page.fill('[data-cot="kg"]', "2,5");
  await page.fill('[data-cot="l"]', "45"); await page.fill('[data-cot="a"]', "32"); await page.fill('[data-cot="h"]', "9");
  const res = await page.locator("#cot-resultado").textContent();
  ok(/Total TESVO/.test(res) && /IVA/.test(res), "cotización en vivo con IVA");
  ok(await page.locator('[data-cot="h"]').evaluate((el) => el === document.activeElement), "el campo conserva el foco mientras se escribe");
  await page.getByRole("button", { name: "+ Otro producto" }).click();
  await page.fill('[data-cot="item.1.descripcion"]', "Auriculares");
  await page.fill('[data-cot="item.1.valor"]', "250");
  await page.getByRole("button", { name: "Partir para ahorrar" }).click();
  ok(/Partido en/.test(await page.locator("#cot-resultado").textContent()), "partir para ahorrar muestra grupos");
  await page.screenshot({ path: `${OUT}/04-cotizar.png`, fullPage: true });
  await page.fill('[data-cot="item.1.valor"]', "3500");
  ok(/tope/.test(await page.locator("#cot-resultado").textContent()), "aviso de tope");
  await page.fill('[data-cot="item.1.valor"]', "250");
  await page.getByRole("button", { name: "Guardar cotización" }).click();
  ok(/Cotización guardada/.test(await toast(page)), "guarda cotización");
  const abiertas = page.locator("#principal tbody tr");
  await abiertas.first().getByRole("button", { name: "Confirmar" }).click();
  await page.locator("#dlg").getByRole("button", { name: "Confirmar" }).click();
  ok(/creado/.test(await toast(page)), `confirma → ${await toast(page)}`);
  ok(await page.locator("#dlg[open] .linea").count() === 1, "abre la ficha del envío nuevo");
  await page.keyboard.press("Escape");

  // Depósito con el rol de Depósito
  await usuario(page, "u-nico");
  ok(!(await page.locator("#pestanas").textContent()).includes("Caja"), "Depósito no ve la caja");
  await tab(page, "Depósito");
  await page.fill('input[name="tracking"]', "QA-TRACK-001");
  await page.fill('input[name="kg"]', "1,2");
  await page.fill('input[name="casilla"]', "TV-1001");
  await page.locator("form[data-a=recibir]").getByRole("button", { name: "Recibir" }).click();
  ok(/asignado|SIN DUEÑO/.test(await toast(page)), `recibir → ${await toast(page)}`);
  ok(await page.locator('input[name="tracking"]').evaluate((el) => el === document.activeElement), "foco vuelve al tracking para el próximo paquete");
  await page.locator(".item", { hasText: "Paquete sin dueño: TBA302777100556" }).getByRole("button", { name: "Asignar a un envío" }).click();
  await page.locator("#dlg").getByRole("button", { name: "Asignar" }).click();
  ok(/asignado/.test(await toast(page)), "asigna el paquete sin dueño");
  await page.locator(".item", { hasText: "Producto prohibido" }).getByRole("button", { name: "Vuelve al vendedor" }).click();
  ok(/vendedor/.test(await toast(page)), "resuelve el prohibido");
  await page.screenshot({ path: `${OUT}/05-deposito.png`, fullPage: true });

  // Embarques: abrir, subir, despachar, demora, arribo
  await tab(page, "Embarques");
  await page.fill('input[name="referencia"]', "AWB QA-001");
  await page.locator("form[data-a=nuevoEmbarque]").getByRole("button", { name: "Abrir embarque" }).click();
  ok(/Embarque abierto/.test(await toast(page)), "abre embarque");
  const tarjeta = page.locator("section.panel", { hasText: "AWB QA-001" });
  const subir = tarjeta.getByRole("button", { name: "Subir" });
  const n = await subir.count();
  ok(n >= 1, `hay envíos listos para subir (${n})`);
  ok(/no sube:/.test(await tarjeta.textContent()), "muestra por qué no sube lo que no está listo");
  await subir.first().click();
  ok(/Subió/.test(await toast(page)), "sube al embarque");
  await page.locator("section.panel", { hasText: "AWB QA-001" }).getByRole("button", { name: "Salió" }).click();
  await page.fill('#dlg input[name="costo"]', "20");
  await page.locator("#dlg").getByRole("button", { name: "Salió" }).click();
  ok(await page.locator("#dlg[open] .avisos li").count() >= 1, "avisos de salida por cliente");
  await page.keyboard.press("Escape");
  const msku = page.locator("section.panel", { hasText: "MSKU 7781203" });
  ok(/Pasó la fecha/.test(await msku.textContent()), "embarque marítimo marcado como atrasado");
  await msku.getByRole("button", { name: "Se demora" }).click();
  await page.fill('#dlg input[name="motivo"]', "El contenedor quedó para el próximo buque");
  await page.locator("#dlg").getByRole("button", { name: /Cargar/ }).click();
  ok(/próximo buque/.test(await page.locator("#dlg").textContent()), "avisos de demora con el motivo");
  await page.keyboard.press("Escape");
  await page.locator("section.panel", { hasText: "MSKU 7781203" }).getByRole("button", { name: "Llegó a Argentina" }).click();
  ok(/aduana/.test(await toast(page)), "arribo → aduana");
  await page.screenshot({ path: `${OUT}/06-embarques.png`, fullPage: true });

  // Aduana con Atención
  await usuario(page, "u-sole");
  await tab(page, "Embarques");
  const fila = page.locator("#principal tbody tr", { hasText: "Ferretería" });
  await fila.getByRole("button", { name: "Liberar" }).click();
  await page.locator("#dlg").getByRole("button", { name: "Liberar" }).click();
  ok(/listo/.test(await page.locator("#dlg").textContent()), "liberar arma el aviso de listo");
  await page.keyboard.press("Escape");

  // Dueño
  await usuario(page, "u-duenio");
  ok((await page.locator("#pestanas").textContent()).includes("Tablero"), "dueño ve el tablero");
  await tab(page, "Hoy");
  const dev = page.locator(".item", { hasText: "Devolver seña" });
  await dev.getByRole("button", { name: /Devolver/ }).click();
  await page.fill('#dlg input[name="pin"]', "1111");
  await page.locator("#dlg").getByRole("button", { name: "Devolver" }).click();
  ok(/PIN incorrecto/.test(await toast(page)), "PIN incorrecto rechazado");
  await page.fill('#dlg input[name="pin"]', "9999");
  await page.locator("#dlg").getByRole("button", { name: "Devolver" }).click();
  ok(/devuelta/.test(await toast(page)), "devuelve la seña con PIN");
  await tab(page, "Tablero");
  await page.screenshot({ path: `${OUT}/07-tablero.png`, fullPage: true });
  await tab(page, "Tarifas");
  await page.fill('input[name="tc"]', "1500");
  await page.locator("form[data-a=guardarTc]").getByRole("button", { name: "Guardar" }).click();
  ok(/actualizado/.test(await toast(page)), "cambia el dólar del día");
  await page.fill('input[name="derechosExcedente"]', "35");
  await page.fill('form[data-a=guardarRegimen] input[name="pin"]', "9999");
  await page.locator("form[data-a=guardarRegimen]").getByRole("button", { name: "Guardar régimen" }).click();
  ok(/Régimen actualizado/.test(await toast(page)), "cambia el régimen con PIN");
  await tab(page, "Caja");
  ok(await page.locator("#principal tbody tr").count() > 5, "caja con movimientos");
  await tab(page, "Clientes");
  await page.getByRole("button", { name: "+ Nuevo cliente" }).click();
  await page.fill('#dlg input[name="nombre"]', "Cliente QA");
  await page.fill('#dlg input[name="doc"]', "20-99999999-9");
  await page.locator("#dlg").getByRole("button", { name: "Dar de alta" }).click();
  ok(/casilla TV-/.test(await toast(page)), "alta de cliente con casilla");
  ok(errores.length === 0, `consola limpia en escritorio (${errores.join(" | ")})`);
  await ctx.close();
}

// ── Celular 390 claro y oscuro ──
for (const esquema of ["light", "dark"]) {
  console.log(`Celular 390 ${esquema}`);
  const { ctx, page, errores } = await nueva({ width: 390, height: 844 }, esquema);
  for (const [rol, tabs] of [["u-sole", ["Hoy", "Envíos", "Cotizar", "Embarques", "Clientes", "Caja"]], ["u-nico", ["Depósito", "Embarques"]], ["u-duenio", ["Tablero", "Tarifas"]]]) {
    await usuario(page, rol);
    for (const t of tabs) {
      await tab(page, t);
      ok(await sinScroll(page), `${esquema} ${rol} ${t}: sin scroll horizontal`);
    }
  }
  await usuario(page, "u-sole");
  await tab(page, "Hoy");
  await page.screenshot({ path: `${OUT}/08-movil-${esquema}.png`, fullPage: true });
  await tab(page, "Envíos");
  await page.locator("#principal tbody tr").first().locator("button.codigo").click();
  ok(await sinScroll(page), `${esquema} ficha en celular sin scroll`);
  await page.screenshot({ path: `${OUT}/09-movil-ficha-${esquema}.png` });
  ok(errores.length === 0, `consola limpia en celular ${esquema} (${errores.join(" | ")})`);
  await ctx.close();
}

// ── Teclado ──
{
  console.log("Teclado");
  const { ctx, page } = await nueva({ width: 1280, height: 800 });
  await page.keyboard.press("Tab");
  ok(await page.evaluate(() => document.activeElement?.classList.contains("saltar")), "primer Tab: saltar al contenido");
  await page.keyboard.press("Enter");
  ok(await page.evaluate(() => document.activeElement?.id === "principal"), "salta al contenido");
  await ctx.close();
}

await browser.close();
srv.close();
console.log(fallos.length ? `\n${fallos.length} FALLO(S)` : "\nTODO OK");
process.exit(fallos.length ? 1 : 0);
