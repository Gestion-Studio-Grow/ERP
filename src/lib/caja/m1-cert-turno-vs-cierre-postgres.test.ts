// M1-C5 (caso de la certificación, F4; arreglado: candado `cierre-dia:` compartido y frontera releída al abrir).
// CERT M1-C5 · «cerrarDia rechaza si hay turno abierto»; el comentario de cerrar-dia dice que un turno
// que se abre mientras tanto «aborta una de las dos» (Serializable). Ataque: cierre del día que CUADRA
// (sin ajustes) y apertura de turno a la vez. Se fuerza la intercalación reteniendo los INSERT (LOCK
// EXCLUSIVE deja leer y frena escribir) hasta que las dos leyeron. Sin ajuste no hay ciclo SSI: commitean
// las dos → día cerrado HOY con un turno ABIERTO hoy (su APERTURA cae en un día congelado).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const DIA_MS = 24 * 60 * 60 * 1000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("cerrar el día y abrir un turno a la vez: nunca quedan un día cerrado y un turno abierto ese día", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "6", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a } = laBase;
  const { openCashSession } = await import("@/lib/caja-actions");
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const { CAMPO_ESPERADO_CONFIRMADO } = await import("@/lib/caja/esperado-del-cajon");
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");
  const form = (c: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(c)) fd.set(k, v); return fd; };
  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };

  const hoy = dateStrInBusinessTz(new Date());
  const ayer = dateStrInBusinessTz(new Date(Date.now() - DIA_MS));
  await duenio.cashMovement.create({
    data: { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 5_000, occurredAt: businessWallTimeToUtc(ayer, "12:00"), createdBy: "seed" },
  });

  const candado = duenio.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('LOCK TABLE "AuditLog", "CashSession" IN EXCLUSIVE MODE');
    await dormir(2500);
  }, { timeout: 15_000 });
  await dormir(150);
  const [cierre, apertura] = await Promise.all([
    como(a, a.duenia, () => cerrarDia(form({ day: hoy, declarado_EFECTIVO: "5.000", columnas: "x" }))),
    como(a, a.recepcion, () => openCashSession(null, form({ openingFloat: "5.000", [CAMPO_ESPERADO_CONFIRMADO]: "5000" }))),
    candado,
  ]);

  const cerrado = await duenio.auditLog.count({ where: { tenantId: a.id, entity: "CierreDiario", action: "caja.cierre-diario", entityId: hoy } });
  const abiertos = await duenio.cashSession.count({ where: { tenantId: a.id, status: "OPEN" } });
  assert.ok(
    !(cerrado === 1 && abiertos === 1),
    `quedaron las dos: cierre=${JSON.stringify(cierre)} apertura=${JSON.stringify(apertura)} (día ${hoy} cerrado con ${abiertos} turno abierto)`,
  );
});
