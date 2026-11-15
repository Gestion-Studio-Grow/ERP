// GSG-FACT-011 · recertificación R: confirmar el mapeo (re-proceso) mientras se emiten las auto.
// El re-proceso borra y recrea las filas de la importación; si una ya se emitió, el cobro volvía
// como `auto` con otra clave y la regla de una factura por cobro no lo frenaba: doble factura.
// Correr: node --import tsx --test <este archivo> | grep -E "^# (pass|fail)|^not ok"
// Determinista: la carrera la fija un candado que toma el test (sin sleep): el re-proceso queda
// esperando el candado de importaciones DESPUÉS de mirar "nada emitido"; en ese hueco se "emite".
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const fd = (nombre: string, lineas: string[]) => {
  const f = new FormData();
  f.set("archivo", new File([lineas.join("\r\n")], nombre, { type: "text/csv" }));
  return f;
};

test("ATAQUE R: confirmar mapeo con una fila emitida en el medio → la borra y recrea el cobro como AUTO con otra clave", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/bancos-actions");
  const duenio = await prismaComoDuenio(base);
  const neg = base.a;
  const como = <T,>(f: () => Promise<T>) => ejecutarAccion({ negocio: neg, usuario: neg.duenia }, f);

  const r1 = await como(() =>
    acciones.procesarExtractoAction(fd("x.csv", ["Fecha;Descripción;Débito;Crédito;Saldo", "05/08/2026;Transferencia recibida CBU 1;;4.000,00;4.000,00"])),
  );
  const v1 = (r1 as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.ok(v1.ok && v1.mapeo, JSON.stringify(v1));
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  assert.equal(fila.estadoPropuesta, "auto");

  // El candado de importaciones lo toma el test y lo suelta cuando "emitió".
  let soltar!: () => void;
  const suelta = new Promise<void>((r) => (soltar = r));
  let tomado!: () => void;
  const yaTomado = new Promise<void>((r) => (tomado = r));
  const candado = duenio.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bancos-importacion:${neg.id}`}, 0))`;
      tomado();
      await suelta;
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
  await yaTomado;

  // Mapeo corregido (descripción ← otra columna): el usuario lo confirma.
  const mapeo = { ...v1.mapeo, columnas: { ...v1.mapeo.columnas, descripcion: 4 } };
  const confirmar = como(() => acciones.confirmarMapeoAction(v1.importacionId, mapeo));

  // Esperar a que el re-proceso pase la guarda "nada emitido" y quede trabado en el candado.
  for (;;) {
    const [{ n }] = await duenio.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
    if (n > BigInt(0)) break;
    await new Promise((r) => setImmediate(r));
  }
  // "Emitir automáticas" en ese hueco (el claim auto→emitida de emitirPropuestas).
  await duenio.movimientoImportado.update({ where: { id: fila.id }, data: { estadoPropuesta: "emitida" } });
  soltar();
  await candado;
  const rc = await confirmar;
  const vc = (rc as { valor: Awaited<ReturnType<typeof acciones.confirmarMapeoAction>> }).valor;

  const despues = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  // Lo que tiene que pasar: el re-proceso NO toca una importación con facturas emitidas.
  assert.equal(vc.ok, false, `re-procesó igual: ${JSON.stringify(despues.map((d) => [d.hash.slice(0, 8), d.estadoPropuesta]))} (antes ${fila.hash.slice(0, 8)} emitida)`);
});

test("R · claim en vuelo: el DELETE del re-proceso espera la fila, la ve emitida y no la borra; se deshace todo", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  if (process.env.AUTH_SECRET === undefined) process.env.AUTH_SECRET = "secreto-de-auth-qa";
  prepararAccionesDeServidor();
  const acciones = await import("@/lib/bancos-actions");
  const duenio = await prismaComoDuenio(base);
  const neg = base.b;
  const como = <T,>(f: () => Promise<T>) => ejecutarAccion({ negocio: neg, usuario: neg.duenia }, f);

  const r1 = await como(() =>
    acciones.procesarExtractoAction(fd("y.csv", ["Fecha;Descripción;Débito;Crédito;Saldo", "06/08/2026;Transferencia recibida CBU 2;;5.000,00;5.000,00"])),
  );
  const v1 = (r1 as { valor: Awaited<ReturnType<typeof acciones.procesarExtractoAction>> }).valor;
  assert.ok(v1.ok && v1.mapeo, JSON.stringify(v1));
  const [fila] = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  assert.equal(fila.estadoPropuesta, "auto");

  // El claim auto→emitida, en vuelo: la fila queda tomada (sin confirmar) hasta que el test suelta.
  let soltar!: () => void;
  const suelta = new Promise<void>((r) => (soltar = r));
  let tomada!: () => void;
  const yaTomada = new Promise<void>((r) => (tomada = r));
  const claim = duenio.$transaction(
    async (tx) => {
      const c = await tx.movimientoImportado.updateMany({ where: { id: fila.id, estadoPropuesta: "auto" }, data: { estadoPropuesta: "emitida" } });
      assert.equal(c.count, 1);
      tomada();
      await suelta;
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
  await yaTomada;

  // El re-proceso no ve el claim (no está confirmado): pasa el conteo y se traba en el DELETE.
  const mapeo = { ...v1.mapeo, columnas: { ...v1.mapeo.columnas, descripcion: 4 } };
  const confirmar = como(() => acciones.confirmarMapeoAction(v1.importacionId, mapeo));
  for (;;) {
    const [{ n }] = await duenio.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_locks WHERE locktype = 'transactionid' AND NOT granted`;
    if (n > BigInt(0)) break;
    await new Promise((r) => setImmediate(r));
  }
  soltar();
  await claim;
  const vc = (await confirmar as { valor: Awaited<ReturnType<typeof acciones.confirmarMapeoAction>> }).valor;

  assert.equal(vc.ok, false, "no re-procesa una importación con una fila emitida");
  assert.match(vc.ok ? "" : vc.error, /ya tiene facturas emitidas/);
  const despues = await duenio.movimientoImportado.findMany({ where: { tenantId: neg.id, importacionId: v1.importacionId } });
  assert.deepEqual(
    despues.map((d) => [d.id, d.hash, d.estadoPropuesta]),
    [[fila.id, fila.hash, "emitida"]],
    "la fila emitida sigue (misma clave) y no aparece otra auto del mismo cobro",
  );
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
