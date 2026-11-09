// Tanda plata · punto 3: el candado del lote de conciliación (src/lib/bancos-lote.ts).
//
// Contra Postgres real (base efímera con migraciones + RLS, src/test/base-efimera.ts), con dos
// conexiones de verdad intercaladas a mano:
//   · un reclamo de emisión abierto (lote FOR SHARE + auto→emitida, sin commit) hace ESPERAR al
//     re-proceso; al confirmarse, el re-proceso ve lo emitido y no borra nada;
//   · un re-proceso abierto (lote FOR UPDATE + borrado, sin commit) hace esperar al reclamo; al
//     confirmarse, el movimiento ya no existe y el reclamo no toma nada;
//   · lo ya atado a una factura (invoiceId) también frena el re-proceso;
//   · con la sesión de B, el lote de A no existe.
// Sin Postgres local se saltea y lo dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

async function sembrarLote(base: BaseEfimera, tenantId: string, n: number, extra: Record<string, unknown> = {}) {
  const duenio = (await prismaComoDuenio(base));
  const lote = await duenio.importacionBancaria.create({
    data: { tenantId, nombreArchivo: "extracto.csv", origen: "banco", archivo: new Uint8Array([1]), mapeoJson: {} },
    select: { id: true },
  });
  const movs: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = await duenio.movimientoImportado.create({
      data: {
        tenantId, importacionId: lote.id, hash: `h-${lote.id}-${i}`, fecha: "20261101", monto: 1000,
        descripcion: "transferencia", clasificacion: "venta", estadoPropuesta: "auto", ...extra,
      },
      select: { id: true },
    });
    movs.push(m.id);
  }
  return { lote: lote.id, movs };
}

/** Una conexión como la app (`app_rls`) con una transacción abierta y el negocio puesto. */
async function transaccionAbierta(base: BaseEfimera, tenantId: string) {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
  return c;
}

/** ¿La promesa sigue esperando después de `ms`? (está bloqueada por el candado) */
async function sigueEsperando(p: Promise<unknown>, ms = 400): Promise<boolean> {
  const marca = Symbol();
  const r = await Promise.race([p.then(() => null, () => null), new Promise((ok) => setTimeout(() => ok(marca), ms))]);
  return r === marca;
}

test("un reclamo de emisión en curso frena el re-proceso del lote: espera y después se niega", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { vaciarLoteProvisionalEnTx, LOTE_YA_FACTURADO } = await import("@/lib/bancos-lote");
  const { lote, movs } = await sembrarLote(base, base.a.id, 3);

  // La emisión: misma secuencia que bancos-glue.ts (lote FOR SHARE + reclamo), sin confirmar.
  const emision = await transaccionAbierta(base, base.a.id);
  await emision.query(`SELECT id FROM "ImportacionBancaria" WHERE id = $1 AND "tenantId" = $2 FOR SHARE`, [lote, base.a.id]);
  const reclamo = await emision.query(
    `UPDATE "MovimientoImportado" SET "estadoPropuesta" = 'emitida' WHERE id = $1 AND "estadoPropuesta" = 'auto'`, [movs[0]]);
  assert.equal(reclamo.rowCount, 1);

  const reproceso = tenantTransaction((tx) => vaciarLoteProvisionalEnTx(tx, base.a.id, lote), { tenantId: base.a.id });
  assert.equal(await sigueEsperando(reproceso), true, "el re-proceso tiene que esperar al reclamo");
  await emision.query("COMMIT");
  await emision.end();

  assert.deepEqual(await reproceso, { ok: false, error: LOTE_YA_FACTURADO });
  const quedan = await (await prismaComoDuenio(base)).movimientoImportado.findMany({ where: { importacionId: lote }, select: { id: true, estadoPropuesta: true } });
  assert.equal(quedan.length, 3, "no se borró nada del lote");
  assert.equal(quedan.find((m) => m.id === movs[0])?.estadoPropuesta, "emitida");
});

test("un re-proceso en curso frena el reclamo: al terminar, el movimiento ya no está y no se reclama", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { compartirLoteParaEmitirEnTx } = await import("@/lib/bancos-lote");
  const { lote, movs } = await sembrarLote(base, base.a.id, 2);

  // El re-proceso: SÓLO el lote FOR UPDATE, todavía sin borrar nada (sin bloqueo de fila sobre
  // el movimiento). Si el reclamo espera acá, lo frena el FOR SHARE del lote y no el DELETE.
  const reproceso = await transaccionAbierta(base, base.a.id);
  await reproceso.query(`SELECT id FROM "ImportacionBancaria" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`, [lote, base.a.id]);

  // El reclamo real de bancos-glue.ts.
  const reclamo = tenantTransaction(async (tx) => {
    await compartirLoteParaEmitirEnTx(tx, base.a.id, lote);
    return tx.movimientoImportado.updateMany({
      where: { id: movs[0], tenantId: base.a.id, estadoPropuesta: "auto" },
      data: { estadoPropuesta: "emitida" },
    });
  }, { tenantId: base.a.id });
  assert.equal(await sigueEsperando(reclamo), true, "el reclamo tiene que esperar al lote tomado");
  // Ya con el reclamo esperando, el re-proceso borra lo provisional y confirma.
  await reproceso.query(`DELETE FROM "MovimientoImportado" WHERE "importacionId" = $1`, [lote]);
  await reproceso.query("COMMIT");
  await reproceso.end();

  assert.equal((await reclamo).count, 0, "el movimiento borrado no se reclama");
});

test("lo atado a una factura frena el re-proceso; sin nada emitido, borra sólo ese lote", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { vaciarLoteProvisionalEnTx, LOTE_YA_FACTURADO } = await import("@/lib/bancos-lote");

  // `invoiceId` puesto con estado «auto» (vinculado a una factura de otro camino): no se borra.
  const atado = await sembrarLote(base, base.a.id, 1, { invoiceId: "factura-de-otro-camino" });
  const r1 = await tenantTransaction((tx) => vaciarLoteProvisionalEnTx(tx, base.a.id, atado.lote), { tenantId: base.a.id });
  assert.deepEqual(r1, { ok: false, error: LOTE_YA_FACTURADO });

  const libre = await sembrarLote(base, base.a.id, 2);
  const otro = await sembrarLote(base, base.a.id, 1);
  const r2 = await tenantTransaction((tx) => vaciarLoteProvisionalEnTx(tx, base.a.id, libre.lote), { tenantId: base.a.id });
  assert.deepEqual(r2, { ok: true });
  const duenio = (await prismaComoDuenio(base));
  assert.equal(await duenio.movimientoImportado.count({ where: { importacionId: libre.lote } }), 0);
  assert.equal(await duenio.movimientoImportado.count({ where: { importacionId: otro.lote } }), 1, "otro lote no se toca");
  assert.equal(await duenio.movimientoImportado.count({ where: { importacionId: atado.lote } }), 1);
});

test("con la sesión de B, el lote de A no existe: no se toma ni se vacía", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { vaciarLoteProvisionalEnTx } = await import("@/lib/bancos-lote");
  const { lote } = await sembrarLote(base, base.a.id, 2);
  const r = await tenantTransaction((tx) => vaciarLoteProvisionalEnTx(tx, base.b.id, lote), { tenantId: base.b.id });
  assert.deepEqual(r, { ok: false, error: "No se encontró la importación." });
  assert.equal(await (await prismaComoDuenio(base)).movimientoImportado.count({ where: { importacionId: lote } }), 2);
});

test("marcar «no facturable» no pisa un reclamo de emisión que entró en el medio", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { marcarNoFacturableAction } = await import("@/lib/bancos-actions");
  const { lote, movs } = await sembrarLote(base, base.a.id, 1);

  // La emisión reclamó el movimiento (auto → emitida) y todavía no confirmó: la acción lee «auto».
  const emision = await transaccionAbierta(base, base.a.id);
  await emision.query(`SELECT id FROM "ImportacionBancaria" WHERE id = $1 AND "tenantId" = $2 FOR SHARE`, [lote, base.a.id]);
  await emision.query(`UPDATE "MovimientoImportado" SET "estadoPropuesta" = 'emitida' WHERE id = $1`, [movs[0]]);

  const marcar = ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => marcarNoFacturableAction(movs[0]));
  assert.equal(await sigueEsperando(marcar), true, "la marca tiene que esperar al reclamo");
  await emision.query("COMMIT");
  await emision.end();

  const r = await marcar;
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta") return;
  assert.equal((r.valor as { ok: boolean }).ok, false, JSON.stringify(r.valor));
  const m = await (await prismaComoDuenio(base)).movimientoImportado.findUniqueOrThrow({ where: { id: movs[0] }, select: { estadoPropuesta: true } });
  assert.equal(m.estadoPropuesta, "emitida", "el reclamo confirmado no se pisó");
});
