/**
 * Rendición de la profesional que cobra aparte (GSG-CH-006 · D6), contra Postgres efímero con RLS y
 * con prisma/pending-gate2/CH_rendicion_profesional.sql aplicado como `neondb_owner`:
 *
 *   · el cobro de Vero (cobraEnMostrador=false) cobrado por ELLA queda a rendir y NO entra al libro;
 *     el mismo turno cobrado por la dueña entra al libro como siempre;
 *   · CARRERA · doble envío de la MISMA rendición → una sola rendición y un solo ingreso;
 *   · CARRERA · N rendiciones concurrentes de la misma profesional sobre los mismos cobros → una;
 *   · CARRERA · rendiciones concurrentes de a un cobro → cada cobro rendido una vez, Σ exacta;
 *   · nunca de más ni de menos: la retención está apagada (la comisión la paga la liquidación);
 *   · con el día ya cerrado no se escribe nada (DB-5);
 *   · un cobro anulado ANTES de rendirse no toca el libro y no se rinde; el negocio B no ve ni rinde lo de A;
 *   · anular un cobro YA rendido asienta un EGRESO de hoy (idempotente) y con hoy cerrado se rechaza;
 *   · CARRERA · rendir ‖ anular el mismo cobro: gane cuál gane, el libro neto del cobro da 0; con el
 *     hueco provocado (la rendición confirma con la foto de la anulación ya tomada) igual hay EGRESO;
 *     en el orden inverso (anulación primero) la rendición en vuelo no rinde el cobro anulado;
 *   · la misma clave con otros cobros es error, no «ya registrada»;
 *   · cobro con producto de la profesional que cobra aparte: se detecta para rechazarlo;
 *   · sin las tablas, o con las tablas sin permisos para `app_rls`, el cobro entra a la caja como hoy.
 * Los casos del refutador (d6-adv-postgres) quedan acá.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;
const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/CH_rendicion_profesional.sql"), "utf8");
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Duenio = Awaited<ReturnType<typeof prismaComoDuenio>>;
type Mundo = {
  base: BaseEfimera;
  /** El cobro de Vero hecho ANTES de aplicar la migración (caso 1 del refutador). */
  sinTablas: import("@/lib/turnos/cobro-turno-repo").AplicarCobroResult;
  /** Serializable con reintentos, como en producción. `demoraMs`: espera DENTRO de la tx, con el turno tomado. */
  anular: (o: { collectionId: string; appointmentId: string; diaCerradoHasta?: string | null; demoraMs?: number }) => Promise<import("@/lib/turnos/anulacion").AnularCobroResult>;
  duenio: Duenio;
  vero: { id: string; userId: string };
  turno: (tenantId?: string) => Promise<string>;
  cobrar: (o: { appointmentId: string; actor: string; monto?: number; tenantId?: string }) => Promise<import("@/lib/turnos/cobro-turno-repo").AplicarCobroResult>;
  /** READ COMMITTED, como en producción. `demoraMs`: espera DENTRO de la tx, con los candados tomados. */
  rendir: (o: Partial<import("./rendicion-repo").RegistrarRendicionArgs> & { cobroIds: string[]; tenantId?: string; demoraMs?: number }) => Promise<import("./rendicion-repo").RegistrarRendicionResult>;
  pendientesDe: (tenantId?: string) => Promise<{ id: string; monto: number }[]>;
};
let mundo: Mundo | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Mundo | null> {
  if (mundo) return mundo;
  const base = await laBase(t);
  if (!base) return null;

  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "10", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { Prisma } = await import("@/generated/prisma/client");
  const { aplicarCobroTurnoInTx } = await import("@/lib/turnos/cobro-turno-repo");
  const { registrarRendicionInTx, leerRendicionesInTx } = await import("./rendicion-repo");
  const { anularCobroTurnoInTx } = await import("@/lib/turnos/anulacion");

  const A = base.a.id;
  const box = await duenio.box.create({ data: { tenantId: A, name: "Box 1" } });
  const servicio = await duenio.service.create({ data: { tenantId: A, name: "Esculpidas", durationMin: 60, price: 18000 } });
  const prof = await duenio.professional.create({
    data: { tenantId: A, name: "Vero", boxId: box.id, cobraEnMostrador: false, commissionPercent: 30, services: { connect: [{ id: servicio.id }] } },
  });
  const user = await duenio.user.create({
    data: { tenantId: A, name: "Vero", email: `vero-${Date.now()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: prof.id },
  });
  // Negocio B: su propia profesional que cobra aparte.
  const B = base.b.id;
  const boxB = await duenio.box.create({ data: { tenantId: B, name: "Box B" } });
  const servB = await duenio.service.create({ data: { tenantId: B, name: "Manos", durationMin: 60, price: 9000 } });
  const profB = await duenio.professional.create({ data: { tenantId: B, name: "Luz", boxId: boxB.id, cobraEnMostrador: false } });

  let n = 0;
  const turno = async (tenantId = A) => {
    const enA = tenantId === A;
    const clientId = (await duenio.client.create({ data: { tenantId, name: `Clienta ${n}`, phone: `11400090${String(n).padStart(2, "0")}` } })).id;
    const startsAt = new Date(Date.now() - 24 * HORA - n++ * 24 * HORA);
    const a = await duenio.appointment.create({
      data: {
        tenantId,
        clientId,
        professionalId: enA ? prof.id : profB.id,
        serviceId: enA ? servicio.id : servB.id,
        boxId: enA ? box.id : boxB.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HORA),
        status: "CONFIRMED",
        priceAtBooking: enA ? 18000 : 9000,
      },
    });
    return a.id;
  };

  const cobrar: Mundo["cobrar"] = ({ appointmentId, actor, monto = 18000, tenantId = A }) =>
    tenantTransaction(
      (tx) =>
        aplicarCobroTurnoInTx(tx, tenantId, {
          appointmentId,
          status: "CONFIRMED",
          precio: 18000,
          monto,
          method: "EFECTIVO",
          actor,
          detail: "Turno · Esculpidas",
          idempotencyKey: randomUUID(),
          withSchema: true,
          cerradoHasta: null,
          camino: "cobro",
        }),
      { tenantId },
    );

  // Caso 1 del refutador: SIN la migración, el cobro de Vero entra al libro como hoy.
  const sinTablas = await cobrar({ appointmentId: await turno(), actor: `user:${user.id}` });

  // Recién ahora, la migración pendiente, tal cual, como la aplicaría el dueño (neondb_owner, una conexión).
  const pg = await import("pg");
  const cli = new pg.default.Client({ connectionString: base.urlDuenio });
  await cli.connect();
  await cli.query(SQL);
  await cli.end();

  mundo = {
    base,
    sinTablas,
    anular: ({ collectionId, appointmentId, diaCerradoHasta = null, demoraMs = 0 }) =>
      tenantTransaction(
        async (tx) => {
          const r = await anularCobroTurnoInTx(tx, A, {
            collectionId,
            appointmentId,
            precio: 18000,
            motivo: "la clienta pidió devolución",
            actor: `user:${base.a.duenia.id}`,
            diaCerradoHasta,
            esDiaCerrado: (d, h) => d <= h,
            diaDe: (d) => d.toISOString().slice(0, 10),
            withSchema: true,
          });
          if (demoraMs) await dormir(demoraMs);
          return r;
        },
        { tenantId: A, isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeoutMs: 15_000 },
      ),
    duenio,
    vero: { id: prof.id, userId: user.id },
    turno,
    cobrar,
    rendir: ({ tenantId = A, demoraMs = 0, ...o }) =>
      tenantTransaction(
        async (tx) => {
          const r = await registrarRendicionInTx(tx, tenantId, {
            professionalId: prof.id,
            entregado: 0,
            method: "EFECTIVO",
            idempotencyKey: randomUUID(),
            nota: null,
            actor: `user:${base.a.duenia.id}`,
            cerradoHasta: null,
            ...o,
          });
          if (demoraMs) await dormir(demoraMs);
          return r;
        },
        { tenantId, timeoutMs: 15_000 },
      ),
    pendientesDe: async (tenantId = A) => {
      const l = await tenantTransaction((tx) => leerRendicionesInTx(tx, tenantId), { tenantId });
      assert.equal(l.habilitada, true);
      return l.habilitada ? l.profesionales.flatMap((p) => p.pendientes.map((c) => ({ id: c.id, monto: c.monto }))) : [];
    },
  };
  return mundo;
}

/** N cobros de Vero cobrados por ella misma: los ids de `CobroARendir`. */
async function cobrosARendir(m: Mundo, n: number, monto = 18000): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await m.cobrar({ appointmentId: await m.turno(), actor: `user:${m.vero.userId}`, monto });
    assert.ok(r.applied && r.aRendir, "el cobro de la profesional que cobra aparte queda a rendir");
    ids.push(r.aRendir.cobroARendirId);
  }
  return ids;
}

async function ingresosDeRendicion(m: Mundo, rendicionIds: string[]) {
  return m.duenio.cashMovement.findMany({
    where: { createdBy: { in: rendicionIds.map((id) => `rendicion:${id}`) } },
    select: { amount: true, type: true, method: true },
  });
}

async function rendicionesConClave(m: Mundo, clave: string) {
  return m.duenio.$queryRaw<{ id: string }[]>`SELECT "id" FROM "RendicionProfesional" WHERE "idempotencyKey" = ${clave}`;
}

test("el cobro de la profesional que cobra aparte queda a rendir y no entra al libro; el de la dueña, sí", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const suyo = await m.cobrar({ appointmentId: await m.turno(), actor: `user:${m.vero.userId}` });
  assert.ok(suyo.applied);
  assert.ok(suyo.aRendir);
  assert.equal(suyo.caja, null);
  assert.equal(await m.duenio.cashMovement.count({ where: { collectionId: suyo.collectionId } }), 0, "no entra al libro");
  // El Payment agregado sigue: la comisión y los reportes lo ven cobrado.
  assert.equal(await m.duenio.payment.count({ where: { id: suyo.payment.id, status: "APPROVED" } }), 1);

  const deLaDuenia = await m.cobrar({ appointmentId: await m.turno(), actor: `user:${m.base.a.duenia.id}` });
  assert.ok(deLaDuenia.applied);
  assert.equal(deLaDuenia.aRendir, null);
  assert.equal(deLaDuenia.caja?.recorded, true, "la dueña cobra: entra al cajón como siempre");
});

test("CARRERA · doble envío de la misma rendición: una sola rendición, un solo ingreso", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const ids = await cobrosARendir(m, 3);
  const clave = randomUUID();
  const envios = await Promise.allSettled([0, 1, 2, 3].map(() => m.rendir({ cobroIds: ids, entregado: 54000, idempotencyKey: clave })));
  const ok = envios.filter((e) => e.status === "fulfilled").map((e) => (e as PromiseFulfilledResult<Awaited<ReturnType<Mundo["rendir"]>>>).value);
  const registradas = ok.filter((r) => r.estado === "registrada");
  assert.equal(registradas.length, 1, "una sola registrada");
  // El resto: duplicada (esperó los candados) o el choque del @@unique, que la acción lee como ya registrada.
  for (const e of envios) {
    if (e.status === "fulfilled") continue;
    const { esChoqueDeClaveDeRendicion } = await import("./rendicion-repo");
    assert.ok(esChoqueDeClaveDeRendicion(e.reason), `rechazo inesperado: ${String(e.reason)}`);
  }
  const filas = await rendicionesConClave(m, clave);
  assert.equal(filas.length, 1);
  const ingresos = await ingresosDeRendicion(m, [filas[0].id]);
  assert.deepEqual(ingresos.map((i) => [i.type, i.method, i.amount]), [["INGRESO", "EFECTIVO", 54000]]);
});

test("CARRERA · N rendiciones concurrentes de la misma profesional sobre los mismos cobros: se rinde una vez", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const ids = await cobrosARendir(m, 2);
  const N = 6;
  const envios = await Promise.allSettled(Array.from({ length: N }, () => m.rendir({ cobroIds: ids, entregado: 36000 })));
  const registradas = envios.filter((e) => e.status === "fulfilled" && e.value.estado === "registrada");
  assert.equal(registradas.length, 1);
  const { RendicionRechazada } = await import("./rendicion-repo");
  for (const e of envios) {
    if (e.status === "rejected") assert.ok(e.reason instanceof RendicionRechazada && e.reason.motivo === "cobro-ajeno", String(e.reason));
  }
  const rid = (registradas[0] as PromiseFulfilledResult<{ estado: "registrada"; rendicionId: string }>).value.rendicionId;
  const ingresos = await ingresosDeRendicion(m, [rid]);
  assert.equal(ingresos.reduce((s, i) => s + i.amount, 0), 36000);
  const rendidos = await m.duenio.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT "rendicionId") AS n FROM "CobroARendir" WHERE "id" IN (${ids[0]}, ${ids[1]})`;
  assert.equal(Number(rendidos[0].n), 1);
  const pend = await m.pendientesDe();
  assert.ok(!pend.some((p) => ids.includes(p.id)), "ya no figuran a rendir");
});

test("CARRERA · rendiciones concurrentes de a un cobro (dos por cobro): cada cobro una vez, Σ exacta", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const ids = await cobrosARendir(m, 4, 1234.56);
  const envios = await Promise.allSettled([...ids, ...ids].map((id) => m.rendir({ cobroIds: [id], entregado: 1234.56 })));
  const ok = envios.filter((e) => e.status === "fulfilled" && e.value.estado === "registrada") as PromiseFulfilledResult<{ estado: "registrada"; rendicionId: string }>[];
  assert.equal(ok.length, 4);
  const ingresos = await ingresosDeRendicion(m, ok.map((e) => e.value.rendicionId));
  assert.equal(Math.round(ingresos.reduce((s, i) => s + i.amount, 0) * 100), 4 * 123456);
});

test("nunca de más ni de menos: la retención está apagada (caso 3 del refutador: la comisión no se paga dos veces)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const [id] = await cobrosARendir(m, 1);
  await assert.rejects(m.rendir({ cobroIds: [id], entregado: 18000.01 }), { motivo: "entregado-de-mas" });
  // Antes: 12.600 con permiso quedaba «retenido 5.400» y la liquidación le pagaba otros 5.400.
  await assert.rejects(m.rendir({ cobroIds: [id], entregado: 12600 }), { motivo: "retencion-apagada" });
  await assert.rejects(m.rendir({ cobroIds: [id], entregado: 0 }), { motivo: "retencion-apagada" });
  // La base tampoco lo deja (CHECK retenido = 0), aunque alguien saltee el código.
  await assert.rejects(
    m.duenio.$executeRaw`INSERT INTO "RendicionProfesional" ("id","tenantId","professionalId","cobrado","entregado","retenido","method","idempotencyKey","registradaPor")
      VALUES (${randomUUID()}, ${m.base.a.id}, ${m.vero.id}, 18000, 12600, 5400, 'EFECTIVO', ${randomUUID()}, 'user:x')`,
    /RendicionProfesional_sin_retencion/,
  );
  const r = await m.rendir({ cobroIds: [id], entregado: 18000 });
  assert.equal(r.estado, "registrada");
  if (r.estado !== "registrada") return;
  assert.deepEqual([r.cobrado, r.entregado, r.retenido], [18000, 18000, 0]);
  assert.deepEqual((await ingresosDeRendicion(m, [r.rendicionId])).map((i) => i.amount), [18000]);
});

test("con el día ya cerrado no se rinde ni se escribe nada (DB-5)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const [id] = await cobrosARendir(m, 1);
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const clave = randomUUID();
  await assert.rejects(m.rendir({ cobroIds: [id], entregado: 18000, cerradoHasta: todayInBusinessTz(), idempotencyKey: clave }), { motivo: "dia-cerrado" });
  assert.equal((await rendicionesConClave(m, clave)).length, 0);
  assert.ok((await m.pendientesDe()).some((p) => p.id === id), "sigue a rendir");
});

test("un cobro anulado ANTES de rendirse no toca el libro, no figura a rendir y no se rinde", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const appointmentId = await m.turno();
  const r = await m.cobrar({ appointmentId, actor: `user:${m.vero.userId}` });
  assert.ok(r.applied && r.aRendir);
  const an = await m.anular({ collectionId: r.collectionId, appointmentId });
  assert.ok(an.applied);
  assert.deepEqual(an.libro, { asentada: false, reason: "sin-asiento-original" }, "la plata nunca entró: nada sale");
  assert.equal(await m.duenio.cashMovement.count({ where: { collectionId: r.collectionId } }), 0);
  assert.ok(!(await m.pendientesDe()).some((p) => p.id === r.aRendir!.cobroARendirId));
  await assert.rejects(m.rendir({ cobroIds: [r.aRendir.cobroARendirId], entregado: 18000 }), { motivo: "cobro-ajeno" });
});

test("anular un cobro YA rendido: EGRESO de hoy contra el cobro, idempotente; con hoy cerrado se rechaza (caso 2 del refutador)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const appointmentId = await m.turno();
  const r = await m.cobrar({ appointmentId, actor: `user:${m.vero.userId}` });
  assert.ok(r.applied && r.aRendir);
  const rend = await m.rendir({ cobroIds: [r.aRendir.cobroARendirId], entregado: 18000 });
  assert.equal(rend.estado, "registrada");
  if (rend.estado !== "registrada") return;

  // Hoy cerrado: la devolución saldría hoy de un día contado → no se anula nada.
  const hoy = new Date().toISOString().slice(0, 10);
  const { AnulacionRechazada } = await import("@/lib/turnos/anulacion");
  await assert.rejects(m.anular({ collectionId: r.collectionId, appointmentId, diaCerradoHasta: hoy }), (e) => e instanceof AnulacionRechazada && e.motivo === "dia-cerrado");
  assert.equal(await m.duenio.collection.count({ where: { appointmentId, amount: { lt: 0 } } }), 0);

  const antes = Date.now();
  const an = await m.anular({ collectionId: r.collectionId, appointmentId });
  assert.ok(an.applied);
  assert.equal(an.libro.asentada, true, JSON.stringify(an.libro));
  const egresos = await m.duenio.cashMovement.findMany({ where: { collectionId: r.collectionId }, select: { type: true, amount: true, method: true, occurredAt: true, createdBy: true, reason: true } });
  assert.equal(egresos.length, 1);
  // CH-011 · el detalle nombra EL COBRO anulado (servicio, clienta, quién lo cobró), no la rendición entera.
  assert.match(String(egresos[0].reason), /^Anulación de cobro · Turno · Esculpidas — Clienta \d+ \(cobrado por Vero, ya rendido\) — la clienta pidió devolución$/);
  assert.doesNotMatch(String(egresos[0].reason), /Rendición/);
  // CH-011 · en el libro: el ingreso es «Rendición de profesional» (no «Ingreso manual») y la vuelta, «Anulación».
  const { clasificarOrigen } = await import("@/lib/caja/libro-caja");
  assert.equal(clasificarOrigen({ type: "EGRESO", createdBy: egresos[0].createdBy, collectionId: r.collectionId }).origen, "anulacion");
  assert.deepEqual(clasificarOrigen({ type: "INGRESO", createdBy: `rendicion:${rend.rendicionId}` }), { origen: "rendicion-profesional", referencia: rend.rendicionId });
  assert.deepEqual([egresos[0].type, Number(egresos[0].amount), egresos[0].method], ["EGRESO", 18000, "EFECTIVO"]);
  assert.ok(egresos[0].occurredAt.getTime() >= antes - 60_000, "fecha de hoy, no la del cobro");
  assert.match(String(egresos[0].createdBy), /^anulacion-turno:/);
  // Neto del cobro en el libro: entró con la rendición, salió con la anulación.
  const ingreso = await ingresosDeRendicion(m, [rend.rendicionId]);
  assert.equal(ingreso.reduce((s, i) => s + i.amount, 0) - Number(egresos[0].amount), 0);
  // Segunda anulación: duplicada, ningún EGRESO más.
  const otra = await m.anular({ collectionId: r.collectionId, appointmentId });
  assert.equal(otra.applied, false);
  assert.equal(await m.duenio.cashMovement.count({ where: { collectionId: r.collectionId } }), 1);
});

test("CARRERA · rendir ‖ anular el mismo cobro: gane cuál gane, el libro neto del cobro da 0 (caso 5 del refutador)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  for (let i = 0; i < 6; i++) {
    const appointmentId = await m.turno();
    const r = await m.cobrar({ appointmentId, actor: `user:${m.vero.userId}` });
    assert.ok(r.applied && r.aRendir);
    const [rend, an]: [
      PromiseSettledResult<Awaited<ReturnType<Mundo["rendir"]>>>,
      PromiseSettledResult<Awaited<ReturnType<Mundo["anular"]>>>,
    ] = await Promise.allSettled([
      m.rendir({ cobroIds: [r.aRendir.cobroARendirId], entregado: 18000 }),
      m.anular({ collectionId: r.collectionId, appointmentId }),
    ]);
    assert.equal(an.status, "fulfilled", an.status === "rejected" ? String(an.reason) : "");
    const ingreso: number =
      rend.status === "fulfilled" && rend.value.estado === "registrada"
        ? (await ingresosDeRendicion(m, [rend.value.rendicionId])).reduce((s, x) => s + x.amount, 0)
        : 0;
    if (rend.status === "rejected") assert.equal((rend.reason as { motivo?: string }).motivo, "cobro-ajeno", String(rend.reason));
    const egreso: number = (await m.duenio.cashMovement.findMany({ where: { collectionId: r.collectionId, type: "EGRESO" }, select: { amount: true } })).reduce(
      (s, x) => s + Number(x.amount),
      0,
    );
    assert.equal(ingreso - egreso, 0, `vuelta ${i}: ingreso ${ingreso} egreso ${egreso}`);
  }
});

async function egresoDelCobro(m: Mundo, collectionId: string): Promise<number> {
  const filas = await m.duenio.cashMovement.findMany({ where: { collectionId, type: "EGRESO" }, select: { amount: true } });
  return filas.reduce((s, x) => s + Number(x.amount), 0);
}

test("CARRERA · hueco provocado: la rendición confirma mientras la anulación (Serializable) ya tenía su foto → igual asienta el EGRESO (caso 7 del refutador)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  for (let i = 0; i < 3; i++) {
    const appointmentId = await m.turno();
    const r = await m.cobrar({ appointmentId, actor: `user:${m.vero.userId}` });
    assert.ok(r.applied && r.aRendir);
    // La rendición toma el turno y tarda en confirmar; la anulación arranca en ese hueco.
    const rendicion: ReturnType<Mundo["rendir"]> = m.rendir({ cobroIds: [r.aRendir.cobroARendirId], entregado: 18000, demoraMs: 400 });
    await dormir(120);
    const anulacion: ReturnType<Mundo["anular"]> = m.anular({ collectionId: r.collectionId, appointmentId });
    const [rend, an] = await Promise.all([rendicion, anulacion]);
    assert.equal(rend.estado, "registrada");
    assert.ok(an.applied, "la anulación se aplica");
    assert.equal(an.applied && an.libro.asentada, true, `vuelta ${i}: ${JSON.stringify(an.applied && an.libro)}`);
    const ingreso: number = rend.estado === "registrada" ? (await ingresosDeRendicion(m, [rend.rendicionId])).reduce((s, x) => s + x.amount, 0) : 0;
    assert.equal(ingreso, 18000);
    assert.equal(await egresoDelCobro(m, r.collectionId), 18000, `vuelta ${i}: el INGRESO de la rendición no puede quedar sin su EGRESO`);
  }
});

test("CARRERA · orden inverso: la anulación confirma primero y la rendición estaba en vuelo → no rinde el cobro anulado", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  for (let i = 0; i < 3; i++) {
    const appointmentId = await m.turno();
    const r = await m.cobrar({ appointmentId, actor: `user:${m.vero.userId}` });
    assert.ok(r.applied && r.aRendir);
    const anulacion: ReturnType<Mundo["anular"]> = m.anular({ collectionId: r.collectionId, appointmentId, demoraMs: 400 });
    await dormir(120);
    const rendicion: ReturnType<Mundo["rendir"]> = m.rendir({ cobroIds: [r.aRendir.cobroARendirId], entregado: 18000 });
    const [an, rend] = await Promise.allSettled([anulacion, rendicion]);
    assert.equal(an.status, "fulfilled", an.status === "rejected" ? String(an.reason) : "");
    assert.ok(an.status === "fulfilled" && an.value.applied);
    assert.equal(rend.status, "rejected", "la rendición no puede rendir un cobro ya anulado");
    assert.equal((rend.status === "rejected" && (rend.reason as { motivo?: string }).motivo) || "", "cobro-ajeno", rend.status === "rejected" ? String(rend.reason) : "");
    const fila: { rendicionId: string | null }[] = await m.duenio.$queryRaw<{ rendicionId: string | null }[]>`SELECT "rendicionId" FROM "CobroARendir" WHERE "id" = ${r.aRendir.cobroARendirId}`;
    assert.equal(fila[0]?.rendicionId, null);
    // Nunca entró al libro: ni INGRESO de rendición ni EGRESO.
    assert.equal(await egresoDelCobro(m, r.collectionId), 0);
    assert.ok(!(await m.pendientesDe()).some((p) => p.id === r.aRendir!.cobroARendirId));
  }
});

test("CARRERA · rendir ‖ anular sin demora, 10 vueltas: el INGRESO de una rendición siempre tiene su EGRESO (caso 8 del refutador)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  for (let i = 0; i < 10; i++) {
    const appointmentId = await m.turno();
    const r = await m.cobrar({ appointmentId, actor: `user:${m.vero.userId}` });
    assert.ok(r.applied && r.aRendir);
    const [rend, an]: [
      PromiseSettledResult<Awaited<ReturnType<Mundo["rendir"]>>>,
      PromiseSettledResult<Awaited<ReturnType<Mundo["anular"]>>>,
    ] = await Promise.allSettled([
      m.rendir({ cobroIds: [r.aRendir.cobroARendirId], entregado: 18000 }),
      m.anular({ collectionId: r.collectionId, appointmentId }),
    ]);
    assert.equal(an.status, "fulfilled", an.status === "rejected" ? String(an.reason) : "");
    if (rend.status === "rejected") assert.equal((rend.reason as { motivo?: string }).motivo, "cobro-ajeno", String(rend.reason));
    const ingreso: number =
      rend.status === "fulfilled" && rend.value.estado === "registrada"
        ? (await ingresosDeRendicion(m, [rend.value.rendicionId])).reduce((s, x) => s + x.amount, 0)
        : 0;
    assert.equal(ingreso - (await egresoDelCobro(m, r.collectionId)), 0, `vuelta ${i}`);
  }
});

test("la misma clave con OTROS cobros es error; con los mismos, «ya registrada» (caso 4 del refutador)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const [c4, c5] = await cobrosARendir(m, 2);
  const K = randomUUID();
  const a4 = await m.rendir({ cobroIds: [c4], entregado: 18000, idempotencyKey: K });
  assert.equal(a4.estado, "registrada");
  const igual = await m.rendir({ cobroIds: [c4], entregado: 18000, idempotencyKey: K });
  assert.equal(igual.estado, "duplicada");
  await assert.rejects(m.rendir({ cobroIds: [c5], entregado: 18000, idempotencyKey: K }), { motivo: "clave-reusada" });
  assert.ok((await m.pendientesDe()).some((p) => p.id === c5), "c5 sigue a rendir: nadie lo dio por rendido");
  const { rendicionPorClaveInTx } = await import("./rendicion-repo");
  const { tenantTransaction } = await import("@/lib/rls");
  const A = m.base.a.id;
  const misma = await tenantTransaction((tx) => rendicionPorClaveInTx(tx, A, { idempotencyKey: K, professionalId: m.vero.id, cobroIds: [c4] }), { tenantId: A });
  const otra = await tenantTransaction((tx) => rendicionPorClaveInTx(tx, A, { idempotencyKey: K, professionalId: m.vero.id, cobroIds: [c5] }), { tenantId: A });
  assert.deepEqual([misma?.misma, otra?.misma], [true, false]);
});

test("cobro con producto: se detecta la profesional que cobra aparte en SU turno (y no la dueña)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const { cobroQuedariaARendirInTx } = await import("./rendicion-repo");
  const { tenantTransaction } = await import("@/lib/rls");
  const A = m.base.a.id;
  const appointmentId = await m.turno();
  const q = (actor: string, method = "EFECTIVO") =>
    tenantTransaction((tx) => cobroQuedariaARendirInTx(tx, A, { appointmentId, actor, method }), { tenantId: A });
  assert.equal(await q(`user:${m.vero.userId}`), true);
  assert.equal(await q(`user:${m.base.a.duenia.id}`), false);
  assert.equal(await q(`user:${m.vero.userId}`, "VOUCHER"), false);
  assert.equal(await q("mp:webhook"), false);
});

test("aislamiento: el negocio B no ve ni rinde los cobros a rendir de A", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const [id] = await cobrosARendir(m, 1);
  const B = m.base.b.id;
  const pendB = await m.pendientesDe(B);
  assert.ok(!pendB.some((p) => p.id === id));
  // Con la profesional de A desde B: no existe en B.
  await assert.rejects(m.rendir({ tenantId: B, cobroIds: [id], entregado: 18000 }), { motivo: "cobro-ajeno" });
  // Con una profesional de B y el cobro de A: no es pendiente de B.
  const luz = await m.duenio.professional.findFirstOrThrow({ where: { tenantId: B, name: "Luz" } });
  await assert.rejects(m.rendir({ tenantId: B, professionalId: luz.id, cobroIds: [id], entregado: 18000 }), { motivo: "cobro-ajeno" });
  assert.ok((await m.pendientesDe()).some((p) => p.id === id), "en A sigue a rendir");
  // CH-011 · Luz (cobra aparte) no tiene nada pendiente en B: no figura con «a rendir $0,00 (0 cobros)».
  const lecturaB = await (await import("@/lib/rls")).tenantTransaction(
    async (tx) => (await import("./rendicion-repo")).leerRendicionesInTx(tx, B),
    { tenantId: B },
  );
  assert.ok(lecturaB.habilitada);
  if (lecturaB.habilitada) assert.deepEqual(lecturaB.profesionales, [], "sin pendientes, sin fila");
});

test("sin las tablas el cobro entra a la caja como hoy (caso 1 del refutador)", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  assert.ok(m.sinTablas.applied);
  assert.equal(m.sinTablas.aRendir, null);
  assert.equal(m.sinTablas.caja?.recorded, true);
});

test("tablas sin permisos para app_rls (migración aplicada con otro rol): el cobro entra a la caja, no se cae", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const pg = await import("pg");
  const cli = new pg.default.Client({ connectionString: m.base.urlDuenio });
  await cli.connect();
  try {
    await cli.query(`REVOKE INSERT ON "CobroARendir" FROM app_rls`);
    const r = await m.cobrar({ appointmentId: await m.turno(), actor: `user:${m.vero.userId}` });
    assert.ok(r.applied);
    assert.equal(r.aRendir, null);
    assert.equal(r.caja?.recorded, true, "degrada a la caja de hoy");
  } finally {
    await cli.query(`GRANT INSERT ON "CobroARendir" TO app_rls`);
    await cli.end();
  }
});
