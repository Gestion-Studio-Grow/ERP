// ENG-329 · El tope mensual de facturas automáticas cuenta sólo las que NO rechazó ARCA.
//
// Antes `contarFacturasDelMes` (bancos-glue.ts) contaba todo lo emitido en el mes, rechazadas
// incluidas: cada rechazo de ARCA (sin CAE) le gastaba un lugar del tope al negocio. Decisión del
// dueño (25/09): cuentan las pendientes (van a tener CAE o van a volver rechazadas) y las
// autorizadas; las rechazadas no.
//
// Contra Postgres real, en una base efímera (src/test/base-efimera.ts) con `prisma migrate deploy`
// + RLS, como producción, y con el código real:
//   · autorizada y pendiente cuentan; rechazada no; lo del mes anterior no;
//   · el camino real (`createInvoice` → PENDING, `markInvoiceRejected` → REJECTED): al emitir el
//     conteo sube uno y al volver rechazada el lugar se devuelve;
//   · la pantalla de facturación automática (`kpisFacturacionBancaria`) muestra el mismo número y
//     los lugares que quedan;
//   · aislamiento: el negocio A no suma nada del B, ni el B del A.
// Sin Postgres local se saltea y lo dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { runInTenantContext } from "@/lib/tenant-context";

const laBase = baseEfimeraDelArchivo();

type Estado = "PENDING" | "AUTHORIZED" | "REJECTED";

async function comoDuenio(base: BaseEfimera, sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

let secuencia = 0;
/** Siembra una factura como el dueño de las tablas. `haceDias` corre su `createdAt` hacia atrás. */
async function sembrarFactura(base: BaseEfimera, tenantId: string, estado: Estado, haceDias = 0): Promise<string> {
  secuencia += 1;
  const id = `fac_eng329_${secuencia}_${Math.random().toString(16).slice(2, 8)}`;
  const autorizada = estado === "AUTHORIZED";
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, "ivaDesglose", status, cae, "caeVencimiento", numero, "rechazoMotivo",
                            "createdAt", "updatedAt", "authorizedAt")
     VALUES ($1, $2, 1, $3, 1, 99, '0', '20260924', 1000.00, 210.00, 1210.00,
             '[{"alicuotaId":5,"base":1000,"importe":210}]'::jsonb, $4::"InvoiceStatus", $5, $6, $7, $8,
             now() - make_interval(days => $9::int), now(), $10)`,
    [
      id,
      tenantId,
      autorizada ? 6 : null,
      estado,
      autorizada ? `8639000000${String(1000 + secuencia).padStart(4, "0")}` : null,
      autorizada ? "20261004" : null,
      autorizada ? 1000 + secuencia : null,
      estado === "REJECTED" ? "10015: prueba" : null,
      haceDias,
      autorizada ? new Date() : null,
    ],
  );
  return id;
}

function prepararEntorno(base: BaseEfimera): void {
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000", ARCA_INVOICING_ENABLED: "true" });
  delete env.ARCA_MODO; // stub: nada sale a la red
}

test("tope del mes: autorizada y pendiente cuentan, rechazada no, lo del mes anterior no; A y B no se mezclan", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  prepararEntorno(base);
  const { contarFacturasDelMes, kpisFacturacionBancaria } = await import("@/lib/bancos-glue");

  const antesA = await contarFacturasDelMes(base.a.id);
  const antesB = await contarFacturasDelMes(base.b.id);

  // A: una de cada estado este mes, y una autorizada y una pendiente de hace 40 días.
  await sembrarFactura(base, base.a.id, "AUTHORIZED");
  await sembrarFactura(base, base.a.id, "PENDING");
  await sembrarFactura(base, base.a.id, "REJECTED");
  await sembrarFactura(base, base.a.id, "AUTHORIZED", 40);
  await sembrarFactura(base, base.a.id, "PENDING", 40);
  // B: cantidades distintas, para que si algo se cruza se note.
  await sembrarFactura(base, base.b.id, "AUTHORIZED");
  await sembrarFactura(base, base.b.id, "AUTHORIZED");
  await sembrarFactura(base, base.b.id, "AUTHORIZED");
  await sembrarFactura(base, base.b.id, "REJECTED");
  await sembrarFactura(base, base.b.id, "REJECTED");

  assert.equal(await contarFacturasDelMes(base.a.id), antesA + 2, "A: la autorizada y la pendiente; la rechazada no");
  assert.equal(await contarFacturasDelMes(base.b.id), antesB + 3, "B: sus tres autorizadas; sus rechazadas no, y nada de A");

  // La pantalla de facturación automática y el Inicio leen el mismo número.
  const kpisA = await kpisFacturacionBancaria(base.a.id);
  assert.equal(kpisA.facturasMes, antesA + 2);
  assert.equal(kpisA.capRestante, Math.max(0, kpisA.capFacturasMes - kpisA.facturasMes));

  // Con la sesión de A, las facturas de B no existen (RLS): ni contándolas por su id de negocio.
  const { tenantTransaction } = await import("@/lib/rls");
  const deBVistasDesdeA = await tenantTransaction((tx) => tx.invoice.count({ where: { tenantId: base.b.id } }), {
    tenantId: base.a.id,
  });
  assert.equal(deBVistasDesdeA, 0);
});

test("camino real: emitir suma un lugar del tope y el rechazo de ARCA lo devuelve", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  prepararEntorno(base);
  const { contarFacturasDelMes } = await import("@/lib/bancos-glue");
  const { createInvoice, markInvoiceRejected } = await import("@/lib/invoice-core");
  const { operatorPrisma } = await import("@/lib/operator-db");

  const antes = await contarFacturasDelMes(base.a.id);
  const antesB = await contarFacturasDelMes(base.b.id);

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
      origin: { type: "ORDER", id: base.a.pedidos[0] },
    }),
  );
  assert.equal(await contarFacturasDelMes(base.a.id), antes + 1, "pendiente de ARCA: ocupa un lugar (va a tener CAE)");

  const envio = await operatorPrisma.outboxEvent.findFirstOrThrow({
    where: { tenantId: base.a.id, processedAt: null, payload: { path: ["invoiceId"], equals: id } },
  });
  const quedoRechazada = await markInvoiceRejected(id, base.a.id, "10016: prueba ENG-329", envio.id);
  assert.equal(quedoRechazada, true);
  const fila = (await comoDuenio(base, `SELECT status, cae FROM "Invoice" WHERE id = $1`, [id])).rows[0];
  assert.deepEqual(fila, { status: "REJECTED", cae: null });

  assert.equal(await contarFacturasDelMes(base.a.id), antes, "rechazada por ARCA: el lugar vuelve");
  assert.equal(await contarFacturasDelMes(base.b.id), antesB, "B no se entera de nada de A");
});
