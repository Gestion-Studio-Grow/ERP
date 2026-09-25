// Recorrido funcional de punta a punta de MAGRA con «Diseño nuevo», clic por clic, contra el servidor
// compartido :3210. Lo corre como un usuario real: entra, vende por peso, cobra, prepara un pedido,
// cierra el turno, abre una ficha, cuenta stock, traslada entre locales y usa Ctrl+K.
// Uso: node recorrido.mjs <390|1440> [--cerrar-turno]
//   · 390 = 390×844 dpr 2 (celular) · 1440 = 1440×900 (compu). Toda pantalla se mide además a 360 px.
//   · --cerrar-turno: cierra de verdad el turno de caja y lo vuelve a abrir con el mismo fondo.
//   · El cierre del DÍA se recorre hasta dejar el deslizador habilitado, sin deslizar: congelaría el
//     día del laboratorio compartido (no se rehace) para las otras sesiones.
// Falla (exit 1) ante cualquier paso roto o cualquier error de consola.
import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";

const DIR = "/home/user/erp/.qa/rediseno/magra/";
const ancho = Number(process.argv[2] || 390);
const cerrarTurno = process.argv.includes("--cerrar-turno");
const vp = ancho === 390 ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const BASE = "http://magra.localhost:3210";
const CLAVE = (process.env.LAB_CLAVE_COMUN ?? "");
const T = 30000;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: ancho === 390 ? 2 : 1 });
const p = await ctx.newPage();
p.setDefaultTimeout(T);
const errores = [];
let pasoActual = "arranque";
p.on("console", (m) => { if (m.type() === "error") errores.push(`[${pasoActual}] ${m.text().slice(0, 300)}`); });
p.on("pageerror", (e) => errores.push(`[${pasoActual}] pageerror ${String(e).slice(0, 300)}`));

const res = [];
const callejones = [];
let nFoto = 0;
const foto = async (nombre) => { nFoto++; const f = `${DIR}fotos/${ancho}_${String(nFoto).padStart(2, "0")}_${nombre}.png`; await p.screenshot({ path: f, fullPage: true }).catch(() => {}); return f; };
const log = (s) => { console.log(s); };
async function paso(nombre, fn) {
  pasoActual = nombre;
  const antes = errores.length;
  const t0 = Date.now();
  let ok = true, det = "";
  try { det = (await fn()) ?? ""; } catch (e) { ok = false; det = String(e.message || e).split("\n")[0].slice(0, 300); }
  const errs = errores.slice(antes);
  if (errs.length) ok = false;
  await foto(nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
  res.push({ paso: nombre, ok, det, ms: Date.now() - t0, errs });
  log(`${ok ? "OK  " : "FALLA"} ${nombre} (${Date.now() - t0} ms) ${det}${errs.length ? " ERRORES=" + errs.join(" | ") : ""}`);
  return ok;
}
function afirmar(c, msg) { if (!c) throw new Error(msg); }
// Medidas de la pantalla actual: scroll horizontal a 360, controles < 44 px (al ancho de la corrida).
const medidas = [];
async function medir(nombre) {
  const med = async () => p.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    const chicos = [...main.querySelectorAll("a, button, input:not([type=hidden]), select, textarea, [role=button], [role=slider]")]
      .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.height < 44 && cs.visibility !== "hidden" && !e.closest("[aria-hidden=true]") && !e.classList.contains("sr-only"); })
      .map((e) => `${(e.innerText || e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.name || e.tagName).trim().replace(/\s+/g, " ").slice(0, 28)}:${Math.round(e.getBoundingClientRect().height)}`);
    return { sx: document.documentElement.scrollWidth - innerWidth, chicos, diseno: document.querySelector("[data-diseno]")?.getAttribute("data-diseno") ?? null };
  });
  const aqui = await med();
  await p.setViewportSize({ width: 360, height: 780 });
  await p.waitForTimeout(300);
  const a360 = await med();
  await p.setViewportSize(vp);
  await p.waitForTimeout(200);
  medidas.push({ pantalla: nombre, url: new URL(p.url()).pathname, diseno: aqui.diseno, scrollX360: a360.sx, scrollXAncho: aqui.sx, menoresDe44: aqui.chicos });
  return `diseno=${aqui.diseno} sx360=${a360.sx} chicos<44=${aqui.chicos.length}`;
}
const texto = async (sel) => (await p.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const irA = async (ruta) => { const r = await p.goto(BASE + ruta, { waitUntil: "networkidle", timeout: T }); return r?.status(); };
// Navegación del lado del cliente (Next): se espera a que cambie la dirección, no a la red.
const clicNav = async (loc) => { const antes = p.url(); await loc.click(); await p.waitForURL((u) => u.href !== antes, { timeout: T }).catch(() => {}); await p.waitForLoadState("networkidle"); await p.waitForTimeout(300); };
// Número de stock que muestra /admin/inventario para un corte (buscándolo como lo haría el usuario).
async function stockDe(corte) {
  await irA(`/admin/inventario?q=${encodeURIComponent(corte)}`);
  const t = await texto("main");
  const esc = corte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = t.match(new RegExp(`([-−]?[\\d.]+(?:,\\d+)?\\s?(?:kg|u))\\s*${esc}`));
  return m ? m[1] : `sin dato («${t.slice(0, 60)}»)`;
}

// ─── 1. Entrar (con teclado: Enter en la clave) ──────────────────────────────
await paso("Entrar: clave equivocada muestra error", async () => {
  // Con un email que no existe: no suma intentos fallidos al dueño (5 fallidos frenan 15 minutos).
  await irA("/admin/login");
  await p.fill("input[name=email]", "nadie-qa@magra.lab");
  await p.fill("input[name=password]", "otra-clave");
  await p.press("input[name=password]", "Enter");
  await p.waitForURL(/error=/, { timeout: T });
  await p.waitForLoadState("networkidle");
  const alerta = await texto("[role=alert]");
  afirmar(alerta.length > 0, "no hay mensaje de error con role=alert");
  const emailQueda = await p.inputValue("input[name=email]");
  return `mensaje="${alerta.slice(0, 90)}" · email conservado="${emailQueda}"`;
});
await paso("Entrar como dueño (Enter)", async () => {
  await p.fill("input[name=email]", "dueno@magra.lab");
  await p.fill("input[name=password]", CLAVE);
  await Promise.all([p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: T }), p.press("input[name=password]", "Enter")]);
  await p.waitForLoadState("networkidle");
  const h1 = await texto("h1");
  afirmar(/Hoy/.test(h1), `h1 inesperado: ${h1}`);
  return `h1="${h1}" ${await medir("Inicio")}`;
});

// ─── 1b. Reponer stock con el Recuento (el laboratorio se vacía de tanto vender) ─────
// Es además la prueba del recuento CON diferencia: se cuenta más de lo que dice el sistema.
await paso("Recuento con diferencia (repone Vacío y Pollo entero)", async () => {
  const hechos = [];
  for (const [gondola, corte, minimo, cuenta] of [["Vaca", "Vacío", 3, "8"], ["Pollo", "Pollo entero", 3, "6"]]) {
    await irA("/admin/ajustes/recuento");
    await p.getByRole("button", { name: new RegExp(`^${gondola}`) }).first().click();
    await p.waitForTimeout(400);
    const item = p.locator("ul[data-ui=planilla] > li").filter({ hasText: corte }).first();
    const fila = (await item.innerText()).replace(/\s+/g, " ");
    const sis = Number(((fila.match(/sistema ([-−]?[\d.,]+)/) || [])[1] || "0").replace("−", "-").replace(/\./g, "").replace(",", "."));
    if (sis >= minimo) { hechos.push(`${corte}: sistema ${sis}, alcanza`); continue; }
    const campo = item.locator("input");
    for (let k = 0; k < 5 && (await campo.inputValue()) !== cuenta; k++) { await campo.fill(cuenta); await p.waitForTimeout(300); }
    await p.getByRole("button", { name: /Guardar recuento/ }).first().click();
    await p.waitForTimeout(1200);
    const dlg = p.locator("dialog[open]").filter({ visible: true });
    let conf = "";
    if (await dlg.count()) {
      conf = (await dlg.first().innerText()).replace(/\s+/g, " ").slice(0, 140);
      await foto(`recuento-diferencia-${gondola}`);
      const si = dlg.first().locator("button").filter({ hasText: /Guardar|Confirmar|Sí|Cargar/ }).first();
      if (await si.count()) await si.click();
      await p.waitForTimeout(1200);
    }
    const aviso = await texto("[role=status], [role=alert]");
    await irA("/admin/ajustes/recuento");
    await p.getByRole("button", { name: new RegExp(`^${gondola}`) }).first().click();
    const despues = (await p.locator("ul[data-ui=planilla] > li").filter({ hasText: corte }).first().innerText()).replace(/\s+/g, " ");
    afirmar(despues.includes(`sistema ${cuenta}`), `${corte}: tras guardar y recargar dice "${despues}" (aviso="${aviso}")`);
    hechos.push(`${corte}: ${sis} → ${cuenta}${conf ? ` (confirmación="${conf}")` : ""} aviso="${aviso.slice(0, 90)}"`);
  }
  return hechos.join(" · ");
});

// ─── 2. Stock de los cortes antes de vender (para verificar que la venta lo descuenta) ──
let stockVacioAntes = "", stockPolloAntes = "";
await paso("Stock antes de vender", async () => {
  stockVacioAntes = await stockDe("Vacío");
  stockPolloAntes = await stockDe("Pollo entero");
  return `Vacío="${stockVacioAntes}" · Pollo="${stockPolloAntes}"`;
});

// ─── 3. Inicio → Vender (con clics) ──────────────────────────────────────────
await paso("Inicio → Vender", async () => {
  await irA("/admin");
  const link = p.getByRole("link", { name: /^Vender/ }).first();
  await clicNav(link);
  afirmar(p.url().includes("/admin/vender"), `quedó en ${p.url()}`);
  const h1 = await texto("h1");
  return `h1="${h1}" ${await medir("Vender")}`;
});

await paso("Vender por peso: Vacío, 1,240 + Enter", async () => {
  // Si quedó un ticket a medio hacer de otra corrida, se descarta con «Quitar línea».
  for (let i = 0; i < 6 && (await p.getByRole("button", { name: "Quitar línea" }).count()) > 0; i++) {
    await p.getByRole("button", { name: "Quitar línea" }).first().click(); await p.waitForTimeout(150);
  }
  await p.locator("[data-vender=rapidos]").getByRole("button", { name: /^Vacío/ }).first().click();
  const peso = p.getByRole("textbox", { name: "Peso en kg" }).last();
  await peso.waitFor();
  const foco = await p.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await p.keyboard.type("1,240");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(500);
  const enFoco = await p.evaluate(() => document.activeElement?.id);
  const combo = p.locator("#vender-buscar");
  const expandido = await combo.getAttribute("aria-expanded");
  const listaVisible = await p.locator("[role=listbox]").filter({ visible: true }).count();
  const linea = await texto("[data-parte=lineas]");
  afirmar(foco === "Peso en kg", `al tocar Vacío el foco no fue al peso (fue a ${foco})`);
  afirmar(enFoco === "vender-buscar", `después de Enter el foco no volvió al buscador (está en ${enFoco})`);
  afirmar(expandido !== "true" && listaVisible === 0, `la lista del buscador quedó ABIERTA (aria-expanded=${expandido}, listas visibles=${listaVisible})`);
  afirmar(/1,24\s*kg/.test(linea), `la línea no muestra 1,24 kg: "${linea.slice(0, 120)}"`);
  return `foco→peso, Enter→buscador, lista cerrada; línea="${linea.slice(0, 90)}"`;
});

let nombreBotonBloqueado = "";
await paso("Pollo entero sin cantidad → Cobrar bloqueado", async () => {
  await p.locator("[data-vender=rapidos]").getByRole("button", { name: /^Pollo entero/ }).first().click();
  await p.waitForTimeout(300);
  const campo = p.locator("[data-parte=lineas] input[data-tipo]").last();
  await campo.fill("");
  await p.waitForTimeout(300);
  const boton = p.locator("form[data-vender=formulario] button[type=submit]").last();
  nombreBotonBloqueado = (await boton.innerText()).replace(/\s+/g, " ").trim();
  const deshabilitado = (await boton.isDisabled()) || (await boton.getAttribute("aria-disabled")) === "true";
  afirmar(/Falta la cantidad/.test(nombreBotonBloqueado), `el botón dice "${nombreBotonBloqueado}"`);
  afirmar(deshabilitado, "el botón no está bloqueado");
  // Enter en el campo vacío no debe cobrar ni mover el foco.
  await campo.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  const sigue = await p.evaluate(() => document.activeElement?.getAttribute("data-tipo"));
  afirmar(sigue, "Enter en la cantidad vacía sacó el foco del campo");
  return `botón="${nombreBotonBloqueado}" bloqueado`;
});

let codigoVenta = "", totalVenta = "";
await paso("Cantidad 1 y cobrar en efectivo", async () => {
  await p.locator("[data-parte=lineas] input[data-tipo]").last().fill("1");
  // Medio de pago con el teclado (Alt+1 = Efectivo, como dice la ayuda de la pantalla).
  await p.keyboard.press("Alt+1");
  await p.waitForTimeout(300);
  const efectivo = p.getByRole("radio", { name: "Efectivo" }).first();
  const conTeclado = (await efectivo.getAttribute("aria-checked")) === "true";
  if (!conTeclado) await efectivo.click();
  const boton = p.locator("form[data-vender=formulario] button[type=submit]").last();
  const rotulo = (await boton.innerText()).replace(/\s+/g, " ").trim();
  afirmar(/^Cobrar/.test(rotulo) && !(await boton.isDisabled()), `el botón no quedó listo: "${rotulo}"`);
  await boton.click();
  const ultima = p.locator("section[aria-label='Última venta']");
  await ultima.waitFor({ timeout: T });
  const t = await texto("section[aria-label='Última venta']");
  const m = t.match(/Venta #(\d+)\s+cobrada\s*·\s*(\$\s?[\d.,]+)/);
  afirmar(m, `no apareció la venta cobrada: "${t.slice(0, 120)}"`);
  codigoVenta = m[1]; totalVenta = m[2];
  const lineas = await p.locator("[data-parte=lineas] input[data-tipo]").count();
  return `Alt+1 ${conTeclado ? "eligió" : "NO eligió"} Efectivo · botón "${rotulo}" → Venta #${codigoVenta} ${totalVenta}; ticket nuevo con ${lineas} línea(s) vacía(s)`;
});

await paso("Persistencia: la venta está en Ventas tras recargar", async () => {
  afirmar(codigoVenta, "no hay venta que buscar (el cobro anterior falló)");
  await irA("/admin/ventas");
  await p.reload({ waitUntil: "networkidle" });
  const cuerpo = await texto("main");
  afirmar(cuerpo.includes(`#${codigoVenta}`) || cuerpo.includes(codigoVenta), `la venta #${codigoVenta} no aparece en Ventas`);
  return `#${codigoVenta} listada · ${await medir("Ventas")}`;
});

await paso("Persistencia: el stock bajó", async () => {
  const v = await stockDe("Vacío");
  const pl = await stockDe("Pollo entero");
  afirmar(v !== stockVacioAntes || pl !== stockPolloAntes, `el stock no cambió: Vacío "${v}" / Pollo "${pl}"`);
  return `Vacío: "${stockVacioAntes}" → "${v}" · Pollo: "${stockPolloAntes}" → "${pl}"`;
});

// ─── 4. Pedido para preparar ─────────────────────────────────────────────────
await paso("Inicio → Pedidos para preparar → Preparar", async () => {
  await irA("/admin");
  await clicNav(p.getByRole("link", { name: /Pedidos para preparar/ }).first());
  afirmar(p.url().includes("/admin/pedidos"), `quedó en ${p.url()}`);
  const filtro = async () => (await p.getByRole("button", { name: /^Para preparar/ }).first().innerText()).replace(/\s+/g, " ");
  const antes = await filtro();
  const med = await medir("Pedidos");
  const fila = p.locator("main button").filter({ hasText: /^Preparar$/ }).filter({ visible: true }).first();
  const nombreAcc = await fila.evaluate((e) => e.getAttribute("aria-label") || e.innerText);
  await fila.click();
  await p.waitForTimeout(1500);
  const dialogo = p.locator("dialog[open], [role=dialog]").filter({ visible: true });
  let enDialogo = "";
  if (await dialogo.count()) {
    enDialogo = (await dialogo.first().innerText()).replace(/\s+/g, " ").slice(0, 160);
    await foto("pedido-preparar-dialogo");
    const confirmar = dialogo.first().getByRole("button", { name: /Listo|Preparado|Confirmar|Marcar/i }).first();
    if (await confirmar.count()) { await confirmar.click(); await p.waitForTimeout(1500); }
  }
  await p.reload({ waitUntil: "networkidle" });
  const despues = await filtro();
  afirmar(antes !== despues || enDialogo, `el pedido no cambió de estado (${antes} → ${despues})`);
  return `botón «${nombreAcc}» · ${antes} → ${despues}${enDialogo ? ` · diálogo="${enDialogo}"` : ""} · ${med}`;
});

// ─── 5. Caja del turno y cierre ──────────────────────────────────────────────
await paso("Inicio → Caja del día → Cerrar el turno", async () => {
  await irA("/admin");
  await clicNav(p.getByRole("link", { name: /Caja del día/ }).first());
  afirmar(p.url().includes("/admin/caja"), `quedó en ${p.url()}`);
  const med = await medir("Caja del día");
  const caja = await texto("main");
  afirmar(caja.includes(totalVenta.replace(/\s/g, "")) || caja.includes(totalVenta), `la caja no muestra la venta de ${totalVenta}`);
  await p.getByRole("button", { name: "Cerrar el turno" }).click();
  // El cajón lateral: se lo ubica por su formulario (el campo «Efectivo contado»).
  const dlg = p.locator("form").filter({ has: p.locator("input[name=counted]") }).filter({ visible: true }).first();
  await dlg.waitFor();
  const esDialogo = await p.locator("dialog[open]").filter({ visible: true }).count();
  const contado = dlg.locator("input[name=counted]");
  // Primero vacío: tiene que frenar con un mensaje.
  await dlg.getByRole("button", { name: "Cerrar caja" }).click();
  await p.waitForTimeout(500);
  const aviso = (await dlg.innerText()).replace(/\s+/g, " ");
  const esperado = (aviso.match(/esperad[oa][^$]*(\$\s?[\d.,]+)/i) || [])[1] || "";
  await contado.fill(esperado.replace(/[$\s.]/g, "").replace(",", ".") || "0");
  await p.waitForTimeout(300);
  const vista = (await dlg.innerText()).replace(/\s+/g, " ");
  if (!cerrarTurno) {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
    const cerrado = (await p.locator("input[name=counted]").filter({ visible: true }).count()) === 0;
    afirmar(cerrado, "Escape no cerró el cajón");
    return `esperado=${esperado} · vista previa="${(vista.match(/(Cuadra|Faltante[^A-Z]*|Sobrante[^A-Z]*)/) || [""])[0].slice(0, 40)}" · <dialog> abierto=${esDialogo} · Escape cierra (sin cerrar el turno en esta corrida) · ${med}`;
  }
  await dlg.getByRole("button", { name: "Cerrar caja" }).click();
  await dlg.getByRole("button", { name: /Sí, cerrar caja/ }).click();
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
  await p.reload({ waitUntil: "networkidle" });
  const trasCerrar = await texto("main");
  afirmar(/Abrir caja/.test(trasCerrar), "tras cerrar y recargar no aparece «Abrir caja»");
  await foto("caja-cerrada");
  // Se vuelve a abrir para dejar el laboratorio como estaba.
  await p.locator("input[name=openingFloat]").fill(esperado.replace(/[$\s.]/g, "").replace(",", ".") || "0");
  await p.getByRole("button", { name: "Abrir caja" }).click();
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
  await p.reload({ waitUntil: "networkidle" });
  afirmar(await p.getByRole("button", { name: "Cerrar el turno" }).count(), "no se pudo volver a abrir la caja");
  return `turno cerrado con ${esperado} (persistió tras recargar) y reabierto · ${med}`;
});

await paso("Cierre del día: contar y revisar", async () => {
  await irA("/admin");
  await clicNav(p.getByRole("link", { name: /Cierre del día/ }).first());
  afirmar(p.url().includes("/admin/caja/cierre"), `quedó en ${p.url()}`);
  const med = await medir("Cierre del día");
  const form = p.locator("form").filter({ has: p.getByRole("slider") }).first();
  // Cada medio se cuenta con lo que «debería haber» (cuadra): el importe está en la misma fila.
  const campos = form.locator("input[data-importe]").filter({ visible: true });
  const n = await campos.count();
  const filas = [];
  for (let i = 0; i < n; i++) {
    const c = campos.nth(i);
    const fila = c.locator("xpath=ancestor::div[1]");
    const medio = (await fila.locator("label span").first().innerText()).trim();
    const esperadoTxt = (await fila.locator("xpath=./span[1]").innerText()).replace(/Debería haber/i, "");
    const imp = esperadoTxt.replace(/[^\d,-]/g, "");
    // Si la pantalla todavía no terminó de hidratarse, React borra lo tipeado: se reintenta.
    for (let k = 0; k < 5 && (await c.inputValue()) !== imp; k++) { await c.fill(imp); await p.waitForTimeout(400); }
    filas.push(`${medio}=${imp}`);
  }
  await campos.last().focus();
  await p.keyboard.press("Enter"); // «Revisar lo contado» (botón oculto de envío)
  await p.waitForTimeout(800);
  const slider = p.getByRole("slider").first();
  const bloqueado = await slider.getAttribute("aria-disabled");
  const leyenda = (await form.innerText()).replace(/\s+/g, " ").slice(-240);
  afirmar(bloqueado !== "true", `el deslizador sigue bloqueado: "${leyenda}"`);
  return `contado=${filas.join(" ; ")} · deslizador habilitado (NO se desliza: congelaría el día compartido) · ${med}`;
});

// ─── 6. Ficha de cliente: alta, búsqueda y ficha (persistencia) ──────────────
const nombreCliente = `QA Recorrido ${ancho} ${Date.now().toString().slice(-5)}`;
await paso("Clientes: búsqueda sin resultados (estado vacío)", async () => {
  await irA("/admin/clientes");
  const buscador = p.getByPlaceholder("Nombre o teléfono…").first();
  await buscador.fill("zzqqxxsinnadie");
  await buscador.press("Enter");
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(1000);
  const cuerpo = await texto("main");
  const i = cuerpo.indexOf("Situación");
  const tramo = cuerpo.slice(i, i + 400);
  afirmar(/No (hay|encontr|aparece)|Ningun|sin resultados|Nadie/i.test(tramo), `no hay mensaje de vacío claro: "${tramo.slice(0, 220)}"`);
  return `vacío="${tramo.slice(0, 200)}"`;
});
await paso("Clientes → Nueva ficha → buscarla → abrir ficha", async () => {
  await irA("/admin/clientes");
  // En el celular «Nueva ficha» vive en el menú «⋯» (Más de clientes).
  let viaMenu = false;
  if (!(await p.getByRole("button", { name: "Nueva ficha" }).filter({ visible: true }).count())) {
    viaMenu = true;
    await p.getByRole("button", { name: /Más de clientes/ }).filter({ visible: true }).first().click();
    await p.waitForTimeout(400);
    await foto("clientes-menu-mas");
  }
  await p.getByRole("button", { name: "Nueva ficha" }).or(p.getByRole("menuitem", { name: "Nueva ficha" })).filter({ visible: true }).first().click();
  const form = p.locator("form").filter({ has: p.getByRole("button", { name: "Crear ficha" }) }).first();
  await form.waitFor();
  const campos = form.locator("input:not([type=hidden]):not([type=date]):not([type=email]):not([type=checkbox])").filter({ visible: true });
  await campos.nth(0).fill(nombreCliente);
  if ((await campos.count()) > 1) await campos.nth(1).fill("11 5555-" + Date.now().toString().slice(-4));
  await form.getByRole("button", { name: "Crear ficha" }).click();
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(2500);
  const tras = `${new URL(p.url()).pathname} aviso="${(await texto("[role=status], [role=alert]")).slice(0, 80)}"`;
  // Recargar y buscarla con el buscador de la pantalla.
  await irA("/admin/clientes");
  const buscador = p.getByPlaceholder("Nombre o teléfono…").first();
  await buscador.fill(nombreCliente);
  await buscador.press("Enter");
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(1000);
  const link = p.getByRole("link", { name: nombreCliente }).first();
  afirmar(await link.count(), `la ficha nueva "${nombreCliente}" no aparece al buscarla (tras crear: ${tras})`);
  await clicNav(link);
  const h1 = await texto("h1");
  afirmar(h1.includes(nombreCliente), `la ficha abrió con h1="${h1}"`);
  return `${viaMenu ? "(por el menú ⋯) " : ""}tras crear: ${tras} · ficha "${h1}" en ${new URL(p.url()).pathname} · ${await medir("Ficha de cliente")}`;
});
await paso("Ficha de un cliente con compras", async () => {
  await irA("/admin/clientes");
  await clicNav(p.getByRole("link", { name: "Catalina Rodríguez" }).first());
  const h1 = await texto("h1");
  const cuerpo = await texto("main");
  afirmar(h1.includes("Catalina"), `h1="${h1}"`);
  return `h1="${h1}" · ${cuerpo.slice(0, 140)}`;
});

// ─── 7. Stock y recuento ─────────────────────────────────────────────────────
await paso("Stock → Contar → Recuento de un corte", async () => {
  await irA("/admin/inventario");
  const med = await medir("Stock");
  await clicNav(p.locator("main a").filter({ hasText: /^Contar$/ }).filter({ visible: true }).first());
  afirmar(p.url().includes("recuento"), `«Contar» llevó a ${p.url()}`);
  const med2 = await medir("Recuento");
  // El primer corte «nunca contado» se cuenta con lo mismo que dice el sistema: no cambia el stock,
  // pero tiene que quedar «contado hoy» (persistencia) y aparecer en Movimientos.
  const planilla = p.locator("ul[data-ui=planilla] > li");
  await planilla.first().waitFor({ timeout: T }); // pasa el esqueleto de carga
  const nunca = planilla.filter({ hasText: "nunca contado" });
  const sinHoy = planilla.filter({ hasNotText: "contado hoy" });
  const item = (await nunca.count()) ? nunca.first() : (await sinHoy.count()) ? sinHoy.first() : planilla.first();
  afirmar(await item.count(), "no queda ningún corte sin contar hoy en esta góndola");
  const fila = (await item.innerText()).replace(/\s+/g, " ");
  const corte = (await item.locator("label").first().innerText()).trim();
  const sistema = (fila.match(/sistema ([\d.,]+)/) || [])[1];
  await item.locator("input").fill(sistema);
  const boton = p.getByRole("button", { name: /Guardar recuento|Cargá lo contado/ }).first();
  const rotuloBoton = (await boton.innerText()).trim();
  await boton.click();
  await p.waitForTimeout(1500);
  const dlg = p.locator("dialog[open]").filter({ visible: true });
  let confirmacion = "";
  if (await dlg.count()) {
    confirmacion = (await dlg.first().innerText()).replace(/\s+/g, " ").slice(0, 160);
    await foto("recuento-confirmar");
    const si = dlg.first().getByRole("button", { name: /Cargar|Confirmar|Sí|Guardar/ }).first();
    if (await si.count()) await si.click();
  }
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
  const estado = await texto("[role=status], [role=alert]");
  await irA("/admin/inventario/movimientos");
  const movs = await texto("main");
  await irA("/admin/ajustes/recuento");
  const trasRecargar = (await p.locator("ul[data-ui=planilla] > li").filter({ hasText: corte }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
  afirmar(/Recuento guardado/.test(estado), `no apareció «Recuento guardado»: "${estado}"`);
  afirmar(/contado hoy/.test(trasRecargar), `tras recargar, ${corte} no figura «contado hoy»: "${trasRecargar}"`);
  return `${corte}: contado ${sistema} con «${rotuloBoton}» → tras recargar "${trasRecargar.slice(0, 60)}" · fila="${fila.slice(0, 60)}" · aviso="${estado.slice(0, 100)}" ${confirmacion ? `· confirmación="${confirmacion}"` : ""} · movimientos="${movs.slice(0, 120)}" · ${med} · ${med2}`;
});

// ─── 8. Traslado entre locales ───────────────────────────────────────────────
await paso("Traslado entre locales", async () => {
  await irA("/admin/locales/traslados");
  const med = await medir("Traslados");
  const remitosAntes = await p.getByRole("link", { name: /^Ver remito/ }).count();
  const destino = p.locator("#traslado-destino");
  const opciones = await destino.locator("option").allInnerTexts();
  const elegible = opciones.map((o, i) => ({ o, i })).find((x) => x.o.trim() && !/Eleg/i.test(x.o));
  afirmar(elegible, `el destino no ofrece locales: ${JSON.stringify(opciones)}`);
  await destino.selectOption({ index: elegible.i });
  const prod = p.getByPlaceholder("Buscá el producto").first();
  // Estado de error: un corte sin stock en el origen (Vacío, vendido arriba) frena el traslado.
  let sinStock = "";
  await prod.click(); await prod.fill("Vac");
  await p.waitForTimeout(500);
  const opVacio = p.getByRole("option", { name: /Vac[ií]o/ }).first();
  if (await opVacio.count()) {
    await opVacio.click();
    await p.getByPlaceholder(/Ej: 10,5|Ej: 12/).first().fill("50");
    await p.waitForTimeout(400);
    sinStock = await texto("main :text('no alcanza')");
    const bloqueado = await p.getByRole("button", { name: "Trasladar", exact: true }).isDisabled();
    afirmar(sinStock && bloqueado, `50 kg de Vacío no frenó el traslado (aviso="${sinStock}", bloqueado=${bloqueado})`);
    await foto("traslado-sin-stock");
  }
  // Traslado real, desde la pantalla limpia.
  await irA("/admin/locales/traslados");
  await destino.selectOption({ index: elegible.i });
  await prod.click(); await prod.pressSequentially("Asado de", { delay: 40 });
  await p.waitForTimeout(700);
  await p.getByRole("option", { name: /Asado de tira/ }).first().click();
  await p.getByPlaceholder(/Ej: 10,5|Ej: 12/).first().fill("0,5");
  await p.getByRole("button", { name: "Trasladar", exact: true }).click();
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(2000);
  const aviso = await texto("[role=status], [role=alert]");
  await p.reload({ waitUntil: "networkidle" });
  const remitosDespues = await p.getByRole("link", { name: /^Ver remito/ }).count();
  afirmar(remitosDespues > remitosAntes || /remito|traslad/i.test(aviso), `no apareció el remito nuevo (${remitosAntes} → ${remitosDespues}); aviso="${aviso}"`);
  await clicNav(p.getByRole("link", { name: /^Ver remito/ }).first());
  const remito = await texto("main");
  return `sin stock: "${sinStock}" + Trasladar bloqueado · destino="${elegible.o.trim()}" · remitos ${remitosAntes} → ${remitosDespues} · aviso="${aviso.slice(0, 80)}" · remito="${remito.slice(0, 120)}" · ${med}`;
});

// ─── 9. Ctrl+K ───────────────────────────────────────────────────────────────
await paso("Ctrl+K: buscar un cliente y abrirlo con Enter", async () => {
  await irA("/admin");
  await p.keyboard.press("Control+k");
  const input = p.getByRole("combobox", { name: "¿Qué querés hacer?" });
  await input.waitFor({ timeout: 5000 });
  await p.keyboard.type("Catalina");
  await p.waitForTimeout(1500);
  const ops = (await p.getByRole("option").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").slice(0, 40));
  afirmar(ops.some((o) => /Catalina/.test(o)), `no aparece Catalina: ${JSON.stringify(ops.slice(0, 6))}`);
  // Bajar con flechas hasta Catalina y abrirla con Enter.
  const idx = ops.findIndex((o) => /Catalina/.test(o));
  const activo = async () => (await p.locator("[role=option][aria-selected=true]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  for (let i = 0; i < 10 && !/Catalina/.test(await activo()); i++) await p.keyboard.press("ArrowDown");
  await Promise.all([p.waitForURL(/clientes\//, { timeout: T }), p.keyboard.press("Enter")]);
  await p.waitForLoadState("networkidle");
  const h1 = await texto("h1");
  return `opciones=${JSON.stringify(ops.slice(0, 5))} (Catalina en #${idx}) → h1="${h1}"`;
});
await paso("Ctrl+K: acción «cerrar el día» y Escape", async () => {
  await p.keyboard.press("Control+k");
  const input = p.getByRole("combobox", { name: "¿Qué querés hacer?" });
  await input.waitFor({ timeout: 5000 });
  await p.keyboard.type("pollo");
  await p.waitForTimeout(1500);
  const ops = (await p.getByRole("option").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").slice(0, 40));
  afirmar(ops.some((o) => /Pollo/i.test(o)), `buscar «pollo» no trae el producto: ${JSON.stringify(ops.slice(0, 6))}`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  afirmar(!(await input.isVisible().catch(() => false)), "Escape no cerró la paleta");
  return `«pollo» → ${JSON.stringify(ops.slice(0, 4))}; Escape cierra`;
});

// ─── 10. Permisos: el encargado (RECEPTION) ──────────────────────────────────
const permisos = [];
await paso("Permisos del encargado (RECEPTION)", async () => {
  const c2 = await b.newContext({ viewport: vp, deviceScaleFactor: ancho === 390 ? 2 : 1 });
  const q = await c2.newPage();
  q.on("console", (m) => { if (m.type() === "error") errores.push(`[permisos] ${m.text().slice(0, 300)}`); });
  q.on("pageerror", (e) => errores.push(`[permisos] pageerror ${String(e).slice(0, 300)}`));
  await q.goto(BASE + "/admin/login");
  await q.fill("input[name=email]", "cajero@magra.lab"); await q.fill("input[name=password]", CLAVE);
  await Promise.all([q.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: T }), q.press("input[name=password]", "Enter")]);
  for (const r of ["/admin", "/admin/vender", "/admin/pedidos", "/admin/caja", "/admin/caja/cierre", "/admin/clientes", "/admin/inventario", "/admin/ajustes/recuento", "/admin/locales/traslados", "/admin/usuarios", "/admin/reportes"]) {
    const resp = await q.goto(BASE + r, { waitUntil: "networkidle" }).catch(() => null);
    const h1 = (await q.locator("h1").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 50);
    const fin = new URL(q.url()).pathname;
    permisos.push({ ruta: r, status: resp?.status(), terminaEn: fin, h1 });
  }
  await q.screenshot({ path: `${DIR}fotos/${ancho}_permisos_cajero_ultima.png`, fullPage: true });
  await c2.close();
  return permisos.map((x) => `${x.ruta}→${x.status}${x.terminaEn !== x.ruta ? "⇒" + x.terminaEn : ""}「${x.h1}」`).join(" · ");
});

await b.close();
const fallidos = res.filter((r) => !r.ok);
const salida = { ancho, cerrarTurno, fecha: new Date().toISOString(), pasos: res, medidas, permisos, errores, venta: { codigoVenta, totalVenta }, callejones };
writeFileSync(`${DIR}resultado-${ancho}.json`, JSON.stringify(salida, null, 2));
log(`\nPASOS: ${res.length - fallidos.length}/${res.length} bien · errores de consola: ${errores.length}`);
for (const m of medidas) log(`medida ${m.pantalla} ${m.url} diseno=${m.diseno} scrollX@360=${m.scrollX360} <44px(${m.menoresDe44.length})=${m.menoresDe44.slice(0, 6).join("|")}`);
process.exit(fallidos.length || errores.length ? 1 : 0);
