// Recorrido funcional de punta a punta: CH con «Diseño nuevo», consola del operador y contador.
// Clic por clic contra el servidor compartido :3210, como un usuario real.
// Uso: node recorrido.mjs <390|1440> <fase>
//   fases: consola  → operador: entrar → lista → ficha de CH → interruptores → galería
//          ch-on    → CH (dueña) con el interruptor PRENDIDO: agenda → F1 / tecla grande → dar un turno →
//                     recargar (persistencia) → abrir el turno → terminar y cobrar → recargar → cierre de caja
//                     (sin deslizar: congelaría el día del laboratorio) + vacío/error/teclado
//          roles    → recepción y profesional (qué ven, qué no, F1)
//          contador → estudio contable: bandeja → cliente
//          apagar / prender → el operador apaga o prende «Diseño nuevo» de CH (por la pantalla real)
//          ch-off   → CH con el interruptor APAGADO: la vista de siempre (sin piel nueva, F1 no hace nada nuevo)
// Falla (exit 1) ante cualquier paso roto o cualquier error de consola.
import { chromium } from "/home/user/erp/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";

const DIR = "/home/user/erp/.qa/rediseno/ch-consola-contador/";
const ancho = Number(process.argv[2] || 390);
const fase = process.argv[3] || "ch-on";
const vp = ancho === 390 ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const CH = "http://chestetica.localhost:3210";
const OP = "http://localhost:3210";
const ESTUDIO = "http://estudio.localhost:3210";
const CLAVE = (process.env.LAB_CLAVE_COMUN ?? "");
const CH_ID = "cmuf1ub190000vu7d06np040t";
const T = 30000;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: ancho === 390 ? 2 : 1 });
let p = await ctx.newPage();
p.setDefaultTimeout(T);
const errores = [];
let pasoActual = "arranque";
const escuchar = (pg) => {
  pg.on("console", (m) => { if (m.type() === "error") errores.push(`[${pasoActual}] ${m.text().slice(0, 240)}`); });
  pg.on("pageerror", (e) => errores.push(`[${pasoActual}] pageerror ${String(e).slice(0, 240)}`));
};
escuchar(p);

const res = [];
const callejones = [];
let nFoto = 0;
const foto = async (nombre) => { nFoto++; const f = `${DIR}fotos/${fase}_${ancho}_${String(nFoto).padStart(2, "0")}_${nombre}.png`; await p.screenshot({ path: f, fullPage: true }).catch(() => {}); return f; };
async function paso(nombre, fn) {
  pasoActual = nombre;
  const antes = errores.length;
  const t0 = Date.now();
  let ok = true, det = "";
  try { det = (await fn()) ?? ""; } catch (e) { ok = false; det = String(e.message || e).split("\n")[0].slice(0, 300); }
  await p.waitForTimeout(250);
  const errs = errores.slice(antes);
  if (errs.length) ok = false;
  await foto(nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 50));
  res.push({ paso: nombre, ok, det, ms: Date.now() - t0, errs });
  console.log(`${ok ? "OK  " : "FALLA"} ${nombre} (${Date.now() - t0} ms) ${det}${errs.length ? " ERRORES=" + errs.join(" | ") : ""}`);
  return ok;
}
function afirmar(c, msg) { if (!c) throw new Error(msg); }
const medidas = [];
async function medir(nombre) {
  const med = async () => p.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    const chicos = [...main.querySelectorAll("a, button, input:not([type=hidden]), select, textarea, [role=button]")]
      .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.height < 44 && cs.visibility !== "hidden" && !e.closest("[aria-hidden=true]") && !e.classList.contains("sr-only") && !(e.tagName === "INPUT" && ["checkbox", "radio"].includes(e.type)); })
      .map((e) => `${(e.innerText || e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.name || e.tagName).trim().replace(/\s+/g, " ").slice(0, 28)}:${Math.round(e.getBoundingClientRect().height)}`);
    return { sx: document.documentElement.scrollWidth - innerWidth, chicos, diseno: document.querySelector("[data-diseno]")?.getAttribute("data-diseno") ?? null };
  });
  const aqui = await med();
  await p.setViewportSize({ width: 360, height: 780 });
  await p.waitForTimeout(350);
  const a360 = await med();
  await p.setViewportSize(vp);
  await p.waitForTimeout(200);
  medidas.push({ pantalla: nombre, url: new URL(p.url()).pathname + new URL(p.url()).search, diseno: aqui.diseno, scrollX360: a360.sx, scrollXAncho: aqui.sx, menoresDe44: aqui.chicos });
  return `diseno=${aqui.diseno} sx360=${a360.sx} chicos<44=${aqui.chicos.length}`;
}
const texto = async (sel = "main") => (await p.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const ir = async (url) => { const r = await p.goto(url, { waitUntil: "networkidle", timeout: T }); await p.waitForTimeout(300); return r?.status(); };
const clicNav = async (loc) => { const antes = p.url(); await loc.click(); await p.waitForURL((u) => u.href !== antes, { timeout: T }).catch(() => {}); await p.waitForLoadState("networkidle"); await p.waitForTimeout(400); };
// La firma de la pantalla: con qué piel se dibujó, el título, el armazón y el menú.
const firma = async () => p.evaluate(() => ({
  diseno: document.querySelector("[data-diseno]")?.getAttribute("data-diseno") ?? null,
  armazonNuevo: !!document.querySelector("[data-ui=capsula]"),
  h1: [...document.querySelectorAll("h1")].map((h) => h.innerText.trim()).join(" / "),
  menu: [...document.querySelectorAll("nav a")].map((a) => a.innerText.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 40),
  altaNueva: !!document.querySelector("[data-ui=alta-de-turno]"),
}));

async function entrarAdmin(base, email) {
  await ir(`${base}/admin/login`);
  await p.fill("input[name=email]", email);
  await p.fill("input[name=password]", CLAVE);
  await p.locator("form button[type=submit]").first().click();
  await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: T });
  await p.waitForLoadState("networkidle");
  return new URL(p.url()).pathname;
}
async function entrarOperador() {
  await ir(`${OP}/operador/login`);
  await p.fill("input[name=password]", CLAVE);
  await p.getByRole("button", { name: "Ingresar a la consola" }).click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: T });
  await p.waitForLoadState("networkidle");
  afirmar(new URL(p.url()).pathname === "/operador", `quedó en ${p.url()}`);
}
async function grupoDiseno() {
  return p.locator("[role=group][aria-labelledby^=interruptor-]").filter({ has: p.getByRole("heading", { name: "Diseño nuevo" }) }).first();
}
async function estadoDiseno() {
  await ir(`${OP}/operador/tenants/${CH_ID}?pestana=plan`);
  const g = await grupoDiseno();
  const t = (await g.innerText()).replace(/\s+/g, " ");
  return t.startsWith("Prendido") ? "prendido" : t.startsWith("Apagado") ? "apagado" : `? ${t.slice(0, 40)}`;
}
async function cambiarDiseno(quiero) {
  await entrarOperador();
  const antes = await estadoDiseno();
  if (antes === quiero) return `ya estaba ${quiero}`;
  const g = await grupoDiseno();
  const slug = g.locator("input[name=slug]");
  if (await slug.count()) await slug.fill("beauty-spa");
  await g.getByRole("button", { name: quiero === "prendido" ? "Prender «Diseño nuevo»" : "Apagar «Diseño nuevo»" }).click();
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(800);
  const despues = await estadoDiseno();
  afirmar(despues === quiero, `quedó ${despues}; aviso: ${(await texto("main")).slice(0, 160)}`);
  return `${antes} → ${despues}`;
}

// ───────────────────────────────── fases ─────────────────────────────────
if (fase === "consola") {
  await paso("operador · clave equivocada avisa", async () => {
    await ir(`${OP}/operador/login`);
    await p.fill("input[name=password]", "clave-mala");
    await p.getByRole("button", { name: "Ingresar a la consola" }).click();
    await p.waitForURL(/error=1/, { timeout: T });
    const t = await texto("body");
    afirmar(/incorrect/i.test(t), "no avisa");
    return "avisa «Nombre o clave incorrectos»";
  });
  await paso("operador · entrar", async () => { await entrarOperador(); return await medir("consola-lista"); });
  await paso("operador · buscar un negocio en la lista", async () => {
    // A 390 hay dos campos con ese placeholder (el de la cabecera de PC, oculto, y el de la
    // lista): se toma el VISIBLE. Los dos buscan al enviar (GET /operador?q=): se envía con Enter
    // y se espera la URL, así el paso prueba la búsqueda y no que CH ya estuviera en la lista.
    const campo = p.getByPlaceholder(/Buscar un negocio/i).filter({ visible: true }).first();
    const hay = await campo.count();
    if (!hay) return "sin campo de búsqueda visible";
    await campo.click();
    await campo.fill("CH");
    await campo.press("Enter");
    await p.waitForURL(/[?&]q=CH/, { timeout: T });
    const t = await texto("body");
    afirmar(/CH Estética/.test(t), "no aparece CH");
    return "busca con Enter y CH aparece";
  });
  await paso("operador · abrir la ficha de CH desde la lista", async () => {
    await ir(`${OP}/operador`);
    await clicNav(p.locator(`a[href="/operador/tenants/${CH_ID}"]`).filter({ hasText: "CH Estética" }).first());
    afirmar(p.url().includes(CH_ID), p.url());
    return `${await texto("h1")} · ${await medir("ficha-ch")}`;
  });
  await paso("operador · pestaña Plan y apps → interruptores", async () => {
    await p.getByRole("tab", { name: /Plan y apps/ }).first().click().catch(async () => { await p.getByText("Plan y apps").first().click(); });
    await p.waitForTimeout(600);
    const g = await grupoDiseno();
    afirmar(await g.isVisible(), "no se ve el interruptor");
    const t = (await g.innerText()).replace(/\s+/g, " ");
    return `${t.slice(0, 200)} · ${await medir("interruptores-ch")}`;
  });
  await paso("operador · recargar conserva la pestaña", async () => {
    const u = p.url();
    await p.reload({ waitUntil: "networkidle" });
    const g = await grupoDiseno();
    return `url=${new URL(u).search} visible=${await g.isVisible()}`;
  });
  await paso("operador · galería de diseño (desde el menú)", async () => {
    await ir(`${OP}/operador`);
    await clicNav(p.getByRole("link", { name: /^Diseño$/ }).first());
    afirmar(new URL(p.url()).pathname === "/operador/diseno", p.url());
    return `${await texto("h1")} · ${await medir("galeria")}`;
  });
  await paso("operador · galería: pieza viva de teclado y diálogo", async () => {
    const botones = await p.locator("main button").count();
    const ab = p.getByRole("button", { name: /Abrir|Probar|diálogo/i }).first();
    let det = `botones=${botones}`;
    if (await ab.count()) { await ab.click(); await p.waitForTimeout(400); det += ` dialogo=${await p.locator("dialog[open], [role=dialog]").count()}`; await p.keyboard.press("Escape"); }
    return det;
  });
  await paso("operador · negocio inexistente (error)", async () => {
    const s = await ir(`${OP}/operador/tenants/no-existe-123`);
    return `http=${s} · ${(await texto("main")).slice(0, 120)}`;
  });
  await paso("operador · sin sesión no entra", async () => {
    await ctx.clearCookies();
    await ir(`${OP}/operador/diseno`);
    afirmar(p.url().includes("/operador/login"), `sin sesión quedó en ${p.url()}`);
    return "manda al login";
  });
}

if (fase === "apagar" || fase === "prender") {
  await paso(`operador · ${fase} «Diseño nuevo» de CH`, async () => { const r = await cambiarDiseno(fase === "apagar" ? "apagado" : "prendido"); await medir("interruptor-cambiado"); return r; });
}

if (fase === "ch-on") {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const nombre = `QA Recorrido ${ancho} ${Date.now().toString().slice(-5)}`;
  // 11 4000-xxxx: el laboratorio usa 11 5555-xxxx y un teléfono repetido reconoce otra ficha.
  const tel = `11 4000-${String(Date.now()).slice(-4)}`;
  await paso("CH dueña · entrar", async () => `llegó a ${await entrarAdmin(CH, "duena@ch.lab")} · ${await medir("inicio")}`);
  await paso("CH · ir a la agenda desde el menú", async () => {
    const enlace = p.locator("a[href='/admin/turnos']").first();
    if (await enlace.isVisible().catch(() => false)) await clicNav(enlace);
    else { callejones.push("CH 390: la agenda no está a un toque en la cápsula (hubo que ir por dirección)"); await ir(`${CH}/admin/turnos`); }
    const f = await firma();
    afirmar(f.diseno === "renglon", `piel=${f.diseno}`);
    return `${f.h1} · ${await medir("agenda")}`;
  });
  await paso(ancho === 390 ? "CH · tecla grande «Dar un turno» abre la pantalla nueva" : "CH · F1 abre la pantalla nueva", async () => {
    if (ancho === 390) {
      const tecla = p.locator("[data-ui=capsula] [data-parte=rubro]");
      afirmar(await tecla.isVisible(), "no hay tecla grande");
      afirmar(/Dar un turno/.test(await tecla.innerText()), `la tecla dice ${await tecla.innerText()}`);
      await clicNav(tecla);
    } else {
      const antes = p.url();
      await p.locator("body").click({ position: { x: 700, y: 5 } }).catch(() => {});
      await p.keyboard.press("F1");
      await p.waitForURL((u) => u.href !== antes, { timeout: T });
      await p.waitForLoadState("networkidle");
    }
    await p.locator("[data-ui=alta-de-turno]").waitFor({ timeout: T });
    const f = await firma();
    afirmar(f.altaNueva, "no es el alta nueva");
    return `${new URL(p.url()).pathname}${new URL(p.url()).search} · ${await medir("alta-turno")}`;
  });
  await paso("CH · alta: validación antes de completar", async () => {
    const boton = p.locator("[data-ui=alta-de-turno] button", { hasText: /^Dar el turno/ }).last();
    afirmar(await boton.isDisabled(), "el botón deja dar un turno vacío");
    return "botón deshabilitado con el alta vacía";
  });
  let servicioElegido = "";
  await paso("CH · alta: elegir servicio y horario", async () => {
    const combo = p.getByRole("combobox", { name: "Buscar el servicio" });
    await combo.click();
    await p.waitForTimeout(300);
    const op = p.getByRole("option").first();
    servicioElegido = (await op.innerText()).replace(/\s+/g, " ").trim();
    await op.click();
    await p.waitForTimeout(300);
    // Si hoy no hay horarios, se prueba con los días siguientes.
    for (let i = 0; i < 6; i++) {
      await p.getByText(/Buscando horarios/).waitFor({ state: "hidden", timeout: T }).catch(() => {});
      const h = p.locator("[role=group][aria-label^='Horarios'] button");
      if (await h.count()) { await h.last().click(); break; }
      const dias = p.locator("[role=group][aria-label='Día'] button, [role=group][aria-label='Día'] label");
      if ((await dias.count()) > i + 1) { await dias.nth(i + 1).click(); await p.waitForTimeout(600); }
    }
    const elegido = await p.locator("[role=group][aria-label^='Horarios'] button[aria-pressed=true]").innerText().catch(() => "");
    afirmar(elegido, "no quedó ningún horario elegido");
    return `servicio «${servicioElegido.slice(0, 50)}» a las ${elegido}`;
  });
  await paso("CH · alta: clienta nueva y dar el turno", async () => {
    await p.locator("[data-ui=alta-de-turno] label", { hasText: "Nombre" }).locator("input").fill(nombre);
    await p.locator("[data-ui=alta-de-turno] label", { hasText: "Teléfono" }).locator("input").fill(tel);
    const nada = p.locator("[data-ui=alta-de-turno] label", { hasText: /^Nada$/ });
    if (await nada.count()) await nada.first().click();
    const boton = p.locator("[data-ui=alta-de-turno] button", { hasText: /^Dar el turno/ }).last();
    const rotulo = (await boton.innerText()).replace(/\s+/g, " ");
    afirmar(!(await boton.isDisabled()), `sigue deshabilitado: ${await texto("[data-ui=alta-de-turno]")}`.slice(0, 300));
    const antes = p.url();
    await boton.click();
    await p.waitForURL((u) => u.href !== antes && !u.search.includes("nuevo=1"), { timeout: T });
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(600);
    afirmar((await texto("main")).includes(nombre), `el turno no aparece en la agenda (${p.url()})`);
    return `«${rotulo}» → ${new URL(p.url()).pathname}${new URL(p.url()).search}`;
  });
  await paso("CH · recargar: el turno quedó", async () => {
    await p.reload({ waitUntil: "networkidle" });
    afirmar((await texto("main")).includes(nombre), "después de recargar no está");
    return "sigue en la agenda";
  });
  await paso("CH · abrir el turno (cajón)", async () => {
    const fila = p.locator("main a, main button").filter({ hasText: nombre }).first();
    await clicNav(fila);
    await p.waitForTimeout(500);
    afirmar(p.url().includes("turno="), `no abrió el cajón: ${p.url()}`);
    return `${new URL(p.url()).search} · ${await medir("cajon-turno")}`;
  });
  await paso("CH · Escape cierra el cajón y vuelve a la agenda", async () => {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(800);
    const cerrado = !p.url().includes("turno=");
    if (!cerrado) callejones.push("CH: Escape no cierra el cajón del turno");
    if (!cerrado) await p.goBack();
    await p.waitForLoadState("networkidle");
    const fila = p.locator("main a, main button").filter({ hasText: nombre }).first();
    await clicNav(fila);
    return `Escape cierra=${cerrado}; reabierto ${p.url().includes("turno=")}`;
  });
  let cobrado = "";
  await paso("CH · confirmar y cobrar el turno", async () => {
    const dlg = p.locator("dialog[open]").last();
    await dlg.waitFor({ timeout: T });
    let det = "";
    const conf = dlg.getByRole("button", { name: "Confirmar el turno" });
    if (await conf.count()) {
      await conf.click();
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(1500);
      det += "confirmado; ";
    }
    const d2 = p.locator("dialog[open]").last();
    afirmar(await d2.count(), `después de confirmar el cajón se cerró (${p.url()})`);
    const efectivo = d2.locator("label", { hasText: /^Efectivo$/ }).first();
    afirmar(await efectivo.count(), `no hay «Cómo paga»: ${(await d2.innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
    await efectivo.click();
    const boton = d2.getByRole("button", { name: /^(Terminar y cobrar|Cobrar \$)/ }).first();
    cobrado = (await boton.innerText()).replace(/\s+/g, " ");
    afirmar(!(await boton.isDisabled()), `«${cobrado}» deshabilitado`);
    await boton.click();
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(1800);
    const alerta = (await p.locator("main [role=alert], dialog[open] [role=alert]").allInnerTexts()).filter((a) => a.trim());
    afirmar(!alerta.length, `alerta: ${alerta.join(" | ")}`);
    return det + `«${cobrado}» · ${(await p.locator("[role=status]").allInnerTexts()).join(" | ").slice(0, 160)}`;
  });
  await paso("CH · recargar: el turno figura terminado y cobrado", async () => {
    await ir(p.url().replace(/[?&]turno=[^&]+/, "") || `${CH}/admin/turnos`);
    const t = await texto("main");
    const i = t.indexOf(nombre);
    afirmar(i >= 0, "el turno no está en la agenda");
    afirmar(!/^.{0,140}Reservado, sin confirmar/.test(t.slice(i)), "después de recargar sigue «Reservado, sin confirmar»");
    return `renglón: «${t.slice(Math.max(0, i - 60), i + 120)}»`;
  });
  await paso("CH · ficha de la clienta nueva (desde el buscador Ctrl+K)", async () => {
    await p.keyboard.press("Control+k");
    const dlg = p.locator("dialog[open]").last();
    await p.getByRole("combobox", { name: "¿Qué querés hacer?" }).waitFor({ timeout: 5000 }).catch(() => { throw new Error("Ctrl+K no abre el buscador"); });
    await p.keyboard.type(nombre.split(" ").slice(0, 2).join(" "));
    await p.waitForTimeout(1500);
    const op = dlg.getByRole("option").filter({ hasText: nombre }).first();
    if (!(await op.count())) { const t = (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 200); await p.keyboard.press("Escape"); return `el buscador no trae la clienta recién creada: «${t}»`; }
    await clicNav(op);
    return `${new URL(p.url()).pathname} · ${await medir("ficha-clienta")}`;
  });
  await paso("CH · cierre de caja (sin deslizar)", async () => {
    await ir(`${CH}/admin`);
    const enlace = p.locator("a[href='/admin/caja/cierre'], a[href='/admin/caja']").filter({ visible: true }).first();
    if (await enlace.isVisible().catch(() => false)) await clicNav(enlace);
    else { callejones.push(`CH ${ancho}: el cierre de caja no está a mano desde el inicio (se entra por dirección)`); await ir(`${CH}/admin/caja/cierre`); }
    if (!p.url().includes("/cierre")) { const c = p.locator("a[href='/admin/caja/cierre']").filter({ visible: true }).first(); if (await c.count()) await clicNav(c); else await ir(`${CH}/admin/caja/cierre`); }
    const t = await texto("main");
    return `${new URL(p.url()).pathname} · «${t.slice(0, 180)}» · ${await medir("cierre")}`;
  });
  await paso("CH · agenda de un día sin turnos (vacío)", async () => {
    await ir(`${CH}/admin/turnos?date=2027-03-14`);
    const t = await texto("main");
    const cta = await p.locator("main a[href*='nuevo=1'], main button").filter({ hasText: /turno/i }).count();
    return `«${t.slice(0, 160)}» · acciones con «turno»=${cta} · ${await medir("agenda-vacia")}`;
  });
  await paso("CH · turno que no existe (error)", async () => {
    const s = await ir(`${CH}/admin/turnos?turno=no-existe-999`);
    return `http=${s} · «${(await texto("main")).slice(0, 140)}»`;
  });
  await paso("CH · fecha inválida en la dirección", async () => {
    const s = await ir(`${CH}/admin/turnos?date=nada`);
    return `http=${s} · «${(await texto("main")).slice(0, 120)}»`;
  });
  await paso("CH · lista de turnos y «para mañana»", async () => {
    await ir(`${CH}/admin/turnos/lista`);
    const a = await medir("lista");
    await ir(`${CH}/admin/turnos/manana`);
    return `lista: ${a} · mañana: ${await medir("manana")}`;
  });
}

if (fase === "roles") {
  for (const [email, rol] of [["recepcion@ch.lab", "recepción"], ["valentina@ch.lab", "profesional"]]) {
    const ctx2 = await b.newContext({ viewport: vp, deviceScaleFactor: ancho === 390 ? 2 : 1 });
    console.log("contexto nuevo", email);
    p = await ctx2.newPage(); p.setDefaultTimeout(T); escuchar(p);
    await paso(`CH ${rol} · entrar`, async () => `llegó a ${await entrarAdmin(CH, email)} · ${await medir(`inicio-${rol}`)}`);
    await paso(`CH ${rol} · agenda`, async () => {
      await ir(`${CH}/admin/turnos`);
      const f = await firma();
      return `piel=${f.diseno} · ${(await texto("main")).slice(0, 120)} · ${await medir(`agenda-${rol}`)}`;
    });
    await paso(`CH ${rol} · tecla «Dar un turno» / F1`, async () => {
      const tecla = await p.locator("[data-ui=capsula] [data-parte=rubro], a[aria-keyshortcuts=F1]").count();
      const antes = p.url();
      await p.keyboard.press("F1");
      await p.waitForTimeout(1500);
      const fue = p.url() !== antes;
      if (rol === "profesional") afirmar(!tecla && !fue, `la profesional tiene tecla=${tecla} / F1 navegó=${fue}`);
      else afirmar(tecla && fue, `recepción: tecla=${tecla} F1 navegó=${fue}`);
      return `tecla=${tecla} F1navega=${fue}`;
    });
    await paso(`CH ${rol} · entrar por dirección al alta`, async () => {
      await ir(`${CH}/admin/turnos/lista?nuevo=1`);
      const alta = await p.locator("[data-ui=alta-de-turno]").count();
      if (rol === "profesional") afirmar(!alta, "la profesional ve el alta de turnos por dirección");
      return `alta visible=${alta} · «${(await texto("main")).slice(0, 100)}»`;
    });
    await paso(`CH ${rol} · cierre de caja`, async () => {
      const s = await ir(`${CH}/admin/caja/cierre`);
      return `http=${s} url=${new URL(p.url()).pathname} · «${(await texto("main")).slice(0, 120)}»`;
    });
    await paso(`CH ${rol} · usuarios (sólo dueña)`, async () => {
      const s = await ir(`${CH}/admin/usuarios`);
      const t = await texto("main");
      afirmar(!/Invitar|Nuevo usuario|Agregar usuario/i.test(t) || rol === "dueña", `${rol} puede gestionar usuarios`);
      return `http=${s} url=${new URL(p.url()).pathname} · «${t.slice(0, 100)}»`;
    });
    await Promise.race([ctx2.close(), new Promise((r) => setTimeout(r, 5000))]);
  }
}

if (fase === "contador") {
  await paso("contador · entrar", async () => `llegó a ${await entrarAdmin(ESTUDIO, "contador@estudio.lab")}`);
  await paso("contador · bandeja", async () => {
    if (!new URL(p.url()).pathname.startsWith("/contador")) {
      const l = p.locator("a[href='/contador']").first();
      if (await l.isVisible().catch(() => false)) await clicNav(l);
      else { callejones.push(`contador ${ancho}: desde el inicio del estudio no hay acceso visible a /contador (se entra por dirección)`); await ir(`${ESTUDIO}/contador`); }
    }
    const t = await texto("main");
    return `«${t.slice(0, 200)}» · ${await medir("bandeja")}`;
  });
  await paso("contador · abrir un cliente (Abrir en su renglón)", async () => {
    const fila = p.locator("main tr").filter({ hasText: "Shine Velas" }).first();
    afirmar(await fila.count(), "no hay renglón de Shine Velas en la cartera");
    await fila.getByRole("button", { name: /Abrir/ }).first().click();
    await p.waitForTimeout(1500);
    const t = await texto("main");
    afirmar(!/Elegí un cliente de la tabla/.test(t), "el panel del cliente no se abrió");
    const i = t.lastIndexOf("Shine Velas");
    return `panel: «${t.slice(i, i + 220)}» · ${await medir("cliente")}`;
  });
  await paso("contador · del cliente a su panel (enlace)", async () => {
    // «Abrir su panel» vive dentro del menú «Más sobre <cliente>» (src/app/contador/CarteraPanel.tsx:426, popover)
    // y sólo existe si el negocio tiene dirección propia (urlCliente, CarteraPanel.tsx:169 → APP_BASE_DOMAIN).
    const mas = p.getByRole("button", { name: /^Más sobre/ }).first();
    afirmar(await mas.count(), "no está el menú «Más» del cliente abierto");
    await mas.click();
    await p.waitForTimeout(400);
    const enl = p.getByRole("link", { name: /Abrir su panel/ }).first();
    if (await enl.count()) {
      const href = await enl.getAttribute("href");
      await p.keyboard.press("Escape");
      return `enlace al panel (menú Más): ${href}`;
    }
    await p.keyboard.press("Escape");
    const sinDireccion = /Sin dirección propia todavía/.test(await texto("main"));
    afirmar(sinDireccion, "el menú Más no ofrece «Abrir su panel» y la pantalla tampoco dice que falta la dirección propia");
    return "sin «Abrir su panel»: el laboratorio no tiene dirección propia (APP_BASE_DOMAIN) y la pantalla lo dice";
  });
  await paso("contador · recargar conserva", async () => { await p.reload({ waitUntil: "networkidle" }); return `«${(await texto("main")).slice(0, 120)}»`; });
  await paso("contador · un dueño común no entra a /contador", async () => {
    const ctx2 = await b.newContext({ viewport: vp });
    p = await ctx2.newPage(); p.setDefaultTimeout(T); escuchar(p);
    await entrarAdmin(CH, "duena@ch.lab");
    const s = await ir(`${CH}/contador`);
    const t = await texto("body");
    afirmar(!/cartera/i.test(t) || s === 404, "la dueña de CH ve la cartera");
    return `http=${s} · «${t.slice(0, 80)}»`;
  });
}

if (fase === "ch-off") {
  await paso("CH (apagado) · entrar", async () => `llegó a ${await entrarAdmin(CH, "duena@ch.lab")}`);
  const firmas = {};
  for (const ruta of ["/admin", "/admin/turnos", "/admin/turnos/lista?nuevo=1", "/admin/caja/cierre", "/admin/clientes"]) {
    await paso(`CH (apagado) · ${ruta} con la vista de siempre`, async () => {
      await ir(CH + ruta);
      const f = await firma();
      firmas[ruta] = f;
      afirmar(f.diseno !== "renglon", "tiene la piel nueva con el interruptor apagado");
      afirmar(!f.armazonNuevo, "tiene la cápsula del armazón nuevo");
      afirmar(!f.altaNueva, "monta el alta nueva");
      return `h1=${f.h1} · ${await medir(`off${ruta}`)}`;
    });
  }
  await paso("CH (apagado) · F1 no hace nada nuevo", async () => {
    await ir(`${CH}/admin/turnos`);
    const antes = p.url();
    await p.keyboard.press("F1");
    await p.waitForTimeout(1500);
    afirmar(p.url() === antes, `F1 navegó a ${p.url()}`);
    return "se queda donde está (como hoy)";
  });
  writeFileSync(`${DIR}firmas-apagado-${ancho}.json`, JSON.stringify(firmas, null, 2));
}

await b.close();
const fallas = res.filter((r) => !r.ok);
writeFileSync(`${DIR}resultado-${fase}-${ancho}.json`, JSON.stringify({ fase, ancho, pasos: res, fallas: fallas.length, errores, callejones, medidas }, null, 2));
console.log(`\n${fase} ${ancho}: ${res.length - fallas.length}/${res.length} pasos OK · errores de consola ${errores.length} · callejones ${callejones.length}`);
for (const c of callejones) console.log("CALLEJÓN", c);
for (const m of medidas) if (m.scrollX360 > 0 || m.menoresDe44.length) console.log("MEDIDA", m.pantalla, m.url, "sx360=" + m.scrollX360, "chicos:", m.menoresDe44.slice(0, 6).join(", "));
process.exit(fallas.length ? 1 : 0);
