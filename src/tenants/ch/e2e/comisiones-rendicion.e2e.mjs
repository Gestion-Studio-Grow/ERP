// QA GSG-CH-010 · «Mi liquidación» (PR #139) y la rendición de la profesional que cobra aparte (PR #144).
// Clic por clic contra la app de producción (`next start`) y Postgres LOCAL efímero (qa-ch010-entorno.mjs →
// entorno-ch.mjs; nunca Neon). Corre en cualquiera de las dos ramas o en las dos juntas: lo que la rama no
// trae (la pantalla «Mi liquidación» o la tabla de rendiciones) se saltea y queda anotado.
//   1. La profesional cobra SUS turnos (efectivo, saldo de un voucher por MP, uno con descuento por
//      transferencia) y ve sólo SU liquidación (IDOR a mano por URL); los números cierran.
//   2. La dueña ve «a rendir», paga la comisión (pregunta abierta de RENDICION.md §5), rinde con DOBLE
//      clic (una sola rendición), lo ve en el libro y anula un cobro ya rendido (egreso de hoy).
//   3. Recepción, 375 táctil, desbordes y errores de consola.
// Uso: npm run build && node --import tsx src/tenants/ch/e2e/comisiones-rendicion.e2e.mjs [carpeta]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarQA, EMAIL_LAURA, EMAIL_MARINA, CLAVE_DE_PRUEBA } from "./qa-ch010-entorno.mjs";
import { RAIZ } from "./entorno-ch.mjs";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/ch-comisiones-rendicion-e2e");
await mkdir(OUT, { recursive: true });
const filas = [];
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
const nota = (id, que) => {
  filas.push({ id, estado: "NOTA", que });
  console.log(`· ${id} ${que}`);
};
const errores = [];
let n = 0;
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const q = await levantarQA();
const { e, db, conRendicion } = q;
const { laura, marina } = e.semilla.profesionales;

async function entrar(email, ancho = 1366) {
  const movil = ancho < 800;
  const ctx = await b.newContext({ viewport: { width: ancho, height: movil ? 812 : 768 }, locale: "es-AR", hasTouch: movil, isMobile: movil });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", (err) => errores.push(`${ancho}px ${p.url()}: ${err.message}`));
  p.on("console", (m) => m.type() === "error" && !/fonts\.g/.test(m.text()) && errores.push(`${ancho}px ${p.url()}: ${m.text()}`));
  await p.goto(`${e.url}/admin/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 });
  return p;
}
const ir = async (p, ruta) => {
  const r = await p.goto(`${e.url}${ruta}`);
  await p.waitForLoadState("networkidle").catch(() => {});
  return r?.status();
};
const foto = (p, nombre) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${nombre}.png`, fullPage: true });
const texto = async (p) => {
  await p.locator("details").evaluateAll((ds) => ds.forEach((d) => (d.open = true)));
  return p.locator("main").innerText();
};
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1);
const fechaAR = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
// Las tablas de la rendición son SQL pendiente (pending-gate2): sin modelo de Prisma, se cuentan con SQL.
const contar = async (sql, ...v) => Number((await db.$queryRawUnsafe(`select count(*)::int n from ${sql}`, ...v))[0].n);
const pendientes = () => contar(`"CobroARendir" where "professionalId" = $1 and "rendicionId" is null`, laura);
const diaDe = async (id) => fechaAR((await db.appointment.findUniqueOrThrow({ where: { id } })).startsAt);

async function cobrar(p, clienta, fecha, medio) {
  await ir(p, `/admin/turnos?date=${fecha}&vista=lista`);
  await p.getByRole("button", { name: new RegExp(`^Cobrar: ${clienta}`) }).click();
  const hoja = p.locator("dialog[open]");
  const falta = (await hoja.innerText()).match(/Falta cobrar\s*\$([\d.]+)/)?.[1];
  await hoja.getByRole("button", { name: medio, exact: true }).click();
  await hoja.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  return falta;
}

try {
  const hoy = fechaAR(new Date());
  // ── 1. La profesional cobra sus turnos ──
  const l = await entrar(EMAIL_LAURA);
  ok("1.1", (await cobrar(l, "Valeria Sosa", hoy, "Efectivo")) === "15.000", "Laura cobra a Valeria: falta $15.000, efectivo");
  ok("1.2", (await cobrar(l, "Paula Voucher", await diaDe(q.ids.conVoucher), "Mercado Pago")) === "10.000", "voucher de $5.000: falta el saldo de $10.000, MP");
  ok("1.3", (await cobrar(l, "Diana Descuento", await diaDe(q.ids.conDescuento), "Transferencia")) === "12.000", "descuento: falta $12.000, transferencia");
  const aRendir = conRendicion ? await pendientes() : 0;
  const movs = await db.cashMovement.count();
  if (conRendicion) ok("1.4", aRendir === 3 && movs === 0, `cobra aparte: 3 cobros a rendir y nada en el cajón (a rendir ${aRendir}, movimientos ${movs})`);
  else ok("1.4", movs >= 3, `sin rendición en la rama: los cobros entran al cajón (${movs} movimientos)`);

  const conMiLiquidacion = (await ir(l, "/admin/mis-comisiones")) !== 404 && !l.url().includes("no-disponible");
  if (conMiLiquidacion) {
    const t = await texto(l);
    await foto(l, "laura-mi-liquidacion-1366");
    ok("1.5", t.includes("$14.800"), "Mi liquidación: $14.800 = 40% de 15.000 + 10.000 (sin el voucher) + 12.000 (con descuento)");
    ok("1.6", t.includes("40% de $10.000") && t.includes("40% de $12.000") && t.includes("40% de $15.000"), "renglón por renglón con su base");
    await ir(l, `/admin/mis-comisiones?professionalId=${marina}`);
    const idor = await texto(l);
    ok("1.7", idor.includes("Laura Gómez") && !idor.includes("Marina") && !idor.includes("Mora Marina"), "IDOR por URL (?professionalId de Marina): sigue viendo sólo lo suyo");
    await ir(l, "/admin/comisiones");
    ok("1.8", l.url().includes("no-disponible"), "la pantalla de Comisiones de la dueña no está disponible para la profesional");
    const m = await entrar(EMAIL_MARINA);
    await ir(m, "/admin/mis-comisiones");
    const tm = await texto(m);
    ok("1.9", tm.includes("$8.800") && !tm.includes("Valeria"), "Marina ve sólo lo suyo: $8.800 = 40% de 22.000");
  } else nota("1.5", "la rama no trae «Mi liquidación» (PR #139): se saltea");

  // ── 2. La dueña ──
  const d = await entrar(e.base.a.duenia.email);
  await ir(d, "/admin/comisiones");
  const tc = await texto(d);
  await foto(d, "duenia-comisiones-antes-1366");
  if (conRendicion) {
    ok("2.1", /Laura Gómez · a rendir \$37\.000,00 \(3 cobros\)/.test(tc), "a rendir: Laura $37.000 en 3 cobros");
    // Pregunta abierta (RENDICION.md §5): ¿se paga la comisión de cobros no rendidos?
    const pagar = d.locator(`a[href$="pagar=${laura}"]`);
    if (await pagar.count()) {
      await pagar.first().click();
      const hoja = d.locator("dialog[open]");
      await hoja.getByRole("button", { name: /Marcar pagada/ }).click();
      await d.waitForURL(/status=ok_settled/, { timeout: 15000 }).catch(() => {});
      const egreso = await db.cashMovement.findFirst({ where: { type: "EGRESO", reason: { startsWith: "Comisión Laura" } } });
      const pend = await pendientes();
      nota("2.2", `PREGUNTA §5: se pagó la comisión ($${egreso?.amount ?? "?"}, egreso del cajón) con ${pend} cobros todavía a rendir; ningún aviso`);
    }
    await ir(d, "/admin/comisiones");
    const form = d.locator("form", { has: d.getByRole("button", { name: "Registrar rendición" }) }).first();
    await form.getByRole("button", { name: "Registrar rendición" }).dblclick();
    await d.waitForURL(/status=rendicion_/, { timeout: 15000 }).catch(() => {});
    await d.waitForTimeout(1500);
    const rends = await contar(`"RendicionProfesional"`);
    const ingreso = await db.cashMovement.findMany({ where: { type: "INGRESO", reason: { startsWith: "Rendición" } } });
    ok("2.3", d.url().includes("rendicion_ok") && rends === 1 && ingreso.length === 1 && Number(ingreso[0].amount) === 37000, `doble clic en «Registrar rendición»: 1 rendición, 1 ingreso de $37.000 (rendiciones ${rends})`);
    await foto(d, "duenia-tras-rendir-1366");
    await ir(d, "/admin/caja/libro");
    const tl = await texto(d);
    ok("2.4", tl.includes("Rendición · Laura Gómez"), "la rendición está en el libro de caja");
    if (/Rendición · Laura Gómez · 3 cobros\s*\n\s*Efectivo · cargado a mano/.test(tl)) nota("2.4b", "el libro rotula la rendición «cargado a mano» (libro-caja.ts:491)");
    await foto(d, "libro-1366");
    // Anular un cobro ya rendido: egreso con fecha de hoy.
    await ir(d, "/admin/turnos?vista=lista");
    await d.getByRole("button", { name: /Valeria Sosa, .*abrir el turno/ }).click();
    const cajon = d.locator("dialog[open]");
    await cajon.getByRole("button", { name: /^Anular/ }).first().click();
    await cajon.locator("input:not([type=hidden])").first().fill("QA: anulación de un cobro ya rendido");
    await cajon.getByRole("button", { name: "Sí, anular" }).click();
    await d.waitForTimeout(2500);
    const eg = await db.cashMovement.findFirst({ where: { type: "EGRESO", reason: { startsWith: "Anulación" } } });
    ok("2.5", Number(eg?.amount) === 15000 && fechaAR(eg.occurredAt) === hoy, "anular un cobro rendido asienta un egreso de $15.000 con fecha de hoy");
  } else nota("2.1", "la rama no trae la rendición (PR #144): se saltea");

  // ── 3. Recepción, 375 y desbordes ──
  const r = await entrar(e.base.a.recepcion.email);
  await ir(r, "/admin/comisiones");
  if (conRendicion) {
    const llega = !r.url().includes("no-disponible");
    if (!llega) nota("3.1", "recepción tiene cash:manage pero no llega al formulario de rendición (comisiones/page.tsx:60 requireApp)");
    else ok("3.1", true, "recepción llega al formulario de rendición");
  }
  const rutas375 = conMiLiquidacion ? [[EMAIL_LAURA, "/admin/mis-comisiones"]] : [];
  for (const [email, ruta] of [...rutas375, [e.base.a.duenia.email, "/admin/comisiones"], [e.base.a.duenia.email, "/admin/caja/libro"]]) {
    const p = await entrar(email, 375);
    await ir(p, ruta);
    ok(`3.${ruta}`, await sinDesborde(p), `375 táctil sin desborde horizontal: ${ruta}`);
    await foto(p, `${ruta.split("/").pop()}-375`);
  }
  // El 404 de sondear «Mi liquidación» en una rama que no la trae no es un error de la pantalla.
  const reales = errores.filter((x) => conMiLiquidacion || !x.includes("/admin/mis-comisiones"));
  ok("3.9", reales.length === 0, `sin errores de consola (${reales.length})`);
} catch (err) {
  ok("X", false, `se cortó: ${err.message.split("\n")[0]}`);
} finally {
  await writeFile(`${OUT}/resultado.json`, JSON.stringify({ conRendicion, filas, errores }, null, 2));
  await b.close();
  await db.$disconnect();
  await e.cerrar();
}
const fallas = filas.filter((f) => f.estado === "FALLA").length;
console.log(`${filas.filter((f) => f.estado === "OK").length}/${filas.filter((f) => f.estado !== "NOTA").length} OK · capturas en ${OUT}`);
process.exit(fallas ? 1 : 0);
