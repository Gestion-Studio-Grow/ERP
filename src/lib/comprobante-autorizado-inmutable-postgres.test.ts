// ENG-022 · Un comprobante con CAE no se puede editar ni borrar EN LA BASE (no sólo en el código).
// Migración: prisma/migrations/20260925150000_comprobante_autorizado_inmutable (trigger + función);
// reversa: rollback.sql en la misma carpeta.
//
// Contra Postgres real, en una base efímera (src/test/base-efimera.ts) armada con
// `prisma migrate deploy` + RLS, como producción:
//   · como `app_rls` (la app, con el negocio puesto) y como el dueño de las tablas: cambiar
//     cualquier campo fiscal de un comprobante autorizado falla y la fila queda igual; borrarlo
//     falla;
//   · sin CAE (pendiente, rechazada) editar y borrar siguen permitidos, y el paso normal de
//     pendiente a autorizada — el código real, `createInvoice` + `registerFiscalDocument` — anda;
//   · borrar el pedido de origen deja la factura sin enlace (la FK SET NULL), pero moverla a otro
//     pedido falla;
//   · la reversa saca la protección sin tocar filas y `prisma migrate deploy` la vuelve a poner.
// Sin Postgres local se saltea y lo dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { runInTenantContext } from "@/lib/tenant-context";

const laBase = baseEfimeraDelArchivo();
const MIGRACION = "20260925150000_comprobante_autorizado_inmutable";
const CARPETA = path.join(process.cwd(), "prisma", "migrations", MIGRACION);
/** SQLSTATE `restrict_violation`: el que usa el trigger. */
const RESTRICCION = "23001";

type Fila = Record<string, unknown>;

/** Corre una sentencia como `app_rls`, con el negocio puesto en la transacción (como `tenantTransaction`). */
async function comoApp(base: BaseEfimera, tenantId: string, sql: string, params: unknown[] = []): Promise<number> {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const r = await c.query(sql, params);
    await c.query("COMMIT");
    return r.rowCount ?? 0;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

/** Varias sentencias como `app_rls` en UNA transacción con el negocio puesto (protocolo simple, sin parámetros). */
async function comoAppVarias(base: BaseEfimera, tenantId: string, sentencias: string[]): Promise<void> {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    for (const sql of sentencias) await c.query(sql);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

/** Corre SQL como el dueño de las tablas (`neondb_owner`: sin RLS, como la consola del operador). */
async function comoDuenio(base: BaseEfimera, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

async function fila(base: BaseEfimera, id: string): Promise<Fila | undefined> {
  return (await comoDuenio(base, `SELECT * FROM "Invoice" WHERE id = $1`, [id])).rows[0] as Fila | undefined;
}

let secuencia = 0;
/** Siembra una factura como el dueño (INSERT: el trigger no lo mira). */
async function sembrarFactura(
  base: BaseEfimera,
  tenantId: string,
  estado: "PENDING" | "AUTHORIZED" | "REJECTED",
  orderId: string | null = null,
  appointmentId: string | null = null,
): Promise<string> {
  secuencia += 1;
  const id = `fac_eng022_${secuencia}_${Math.random().toString(16).slice(2, 8)}`;
  const autorizada = estado === "AUTHORIZED";
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, "ivaDesglose", status, cae, "caeVencimiento", numero, "rechazoMotivo",
                            "updatedAt", "authorizedAt", "orderId", "appointmentId")
     VALUES ($1, $2, 1, $3, 1, 99, '0', '20260924', 1000.00, 210.00, 1210.00,
             '[{"alicuotaId":5,"base":1000,"importe":210}]'::jsonb, $4::"InvoiceStatus", $5, $6, $7, $8,
             now(), $9, $10, $11)`,
    [
      id,
      tenantId,
      autorizada ? 6 : null,
      estado,
      autorizada ? "86390000000001" : null,
      autorizada ? "20261004" : null,
      autorizada ? 1000 + secuencia : null,
      estado === "REJECTED" ? "10015: prueba" : null,
      autorizada ? new Date("2026-09-24T15:00:00Z") : null,
      orderId,
      appointmentId,
    ],
  );
  return id;
}

/** Un turno del negocio (gabinete, profesional y servicio propios), para enlazarle una factura. */
async function turnoDePrueba(
  prisma: typeof import("@/lib/operator-db").operatorPrisma,
  tenantId: string,
  clientId: string,
): Promise<string> {
  const box = await prisma.box.create({ data: { tenantId, name: "Gabinete ENG-022" } });
  const prof = await prisma.professional.create({ data: { tenantId, name: "Profesional ENG-022" } });
  const serv = await prisma.service.create({ data: { tenantId, name: "Servicio ENG-022", durationMin: 60, price: 1210 } });
  const turno = await prisma.appointment.create({
    data: {
      tenantId,
      clientId,
      professionalId: prof.id,
      serviceId: serv.id,
      boxId: box.id,
      startsAt: new Date("2026-09-24T13:00:00Z"),
      endsAt: new Date("2026-09-24T14:00:00Z"),
      status: "COMPLETED",
    },
  });
  return turno.id;
}

async function rechazaConRestriccion(p: Promise<unknown>, que: RegExp, contexto: string): Promise<void> {
  await assert.rejects(
    p,
    (e: unknown) => {
      const err = e as { code?: string; message?: string; detail?: string };
      assert.equal(err.code, RESTRICCION, `${contexto}: código ${String(err.code)} · ${String(err.message)}`);
      // Las columnas van en el DETAIL (para quien opera la base), no en el mensaje (§4).
      assert.match(`${String(err.message)} · ${String(err.detail)}`, que, contexto);
      return true;
    },
    contexto,
  );
}

test("como app_rls, un comprobante con CAE: cambiarle un campo fiscal o borrarlo falla, y la fila no cambia", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const id = await sembrarFactura(base, base.a.id, "AUTHORIZED", base.a.pedidos[0]);
  const antes = await fila(base, id);
  assert.ok(antes, "la factura sembrada existe");

  // La reproducción de la auditoría: total 1,00 y CAE "EDITADO", y el DELETE (antes: UPDATE 1 y DELETE 1).
  await rechazaConRestriccion(
    comoApp(base, base.a.id, `UPDATE "Invoice" SET total = 1.00, cae = 'EDITADO' WHERE id = $1`, [id]),
    /no se puede editar: se anula con una nota de crédito\. · Campos: cae, total$/,
    "total y CAE",
  );

  // Cada campo fiscal por separado: si el trigger se olvidara de uno, este test lo nombra.
  const cambios: Array<[string, string, unknown[]]> = [
    ["neto", `neto = 1.00`, []],
    ["iva", `iva = 0.00`, []],
    ["total", `total = total + 0.01`, []],
    ["ivaDesglose", `"ivaDesglose" = '[]'::jsonb`, []],
    ["cae", `cae = '86390000000002'`, []],
    ["caeVencimiento", `"caeVencimiento" = '20261231'`, []],
    ["numero", `numero = numero + 1`, []],
    ["tipoComprobante", `"tipoComprobante" = 11`, []],
    ["puntoVenta", `"puntoVenta" = 2`, []],
    ["concepto", `concepto = 2`, []],
    ["docTipo", `"docTipo" = 80`, []],
    ["docNro", `"docNro" = '20111111112'`, []],
    ["fecha", `fecha = '20260101'`, []],
    ["status", `status = 'REJECTED'`, []],
    ["status", `status = 'PENDING', cae = NULL, numero = NULL`, []],
    ["authorizedAt", `"authorizedAt" = NULL`, []],
    ["createdAt", `"createdAt" = "createdAt" - interval '1 day'`, []],
    ["mpPaymentId", `"mpPaymentId" = 'mp-otro'`, []],
    ["id", `id = 'otro-id'`, []],
    ["tenantId", `"tenantId" = $2`, [base.b.id]],
    ["orderId", `"orderId" = $2`, [base.a.pedidos[1]]],
  ];
  for (const [columna, set, extra] of cambios) {
    await rechazaConRestriccion(
      comoApp(base, base.a.id, `UPDATE "Invoice" SET ${set} WHERE id = $1`, [id, ...extra]),
      new RegExp(`no se puede editar[^·]* · Campos: [^·]*\\b${columna}\\b`),
      `UPDATE ${set}`,
    );
  }

  await rechazaConRestriccion(
    comoApp(base, base.a.id, `DELETE FROM "Invoice" WHERE id = $1`, [id]),
    /no se puede borrar: se anula con una nota de crédito/,
    "DELETE",
  );
  assert.deepEqual(await fila(base, id), antes, "la fila quedó exactamente igual");
});

test("el dueño de las tablas (sin RLS) tampoco puede editar ni borrar un comprobante con CAE", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const id = await sembrarFactura(base, base.a.id, "AUTHORIZED");
  const antes = await fila(base, id);
  await rechazaConRestriccion(comoDuenio(base, `UPDATE "Invoice" SET total = 1.00 WHERE id = $1`, [id]), / · Campos: total$/, "UPDATE dueño");
  await rechazaConRestriccion(comoDuenio(base, `DELETE FROM "Invoice" WHERE id = $1`, [id]), /no se puede borrar/, "DELETE dueño");
  // Un borrado masivo tampoco se lleva la autorizada (ni las demás: la sentencia entera se deshace).
  const pendiente = await sembrarFactura(base, base.a.id, "PENDING");
  await rechazaConRestriccion(
    comoDuenio(base, `DELETE FROM "Invoice" WHERE id = ANY($1)`, [[pendiente, id]]),
    /no se puede borrar/,
    "DELETE masivo",
  );
  assert.deepEqual(await fila(base, id), antes);
  assert.ok(await fila(base, pendiente), "la pendiente sigue: el DELETE masivo se deshizo entero");
  // Una fila con CAE aunque el estado no diga AUTHORIZED (dato inconsistente) también está protegida.
  await comoDuenio(base, `ALTER TABLE "Invoice" DISABLE TRIGGER "Invoice_comprobante_autorizado_inmutable"`);
  try {
    await comoDuenio(base, `UPDATE "Invoice" SET status = 'PENDING' WHERE id = $1`, [id]);
  } finally {
    await comoDuenio(base, `ALTER TABLE "Invoice" ENABLE TRIGGER "Invoice_comprobante_autorizado_inmutable"`);
  }
  await rechazaConRestriccion(comoDuenio(base, `DELETE FROM "Invoice" WHERE id = $1`, [id]), /no se puede borrar/, "con CAE y PENDING");
});

test("sin CAE sigue permitido editar y borrar; el paso normal de pendiente a autorizada (código real) funciona", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red

  // Pendiente y rechazada sembradas: como app_rls se editan y se borran.
  const pendiente = await sembrarFactura(base, base.a.id, "PENDING");
  assert.equal(await comoApp(base, base.a.id, `UPDATE "Invoice" SET total = 1.00, neto = 1.00, iva = 0 WHERE id = $1`, [pendiente]), 1);
  assert.equal(await comoApp(base, base.a.id, `DELETE FROM "Invoice" WHERE id = $1`, [pendiente]), 1);
  const rechazada = await sembrarFactura(base, base.a.id, "REJECTED");
  assert.equal(await comoApp(base, base.a.id, `UPDATE "Invoice" SET status = 'PENDING', "rechazoMotivo" = NULL WHERE id = $1`, [rechazada]), 1);
  const rechazada2 = await sembrarFactura(base, base.a.id, "REJECTED");
  assert.equal(await comoApp(base, base.a.id, `DELETE FROM "Invoice" WHERE id = $1`, [rechazada2]), 1);

  // El camino real: createInvoice (PENDING + envío) y registerFiscalDocument (PENDING → AUTHORIZED).
  const { createInvoice, registerFiscalDocument } = await import("@/lib/invoice-core");
  const { operatorPrisma } = await import("@/lib/operator-db");
  const pedido = base.a.pedidos[2];
  const id = await runInTenantContext(base.a.id, () =>
    createInvoice({
      tenantId: base.a.id,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1210,
      iva: [{ alicuotaId: 3, base: 1210, importe: 0 }],
      total: 1210,
      vencimientoPago: "20260924",
      origin: { type: "ORDER", id: pedido },
    }),
  );
  const envio = await operatorPrisma.outboxEvent.findFirstOrThrow({
    where: { tenantId: base.a.id, processedAt: null, payload: { path: ["invoiceId"], equals: id } },
  });
  const tomo = await registerFiscalDocument(
    { invoiceId: id, tenantId: base.a.id, cae: "86390000000077", caeVencimiento: "20261004", numero: 77, puntoVenta: 1, tipoComprobante: 11 },
    envio.id,
  );
  assert.equal(tomo, true, "la factura tomó el CAE");
  const autorizada = await fila(base, id);
  assert.equal(autorizada?.status, "AUTHORIZED");
  assert.equal(autorizada?.cae, "86390000000077");
  assert.equal(autorizada?.numero, 77);

  // Y desde ahí queda protegida.
  await rechazaConRestriccion(comoApp(base, base.a.id, `UPDATE "Invoice" SET total = 1.00 WHERE id = $1`, [id]), /no se puede editar/, "tras autorizar");
  await rechazaConRestriccion(comoApp(base, base.a.id, `DELETE FROM "Invoice" WHERE id = $1`, [id]), /no se puede borrar/, "tras autorizar");
});

test("con CAE: lo que no es fiscal sigue libre y borrar el pedido de origen deja la factura sin enlace", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const pedido = base.a.pedidos[1];
  const id = await sembrarFactura(base, base.a.id, "AUTHORIZED", pedido);
  // rechazoMotivo y updatedAt no son fiscales.
  assert.equal(await comoApp(base, base.a.id, `UPDATE "Invoice" SET "rechazoMotivo" = 'nota', "updatedAt" = now() WHERE id = $1`, [id]), 1);
  // Un UPDATE que no cambia nada (como el de Prisma con los mismos valores) no falla.
  assert.equal(await comoApp(base, base.a.id, `UPDATE "Invoice" SET total = total, cae = cae WHERE id = $1`, [id]), 1);

  const antes = await fila(base, id);
  // La FK ON DELETE SET NULL: borrar el pedido pone orderId en NULL y la factura queda entera.
  await comoDuenio(base, `DELETE FROM "OrderItem" WHERE "orderId" = $1`, [pedido]);
  const borrados = await comoDuenio(base, `DELETE FROM "Order" WHERE id = $1`, [pedido]);
  assert.equal(borrados.rowCount, 1, "el pedido se borró");
  const despues = await fila(base, id);
  assert.equal(despues?.orderId, null, "la factura quedó sin pedido");
  assert.deepEqual({ ...despues, orderId: antes?.orderId }, antes, "todo lo demás, igual");
});

test("con CAE: vaciar a mano el pedido o el turno falla, como app_rls y como dueño; la venta no se puede facturar dos veces", async (t) => {
  // La refutación de la vuelta 1: `UPDATE "Invoice" SET "orderId" = NULL` como app_rls pasaba
  // (rowCount 1), y después `createInvoice` del mismo pedido creaba una segunda factura con otro CAE.
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO;
  const { operatorPrisma } = await import("@/lib/operator-db");
  const b = base.b;
  const turno = await turnoDePrueba(operatorPrisma, b.id, b.clientes[0]);
  const pedido = b.pedidos[0];
  const conPedido = await sembrarFactura(base, b.id, "AUTHORIZED", pedido);
  const conTurno = await sembrarFactura(base, b.id, "AUTHORIZED", null, turno);
  const antesPedido = await fila(base, conPedido);
  const antesTurno = await fila(base, conTurno);

  await rechazaConRestriccion(
    comoApp(base, b.id, `UPDATE "Invoice" SET "orderId" = NULL WHERE id = $1`, [conPedido]),
    / · Campos: orderId$/,
    "app_rls vacía el pedido",
  );
  await rechazaConRestriccion(
    comoApp(base, b.id, `UPDATE "Invoice" SET "appointmentId" = NULL WHERE id = $1`, [conTurno]),
    / · Campos: appointmentId$/,
    "app_rls vacía el turno",
  );
  await rechazaConRestriccion(comoDuenio(base, `UPDATE "Invoice" SET "orderId" = NULL WHERE id = $1`, [conPedido]), / · Campos: orderId$/, "dueño vacía el pedido");
  await rechazaConRestriccion(
    comoDuenio(base, `UPDATE "Invoice" SET "appointmentId" = NULL WHERE id = $1`, [conTurno]),
    / · Campos: appointmentId$/,
    "dueño vacía el turno",
  );
  // Tampoco anidado en un trigger propio (pg_trigger_depth() > 1, como la cascada) y con tablas
  // temporales "Order" y "Appointment" vacías que tapan las reales en el search_path: con el
  // origen vivo, falla.
  for (const [columna, idFactura] of [["orderId", conPedido], ["appointmentId", conTurno]] as const) {
    await rechazaConRestriccion(
      comoAppVarias(base, b.id, [
        `CREATE TEMP TABLE "Order" (id text)`,
        `CREATE TEMP TABLE "Appointment" (id text)`,
        `CREATE TEMP TABLE disparador (x int)`,
        `CREATE FUNCTION pg_temp.desligar() RETURNS trigger LANGUAGE plpgsql AS $f$
           BEGIN UPDATE public."Invoice" SET "${columna}" = NULL WHERE id = '${idFactura}'; RETURN NEW; END $f$`,
        `CREATE TRIGGER desligar AFTER INSERT ON pg_temp.disparador FOR EACH ROW EXECUTE FUNCTION pg_temp.desligar()`,
        `INSERT INTO disparador VALUES (1)`,
      ]),
      new RegExp(` · Campos: ${columna}$`),
      `app_rls vacía ${columna} desde un trigger propio`,
    );
  }
  assert.deepEqual(await fila(base, conPedido), antesPedido, "la del pedido quedó igual");
  assert.deepEqual(await fila(base, conTurno), antesTurno, "la del turno quedó igual");

  // El código real, con el pedido todavía enlazado: devuelve la factura que ya existe, no crea otra.
  const { createInvoice } = await import("@/lib/invoice-core");
  const otra = await runInTenantContext(b.id, () =>
    createInvoice({
      tenantId: b.id,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "MONOTRIBUTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1210,
      iva: [{ alicuotaId: 3, base: 1210, importe: 0 }],
      total: 1210,
      vencimientoPago: "20260924",
      origin: { type: "ORDER", id: pedido },
    }),
  );
  assert.equal(otra, conPedido, "createInvoice devolvió la autorizada");
  assert.equal(await operatorPrisma.invoice.count({ where: { orderId: pedido } }), 1, "una sola factura para la venta");

  // Lo que sí vale: borrar el origen (como app_rls, con RLS) deja la factura sin enlace (FK SET NULL).
  assert.equal(
    await comoApp(base, b.id, `DELETE FROM "Appointment" WHERE id = $1`, [turno]),
    1,
    "app_rls borró el turno",
  );
  const sinTurno = await fila(base, conTurno);
  assert.equal(sinTurno?.appointmentId, null, "la factura quedó sin turno");
  assert.deepEqual({ ...sinTurno, appointmentId: antesTurno?.appointmentId }, antesTurno, "todo lo demás, igual");
  await comoApp(base, b.id, `DELETE FROM "OrderItem" WHERE "orderId" = $1`, [pedido]);
  assert.equal(await comoApp(base, b.id, `DELETE FROM "Order" WHERE id = $1`, [pedido]), 1, "app_rls borró el pedido");
  const sinPedido = await fila(base, conPedido);
  assert.equal(sinPedido?.orderId, null, "la factura quedó sin pedido");
  assert.deepEqual({ ...sinPedido, orderId: antesPedido?.orderId }, antesPedido, "todo lo demás, igual");
});

test("la reversa saca la protección sin tocar filas y `prisma migrate deploy` la vuelve a poner", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const id = await sembrarFactura(base, base.a.id, "AUTHORIZED");
  const registrada = async () =>
    (await comoDuenio(base, `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`, [MIGRACION])).rows[0].n as number;
  const objetos = async () =>
    (
      await comoDuenio(
        base,
        `SELECT (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'Invoice_comprobante_autorizado_inmutable') AS triggers,
                (SELECT count(*)::int FROM pg_proc WHERE proname = 'comprobante_autorizado_inmutable') AS funciones`,
      )
    ).rows[0] as { triggers: number; funciones: number };
  assert.equal(await registrada(), 1, "migrate deploy la aplicó");
  assert.deepEqual(await objetos(), { triggers: 1, funciones: 1 });
  const filasAntes = (await comoDuenio(base, `SELECT * FROM "Invoice" ORDER BY id`)).rows;

  // Reversa, como el dueño de las tablas (así se correría en Neon).
  await comoDuenio(base, readFileSync(path.join(CARPETA, "rollback.sql"), "utf8"));
  assert.deepEqual(await objetos(), { triggers: 0, funciones: 0 }, "sin trigger ni función");
  assert.equal(await registrada(), 0, "la base ya no dice que la migración está aplicada");
  assert.deepEqual((await comoDuenio(base, `SELECT * FROM "Invoice" ORDER BY id`)).rows, filasAntes, "ninguna fila cambió");
  // Sin la protección, la base vuelve a dejar editar (lo que medía la auditoría).
  assert.equal(await comoApp(base, base.a.id, `UPDATE "Invoice" SET total = 1.00 WHERE id = $1`, [id]), 1);
  assert.equal(await comoApp(base, base.a.id, `UPDATE "Invoice" SET total = 1210.00 WHERE id = $1`, [id]), 1);

  // Volver a aplicarla con el mismo comando que el deploy.
  const salida = await new Promise<{ codigo: number; texto: string }>((ok) =>
    execFile(
      process.execPath,
      [path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: base.urlDuenio, MIGRATE_DATABASE_URL: base.urlDuenio }, timeout: 180_000 },
      (err, stdout, stderr) => ok({ codigo: err ? 1 : 0, texto: `${stdout}\n${stderr}` }),
    ),
  );
  assert.equal(salida.codigo, 0, salida.texto);
  assert.match(salida.texto, new RegExp(MIGRACION));
  assert.equal(await registrada(), 1);
  assert.deepEqual(await objetos(), { triggers: 1, funciones: 1 });
  await rechazaConRestriccion(comoApp(base, base.a.id, `UPDATE "Invoice" SET total = 1.00 WHERE id = $1`, [id]), /no se puede editar/, "re-aplicada");
  await rechazaConRestriccion(comoApp(base, base.a.id, `DELETE FROM "Invoice" WHERE id = $1`, [id]), /no se puede borrar/, "re-aplicada");
});
