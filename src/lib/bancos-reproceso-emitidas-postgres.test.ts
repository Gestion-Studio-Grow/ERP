// GSG-FACT-011 · recertificación R: confirmar el mapeo (re-proceso) mientras se emiten las auto.
// El re-proceso borra y recrea las filas de la importación; si una ya se emitió, el cobro volvía
// como `auto` con otra clave y la regla de una factura por cobro no lo frenaba: doble factura.
// Correr: node --import tsx --test <este archivo> | grep -E "^# (pass|fail)|^not ok"
// Determinista: la carrera la fija un candado que toma el test (sin sleep): el re-proceso queda
// esperando el candado de importaciones DESPUÉS de mirar "nada emitido"; en ese hueco se emite.
// R4 (vuelta 3): una fila `emitida` SIN factura ni libro ya no bloquea el re-proceso (el proceso pudo
// morir entre el claim y la factura); la emisión que siga en vuelo se deshace sola en su `alFacturar`.
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
type Duenio = Awaited<ReturnType<typeof prismaComoDuenio>>;
/**
 * Espera a que alguien quede trabado en el candado advisory que tiene `pidDelCandado` (la conexión
 * de la transacción del test). No mira las esperas de todo el servidor: `pg_locks` es global y, en CI,
 * los otros archivos (cada uno con su base) también esperan candados advisory (PLAT-026).
 */
async function esperarTrabadoEnMiCandado(duenio: Duenio, pidDelCandado: number, topeMs = 15_000) {
  const limite = Date.now() + topeMs;
  for (;;) {
    const [{ n }] = await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_locks l
      WHERE l.locktype = 'advisory' AND NOT l.granted AND ${pidDelCandado}::int = ANY(pg_blocking_pids(l.pid))`;
    if (n > 0) return;
    if (Date.now() > limite) assert.fail(`nadie quedó esperando el candado del test (pid ${pidDelCandado}) en ${topeMs} ms`);
    await new Promise((r) => setImmediate(r));
  }
}

test("ATAQUE R: confirmar mapeo con una fila facturada en el medio → la borra y recrea el cobro como AUTO con otra clave", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/bancos-actions");
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  const duenio = await prismaComoDuenio(base);
  const neg = base.b;
  const como = <T,>(f: () => Promise<T>) => ejecutarAccion({ negocio: neg, usuario: neg.duenia }, f);
  await duenio.tenant.update({ where: { id: neg.id }, data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true } });

  const r1 = await como(() =>
    acciones.procesarExtractoAction(fd("x.csv", ["Fecha;Descripción;Débito;Crédito;Saldo", `${HOY_EXTRACTO};Transferencia recibida CBU 1;;4.000,00;4.000,00`])),
  );
  const v1 = (r1 as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.ok(v1.ok && v1.mapeo, JSON.stringify(v1));
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  assert.equal(fila.estadoPropuesta, "auto");

  // El candado de importaciones lo toma el test y lo suelta cuando "emitió".
  let soltar!: () => void;
  const suelta = new Promise<void>((r) => (soltar = r));
  let tomado!: (pid: number) => void;
  const yaTomado = new Promise<number>((r) => (tomado = r));
  const candado = duenio.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bancos-importacion:${neg.id}`}, 0))`;
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      tomado(pid);
      await suelta;
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
  const pidDelCandado = await yaTomado;

  // Mapeo corregido (descripción ← otra columna): el usuario lo confirma.
  const mapeo = { ...v1.mapeo, columnas: { ...v1.mapeo.columnas, descripcion: 4 } };
  const confirmar = como(() => acciones.confirmarMapeoAction(v1.importacionId, mapeo));

  // Esperar a que el re-proceso pase la guarda "nada emitido" y quede trabado en el candado.
  await esperarTrabadoEnMiCandado(duenio, pidDelCandado);
  // "Emitir automáticas" en ese hueco: el lote real (claim, factura e invoiceId en su transacción).
  const em = await emitirPropuestas(neg.id, [fila.id]);
  assert.equal(em.emitidas, 1, JSON.stringify(em));
  soltar();
  await candado;
  const rc = await confirmar;
  const vc = (rc as { valor: Awaited<ReturnType<typeof acciones.confirmarMapeoAction>> }).valor;

  const despues = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  // Lo que tiene que pasar: el re-proceso NO toca una importación con facturas emitidas.
  assert.equal(vc.ok, false, `re-procesó igual: ${JSON.stringify(despues.map((d) => [d.hash.slice(0, 8), d.estadoPropuesta]))} (antes ${fila.hash.slice(0, 8)} emitida)`);
  assert.equal(await duenio.invoice.count({ where: { tenantId: neg.id, total: 4000 } }), 1, "un cobro, una factura");
});

test("R4 · emisión en vuelo: el re-proceso borra la fila `emitida` sin factura y la emisión se deshace sola", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/bancos-actions");
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  const duenio = await prismaComoDuenio(base);
  const neg = base.b;
  const como = <T,>(f: () => Promise<T>) => ejecutarAccion({ negocio: neg, usuario: neg.duenia }, f);
  await duenio.tenant.update({ where: { id: neg.id }, data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true } });

  const r1 = await como(() =>
    acciones.procesarExtractoAction(fd("y.csv", ["Fecha;Descripción;Débito;Crédito;Saldo", `${HOY_EXTRACTO};Transferencia recibida CBU 2;;5.000,00;5.000,00`])),
  );
  const v1 = (r1 as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.ok(v1.ok && v1.mapeo, JSON.stringify(v1));
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  assert.equal(fila.estadoPropuesta, "auto");

  // El test toma el candado de la clave del cobro (`banco:<hash>`): la emisión hace el claim
  // (auto→emitida, confirmado) y queda trabada en `facturarCobros`, antes de crear la factura.
  let soltar!: () => void;
  const suelta = new Promise<void>((r) => (soltar = r));
  let tomado!: (pid: number) => void;
  const yaTomado = new Promise<number>((r) => (tomado = r));
  const candado = duenio.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cobro-facturado:${neg.id}:banco:${fila.hash}`}))`;
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      tomado(pid);
      await suelta;
    },
    { timeout: 30_000, maxWait: 20_000 },
  );
  const pidDelCandado = await yaTomado;
  const emision = emitirPropuestas(neg.id, [fila.id]);
  await esperarTrabadoEnMiCandado(duenio, pidDelCandado);
  assert.equal((await duenio.movimientoImportado.findUniqueOrThrow({ where: { id: fila.id } })).estadoPropuesta, "emitida");

  // El re-proceso: la fila `emitida` no tiene factura ni libro → no cuenta como facturada.
  const mapeo = { ...v1.mapeo, columnas: { ...v1.mapeo.columnas, descripcion: 4 } };
  const vc = ((await como(() => acciones.confirmarMapeoAction(v1.importacionId, mapeo))) as { valor: Awaited<ReturnType<typeof acciones.confirmarMapeoAction>> }).valor;
  assert.ok(vc.ok, JSON.stringify(vc));

  // La emisión sigue: crea la factura, no encuentra su fila `emitida` y se deshace todo.
  soltar();
  await candado;
  const em = await emision;
  assert.equal(em.emitidas, 0, JSON.stringify(em));
  assert.equal(em.errores.length, 1, JSON.stringify(em));
  assert.equal(await duenio.invoice.count({ where: { tenantId: neg.id, total: 5000 } }), 0, "la factura en vuelo se deshizo");
  assert.equal(await duenio.cobroFacturado.count({ where: { tenantId: neg.id, clave: `banco:${fila.hash}` } }), 0);

  // El cobro recreado se emite una sola vez.
  const despues = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  assert.equal(despues.length, 1);
  if (despues[0].estadoPropuesta === "revision") {
    const ap = await como(() => acciones.completarRevisionAction(despues[0].id, { docTipo: 96, docNro: "30111222", nombreReceptor: "Ana", descripcionServicio: "Venta" }));
    assert.ok((ap as { valor: { ok: boolean } }).valor.ok, JSON.stringify(ap));
  }
  const em2 = await emitirPropuestas(neg.id, [despues[0].id]);
  assert.equal(em2.emitidas, 1, JSON.stringify(em2));
  assert.equal(await duenio.invoice.count({ where: { tenantId: neg.id, total: 5000 } }), 1, "un cobro, una factura");
});

test("aviso viejo: una revisión aprobada cuyo cobro se facturó después de importar se ATA a esa factura, no emite otra", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/bancos-actions");
  const { emitirPropuestas } = await import("@/lib/bancos-glue");
  const { claveCobroBanco, facturarCobros } = await import("@/lib/facturacion/cobros-facturados");
  const duenio = await prismaComoDuenio(base);
  const neg = base.a;
  const como = <T,>(f: () => Promise<T>) => ejecutarAccion({ negocio: neg, usuario: neg.duenia }, f);
  await duenio.tenant.update({
    where: { id: neg.id },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true, bancosUmbralIdentificacion: 1000 },
  });

  // Importado: sobre el umbral → a revisión (al importar, nada estaba facturado).
  const r1 = await como(() =>
    acciones.procesarExtractoAction(fd("z.csv", ["Fecha;Descripción;Débito;Crédito;Saldo", "07/08/2026;Transferencia recibida CBU 3;;6.000,00;6.000,00"])),
  );
  const v1 = (r1 as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.ok(v1.ok, JSON.stringify(v1));
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  assert.equal(fila.estadoPropuesta, "revision");

  // Otro camino factura ESE cobro (su clave) después de importar: el aviso quedó viejo.
  const otra = await facturarCobros(
    {
      tenantId: neg.id,
      concepto: 1,
      fecha: fila.fecha,
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 6000,
      iva: [],
      total: 6000,
      medioDePago: "otro",
    },
    [{ clave: claveCobroBanco(fila.hash), importe: 6000 }],
  );

  // Se aprueba la revisión y se emite: la regla de una factura por cobro la ata a la existente.
  const ap = await como(() => acciones.completarRevisionAction(fila.id, { docTipo: 96, docNro: "30111222", nombreReceptor: "Ana", descripcionServicio: "Venta" }));
  assert.ok((ap as { valor: { ok: boolean } }).valor.ok, JSON.stringify(ap));
  const em = await emitirPropuestas(neg.id, [fila.id]);
  assert.equal(em.emitidas, 0, JSON.stringify(em));
  const mov = await duenio.movimientoImportado.findUniqueOrThrow({ where: { id: fila.id } });
  assert.equal(mov.estadoPropuesta, "emitida");
  assert.equal(mov.invoiceId, otra, "atada a la factura que ya cubría el cobro");
  assert.equal(await duenio.invoice.count({ where: { tenantId: neg.id } }), 1, "un cobro, una factura");
});
