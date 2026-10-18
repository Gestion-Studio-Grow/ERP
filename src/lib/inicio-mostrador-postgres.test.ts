// El Inicio de un mostrador (getRetailDashboardData) CONTRA POSTGRES, con el rol de la app
// (app_rls) y RLS encendido, ejecutado como Server Action con la sesión de la dueña del negocio A.
// Lo que se prueba es lo que encontró el UAT de MAGRA del 18/10: un pedido de la tienda recién
// entrado, todavía sin pesar ni cobrar, sumaba en «Ventas hoy» e «Ingresos hoy» como si fuera plata.
// "Ingresos" es lo cobrado con medio (el `where` de Vender y de Ventas del día); el pedido sin
// cobrar, el anulado y la venta a cuenta no son plata que entró. El negocio B tiene una venta
// cobrada que no se puede colar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("contra Postgres: el Inicio del mostrador cuenta como ingreso sólo lo cobrado, no el pedido web sin cobrar", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  await duenio.tenant.update({ where: { id: a.id }, data: { blueprintId: "carniceria", modules: ["pos", "catalog", "clients"] } });

  const venta = (tenantId: string, code: number, data: Record<string, unknown>) =>
    duenio.order.create({ data: { tenantId, code: 100 + code, customerName: "Clienta", customerPhone: "11 2345 6789", subtotal: 0, total: 0, ...data } });
  // A: cobrada en efectivo (cuenta), pedido web sin cobrar (no), anulada cobrada (no), a cuenta (no).
  await venta(a.id, 1, { channel: "COUNTER", total: 15500, subtotal: 15500, paid: true, paymentMethod: "EFECTIVO" });
  await venta(a.id, 2, { channel: "ONLINE", status: "PENDING", total: 31850, subtotal: 31850, paid: false });
  await venta(a.id, 3, { channel: "COUNTER", status: "CANCELLED", total: 9000, subtotal: 9000, paid: true, paymentMethod: "EFECTIVO" });
  await venta(a.id, 4, { channel: "COUNTER", total: 7000, subtotal: 7000, paid: true, paymentMethod: null });
  // B: cobrada, no se puede colar en A.
  await venta(b.id, 1, { channel: "COUNTER", total: 99999, subtotal: 99999, paid: true, paymentMethod: "MERCADOPAGO" });

  const { getRetailDashboardData } = await import("@/lib/actions");
  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => getRetailDashboardData());
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.equal(r.valor.todaySalesCount, 1, "sólo la venta cobrada con medio es una venta del día");
  assert.equal(r.valor.todayRevenue, 15500, "el pedido web sin cobrar no es plata que entró");
  assert.equal(r.valor.weekRevenue, 15500);
});
