// Sólo lectura: que los 15 negocios carguen en su subdominio después de S2, sin ingresar. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
if (!new URL(url).hostname.startsWith("ep-little-credit-act3cxpe.")) throw new Error("No es prod: corto.");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("SET default_transaction_read_only = on");
const cols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Tenant' AND column_name IN ('subdomain','slug')`)).rows.map((x) => x.column_name);
const sel = cols.includes("subdomain") ? `slug, COALESCE(subdomain, slug) sub` : `slug, slug sub`;
const negocios = (await c.query(`SELECT ${sel} FROM "Tenant" ORDER BY slug`)).rows;
await c.end();
const LOG = ".m1/s2/8-negocios.log";
const log = (t) => { console.log(t); fs.appendFileSync(LOG, `${t}\n`); };
log(`\n=== ${new Date().toISOString()} · ${negocios.length} negocios ===`);
let mal = 0;
for (const n of negocios) {
  const base = `https://${n.sub}.gsgapp.com.ar`;
  const r = await fetch(`${base}/admin`, { redirect: "follow", signal: AbortSignal.timeout(30000) }).catch((e) => ({ status: 0, text: async () => e.message, url: "" }));
  const html = await r.text();
  const titulo = (html.match(/<title[^>]*>([^<]*)/) || [])[1] ?? "";
  const roto = r.status !== 200 || /Application error|Internal Server Error|does not exist/i.test(html);
  if (roto) mal++;
  log(`${roto ? "MAL" : "ok "} ${n.slug.padEnd(16)} ${n.sub.padEnd(18)} ${r.status} «${titulo.slice(0, 50)}»`);
}
const h = await fetch(`https://${negocios[0].sub}.gsgapp.com.ar/api/health`, { signal: AbortSignal.timeout(30000) }).then((r) => r.text()).catch((e) => e.message);
log(`health: ${h.slice(0, 200)}`);
log(`no cargan: ${mal}`);
process.exitCode = mal ? 1 : 0;
