/**
 * Subir precios de servicios y Mi negocio (reingeniería CH, Tanda 3 · 3-D) EJECUTADOS contra Postgres
 * local en una base EFÍMERA propia (src/test/base-efimera.ts: todas las migraciones del repo, RLS
 * 0002 + 0001, rol `app_rls`) — nunca Neon. Las Server Actions corren TAL CUAL, con la sesión de la
 * dueña o de la recepción (src/test/accion-de-servidor.ts).
 *
 *   1. CON las migraciones de la Tanda 3 (M2 reglas, M3 combos): CH-039 (los 12 de Depilación +8 % a
 *      $500, una auditoría por servicio, «Último aumento: hace 0 días (+8 %)»), CH-051 (el turno
 *      conserva `priceAtBooking`), CH-052 (la recepción no puede), CH-064 (el otro negocio no cambia),
 *      huella («El catálogo cambió, volvé a mirar»), confirmación > 30 %, doble envío idempotente y dos
 *      «Aplicar» a la vez (uno solo escribe). Mi negocio: graba por tenantId con auditoría, la
 *      recepción no puede, el otro negocio no cambia (CH-068).
 *   2. SIN las migraciones: en ESTA base efímera se sacan las columnas de M2 y M3 (lo que producción
 *      no tiene hoy). Mi negocio cae al placeholder D2/D5 y no graba (CH-053); el aumento anda igual y
 *      sigue sin tocar turnos.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import type { PedidoAumentoServicios, ServicioParaAumento } from "./aumento-servicios";

const id = (p: string) => `${p}_${randomBytes(5).toString("hex")}`;

async function sql(url: string, texto: string, valores: unknown[] = []) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await c.query(texto, valores);
  } finally {
    await c.end();
  }
}

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

test("CH 3-D · Subir precios de servicios y Mi negocio, con y sin las migraciones de la Tanda 3", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { aplicarAumentoServicios } = await import("./aumento-servicios-actions");
  const { planificarAumentoServicios } = await import("./aumento-servicios");
  const { cargarServiciosParaAumento, cargarUltimoAumentoServicios } = await import("./aumento-servicios-tx");
  const { guardarMiNegocio } = await import("@/app/admin/(dashboard)/configuracion/mi-negocio/actions");
  const { cargarReglasDelMostrador } = await import("@/lib/mi-negocio/mi-negocio.server");
  const { REGLAS_POR_DEFECTO } = await import("@/lib/settings");
  const { todayInBusinessTz } = await import("@/lib/datetime");

  const { a: A, b: B, urlDuenio } = base;
  const comoDuenia = { negocio: A, usuario: A.duenia };
  const comoRecepcion = { negocio: A, usuario: A.recepcion };

  // ── Siembra (como dueño de las tablas, exento de RLS: como un seed) ──
  const depi = id("cat");
  const otraCat = id("cat");
  await sql(urlDuenio, `INSERT INTO "ServiceCategory" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Depilación', now()), ($3, $2, 'Faciales', now())`, [depi, A.id, otraCat]);
  const precios = [6000, 4000, 8000, 11000, 12000, 9000, 7000, 10000, 9500, 14000, 7500, 5000];
  const deA: string[] = [];
  for (const [i, precio] of precios.entries()) {
    const s = id("srv");
    deA.push(s);
    await sql(
      urlDuenio,
      `INSERT INTO "Service" (id, "tenantId", "categoryId", name, "durationMin", price, "residentPrice", "depositAmount", "updatedAt")
       VALUES ($1, $2, $3, $4, 30, $5, $6, $7, '2026-10-01T12:00:00Z')`,
      [s, A.id, depi, `Depilación ${i + 1}`, precio, i === 9 ? 12000 : null, i === 9 ? 5000 : null],
    );
  }
  const piernas = deA[9]; // $14.000, vecina $12.000, seña $5.000
  const facial = id("srv");
  await sql(urlDuenio, `INSERT INTO "Service" (id, "tenantId", "categoryId", name, "durationMin", price, "updatedAt") VALUES ($1, $2, $3, 'Limpieza facial', 60, 20000, '2026-10-01T12:00:00Z')`, [facial, A.id, otraCat]);
  const deB = id("srv");
  await sql(urlDuenio, `INSERT INTO "Service" (id, "tenantId", name, "durationMin", price, "updatedAt") VALUES ($1, $2, 'Piernas de B', 30, 14000, '2026-10-01T12:00:00Z')`, [deB, B.id]);
  // Un turno ya dado de Piernas completas con su precio congelado (CH-051).
  const box = id("box");
  const pro = id("pro");
  const turno = id("apt");
  await sql(urlDuenio, `INSERT INTO "Box" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Box 1', now())`, [box, A.id]);
  await sql(urlDuenio, `INSERT INTO "Professional" (id, "tenantId", name, "boxId", "updatedAt") VALUES ($1, $2, 'Caro', $3, now())`, [pro, A.id, box]);
  await sql(
    urlDuenio,
    `INSERT INTO "Appointment" (id, "tenantId", "clientId", "professionalId", "serviceId", "boxId", "startsAt", "endsAt", "priceAtBooking", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, '2026-11-02T13:00:00Z', '2026-11-02T13:30:00Z', 14000, '2026-10-01T12:00:00Z')`,
    [turno, A.id, A.clientes[0], pro, piernas, box],
  );

  const servicio = async (s: string) =>
    (await sql(urlDuenio, `SELECT price, "residentPrice", "depositAmount", "updatedAt" FROM "Service" WHERE id = $1`, [s])).rows[0] as {
      price: number;
      residentPrice: number | null;
      depositAmount: number | null;
      updatedAt: Date;
    };
  const elTurno = async () => (await sql(urlDuenio, `SELECT "priceAtBooking"::text AS p, "updatedAt" FROM "Appointment" WHERE id = $1`, [turno])).rows[0];
  const auditorias = async () =>
    Number((await sql(urlDuenio, `SELECT count(*)::int AS n FROM "AuditLog" WHERE entity = 'Service' AND action = 'cambio-de-precio'`)).rows[0].n);
  /** Lo que ve la pantalla de la dueña (la página carga con RLS y la sesión de A). */
  const verPantalla = async (): Promise<ServicioParaAumento[]> => {
    const r = await ejecutarAccion(comoDuenia, () => cargarServiciosParaAumento(A.id));
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: ServicioParaAumento[] }).valor;
  };
  const pedido = (p: Partial<PedidoAumentoServicios> = {}): PedidoAumentoServicios => ({
    alcance: { tipo: "categoria", categoryId: depi },
    porcentaje: "8",
    redondeo: 500,
    senia: true,
    vecina: true,
    ...p,
  });
  const aplicar = (quien: typeof comoDuenia, p: PedidoAumentoServicios, huella: string, confirmado = false, clave: string = randomUUID()) =>
    ejecutarAccion(quien, () => aplicarAumentoServicios(p, huella, confirmado, clave));

  const turnoAntes = await elTurno();
  const bAntes = await servicio(deB);

  await t.test("la pantalla ve sólo los servicios de A (RLS + tenantId)", async () => {
    const vistos = await verPantalla();
    assert.equal(vistos.length, 13);
    assert.ok(!vistos.some((s) => s.id === deB));
  });

  await t.test("CH-052 · la recepción no sube precios: se rechaza y nada cambia", async () => {
    const plan = planificarAumentoServicios(await verPantalla(), pedido());
    const r = await aplicar(comoRecepcion, pedido(), plan.huella);
    assert.equal(r.tipo, "respuesta");
    const v = (r as { valor: { ok: boolean; mensaje?: string } }).valor;
    assert.equal(v.ok, false);
    assert.ok(v.mensaje && v.mensaje.length > 0);
    assert.equal((await servicio(piernas)).price, 14000);
    assert.equal(await auditorias(), 0);
  });

  await t.test("huella vieja · otro cambió un precio entre la vista previa y el Aplicar → «El catálogo cambió, volvé a mirar»", async () => {
    const plan = planificarAumentoServicios(await verPantalla(), pedido());
    await sql(urlDuenio, `UPDATE "Service" SET price = 6010 WHERE id = $1`, [deA[0]]); // «otro» la tocó
    const r = await aplicar(comoDuenia, pedido(), plan.huella);
    const v = (r as { valor: { ok: boolean; catalogoCambio?: true; mensaje?: string } }).valor;
    assert.equal(v.ok, false);
    assert.equal(v.catalogoCambio, true);
    assert.match(v.mensaje ?? "", /^El catálogo cambió, volvé a mirar/);
    assert.equal((await servicio(piernas)).price, 14000, "no se escribió nada");
    assert.equal(await auditorias(), 0);
    await sql(urlDuenio, `UPDATE "Service" SET price = 6000, "updatedAt" = '2026-10-01T12:00:00Z' WHERE id = $1`, [deA[0]]);
  });

  await t.test("más del 30 % sin la segunda confirmación → se pide y no se escribe", async () => {
    const p = pedido({ porcentaje: "35" });
    const plan = planificarAumentoServicios(await verPantalla(), p);
    const r = await aplicar(comoDuenia, p, plan.huella, false);
    const v = (r as { valor: { ok: boolean; pideConfirmacion?: true } }).valor;
    assert.deepEqual([v.ok, v.pideConfirmacion], [false, true]);
    assert.equal(await auditorias(), 0);
  });

  const clave = randomUUID();
  await t.test("CH-039 · +8 % a $500: cambian los 12 con una auditoría cada uno; CH-051 el turno conserva su precio; CH-064 B intacto", async () => {
    const plan = planificarAumentoServicios(await verPantalla(), pedido());
    assert.equal(plan.filas.length, 12);
    const r = await aplicar(comoDuenia, pedido(), plan.huella, false, clave);
    assert.equal(r.tipo, "respuesta");
    assert.deepEqual((r as { valor: unknown }).valor, { ok: true, cambiados: 12 });
    const p = await servicio(piernas);
    assert.deepEqual([p.price, p.residentPrice, p.depositAmount], [15500, 13000, 5500]);
    for (const [i, s] of deA.entries()) assert.equal((await servicio(s)).price, plan.filas.find((f) => f.serviceId === s)!.precio.despues, `servicio ${i + 1}`);
    assert.equal((await servicio(facial)).price, 20000, "otra categoría no cambia");
    assert.equal(await auditorias(), 12);
    const filas = (await sql(urlDuenio, `SELECT "tenantId", "entityId", actor, changes FROM "AuditLog" WHERE entity = 'Service' ORDER BY "entityId"`)).rows;
    assert.deepEqual(new Set(filas.map((f) => f.entityId)), new Set(deA));
    for (const f of filas) {
      assert.equal(f.tenantId, A.id);
      assert.equal(f.actor, `user:${A.duenia.id}`);
      assert.equal(f.changes.lote.id, clave);
      assert.equal(f.changes.lote.porcentaje, 8);
    }
    // CH-051: el turno ya dado sigue en $14.000 y no se tocó.
    assert.deepEqual(await elTurno(), turnoAntes);
    // CH-064: el servicio de B no cambió (ni el precio ni `updatedAt`).
    assert.deepEqual(await servicio(deB), bAntes);
    // «Último aumento: hace 0 días (+8 %)».
    const u = await ejecutarAccion(comoDuenia, () => cargarUltimoAumentoServicios(A.id, todayInBusinessTz()));
    assert.deepEqual((u as { valor: unknown }).valor, { dias: 0, porcentaje: 8 });
    const deOtro = await ejecutarAccion({ negocio: B, usuario: B.duenia }, () => cargarUltimoAumentoServicios(B.id, todayInBusinessTz()));
    assert.equal((deOtro as { valor: unknown }).valor, null, "B no ve el aumento de A");
  });

  await t.test("doble envío del mismo Aplicar (misma clave) → no aplica dos veces", async () => {
    const plan = planificarAumentoServicios(await verPantalla(), pedido());
    const r = await aplicar(comoDuenia, pedido(), plan.huella, false, clave);
    assert.deepEqual((r as { valor: unknown }).valor, { ok: true, cambiados: 12, yaEstaba: true });
    assert.equal((await servicio(piernas)).price, 15500);
    assert.equal(await auditorias(), 12);
  });

  await t.test("dos Aplicar a la vez (dos pestañas, claves distintas): uno solo escribe", async () => {
    const plan = planificarAumentoServicios(await verPantalla(), pedido({ porcentaje: "10", senia: false, vecina: false }));
    const p = pedido({ porcentaje: "10", senia: false, vecina: false });
    const [r1, r2] = await Promise.all([aplicar(comoDuenia, p, plan.huella), aplicar(comoDuenia, p, plan.huella)]);
    const vs = [r1, r2].map((r) => (r as { valor: { ok: boolean; catalogoCambio?: true } }).valor);
    assert.equal(vs.filter((v) => v.ok).length, 1, JSON.stringify(vs));
    assert.equal(vs.filter((v) => v.catalogoCambio).length, 1);
    assert.equal((await servicio(piernas)).price, 17500); // 15.500 × 1,10 = 17.050 → 17.500, UNA vez
    assert.equal(await auditorias(), 24);
    assert.deepEqual(await elTurno(), turnoAntes);
  });

  // ── Mi negocio, con M2 ──
  await t.test("CH-068 · Mi negocio con la migración: la dueña graba por tenantId con auditoría; B no cambia", async () => {
    const campos = { aliasSenia: "ch.estetica.mp", cbuSenia: "", cancelacionHoras: "12", seniaCancelaTarde: "a-favor", seniaNoVino: "retener", topeBajaSaldoRecepcion: "0" };
    const r = await ejecutarAccion(comoDuenia, () => guardarMiNegocio({ estado: "inicial", mensaje: "" }, form(campos)));
    assert.equal((r as { valor: { estado: string } }).valor.estado, "ok");
    const leidas = await ejecutarAccion(comoDuenia, () => cargarReglasDelMostrador(A.id));
    const v = (leidas as { valor: { reglas: Record<string, unknown>; alias: string | null } }).valor;
    assert.equal(v.reglas.activas, true);
    assert.equal(v.reglas.cancelacionHoras, 12);
    assert.equal(v.reglas.seniaCancelaTarde, "a-favor");
    assert.equal(v.alias, "ch.estetica.mp", "el alias de Mi negocio es el de los WhatsApp");
    const aud = (await sql(urlDuenio, `SELECT "tenantId", actor, changes FROM "AuditLog" WHERE entity = 'BusinessSettings'`)).rows;
    assert.equal(aud.length, 1);
    assert.equal(aud[0].tenantId, A.id);
    assert.equal(aud[0].changes.despues.aliasSenia, "ch.estetica.mp");
    assert.equal(aud[0].changes.antes.cancelacionHoras, 24);
    // B sigue con el placeholder y sin fila.
    const deBReglas = await ejecutarAccion({ negocio: B, usuario: B.duenia }, () => cargarReglasDelMostrador(B.id));
    assert.deepEqual((deBReglas as { valor: { reglas: unknown } }).valor.reglas, { ...REGLAS_POR_DEFECTO, activas: true });
    assert.equal((await sql(urlDuenio, `SELECT count(*)::int AS n FROM "BusinessSettings" WHERE "tenantId" = $1`, [B.id])).rows[0].n, 0);
  });

  await t.test("Mi negocio: la recepción no cambia las reglas; un formulario inválido no graba", async () => {
    const campos = { aliasSenia: "otro.alias", cbuSenia: "", cancelacionHoras: "1", seniaCancelaTarde: "devolver", seniaNoVino: "devolver", topeBajaSaldoRecepcion: "999999" };
    const r = await ejecutarAccion(comoRecepcion, () => guardarMiNegocio({ estado: "inicial", mensaje: "" }, form(campos)));
    assert.equal((r as { valor: { estado: string } }).valor.estado, "error");
    const malo = await ejecutarAccion(comoDuenia, () => guardarMiNegocio({ estado: "inicial", mensaje: "" }, form({ ...campos, cancelacionHoras: "999" })));
    assert.equal((malo as { valor: { estado: string } }).valor.estado, "error");
    const fila = (await sql(urlDuenio, `SELECT "aliasSenia", "cancelacionHoras" FROM "BusinessSettings" WHERE "tenantId" = $1`, [A.id])).rows[0];
    assert.deepEqual(fila, { aliasSenia: "ch.estetica.mp", cancelacionHoras: 12 });
  });

  // ── SIN las migraciones: se sacan de ESTA base efímera las columnas de M2 y M3 (producción hoy) ──
  await sql(
    urlDuenio,
    `ALTER TABLE "BusinessSettings" DROP COLUMN "aliasSenia", DROP COLUMN "cbuSenia", DROP COLUMN "cancelacionHoras",
       DROP COLUMN "seniaCancelaTarde", DROP COLUMN "seniaNoVino", DROP COLUMN "topeBajaSaldoRecepcion";
     DROP TABLE "AppointmentItem";
     ALTER TABLE "Appointment" DROP COLUMN "groupId";`,
  );

  await t.test("CH-053 · sin M2: Mi negocio cae al placeholder D2/D5 «pendiente de activar» y no graba; nada falla", async () => {
    const leidas = await ejecutarAccion(comoDuenia, () => cargarReglasDelMostrador(A.id));
    assert.deepEqual((leidas as { valor: unknown }).valor, { reglas: { ...REGLAS_POR_DEFECTO, activas: false }, alias: null });
    const campos = { aliasSenia: "ch.estetica.mp", cbuSenia: "", cancelacionHoras: "24", seniaCancelaTarde: "retener", seniaNoVino: "retener", topeBajaSaldoRecepcion: "0" };
    const r = await ejecutarAccion(comoDuenia, () => guardarMiNegocio({ estado: "inicial", mensaje: "" }, form(campos)));
    assert.equal((r as { valor: { estado: string } }).valor.estado, "pendiente");
    assert.equal((await sql(urlDuenio, `SELECT count(*)::int AS n FROM "AuditLog" WHERE entity = 'BusinessSettings'`)).rows[0].n, 1, "no se auditó lo que no se grabó");
  });

  await t.test("sin M2/M3: el aumento anda igual y sigue sin tocar el turno", async () => {
    const p = pedido({ alcance: { tipo: "tildados", ids: [piernas] }, porcentaje: "5", senia: false, vecina: false });
    const plan = planificarAumentoServicios(await verPantalla(), p);
    const r = await aplicar(comoDuenia, p, plan.huella);
    assert.deepEqual((r as { valor: unknown }).valor, { ok: true, cambiados: 1 });
    assert.equal((await servicio(piernas)).price, 18500); // 17.500 × 1,05 = 18.375 → 18.500
    assert.deepEqual(await elTurno(), turnoAntes);
    assert.deepEqual(await servicio(deB), bAntes);
  });
});
