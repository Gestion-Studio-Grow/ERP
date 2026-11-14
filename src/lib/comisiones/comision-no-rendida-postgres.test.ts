/**
 * F1 · No se paga comisión de un cobro que la profesional todavía no rindió (política «esperar»,
 * comisiones/comision-no-rendida.ts), contra Postgres efímero con RLS y con
 * prisma/pending-gate2/CH_rendicion_profesional.sql aplicado como `neondb_owner`:
 *
 *   · caso Laura: cobra $37.000 (cobraEnMostrador=false) y no rinde → Comisiones, vista previa y «Mi
 *     liquidación» no ofrecen nada y muestran «pendiente de rendir $37.000»; liquidar no paga nada ni
 *     toca la caja. Rinde → paga $14.800 (40 %), y todas las sumas coinciden con lo congelado;
 *   · CARRERA · rendir ‖ liquidar: la rendición en vuelo con el candado tomado → la liquidación espera
 *     y paga lo rendido; N rondas sin pausa → nunca un turno pagado con un cobro sin rendir, y lo
 *     pagado = comisión de lo estampado;
 *   · anular un cobro YA liquidado no rompe ni paga dos veces (riesgo aceptado: sólo el aviso).
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { businessWallTimeToUtc } from "@/lib/datetime";

const laBase = baseEfimeraDelArchivo();
const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/CH_rendicion_profesional.sql"), "utf8");
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const PRECIO = 37_000;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "10", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { Prisma } = await import("@/generated/prisma/client");
  const { aplicarCobroTurnoInTx } = await import("@/lib/turnos/cobro-turno-repo");
  const { registrarRendicionInTx } = await import("./rendicion-repo");
  const { anularCobroTurnoInTx } = await import("@/lib/turnos/anulacion");
  const { settleCommissions, getCommissionsOverview } = await import("@/lib/commission-actions");
  const { getVistaPreviaDeComisiones, getMiLiquidacion } = await import("./lectura");

  const pg = await import("pg");
  const cli = new pg.default.Client({ connectionString: base.urlDuenio });
  await cli.connect();
  await cli.query(SQL);
  await cli.end();

  const A = base.a.id;
  const box = await duenio.box.create({ data: { tenantId: A, name: "Box 1" } });
  const servicio = await duenio.service.create({ data: { tenantId: A, name: "Esculpidas", durationMin: 60, price: PRECIO } });
  const duenia = { negocio: base.a, usuario: base.a.duenia };

  const profesional = async (nombre: string) => {
    const p = await duenio.professional.create({
      data: { tenantId: A, name: nombre, boxId: box.id, cobraEnMostrador: false, commissionPercent: 40, services: { connect: [{ id: servicio.id }] } },
    });
    const u = await duenio.user.create({
      data: { tenantId: A, name: nombre, email: `${nombre.toLowerCase()}-${randomUUID()}@erp.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: p.id },
    });
    return { id: p.id, userId: u.id };
  };

  let n = 0;
  /** Un turno de octubre, realizado, cobrado entero por la propia profesional: queda a rendir. */
  const turnoCobradoPorElla = async (prof: { id: string; userId: string }) => {
    const clientId = (await duenio.client.create({ data: { tenantId: A, name: `Clienta ${n}`, phone: `11500090${String(n).padStart(2, "0")}` } })).id;
    const startsAt = businessWallTimeToUtc(`2026-10-${String(1 + (n++ % 28)).padStart(2, "0")}`, "10:00");
    const a = await duenio.appointment.create({
      data: { tenantId: A, clientId, professionalId: prof.id, serviceId: servicio.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), status: "COMPLETED", priceAtBooking: PRECIO },
    });
    const r = await tenantTransaction(
      (tx) =>
        aplicarCobroTurnoInTx(tx, A, {
          appointmentId: a.id,
          status: "COMPLETED",
          precio: PRECIO,
          monto: PRECIO,
          method: "EFECTIVO",
          actor: `user:${prof.userId}`,
          detail: "Turno · Esculpidas",
          idempotencyKey: randomUUID(),
          withSchema: true,
          cerradoHasta: null,
          camino: "cobro",
        }),
      { tenantId: A },
    );
    assert.ok(r.applied && r.aRendir, "el cobro de la profesional que cobra aparte queda a rendir");
    return { appointmentId: a.id, collectionId: r.collectionId, cobroARendirId: r.aRendir.cobroARendirId };
  };

  /** READ COMMITTED, como en producción. `demoraMs`: espera DENTRO de la tx, con los candados tomados. */
  const rendir = (professionalId: string, cobroIds: string[], demoraMs = 0) =>
    tenantTransaction(
      async (tx) => {
        const r = await registrarRendicionInTx(tx, A, {
          professionalId,
          cobroIds,
          entregado: PRECIO * cobroIds.length,
          method: "EFECTIVO",
          idempotencyKey: randomUUID(),
          nota: null,
          actor: `user:${base.a.duenia.id}`,
          cerradoHasta: null,
        });
        if (demoraMs) await dormir(demoraMs);
        return r;
      },
      { tenantId: A, timeoutMs: 15_000 },
    );

  const liquidar = async (professionalId: string) => {
    const f = new FormData();
    f.set("professionalId", professionalId);
    f.set("method", "EFECTIVO");
    f.set("volver", "/admin/comisiones");
    const r = await ejecutarAccion(duenia, () => settleCommissions(f));
    assert.equal(r.tipo, "redireccion", JSON.stringify(r));
    return String((r as { destino?: string }).destino);
  };

  const anular = (c: { collectionId: string; appointmentId: string }) =>
    tenantTransaction(
      (tx) =>
        anularCobroTurnoInTx(tx, A, {
          collectionId: c.collectionId,
          appointmentId: c.appointmentId,
          precio: PRECIO,
          motivo: "la clienta pidió devolución",
          actor: `user:${base.a.duenia.id}`,
          diaCerradoHasta: null,
          esDiaCerrado: (d, h) => d <= h,
          diaDe: (d) => d.toISOString().slice(0, 10),
          withSchema: true,
        }),
      { tenantId: A, isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeoutMs: 15_000 },
    );

  const respuesta = async <R>(p: Promise<{ tipo: string }>): Promise<R> => {
    const r = await p;
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as unknown as { valor: R }).valor;
  };
  const pendienteEnComisiones = async (professionalId: string) =>
    (await respuesta<Awaited<ReturnType<typeof getCommissionsOverview>>>(ejecutarAccion(duenia, () => getCommissionsOverview()))).pending.find(
      (p) => p.professionalId === professionalId,
    ) ?? null;
  const vistaPrevia = () => respuesta<Awaited<ReturnType<typeof getVistaPreviaDeComisiones>>>(ejecutarAccion(duenia, () => getVistaPreviaDeComisiones("2026-10")));
  const miLiquidacion = async (userId: string) => {
    const v = await respuesta<Awaited<ReturnType<typeof getMiLiquidacion>>>(ejecutarAccion({ negocio: base.a, usuario: { id: userId } }, () => getMiLiquidacion()));
    assert.equal(v.tipo, "profesional");
    return v as Extract<typeof v, { tipo: "profesional" }>;
  };

  /** Invariante de plata: ningún turno pagado tiene un cobro a rendir sin rendir; lo pagado = 40 % de lo estampado. */
  const invariante = async (professionalId: string) => {
    const payouts = await duenio.commissionPayout.findMany({ where: { tenantId: A, professionalId }, select: { id: true, amount: true } });
    for (const p of payouts) {
      const estampados = await duenio.appointment.findMany({ where: { commissionPayoutId: p.id }, select: { id: true } });
      assert.equal(p.amount, estampados.length * PRECIO * 0.4, "lo pagado es la comisión de lo estampado");
      const sinRendir = await duenio.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM "CobroARendir" WHERE "rendicionId" IS NULL AND "appointmentId" = ANY($1::text[])`,
        estampados.map((e) => e.id),
      );
      assert.equal(sinRendir[0].n, 0, "nunca se paga la comisión de un cobro sin rendir");
    }
    return payouts;
  };

  return { duenio, A, profesional, turnoCobradoPorElla, rendir, liquidar, anular, pendienteEnComisiones, vistaPrevia, miLiquidacion, invariante };
}

test("F1 contra la base: Laura sin rendir no cobra comisión; rinde y cobra $14.800; carreras y anulación", async (t) => {
  const m = await preparar(t);
  if (!m) return;

  // ── Caso Laura ─────────────────────────────────────────────────────────────
  const laura = await m.profesional("Laura");
  const cobro = await m.turnoCobradoPorElla(laura);

  assert.equal(await m.pendienteEnComisiones(laura.id), null, "Comisiones no ofrece pagar lo que no rindió");
  const vista = await m.vistaPrevia();
  assert.equal(vista.profesionales.find((p) => p.professionalId === laura.id), undefined, "no hay botón de liquidar");
  const porRendir = vista.pendientesDeRendir.find((p) => p.professionalId === laura.id);
  assert.ok(porRendir, "la vista previa la muestra como pendiente de rendir");
  assert.equal(porRendir.pendienteDeRendirCents, 3_700_000, "pendiente de rendir $37.000");
  assert.equal(porRendir.comisionCents, 1_480_000, "con su comisión de $14.800");
  const suya = await m.miLiquidacion(laura.userId);
  assert.equal(suya.pendiente?.totalCents ?? 0, 0, "«Mi liquidación» no suma lo que no rindió");
  assert.equal(suya.pendienteDeRendir?.pendienteDeRendirCents, 3_700_000);

  const movsAntes = await m.duenio.cashMovement.count({ where: { tenantId: m.A } });
  assert.match(await m.liquidar(laura.id), /status=error_nada/, "liquidar no paga nada");
  assert.equal(await m.duenio.commissionPayout.count({ where: { professionalId: laura.id } }), 0);
  assert.equal(await m.duenio.cashMovement.count({ where: { tenantId: m.A } }), movsAntes, "el cajón no queda en −$14.800");

  await m.rendir(laura.id, [cobro.cobroARendirId]);
  const ahora = await m.pendienteEnComisiones(laura.id);
  assert.equal(ahora?.amount, 14_800, "rendido: Comisiones ofrece $14.800");
  const vistaRendida = await m.vistaPrevia();
  assert.equal(vistaRendida.profesionales.find((p) => p.professionalId === laura.id)?.totalCents, 1_480_000);
  assert.equal(vistaRendida.pendientesDeRendir.find((p) => p.professionalId === laura.id), undefined);
  assert.equal((await m.miLiquidacion(laura.userId)).pendiente?.totalCents, 1_480_000);
  assert.match(await m.liquidar(laura.id), /status=ok_settled/);
  const [payout] = await m.invariante(laura.id);
  assert.equal(payout.amount, 14_800, "se paga $14.800, lo mismo que mostraron las pantallas");

  // ── Anular un cobro YA liquidado: no rompe ni paga dos veces (riesgo aceptado) ──
  const anulado = await m.anular(cobro);
  assert.equal(anulado.applied, true);
  assert.match(await m.liquidar(laura.id), /status=error_nada/, "no hay segundo pago");
  assert.equal(await m.duenio.commissionPayout.count({ where: { professionalId: laura.id } }), 1);
  assert.equal(await m.pendienteEnComisiones(laura.id), null);

  // ── CARRERA 1 · la rendición en vuelo con los candados tomados; la liquidación llega en el medio ──
  const lucia = await m.profesional("Lucia");
  const c1 = await m.turnoCobradoPorElla(lucia);
  const enVuelo = m.rendir(lucia.id, [c1.cobroARendirId], 1_500);
  await dormir(300);
  const [rindio, liquido] = await Promise.all([enVuelo, m.liquidar(lucia.id)]);
  assert.equal(rindio.estado, "registrada");
  assert.match(liquido, /status=ok_settled/, "la liquidación esperó la rendición y paga lo rendido");
  const [pLucia] = await m.invariante(lucia.id);
  assert.equal(pLucia.amount, 14_800);

  // ── CARRERA 2 · N rondas de rendir ‖ liquidar sin pausa: gane cuál gane, nunca se paga lo no rendido ──
  const lola = await m.profesional("Lola");
  for (let ronda = 0; ronda < 4; ronda++) {
    const c = await m.turnoCobradoPorElla(lola);
    // Las dos salen juntas; se esperan después (sin `Promise.all` en el bucle: tsc no infiere el tipo).
    const rendicion = m.rendir(lola.id, [c.cobroARendirId]);
    const liquidacion = m.liquidar(lola.id);
    const l = await liquidacion;
    assert.equal((await rendicion).estado, "registrada");
    assert.match(l, /status=(ok_settled|error_nada)/);
    await m.invariante(lola.id);
  }
  // Lo que quedó rendido y sin pagar sale en la próxima: al final, todo rendido = todo pagado.
  await m.liquidar(lola.id);
  const pagosLola = await m.invariante(lola.id);
  assert.equal(pagosLola.reduce((s, p) => s + p.amount, 0), 4 * 14_800, "lo pagado = la comisión de lo rendido");
});
