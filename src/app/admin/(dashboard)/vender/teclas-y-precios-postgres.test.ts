// ============================================================================
// VENDER · TECLAS FIJADAS Y PRECIOS AL DÍA — las acciones REALES contra Postgres efímero (2A)
// ============================================================================
//
// Con la sesión de cada usuario y RLS (`app_rls`):
//   · la dueña de A fija teclas: una fila `TeclasFijadas` con el tenantId de A; los ids de OTRO
//     negocio, borrados o inventados se descartan; la versión vieja choca y no escribe;
//   · la recepción no fija teclas (sí vende);
//   · B no ve las de A ni pidiendo con la versión de A; guarda las suyas sin tocarlas;
//   · `preciosVigentesDelTicket` trae el precio de HOY sólo de productos del negocio de la sesión;
//   · la purga de la auditoría no borra la config (PURGE_EXEMPT_ENTITIES).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

test("teclas fijadas: la dueña guarda sólo productos suyos, la versión vieja choca, la recepción no fija, B no ve ni pisa las de A; precios al día por negocio", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { fijarTeclasDelMostrador, preciosVigentesDelTicket } = await import("./acciones-del-mostrador");
  const { leerTeclasFijadasDelNegocio } = await import("@/lib/vender/teclas-fijadas");
  const { PURGE_EXEMPT_ENTITIES } = await import("@/lib/audit-retention");

  const vacio = await duenio.product.create({ data: { tenantId: base.a.id, name: "Vacio UAT", saleUnit: "WEIGHT", pricePerKg: 28600, unit: "kg" } });
  const chorizo = await duenio.product.create({ data: { tenantId: base.a.id, name: "Chorizo UAT", saleUnit: "UNIT", price: 1900, unit: "u" } });
  const borrado = await duenio.product.create({ data: { tenantId: base.a.id, name: "Viejo UAT", saleUnit: "UNIT", price: 1, unit: "u", deletedAt: new Date() } });
  const deB = await duenio.product.create({ data: { tenantId: base.b.id, name: "Vela UAT", saleUnit: "UNIT", price: 5000, unit: "u" } });

  const duenaA = { negocio: base.a, usuario: base.a.duenia };
  const r1 = await ejecutarAccion(duenaA, () =>
    fijarTeclasDelMostrador({ ids: [chorizo.id, vacio.id, deB.id, borrado.id, "inventado", chorizo.id], version: null }),
  );
  assert.ok(r1.tipo === "respuesta" && r1.valor.ok, JSON.stringify(r1));
  const v1 = r1.tipo === "respuesta" && r1.valor.ok ? r1.valor : null;
  assert.deepEqual(v1?.ids, [chorizo.id, vacio.id], "sólo los productos vigentes de A, en su orden y sin repetir");
  const filas = await duenio.auditLog.findMany({ where: { entity: "TeclasFijadas" } });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tenantId, base.a.id);
  assert.equal(filas[0].entityId, base.a.id);

  // Otra pantalla abierta con «nunca guardado»: choca y no escribe.
  const choque = await ejecutarAccion(duenaA, () => fijarTeclasDelMostrador({ ids: [vacio.id], version: null }));
  assert.ok(choque.tipo === "respuesta" && !choque.valor.ok && /Otra persona cambió las teclas/.test(choque.valor.error), JSON.stringify(choque));
  assert.equal(await duenio.auditLog.count({ where: { entity: "TeclasFijadas" } }), 1);

  // La recepción vende, pero no ordena el mostrador.
  const recep = await ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, () => fijarTeclasDelMostrador({ ids: [vacio.id], version: v1?.version }));
  assert.ok(recep.tipo === "respuesta" && !recep.valor.ok && /las elige el dueño/.test(recep.valor.error), JSON.stringify(recep));
  assert.equal(await duenio.auditLog.count({ where: { entity: "TeclasFijadas" } }), 1);

  // B: con la versión de A no pisa nada de A; guarda lo suyo (y un id de A se descarta).
  const duenaB = { negocio: base.b, usuario: base.b.duenia };
  const rb = await ejecutarAccion(duenaB, () => fijarTeclasDelMostrador({ ids: [deB.id, vacio.id], version: null }));
  assert.ok(rb.tipo === "respuesta" && rb.valor.ok, JSON.stringify(rb));
  assert.deepEqual(rb.tipo === "respuesta" && rb.valor.ok ? rb.valor.ids : null, [deB.id]);
  const deA = await leerTeclasFijadasDelNegocio(duenio, base.a.id);
  assert.deepEqual(deA, { ids: [chorizo.id, vacio.id], version: v1?.version });
  const todas = await duenio.auditLog.findMany({ where: { entity: "TeclasFijadas" }, select: { tenantId: true, entityId: true } });
  assert.equal(todas.length, 2);
  assert.ok(todas.every((f) => f.tenantId === f.entityId));

  // Precios al día: sólo los del negocio de la sesión, con el precio de HOY.
  await duenio.product.update({ where: { id: vacio.id }, data: { pricePerKg: 29900 } });
  const pa = await ejecutarAccion(duenaA, () => preciosVigentesDelTicket([vacio.id, chorizo.id, deB.id, borrado.id, 42, "x y"]));
  assert.ok(pa.tipo === "respuesta", JSON.stringify(pa));
  assert.deepEqual(pa.tipo === "respuesta" ? pa.valor : null, {
    [vacio.id]: { price: null, pricePerKg: 29900 },
    [chorizo.id]: { price: 1900, pricePerKg: null },
  });
  const pb = await ejecutarAccion(duenaB, () => preciosVigentesDelTicket([vacio.id]));
  assert.deepEqual(pb.tipo === "respuesta" ? pb.valor : null, {}, "B no lee precios de A");

  // La purga de la auditoría no borra la configuración.
  assert.ok((PURGE_EXEMPT_ENTITIES as readonly string[]).includes("TeclasFijadas"));
});
