// Recorrido de un sábado de CH Estética (guion-ch.md, 25 pasos) sobre Postgres LOCAL con RLS y `next dev`
// (desvío anotado: el build de producción no compila en este entorno). Nunca Neon.
// Reloj: sábado 14/11/2026, America/Argentina/Buenos_Aires; el servidor y los navegadores corren con el
// reloj del paso (reloj.mjs + cookie __reloj). Un contexto por persona; paso 05 con dos a la vez.
// Uso (desde /home/user/ERP): node --import tsx src/tenants/ch/e2e/operacion-real/recorrido-sabado.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { levantarEntornoDev, AQUI } from "./entorno-dev.mjs";
import { sembrarSabado, ar, USUARIOS, SABADO } from "./semilla-sabado-ch.mts";
import { ponerReloj, abrirNavegador, contexto, sincronizarReloj, ingresar, ir, RELOJ, reintentos404 } from "./comun.mjs";
import { vigilarConsola, chequearPaso, guardarVisual, tablaVisualMd, registros } from "./chequeos-visuales.mjs";
import { prismaComoDuenio } from "../../../../test/base-efimera.ts";

const CAPT = path.resolve(AQUI, "../capturas/ch");
const ARB = path.join(AQUI, "arbol-run");
mkdirSync(CAPT, { recursive: true }); mkdirSync(ARB, { recursive: true });
const filas = [];
const capturas = [];
const T = 15000;

ponerReloj(ar("08:40"));
const e = await levantarEntornoDev({ ahora: ar("07:00", "2026-11-13"), relojArchivo: RELOJ });
const db = await prismaComoDuenio(e.base);
const tenantId = e.base.a.id;
const s = await sembrarSabado(e.base, e.semilla);
writeFileSync(path.join(AQUI, "semilla-run.json"), JSON.stringify({ sabado: SABADO, octubre: s.octubre, turnos: s.turnos }, null, 1));
const b = await abrirNavegador();
const personas = {};
const contextos = [];

async function persona(clave, email, ancho) {
  const ctx = await contexto(b, e.url, ancho);
  contextos.push(ctx);
  const p = await ctx.newPage();
  const vigia = vigilarConsola(p);
  if (email) await ingresar(p, e.url, email);
  personas[clave] = { ctx, p, vigia, ancho };
  return personas[clave];
}
async function reloj(hhmm) {
  ponerReloj(ar(hhmm));
  for (const c of contextos) await sincronizarReloj(c, e.url);
  await new Promise((r) => setTimeout(r, 400)); // el servidor relee el desfase cada 150 ms
}
const espera = (loc, ms = T) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
const arbol = async (p, nombre, loc) => writeFileSync(path.join(ARB, nombre + ".yml"), `# ${p.url()}\n` + (await (loc ?? p.locator("body")).ariaSnapshot().catch((x) => "ERR " + x.message)));
const texto = async (loc) => ((await loc.first().innerText({ timeout: 5000 }).catch(() => "")) || "").replace(/\s+/g, " ").trim();
const pesos = (n) => "$" + Math.round(n).toLocaleString("es-AR");
async function foto(id, per, nota) {
  const archivo = path.join(CAPT, `${id}-paso-${per.ancho}.png`);
  await per.p.waitForTimeout(400);
  await per.p.screenshot({ path: archivo, fullPage: false }).catch(() => {});
  const v = await chequearPaso(per.p, { paso: id, ancho: per.ancho }, per.vigia).catch((x) => ({ error: x.message }));
  capturas.push({ id, ancho: per.ancho, archivo, nota });
  return v;
}
async function paso(id, hora, quien, fn, ref = "") {
  await reloj(hora);
  const t0 = Date.now();
  let r;
  try { r = await fn(); } catch (x) {
    r = { estado: "FALLA", visto: `excepción: ${String(x.message).split("\n")[0].slice(0, 160)} · ${(String(x.message).match(/waiting for (.*)/) ?? ["", ""])[1].slice(0, 160)}` };
    const per = personas[quienClave(quien)];
    if (per) { await arbol(per.p, `${id}-error`); await per.p.screenshot({ path: path.join(ARB, `${id}-error.png`) }).catch(() => {}); for (const pp of Object.values(personas)) if (pp?.p) await cerrarCajon(pp); }
  }
  filas.push({ id, hora, quien, estado: r.estado, visto: r.visto, ref: r.ref ?? ref, ms: Date.now() - t0 });
  console.log(`${r.estado.padEnd(8)} ${id} ${hora} ${String(r.visto).slice(0, 140)}`);
}
const quienClave = (q) => (/^R2/.test(q) || /→ R2/.test(q) ? "r2" : /^R1/.test(q) ? "r1" : /Prof A/.test(q) ? "profA" : /Prof B/.test(q) ? "profB" : /Clienta/.test(q) ? "clienta" : /Dueña 390/.test(q) ? "duenia390" : "duenia");
const agenda = (per) => ir(per.p, e.url, "/admin/turnos");
const bloque = (p, t) => p.getByRole("button", { name: new RegExp(`^${t.hora}, ${t.clienta}.*abrir el turno`) });
const cajonVisible = (p) => p.getByRole("dialog").filter({ visible: true }).first();
async function abrirTurno(per, t) {
  await agenda(per); // siempre de nuevo: la agenda se dibuja con la hora del momento
  await bloque(per.p, t).first().click({ timeout: T });
  const c = cajonVisible(per.p);
  await c.waitFor({ timeout: T });
  await per.p.waitForTimeout(500);
  return c;
}
async function cerrarCajon(per) { if (per.p.isClosed()) return; await per.p.keyboard.press("Escape").catch(() => {}); await per.p.waitForTimeout(300); }
const cobrosDe = (id) => db.collection.findMany({ where: { tenantId, appointmentId: id }, orderBy: { createdAt: "asc" } });
const suma = (cs) => cs.reduce((a, c) => a + Number(c.amount), 0);
const turnoDb = (id) => db.appointment.findUnique({ where: { id }, select: { status: true, startsAt: true } });
const opcion = (grupo, nombre) => grupo.getByRole("radio", { name: nombre }).or(grupo.getByRole("button", { name: nombre })).first();

try {
  // ── Precalentado: cada pantalla una vez, para que la compilación de dev no cuente como lentitud.
  {
    const w = await persona("calentar", USUARIOS.duenia, 1440);
    const t0 = Date.now();
    for (const r of ["/admin", "/admin/turnos", "/admin/turnos/lista", "/admin/turnos/cerrar", "/admin/caja", "/admin/caja/cierre", "/admin/caja/libro", "/admin/reportes?periodo=mes-pasado", "/admin/comisiones", "/admin/pedidos", "/", "/reserva"]) await ir(w.p, e.url, r);
    await bloque(w.p, s.turnos.a0900).first().waitFor({ timeout: 1000 }).catch(() => {});
    await ir(w.p, e.url, "/admin/turnos"); await bloque(w.p, s.turnos.a0900).first().click().catch(() => {}); await w.p.waitForTimeout(1500);
    console.log(`· precalentado en ${Date.now() - t0} ms`);
    w.vigia.tomar();
    await w.ctx.close(); contextos.splice(contextos.indexOf(w.ctx), 1); delete personas.calentar;
  }
  await reloj("08:50");
  const duenia = await persona("duenia", USUARIOS.duenia, 1440);
  const r1 = await persona("r1", USUARIOS.r1, 1440);
  const profA = await persona("profA", USUARIOS.profA, 390);

  // 01 ★ Dueña abre caja con fondo $20.000; Inicio muestra 18 turnos
  await paso("01", "08:50", "Dueña 1440", async () => {
    await ir(duenia.p, e.url, "/admin/caja");
    const abrir = await duenia.p.getByRole("button", { name: /Abrir caja/ }).count();
    // CH no tiene «Abrir caja» (sin cajón físico): el fondo se carga como Ingreso en el libro.
    await duenia.p.getByRole("button", { name: "Cargar un gasto o retiro" }).click();
    await duenia.p.locator("#libro-amount").first().waitFor({ timeout: T });
    const f = duenia.p.locator("form", { has: duenia.p.locator("#libro-amount") }).first();
    await f.locator("#libro-detail").fill("Fondo de caja del sábado");
    await f.locator("#libro-type").selectOption("INGRESO").catch(() => {});
    await f.locator("#libro-method").selectOption("EFECTIVO").catch(() => {});
    await f.locator("#libro-amount").fill("20000");
    await f.locator('button[type="submit"]').first().click();
    await duenia.p.waitForTimeout(2000);
    const mov = await db.cashMovement.findFirst({ where: { tenantId, amount: 20000 }, select: { type: true, method: true } });
    await ir(duenia.p, e.url, "/admin/caja");
    const filaEf = await texto(duenia.p.getByRole("row", { name: /^Efectivo/ }));
    await foto("01c", duenia, "Caja del día tras cargar el fondo como ingreso");
    await ir(duenia.p, e.url, "/admin");
    const resumen = await texto(duenia.p.locator("main p strong").first());
    await foto("01", duenia, "Inicio: «18 turnos hoy»");
    const ok18 = /18 turnos/.test(resumen);
    return {
      estado: abrir === 0 ? "CALLEJÓN" : ok18 ? "OK" : "FALLA",
      visto: `sin «Abrir caja» (${abrir}); fondo cargado como ${mov ? mov.type + "/" + mov.method : "NADA"}; fila Efectivo: «${filaEf}»; Inicio: «${resumen}»`,
      ref: "src/app/admin/(dashboard)/caja/page.tsx:43-46,90 (turno de cajero sólo con cajón físico/retail)",
    };
  });

  // 02 ★ Recepción: agenda del día, columnas, sin superposición
  await paso("02", "08:55", "R1 1440", async () => {
    await agenda(r1);
    const cajas = await r1.p.locator('button[aria-label*="abrir el turno"]').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, el.getAttribute("aria-label").split(",").slice(0, 2).join(",")]; }));
    let pisados = 0; const pares = [];
    for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
      const [a, c] = [cajas[i], cajas[j]];
      if (a[0] < c[2] - 1 && c[0] < a[2] - 1 && a[1] < c[3] - 1 && c[1] < a[3] - 1) { pisados++; pares.push(`${a[4]} ↔ ${c[4]} (${Math.round(a[3] - c[1])} px)`); }
    }
    const cabecera = await texto(r1.p.getByRole("region", { name: "La agenda por profesional" }));
    const columnas = ["Belén Ortiz", "Carla Díaz", "Laura Gómez", "Marina Suárez"].filter((n) => cabecera.startsWith(n) || cabecera.slice(0, 120).includes(n));
    await foto("02", r1, "Agenda del sábado, columnas por profesional");
    return { estado: pisados === 0 && cajas.length === 18 ? "OK" : "FALLA", visto: `${cajas.length} turnos, ${pisados} pares superpuestos ${pares.join("; ")}; columnas: ${columnas.join(", ")} (el guion pedía 2: también salen Carla y Marina sin turnos)`, ref: "src/app/admin/(dashboard)/turnos/page.tsx" };
  });

  // 03 ★ Prof A en el celu: sólo lo suyo
  await paso("03", "09:00", "Prof A 390", async () => {
    await agenda(profA);
    const nombres = await profA.p.locator('button[aria-label*="abrir el turno"]').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    const ajenos = nombres.filter((n) => s.lista.some((t) => t.prof === "B" && n.includes(t.clienta)));
    const v = await foto("03", profA, "Agenda de Laura a 390: sólo sus 11 turnos, nada cortado");
    return { estado: ajenos.length === 0 && nombres.length === 11 && !v.desborde ? "OK" : "FALLA", visto: `${nombres.length} turnos, ${ajenos.length} ajenos, desborde ${v.desborde ? "sí" : "no"}, cortados ${v.cortados?.length ?? "?"}` };
  });

  // 04 Primera clienta con seña → el saldo descuenta la seña
  await paso("04", "09:05", "R1 1440", async () => {
    const c = await abrirTurno(r1, s.turnos.a0900);
    const g = await c.getByRole("group", { name: /^Cobrar .* con/ }).first().getAttribute("aria-label").catch(() => null)
      ?? (await texto(c.getByRole("group", { name: /^Cobrar/ })));
    const nombre = await c.getByRole("group", { name: /^Cobrar/ }).first().evaluate((el) => el.getAttribute("aria-label") || el.querySelector("legend")?.textContent || "").catch(() => "");
    await foto("04", r1, "Cajón de Sofía: seña $5.000 pagada, cobrar $10.000");
    await cerrarCajon(r1);
    const ok = /10\.000/.test(nombre + g);
    return { estado: ok ? "OK" : "FALLA", visto: `cajón: «${(nombre || g).trim()}» (masaje $15.000 − seña $5.000)` };
  });

  // 05 ★ Recepción y Prof A cobran el MISMO turno a la vez
  await paso("05", "09:40", "R1 1440 + Prof A 390", async () => {
    const [cR, cA] = await Promise.all([abrirTurno(r1, s.turnos.a0900), abrirTurno(profA, s.turnos.a0900)]);
    const bR = cR.getByRole("group", { name: /^Cobrar/ }).getByRole("button", { name: "Efectivo" });
    const bA = cA.getByRole("group", { name: /^Cobrar/ }).getByRole("button", { name: "Efectivo" });
    await Promise.all([bR.click({ timeout: T }), bA.click({ timeout: T })]);
    await r1.p.waitForTimeout(3500);
    const cs = await cobrosDe(s.turnos.a0900.id);
    const total = suma(cs);
    const aviso = (await texto(profA.p.locator('[role="alert"], [role="status"]'))).slice(0, 120);
    await foto("05", r1, "Recepción tras el doble cobro simultáneo");
    await foto("05", profA, "Prof A tras el doble cobro simultáneo (aviso de que ya estaba cobrado)");
    await cerrarCajon(r1); await cerrarCajon(profA);
    return { estado: total === 15000 ? "OK" : "FALLA", visto: `${cs.length} cobros en la base, total ${pesos(total)} (esperado $15.000); aviso a Prof A: «${aviso}»`, ref: total === 15000 ? "src/lib/turnos/cobros.ts:283 (clave idempotente saldo:<turno>)" : "FALLA DE PLATA: src/lib/turnos/cobros.ts:283" };
  });

  // 06 ★ Cobro dividido $10.000 efectivo + $12.000 transferencia
  await paso("06", "10:15", "R1 1440", async () => {
    const c = await abrirTurno(r1, s.turnos.a1000);
    await c.getByRole("button", { name: "Dividir el pago" }).click();
    const g1 = c.getByRole("group", { name: /Paga una parte con/ });
    await opcion(g1, "Efectivo").click();
    await c.getByLabel(/Cuánto paga con/).fill("10000");
    const g2 = c.getByRole("group", { name: /Y el resto con/ });
    await opcion(g2, "Transferencia").click();
    await c.getByRole("button", { name: /en 2 medios/ }).click();
    await r1.p.waitForTimeout(3000);
    const cs = await cobrosDe(s.turnos.a1000.id);
    await agenda(r1); const c2 = await abrirTurno(r1, s.turnos.a1000);
    const pagado = await c2.getByText("Pagado ✓").count();
    await foto("06", r1, "Cajón de Lucía: dos pagos ($10.000 efectivo + $12.000 transferencia), Pagado ✓");
    await cerrarCajon(r1);
    const ok = suma(cs) === 22000 && cs.length === 2;
    return { estado: ok ? "OK" : "FALLA", visto: `${cs.map((x) => `${x.method} ${pesos(Number(x.amount))}`).join(" + ")}; «Pagado ✓» ${pagado ? "sí" : "no"}` };
  });

  // 07 Transferencia por captura de WhatsApp → nada verifica que llegó (D1)
  await paso("07", "10:30", "R1 1440", async () => {
    const c = await abrirTurno(r1, s.turnos.a1400);
    const campos = await c.getByRole("textbox").count();
    await c.getByRole("group", { name: /^Cobrar/ }).getByRole("button", { name: "Transferencia" }).click();
    await r1.p.waitForTimeout(2500);
    const cs = await cobrosDe(s.turnos.a1400.id);
    const est7 = await turnoDb(s.turnos.a1400.id);
    await foto("07", r1, "Transferencia cargada con un toque, sin comprobante ni referencia");
    await cerrarCajon(r1);
    return { estado: "FALLA", visto: `cobró ${pesos(suma(cs))} por transferencia con un toque; ${campos} campos de texto en el cajón: no pide nº de operación ni comprobante (D1); el turno de las 14:00 queda ${est7.status}`, ref: "src/lib/turnos/cobros.ts:286 (TRANSFERENCIA es sólo un valor del medio)" };
  });

  // 08 ★ No-show con seña → destino de la seña; hueco liberado
  await paso("08", "11:00", "R1 1440", async () => {
    const c = await abrirTurno(r1, s.turnos.a1045);
    await c.getByRole("button", { name: /^No vino/ }).click();
    const hoja = cajonVisible(r1.p);
    await r1.p.waitForTimeout(800);
    const pregunta = await texto(r1.p.getByText(/¿Qué pasa con esa plata\?/));
    await foto("08b", r1, "Hoja «No vino»: qué pasa con la seña");
    await opcion(r1.p.getByRole("group", { name: /Qué pasa con esa plata/ }), "Se la queda el negocio").click().catch(() => {});
    await r1.p.getByRole("button", { name: "Sí, no vino" }).click();
    await r1.p.waitForTimeout(2500);
    const t = await turnoDb(s.turnos.a1045.id);
    const cs = await cobrosDe(s.turnos.a1045.id);
    await agenda(r1);
    const hueco = await r1.p.getByRole("link", { name: /^Dar un turno a las 1[01]:\d\d con Laura/ }).count();
    await foto("08", r1, "Agenda: Paula como «No vino» y el hueco de Laura libre");
    return { estado: t.status === "NO_SHOW" && suma(cs) === 5000 && hueco > 0 ? "OK" : "FALLA", visto: `estado ${t.status}; seña ${pesos(suma(cs))} retenida; pregunta «${pregunta.slice(0, 60)}»; huecos de Laura 10-11 h: ${hueco}`, ref: hueco > 0 ? "src/app/admin/(dashboard)/turnos/_agenda/CancelarONoVino.tsx:126-137" : "hueco NO liberado: src/app/admin/(dashboard)/turnos/_agenda/PorProfesional.tsx:543 (filtra sólo CANCELLED)" };
  });

  // 09 Turno rápido en el hueco → contar toques
  await paso("09", "11:05", "R1 1440", async () => {
    let toques = 0;
    await agenda(r1);
    const hueco = r1.p.getByRole("link", { name: /^Dar un turno a las 1[01]:\d\d con Laura/ }).first();
    if (!(await hueco.count())) {
      await foto("09", r1, "Agenda a las 11:05: el hueco del no-show no se ofrece");
      return { estado: "CALLEJÓN", visto: "la grilla no ofrece «Dar un turno» en el hueco de Paula (el NO_SHOW sigue ocupando la celda); no se puede dar el turno rápido desde la agenda", ref: "src/app/admin/(dashboard)/turnos/_agenda/PorProfesional.tsx:543 (sólo libera CANCELLED)" };
    }
    await hueco.click(); toques++;
    const c = cajonVisible(r1.p); await c.waitFor({ timeout: T });
    await arbol(r1.p, "09-alta", c);
    await c.getByRole("group", { name: "Servicio" }).getByRole("button", { name: /Peeling/ }).click(); toques++;
    const buscar = c.getByPlaceholder(/Nombre o teléfono/);
    await buscar.click(); toques++;
    await buscar.fill("Octubre 07");
    await c.getByRole("list", { name: "Fichas que coinciden" }).getByRole("button", { name: /Clienta Octubre 07/ }).click(); toques++;
    await foto("09", r1, "Alta rápida en el hueco antes de confirmar");
    await c.getByRole("button", { name: /^Dar turno/ }).click(); toques++;
    const listo = await espera(r1.p.getByText(/Turno dado/), 15000);
    const n = await db.appointment.count({ where: { tenantId, professionalId: s.profA, startsAt: { gte: ar("11:00"), lt: ar("11:45") }, status: { not: "NO_SHOW" } } });
    await cerrarCajon(r1);
    return { estado: listo && n === 1 ? (toques < 4 ? "OK" : "FALLA") : "FALLA", visto: `${toques} toques + tipear el nombre (objetivo < 4); turno en la base: ${n}; aviso «Turno dado» ${listo ? "sí" : "no"}`, ref: "src/app/admin/(dashboard)/turnos/_agenda/DarTurnoCajon.tsx" };
  });

  // 10 ★ Clienta en la vidriera reserva a las 17:00 → ¿alias, monto, vencimiento de la seña?
  const clienta = await persona("clienta", null, 390);
  await paso("10", "11:30", "Clienta 390", async () => {
    await ir(clienta.p, e.url, "/");
    await clienta.p.getByRole("button", { name: /^Reservar turno/ }).filter({ visible: true }).first().click();
    const d = cajonVisible(clienta.p); await d.waitFor({ timeout: T });
    await d.getByPlaceholder(/Buscar/).fill("Limpieza").catch(() => {});
    await d.getByRole("button", { name: /Limpieza facial profunda/ }).first().click();
    const sig = async () => { const c = d.getByRole("button", { name: /^Continuar$/ }); if (await c.isVisible().catch(() => false) && await c.isEnabled().catch(() => false)) await c.click(); await clienta.p.waitForTimeout(600); };
    await sig();
    await d.getByRole("button", { name: /Marina Suárez/ }).first().click(); await sig();
    await d.getByRole("button", { name: /con horarios disponibles/ }).first().click();
    await d.getByRole("button", { name: "17:00", exact: true }).first().click({ timeout: T }); await sig();
    await d.getByLabel("Nombre").fill("Valentina Web");
    await d.getByLabel("Teléfono").fill("1130999888");
    await d.getByRole("button", { name: /^Confirmar$/ }).click();
    await espera(d.getByText(/Nº/), 20000);
    const conf = await texto(d);
    await arbol(clienta.p, "10-confirmacion", d);
    await foto("10", clienta, "Confirmación de la reserva web: seña sin alias ni vencimiento");
    const t = await db.appointment.findFirst({ where: { tenantId, client: { name: "Valentina Web" } }, select: { id: true, status: true, startsAt: true } });
    const tieneAlias = /alias|cbu|cvu/i.test(conf), tieneMonto = /5\.000/.test(conf), tieneVence = /venc|hasta las|antes de/i.test(conf);
    personas.webTurno = t;
    return { estado: t && tieneAlias && tieneMonto && tieneVence ? "OK" : "FALLA", visto: `turno ${t?.status ?? "NO CREADO"}; muestra monto ${tieneMonto ? "sí" : "no"}, alias ${tieneAlias ? "sí" : "no"}, vencimiento ${tieneVence ? "sí" : "no"} (D3): «${conf.slice(conf.indexOf("Recordá") >= 0 ? conf.indexOf("Recordá") : 0).slice(0, 120)}»`, ref: "src/app/(site)/_ch/BookingModal.tsx:888" };
  });

  // 11 «Pedir seña» al turno web
  await paso("11", "12:00", "R1 1440", async () => {
    await agenda(r1);
    const blk = r1.p.getByRole("button", { name: /Valentina Web.*abrir el turno/ }).first();
    await blk.click({ timeout: T });
    const c = cajonVisible(r1.p); await c.waitFor({ timeout: T }); await r1.p.waitForTimeout(500);
    const link = c.getByRole("link", { name: /(Pedirle|Recordarle) la seña/ }).first();
    const hay = await link.count();
    const href = hay ? (await link.getAttribute("href")) ?? "" : "";
    const msg = decodeURIComponent(href.split("text=")[1] ?? "");
    await foto("11", r1, "Cajón del turno web con «Pedirle la seña por WhatsApp»");
    if (hay) await link.click({ modifiers: [] }).catch(() => {});
    await r1.p.waitForTimeout(800);
    for (const pg of r1.ctx.pages()) if (pg !== r1.p) await pg.close();
    await cerrarCajon(r1);
    return { estado: hay && /wa\.me/.test(href) ? "OK" : "FALLA", visto: `link ${hay ? href.slice(0, 40) : "NO HAY"}; mensaje: «${msg.slice(0, 140)}»; alias en el mensaje: ${/alias|cbu|cvu/i.test(msg) ? "sí" : "no"}` };
  });

  // 12 ★ Venta de crema junto al servicio → ¿suma al ticket? descuenta stock
  await paso("12", "12:30", "R1 1440", async () => {
    const c = await abrirTurno(r1, s.turnos.a1200);
    await c.getByRole("link", { name: "Sumar un producto" }).click();
    await r1.p.waitForURL(/\/admin\/pedidos/, { timeout: T });
    await r1.p.waitForLoadState("networkidle").catch(() => {});
    const form = r1.p.locator('form:is([data-vender="mostrador"], [data-vender="formulario"])');
    const buscar = form.locator('#vender-buscar, input[role="combobox"][id^="prod-"]').last();
    await buscar.click(); await buscar.fill("crema");
    await r1.p.locator(`#${await buscar.getAttribute("aria-controls")}`).getByRole("option", { name: /crema/i }).first().waitFor({ timeout: T });
    await buscar.press("Enter");
    await form.getByRole("radio", { name: "Efectivo" }).click();
    const conClienta = await texto(form);
    await foto("12b", r1, "Mostrador con la crema y la clienta del turno cargada");
    await form.getByRole("button", { name: /^Cobrar/ }).click();
    await espera(r1.p.getByText(/cobrada/), 15000);
    const c2 = await abrirTurno(r1, s.turnos.a1200);
    const g = await c2.getByRole("group", { name: /^Cobrar/ }).first().evaluate((el) => el.getAttribute("aria-label") || "").catch(() => "");
    await c2.getByRole("group", { name: /^Cobrar/ }).getByRole("button", { name: "Efectivo" }).click();
    await r1.p.waitForTimeout(2500);
    const prod = await db.product.findUnique({ where: { id: s.crema.id }, select: { stock: true } });
    const cs = await cobrosDe(s.turnos.a1200.id);
    const orden = await db.order.findFirst({ where: { tenantId, items: { some: { productId: s.crema.id } } }, select: { total: true } }).catch(() => null);
    await foto("12", r1, "Tras cobrar servicio + crema: dos cobros separados");
    await cerrarCajon(r1);
    const sumaTicket = /32\.500/.test(g);
    return { estado: prod.stock === 9 && suma(cs) === 20000 ? (sumaTicket ? "OK" : "FALLA") : "FALLA", visto: `stock crema ${s.crema.stock}→${prod.stock}; venta aparte ${orden ? pesos(orden.total) : "?"}; turno cobrado ${pesos(suma(cs))} con «${g}»: NO suma al ticket (dos cobros); clienta en el mostrador: ${/Agustina/.test(conClienta) ? "sí" : "no"}`, ref: "src/app/admin/(dashboard)/turnos/_agenda/TurnoCajon.tsx:664-668 («Es otro cobro, aparte del turno»)" };
  });

  // 13 Recarga en medio de un cobro
  await paso("13", "13:00", "R1 1440", async () => {
    const c = await abrirTurno(r1, s.turnos.a1300);
    await c.getByRole("button", { name: "Dividir el pago" }).click();
    await opcion(c.getByRole("group", { name: /Paga una parte con/ }), "Efectivo").click();
    await c.getByLabel(/Cuánto paga con/).fill("5000");
    await r1.p.reload({ waitUntil: "domcontentloaded" }); await r1.p.waitForLoadState("networkidle").catch(() => {});
    const antes = await cobrosDe(s.turnos.a1300.id);
    const reabierto = await cajonVisible(r1.p).isVisible().catch(() => false);
    await foto("13", r1, "Después de recargar a mitad del cobro dividido");
    await cerrarCajon(r1);
    // El cobro mal cargado del paso 14: sin campo de monto, el error posible es el medio (MP en vez de efectivo).
    const c2 = await abrirTurno(r1, s.turnos.a1300);
    await c2.getByRole("group", { name: /^Cobrar/ }).getByRole("button", { name: "Mercado Pago" }).click();
    await r1.p.waitForTimeout(2500);
    const despues = await cobrosDe(s.turnos.a1300.id);
    await cerrarCajon(r1);
    return { estado: antes.length === 0 && despues.length === 1 ? "OK" : "FALLA", visto: `tras recargar: ${antes.length} cobros (nada a medias), cajón ${reabierto ? "reabierto por ?turno=" : "cerrado"}, lo tipeado se perdió; después un cobro ${despues.map((x) => x.method + " " + pesos(Number(x.amount))).join(",")}` };
  });

  // 14 ★ Anulación de cobro mal cargado → código de la dueña; sin código no deja; auditado
  await paso("14", "13:30", "R1 1440 + Dueña 1440", async () => {
    const c = await abrirTurno(r1, s.turnos.a1300);
    const pagos = c.getByRole("list", { name: "Pagos del turno" });
    await pagos.getByRole("button", { name: "Anular" }).last().click();
    await r1.p.waitForTimeout(500);
    await r1.p.getByLabel("Motivo").fill("Se cargó Mercado Pago y pagó en efectivo (el guion: $18.000 en vez de $15.000)");
    const codigo = r1.p.getByLabel("Código de la dueña");
    const pide = await codigo.count();
    const si = r1.p.getByRole("button", { name: "Sí, anular" });
    const deshabSin = await si.isDisabled().catch(() => null);
    await foto("14b", r1, "Anular sin código: «Sí, anular» deshabilitado");
    // La dueña saca el código desde el mismo turno
    const cD = await abrirTurno(duenia, s.turnos.a1300);
    await cD.getByRole("button", { name: "Autorizar anulación" }).last().click();
    const cod = (await texto(duenia.p.locator('[data-ui="codigo-anulacion"]'))).trim();
    await foto("14c", duenia, "La dueña ve el código para recepción");
    await cerrarCajon(duenia);
    if (pide) await codigo.fill(cod);
    await si.click();
    await r1.p.waitForTimeout(2500);
    const cs = await cobrosDe(s.turnos.a1300.id);
    const audit = await db.auditLog.count({ where: { tenantId, action: { contains: "void_collection" } } }).catch(() => -1);
    await foto("14", r1, "Pagos del turno con el cobro anulado");
    await cerrarCajon(r1);
    // Se vuelve a cobrar bien
    const c3 = await abrirTurno(r1, s.turnos.a1300);
    await c3.getByRole("group", { name: /^Cobrar/ }).getByRole("button", { name: "Efectivo" }).click().catch(() => {});
    await r1.p.waitForTimeout(2000); await cerrarCajon(r1);
    const fin = await cobrosDe(s.turnos.a1300.id);
    return { estado: pide && deshabSin && suma(cs) === 0 && audit > 0 ? "OK" : "FALLA", visto: `pide código ${pide ? "sí" : "no"}; sin código el botón ${deshabSin ? "está deshabilitado" : "NO está deshabilitado"}; código ${cod ? "visto" : "no"}; tras anular neto ${pesos(suma(cs))} (${cs.length} renglones); auditoría ${audit}; recobrado: neto ${pesos(suma(fin))}`, ref: "src/app/admin/(dashboard)/turnos/_agenda/TurnoCajon.tsx:368-378" };
  });

  // 15 ★ Cambio de recepción; la cookie de R1 a las 17:00
  let r2;
  await paso("15", "14:00", "R1 → R2 1440", async () => {
    const galletas = await r1.ctx.cookies();
    const sesion = galletas.find((c) => c.httpOnly && c.name !== "__reloj");
    const vence = sesion ? new Date(sesion.expires * 1000) : null;
    r2 = await persona("r2", USUARIOS.r2, 1440);
    await agenda(r2);
    await foto("15", r2, "R2 entra a las 14:00: agenda de la tarde");
    // ¿Qué pasa con el token de R1 a las 17:00 y a las 23:00? (el navegador lo bota a las 8 h; el servidor no)
    const pruebas = [];
    for (const h of ["17:00", "23:30"]) {
      await reloj(h);
      const cx = await contexto(b, e.url, 1440);
      await cx.addCookies([{ name: sesion.name, value: sesion.value, url: e.url }]);
      const px = await cx.newPage();
      await ir(px, e.url, "/admin/turnos");
      pruebas.push(`${h}: ${px.url().replace(e.url, "")}`);
      await cx.close();
    }
    await reloj("14:00");
    const vivo = pruebas.every((x) => /\/admin\/turnos$/.test(x));
    return { estado: vivo ? "FALLA" : "OK", visto: `cookie «${sesion?.name}» con vencimiento del navegador ${vence ? vence.toISOString() : "?"} (8 h reales); el token sigue entrando: ${pruebas.join("; ")} — el servidor no lo vence`, ref: "src/lib/ingreso.server.ts:25 · src/lib/auth.ts:61-63" };
  });

  // 16 ★ Prof B cobra aparte un turno de uñas → ¿entra al libro del local?
  const profB = await persona("profB", USUARIOS.profB, 390);
  await paso("16", "15:00", "Prof B 390", async () => {
    const t = s.turnos.b1500;
    const c = await abrirTurno(profB, t);
    const cuanto = c.getByLabel("Cuánto cobrás");
    const sugerido = await c.getByRole("textbox").first().inputValue().catch(() => "?");
    await c.getByRole("group", { name: /^Cobrar/ }).getByRole("button", { name: "Efectivo" }).click();
    await profB.p.waitForTimeout(2500);
    const cs = await cobrosDe(t.id);
    const nuevo = cs.at(-1);
    const mov = nuevo ? await db.cashMovement.findMany({ where: { tenantId, collectionId: nuevo.id }, select: { type: true, method: true, amount: true } }) : [];
    const est = await turnoDb(t.id);
    await foto("16", profB, "Prof B cobra aparte su turno de uñas");
    await cerrarCajon(profB);
    return { estado: mov.length ? "FALLA" : "OK", visto: `sugería ${sugerido}; cobro ${nuevo ? nuevo.method + " " + pesos(Number(nuevo.amount)) : "NINGUNO"}; turno ${est.status}; en el libro del local: ${mov.length ? mov.map((m) => `${m.type}/${m.method} ${pesos(m.amount)}`).join(",") : "no"} (D6: la plata está en el bolsillo de Belén, pero ${mov.length ? "el libro la cuenta como del cajón" : "no entra"})`, ref: "src/app/admin/(dashboard)/turnos/_agenda/TurnoCajon.tsx (cobraEnMostrador) · prisma/schema.prisma:608" };
  });

  // 17 Cancela con 2 h de aviso → política de seña
  await paso("17", "16:00", "R2 1440", async () => {
    const t = s.turnos.a1800;
    const c = await abrirTurno(r2, t);
    await c.getByRole("button", { name: "Cancelar el turno" }).click();
    await r2.p.waitForTimeout(700);
    await opcion(r2.p.getByRole("group", { name: /Quién cancela/ }), "La clienta").click().catch(() => {});
    const hoja = await texto(cajonVisible(r2.p));
    const politica = /hora|aviso|polít/i.test(hoja);
    await foto("17", r2, "Cancelar con 2 h de aviso: qué pasa con la seña (¿hay política?)");
    await r2.p.getByRole("button", { name: "Sí, cancelar el turno" }).click();
    await r2.p.waitForTimeout(2500);
    const est = await turnoDb(t.id); const cs = await cobrosDe(t.id);
    return { estado: est.status === "CANCELLED" ? (politica ? "OK" : "FALLA") : "FALLA", visto: `estado ${est.status}; seña ${pesos(suma(cs))}; la hoja ${politica ? "menciona" : "NO menciona"} una política por horas de aviso (lo decide la recepción a mano)`, ref: "src/app/admin/(dashboard)/turnos/_agenda/CancelarONoVino.tsx:126-146" };
  });

  // 18 ★ Tarjeta → ¿hay medio Tarjeta?
  await paso("18", "17:00", "R2 1440", async () => {
    const t = s.turnos.a1700;
    const c = await abrirTurno(r2, t);
    const medios = await c.getByRole("group", { name: /^Cobrar/ }).getByRole("button").allInnerTexts();
    const tarjeta = medios.some((m) => /tarjeta|débito|crédito/i.test(m));
    await foto("18", r2, "Medios del cobro: sin Tarjeta");
    await c.getByRole("group", { name: /^Cobrar/ }).getByRole("button", { name: "Mercado Pago" }).click();
    await r2.p.waitForTimeout(2000); await cerrarCajon(r2);
    const cs = await cobrosDe(t.id);
    return { estado: tarjeta ? "OK" : "CALLEJÓN", visto: `medios: ${medios.join(" / ")}; la tarjeta se cargó como Mercado Pago (${pesos(suma(cs))} en total con la seña)`, ref: "src/lib/turnos/cobros.ts:286 · prisma/schema.prisma:51-53 (DEBITO/CREDITO tras Gate 2)" };
  });

  // 19 ★ Completar turnos en lote
  await paso("19", "19:30", "R2 1440", async () => {
    await ir(r2.p, e.url, "/admin/turnos/cerrar");
    await arbol(r2.p, "19-cerrar");
    const antes = await texto(r2.p.locator("main"));
    await foto("19b", r2, "Cerrar lo pendiente, antes");
    let toques = 0, cerrados = 0;
    for (let i = 0; i < 12; i++) {
      const vino = r2.p.getByRole("button", { name: /^Vino/ }).filter({ visible: true }).first();
      if (!(await vino.count())) break;
      await vino.click(); toques++;
      await r2.p.waitForTimeout(600);
      const ef = r2.p.getByRole("button", { name: /^Efectivo/ }).filter({ visible: true }).first();
      if (await ef.count()) { await ef.click(); toques++; }
      await r2.p.waitForTimeout(1500); cerrados++;
    }
    await r2.p.waitForTimeout(1000);
    const quedan = await db.appointment.findMany({ where: { tenantId, startsAt: { gte: ar("00:00"), lt: ar("19:30") }, status: { in: ["PENDING", "CONFIRMED"] } }, select: { startsAt: true, professionalId: true } });
    const despues = await texto(r2.p.locator("main"));
    await foto("19", r2, "Cerrar lo pendiente, después");
    const soloB = quedan.every((q) => q.professionalId === s.profB);
    return { estado: quedan.length === 0 || (soloB && /cobra aparte/.test(despues)) ? "OK" : "FALLA", visto: `${cerrados} turnos cerrados con ${toques} toques; quedan sin cerrar ${quedan.length} (${quedan.map((q) => (q.professionalId === s.profB ? "Belén " : "Laura ") + new Date(q.startsAt.getTime() - 3 * 3600000).toISOString().slice(11, 16)).join(", ")}; recepción no los puede cerrar: Belén cobra aparte); pantalla: «${despues.slice(0, 160)}»` };
  });

  // 20 ★ Cierre con $3.000 de menos en efectivo
  let esperadoEf = null;
  await paso("20", "20:00", "Dueña 1440", async () => {
    await ir(duenia.p, e.url, "/admin/caja/cierre");
    await arbol(duenia.p, "20-cierre-antes");
    const ef = duenia.p.getByRole("textbox", { name: /^Efectivo/ });
    await ef.fill("0"); await duenia.p.waitForTimeout(600);
    const dif0 = await texto(duenia.p.getByRole("region", { name: "Diferencia del día" }));
    const m = dif0.match(/\$\s?([\d.]+)/);
    esperadoEf = m ? Number(m[1].replace(/\./g, "")) : null;
    await ef.fill(String((esperadoEf ?? 0) - 3000)); await duenia.p.waitForTimeout(600);
    const dif = await texto(duenia.p.getByRole("region", { name: "Diferencia del día" }));
    const slider = duenia.p.getByRole("slider", { name: /Cerrar el día/ });
    const bloqueadoSinNota = await slider.isDisabled().catch(() => null);
    await duenia.p.getByRole("textbox", { name: /Qué pasó/ }).fill("Faltan $3.000 en el cajón; se revisa con R1 y R2");
    await duenia.p.waitForTimeout(400);
    await foto("20", duenia, "Cierre: diferencia de $3.000 en efectivo, con nota, antes de deslizar");
    await slider.focus(); await duenia.p.keyboard.press("End");
    await duenia.p.waitForTimeout(3000);
    const ajuste = await db.cashMovement.findFirst({ where: { tenantId, reason: { contains: "iferencia" } }, select: { type: true, amount: true, reason: true } });
    const cierre = await db.auditLog.findFirst({ where: { tenantId, OR: [{ entity: { contains: "ierre", mode: "insensitive" } }, { action: { contains: "ierre", mode: "insensitive" } }] }, select: { entity: true, action: true } }).catch(() => null);
    const tras = await texto(duenia.p.locator("main"));
    await foto("20b", duenia, "Cierre confirmado");
    return { estado: ajuste && Math.abs(ajuste.amount) === 3000 ? "OK" : "FALLA", visto: `efectivo esperado ${esperadoEf != null ? pesos(esperadoEf) : "?"}; diferencia mostrada «${dif.slice(0, 90)}»; deslizar ${bloqueadoSinNota ? "bloqueado" : "habilitado"} antes de la nota; asiento ${ajuste ? `${ajuste.type} ${pesos(ajuste.amount)} «${ajuste.reason?.slice(0, 60)}»` : "NINGUNO"}; registro ${cierre ? cierre.entity + "/" + cierre.action : "?"}; pantalla «${tras.slice(0, 100)}»` };
  });

  // 21 ★ El cierre en el celu
  const duenia390 = await persona("duenia390", USUARIOS.duenia, 390);
  await paso("21", "20:05", "Dueña 390", async () => {
    await ir(duenia390.p, e.url, "/admin/caja/cierre");
    const t = await texto(duenia390.p.locator("main"));
    const v = await foto("21", duenia390, "Cierre del día en el celular: el mismo faltante de $3.000");
    return { estado: /3\.000/.test(t) && !v.desborde ? "OK" : "FALLA", visto: `menciona $3.000: ${/3\.000/.test(t) ? "sí" : "no"}; desborde ${v.desborde ? "sí" : "no"}; «${t.slice(0, 140)}»` };
  });

  // 22 ★ Reporte de octubre
  await paso("22", "20:10", "Dueña 1440", async () => {
    await ir(duenia.p, e.url, "/admin/reportes?periodo=mes-pasado");
    await arbol(duenia.p, "22-reportes");
    const t = await texto(duenia.p.locator("main"));
    const oc = s.octubre;
    const ingreso = t.includes(pesos(oc.facturado).replace("$", "$"));
    const aus = t.match(/(\d+) ausencias sobre (\d+)/);
    const medios = ["EFECTIVO", "TRANSFERENCIA", "MERCADOPAGO"].map((k) => [k, t.includes(pesos(oc.porMedio[k]))]);
    await foto("22", duenia, "Reporte de octubre: ingresos, ausencias y medios");
    const ok = ingreso && aus && Number(aus[1]) === oc.noShow && medios.every((m) => m[1]);
    return { estado: ok ? "OK" : "FALLA", visto: `semilla: ${pesos(oc.facturado)}, ${oc.turnos} turnos, ${oc.noShow} no-show, medios EF ${pesos(oc.porMedio.EFECTIVO)} / TR ${pesos(oc.porMedio.TRANSFERENCIA)} / MP ${pesos(oc.porMedio.MERCADOPAGO)}; pantalla: ingresos ${ingreso ? "cuadra" : "NO cuadra"}, ausencias «${aus?.[0] ?? "?"}», medios ${medios.map((m) => m[0].slice(0, 2) + (m[1] ? "✓" : "✗")).join(" ")}` };
  });

  // 23 ★ Comisiones de octubre: liquidar 4 profesionales
  await paso("23", "20:15", "Dueña 1440", async () => {
    await ir(duenia.p, e.url, "/admin/comisiones");
    const lista = await texto(duenia.p.locator("main"));
    await foto("23b", duenia, "Comisiones a liquidar (4 profesionales)");
    let pagadas = 0;
    for (let i = 0; i < 4; i++) {
      await ir(duenia.p, e.url, "/admin/comisiones");
      const pagar = duenia.p.getByRole("link", { name: "Pagar" }).first();
      if (!(await pagar.count())) break;
      await pagar.click(); await duenia.p.waitForTimeout(1200);
      if (i === 0) await arbol(duenia.p, "23-pagar");
      const conf = duenia.p.getByRole("button", { name: /^Marcar pagada/ }).filter({ visible: true }).last();
      if (!(await conf.count())) break;
      await conf.click(); await duenia.p.waitForTimeout(2500); pagadas++;
    }
    const payouts = await db.commissionPayout.findMany({ where: { tenantId }, select: { professionalId: true, amount: true, appointmentCount: true } });
    const egresos = await db.cashMovement.findMany({ where: { tenantId, type: "EGRESO" }, select: { amount: true, reason: true, occurredAt: true, method: true } });
    writeFileSync(path.join(AQUI, "egresos-23.json"), JSON.stringify(egresos, null, 1));
    await ir(duenia.p, e.url, "/admin/comisiones");
    await foto("23", duenia, "Comisiones tras liquidar: «Ya pagadas»");
    const esperado = Object.values(s.octubre.comisionPorProf).reduce((a, x) => a + x, 0);
    const liquidado = payouts.reduce((a, x) => a + x.amount, 0);
    return { estado: payouts.length === 4 && egresos.length >= 4 ? "OK" : "FALLA", visto: `${pagadas} liquidaciones con la UI; payouts ${payouts.length} por ${pesos(liquidado)} (octubre a 40 %: ${pesos(esperado)}, más lo saldado del sábado); egresos en el libro: ${egresos.length}${egresos.length ? " (" + pesos(egresos.reduce((a, x) => a + x.amount, 0)) + ")" : ""}; lista antes: «${lista.slice(0, 160)}»` };
  });

  // 24 ★ Prof A: «¿cuánto me toca?»
  await paso("24", "20:20", "Prof A 390", async () => {
    await ir(profA.p, e.url, "/admin/comisiones");
    const url = profA.p.url().replace(e.url, "");
    const t = await texto(profA.p.locator("main"));
    await foto("24", profA, "Prof A pide sus comisiones: no disponible");
    return { estado: /no-disponible/.test(url) ? "CALLEJÓN" : "OK", visto: `${url}: «${t.slice(0, 120)}»`, ref: "src/lib/capabilities.ts:234 (PROFESSIONAL sin commissions:*)" };
  });

  // 25 Prof B rinde comisión de lo cobrado aparte
  await paso("25", "20:25", "Dueña 1440", async () => {
    await ir(duenia.p, e.url, "/admin/comisiones");
    const t = await texto(duenia.p.locator("main"));
    const hay = /rend|rinde|a rendir|cobró aparte/i.test(t);
    await foto("25", duenia, "Comisiones: nada para que Belén rinda lo cobrado aparte");
    return { estado: hay ? "OK" : "CALLEJÓN", visto: `pantalla de comisiones ${hay ? "menciona" : "no tiene"} rendición de lo cobrado aparte: «${t.slice(0, 120)}»`, ref: "src/app/admin/(dashboard)/comisiones/page.tsx (sin flujo de rendición, D6)" };
  });

  // ── Verificación en la base
  const desde = ar("00:00"), hasta = ar("23:59");
  const cobrosHoy = await db.collection.findMany({ where: { tenantId, createdAt: { gte: desde, lte: hasta } }, select: { appointmentId: true, amount: true, method: true, createdAt: true, idempotencyKey: true } });
  const dup = [];
  const porTurno = new Map();
  for (const c of cobrosHoy) if (c.appointmentId && Number(c.amount) > 0) { const k = `${c.appointmentId}|${c.method}|${Number(c.amount)}`; porTurno.set(k, (porTurno.get(k) ?? 0) + 1); }
  for (const [k, n] of porTurno) if (n > 1) dup.push(`${k} ×${n}`);
  const saldos = [];
  for (const t of await db.appointment.findMany({ where: { tenantId, startsAt: { gte: desde, lte: hasta } }, select: { id: true, status: true, priceAtBooking: true, client: { select: { name: true } }, collections: { select: { amount: true } } } })) {
    const pag = suma(t.collections);
    if (t.status === "COMPLETED" && pag !== (t.priceAtBooking ?? 0)) saldos.push(`${t.client.name}: precio ${pesos(t.priceAtBooking)} pagado ${pesos(pag)}`);
    if (pag > (t.priceAtBooking ?? 0)) saldos.push(`SOBREPAGO ${t.client.name}: ${pesos(pag)}`);
  }
  const libro = await db.cashMovement.groupBy({ by: ["type", "method"], where: { tenantId, occurredAt: { gte: desde, lte: hasta } }, _sum: { amount: true }, _count: true });
  const stock = await db.product.findUnique({ where: { id: s.crema.id }, select: { stock: true } });
  const ventas = await db.stockMovement.count({ where: { tenantId, productId: s.crema.id } }).catch(() => -1);
  const auditoria = await db.auditLog.groupBy({ by: ["entity", "action"], where: { tenantId, createdAt: { gte: desde } }, _count: true });
  const base = { reintentos404, auditoria: auditoria.map((x) => `${x.entity}/${x.action} ×${x._count}`), duplicados: dup, saldos, libro: libro.map((l) => `${l.type}/${l.method} ${pesos(l._sum.amount ?? 0)} (${l._count})`), stockCrema: stock.stock, movimientosDeStock: ventas, cobrosDelDia: cobrosHoy.length, efectivoEsperadoEnCierre: esperadoEf };
  writeFileSync(path.join(AQUI, "verificacion-base.json"), JSON.stringify(base, null, 1));
  console.log("· base:", JSON.stringify(base).slice(0, 600));
} finally {
  guardarVisual(path.join(AQUI, "visual.json"));
  writeFileSync(path.join(AQUI, "pasos.json"), JSON.stringify({ filas, capturas }, null, 1));
  writeFileSync(path.join(AQUI, "tabla-visual.md"), tablaVisualMd());
  writeFileSync(path.join(AQUI, "servidor-recorrido.log"), e.logServidor.join(""));
  await b.close().catch(() => {});
  await db.$disconnect();
  await e.cerrar();
}
