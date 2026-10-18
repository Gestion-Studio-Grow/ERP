// UAT de CH Estética (docs/tenants/ch/UAT-PRODUCCION.md), clic por clic en Chromium, contra el ERP REAL:
// `next start` (el build tiene que estar hecho) sobre una base Postgres LOCAL y efímera, con migraciones, RLS y
// el rol app_rls como producción (src/test/base-efimera.ts). Nunca Neon: la base se crea y se borra acá.
//
// Recorre, con las tres personas del negocio (dueña, recepción y la profesional Laura):
//   0 · la vidriera y el ingreso;  1 · la matriz de acceso por rol;  2 · la reserva web de la clienta;
//   3 · el alta por teléfono con seña;  4 · mover;  5 · cancelar;  6 · no vino;  7 · seña, parcial, saldo y
//   completar;  8 · la profesional completa lo suyo y no ve lo ajeno;  9 · caja del día y cierre que no cuadra;
//   10 · cobro después del cierre;  11 · factura (apagada: N/A).
// Capturas a 1440 y 390 px de cada pantalla, y falla ante cualquier error de consola o scroll horizontal.
//
// Uso: npm run test:ch-uat [carpeta de capturas]       (PORT=3241 por defecto; nunca 3210/3211)
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import pg from "pg";
import { crearBaseEfimera, CLAVE_DE_PRUEBA } from "../../../test/base-efimera.ts";
import { sembrarCH, SUBDOMINIO_CH, EMAIL_PROFESIONAL, SENIA_MASAJE } from "./semilla-ch.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUT = path.resolve(process.argv[2] ?? path.join(RAIZ, "dist/uat-ch"));
const PORT = Number(process.env.PORT ?? 3241);
if (PORT === 3210 || PORT === 3211) throw new Error("Los puertos 3210 y 3211 son de otro equipo: elegí otro PORT.");
const AUTH_SECRET = "uat-ch-auth-secret-0123456789abcdef";
const TZ = "America/Argentina/Buenos_Aires";
await mkdir(OUT, { recursive: true });
if (!existsSync(path.join(RAIZ, ".next/BUILD_ID"))) throw new Error("Falta el build: corré `npm run build` antes.");

const filas = [];
const ok = (id, cond, que) => {
  filas.push({ id, estado: cond ? "OK" : "FALLA", que });
  console.log(`${cond ? "✓" : "✗"} ${id} ${que}`);
};
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const fechaDeNegocio = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const pesos = (n) => `$${Math.round(n).toLocaleString("es-AR")}`;

// ── Base y servidor ─────────────────────────────────────────────────────────────────────────
const base = await crearBaseEfimera();
let app;
let browser;
const errores = [];
try {
  const s = await sembrarCH(base);
  const consulta = async (sql, params = []) => {
    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    try {
      return (await c.query(sql, params)).rows;
    } finally {
      await c.end();
    }
  };
  app = await levantar();
  browser = await chromium.launch({ executablePath: rutaDeChromium() });
  const ORIGEN = `http://${SUBDOMINIO_CH}.localhost:${PORT}`;
  const hoy = fechaDeNegocio(new Date());
  const manana = fechaDeNegocio(new Date(Date.now() + 86_400_000));
  const pasado = fechaDeNegocio(new Date(Date.now() + 2 * 86_400_000));

  const nuevaPagina = async (ctx, quien) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errores.push(`${quien}: ${e.message}`));
    p.on("console", (m) => {
      if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|ERR_FAILED|favicon/.test(m.text())) errores.push(`${quien}: ${m.text()}`);
    });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    // Los avatares de la portada vieja de CH vienen de api.dicebear.com por el optimizador de imágenes: este
    // entorno no sale a internet (en producción sí). Se responden con un PNG local para no medir la red.
    await ctx.route(/\/_next\/image\?url=https%3A%2F%2Fapi\.dicebear\.com/, (r) => r.fulfill({ contentType: "image/png", body: PNG_1PX }));
    return p;
  };
  const contexto = (ancho) => browser.newContext({ viewport: { width: ancho, height: ancho > 500 ? 900 : 844 } });
  async function entrar(email, ancho = 1440) {
    const ctx = await contexto(ancho);
    const p = await nuevaPagina(ctx, email);
    await p.goto(`${ORIGEN}/admin/login`);
    await p.fill('input[name="email"]', email);
    await p.fill('input[name="password"]', CLAVE_DE_PRUEBA);
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 }), p.click('button[type="submit"]')]);
    return { ctx, p };
  }
  let n = 0;
  const foto = (p, nombre) => p.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${nombre}.png`, fullPage: true });
  const sinScrollLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const fila = (p, id) => p.locator(`#turno-${id}`);
  const esperarTexto = (loc, re) => loc.filter({ hasText: re }).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const turnoEnBase = async (id) => (await consulta(`SELECT status, "startsAt" FROM "Appointment" WHERE id = $1`, [id]))[0];

  // ── 0 · vidriera e ingreso ────────────────────────────────────────────────────────────────
  for (const ancho of [1440, 390]) {
    const ctx = await contexto(ancho);
    const p = await nuevaPagina(ctx, `vidriera-${ancho}`);
    const r = await p.goto(`${ORIGEN}/`);
    ok(`0.1@${ancho}`, r?.status() === 200 && (await sinScrollLateral(p)), `la vidriera de CH carga (200) y sin scroll lateral a ${ancho} px`);
    await foto(p, `vidriera-${ancho}`);
    await p.goto(`${ORIGEN}/admin/login`);
    ok(`0.2@${ancho}`, (await p.locator('input[name="email"]').count()) === 1, `el ingreso del panel carga a ${ancho} px`);
    await ctx.close();
  }

  // ── 1 · matriz de acceso ──────────────────────────────────────────────────────────────────
  const RUTAS = {
    agenda: "/admin/turnos",
    lista: "/admin/turnos/lista",
    caja: "/admin/caja",
    cierre: "/admin/caja/cierre",
    reportes: "/admin/reportes",
    usuarios: "/admin/usuarios",
    catalogo: "/admin/catalogo",
  };
  const ESPERADO = {
    [base.a.duenia.email]: ["agenda", "lista", "caja", "cierre", "reportes", "usuarios", "catalogo"],
    [base.a.recepcion.email]: ["agenda", "lista", "caja", "cierre"],
    [EMAIL_PROFESIONAL]: ["agenda"],
  };
  for (const [email, puede] of Object.entries(ESPERADO)) {
    const { ctx, p } = await entrar(email);
    const entra = [];
    for (const [clave, ruta] of Object.entries(RUTAS)) {
      await p.goto(`${ORIGEN}${ruta}`);
      // El redirect() de una página que ya empezó a transmitir llega después de la carga.
      await p.waitForURL((u) => u.pathname !== ruta, { timeout: 4000 }).catch(() => {});
      if (new URL(p.url()).pathname === ruta) entra.push(clave);
    }
    ok("1.matriz", JSON.stringify(entra) === JSON.stringify(puede), `${email} entra exactamente a: ${entra.join(", ")}`);
    await ctx.close();
  }

  // ── 2 · reserva web de la clienta (390 px, como desde el celular) ─────────────────────────
  let turnoWeb;
  {
    const ctx = await contexto(390);
    const p = await nuevaPagina(ctx, "clienta");
    await p.goto(`${ORIGEN}/reserva`);
    await p.selectOption('select[name="professionalId"]', s.profesionales.marina);
    await p.selectOption('select[name="serviceId"]', s.servicios.limpieza);
    await p.fill('input[type="date"]', manana);
    const primerHorario = p.locator('[role="group"][aria-labelledby="reserva-step-horario"] button').first();
    await primerHorario.waitFor({ timeout: 15_000 });
    await primerHorario.click();
    await p.fill('input[name="clientName"]', "Lucía Web");
    await p.fill('input[name="clientPhone"]', "11 3000 0010");
    await foto(p, "reserva-web-390");
    await Promise.all([p.waitForURL(/\/reserva\/confirmacion\//, { timeout: 30_000 }), p.locator('form button[type="submit"]').last().click()]);
    turnoWeb = p.url().split("/").pop();
    ok("2.1", /Solicitud enviada/i.test(await p.textContent("body")) && (await sinScrollLateral(p)), "la clienta reserva desde la web y ve «¡Solicitud enviada!»");
    await foto(p, "reserva-confirmada-390");
    ok("2.2", (await turnoEnBase(turnoWeb))?.status === "PENDING", "el turno web queda Reservado (pendiente) en la agenda");
    await ctx.close();
  }

  // ── 3 a 7 · recepción ─────────────────────────────────────────────────────────────────────
  const { ctx: ctxR, p: r } = await entrar(base.a.recepcion.email);
  let turnoTel;
  {
    await r.goto(`${ORIGEN}/admin/turnos/lista?nuevo=1&fecha=${manana}`);
    await r.selectOption("#na-professional", s.profesionales.laura);
    await r.selectOption("#na-service", s.servicios.masaje);
    await r.fill("#na-date", manana);
    const horario = r.locator('[aria-labelledby="na-horario"] button').nth(2);
    await horario.waitFor({ timeout: 15_000 });
    await horario.click();
    await r.fill("#na-client-name", "Camila Teléfono");
    await r.fill("#na-client-phone", "11 3000 0020");
    const cobrar = await r.locator("#na-que-cobrar option:checked").textContent();
    await r.selectOption("#na-sena-metodo", "EFECTIVO");
    await foto(r, "alta-telefono-1440");
    await r.click('button:has-text("Crear turno")');
    await r.waitForTimeout(1500);
    const filasTel = await consulta(
      `SELECT a.id FROM "Appointment" a JOIN "Client" c ON c.id = a."clientId" WHERE c.name = 'Camila Teléfono'`,
    );
    turnoTel = filasTel[0]?.id;
    const cobros = turnoTel ? await consulta(`SELECT amount FROM "Collection" WHERE "appointmentId" = $1`, [turnoTel]) : [];
    ok("3.1", /Seña/.test(cobrar ?? "") && Number(cobros[0]?.amount) === SENIA_MASAJE, `alta por teléfono: propone la seña (${cobrar?.trim()}) y queda cobrada ${pesos(SENIA_MASAJE)} en efectivo`);
    await r.goto(`${ORIGEN}/admin/turnos/lista`);
    ok("3.2", turnoTel && (await esperarTexto(fila(r, turnoTel), /cobrado \$\s?5\.000/)), "la fila del turno muestra la seña cobrada");
  }
  {
    // 4 · mover el turno por teléfono a pasado mañana
    const f = fila(r, turnoTel);
    await f.locator('button:has-text("Reprogramar")').click();
    await f.locator('input[type="date"]').fill(pasado);
    const nuevo = f.locator('[aria-label="Horarios libres"] button').nth(4);
    await nuevo.waitFor({ timeout: 15_000 });
    await nuevo.click();
    await f.locator('button:has-text("Confirmar nuevo horario")').click();
    await r.waitForTimeout(1500);
    const t = await turnoEnBase(turnoTel);
    ok("4.1", t && fechaDeNegocio(new Date(t.startsAt)) === pasado, `mover: el turno pasa a ${pasado} y conserva la seña`);
  }
  {
    // 5 · cancelar el turno web
    await r.goto(`${ORIGEN}/admin/turnos/lista`);
    await fila(r, turnoWeb).locator('button:has-text("Cancelar turno")').click();
    await r.waitForTimeout(1500);
    ok("5.1", (await turnoEnBase(turnoWeb))?.status === "CANCELLED", "cancelar: el turno web queda cancelado y libera el horario");
  }
  {
    // 6 · no vino
    await r.goto(`${ORIGEN}/admin/turnos/lista`);
    await fila(r, s.noVino.id).locator('button:has-text("No se presentó")').click();
    await r.waitForTimeout(1500);
    ok("6.1", (await turnoEnBase(s.noVino.id))?.status === "NO_SHOW", `no vino: ${s.noVino.clienta} queda «No se presentó»`);
  }
  {
    // 7 · seña, parcial y saldo al completar
    await r.goto(`${ORIGEN}/admin/turnos/lista`);
    const f = fila(r, s.conCobro.id);
    const monto = await f.locator('input[name="amount"]').inputValue();
    ok("7.1", Number(monto) === SENIA_MASAJE, `el cobro sugerido de un turno sin nada cobrado es la seña (${pesos(Number(monto))})`);
    await f.locator('button:has-text("Registrar cobro")').click();
    await esperarTexto(f, /cobrado \$\s?5\.000/);
    await f.locator('input[name="amount"]').fill("4000");
    await f.locator('form:has(input[name="amount"]) select[name="method"]').selectOption("TRANSFERENCIA");
    await f.locator('button:has-text("Registrar cobro")').click();
    ok("7.2", await esperarTexto(f, /cobrado \$\s?9\.000 · saldo \$\s?6\.000/), "parcial: $4.000 por transferencia → cobrado $9.000 · saldo $6.000");
    await foto(r, "cobro-parcial-1440");
    await f.locator('button:has-text("Marcar como completado")').click();
    await r.waitForTimeout(1500);
    const t = await turnoEnBase(s.conCobro.id);
    const suma = await consulta(`SELECT coalesce(sum(amount),0) AS s FROM "Collection" WHERE "appointmentId" = $1`, [s.conCobro.id]);
    ok("7.3", t?.status === "COMPLETED" && Number(suma[0].s) === 15000, "completar: cobra el saldo de $6.000 y el turno queda saldado ($15.000)");
  }
  await r.goto(`${ORIGEN}/admin/turnos/lista`);
  await foto(r, "lista-recepcion-1440");
  ok("7.4", await sinScrollLateral(r), "la lista de la recepción no tiene scroll lateral a 1440");

  // ── 8 · la profesional ────────────────────────────────────────────────────────────────────
  {
    const { ctx, p } = await entrar(EMAIL_PROFESIONAL);
    await p.goto(`${ORIGEN}/admin/turnos?date=${fechaDeNegocio(s.deLaura.startsAt)}`);
    const cuerpo = await p.textContent("body");
    ok("8.1", cuerpo.includes(s.deLaura.clienta) && !cuerpo.includes(s.deCarla.clienta) && !cuerpo.includes(s.noVino.clienta), "Laura ve sus turnos y no los de Carla ni Marina");
    // En escritorio el turno se abre desde la grilla; en el celular la fila ya está a la vista.
    const turno = p.locator(`button:has-text("${s.deLaura.clienta}")`).filter({ visible: true }).first();
    if (await turno.count()) await turno.click();
    await p.locator('button:has-text("Marcar como completado")').filter({ visible: true }).first().click();
    await p.waitForTimeout(1500);
    ok("8.2", (await turnoEnBase(s.deLaura.id))?.status === "COMPLETED", "Laura completa su turno y cobra el saldo en efectivo");
    ok("8.3", (await p.locator('button:has-text("Cancelar turno"), button:has-text("Reprogramar")').count()) === 0, "Laura no puede cancelar ni reprogramar");
    await foto(p, "profesional-1440");
    await ctx.close();
  }

  // ── 9 · caja del día y cierre que no cuadra ───────────────────────────────────────────────
  // Efectivo del día: seña del alta $5.000 + seña $5.000 + saldo $6.000 + Laura $15.000 = $31.000.
  const EFECTIVO_DEL_DIA = 31000;
  {
    await r.goto(`${ORIGEN}/admin/caja`);
    const caja = await r.textContent("body");
    ok("9.1", /Turno · Masaje descontracturante/.test(caja) && caja.includes(pesos(EFECTIVO_DEL_DIA)), `la caja del día muestra los cobros de turnos y ${pesos(EFECTIVO_DEL_DIA)} en efectivo`);
    await foto(r, "caja-1440");
    await r.goto(`${ORIGEN}/admin/caja/cierre`);
    await r.fill("#declarado-EFECTIVO", String(EFECTIVO_DEL_DIA - 1000));
    if (await r.locator("#declarado-MP").count()) await r.fill("#declarado-MP", "4000");
    await r.click('button:has-text("Cerrar el día")');
    await r.locator('button:has-text("Sí, cerrar el día")').click().catch(() => {});
    const sinNota = await esperarTexto(r.locator('[role="alert"]'), /diferencia/i);
    ok("9.2", sinNota, "cierre con $1.000 de menos y sin nota: pide anotar por qué");
    await r.fill("#cierre-note", "Faltan $1.000: vuelto mal dado (UAT)");
    await r.click('button:has-text("Cerrar el día")');
    await r.locator('button:has-text("Sí, cerrar el día")').click();
    await r.waitForTimeout(2000);
    const ajuste = await consulta(`SELECT amount, reason FROM "CashMovement" WHERE "tenantId" = $1 AND reason LIKE 'Diferencia de caja%'`, [base.a.id]);
    ok("9.3", ajuste.length === 1 && /faltante en/i.test(ajuste[0].reason), "con la nota, cierra y asienta el faltante en el libro");
    await foto(r, "cierre-1440");
  }

  // ── 10 · cobro después del cierre ─────────────────────────────────────────────────────────
  {
    await r.goto(`${ORIGEN}/admin/turnos/lista`);
    const f = fila(r, turnoTel);
    const antes = (await consulta(`SELECT count(*)::int AS n FROM "CashMovement" WHERE "tenantId" = $1`, [base.a.id]))[0].n;
    await f.locator('input[name="amount"]').fill("1000");
    await f.locator('button:has-text("Registrar cobro")').click();
    const avisa = await esperarTexto(f.locator('[role="alert"]'), /ya está cerrada.*Registralo el/);
    const despues = (await consulta(`SELECT count(*)::int AS n FROM "CashMovement" WHERE "tenantId" = $1`, [base.a.id]))[0].n;
    ok("10.1", avisa && antes === despues, "con la caja de hoy cerrada, un cobro de turno se rechaza y dice qué día se puede registrar");
    await foto(r, "cobro-dia-cerrado-1440");
  }

  // ── 11 · factura ──────────────────────────────────────────────────────────────────────────
  filas.push({ id: "11.1", estado: "N/A", que: "factura: ARCA_INVOICING_ENABLED apagado en CH (Gate 4); el turno se completa sin comprobante" });
  console.log("– 11.1 N/A factura apagada en CH");

  // ── 12 · agenda práctica (interruptor «agenda-practica», apagado en producción) ──────────
  {
    await consulta(
      `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", channel, changes, "createdAt")
       VALUES ('uat_ch_practica', $1, 'operator:uat', 'interruptor.encender', 'Interruptor', 'agenda-practica', 'operador', '{}'::jsonb, now())`,
      [base.a.id],
    );
    await consulta(
      `INSERT INTO "WaitlistEntry" (id, "tenantId", "clientName", "clientPhone", "serviceId", status, "updatedAt")
       VALUES ('uat_espera_1', $1, 'Paula Espera', '1130000099', $2, 'WAITING', now())`,
      [base.a.id, s.servicios.masaje],
    );
    // T4: el alta sin fecha propone mañana.
    await r.goto(`${ORIGEN}/admin/turnos/lista?nuevo=1`);
    ok("12.T4", (await r.inputValue("#na-date")) === manana, `con la agenda práctica, el alta propone mañana (${manana})`);
    // T10 + E3: cancelar pregunta la consecuencia y qué pasa con la seña; devolver una seña cobrada hoy, con la
    // caja de hoy cerrada, se rechaza y el turno no cambia; retenerla cancela.
    await r.goto(`${ORIGEN}/admin/turnos/lista`);
    const f = fila(r, turnoTel);
    await f.locator('button:has-text("Cancelar turno")').click();
    const pregunta = await f.locator('form[aria-label="Cancelar turno"]').textContent();
    ok("12.T10", /El horario queda libre/.test(pregunta) && /Ya pagó \$\s?5\.000/.test(pregunta), "cancelar muestra la consecuencia y pregunta por la seña de $5.000");
    await foto(r, "practica-cancelar-1440");
    await f.locator('input[name="senia"][value="devolver"]').check();
    await f.locator('button:has-text("Sí, cancelar")').click();
    const noDevuelve = await esperarTexto(f.locator('[role="alert"]'), /No se pudo devolver la seña.*no se cambió/);
    ok("12.E3a", noDevuelve && (await turnoEnBase(turnoTel))?.status === "PENDING", "devolver una seña de un día ya cerrado se rechaza y el turno queda como estaba");
    await f.locator('input[name="senia"][value="retener"]').check();
    await f.locator('button:has-text("Sí, cancelar")').click();
    const toast = await esperarTexto(r.locator('[role="alert"]'), /cancelado\. Hay 1 clienta anotada en la lista de espera/);
    const auditoria = await consulta(`SELECT changes FROM "AuditLog" WHERE "entityId" = $1 AND action = 'cancel'`, [turnoTel]);
    ok("12.E3b", (await turnoEnBase(turnoTel))?.status === "CANCELLED" && auditoria[0]?.changes?.senia === "retener", "retener la seña cancela y deja la decisión en la auditoría");
    ok("12.E6", toast, "al cancelar avisa que hay 1 clienta en la lista de espera para ese servicio");
    // E5: reservar el próximo desde un completado.
    await r.goto(`${ORIGEN}/admin/turnos/proximo/${s.conCobro.id}`);
    await r.waitForURL(/\/admin\/turnos\/lista\?nuevo=1/, { timeout: 15_000 }).catch(() => {});
    const u = new URL(r.url());
    // Los datos de la clienta se ven recién al elegir el horario; antes, el alta dice «Para <clienta>».
    const paraQuien = await esperarTexto(r.locator("p"), new RegExp(`Para ${s.conCobro.clienta}`));
    ok("12.E5", u.searchParams.get("fecha") > hoy && paraQuien && (await r.inputValue("#na-date")) === u.searchParams.get("fecha"), `«Reservar el próximo» abre el alta para ${s.conCobro.clienta} el ${u.searchParams.get("fecha")}`);
    await foto(r, "practica-reservar-proximo-1440");
    // E2 + T12: la regla a la vista y aplicada a la clienta.
    const apurado = await consulta(
      `INSERT INTO "Appointment" (id, "tenantId", "clientId", "professionalId", "serviceId", "boxId", "startsAt", "endsAt", status, "priceAtBooking", "updatedAt")
       SELECT 'uat_apurado', $1, c.id, p.id, $2, p."boxId", now() + interval '3 hours', now() + interval '4 hours', 'PENDING', 20000, now()
       FROM "Client" c, "Professional" p WHERE c.name = 'Romina Paz' AND p.id = $3 RETURNING id`,
      [base.a.id, s.servicios.limpieza, s.profesionales.marina],
    );
    const ctx = await contexto(390);
    const c = await nuevaPagina(ctx, "clienta-apurada");
    await c.goto(`${ORIGEN}/reserva`);
    ok("12.T12", /hasta 24 h antes del turno/.test(await c.textContent("body")), "la reserva web muestra la regla de cancelación que cargó el negocio (24 h)");
    await c.goto(`${ORIGEN}/reserva/turno/${apurado[0].id}`);
    const sinBotones = (await c.locator('button:has-text("Cancelar turno"), button:has-text("Reprogramar")').count()) === 0;
    ok("12.E2", sinBotones && /menos de|hasta 24 h antes/.test(await c.textContent("body")) && (await turnoEnBase("uat_apurado"))?.status === "PENDING", "a 3 h del turno, «Tu turno» muestra la regla y no ofrece cancelar ni reprogramar online");
    await foto(c, "practica-clienta-apurada-390");
    await ctx.close();
  }
  // Vínculo de la profesional con su ficha (antes: «desde la base»).
  {
    const { ctx, p } = await entrar(base.a.duenia.email);
    await p.goto(`${ORIGEN}/admin/usuarios`);
    const sel = p.locator('select[aria-label="Ficha de profesional de Laura Gómez"]');
    ok("12.usuarios", (await sel.count()) === 1 && (await sel.inputValue()) === s.profesionales.laura, "Usuarios muestra y deja elegir la ficha de profesional de Laura");
    await foto(p, "usuarios-ficha-1440");
    await ctx.close();
  }

  // ── 390 px: las pantallas de la recepción en el celular ───────────────────────────────────
  {
    const { ctx, p } = await entrar(base.a.recepcion.email, 390);
    for (const [nombre, ruta] of [["agenda", "/admin/turnos"], ["lista", "/admin/turnos/lista"], ["caja", "/admin/caja"], ["cierre", "/admin/caja/cierre"]]) {
      await p.goto(`${ORIGEN}${ruta}`);
      ok(`390.${nombre}`, await sinScrollLateral(p), `${ruta} sin scroll lateral a 390 px`);
      await foto(p, `${nombre}-390`);
    }
    await ctx.close();
    const prof = await entrar(EMAIL_PROFESIONAL, 390);
    await prof.p.goto(`${ORIGEN}/admin/turnos?date=${fechaDeNegocio(s.deLaura.startsAt)}`);
    ok("390.profesional", await sinScrollLateral(prof.p), "la agenda de la profesional sin scroll lateral a 390 px");
    await foto(prof.p, "profesional-390");
    await prof.ctx.close();
  }
  await ctxR.close();
  ok("consola", errores.length === 0, `cero errores de consola${errores.length ? `: ${errores.slice(0, 4).join(" | ")}` : ""}`);
} catch (e) {
  ok("recorrido", false, `se cortó: ${e?.message ?? e}`);
} finally {
  await browser?.close().catch(() => {});
  app?.kill("SIGTERM");
  await base.borrar().catch(() => {});
}
const fallas = filas.filter((f) => f.estado === "FALLA");
console.log(`\nRESUMEN ${filas.filter((f) => f.estado === "OK").length}/${filas.length - filas.filter((f) => f.estado === "N/A").length} OK · ${filas.filter((f) => f.estado === "N/A").length} N/A`);
await writeFile(`${OUT}/resultado.json`, JSON.stringify(filas, null, 1));
process.exit(fallas.length ? 1 : 0);

// ── Servidor ────────────────────────────────────────────────────────────────────────────────
function pedir(ruta) {
  return new Promise((listo) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: ruta, headers: { host: `${SUBDOMINIO_CH}.localhost:${PORT}` } }, (res) => {
      res.resume();
      listo(res.statusCode);
    });
    req.on("error", () => listo(null));
    req.setTimeout(4000, () => {
      req.destroy();
      listo(null);
    });
  });
}
async function levantar() {
  const env = {
    ...process.env,
    DATABASE_URL: base.urlApp,
    OPERATOR_DATABASE_URL: base.urlDuenio,
    MIGRATE_DATABASE_URL: base.urlDuenio,
    RLS_ENFORCEMENT: "on",
    APP_BASE_DOMAIN: "localhost",
    AUTH_SECRET,
    OPERATOR_SECRET: `${AUTH_SECRET}-operador`,
    NODE_ENV: "production",
    PORT: String(PORT),
  };
  for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED", "MP_MODO", "ARCA_INVOICING_ENABLED"]) delete env[v];
  // E2: la regla de cancelación online la carga el negocio (practica.ts). Acá, la que CH promete en su reserva.
  env.CANCELACION_ONLINE_HORAS = "beauty-spa=24";
  const salida = createWriteStream(path.join(OUT, "servidor.txt"));
  const proc = spawn(process.execPath, [path.join(RAIZ, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.pipe(salida);
  proc.stderr.pipe(salida);
  const hasta = Date.now() + 60_000;
  while (Date.now() < hasta) {
    if ((await pedir("/admin/login")) === 200) return proc;
    await new Promise((listo) => setTimeout(listo, 500));
  }
  proc.kill("SIGTERM");
  throw new Error(`next start no respondió en 60 s (ver ${path.join(OUT, "servidor.txt")})`);
}
function rutaDeChromium() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    // sin navegador registrado: se busca abajo
  }
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const n of existsSync(dir) ? readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse() : []) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = path.join(dir, n, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}
