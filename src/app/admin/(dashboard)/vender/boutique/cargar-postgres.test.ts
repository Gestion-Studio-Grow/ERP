// ============================================================================
// EL MOSTRADOR BOUTIQUE EN UNA TANDA, contra Postgres efímero — tanda perf (P-1)
// ============================================================================
//
// `cargarMostradorBoutique()` con la sesión de la dueña, el rol de la app (app_rls) y RLS:
//   · trae LO MISMO que los lectores de siempre (`cargarVender`, `getPosStockSnapshot`,
//     `cargarBoutique`, `cargarTeclasDelMostrador`, `getAperturaEnVender`, `cuentasCorrientesDe`);
//   · lee el `Tenant` UNA vez y manda pocas sentencias (cuenta los mensajes a Postgres en el
//     `query` de pg: el BEGIN plegado con el set_config cuenta como uno, igual que en el log);
//   · no ve nada del otro negocio.
//
// Base efímera propia (src/test/base-efimera.ts); sin Postgres local, se saltea y lo dice.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";

let sentencias: string[] = [];
const queryOriginal = pg.Client.prototype.query;
pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
  const a0 = args[0] as string | { text?: string } | undefined;
  sentencias.push(typeof a0 === "string" ? a0 : (a0?.text ?? ""));
  return (queryOriginal as (...a: unknown[]) => unknown).apply(this, args);
} as typeof pg.Client.prototype.query;

const laBase = baseEfimeraDelArchivo();

function valor<T>(s: SalidaDeAccion<T>): T {
  assert.equal(s.tipo, "respuesta", JSON.stringify(s));
  return (s as { valor: T }).valor;
}

test("cargarMostradorBoutique: lo mismo que los lectores de siempre, el Tenant una vez y ≤ 20 sentencias", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  for (const n of [base.a, base.b]) {
    await duenio.tenant.update({ where: { id: n.id }, data: { blueprintId: "carniceria", modules: ["pos", "catalog", "clients", "cuentas-a-cobrar"] } });
    await duenio.auditLog.create({
      data: { tenantId: n.id, actor: "operator:test", action: "interruptor.encender", entity: "Interruptor", entityId: "mostrador-boutique", channel: "operador", changes: {} },
    });
  }
  const vacio = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Vacío", saleUnit: "WEIGHT", pricePerKg: 20000, unit: "kg", stock: 12, trackStock: true },
  });
  await duenio.product.create({ data: { tenantId: base.a.id, name: "Chorizo", saleUnit: "UNIT", price: 1900, unit: "u", trackStock: false, codigo: "779001" } });
  await duenio.product.create({ data: { tenantId: base.a.id, name: "Sin precio", saleUnit: "UNIT", unit: "u", trackStock: false } });
  await duenio.product.create({ data: { tenantId: base.b.id, name: "De B", saleUnit: "UNIT", price: 10, unit: "u", trackStock: false } });
  await duenio.order.create({
    data: {
      tenantId: base.a.id,
      code: 9100,
      status: "DELIVERED",
      channel: "COUNTER",
      fulfillment: "PICKUP",
      customerName: "Mostrador",
      customerPhone: "",
      paid: true,
      paymentMethod: "EFECTIVO",
      subtotal: 20000,
      total: 20000,
      items: { create: [{ tenantId: base.a.id, productId: vacio.id, name: "Vacío", saleUnit: "WEIGHT", quantity: 1, unitPrice: 20000, lineTotal: 20000 }] },
    },
  });

  const { cargarMostradorBoutique, permisosDelMostrador } = await import("./cargar");
  const { requireUser } = await import("@/lib/authz");
  const { interruptoresDelNegocio } = await import("@/cambios/interruptores.server");
  const { cargarVender, cargarBoutique } = await import("../datos");
  const { getPosStockSnapshot } = await import("@/lib/stock/pos-stock");
  const { cargarTeclasDelMostrador } = await import("../teclas.server");
  const { getAperturaEnVender } = await import("@/lib/caja-actions");
  const { cuentasCorrientesDe } = await import("@/lib/settlement/cuentas-corrientes.server");
  const { todayInBusinessTz } = await import("@/lib/datetime");
  const duenaA = { negocio: base.a, usuario: base.a.duenia };

  const r = valor(
    await ejecutarAccion(duenaA, async () => {
      const [user, interruptores] = await Promise.all([requireUser(), interruptoresDelNegocio()]);
      // Las guardas (sesión, apps del negocio) las cachea React en el pedido y ya las largó el layout;
      // fuera de un render no hay caché, así que se leen ANTES y se cuentan sólo las del mostrador.
      const permisos = await permisosDelMostrador(user);
      sentencias = [];
      const nuevo = await cargarMostradorBoutique({ user, tenantId: base.a.id, interruptores }, async () => permisos);
      const lo = [...sentencias];
      const hoy = todayInBusinessTz();
      const [vender, stock, extras, teclas, apertura, cuentas] = await Promise.all([
        cargarVender(base.a.id, hoy),
        getPosStockSnapshot(),
        cargarBoutique(base.a.id, hoy),
        cargarTeclasDelMostrador(base.a.id, user.role),
        getAperturaEnVender(),
        cuentasCorrientesDe(base.a.id),
      ]);
      return { nuevo, lo, vender, stock, extras, teclas, apertura, cuentas };
    }),
  );
  const { nuevo, lo } = r;
  const conTenant = lo.filter((s) => /"Tenant"/.test(s)).length;
  t.diagnostic(`cargarMostradorBoutique: ${lo.length} sentencias, ${conTenant} con "Tenant"`);
  assert.ok(lo.length <= 20, `manda ${lo.length} sentencias (meta ≤ 20 para el cargador)`);
  assert.ok(conTenant <= 1, `lee el Tenant ${conTenant} veces`);

  // Lo mismo que los lectores de siempre.
  assert.deepEqual(nuevo.products, r.vender.products);
  assert.deepEqual(nuevo.rapidos, r.vender.rapidos);
  assert.equal(nuevo.negocio, r.vender.negocio);
  assert.deepEqual(nuevo.stockById, r.stock.stockById);
  assert.equal(nuevo.activos, r.stock.activeProducts);
  assert.equal(nuevo.canManageCatalog, r.stock.canManageCatalog);
  assert.deepEqual(nuevo.envios, r.extras.envios);
  assert.equal(nuevo.diaCerrado, r.extras.diaCerrado);
  assert.deepEqual(nuevo.teclas, r.teclas);
  assert.deepEqual(nuevo.apertura, r.apertura);
  assert.equal(nuevo.cuentasCorrientes, r.cuentas);
  assert.equal(nuevo.desdeLaFicha, null);
  assert.deepEqual(
    nuevo.products.map((p) => p.name),
    ["Chorizo", "Vacío"],
    "sólo los de A con precio",
  );
  assert.equal(nuevo.activos, 3, "el aviso de «sin precios» cuenta también el que no tiene precio");
  assert.deepEqual(nuevo.rapidos, [vacio.id]);
});
