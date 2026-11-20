// ============================================================================
// GSG-MIA-253 · el plan de cuotas se lee ENTERO con la conexión de su transacción (Postgres de verdad: base efímera migrada,
// rol app_rls sin BYPASSRLS, RLS prendido).
//
// Hallazgo: la pestaña Finanzas de un proyecto (Administración) daba error con el pool en una conexión
// (`DB_CONNECTION_LIMIT=1`, el arranque de la demo local): `pagosPorRevisar` abre una transacción y adentro `planVigente`
// leía los días del plan (`diasDelPlan`) con el cliente global, que pide OTRA conexión. Con una sola, esa consulta espera
// a que la transacción la suelte y la transacción la espera a ella: vence a los 5 s. Con más conexiones no se traba, pero
// la consulta sale por una conexión sin el negocio de la transacción: con RLS no ve los parámetros del negocio y el plan
// sale con los días del rubro (los de por defecto), en el aviso y en `regenerarCuotas`.
//
// Sin Postgres local se saltea y lo dice; en CI, falla.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const DIA = 86_400_000;
const EVENTO = new Date(Date.now() + 120 * DIA);

test("MIA-253 · con una sola conexión, el aviso de pagos por revisar responde y el plan usa los días del negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  // Como el arranque de la demo local: UNA conexión. La espera por conexión queda en la de siempre (10 s), más que los 5 s
  // de la transacción: así se traba si algo adentro pide otra conexión.
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "1" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;

  const supplierId = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor MIA-253" }, select: { id: true } })).id;
  const p = await duenio.proyecto.create({
    data: { tenantId: a.id, numero: 25301, clientId: a.clientes[0], nombre: "MIA-253", servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(EVENTO.getTime() - 2 * DIA), fechaEvento: EVENTO, fechaDesarme: new Date(EVENTO.getTime() + DIA) },
    select: { id: true },
  });
  const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `mia253-${p.id}`, ivaPct: 21 }, select: { id: true } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000, costo: 400, supplierId } });
  // Un parámetro del negocio distinto del rubro (30): el plan tiene que leerlo.
  // (La tabla de parámetros tiene RLS forzado: también el dueño escribe con el negocio puesto.)
  await duenio.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
    await tx.proyectoParametro.create({ data: { tenantId: a.id, clave: "plan.anticipoProveedorDiasAntes", valor: 45, actualizadoPor: "test", actualizadoNombre: "MIA-253" } });
  });

  const gestion = await import("./gestion.server");
  const desde = Date.now();
  const n = await gestion.pagosPorRevisar(a.id, p.id);
  const ms = Date.now() - desde;
  // Sin cuotas escritas, todas las de PAGO del plan están por revisar (anticipo y saldo al proveedor).
  assert.ok(n > 0, `pagos por revisar: ${n}`);
  assert.ok(ms < 4_000, `la lectura tardó ${ms} ms: algo adentro de la transacción esperó otra conexión`);

  // Los días del plan, adentro de una transacción como la de `regenerarCuotas` (15 s): los del negocio, no los del rubro.
  const { tenantTransaction } = await import("@/lib/rls");
  const { diasDelPlan } = await import("./presupuesto-m2.server");
  const dias = await tenantTransaction((tx) => diasDelPlan(a.id, tx), { tenantId: a.id, timeoutMs: 15_000 });
  assert.equal(dias.anticipoProveedorAntes, 45, "el anticipo al proveedor sale del parámetro del negocio");
});
