/**
 * Rendición de la profesional que cobra aparte (GSG-CH-006 · D6), contra Postgres efímero con RLS y
 * con prisma/pending-gate2/CH_rendicion_profesional.sql aplicado como `neondb_owner`:
 *
 *   · el cobro de Vero (cobraEnMostrador=false) cobrado por ELLA queda a rendir y NO entra al libro;
 *     el mismo turno cobrado por la dueña entra al libro como siempre;
 *   · CARRERA · doble envío de la MISMA rendición → una sola rendición y un solo ingreso;
 *   · CARRERA · N rendiciones concurrentes de la misma profesional sobre los mismos cobros → una;
 *   · CARRERA · rendiciones concurrentes de a un cobro → cada cobro rendido una vez, Σ exacta;
 *   · nunca de más; la retención sólo con permiso; con permiso queda retenida y entra lo entregado;
 *   · con el día ya cerrado no se escribe nada (DB-5);
 *   · un cobro anulado no se rinde; el negocio B no ve ni rinde lo de A (RLS + tenantId explícito).
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

type Duenio = Awaited<ReturnType<typeof prismaComoDuenio>>;
type Mundo = {
  base: BaseEfimera;
  duenio: Duenio;
  vero: { id: string; userId: string };
  turno: (tenantId?: string) => Promise<string>;
  cobrar: (o: { appointmentId: string; actor: string; monto?: number; tenantId?: string }) => Promise<import("@/lib/turnos/cobro-turno-repo").AplicarCobroResult>;
  rendir: (o: Partial<import("./rendicion-repo").RegistrarRendicionArgs> & { cobroIds: string[]; tenantId?: string }) => Promise<import("./rendicion-repo").RegistrarRendicionResult>;
  pendientesDe: (tenantId?: string) => Promise<{ id: string; monto: number }[]>;
};
let mundo: Mundo | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Mundo | null> {
  if (mundo) return mundo;
  const base = await laBase(t);
  if (!base) return null;

  // La migración pendiente, tal cual, como la aplicaría el dueño (neondb_owner, una conexión).
  const pg = await import("pg");
  const cli = new pg.default.Client({ connectionString: base.urlDuenio });
  await cli.connect();
  await cli.query(SQL);
  await cli.end();

  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "10", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { aplicarCobroTurnoInTx } = await import("@/lib/turnos/cobro-turno-repo");
  const { registrarRendicionInTx, leerRendicionesInTx } = await import("./rendicion-repo");

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

  mundo = {
    base,
    duenio,
    vero: { id: prof.id, userId: user.id },
    turno,
    cobrar: ({ appointmentId, actor, monto = 18000, tenantId = A }) =>
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
      ),
    rendir: ({ tenantId = A, ...o }) =>
      tenantTransaction(
        (tx) =>
          registrarRendicionInTx(tx, tenantId, {
            professionalId: prof.id,
            entregado: 0,
            method: "EFECTIVO",
            idempotencyKey: randomUUID(),
            nota: null,
            actor: `user:${base.a.duenia.id}`,
            puedeRetener: false,
            cerradoHasta: null,
            ...o,
          }),
        { tenantId },
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

test("nunca de más; la retención sólo con permiso; con permiso entra lo entregado y queda lo retenido", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const [id] = await cobrosARendir(m, 1);
  await assert.rejects(m.rendir({ cobroIds: [id], entregado: 18000.01, puedeRetener: true }), { motivo: "entregado-de-mas" });
  await assert.rejects(m.rendir({ cobroIds: [id], entregado: 12600, puedeRetener: false }), { motivo: "retencion-sin-permiso" });
  const r = await m.rendir({ cobroIds: [id], entregado: 12600, puedeRetener: true });
  assert.equal(r.estado, "registrada");
  if (r.estado !== "registrada") return;
  assert.deepEqual([r.cobrado, r.entregado, r.retenido], [18000, 12600, 5400]);
  const ingresos = await ingresosDeRendicion(m, [r.rendicionId]);
  assert.deepEqual(ingresos.map((i) => i.amount), [12600]);
  const { leerRendicionesInTx } = await import("./rendicion-repo");
  const { tenantTransaction } = await import("@/lib/rls");
  const l = await tenantTransaction((tx) => leerRendicionesInTx(tx, m.base.a.id), { tenantId: m.base.a.id });
  assert.ok(l.habilitada && (l.profesionales.find((p) => p.professionalId === m.vero.id)?.retenidoSinDescontar ?? 0) >= 5400);
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

test("un cobro anulado no se rinde ni figura a rendir", async (t) => {
  const m = await preparar(t);
  if (!m) return;
  const r = await m.cobrar({ appointmentId: await m.turno(), actor: `user:${m.vero.userId}` });
  assert.ok(r.applied && r.aRendir);
  const original = await m.duenio.collection.findUniqueOrThrow({ where: { id: r.collectionId } });
  // La contrapartida que escribe la anulación (anulacion.ts): misma forma de nota.
  await m.duenio.collection.create({
    data: {
      tenantId: original.tenantId,
      originType: "APPOINTMENT",
      originId: original.originId,
      appointmentId: original.appointmentId,
      amount: original.amount.negated(),
      method: original.method,
      note: `ANULACION:${original.id} — cobro mal cargado`,
      collectedBy: "user:x",
    },
  });
  assert.ok(!(await m.pendientesDe()).some((p) => p.id === r.aRendir!.cobroARendirId));
  await assert.rejects(m.rendir({ cobroIds: [r.aRendir.cobroARendirId], entregado: 18000 }), { motivo: "cobro-ajeno" });
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
});
