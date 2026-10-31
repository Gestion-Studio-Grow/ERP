// La devolución a proveedor ofrecía «Transferencia / Mercado Pago» y grababa `MP`: una transferencia
// caía en la columna de Mercado Pago. El mismo error que la comisión (UAT CH 31/10, E1). Del formulario
// a la base: cada medio entra por SU columna del libro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("del formulario a la base: el reintegro por transferencia entra por Transferencia, y el de Mercado Pago, por Mercado Pago", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a } = laBase;
  const { destinoDelFormulario, registrarDevolucion } = await import("./supplier-return");

  const producto = await duenio.product.create({ data: { tenantId: a.id, name: "Vacío", saleUnit: "UNIT", price: 6_000, stock: 50, trackStock: true } });
  let code = 0;
  /** Una compra de 10 unidades a $1.000, y devolver una con este medio. */
  const devolverCon = async (medio: string) => {
    code += 1;
    const compra = await duenio.stockPurchase.create({
      data: { tenantId: a.id, code, kind: "COMPRA", totalCost: 10_000, createdBy: "test", items: { create: [{ tenantId: a.id, productId: producto.id, name: "Vacío", quantity: 10, unitCost: 1_000 }] } },
    });
    const f = new FormData();
    f.set("destino", "caja");
    f.set("medio", medio);
    const destino = destinoDelFormulario(f);
    assert.ok(destino, `el medio ${medio} se reconoce`);
    const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () =>
      registrarDevolucion(a.id, { purchaseId: compra.id, motivo: "vencido", lineas: [{ productId: producto.id, cantidad: "1" }], destino, by: `user:${a.duenia.id}` }),
    );
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return duenio.cashMovement.findFirstOrThrow({ where: { tenantId: a.id, createdBy: { endsWith: compra.id } }, select: { type: true, method: true, amount: true } });
  };

  const porTransferencia = await devolverCon("TRANSFERENCIA");
  assert.deepEqual([porTransferencia.type, porTransferencia.method, Number(porTransferencia.amount)], ["INGRESO", "TRANSFERENCIA", 1_000]);
  const porMercadoPago = await devolverCon("MP");
  assert.deepEqual([porMercadoPago.type, porMercadoPago.method, Number(porMercadoPago.amount)], ["INGRESO", "MP", 1_000]);
  const enEfectivo = await devolverCon("EFECTIVO");
  assert.deepEqual([enEfectivo.type, enEfectivo.method, Number(enEfectivo.amount)], ["INGRESO", "EFECTIVO", 1_000]);

  const reconoce = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return destinoDelFormulario(f);
  };
  assert.equal(reconoce({ destino: "caja", medio: "CUALQUIERA" }), null, "un medio que no existe no se asume");
  assert.deepEqual(reconoce({ destino: "ninguno" }), { tipo: "ninguno" });
});
