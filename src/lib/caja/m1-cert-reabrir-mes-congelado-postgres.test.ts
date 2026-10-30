// M1-C7 (caso de la certificación, F1; arreglado: el tramo que cubría el cierre no puede tocar un mes congelado).
// CERT M1-C7 · «Reabrir el día nunca reabre un mes cerrado».
// Ataque: el cierre del día D (mes actual, abierto) cubre días de un mes ANTERIOR ya congelado (la
// dueña no cerró todos los días; el cierre arrastra desde el último). `validarReabrirDia` sólo mira
// el mes de D: reabre D, la frontera vuelve atrás y los días del mes congelado aceptan movimientos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("reabrir el día D no puede descongelar días de un mes congelado que ese cierre cubría", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const { reabrirDiaAction } = await import("@/lib/cierre-mes/acciones");
  const { addLibroEntry } = await import("@/lib/libro-caja-actions");
  const { lastClosedDay } = await import("@/lib/caja/frontera-cierre");
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");

  const form = (c: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(c)) fd.set(k, v); return fd; };
  const como = async <R>(n: NegocioDePrueba, u: UsuarioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };

  const hoy = dateStrInBusinessTz(new Date());
  const [y, m] = hoy.split("-").map(Number);
  const mesAnterior = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const diaDelMesCongelado = `${mesAnterior}-15`;
  const otroDiaDelMesCongelado = `${mesAnterior}-20`;
  const D = `${hoy.slice(0, 7)}-01`; // día del mes ACTUAL (abierto)
  const ultimoDelCongelado = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);

  // Venta del mes anterior, sin cerrar ese día: el cierre de D la arrastra.
  await duenio.cashMovement.create({
    data: { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 1_000, occurredAt: businessWallTimeToUtc(diaDelMesCongelado, "12:00"), createdBy: "seed" },
  });
  const cierre = await como(a, a.duenia, () => cerrarDia(form({ day: D, declarado_EFECTIVO: "1.000", columnas: "x" })));
  assert.equal(cierre?.ok, true, JSON.stringify(cierre));
  assert.equal(await como(a, a.duenia, () => lastClosedDay(a.id)), D);

  // El contador congela el mes anterior (la frontera D ya lo cubre entero).
  await duenio.auditLog.create({
    data: { tenantId: a.id, actor: `user:${a.duenia.id}`, action: "cierre-mes.congelar", entity: "CierreMes", entityId: mesAnterior, channel: "admin", changes: { por: "Contador" } },
  });

  // Antes de reabrir: el mes congelado rechaza un gasto con su fecha.
  const antes = await como(a, a.duenia, () => addLibroEntry(null, form({ type: "EGRESO", method: "EFECTIVO", amount: "500", detail: "gasto viejo", date: otroDiaDelMesCongelado })));
  assert.equal(antes?.ok, false, "con el día cerrado, el mes congelado no acepta movimientos");

  // La dueña reabre D (mes actual, no congelado).
  const r = await como(a, a.duenia, () => reabrirDiaAction(null, form({ day: D, motivo: "faltó cargar una venta del cuaderno" })));

  // Lo que el criterio exige: o se rechaza, o la frontera NO retrocede dentro del mes congelado.
  const frontera = await como(a, a.duenia, () => lastClosedDay(a.id));
  const despues = await como(a, a.duenia, () => addLibroEntry(null, form({ type: "EGRESO", method: "EFECTIVO", amount: "500", detail: "gasto viejo", date: otroDiaDelMesCongelado })));
  const metidoEnMesCongelado = await duenio.cashMovement.count({ where: { tenantId: a.id, reason: "gasto viejo" } });

  assert.equal(despues?.ok, false, `después de reabrir, el libro aceptó un gasto con fecha ${otroDiaDelMesCongelado} (mes congelado)`);
  assert.ok(
    !(r?.ok) || (frontera !== null && frontera >= ultimoDelCongelado),
    `reabrió D (${JSON.stringify(r)}) y la frontera quedó en ${frontera}: días de ${mesAnterior} (congelado) quedaron abiertos`,
  );
  assert.equal(metidoEnMesCongelado, 0, "un movimiento entró en un mes congelado");
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: b.id, reason: "gasto viejo" } }), 0);
});
