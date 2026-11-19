// MIA T07 (GSG-MIA-149) · observación de T05 sobre `gestion.server.ts:362` (`aplicarPlan`): una cuota de pago impaga ENLAZADA a un
// comprobante (M1) no puede cambiar de monto al regenerar el plan: si sube, las cuotas enlazadas pasan el total del comprobante
// (la invariante de `enlazarCuota`). Queda fija, como lo pagado, y la diferencia va a las otras cuotas del ítem.
// Postgres real, la app como `app_rls`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { RUBROS } from "./gestion-core";

const DIA = 86_400_000;

test("una cuota impaga enlazada a un comprobante no cambia de monto al regenerar el plan (gestion.server.ts:362)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const { regenerarCuotas } = await import("./gestion.server");
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const enA = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });
  const regenerar = () => ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, () => regenerarCuotas(a.id, p.id));

  const s = await duenio.supplier.create({ data: { tenantId: a.id, name: "Proveedor Enlazado" }, select: { id: true } });
  await duenio.proyectoProveedorFicha.create({ data: { tenantId: a.id, supplierId: s.id, anticipoPct: 50 } });
  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 9150, clientId: a.clientes[0], nombre: "Proyecto enlazado", servicio: "EVENTOS", etapa: "APROBADO", fechaEvento: new Date(Date.now() + 60 * DIA), anticipoClientePct: 50 }, select: { id: true } });
  const v = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-t07e-${p.id}-1-xxxxxxxxxx`, ivaPct: 21, enviadoEl: new Date() }, select: { id: true } });
  const item = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: v.id, rubro: RUBROS[0], descripcion: "Carpa", cantidad: 1, costo: 1000, precio: 2000, supplierId: s.id, proveedor: "Proveedor Enlazado" }, select: { id: true } });
  await regenerar();
  const pagos = () => duenio.proyectoCuota.findMany({ where: { tenantId: a.id, proyectoId: p.id, tipo: "PAGO", anuladoEl: null }, orderBy: { clave: "asc" }, select: { id: true, clave: true, monto: true } });
  const [anticipo, saldo] = await pagos();
  assert.deepEqual([anticipo.monto, saldo.monto], [500, 500]);

  // La factura del anticipo (500) enlazada a su cuota, sin pagar.
  const comp = await enA((tx) => tx.proyectoComprobante.create({ data: { tenantId: a.id, supplierId: s.id, tipo: "A", numero: "0001-00000001", fecha: new Date(), netoCentavos: BigInt(50000), totalCentavos: BigInt(50000), cargadoPorId: a.duenia.id, cargadoNombre: "Dirección" }, select: { id: true } }));
  await enA((tx) => tx.proyectoCuotaComprobante.create({ data: { tenantId: a.id, cuotaId: anticipo.id, comprobanteId: comp.id, creadoPor: "Dirección" } }));

  // El costo del ítem sube a 2.000: el plan pediría 1.000 de anticipo.
  await duenio.proyectoItem.update({ where: { id: item.id }, data: { costo: 2000 } });
  await regenerar();
  const despues = await pagos();
  const ant = despues.find((c) => c.id === anticipo.id)!;
  assert.equal(ant.monto, 500, "la cuota enlazada conserva su monto: si no, las enlazadas pasan el total del comprobante (500)");
  assert.equal(despues.reduce((x, c) => x + c.monto, 0), 2000, "la diferencia va al resto: el ítem se sigue pagando entero");
  const enlazado = await enA((tx) => tx.proyectoCuotaComprobante.findMany({ where: { comprobanteId: comp.id }, select: { cuota: { select: { monto: true } } } }));
  assert.ok(enlazado.reduce((x, e) => x + e.cuota.monto, 0) * 100 <= 50_000, "invariante de enlazarCuota: enlazadas ≤ total del comprobante");

  // Si el ítem sale del plan, la cuota enlazada no se anula sola (tiene una factura atada).
  await duenio.proyectoItem.update({ where: { id: item.id }, data: { supplierId: null } });
  await regenerar();
  const sigue = await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: anticipo.id }, select: { anuladoEl: true, monto: true } });
  assert.deepEqual([sigue.anuladoEl, sigue.monto], [null, 500]);
});
