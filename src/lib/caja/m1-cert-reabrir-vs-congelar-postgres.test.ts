// Cert M1 F5 (vuelta 2; arreglado: congelarMesAction toma también el candado `cierre-dia:<tenant>` y
// corre en Serializable). Reabrir el día D y congelar el mes anterior A LA VEZ: se fuerza la
// intercalación reteniendo las escrituras en AuditLog (LOCK EXCLUSIVE deja leer y frena escribir)
// hasta que las dos leyeron. Antes, las dos confirmaban: mes congelado con la frontera ANTES de él.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("reabrir el día y congelar el mes que su cierre cubría, a la vez: nunca queda un mes congelado con días abiertos", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  const antes = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  t.after(() => {
    if (antes === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes;
  });
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a } = laBase;
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const { reabrirDiaAction, congelarMesAction } = await import("@/lib/cierre-mes/acciones");
  const { addLibroEntry } = await import("@/lib/libro-caja-actions");
  const { lastClosedDay } = await import("@/lib/caja/frontera-cierre");
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");
  const { operatorPrisma } = await import("@/lib/operator-db");
  laBase.alBorrar(() => operatorPrisma.$disconnect());

  const form = (c: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(c)) fd.set(k, v); return fd; };
  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}: ${JSON.stringify(r)}`);
    return (r as { valor: R }).valor;
  };

  const hoy = dateStrInBusinessTz(new Date());
  const [y, m] = hoy.split("-").map(Number);
  const mesAnterior = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const D = `${hoy.slice(0, 7)}-01`;
  const ultimoDelCongelado = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);

  await duenio.cashMovement.create({
    data: { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 1_000, occurredAt: businessWallTimeToUtc(`${mesAnterior}-15`, "12:00"), createdBy: "seed" },
  });
  const cierre = await como(a, a.duenia, () => cerrarDia(form({ day: D, declarado_EFECTIVO: "1.000", columnas: "x" })));
  assert.equal(cierre?.ok, true, JSON.stringify(cierre));

  const candado = duenio.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('LOCK TABLE "AuditLog" IN EXCLUSIVE MODE');
    await dormir(3000);
  }, { timeout: 20_000 });
  await dormir(150);
  const [reabrir, congelar] = await Promise.all([
    como(a, a.duenia, () => reabrirDiaAction(null, form({ day: D, motivo: "faltó cargar una venta del cuaderno" }))),
    como(a, a.duenia, () => congelarMesAction(null, form({ mes: mesAnterior, confirmo: "1" }))),
    candado,
  ]);

  const congelado = await duenio.auditLog.count({ where: { tenantId: a.id, entity: "CierreMes", action: "cierre-mes.congelar", entityId: mesAnterior } });
  const frontera = await como(a, a.duenia, () => lastClosedDay(a.id));
  const gasto = await como(a, a.duenia, () =>
    addLibroEntry(null, form({ type: "EGRESO", method: "EFECTIVO", amount: "500", detail: "gasto en mes congelado", date: `${mesAnterior}-20` })),
  );
  assert.ok(
    !(congelado > 0 && (frontera === null || frontera < ultimoDelCongelado)),
    `reabrir=${JSON.stringify(reabrir)} congelar=${JSON.stringify(congelar)}: ${mesAnterior} congelado con la frontera en ${frontera}`,
  );
  assert.equal(gasto?.ok === true && congelado > 0, false, `el libro aceptó un gasto con fecha de ${mesAnterior} (congelado)`);
});
