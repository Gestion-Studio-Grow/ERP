// El recorrido de aislamiento de «activar / borrar un producto», compartido por los dos archivos
// de test (con y sin RLS). Sólo lo importan tests: no es código de la app.

import assert from "node:assert/strict";
import type { PrismaClient } from "@/generated/prisma/client";
import type { BaseEfimera } from "@/test/base-efimera";
import type { ejecutarAccion as EjecutarAccion } from "@/test/accion-de-servidor";

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

export async function probarProductoDeOtroNegocio(
  base: BaseEfimera,
  duenio: PrismaClient,
  ejecutarAccion: typeof EjecutarAccion,
): Promise<void> {
  const { toggleProductActive, deleteProduct } = await import("@/lib/catalog-actions");
  const deB = await duenio.product.create({
    data: { tenantId: base.b.id, name: "Vacío de B", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 20000, active: true },
  });
  const deA = await duenio.product.create({
    data: { tenantId: base.a.id, name: "Vacío de A", unit: "kg", saleUnit: "WEIGHT", pricePerKg: 20000, active: true },
  });
  const comoA = { negocio: base.a, usuario: base.a.duenia };

  // A manda el id de B: la respuesta es la misma que para un id que no existe (no confirma nada).
  await assert.rejects(
    ejecutarAccion(comoA, () => toggleProductActive(form({ id: deB.id, active: "true" }))),
    /No se encontró el producto/,
  );
  await assert.rejects(
    ejecutarAccion(comoA, () => toggleProductActive(form({ id: "no-existe", active: "true" }))),
    /No se encontró el producto/,
  );
  await assert.rejects(ejecutarAccion(comoA, () => deleteProduct(form({ id: deB.id }))), /No se encontró el producto/);

  const b = await duenio.product.findUniqueOrThrow({ where: { id: deB.id } });
  assert.equal(b.active, true, "el producto de B sigue activo");
  assert.equal(b.deletedAt, null, "el producto de B sigue sin borrar");
  assert.equal(
    await duenio.auditLog.count({ where: { entity: "Product", entityId: deB.id } }),
    0,
    "no queda rastro de un borrado que no pasó",
  );

  // Con su propio producto, A sí puede: el predicado no rompe el camino feliz.
  const apagar = await ejecutarAccion(comoA, () => toggleProductActive(form({ id: deA.id, active: "true" })));
  assert.equal(apagar.tipo, "respuesta");
  assert.equal((await duenio.product.findUniqueOrThrow({ where: { id: deA.id } })).active, false);
  const borrar = await ejecutarAccion(comoA, () => deleteProduct(form({ id: deA.id })));
  assert.equal(borrar.tipo, "respuesta");
  assert.notEqual((await duenio.product.findUniqueOrThrow({ where: { id: deA.id } })).deletedAt, null);
}
