// GSG-FACT-011 · R4 (certificación vuelta 3) · el claim del lote y la guarda del re-proceso.
//   node --import tsx --test src/lib/bancos-suelta-claim-postgres.test.ts | grep -E "^# (pass|fail)|^not ok"
// A: facturarCobros confirmaba la factura y DESPUÉS fallaba el UPDATE que escribe invoiceId: el catch
//    soltaba el claim con la factura viva y un re-proceso con otro mapeo la volvía a facturar. Ahora el
//    invoiceId se escribe en la MISMA transacción que la factura: si falla, no queda factura.
// B: SET LOCAL lock_timeout no queda en la conexión (pool de 1).
// C: una fila `emitida` sin invoiceId cuyo cobro SÍ está en el libro (el proceso murió después de
//    confirmar la factura): el re-proceso la ve facturada por el libro y no la borra.
// D: una fila `emitida` sin factura ni libro (el proceso murió entre el claim y la factura) no bloquea
//    el re-proceso para siempre.
// E: un movimiento con fecha posterior a hoy (reloj inyectado) va a revisión, no sale solo.
process.env.DB_CONNECTION_LIMIT = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const laBase = baseEfimeraDelArchivo();
// El cobro de hoy (DD/MM/AAAA): dentro de la ventana de ARCA (H4), así el lote llega a facturar.
const HOY_AAAAMMDD = fechaFiscalDelDia();
const HOY_EXTRACTO = `${HOY_AAAAMMDD.slice(6, 8)}/${HOY_AAAAMMDD.slice(4, 6)}/${HOY_AAAAMMDD.slice(0, 4)}`;
const fd = (nombre: string, lineas: string[]) => {
  const f = new FormData();
  f.set("archivo", new File([lineas.join("\r\n")], nombre, { type: "text/csv" }));
  return f;
};

test("A: claim soltado tras facturar + re-proceso con otro mapeo → doble factura", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/bancos-actions");
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  const duenio = await prismaComoDuenio(base);
  const neg = base.a;
  const como = <T,>(f: () => Promise<T>) => ejecutarAccion({ negocio: neg, usuario: neg.duenia }, f);
  await duenio.tenant.update({
    where: { id: neg.id },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true },
  });

  const r1 = await como(() =>
    acciones.procesarExtractoAction(fd("x.csv", ["Fecha;Descripción;Débito;Crédito;Saldo", `${HOY_EXTRACTO};Transferencia recibida CBU 1;;4.000,00;4.000,00`])),
  );
  const v1 = (r1 as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.ok(v1.ok && v1.mapeo, JSON.stringify(v1));
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  assert.equal(fila.estadoPropuesta, "auto");

  // Falla transitoria del UPDATE invoiceId (después de que la factura se confirmó).
  await duenio.$executeRawUnsafe(`CREATE FUNCTION ataque_corte() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF OLD."invoiceId" IS NULL AND NEW."invoiceId" IS NOT NULL THEN RAISE EXCEPTION 'corte simulado'; END IF; RETURN NEW; END $$`);
  await duenio.$executeRawUnsafe(`CREATE TRIGGER ataque_corte BEFORE UPDATE ON "MovimientoImportado" FOR EACH ROW EXECUTE FUNCTION ataque_corte()`);
  const em1 = await emitirPropuestas(neg.id, "auto");
  await duenio.$executeRawUnsafe(`DROP TRIGGER ataque_corte ON "MovimientoImportado"`);
  await duenio.$executeRawUnsafe(`DROP FUNCTION ataque_corte()`);
  assert.equal(em1.errores.length, 1, JSON.stringify(em1));
  // R4 · La factura y el invoiceId van juntos: con el UPDATE caído, no quedó factura ni libro.
  assert.equal(await duenio.invoice.count({ where: { tenantId: neg.id } }), 0, "sin invoiceId no queda factura");
  assert.equal(await duenio.cobroFacturado.count({ where: { tenantId: neg.id } }), 0, "ni entrada en el libro");
  const suelta = await duenio.movimientoImportado.findUniqueOrThrow({ where: { id: fila.id } });
  assert.equal(suelta.estadoPropuesta, "auto", "sin factura, el claim se suelta para reintentar");

  // El usuario corrige el mapeo: la guarda no ve nada facturado (ni emitida ni invoiceId).
  const mapeo = { ...v1.mapeo, columnas: { ...v1.mapeo.columnas, descripcion: 4 } };
  const rc = await como(() => acciones.confirmarMapeoAction(v1.importacionId, mapeo));
  const vc = (rc as { valor: Awaited<ReturnType<typeof acciones.confirmarMapeoAction>> }).valor;
  const despues = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });

  // Se vuelve a emitir.
  // El cobro recreado cae a revisión (otra descripción): el usuario la aprueba y emite.
  const nueva = despues.find((d) => d.estadoPropuesta === "revision");
  if (nueva) {
    const ap = await como(() => acciones.completarRevisionAction(nueva.id, { docTipo: 96, docNro: "30111222", nombreReceptor: "Ana", descripcionServicio: "Venta" }));
    assert.ok((ap as { valor: { ok: boolean } }).valor.ok, JSON.stringify(ap));
  }
  const em2 = await emitirPropuestas(neg.id, nueva ? [nueva.id] : "auto");
  const movs = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id } });
  assert.ok(vc.ok, JSON.stringify(vc));
  assert.equal(em2.emitidas, 1, JSON.stringify(em2));
  assert.ok(movs.every((m) => m.estadoPropuesta !== "emitida" || m.invoiceId), "ninguna emitida sin factura");
  const facturas = await duenio.invoice.count({ where: { tenantId: neg.id } });
  assert.equal(
    facturas,
    1,
    `UN cobro, ${facturas} facturas. re-proceso ok=${vc.ok}; hash ${fila.hash.slice(0, 8)} → ${despues.map((d) => d.hash.slice(0, 8) + ":" + d.estadoPropuesta).join(",")}`,
  );
});

test("B: SET LOCAL lock_timeout no se filtra a la conexión del pool", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/bancos-actions");
  const { prisma } = await import("@/lib/prisma");
  const neg = base.b;
  const como = <T,>(f: () => Promise<T>) => ejecutarAccion({ negocio: neg, usuario: neg.duenia }, f);
  const r1 = await como(() =>
    acciones.procesarExtractoAction(fd("y.csv", ["Fecha;Descripción;Débito;Crédito;Saldo", "06/08/2026;Transferencia recibida CBU 2;;5.000,00;5.000,00"])),
  );
  assert.ok((r1 as { valor: { ok: boolean } }).valor.ok, JSON.stringify(r1));
  const [{ lock_timeout }] = await prisma.$queryRawUnsafe<{ lock_timeout: string }[]>("SHOW lock_timeout");
  const [{ pid }] = await prisma.$queryRawUnsafe<{ pid: number }[]>("SELECT pg_backend_pid() AS pid");
  assert.equal(lock_timeout, "0", `conexión ${pid} quedó con lock_timeout=${lock_timeout}`);
});

/** Extracto de una fila y su movimiento, del negocio `neg`, procesado con la acción real. */
async function extractoDeUnaFila(neg: NonNullable<Awaited<ReturnType<typeof laBase>>>["a"], linea: string) {
  const acciones = await import("@/lib/bancos-actions");
  const como = <T,>(f: () => Promise<T>) => ejecutarAccion({ negocio: neg, usuario: neg.duenia }, f);
  const r = await como(() => acciones.procesarExtractoAction(fd(`x-${Math.random()}.csv`, ["Fecha;Descripción;Débito;Crédito;Saldo", linea])));
  const v = (r as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.ok(v.ok && v.mapeo, JSON.stringify(v));
  const reprocesar = async () => {
    const mapeo = { ...v.mapeo!, columnas: { ...v.mapeo!.columnas, descripcion: 4 } };
    const rc = await como(() => acciones.confirmarMapeoAction(v.importacionId!, mapeo));
    return (rc as { valor: Awaited<ReturnType<typeof acciones.confirmarMapeoAction>> }).valor;
  };
  return { importacionId: v.importacionId!, reprocesar };
}

test("C: emitida sin invoiceId pero con su cobro en el libro → el re-proceso la ve facturada", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const neg = base.a;
  const { importacionId, reprocesar } = await extractoDeUnaFila(neg, "07/08/2026;Transferencia recibida CBU 3;;3.100,00;3.100,00");
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId } });
  // El proceso murió entre el COMMIT de la factura y la respuesta: emitida, sin invoiceId, en el libro.
  const factura = await duenio.invoice.create({
    data: { tenantId: neg.id, puntoVenta: 1, concepto: 1, docTipo: 99, docNro: "0", fecha: fila.fecha, neto: 3100, iva: 0, total: 3100, status: "PENDING" },
  });
  await duenio.cobroFacturado.create({ data: { tenantId: neg.id, clave: `banco:${fila.hash}`, invoiceId: factura.id, importe: 3100 } });
  await duenio.movimientoImportado.update({ where: { id: fila.id }, data: { estadoPropuesta: "emitida" } });

  const vc = await reprocesar();
  assert.equal(vc.ok, false, JSON.stringify(vc));
  assert.ok(await duenio.movimientoImportado.findUnique({ where: { id: fila.id } }), "la fila facturada no se borró");
});

test("D: emitida sin factura ni libro (murió entre el claim y la factura) → no bloquea el re-proceso", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const neg = base.b;
  const { importacionId, reprocesar } = await extractoDeUnaFila(neg, "08/08/2026;Transferencia recibida CBU 4;;2.200,00;2.200,00");
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId } });
  await duenio.movimientoImportado.update({ where: { id: fila.id }, data: { estadoPropuesta: "emitida" } });

  const vc = await reprocesar();
  assert.ok(vc.ok, JSON.stringify(vc));
  const despues = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId } });
  assert.equal(despues.length, 1);
  assert.notEqual(despues[0].estadoPropuesta, "emitida", "la fila se recreó con el mapeo nuevo");
  assert.equal(await duenio.invoice.count({ where: { tenantId: neg.id } }), 0);
});

test("E: un movimiento con fecha posterior a hoy va a revisión, no sale solo", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  const duenio = await prismaComoDuenio(base);
  const neg = base.b;
  await duenio.tenant.update({ where: { id: neg.id }, data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true } });
  const { importacionId } = await extractoDeUnaFila(neg, "20/08/2026;Transferencia recibida CBU 5;;1.300,00;1.300,00");
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId } });
  assert.equal(fila.estadoPropuesta, "auto");
  // Reloj inyectado: hoy es el 18/08/2026, el movimiento es del 20.
  const em = await emitirPropuestas(neg.id, [fila.id], { ahora: new Date("2026-08-18T15:00:00Z") });
  assert.equal(em.emitidas, 0, JSON.stringify(em));
  assert.equal(em.aRevision, 1, JSON.stringify(em));
  const despues = await duenio.movimientoImportado.findUniqueOrThrow({ where: { id: fila.id } });
  assert.equal(despues.estadoPropuesta, "revision");
  assert.match(despues.motivoRevision ?? "", /posterior a hoy/);
  assert.equal(await duenio.invoice.count({ where: { tenantId: neg.id, total: 1300 } }), 0);
});
