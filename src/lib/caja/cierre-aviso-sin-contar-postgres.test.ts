// El aviso al cerrar el día, EJECUTADO contra Postgres con la acción real: con plata en un medio que
// nadie contó no dice «No hubo diferencias» (re-prueba f6f44435, R5). Se sigue pudiendo cerrar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion } from "@/test/accion-de-servidor";
import { preparar } from "@/lib/caja/un-solo-esperado.arnes";

test("contra Postgres: con un medio sin contar el aviso lo dice; todo contado, «No hubo diferencias»", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  const c = await preparar(laBase);
  const { a, b } = laBase;
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const venta = (tenantId: string, method: "EFECTIVO" | "TRANSFERENCIA", amount: number) => ({
    tenantId,
    type: "VENTA" as const,
    method,
    amount,
    occurredAt: c.alMediodia(c.hoy),
    createdBy: "seed",
  });
  await c.duenio.cashMovement.createMany({
    data: [venta(a.id, "EFECTIVO", 5_000), venta(a.id, "TRANSFERENCIA", 47_000), venta(b.id, "EFECTIVO", 5_000)],
  });

  // La hoja nueva, como en la re-prueba: Efectivo contado y Transferencia sin contar.
  const fd = new FormData();
  for (const [k, v] of Object.entries({ day: c.hoy, columnas: "1", declarado_EFECTIVO: "5000" })) fd.set(k, v);
  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => cerrarDia(fd));
  assert.equal(r.tipo, "respuesta");
  const cierre = (r as { valor: { ok: boolean; message?: string } }).valor;
  assert.equal(cierre.ok, true, JSON.stringify(cierre));
  assert.doesNotMatch(cierre.message ?? "", /No hubo diferencias/);
  assert.match((cierre.message ?? "").replace(/\s/g, " "), /Lo contado coincidió con el libro\. Sin conciliar: Transferencia \(\$ ?47\.000,00\)\./);

  const todoContado = await c.cerrarElDia(b, c.hoy, "5000");
  assert.equal(todoContado?.ok, true, JSON.stringify(todoContado));
  assert.match((todoContado as { message: string }).message, /No hubo diferencias\./);
});
