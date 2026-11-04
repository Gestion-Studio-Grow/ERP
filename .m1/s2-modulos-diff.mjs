// Sólo lectura: módulos de cada negocio en el respaldo del 30/10 contra producción. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const prod = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
if (!new URL(prod).hostname.startsWith("ep-little-credit-act3cxpe.")) throw new Error("No es prod: corto.");
const u = new URL(prod);
u.hostname = "ep-super-hill-ac8v9ils.sa-east-1.aws.neon.tech";
const Q = `SELECT slug, COALESCE(modules,'{}') m, md5(slug || array_to_string(COALESCE(modules,'{}'),',')) h FROM "Tenant" ORDER BY slug`;
const H = `SELECT md5(string_agg(slug || array_to_string(COALESCE(modules,'{}'),','), '|' ORDER BY slug)) h FROM "Tenant"`;
async function leer(url) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("SET default_transaction_read_only = on");
  const filas = (await c.query(Q)).rows;
  const h = (await c.query(H)).rows[0].h;
  await c.end();
  return { filas, h };
}
const [a, b] = [await leer(u.toString()), await leer(prod)];
console.log("huella respaldo 30/10:", a.h);
console.log("huella producción:    ", b.h);
const mapa = new Map(a.filas.map((f) => [f.slug, f]));
for (const f of b.filas) {
  const o = mapa.get(f.slug);
  if (!o) { console.log("NUEVO", f.slug); continue; }
  if (o.h !== f.h) console.log("CAMBIÓ", f.slug, "\n  antes:", o.m.join(","), "\n  ahora:", f.m.join(","));
}
for (const o of a.filas) if (!b.filas.some((f) => f.slug === o.slug)) console.log("YA NO ESTÁ", o.slug);
console.log("fin de la comparación");
