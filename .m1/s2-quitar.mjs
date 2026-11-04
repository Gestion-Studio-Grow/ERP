// SÓLO branch: saca el módulo de Supermercado para comparar la bandeja de pedidos sin 0 bis.
import fs from "node:fs";
import pg from "pg";
const H = "ep-silent-sound-ace1esn0.sa-east-1.aws.neon.tech";
const u = new URL(fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8").match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1]); u.hostname = H;
const c = new pg.Client({ connectionString: u.toString() }); await c.connect();
console.log((await c.query(`UPDATE "Tenant" SET modules=array_remove(modules,'mercadopago') WHERE slug='supermercado' RETURNING slug`)).rows);
await c.end();
