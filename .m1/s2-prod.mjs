// S2 recortado contra PRODUCCIÓN, con orden del dueño (31/10). No se commitea. Sin N2_enums.sql y sin N2_modulo_mercadopago.sql.
// Uso: node .m1/s2-prod.mjs previo          (sólo lectura: compara prod con el respaldo)
//      node .m1/s2-prod.mjs aplicar SI-PROD
//      node .m1/s2-prod.mjs despues          (sólo lectura: compara prod con el respaldo y corre check-rls-live)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const PROD = "ep-little-credit-act3cxpe";
const RESPALDO_HOST = "ep-bitter-sky-acy6w4n6.sa-east-1.aws.neon.tech";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const URL_PROD = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
if (!new URL(URL_PROD).hostname.startsWith(`${PROD}.`)) throw new Error("La URL no es la de producción: corto.");
const ur = new URL(URL_PROD);
ur.hostname = RESPALDO_HOST;
const URL_RESPALDO = ur.toString();

const LOG = ".m1/s2/7-prod.log";
const log = (...a) => { const t = a.join(" "); console.log(t); fs.appendFileSync(LOG, `${t}\n`); };

const P = "prisma/pending-gate2";
const ANTES_DEL_HUB = ["CarniceriaRubro.sql", "N2_hub.sql"];
const DESPUES_DEL_HUB = ["N2_pagos.sql", "N2_retail.sql", "N2_club_indice.sql", "N2_integraciones_ruteo.sql", "../rls/0001_enable_rls.sql"];
const TABLAS = ["ProductBatch", "ProcessingRun", "ProcessingOutput", "ApiKey", "WebhookSuscripcion", "EntregaWebhook", "PlantillaWhatsapp", "PagoExterno", "ClubReservaIndice"];

function sentenciasSql(texto) {
  const out = []; let actual = ""; let i = 0; const n = texto.length;
  while (i < n) {
    const c = texto[i]; const d = texto[i + 1];
    if (c === "-" && d === "-") { const fin = texto.indexOf("\n", i); i = fin < 0 ? n : fin; continue; }
    if (c === "/" && d === "*") { const fin = texto.indexOf("*/", i + 2); i = fin < 0 ? n : fin + 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) { if (texto[j] === c) { if (texto[j + 1] === c) { j += 2; continue; } break; } j++; }
      actual += texto.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(texto.slice(i, i + 64));
      if (m) { const fin = texto.indexOf(m[0], i + m[0].length); const hasta = fin < 0 ? n : fin + m[0].length; actual += texto.slice(i, hasta); i = hasta; continue; }
    }
    if (c === ";") { if (actual.trim()) out.push(actual.trim()); actual = ""; i++; continue; }
    actual += c; i++;
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

const avisos = [];
async function conectar(url) {
  const c = new pg.Client({ connectionString: url });
  c.on("notice", (n) => { if (n.severity !== "NOTICE" || !/RLS activado/.test(n.message)) avisos.push(`${n.severity}: ${n.message}`); });
  await c.connect();
  return c;
}
const uno = async (c, s, a) => (await c.query(s, a)).rows;

const foto = async (c) => (await uno(c, `SELECT
  (SELECT count(*)::int FROM "Tenant") tenant, (SELECT count(*)::int FROM "User") usuarios, (SELECT count(*)::int FROM "Order") pedidos,
  (SELECT count(*)::int FROM "CashMovement") libro, (SELECT count(*)::int FROM "Product") productos, (SELECT count(*)::int FROM "Client") clientes,
  (SELECT count(*)::int FROM "OutboxEvent") outbox, (SELECT count(*)::int FROM "Invoice") facturas, (SELECT count(*)::int FROM "AuditLog") audit,
  (SELECT md5(string_agg(id || total::text || status::text, ',' ORDER BY id)) FROM "Order") h_pedidos,
  (SELECT md5(string_agg(id || amount::text || method::text, ',' ORDER BY id)) FROM "CashMovement") h_libro,
  (SELECT md5(string_agg(id || name || COALESCE(price::text,'') || stock::text, ',' ORDER BY id)) FROM "Product") h_productos,
  (SELECT md5(string_agg(slug || array_to_string(COALESCE(modules,'{}'),','), '|' ORDER BY slug)) FROM "Tenant") h_modulos`))[0];
const politicas = (c) => uno(c, `SELECT tablename, policyname, cmd, roles::text, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2`);
const estructura = async (c) => ({
  tablas: (await uno(c, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`, [TABLAS])).map((x) => x.table_name).sort(),
  columnas: (await uno(c, `SELECT table_name||'.'||column_name c FROM information_schema.columns WHERE table_schema='public' AND ((table_name='Product' AND column_name IN ('category','cost')) OR (table_name='OutboxEvent' AND column_name IN ('version','clave')) OR (table_name='Client' AND column_name='limiteCredito') OR (table_name='Order' AND column_name IN ('cobroVerificadoEn','cobroVerificadoPor'))) ORDER BY 1`)).map((x) => x.c),
  funciones: (await uno(c, `SELECT proname FROM pg_proc WHERE proname LIKE 'gsg_%' ORDER BY 1`)).map((x) => x.proname),
  roles: (await uno(c, `SELECT string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) v FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='UserRole'`))[0].v,
  rls: (await uno(c, `SELECT count(*) FILTER (WHERE relrowsecurity)::int rls, count(*) FILTER (WHERE relforcerowsecurity)::int forzadas FROM pg_class k JOIN pg_namespace n ON n.oid=k.relnamespace WHERE n.nspname='public' AND k.relkind='r'`))[0],
});
const migraciones = async (c) => {
  const dirs = fs.readdirSync("prisma/migrations").filter((d) => fs.existsSync(path.join("prisma/migrations", d, "migration.sql")));
  const ap = (await uno(c, `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map((x) => x.migration_name);
  return `en el repo ${dirs.length} · aplicadas ${ap.length} · pendientes: ${dirs.filter((d) => !ap.includes(d)).join(",") || "ninguna"}`;
};
const actividad = async (c) => (await uno(c, `SELECT count(*) FILTER (WHERE state='active')::int activas, count(*) FILTER (WHERE state LIKE 'idle in transaction%')::int en_tx, count(*)::int total FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()`))[0];

const ESPERADO_ANTES = JSON.stringify({ tablas: [], columnas: [], funciones: [], roles: "OWNER,RECEPTION,PROFESSIONAL", rls: { rls: 81, forzadas: 0 } });
const ESPERADO_DESPUES = JSON.stringify({ tablas: [...TABLAS].sort(), columnas: ["Client.limiteCredito", "Order.cobroVerificadoEn", "Order.cobroVerificadoPor", "OutboxEvent.clave", "OutboxEvent.version", "Product.category", "Product.cost"], funciones: ["gsg_conexion_por_cuenta", "gsg_conexiones_activas"], roles: "OWNER,RECEPTION,PROFESSIONAL", rls: { rls: 90, forzadas: 0 } });

async function comparar(prod) {
  const r = await conectar(URL_RESPALDO);
  const [fp, fr] = [await foto(prod), await foto(r)];
  await r.end();
  log("prod:    ", JSON.stringify(fp));
  log("respaldo:", JSON.stringify(fr));
  log("prod = respaldo:", JSON.stringify(fp) === JSON.stringify(fr));
  return JSON.stringify(fp) === JSON.stringify(fr);
}

const modo = process.argv[2];
log(`\n=== ${modo} · ${new Date().toISOString()} ===`);
const c = await conectar(URL_PROD);
if (modo === "previo") {
  log("conectado:", JSON.stringify((await uno(c, `SELECT current_user u`))[0]));
  log("estructura:", JSON.stringify(await estructura(c)));
  log("como en el ensayo:", JSON.stringify(await estructura(c)) === ESPERADO_ANTES);
  log("políticas:", (await politicas(c)).length);
  log("migraciones:", await migraciones(c));
  log("conexiones:", JSON.stringify(await actividad(c)));
  await comparar(c);
} else if (modo === "aplicar") {
  if (process.argv[3] !== "SI-PROD") throw new Error("Falta la confirmación SI-PROD.");
  const estr = JSON.stringify(await estructura(c));
  if (estr !== ESPERADO_ANTES) throw new Error(`La estructura no es la del ensayo: ${estr}`);
  const antes = await foto(c);
  const polAntes = await politicas(c);
  log("antes:", JSON.stringify(antes), "· conexiones:", JSON.stringify(await actividad(c)));
  const correr = async (a) => {
    const t0 = Date.now();
    avisos.length = 0;
    const sent = sentenciasSql(fs.readFileSync(path.join(P, a), "utf8"));
    const filas = [];
    for (const s of sent) {
      try { const r = await c.query(s); if (r.rows?.length) filas.push(...r.rows); }
      catch (e) { throw new Error(`${a}: ${e.message}\n  en: ${s.slice(0, 200)}`); }
    }
    log(`  ✓ ${a.padEnd(32)} ${String(Date.now() - t0).padStart(6)} ms · ${sent.length} sentencias${avisos.length ? ` · ${avisos.filter((x) => !x.startsWith("NOTICE: policy")).slice(0, 3).join(" | ").slice(0, 200)}` : ""}`);
    return filas;
  };
  const t0 = Date.now();
  for (const a of ANTES_DEL_HUB) await correr(a);
  const finHub = Date.now();
  for (const a of DESPUES_DEL_HUB) await correr(a);
  log("  total", Date.now() - t0, "ms");
  const espera = 120000 - (Date.now() - finHub);
  log(`  espero ${Math.round(espera / 1000)} s para el 3b`);
  await new Promise((r) => setTimeout(r, espera));
  log("  duplicados listados por el 3b:", JSON.stringify(await correr("N2_hub_posterior.sql")));
  const estrDesp = JSON.stringify(await estructura(c));
  log("después:", estrDesp);
  log("estructura como se esperaba:", estrDesp === ESPERADO_DESPUES);
  const desp = await foto(c);
  log("datos iguales:", JSON.stringify(antes) === JSON.stringify(desp), JSON.stringify(desp));
  const polDesp = await politicas(c);
  const clave = (p) => `${p.tablename}/${p.policyname}`;
  const mapa = new Map(polAntes.map((p) => [clave(p), p]));
  log(`políticas: antes ${polAntes.length}, después ${polDesp.length}; nuevas: ${polDesp.filter((p) => !mapa.has(clave(p))).map((x) => x.tablename).join(",")}; cambiadas: ${polDesp.filter((p) => mapa.has(clave(p)) && JSON.stringify(mapa.get(clave(p))) !== JSON.stringify(p)).map(clave).join(",") || "ninguna"}; perdidas: ${polAntes.filter((p) => !polDesp.some((q) => clave(q) === clave(p))).map(clave).join(",") || "ninguna"}`);
} else if (modo === "despues") {
  log("estructura como se esperaba:", JSON.stringify(await estructura(c)) === ESPERADO_DESPUES);
  await comparar(c);
  log("migraciones:", await migraciones(c));
  try {
    const salida = execFileSync(process.execPath, ["prisma/rls/check-rls-live.mjs"], { env: { ...process.env, RLS_AUDIT_DATABASE_URL: URL_PROD }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    log("check-rls-live salió 0 ·", salida.split(/\r?\n/).filter(Boolean).slice(-6).join(" | ").slice(0, 500));
  } catch (e) {
    log("check-rls-live salió", e.status, (e.stdout || "").slice(-800), (e.stderr || "").slice(-300));
    process.exitCode = 1;
  }
} else {
  log("uso: previo | aplicar SI-PROD | despues");
}
await c.end();
