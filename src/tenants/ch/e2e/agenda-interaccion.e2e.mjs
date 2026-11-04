// QA clic por clic de la «Agenda interactiva» (AGENDA-INTERACCION.md §2.4 y §5 T1; interruptor
// `agenda-interaccion`, sobre `agenda-practica`). Contra la app de producción (`next start`) y
// Postgres LOCAL (entorno-ch.mjs → crearBaseEfimera; nunca Neon). A 1366×768 y a 375×812 (táctil),
// contando cada toque con `toque()`:
//   F · APAGADO: la agenda no muestra la barra ni los chips de profesional.
//   A · tocar un hueco → «Dar turno» → hasta «Listo ✓ Turno dado» (y el turno en la base).
//   B · «No vino» desde la barra en un turno ya empezado → [Deshacer] → deshacer (la base vuelve).
//   C · «Cobrar» desde la barra → Efectivo (un cobro en la base).
//   D · WhatsApp desde la barra: el href es wa.me (no se sigue).
//   E · en 375: elegir otra profesional por chip.
//   T2 · G: arrastrar a un hueco libre (1 gesto; en 375, mantener 300 ms y llevar) → aviso → Deshacer.
//        H: estirar 15' con la manija (y estirar sobre otro turno → «Se pisa con…», queda igual).
//        I: mover con el teclado (M, ↓↓, Enter), en 1366. (La canaleta es la de siempre: sin medias horas.)
//   Chequeos: sin scroll horizontal, teclas ≥ 44 px, consola limpia.
// Uso: node --import tsx src/tenants/ch/e2e/agenda-interaccion.e2e.mjs <carpeta del resumen (fuera del repo)>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { levantarEntornoCH, RAIZ, CLAVE_DE_PRUEBA } from "./entorno-ch.mjs";
import { prismaComoDuenio } from "../../../test/base-efimera.ts";
import { ENTIDAD_INTERRUPTOR, ACCION_ENCENDER, CANAL_INTERRUPTOR, PREFIJO_ACTOR_OPERADOR } from "../../../cambios/interruptores.ts";

const OUT = process.argv[2] ?? path.join(RAIZ, "dist/ch-agenda-interaccion-e2e");
await mkdir(OUT, { recursive: true });
const filas = [];
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
const errores = [];
const toques = [];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const hoyBA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const medianoche = new Date(`${hoyBA}T00:00:00-03:00`).getTime();
const mananaBA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(medianoche + 36 * 3_600_000));

async function pagina(e, [w, h], { etiqueta } = {}) {
  const tactil = w < 800;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "es-AR", hasTouch: tactil, isMobile: tactil });
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
  return { ctx, p, tactil, w, h, n: [] };
}
const espera = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);

/** Cuenta cada toque (clic en escritorio, tap en el celular). */
async function toque(s, loc, que) {
  s.n.push(que);
  await loc.first().waitFor({ timeout: 15000 });
  if (s.tactil) await loc.first().tap();
  else await loc.first().click();
}
const anotar = (s, V, rec) => toques.push({ v: V, rec, toques: s.n.length, det: s.n.join(" › ") });

async function sinDesborde(p) {
  return p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
}
/** Alto/ancho de las teclas visibles adentro de `ambito`. */
async function teclasDe(ambito) {
  return ambito.evaluate((raiz) =>
    [...raiz.querySelectorAll("button, a, [role=radio]")]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { t: ((el.textContent || el.getAttribute("aria-label")) ?? "").trim().slice(0, 30), h: Math.round(r.height) };
      }),
  );
}

async function crearTurno(db, e, { nombre, k, prof = "marina" }) {
  const tenantId = e.base.a.id;
  const client = await db.client.create({ data: { tenantId, name: nombre, phone: `11 4000 ${String(2000 + k)}` } });
  const profId = e.semilla.profesionales[prof];
  const profFila = await db.professional.findUniqueOrThrow({ where: { id: profId } });
  // Hoy (hora de Buenos Aires), ya empezado, cada uno en su hora para no pisarse.
  const startsAt = new Date(medianoche + (8 * 60 + k * 55) * 60_000);
  const a = await db.appointment.create({
    data: {
      tenantId,
      clientId: client.id,
      professionalId: profId,
      serviceId: e.semilla.servicios.peeling,
      boxId: profFila.boxId,
      startsAt: startsAt.getTime() < Date.now() ? startsAt : new Date(Date.now() - 30 * 60_000),
      endsAt: new Date((startsAt.getTime() < Date.now() ? startsAt.getTime() : Date.now() - 30 * 60_000) + 40 * 60_000),
      status: "CONFIRMED",
      priceAtBooking: 22000,
    },
  });
  return { id: a.id, nombre, clientId: client.id };
}
/** Un turno de MAÑANA a las `hhmm` (Buenos Aires), para que siempre haya huecos que no pasaron. */
async function turnoManana(db, e, { nombre, k, hhmm, min = 40, prof = "marina" }) {
  const tenantId = e.base.a.id;
  const client = await db.client.create({ data: { tenantId, name: nombre, phone: `11 4100 ${String(3000 + k)}` } });
  const profId = e.semilla.profesionales[prof];
  const profFila = await db.professional.findUniqueOrThrow({ where: { id: profId } });
  const startsAt = new Date(`${mananaBA}T${hhmm}:00-03:00`);
  const a = await db.appointment.create({
    data: { tenantId, clientId: client.id, professionalId: profId, serviceId: e.semilla.servicios.peeling, boxId: profFila.boxId, startsAt, endsAt: new Date(startsAt.getTime() + min * 60_000), status: "CONFIRMED", priceAtBooking: 22000 },
  });
  return { id: a.id, nombre, clientId: client.id };
}
const enHora = (hhmm) => new Date(`${mananaBA}T${hhmm}:00-03:00`).toISOString();
const centro = (bx) => ({ x: bx.x + bx.width / 2, y: bx.y + bx.height / 2 });

/** Arrastra de `desde` a `hasta`: mouse en la PC; en táctil, mantener `mantener` ms y llevar (CDP). */
async function arrastrar(s, desde, hasta, { mantener = 450, antesDeSoltar } = {}) {
  if (!s.tactil) {
    await s.p.mouse.move(desde.x, desde.y);
    await s.p.mouse.down();
    await s.p.mouse.move(hasta.x, hasta.y, { steps: 10 });
    if (antesDeSoltar) await antesDeSoltar();
    await s.p.mouse.up();
    return;
  }
  const cdp = await s.ctx.newCDPSession(s.p);
  const dedo = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await dedo("touchStart", desde.x, desde.y);
  await s.p.waitForTimeout(mantener);
  for (let i = 1; i <= 10; i++) {
    await dedo("touchMove", desde.x + ((hasta.x - desde.x) * i) / 10, desde.y + ((hasta.y - desde.y) * i) / 10);
    await s.p.waitForTimeout(25);
  }
  if (antesDeSoltar) await antesDeSoltar();
  await dedo("touchEnd");
  await cdp.detach();
}
async function esperarBase(leer, cond, veces = 20) {
  let v = await leer();
  for (let i = 0; i < veces && !cond(v); i++) {
    await new Promise((r) => setTimeout(r, 500));
    v = await leer();
  }
  return v;
}

async function prender(db, e, id) {
  await db.auditLog.create({
    data: { tenantId: e.base.a.id, entity: ENTIDAD_INTERRUPTOR, entityId: id, action: ACCION_ENCENDER, channel: CANAL_INTERRUPTOR, actor: PREFIJO_ACTOR_OPERADOR + "e2e" },
  });
}

async function irALaAgenda(s, e, query = "") {
  await s.p.goto(`${e.url}/admin/turnos${query}`);
  await s.p.waitForLoadState("networkidle").catch(() => {});
}
const bloqueDe = (p, turno) => p.getByRole("button", { name: new RegExp(`${turno.nombre}.*abrir el turno`) });
const barraDe = (p, turno) => p.getByRole("group", { name: new RegExp(`Acciones rápidas: ${turno.nombre}`) });

/** Muestra la barra del turno: en la PC con el mouse encima (0 toques); en táctil, el 1.er toque. */
async function mostrarBarra(s, turno) {
  const bloque = bloqueDe(s.p, turno);
  await bloque.first().waitFor({ timeout: 15000 });
  await bloque.first().scrollIntoViewIfNeeded();
  if (s.tactil) await toque(s, bloque, "turno (elige)");
  else await bloque.first().hover();
  const barra = barraDe(s.p, turno);
  return { barra, visible: await espera(barra, 5000) };
}

for (const [w, h] of [[1366, 768], [375, 812]]) {
  const V = `${w}`;
  const e = await levantarEntornoCH({ log: () => {} });
  try {
    const db = await prismaComoDuenio(e.base);
    let k = 0;
    const tNoVino = await crearTurno(db, e, { nombre: `Nora Novino ${V}`, k: k++ });
    const tCobro = await crearTurno(db, e, { nombre: `Cora Cobro ${V}`, k: k++ });
    const tWa = await crearTurno(db, e, { nombre: `Wanda Whats ${V}`, k: k++ });
    const tCarla = await crearTurno(db, e, { nombre: `Clara Decarla ${V}`, k: k++, prof: "carla" });

    // ───────── F · APAGADO ─────────
    {
      const s = await pagina(e, [w, h], { etiqueta: `F-${V}` });
      await irALaAgenda(s, e);
      await s.p.waitForTimeout(500);
      const bloque = bloqueDe(s.p, tNoVino);
      if (await espera(bloque, 5000)) {
        if (!s.tactil) await bloque.first().hover();
      }
      const nBarras = await s.p.locator("[data-turno-barra]").count();
      const nGrupos = await s.p.getByRole("group", { name: /Acciones rápidas/ }).count();
      const nChips = await s.p.getByRole("radiogroup", { name: "Ver la agenda de" }).count();
      ok(`F1.${V}`, nBarras === 0 && nGrupos === 0 && nChips === 0, `apagado: sin barra ni chips (barras ${nBarras}, grupos ${nGrupos}, chips ${nChips})`);
      const d = await sinDesborde(s.p);
      ok(`F2.${V}`, d.sw <= d.iw, `apagado: agenda sin scroll horizontal (${d.sw} ≤ ${d.iw})`);
      await s.ctx.close();
    }

    await prender(db, e, "agenda-practica");
    await prender(db, e, "agenda-interaccion");

    // ───────── A · hueco → dar turno ─────────
    {
      const s = await pagina(e, [w, h], { etiqueta: `A-${V}` });
      // Mañana, para que siempre haya huecos que no pasaron.
      await irALaAgenda(s, e, `?date=${mananaBA}&pro=${e.semilla.profesionales.marina}`);
      const hueco = s.p.getByRole("link", { name: /^Dar un turno a las 1[0-6]:\d\d con Marina/ });
      ok(`A0.${V}`, await espera(hueco), "prendido: la grilla ofrece huecos de Marina");
      await toque(s, hueco, "hueco");
      const cajon = s.p.getByRole("dialog").first();
      await cajon.waitFor({ timeout: 20000 });
      await toque(s, cajon.getByRole("group", { name: "Servicio" }).getByRole("button", { name: /Peeling/ }), "servicio");
      const buscar = cajon.getByPlaceholder("Nombre o teléfono…");
      await toque(s, buscar, "buscar clienta");
      await buscar.fill("Nora");
      await toque(s, cajon.getByRole("list", { name: "Fichas que coinciden" }).getByRole("button", { name: /Nora Novino/ }), "elegir ficha");
      const dar = cajon.getByRole("button", { name: /^Dar turno · / });
      await toque(s, dar, "Dar turno");
      const listo = await espera(s.p.getByText("Listo ✓ Turno dado"), 20000);
      const enBase = await db.appointment.count({ where: { clientId: tNoVino.clientId, startsAt: { gte: new Date(medianoche + 24 * 3_600_000) } } });
      ok(`A1.${V}`, listo && enBase === 1, `hueco → «Listo ✓ Turno dado» (${s.n.length} toques; en la base: ${enBase})`);
      anotar(s, V, "a · hueco → dar turno");
      await s.ctx.close();
    }

    // ───────── B · No vino → Deshacer ─────────
    {
      const s = await pagina(e, [w, h], { etiqueta: `B-${V}` });
      // En el celular, la grilla de Marina (la de los turnos del recorrido); en la PC no cambia nada.
      await irALaAgenda(s, e, `?pro=${e.semilla.profesionales.marina}`);
      const { barra, visible } = await mostrarBarra(s, tNoVino);
      ok(`B0.${V}`, visible, `la barra aparece sobre el turno (${s.tactil ? "1.er toque" : "mouse encima"})`);
      ok(`B0b.${V}`, (await s.p.getByRole("dialog").filter({ visible: true }).count()) === 0, "mostrar la barra no abre el cajón");
      if (s.tactil) ok(`B0c.${V}`, await espera(barra.getByRole("button", { name: /^Abrir el turno/ }), 3000), "táctil: la barra trae «Abrir»");
      const chicas = (await teclasDe(barra.first())).filter((x) => x.h < 44);
      ok(`E1.${V}`, chicas.length === 0, `teclas de la barra ≥ 44 px${chicas.length ? `: CHICAS ${chicas.map((x) => `${x.t}:${x.h}`).join(", ")}` : ""}`);
      const d0 = await sinDesborde(s.p);
      ok(`E2.${V}`, d0.sw <= d0.iw, `con la barra abierta, sin scroll horizontal (${d0.sw} ≤ ${d0.iw})`);
      await toque(s, barra.getByRole("button", { name: /^No vino/ }), "No vino");
      const deshacer = s.p.getByRole("button", { name: "Deshacer" });
      const hay = await espera(deshacer, 15000);
      const est1 = (await db.appointment.findUniqueOrThrow({ where: { id: tNoVino.id } })).status;
      ok(`B1.${V}`, hay && est1 === "NO_SHOW", `No vino de un toque → [Deshacer] (base: ${est1})`);
      await toque(s, deshacer, "Deshacer");
      let est2 = est1;
      for (let i = 0; i < 20 && est2 === "NO_SHOW"; i++) {
        await s.p.waitForTimeout(500);
        est2 = (await db.appointment.findUniqueOrThrow({ where: { id: tNoVino.id } })).status;
      }
      ok(`B2.${V}`, est2 !== "NO_SHOW", `Deshacer: el turno vuelve (base: ${est2}; ${s.n.length} toques)`);
      anotar(s, V, "b · No vino → Deshacer");
      // Esc / tocar fuera cierran la barra.
      const otra = await mostrarBarra({ ...s, n: [] }, tCobro);
      if (otra.visible) {
        if (s.tactil) await s.p.locator("h1").first().tap().catch(() => s.p.mouse.click(5, 5));
        else await s.p.keyboard.press("Escape").then(() => s.p.mouse.move(2, 2));
        await s.p.waitForTimeout(400);
        ok(`B3.${V}`, !(await otra.barra.first().isVisible()), `${s.tactil ? "tocar fuera" : "Esc / sacar el mouse"} cierra la barra`);
      }
      await s.ctx.close();
    }

    // ───────── C · Cobrar efectivo ─────────
    {
      const s = await pagina(e, [w, h], { etiqueta: `C-${V}` });
      // En el celular, la grilla de Marina (la de los turnos del recorrido); en la PC no cambia nada.
      await irALaAgenda(s, e, `?pro=${e.semilla.profesionales.marina}`);
      const { barra } = await mostrarBarra(s, tCobro);
      await toque(s, barra.getByRole("button", { name: /^Cobrar/ }), "Cobrar");
      const hoja = s.p.getByRole("dialog").filter({ visible: true }).first();
      await toque(s, hoja.getByRole("button", { name: /^Efectivo/ }), "Efectivo");
      await espera(s.p.getByText(/y cobrado:|Cobrado:/), 20000);
      let cobros = [];
      for (let i = 0; i < 20 && cobros.length === 0; i++) {
        cobros = await db.collection.findMany({ where: { appointmentId: tCobro.id }, select: { amount: true, method: true } });
        if (!cobros.length) await s.p.waitForTimeout(500);
      }
      ok(`C1.${V}`, cobros.length === 1, `Cobrar desde la barra → Efectivo (${s.n.length} toques; base: ${cobros.map((c) => `${c.amount} ${c.method}`).join("; ") || "sin cobro"})`);
      anotar(s, V, "c · Cobrar efectivo");
      await s.ctx.close();
    }

    // ───────── D · WhatsApp ─────────
    {
      const s = await pagina(e, [w, h], { etiqueta: `D-${V}` });
      // En el celular, la grilla de Marina (la de los turnos del recorrido); en la PC no cambia nada.
      await irALaAgenda(s, e, `?pro=${e.semilla.profesionales.marina}`);
      const { barra } = await mostrarBarra(s, tWa);
      const href = (await barra.getByRole("link", { name: /^WhatsApp a/ }).first().getAttribute("href").catch(() => null)) ?? "";
      s.n.push("WhatsApp");
      ok(`D1.${V}`, /^https:\/\/wa\.me\/549\d+/.test(href), `WhatsApp desde la barra → ${href.slice(0, 32)}… (${s.n.length} toques)`);
      anotar(s, V, "d · WhatsApp");
      await s.ctx.close();
    }

    // ───────── E · elegir otra profesional (celular) ─────────
    if (w < 800) {
      const s = await pagina(e, [w, h], { etiqueta: `E-${V}` });
      await irALaAgenda(s, e);
      const chips = s.p.getByRole("radiogroup", { name: "Ver la agenda de" });
      ok(`E3.${V}`, await espera(chips), "prendido: chips de profesional");
      const chicas = (await teclasDe(chips.first())).filter((x) => x.h < 44);
      ok(`E4.${V}`, chicas.length === 0, `chips ≥ 44 px${chicas.length ? `: CHICAS ${chicas.map((x) => `${x.t}:${x.h}`).join(", ")}` : ""}`);
      await toque(s, chips.getByRole("radio", { name: "Carla Díaz" }), "chip Carla");
      const deCarla = await espera(s.p.getByRole("region", { name: "La agenda de Carla Díaz" }), 15000);
      const suTurno = await espera(bloqueDe(s.p, tCarla), 10000);
      ok(`E5.${V}`, deCarla && suTurno, `chip → la grilla de Carla con su turno (${s.n.length} toque)`);
      anotar(s, V, "e · otra profesional por chip");
      const d = await sinDesborde(s.p);
      ok(`E6.${V}`, d.sw <= d.iw, `grilla de una profesional sin scroll horizontal (${d.sw} ≤ ${d.iw})`);
      await s.ctx.close();
    }

    // ───────── T2 · G mover sin hoja → Deshacer · H estirar · I teclado ─────────
    {
      const marina = e.semilla.profesionales.marina;
      const tMover = await turnoManana(db, e, { nombre: `Gina Mover ${V}`, k: 10, hhmm: "11:30" });
      const tEstirar = await turnoManana(db, e, { nombre: `Elsa Estirar ${V}`, k: 11, hhmm: "14:00", min: 45 });
      await turnoManana(db, e, { nombre: `Otto Ocupado ${V}`, k: 12, hhmm: "16:00" });
      const tTeclado = await turnoManana(db, e, { nombre: `Teo Teclado ${V}`, k: 13, hhmm: "17:00" });
      const s = await pagina(e, [w, h], { etiqueta: `G-${V}` });
      // Las dos grillas están en la página (la del celular escondida en la PC): siempre la VISIBLE.
      await irALaAgenda(s, e, `?date=${mananaBA}&pro=${marina}`);

      // G · arrastrar a 13:00 (hueco libre) en UN gesto.
      const bloque = bloqueDe(s.p, tMover).filter({ visible: true }).first();
      await bloque.waitFor({ timeout: 15000 });
      await bloque.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const bb = await bloque.boundingBox();
      const celda = s.p.locator(`[data-celda][data-columna="${marina}"][data-minuto="780"]`).filter({ visible: true }).first();
      const cb = await celda.boundingBox();
      s.n.push("arrastrar (1 gesto)");
      await arrastrar(s, { x: bb.x + bb.width / 2, y: bb.y + 8 }, centro(cb), {
        antesDeSoltar: () => espera(s.p.getByText(/^Soltá: 13:00/).filter({ visible: true }), 10000),
      });
      const movido = await espera(s.p.getByText(/Movido a 13:00 con Marina/), 15000);
      const ini1 = await esperarBase(async () => (await db.appointment.findUniqueOrThrow({ where: { id: tMover.id } })).startsAt.toISOString(), (v) => v === enHora("13:00"));
      ok(`G1.${V}`, movido && ini1 === enHora("13:00"), `soltar = mover sin hoja: aviso «Movido a 13:00…» (base ${ini1.slice(11, 16)}Z; ${s.n.length} gesto)`);
      ok(`G2.${V}`, (await s.p.getByRole("dialog").filter({ visible: true }).count()) === 0, "sin hoja de confirmación");
      ok(`G3.${V}`, await espera(s.p.getByRole("link", { name: "Avisar por WhatsApp" }), 3000), "el aviso trae «Avisar por WhatsApp»");
      await s.p.screenshot({ path: `${OUT}/t2-mover-${V}.png` });
      await toque(s, s.p.getByRole("button", { name: "Deshacer" }), "Deshacer");
      const ini2 = await esperarBase(async () => (await db.appointment.findUniqueOrThrow({ where: { id: tMover.id } })).startsAt.toISOString(), (v) => v === enHora("11:30"));
      ok(`G4.${V}`, ini2 === enHora("11:30"), `Deshacer vuelve al origen (base ${ini2.slice(11, 16)}Z; ${s.n.length} toques)`);
      anotar(s, V, "g · arrastrar a hueco libre → Deshacer");

      // H · estirar 15' (14:00–14:45 → 15:00).
      const sh = { ...s, n: [] };
      await s.p.waitForTimeout(500);
      const bEst = bloqueDe(s.p, tEstirar).filter({ visible: true }).first();
      await bEst.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const fila = (await s.p.locator("[data-celda]").filter({ visible: true }).first().boundingBox()).height;
      const manija = () => bEst.locator("xpath=..").locator("[data-manija]").first();
      let mb = centro(await manija().boundingBox());
      sh.n.push("estirar (1 gesto)");
      let rotulo = "";
      await arrastrar(sh, mb, { x: mb.x, y: mb.y + fila / 2 + 2 }, {
        mantener: 0,
        antesDeSoltar: async () => {
          rotulo = (await s.p.locator("[data-estirando]").filter({ visible: true }).first().textContent({ timeout: 3000 }).catch(() => "")) ?? "";
          await s.p.screenshot({ path: `${OUT}/t2-estirar-${V}.png` });
        },
      });
      const fin1 = await esperarBase(async () => (await db.appointment.findUniqueOrThrow({ where: { id: tEstirar.id } })).endsAt.toISOString(), (v) => v === enHora("15:00"));
      ok(`H1.${V}`, fin1 === enHora("15:00"), `estirar 15' guarda el fin (base ${fin1.slice(11, 16)}Z; ${sh.n.length} gesto)`);
      ok(`H2.${V}`, rotulo.includes("14:00–15:00 · 1 h"), `mientras se estira dice la duración («${rotulo}»)`);
      anotar(sh, V, "h · estirar 15'");
      // Estirar hasta las 16:00 (Otto): se rechaza y queda como estaba.
      await s.p.mouse.move(1, 1).catch(() => {});
      await s.p.getByRole("button", { name: "Deshacer" }).first().waitFor({ state: "detached", timeout: 12000 }).catch(() => {});
      mb = centro(await manija().boundingBox());
      await arrastrar(sh, mb, { x: mb.x, y: mb.y + fila * 2 + 2 }, { mantener: 0 });
      const rechazo = await espera(s.p.getByText(/Se pisa con Otto Ocupado .* a las 16:00/).filter({ visible: true }), 8000);
      const fin2 = (await db.appointment.findUniqueOrThrow({ where: { id: tEstirar.id } })).endsAt.toISOString();
      ok(`H3.${V}`, rechazo && fin2 === enHora("15:00"), `estirar sobre otro turno: «Se pisa con Otto…» y queda igual (base ${fin2.slice(11, 16)}Z)`);

      // I · teclado (PC): M, ↓↓, Enter → 18:00.
      if (!s.tactil) {
        const bt = bloqueDe(s.p, tTeclado).filter({ visible: true }).first();
        await bt.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await bt.focus();
        await s.p.keyboard.press("m");
        await s.p.keyboard.press("ArrowDown");
        await s.p.keyboard.press("ArrowDown");
        await espera(s.p.getByText(/^Soltá: 18:00/).filter({ visible: true }), 10000);
        await s.p.keyboard.press("Enter");
        const ini3 = await esperarBase(async () => (await db.appointment.findUniqueOrThrow({ where: { id: tTeclado.id } })).startsAt.toISOString(), (v) => v === enHora("18:00"));
        ok(`I1.${V}`, ini3 === enHora("18:00"), `teclado: M, ↓↓, Enter mueve a las 18:00 (base ${ini3.slice(11, 16)}Z)`);
      }
      await s.ctx.close();
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
console.log(`\nRESUMEN ${filas.length - fallas.length}/${filas.length} OK · resumen en ${OUT}`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify({ filas, toques }, null, 1));
process.exit(fallas.length ? 1 : 0);
