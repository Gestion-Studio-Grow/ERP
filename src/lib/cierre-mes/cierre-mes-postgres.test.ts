// ============================================================================
// CIERRE DEL MES contra Postgres: congelarMesAction TAL CUAL y el paquete que sale FINAL.
// ============================================================================
//
// Refutador 26/09: la escritura nueva del congelado (una fila de cierre diario para los días sin
// movimientos, acciones.ts) y `hayMovimientosSinCerrar` (lectura.ts) no tenían ningún test, y ningún
// paquete llegó a FINAL en el QA. Base efímera (src/test/base-efimera.ts), sesiones reales. Se mide:
//   · hayMovimientosSinCerrar: ve el movimiento sin cerrar de SU negocio y no el de otro (RLS);
//   · con caja sin cerrar, congelar no pasa y no escribe;
//   · sin movimientos, congelar cierra la caja hasta el último día del mes y congela, UNA vez aunque
//     haya doble clic simultáneo, y sólo en el negocio de la sesión (un `tenantId` forjado no cambia nada);
//   · el paquete del negocio congelado dice «Versión final»; el del otro, «BORRADOR».

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";

const MES = "2026-08";

test("congelar el mes: cierra los días sin movimientos, frena con caja sin cerrar, una vez, sólo en SU negocio, y el paquete sale FINAL", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  t.after(() => {
    if (antes === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes;
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { congelarMesAction } = await import("./acciones");
  const { hayMovimientosSinCerrar } = await import("./lectura");
  const { ACCION_CONGELAR, CIERRE_MES_ENTITY } = await import("./cierre-mes");
  const { CIERRE_DIARIO_ACTION, CIERRE_DIARIO_ENTITY, lastClosedDayTx } = await import("@/lib/caja/frontera-cierre");
  const { GET: paquete } = await import("@/app/admin/(dashboard)/cierre-mes/paquete/route");
  base.alBorrar(() => operatorPrisma.$disconnect());
  // La consola (`operatorPrisma`) es `app_rls`, como en producción: sembrar y mirar desde afuera como dueño.
  const duenio = await prismaComoDuenio(base);

  type E = Awaited<ReturnType<typeof congelarMesAction>>;
  const valor = <R>(s: SalidaDeAccion<R>): R => {
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    return (s as Extract<SalidaDeAccion<R>, { tipo: "respuesta" }>).valor;
  };
  const comoA = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const comoB = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, fn);
  const form = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("mes", MES);
    f.set("confirmo", "1");
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  const filasDe = (tenantId: string) =>
    duenio.auditLog.findMany({
      where: { tenantId, entity: { in: [CIERRE_DIARIO_ENTITY, CIERRE_MES_ENTITY] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { action: true, entityId: true, changes: true },
    });

  // ── hayMovimientosSinCerrar, contra la base con la RLS de cada negocio ──
  await duenio.cashMovement.create({
    data: { tenantId: base.b.id, type: "INGRESO", amount: 1000, reason: "qa", occurredAt: new Date("2026-08-14T15:00:00Z"), createdBy: "qa" },
  });
  const finDeAgosto = new Date("2026-09-01T03:00:00Z"); // 01/09 00:00 en Buenos Aires
  const hay = (tenantId: string, cerradoHasta: string | null) =>
    tenantTransaction((tx) => hayMovimientosSinCerrar(tx, tenantId, cerradoHasta, finDeAgosto), { tenantId });
  assert.equal(await hay(base.b.id, null), true, "B tiene un movimiento de caja sin cerrar en agosto");
  assert.equal(await hay(base.b.id, "2026-08-14"), false, "con la caja cerrada hasta el 14, ese movimiento ya no cuenta");
  assert.equal(await hay(base.b.id, "2026-08-13"), true, "cerrada hasta el 13, el del 14 sigue sin cerrar");
  assert.equal(await hay(base.a.id, null), false, "A no ve el movimiento de B");

  // ── 1) B, con caja sin cerrar: congelar no pasa y no escribe nada ──
  const deB = valor<E>(await comoB(() => congelarMesAction(null, form())));
  assert.equal(deB?.ok, false, JSON.stringify(deB));
  assert.deepEqual(await filasDe(base.b.id), []);

  // ── 2) A, sin movimientos: congela. Doble clic simultáneo con un tenantId forjado (el de B) ──
  const [c1, c2] = await Promise.all([
    comoA(() => congelarMesAction(null, form({ tenantId: base.b.id }))),
    comoA(() => congelarMesAction(null, form({ tenantId: base.b.id }))),
  ]);
  const resultados = [valor<E>(c1), valor<E>(c2)];
  assert.deepEqual(resultados.map((r) => r?.ok).sort(), [false, true], JSON.stringify(resultados));
  const filasA = await filasDe(base.a.id);
  assert.deepEqual(
    filasA.map((f) => [f.action, f.entityId]),
    [
      [CIERRE_DIARIO_ACTION, "2026-08-31"],
      [ACCION_CONGELAR, MES],
    ],
    "un cierre de caja hasta el 31/08 y un congelado: nada duplicado",
  );
  assert.equal((filasA[0].changes as { alCongelarElMes?: string; movimientos?: number }).alCongelarElMes, MES);
  assert.equal((filasA[0].changes as { movimientos?: number }).movimientos, 0);
  assert.equal(await tenantTransaction((tx) => lastClosedDayTx(tx, base.a.id), { tenantId: base.a.id }), "2026-08-31", "la caja de A quedó cerrada hasta el 31/08");
  assert.deepEqual(await filasDe(base.b.id), [], "el tenantId del formulario no cambia de negocio: B sigue sin tocar");

  // ── 3) El paquete: el de A sale FINAL; el de B, BORRADOR ──
  const bajar = async (como: typeof comoA) => {
    const r = valor<Response>(await como(() => paquete(new Request(`http://qa.local/admin/cierre-mes/paquete?mes=${MES}`))));
    assert.equal(r.status, 200);
    return r.text();
  };
  const deA = await bajar(comoA);
  assert.match(deA, /Versión final: mes congelado el /);
  assert.doesNotMatch(deA, /BORRADOR/);
  assert.match(await bajar(comoB), /BORRADOR: el mes no está congelado/);
});
