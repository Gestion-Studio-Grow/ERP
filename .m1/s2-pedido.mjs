// S2 — un pedido abierto en Supermercado, SÓLO en el branch, para ver si se ofrece «Link de pago».
import fs from "node:fs";
import pg from "pg";
const H = "ep-silent-sound-ace1esn0.sa-east-1.aws.neon.tech";
const u = new URL(fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8").match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1]); u.hostname = H;
const c = new pg.Client({ connectionString: u.toString() }); await c.connect();
const r = await c.query(`INSERT INTO "Order" SELECT (jsonb_populate_record(NULL::"Order", to_jsonb(o) || jsonb_build_object('id','ord_ensayo_s2','code',(SELECT max(code)+1 FROM "Order" x WHERE x."tenantId"=o."tenantId"),'status','PENDING','paid',false,'channel','ONLINE','paymentMethod',NULL,'paidAt',NULL,'fulfillment','PICKUP','idempotencyKey',NULL))).* FROM "Order" o JOIN "Tenant" t ON t.id=o."tenantId" WHERE t.slug='supermercado' ORDER BY o."createdAt" LIMIT 1 RETURNING id,code,status,total`).then((x) => x.rows, (e) => e.message);
console.log(r);
await c.end();
