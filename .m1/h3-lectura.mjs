// H3 (pase M1, 30/10) — SÓLO LECTURA contra Neon prod. No se commitea (.m1/ está excluido).
// Por negocio: cuánta plata de transferencia hay guardada en `MP` (lo que la hoja nueva le resta a la
// apertura de Mercado Pago) y cuántos ajustes de cierre se asentaron en `MP` desde la planilla de
// siempre («MP / Transf.»). Si esos ajustes ya sacaron las transferencias del libro, la resta las
// sacaría dos veces → diferencia falsa en MP el primer día de la hoja nueva.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const m = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
if (!m) throw new Error("sin DATABASE_URL");
const url = m[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const signo = `CASE m.type::text WHEN 'VENTA' THEN 1 WHEN 'INGRESO' THEN 1 WHEN 'EGRESO' THEN -1 WHEN 'RETIRO' THEN -1 ELSE 0 END`;
const r = await c.query(`
  SELECT t.slug,
    (SELECT count(*) FROM "AuditLog" a WHERE a."tenantId"=t.id AND a.action='caja.cierre-diario')::int AS cierres,
    (SELECT coalesce(sum(${signo} * m.amount),0) FROM "CashMovement" m WHERE m."tenantId"=t.id AND m.method::text='MP')::numeric AS libro_mp,
    (SELECT coalesce(sum(${signo} * m.amount),0) FROM "CashMovement" m
       LEFT JOIN "Collection" co ON co.id=m."collectionId" LEFT JOIN "Order" o ON o.id=m."orderId"
      WHERE m."tenantId"=t.id AND m.method::text='MP'
        AND ((co.id IS NOT NULL AND co.method::text='TRANSFERENCIA') OR (m."collectionId" IS NULL AND o."paymentMethod"::text='TRANSFERENCIA')))::numeric AS transf_en_mp,
    (SELECT coalesce(sum(${signo} * m.amount),0) FROM "CashMovement" m
      WHERE m."tenantId"=t.id AND m.method::text='MP' AND m."createdBy" LIKE 'cierre-diario:%')::numeric AS ajustes_mp,
    (SELECT count(*) FROM "CashMovement" m
      WHERE m."tenantId"=t.id AND m.method::text='MP' AND m."createdBy" LIKE 'cierre-diario:%')::int AS n_ajustes_mp
  FROM "Tenant" t ORDER BY t.slug`);
await c.query("ROLLBACK");
await c.end();
console.table(r.rows);
