// QA clic por clic de «Venta y agenda simples» (Tanda 1; interruptor `venta-agenda-simple`).
// Contra la app de producción (`next start`) y Postgres LOCAL (entorno-ch.mjs; nunca Neon):
//   A · interruptor APAGADO: turno de hoy → cajón → «Sumar un producto» (sale a Pedidos) → producto → cobrar.
//   B · interruptor PRENDIDO: turno nuevo → cajón → Terminar → «+ Producto» → buscar → elegir → medio → aviso.
//       En la base: 1 cobro del turno, 1 orden, stock −1.
//   C · doble toque en el medio → sigue habiendo un solo cobro.
//   D · Inicio de la dueña: tarjeta «Hoy» con el cobro (apagado, no aparece).
//   E · a 1366×768 y a 375×812 (táctil): sin scroll horizontal, teclas ≥ 44 px, consola limpia,
//       prefers-reduced-motion sin roto.
// Uso: node --import tsx src/tenants/ch/e2e/venta-agenda.e2e.mjs <carpeta de capturas (fuera del repo)>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarEntornoCH, RAIZ, CLAVE_DE_PRUEBA } from "./entorno-ch.mjs";
import { prismaComoDuenio } from "../../../test/base-efimera.ts";
import { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, PREFIJO_ACTOR_OPERADOR } from "../../../cambios/interruptores.ts";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/ch-venta-agenda-e2e");
await mkdir(OUT, { recursive: true });
const filas = [];
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
const errores = [];
const toques = [];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const HORA = 3_600_000;
const hoyBA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const medianoche = new Date(`${hoyBA}T00:00:00-03:00`).getTime();

async function pagina(e, [w, h], { reducido = false, etiqueta } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "es-AR", hasTouch: w < 800, reducedMotion: reducido ? "reduce" : "no-preference" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", (err) => errores.push(`${etiqueta ?? w} ${p.url()}: ${err.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.g/.test(m.text())) errores.push(`${etiqueta ?? w} ${p.url()}: ${m.text()}`);
  });
  await p.goto(`${e.url}/admin/login`);
  await p.fill('input[name="email"]', e.base.a.duenia.email);
  await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 });
  return { ctx, p, tactil: w < 800, w, h };
}
const espera = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);

/** Cuenta cada toque (clic en escritorio, tap en el celular). */
async function toque(s, loc, que) {
  s.n.push(que);
  await loc.first().waitFor({ timeout: 15000 });
  if (s.tactil) await loc.first().tap();
  else await loc.first().click();
}
const nuevoRecorrido = () => ({ n: [], pantallas: [] });

async function sinDesborde(p) {
  return p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
}
async function chequeoDeTeclas(p, ambito, nombres) {
  // Las teclas que se tocan para cobrar: ≥ 44 px de alto.
  return ambito.evaluate(
    (raiz, rx) => {
      const re = new RegExp(rx, "i");
      return [...raiz.querySelectorAll("button, a, [role=button], [role=radio]")]
        .filter((el) => el.offsetParent !== null && (re.test((el.getAttribute("aria-label") ?? "").trim()) || re.test((el.textContent ?? "").trim())))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { t: ((el.getAttribute("aria-label") || el.textContent) ?? "").trim().slice(0, 40), h: Math.round(r.height), w: Math.round(r.width) };
        });
    },
    nombres.source,
  );
}
const MEDIOS = /^(Efectivo|Transferencia|Mercado Pago|Débito|Crédito|\+ Producto|Terminar|Cobrar)|Cobrar \$|cobra|Sumar un producto/;

async function crearTurno(db, e, { nombre, k }) {
  const tenantId = e.base.a.id;
  const client = await db.client.create({ data: { tenantId, name: nombre, phone: `11 4000 ${String(1000 + k)}` } });
  const serv = e.semilla.servicios.limpieza;
  const prof = e.semilla.profesionales.marina;
  const profFila = await db.professional.findUniqueOrThrow({ where: { id: prof } });
  // Hoy (hora de Buenos Aires), ya empezado, cada uno en su hora para no pisarse.
  const startsAt = new Date(medianoche + (10 + k * 55) * 60_000);
  const a = await db.appointment.create({
    data: {
      tenantId,
      clientId: client.id,
      professionalId: prof,
      serviceId: serv,
      boxId: profFila.boxId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 50 * 60_000),
      status: "CONFIRMED",
      priceAtBooking: 20000,
    },
  });
  return { id: a.id, nombre, clientId: client.id };
}
async function prender(db, e) {
  await db.auditLog.create({
    data: { tenantId: e.base.a.id, entity: ENTIDAD_INTERRUPTOR, entityId: "venta-agenda-simple", action: ACCION_ENCENDER, channel: CANAL_INTERRUPTOR, actor: PREFIJO_ACTOR_OPERADOR + "e2e" },
  });
}
const cobrosDe = (db, turno) => db.collection.findMany({ where: { appointmentId: turno.id }, select: { amount: true, method: true, orderId: true } });
const ordenesDe = (db, turno) => db.order.findMany({ where: { clientId: turno.clientId }, include: { items: true } });

/** Abre la agenda de hoy y el cajón del turno. */
async function abrirCajon(s, e, turno, foto) {
  const { p } = s;
  await p.goto(`${e.url}/admin/turnos`);
  await p.waitForLoadState("networkidle").catch(() => {});
  s.pantallas.push("Agenda");
  await toque(s, p.getByRole("button", { name: new RegExp(`${turno.nombre}.*abrir el turno`) }), "turno");
  await p.getByRole("dialog").first().waitFor({ timeout: 15000 });
  s.pantallas.push("Cajón del turno");
  await p.waitForTimeout(400);
  if (foto) await foto("cajon");
}

for (const [w, h] of [[1366, 768], [375, 812]]) {
  const V = `${w}`;
  const dirV = `${OUT}/${V}`;
  await mkdir(dirV, { recursive: true });
  let nf = 0;
  const e = await levantarEntornoCH({ log: () => {} });
  const foto = (p) => async (nombre) => p.screenshot({ path: `${dirV}/${String(++nf).padStart(2, "0")}-${nombre}.png` });
  try {
    const db = await prismaComoDuenio(e.base);
    const tenantId = e.base.a.id;
    const prod = await db.product.create({ data: { tenantId, name: "Sérum vitamina C", price: 18000, stock: 20, trackStock: true } });
    await db.product.create({ data: { tenantId, name: "Crema hidratante facial", price: 12500, stock: 20, trackStock: false } });
    let k = 0;

    // ───────── A · APAGADO ─────────
    {
      const t = await crearTurno(db, e, { nombre: `Ana Antes ${V}`, k: k++ });
      const s = { ...(await pagina(e, [w, h], { etiqueta: `A-${V}` })), ...nuevoRecorrido() };
      const f = foto(s.p);
      const { p } = s;
      await abrirCajon(s, e, t, f);
      ok(`A1.${V}`, (await p.getByRole("button", { name: "+ Producto" }).count()) === 0, "apagado: el cajón NO trae «+ Producto»");
      await toque(s, p.getByRole("dialog").getByRole("link", { name: "Sumar un producto" }), "Sumar un producto");
      await p.waitForURL(/\/admin\/pedidos/, { timeout: 20000 });
      await p.waitForLoadState("networkidle").catch(() => {});
      s.pantallas.push("Pedidos (venta)");
      await f("antes-pedidos");
      const form = p.locator('form:is([data-vender="mostrador"], [data-vender="formulario"])');
      const buscar = form.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').last();
      await toque(s, buscar, "buscar");
      await buscar.fill("sérum");
      const lista = p.locator(`#${await buscar.getAttribute("aria-controls")}`);
      await lista.getByRole("option", { name: /sérum/i }).first().waitFor();
      await toque(s, lista.getByRole("option", { name: /sérum/i }), "elegir producto");
      // En la venta de siempre la cantidad viene vacía: hay que escribirla (un paso más).
      await toque(s, form.locator('input[id^="qty-"]:not([disabled])'), "cantidad");
      await form.locator('input[id^="qty-"]:not([disabled])').last().fill("1");
      await toque(s, form.getByRole("radio", { name: "Efectivo" }), "medio Efectivo");
      await f("antes-cobro");
      await toque(s, form.getByRole("button", { name: /^Cobrar/ }), "Cobrar");
      const hecho = await espera(p.getByText(/Venta #\d+ cobrada/), 20000);
      ok(`A2.${V}`, hecho, `apagado: producto cobrado en Pedidos (${s.n.length} toques, ${s.pantallas.length} pantallas: ${s.pantallas.join(" → ")})`);
      await f("antes-confirmacion");
      toques.push({ v: V, rec: "ANTES (apagado)", toques: s.n.length, pantallas: s.pantallas.length, det: s.n.join(" › ") });
      ok(`A3.${V}`, (await cobrosDe(db, t)).length === 0, "apagado: el turno sigue sin cobrar (el producto fue otro cobro, aparte)");
      // Inicio apagado: sin tarjeta «Hoy»
      await p.goto(`${e.url}/admin`);
      await p.waitForLoadState("networkidle").catch(() => {});
      ok(`D0.${V}`, (await p.getByRole("heading", { name: "Hoy", exact: true }).count()) === 0, "apagado: el Inicio NO muestra la tarjeta «Hoy»");
      const d = await sinDesborde(p);
      ok(`E0.${V}`, d.sw <= d.iw, `apagado: Inicio sin scroll horizontal (${d.sw} ≤ ${d.iw})`);
      await f("inicio-apagado");
      await s.ctx.close();
    }

    // ───────── B · PRENDIDO ─────────
    await prender(db, e);
    {
      const t = await crearTurno(db, e, { nombre: `Beatriz Después ${V}`, k: k++ });
      const stock0 = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock);
      const s = { ...(await pagina(e, [w, h], { etiqueta: `B-${V}` })), ...nuevoRecorrido() };
      const f = foto(s.p);
      const { p } = s;
      await abrirCajon(s, e, t, f);
      const cajon = p.getByRole("dialog").first();
      const mas = cajon.getByRole("button", { name: "+ Producto" });
      ok(`B1.${V}`, await espera(mas), "prendido: el cajón trae «+ Producto» sin salir de la pantalla");
      ok(`B1b.${V}`, (await cajon.getByRole("link", { name: "Sumar un producto" }).count()) === 0, "prendido: sobra el enlace «Sumar un producto» (no hay salida a Pedidos)");
      // "Terminar": la sección del cajón (ya abierta) con las teclas de medio
      await toque(s, mas, "+ Producto");
      const buscar = cajon.getByRole("textbox", { name: "Buscar un producto" });
      await buscar.waitFor();
      await buscar.fill("sérum");
      const op = cajon.getByRole("list", { name: "Productos del negocio" }).getByRole("button", { name: /Sérum/ });
      await op.first().waitFor({ timeout: 15000 });
      await f("buscar-producto");
      const teclasOpc = await chequeoDeTeclas(p, cajon.first(), /Sérum/);
      await toque(s, op, "elegir producto");
      await cajon.getByText("Total a cobrar").waitFor();
      await f("cobro-con-producto");
      const totalTxt = (await cajon.locator('[data-ui="cobro-con-productos"]').innerText()).replace(/\s+/g, " ");
      ok(`B2.${V}`, /38\.000/.test(totalTxt), `prendido: total a cobrar = turno $20.000 + producto $18.000 (${totalTxt.match(/Total a cobrar[^A-Z]*/)?.[0]?.trim()})`);
      // Teclas ≥ 44 px
      const teclas = await chequeoDeTeclas(p, cajon.first(), /^(Efectivo|Transferencia|Mercado Pago|Débito|Crédito|\+ Producto|Terminar|Cobrar)/);
      const chicas = [...teclas, ...teclasOpc].filter((x) => x.h < 44);
      ok(`E1.${V}`, teclas.length >= 3 && chicas.length === 0, `teclas de cobro ≥ 44 px (${teclas.map((x) => `${x.t}:${x.h}`).join(", ")}${chicas.length ? ` · CHICAS: ${chicas.map((x) => `${x.t}:${x.h}`).join(", ")}` : ""})`);
      const pasos = await chequeoDeTeclas(p, cajon.first(), /Uno (más|menos) de/);
      toques.push({ v: V, nota: `botones −/+ de cantidad: ${pasos.map((x) => `${x.h}x${x.w}`).join(", ") || "n/a"}` });
      s.pantallas.push("(mismo cajón: total + medios)");
      const ef = cajon.getByRole("button", { name: /^Efectivo/ });
      await toque(s, ef, "medio Efectivo (cobra y termina)");
      const aviso = p.getByText(/Terminado y cobrado: /);
      const visto = await espera(aviso, 20000);
      const avisoTxt = visto ? (await aviso.first().innerText()).replace(/\s+/g, " ") : "";
      ok(`B3.${V}`, visto && /38\.000/.test(avisoTxt), `prendido: aviso «${avisoTxt}»`);
      await f("aviso-terminado");
      toques.push({ v: V, rec: "DESPUÉS (prendido)", toques: s.n.length, pantallas: s.pantallas.length, det: s.n.join(" › ") });
      const cobros = await cobrosDe(db, t);
      const ords = await ordenesDe(db, t);
      const stock1 = Number((await db.product.findUniqueOrThrow({ where: { id: prod.id } })).stock);
      const cobroTurno = cobros.filter((c) => !c.orderId);
      ok(`B4.${V}`, cobroTurno.length === 1 && Number(cobroTurno[0].amount) === 20000, `base: cobros del turno = ${cobros.length} (${cobros.map((c) => `${c.amount} ${c.method}${c.orderId ? " [orden]" : ""}`).join("; ")})`);
      ok(`B5.${V}`, ords.length === 1, `base: ${ords.length} orden(es) del turno (esperado 1)`);
      ok(`B6.${V}`, stock1 === stock0 - 1, `base: stock ${stock0} → ${stock1} (esperado −1)`);
      const est = (await db.appointment.findUniqueOrThrow({ where: { id: t.id } })).status;
      ok(`B7.${V}`, est === "COMPLETED", `base: el turno queda ${est}`);
      const d = await sinDesborde(p);
      ok(`E2.${V}`, d.sw <= d.iw, `cajón/agenda sin scroll horizontal (${d.sw} ≤ ${d.iw})`);

      // ───────── C · doble toque ─────────
      const t2 = await crearTurno(db, e, { nombre: `Carla Doble ${V}`, k: k++ });
      await abrirCajon(s, e, t2, null);
      const cj = p.getByRole("dialog").first();
      await cj.getByRole("button", { name: "+ Producto" }).click();
      await cj.getByRole("textbox", { name: "Buscar un producto" }).fill("sérum");
      await cj.getByRole("list", { name: "Productos del negocio" }).getByRole("button", { name: /Sérum/ }).first().click();
      await cj.getByText("Total a cobrar").waitFor();
      const efe = cj.getByRole("button", { name: /^Efectivo/ });
      // Dos toques seguidos, sin esperar el uno al otro.
      if (s.tactil) {
        await Promise.all([efe.tap({ timeout: 5000 }).catch(() => {}), efe.tap({ timeout: 5000 }).catch(() => {})]);
      } else {
        await Promise.all([efe.dblclick({ timeout: 5000 }).catch(() => {})]);
      }
      await espera(p.getByText(/Terminado y cobrado: Carla/), 20000);
      await p.waitForTimeout(1500);
      const c2 = await cobrosDe(db, t2);
      const o2 = await ordenesDe(db, t2);
      ok(`C1.${V}`, c2.filter((c) => !c.orderId).length === 1 && o2.length === 1, `doble toque en el medio: ${c2.filter((c) => !c.orderId).length} cobro(s) del turno y ${o2.length} orden(es) (esperado 1 y 1)`);
      await foto(p)("doble-toque");
      // tercer envío tardío (con el cajón ya cerrado no hay botón): el estado no cambia
      await s.ctx.close();

      // ───────── D · Inicio prendido ─────────
      const s2 = await pagina(e, [w, h], { etiqueta: `D-${V}` });
      const f2 = foto(s2.p);
      await s2.p.goto(`${e.url}/admin`);
      await s2.p.waitForLoadState("networkidle").catch(() => {});
      const hoy = s2.p.getByRole("heading", { name: "Hoy", exact: true });
      ok(`D1.${V}`, await espera(hoy), "prendido: el Inicio de la dueña muestra la tarjeta «Hoy»");
      const sec = s2.p.locator("section", { has: hoy });
      const txt = (await sec.innerText().catch(() => "")).replace(/\s+/g, " ");
      const nOrd = await db.order.count({ where: { tenantId, status: { not: "CANCELLED" } } });
      const nVentas = Number(txt.match(/(\d+) ventas?/)?.[1] ?? 0);
      const totCobrado = Number((txt.match(/Total cobrado \$\s?([\d.]+)/)?.[1] ?? "0").replace(/\./g, ""));
      ok(`D2.${V}`, /Efectivo/i.test(txt) && totCobrado >= 38000, `«Hoy» refleja el cobro hecho (cobrado $${totCobrado}): «${txt.slice(0, 200)}»`);
      ok(`D3.${V}`, nVentas === nOrd, `«Hoy» cuenta ${nVentas} ventas de productos y la base tiene ${nOrd} órdenes`);
      await sec.scrollIntoViewIfNeeded().catch(() => {});
      await f2("inicio-hoy");
      const d2 = await sinDesborde(s2.p);
      ok(`E3.${V}`, d2.sw <= d2.iw, `Inicio con «Hoy» sin scroll horizontal (${d2.sw} ≤ ${d2.iw})`);
      const enlaces = await chequeoDeTeclas(s2.p, sec.first(), /Ir a/);
      ok(`E4.${V}`, enlaces.length >= 1 && enlaces.every((x) => x.h >= 44), `enlaces de «Hoy» ≥ 44 px (${enlaces.map((x) => `${x.t}:${x.h}`).join(", ")})`);
      await s2.ctx.close();

      // ───────── E · prefers-reduced-motion ─────────
      const t3 = await crearTurno(db, e, { nombre: `Dora Quieta ${V}`, k: k++ });
      const s3 = { ...(await pagina(e, [w, h], { reducido: true, etiqueta: `RM-${V}` })), ...nuevoRecorrido() };
      await abrirCajon(s3, e, t3, null);
      const c3 = s3.p.getByRole("dialog").first();
      await c3.getByRole("button", { name: "+ Producto" }).click();
      await c3.getByRole("textbox", { name: "Buscar un producto" }).fill("crema");
      await c3.getByRole("list", { name: "Productos del negocio" }).getByRole("button", { name: /Crema/ }).first().click();
      await c3.getByText("Total a cobrar").waitFor();
      const mm = await s3.p.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
      const enCaja = await c3.getByRole("button", { name: /^Efectivo/ }).isVisible();
      const recorte = await c3.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, scrolla: el.scrollHeight > el.clientHeight };
      });
      ok(`E5.${V}`, mm && enCaja && recorte.bottom <= recorte.vh + 1, `reduced-motion: cajón completo y usable (media=${mm}, teclas visibles=${enCaja}, cajón ${recorte.top}–${recorte.bottom} de ${recorte.vh})`);
      await foto(s3.p)("reduced-motion");
      await s3.ctx.close();
    }
  } catch (err) {
    console.log(String(err?.stack ?? err).split("\n").slice(0, 6).join("\n"));
    ok(`recorrido.${V}`, false, `se cortó: ${String(err?.message ?? err).split("\n")[0]}`);
  }
  await e.cerrar();
}

ok("consola", errores.length === 0, `cero errores de consola${errores.length ? `: ${errores.slice(0, 4).join(" | ")}` : ""}`);
await b.close();
console.log("\nTOQUES:\n" + toques.map((t) => JSON.stringify(t)).join("\n"));
const fallas = filas.filter((f) => f.estado !== "OK");
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK · capturas en ${OUT}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify({ filas, toques }, null, 1));
process.exit(fallas.length ? 1 : 0);
