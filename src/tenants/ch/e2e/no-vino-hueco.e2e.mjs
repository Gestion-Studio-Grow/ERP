// QA clic por clic de GSG-CH-008: «No vino» libera el hueco en la agenda por profesional.
// Contra la app de producción (`next start`) y Postgres LOCAL efímero (entorno-ch.mjs → crearBaseEfimera;
// nunca Neon). A 1366×768 (mouse) y a 375×812 (táctil):
//   N1 · antes: la media hora siguiente dentro del turno empezado está OCUPADA (no hay «+ hora»).
//   N2 · «No vino» desde la barra → la base queda NO_SHOW.
//   N3 · la grilla ofrece «Dar un turno a las HH:MM con Marina» en ese horario y el punto tocable
//        (mitad derecha de la celda) es el link, no el bloque del turno.
//   N4 · tocar «+ hora» → «Dar turno» → «Listo ✓ Turno dado»: el servidor deja dar el turno encima del
//        «No vino» (en la base: un turno vivo nuevo a esa hora).
//   C1 · un cancelado sigue igual que en main: su horario es hueco tocable y no se dibuja (getAgendaDay lo excluye).
//   L1 · carriles (celular tope 2 / PC tope 3): «No vino» + 2 vivos a la misma hora → los 2 vivos se ven.
//   Chequeos: sin scroll horizontal, consola limpia.
// Los «No vino» se marcan sólo con el turno ya empezado: para que el hueco liberado sea futuro a
// cualquier hora del día, la base efímera abre el horario de Marina de 00:00 a 23:30.
// Uso: node --import tsx src/tenants/ch/e2e/no-vino-hueco.e2e.mjs <carpeta de capturas (fuera del repo)>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarEntornoCH, RAIZ, CLAVE_DE_PRUEBA } from "./entorno-ch.mjs";
import { prismaComoDuenio } from "../../../test/base-efimera.ts";
import { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, PREFIJO_ACTOR_OPERADOR } from "../../../cambios/interruptores.ts";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/ch-no-vino-hueco-e2e");
await mkdir(OUT, { recursive: true });
const filas = [];
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
const errores = [];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const TZ = "America/Argentina/Buenos_Aires";
const hoyBA = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const medianoche = new Date(`${hoyBA}T00:00:00-03:00`).getTime();
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const enHoy = (min) => new Date(medianoche + min * 60_000);
const espera = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);

async function pagina(e, [w, h], etiqueta) {
  const tactil = w < 800;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "es-AR", hasTouch: tactil, isMobile: tactil });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", (err) => errores.push(`${etiqueta} ${p.url()}: ${err.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.g/.test(m.text())) errores.push(`${etiqueta} ${p.url()}: ${m.text()}`);
  });
  await p.goto(`${e.url}/admin/login`);
  await p.fill('input[name="email"]', e.base.a.duenia.email);
  await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30000 });
  return { ctx, p, tactil };
}
const toque = async (s, loc) => {
  await loc.first().waitFor({ timeout: 15000 });
  if (s.tactil) await loc.first().tap();
  else await loc.first().click();
};
const foto = (s, nombre) => s.p.screenshot({ path: path.join(OUT, `${nombre}.png`), fullPage: false });
const hueco = (p, min) => p.getByRole("link", { name: new RegExp(`^Dar un turno a las ${hhmm(min)} con Marina`) });
const bloqueDe = (p, nombre) => p.getByRole("button", { name: new RegExp(`${nombre}.*abrir el turno`) });

/** ¿El punto de la mitad derecha del link es el link (no lo tapa el bloque del turno)? Devuelve el punto. */
async function puntoTocable(loc) {
  // Al centro: en el celular la barra de abajo (fija) tapa la última fila visible.
  await loc.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  return loc.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.right - Math.min(12, r.width / 4);
    const y = r.top + r.height / 2;
    const arriba = document.elementFromPoint(x, y);
    return { x, y, tocable: !!arriba && (arriba === el || el.contains(arriba)), tapa: arriba?.getAttribute("aria-label") ?? arriba?.tagName ?? null };
  });
}

async function turno(db, e, { nombre, k, desde, min, estado = "CONFIRMED" }) {
  const tenantId = e.base.a.id;
  const client = await db.client.create({ data: { tenantId, name: nombre, phone: `11 4200 ${String(4000 + k)}` } });
  const profId = e.semilla.profesionales.marina;
  const prof = await db.professional.findUniqueOrThrow({ where: { id: profId } });
  const a = await db.appointment.create({
    data: {
      tenantId, clientId: client.id, professionalId: profId, serviceId: e.semilla.servicios.peeling, boxId: prof.boxId,
      startsAt: desde, endsAt: new Date(desde.getTime() + min * 60_000), status: estado, priceAtBooking: 22000,
    },
  });
  return { id: a.id, nombre, clientId: client.id };
}

for (const [w, h] of [[1366, 768], [375, 812]]) {
  const V = String(w);
  const e = await levantarEntornoCH({ log: () => {} });
  try {
    const db = await prismaComoDuenio(e.base);
    for (const id of ["agenda-practica", "agenda-interaccion"]) {
      await db.auditLog.create({ data: { tenantId: e.base.a.id, entity: ENTIDAD_INTERRUPTOR, entityId: id, action: ACCION_ENCENDER, channel: CANAL_INTERRUPTOR, actor: PREFIJO_ACTOR_OPERADOR + "e2e" } });
    }
    await db.workingHours.updateMany({ where: { professionalId: e.semilla.profesionales.marina }, data: { startTime: "00:00", endTime: "23:30" } });

    const ahoraMin = Math.floor((Date.now() - medianoche) / 60_000);
    const slot = Math.ceil((ahoraMin + 1) / 30) * 30; // la próxima media hora que todavía no empezó
    if (slot + 30 > 23 * 60) throw new Error("Corré el recorrido antes de las 22:30 (hora de Buenos Aires).");
    // Empezó hace 5' y dura hasta pasada la próxima media hora (90').
    const tNS = await turno(db, e, { nombre: `Nora Novino ${V}`, k: 1, desde: new Date(Date.now() - 5 * 60_000), min: 90 });
    // Un cancelado más tarde (2 h después del slot, 60').
    const canMin = Math.min(slot + 120, 22 * 60);
    const tCan = await turno(db, e, { nombre: `Celia Cancelada ${V}`, k: 2, desde: enHoy(canMin), min: 60, estado: "CANCELLED" });
    // Carriles: un «No vino» y dos vivos a la misma hora (sembrado: en el futuro no se marca desde la UI).
    const carMin = Math.min(slot + 210, 22 * 60 + 30);
    await turno(db, e, { nombre: `Nadia Novino ${V}`, k: 3, desde: enHoy(carMin), min: 60, estado: "NO_SHOW" });
    await turno(db, e, { nombre: `Vera Viva ${V}`, k: 4, desde: enHoy(carMin), min: 45 });
    await turno(db, e, { nombre: `Vilma Viva ${V}`, k: 5, desde: enHoy(carMin), min: 60, estado: "PENDING" });

    const s = await pagina(e, [w, h], `N-${V}`);
    const agenda = `${e.url}/admin/turnos?pro=${e.semilla.profesionales.marina}`;
    await s.p.goto(agenda);
    await s.p.waitForLoadState("networkidle").catch(() => {});

    // N1 · antes
    await bloqueDe(s.p, tNS.nombre).first().scrollIntoViewIfNeeded().catch(() => {});
    ok(`N1.${V}`, (await hueco(s.p, slot).count()) === 0, `antes: ${hhmm(slot)} ocupada por el turno de ${tNS.nombre}`);
    await foto(s, `${V}-1-antes`);

    // N2 · No vino desde la barra
    const bloque = bloqueDe(s.p, tNS.nombre);
    if (s.tactil) await toque(s, bloque);
    else await bloque.first().hover();
    const barra = s.p.getByRole("group", { name: new RegExp(`Acciones rápidas: ${tNS.nombre}`) });
    await toque(s, barra.getByRole("button", { name: /^No vino/ }));
    await espera(s.p.getByRole("button", { name: "Deshacer" }), 15000);
    let est = "";
    for (let i = 0; i < 20 && est !== "NO_SHOW"; i++) {
      est = (await db.appointment.findUniqueOrThrow({ where: { id: tNS.id } })).status;
      if (est !== "NO_SHOW") await s.p.waitForTimeout(500);
    }
    ok(`N2.${V}`, est === "NO_SHOW", `«No vino» desde la barra (base: ${est})`);

    // N3 · el hueco aparece y se puede tocar (sin recargar: la agenda se refresca sola)
    const h1 = hueco(s.p, slot);
    let aparece = await espera(h1, 8000);
    let recargo = false;
    if (!aparece) {
      recargo = true;
      await s.p.goto(agenda);
      aparece = await espera(h1, 10000);
    }
    const pt = aparece ? await puntoTocable(h1) : { tocable: false, tapa: "sin link" };
    ok(`N3.${V}`, aparece && pt.tocable, `después: «+ ${hhmm(slot)}» ofrecido${recargo ? " (RECIÉN AL RECARGAR)" : " sin recargar"} y tocable (arriba: ${pt.tapa})`);
    if (!s.tactil && aparece) await s.p.mouse.move(pt.x, pt.y);
    await foto(s, `${V}-2-no-vino-hueco-libre`);

    // N4 · dar el turno en ese hueco
    if (aparece && pt.tocable) {
      if (s.tactil) await s.p.touchscreen.tap(pt.x, pt.y);
      else await s.p.mouse.click(pt.x, pt.y);
      const cajon = s.p.getByRole("dialog").first();
      await cajon.waitFor({ timeout: 20000 });
      await toque(s, cajon.getByRole("group", { name: "Servicio" }).getByRole("button", { name: /Peeling/ }));
      const buscar = cajon.getByPlaceholder("Nombre o teléfono…");
      await toque(s, buscar);
      await buscar.fill("Vera");
      await toque(s, cajon.getByRole("list", { name: "Fichas que coinciden" }).getByRole("button", { name: /Vera Viva/ }));
      await foto(s, `${V}-3-dar-turno`);
      await toque(s, cajon.getByRole("button", { name: /^Dar turno · / }));
      const listo = await espera(s.p.getByText("Listo ✓ Turno dado"), 20000);
      const nuevo = await db.appointment.findFirst({ where: { tenantId: e.base.a.id, startsAt: enHoy(slot), status: { in: ["PENDING", "CONFIRMED"] } } });
      ok(`N4.${V}`, listo && !!nuevo, `turno dado a las ${hhmm(slot)} encima del «No vino» (base: ${nuevo ? nuevo.status : "no está"})`);
      await foto(s, `${V}-4-turno-dado`);
    } else ok(`N4.${V}`, false, "no se pudo tocar el hueco");

    // C1 · el cancelado sigue igual
    await s.p.goto(agenda);
    await s.p.waitForLoadState("networkidle").catch(() => {});
    const hc = hueco(s.p, canMin);
    const hayC = await espera(hc, 10000);
    const ptC = hayC ? await puntoTocable(hc) : { tocable: false, tapa: "sin link" };
    const bloqueC = (await bloqueDe(s.p, tCan.nombre).count()) > 0;
    ok(`C1.${V}`, hayC && ptC.tocable && !bloqueC, `cancelado igual que en main: «+ ${hhmm(canMin)}» tocable (arriba: ${ptC.tapa}) y sin bloque (${bloqueC ? "SE DIBUJA" : "no se dibuja"})`);
    if (!s.tactil && hayC) await s.p.mouse.move(ptC.x, ptC.y);
    await foto(s, `${V}-5-cancelado`);

    // L1 · carriles
    const vera = bloqueDe(s.p, `Vera Viva ${V}`);
    await vera.first().scrollIntoViewIfNeeded().catch(() => {});
    const veVera = await vera.first().isVisible().catch(() => false);
    const veVilma = await bloqueDe(s.p, `Vilma Viva ${V}`).first().isVisible().catch(() => false);
    const veNadia = await bloqueDe(s.p, `Nadia Novino ${V}`).first().isVisible().catch(() => false);
    ok(`L1.${V}`, veVera && veVilma, `«No vino» + 2 vivos a las ${hhmm(carMin)}: se ven los vivos (Vera ${veVera}, Vilma ${veVilma}; el «No vino» ${veNadia ? "también, en un carril libre" : "va al «+N»"})`);
    await foto(s, `${V}-6-carriles`);

    const d = await s.p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    ok(`X1.${V}`, d.sw <= d.iw, `sin scroll horizontal (${d.sw} ≤ ${d.iw})`);
    await s.ctx.close();
    await db.$disconnect?.();
  } finally {
    await e.cerrar?.();
  }
}
ok("X2", errores.length === 0, `consola limpia${errores.length ? `: ${errores.slice(0, 5).join(" | ")}` : ""}`);
await b.close();
const md = ["# CH-008 · QA «No vino» libera el hueco", "", "| id | estado | qué |", "|---|---|---|", ...filas.map((f) => `| ${f.id} | ${f.estado} | ${f.que} |`)].join("\n");
await writeFile(path.join(OUT, "resumen.md"), md + "\n");
console.log(`\n${filas.filter((f) => f.estado === "OK").length}/${filas.length} OK · capturas en ${OUT}`);
process.exit(filas.every((f) => f.estado === "OK") ? 0 : 1);
