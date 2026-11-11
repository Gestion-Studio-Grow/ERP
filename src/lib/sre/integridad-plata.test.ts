// CONTROL DE INTEGRIDAD DE PLATA sobre PGlite (Postgres en memoria, de node_modules): sin servidor,
// sin red, sin tocar ninguna base real. Las tablas son un recorte a mano con las columnas que el
// control usa; el primer test comprueba contra prisma/schema.prisma que ese recorte no se inventó
// ninguna columna (si el esquema cambia un nombre, falla acá y no en producción).

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { COLUMNAS_USADAS, CONTROLES, controlarIntegridadPlata, resumenParaAviso, type Consulta } from "./integridad-plata";

const HASTA = new Date("2026-11-10T12:00:00.000Z");
const AYER = "2026-11-09 15:00:00";
const VIEJO = "2026-10-01 15:00:00";

const TABLAS = `
  CREATE TABLE "Order" (id text PRIMARY KEY, "tenantId" text NOT NULL);
  CREATE TABLE "Payment" (id text PRIMARY KEY, "tenantId" text NOT NULL, "appointmentId" text NOT NULL);
  CREATE TABLE "CashSession" (id text PRIMARY KEY, "tenantId" text NOT NULL);
  CREATE TYPE "PaymentMethod" AS ENUM ('MERCADOPAGO','EFECTIVO','TRANSFERENCIA','VOUCHER');
  CREATE TYPE "CollectionOriginType" AS ENUM ('ORDER','APPOINTMENT','RECEIVABLE','PAYABLE');
  CREATE TYPE "CashMovementType" AS ENUM ('APERTURA','VENTA','INGRESO','EGRESO','RETIRO');
  CREATE TABLE "Collection" (
    id text PRIMARY KEY, "tenantId" text NOT NULL, "originType" "CollectionOriginType" NOT NULL,
    "orderId" text, "appointmentId" text, amount decimal(14,2) NOT NULL, method "PaymentMethod" NOT NULL,
    "createdAt" timestamp(3) NOT NULL);
  CREATE TABLE "CashMovement" (
    id text PRIMARY KEY, "tenantId" text NOT NULL, "sessionId" text, type "CashMovementType" NOT NULL,
    amount double precision NOT NULL, "orderId" text, "paymentId" text, "collectionId" text,
    "createdAt" timestamp(3) NOT NULL);
`;

const abiertas: PGlite[] = [];
// PGlite deja el proceso con código de salida propio si no se cierra: se cierran todas al terminar.
after(async () => {
  for (const db of abiertas) await db.close();
});

async function base(tablas = TABLAS): Promise<{ db: PGlite; consulta: Consulta; sentencias: string[] }> {
  const db = await PGlite.create();
  abiertas.push(db);
  await db.exec(tablas);
  const sentencias: string[] = [];
  const consulta: Consulta = async (sql, params) => {
    sentencias.push(sql);
    return (await db.query(sql, params ? [...params] : [])).rows as Record<string, unknown>[];
  };
  return { db, consulta, sentencias };
}

const cobro = (db: PGlite, id: string, negocio: string, monto: number, extra: Partial<{ origen: string; orderId: string; appointmentId: string; medio: string; cuando: string }> = {}) =>
  db.query(`INSERT INTO "Collection" VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
    id, negocio, extra.origen ?? "APPOINTMENT", extra.orderId ?? null, extra.appointmentId ?? null, monto, extra.medio ?? "EFECTIVO", extra.cuando ?? AYER,
  ]);

const asiento = (db: PGlite, id: string, negocio: string, monto: number, extra: Partial<{ tipo: string; sessionId: string; orderId: string; paymentId: string; collectionId: string; cuando: string }> = {}) =>
  db.query(`INSERT INTO "CashMovement" VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
    id, negocio, extra.sessionId ?? null, extra.tipo ?? "VENTA", monto, extra.orderId ?? null, extra.paymentId ?? null, extra.collectionId ?? null, extra.cuando ?? AYER,
  ]);

test("las columnas que usa el control existen en prisma/schema.prisma", () => {
  const esquema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  for (const [modelo, columnas] of Object.entries(COLUMNAS_USADAS)) {
    const m = esquema.match(new RegExp(`^model ${modelo} \\{[\\s\\S]*?^\\}`, "m"));
    assert.ok(m, `el modelo ${modelo} existe`);
    for (const col of columnas) assert.match(m[0], new RegExp(`^\\s+${col}\\s`, "m"), `${modelo}.${col}`);
  }
});

test("todo cuadra: cobros asentados por los tres puentes, voucher y cuentas corrientes afuera → OK", async () => {
  const { db, consulta } = await base();
  await db.query(`INSERT INTO "Order" VALUES ('o1','A')`);
  await db.query(`INSERT INTO "Payment" VALUES ('p1','A','turno1')`);
  await cobro(db, "c1", "A", 1500); // por collectionId
  await asiento(db, "m1", "A", 1500, { collectionId: "c1" });
  await cobro(db, "c2", "A", 800, { origen: "ORDER", orderId: "o1" }); // por orderId (mostrador)
  await asiento(db, "m2", "A", 800, { orderId: "o1" });
  await cobro(db, "c3", "A", 300, { appointmentId: "turno1" }); // por el Payment del turno (puente anterior)
  await asiento(db, "m3", "A", 300, { paymentId: "p1" });
  await cobro(db, "c4", "A", 999, { medio: "VOUCHER" }); // el voucher no va al libro
  await cobro(db, "c5", "A", 500, { origen: "RECEIVABLE" }); // cuenta corriente: otro circuito
  await cobro(db, "c6", "B", 200);
  await asiento(db, "m6", "B", 200, { collectionId: "c6" });
  await asiento(db, "m7", "B", 50, { tipo: "EGRESO" }); // un gasto a mano no es un cobro

  const informe = await controlarIntegridadPlata(consulta, { hasta: HASTA });
  assert.equal(informe.ok, true);
  assert.deepEqual(informe.hallazgos, []);
  assert.deepEqual(informe.noEvaluados, []);
  assert.deepEqual(
    informe.negocios.map((n) => [n.negocio, n.cobros, n.cobrado, n.sinAsiento]),
    [["A", 3, "2600.00", 0], ["B", 1, "200.00", 0]],
  );
  assert.match(resumenParaAviso(informe), /OK/);
});

test("cobro sin asiento: avisa en el negocio que corresponde, con monto y muestra; lo viejo queda fuera de la ventana", async () => {
  const { db, consulta } = await base();
  await cobro(db, "c1", "A", 1500);
  await asiento(db, "m1", "A", 1500, { collectionId: "c1" });
  await cobro(db, "c2", "B", 700.5); // B cobró y la caja no se enteró
  await cobro(db, "c3", "B", 100, { cuando: VIEJO }); // fuera de la ventana: no se mira
  await cobro(db, "c4", "A", 400);
  await asiento(db, "m4", "B", 400, { collectionId: "c4" }); // asentado… en OTRO negocio: no cubre

  const informe = await controlarIntegridadPlata(consulta, { hasta: HASTA });
  assert.equal(informe.ok, false);
  const sin = informe.hallazgos.filter((h) => h.control === "cobro-sin-asiento");
  assert.deepEqual(sin, [
    { control: "cobro-sin-asiento", negocio: "A", filas: 1, monto: "400.00", muestras: ["c4"] },
    { control: "cobro-sin-asiento", negocio: "B", filas: 1, monto: "700.50", muestras: ["c2"] },
  ]);
  const otro = informe.hallazgos.filter((h) => h.control === "asiento-de-otro-negocio");
  assert.deepEqual(otro.map((h) => [h.negocio, h.filas, h.muestras]), [["B", 1, ["m4"]]]);
  assert.match(resumenParaAviso(informe), /HAY DIFERENCIAS[\s\S]*cobro-sin-asiento · negocio B · 1 fila\(s\) · \$ 700\.50/);
});

test("monto distinto, asiento duplicado y monto inválido", async () => {
  const { db, consulta } = await base();
  await db.query(`INSERT INTO "CashSession" VALUES ('s1','B')`);
  await cobro(db, "c1", "A", 1000);
  await asiento(db, "m1", "A", 900, { collectionId: "c1" }); // faltan 100 en el libro
  await cobro(db, "c2", "A", 250);
  await asiento(db, "m2", "A", 250, { collectionId: "c2" });
  await asiento(db, "m3", "A", 250, { collectionId: "c2", tipo: "VENTA" }); // dos VENTA para un cobro
  await asiento(db, "m4", "A", 250, { collectionId: "c2", tipo: "EGRESO" }); // la anulación NO es duplicado
  await asiento(db, "m5", "A", 0, { tipo: "INGRESO" }); // monto inválido
  await asiento(db, "m6", "A", Number.NaN, { tipo: "INGRESO" }); // no es un número
  await asiento(db, "m7", "A", 10, { tipo: "INGRESO", sessionId: "s1" }); // turno de caja de B
  await cobro(db, "c3", "A", 10);
  await asiento(db, "m8", "A", 10.004, { collectionId: "c3" }); // redondeo: dentro de la tolerancia

  const informe = await controlarIntegridadPlata(consulta, { hasta: HASTA });
  const por = (c: string) => informe.hallazgos.filter((h) => h.control === c);
  assert.deepEqual(por("asiento-monto-distinto"), [{ control: "asiento-monto-distinto", negocio: "A", filas: 1, monto: "100.00", muestras: ["m1"] }]);
  assert.deepEqual(por("asiento-duplicado").map((h) => [h.negocio, h.filas, Number(h.monto), h.muestras]), [["A", 1, 250, ["collectionId:c2"]]]);
  assert.deepEqual(por("monto-invalido").map((h) => [h.negocio, h.filas, h.muestras]), [["A", 2, ["m5", "m6"]]]);
  assert.deepEqual(por("asiento-de-otro-negocio").map((h) => [h.negocio, h.muestras]), [["A", ["m7"]]]);
  assert.deepEqual(por("cobro-sin-asiento"), []);
  assert.equal(informe.ok, false);
});

test("base una migración atrás (sin collectionId ni paymentId): evalúa lo que puede y DICE lo que no pudo", async () => {
  const atras = TABLAS.replace(`"orderId" text, "paymentId" text, "collectionId" text,`, `"orderId" text,`);
  const { db, consulta } = await base(atras);
  await db.query(`INSERT INTO "Order" VALUES ('o1','A')`);
  await cobro(db, "c1", "A", 800, { origen: "ORDER", orderId: "o1" });
  await db.query(`INSERT INTO "CashMovement" VALUES ('m1','A',NULL,'VENTA',800,'o1',$1)`, [AYER]);
  await cobro(db, "c2", "A", 90); // cobro de turno: sin puente posible en esta base

  const informe = await controlarIntegridadPlata(consulta, { hasta: HASTA });
  assert.deepEqual(informe.noEvaluados.map((n) => n.control), ["asiento-monto-distinto"]);
  assert.deepEqual(informe.hallazgos.map((h) => [h.control, h.muestras]), [["cobro-sin-asiento", ["c2"]]]);
  assert.equal(informe.ok, false, "un control sin evaluar nunca da OK");
});

test("sin tablas de caja: ningún control se da por bueno", async () => {
  const { consulta } = await base(`CREATE TABLE "Otra" (id text)`);
  const informe = await controlarIntegridadPlata(consulta, { hasta: HASTA });
  assert.equal(informe.ok, false);
  assert.deepEqual(informe.noEvaluados.map((n) => n.control), [...CONTROLES]);
});

test("SOLO LECTURA: todo lo que manda es SELECT/WITH y corre dentro de una transacción READ ONLY", async () => {
  const { db, consulta, sentencias } = await base();
  await cobro(db, "c1", "A", 10);
  await db.exec("BEGIN TRANSACTION READ ONLY");
  const informe = await controlarIntegridadPlata(consulta, { hasta: HASTA });
  await db.exec("ROLLBACK");
  assert.equal(informe.hallazgos.length, 1);
  assert.ok(sentencias.length >= 5);
  for (const s of sentencias) {
    assert.match(s.trim(), /^(SELECT|WITH)\b/i);
    assert.doesNotMatch(s, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|COPY)\b/i);
  }
});
