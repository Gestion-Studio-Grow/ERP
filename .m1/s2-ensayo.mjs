// S2 — ensayo del paquete Gate 2 contra el BRANCH de Neon ensayo-s2-2026-10-31. No se commitea.
// Nunca corre contra producción: si el host no es el del branch, corta antes de conectar.
// Uso: node .m1/s2-ensayo.mjs <aplicar|reversa|cerobis|usuario-prueba>
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const BRANCH_HOST = "ep-silent-sound-ace1esn0.sa-east-1.aws.neon.tech";
const PROD = "ep-little-credit-act3cxpe";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const original = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1];
const u = new URL(original);
u.hostname = BRANCH_HOST;
const URL_BRANCH = u.toString();
if (!URL_BRANCH.includes(BRANCH_HOST) || URL_BRANCH.includes(PROD)) throw new Error("No es el branch de ensayo: corto.");
export { URL_BRANCH };

const P = "prisma/pending-gate2";
const ORDEN = ["CarniceriaRubro.sql", "N2_enums.sql", "N2_hub.sql", "N2_pagos.sql", "N2_retail.sql", "N2_club_indice.sql", "N2_integraciones_ruteo.sql", "../rls/0001_enable_rls.sql"];
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

const c = new pg.Client({ connectionString: URL_BRANCH });
const avisos = [];
c.on("notice", (n) => { if (n.severity !== "NOTICE" || !/RLS activado/.test(n.message)) avisos.push(`${n.severity}: ${n.message}`); });
await c.connect();
const uno = async (s, a) => (await c.query(s, a)).rows;
const quien = (await uno(`SELECT inet_server_addr()::text ip, current_user u, (SELECT count(*)::int FROM "Tenant") negocios`))[0];
console.log("conectado al branch", BRANCH_HOST, quien.u, "negocios:", quien.negocios);

async function correrArchivo(a) {
  const t0 = Date.now();
  avisos.length = 0;
  const sent = sentenciasSql(fs.readFileSync(path.join(P, a), "utf8"));
  const filas = [];
  for (const s of sent) {
    try {
      const r = await c.query(s);
      if (r.rows?.length) filas.push(...r.rows);
    } catch (e) {
      throw new Error(`${a}: ${e.message}\n  en: ${s.slice(0, 200)}`);
    }
  }
  console.log(`  ✓ ${a.padEnd(32)} ${String(Date.now() - t0).padStart(6)} ms · ${sent.length} sentencias${avisos.length ? " · " + avisos.slice(0, 4).join(" | ").slice(0, 300) : ""}`);
  return filas;
}

async function foto() {
  const cuentas = (await uno(`SELECT
    (SELECT count(*)::int FROM "Tenant") tenant, (SELECT count(*)::int FROM "User") usuarios, (SELECT count(*)::int FROM "Order") pedidos,
    (SELECT count(*)::int FROM "CashMovement") libro, (SELECT count(*)::int FROM "Product") productos, (SELECT count(*)::int FROM "Client") clientes,
    (SELECT count(*)::int FROM "OutboxEvent") outbox, (SELECT count(*)::int FROM "Invoice") facturas, (SELECT count(*)::int FROM "AuditLog") audit,
    (SELECT md5(string_agg(id || total::text || status::text, ',' ORDER BY id)) FROM "Order") h_pedidos,
    (SELECT md5(string_agg(id || amount::text || method::text, ',' ORDER BY id)) FROM "CashMovement") h_libro,
    (SELECT md5(string_agg(id || name || COALESCE(price::text,'') || stock::text, ',' ORDER BY id)) FROM "Product") h_productos,
    (SELECT md5(string_agg(slug || array_to_string(COALESCE(modules,'{}'),','), '|' ORDER BY slug)) FROM "Tenant") h_modulos`))[0];
  return cuentas;
}
const politicas = async () => (await uno(`SELECT tablename, policyname, cmd, roles::text, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2`));
const estructura = async () => ({
  tablas: (await uno(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`, [TABLAS])).map((x) => x.table_name).sort(),
  columnas: (await uno(`SELECT table_name||'.'||column_name c FROM information_schema.columns WHERE table_schema='public' AND ((table_name='Product' AND column_name IN ('category','cost')) OR (table_name='OutboxEvent' AND column_name IN ('version','clave')) OR (table_name='Client' AND column_name='limiteCredito') OR (table_name='Order' AND column_name IN ('cobroVerificadoEn','cobroVerificadoPor'))) ORDER BY 1`)).map((x) => x.c),
  funciones: (await uno(`SELECT proname FROM pg_proc WHERE proname LIKE 'gsg_%' ORDER BY 1`)).map((x) => x.proname),
  roles: (await uno(`SELECT string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) v FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='UserRole'`))[0].v,
  rls: (await uno(`SELECT count(*) FILTER (WHERE relrowsecurity)::int rls, count(*) FILTER (WHERE relforcerowsecurity)::int forzadas FROM pg_class k JOIN pg_namespace n ON n.oid=k.relnamespace WHERE n.nspname='public' AND k.relkind='r'`))[0],
});

function reversaDe(archivo) {
  const lineas = fs.readFileSync(path.join(P, archivo), "utf8").split(/\r?\n/);
  if (archivo === "CarniceriaRubro.sql") {
    const i = lineas.findIndex((l) => l.startsWith("-- ROLLBACK"));
    const out = [];
    for (const l of lineas.slice(i + 1)) { if (!l.startsWith("--   ")) break; out.push(l.slice(5)); }
    return out.join("\n");
  }
  const desde = lineas.map((l) => l.includes("REVERSA")).lastIndexOf(true);
  const ini = lineas.findIndex((l, k) => k > desde && l.trim() === "--   BEGIN;");
  const fin = lineas.findIndex((l, k) => k > ini && l.trim() === "--   COMMIT;");
  if (!(ini > 0 && fin > ini)) throw new Error(`${archivo}: falta la reversa`);
  return lineas.slice(ini, fin + 1).map((l) => l.replace(/^--   /, "")).join("\n");
}

const modo = process.argv[2];
if (modo === "aplicar") {
  const antes = await foto();
  const polAntes = await politicas();
  console.log("antes:", JSON.stringify(await estructura()));
  console.log("\n— primera pasada —");
  const t0 = Date.now();
  for (const a of ORDEN) await correrArchivo(a);
  console.log("  total", Date.now() - t0, "ms");
  console.log("\n— 3b (re-backfill) —");
  console.log("  duplicados listados:", JSON.stringify(await correrArchivo("N2_hub_posterior.sql")));
  console.log("\ndespués:", JSON.stringify(await estructura()));
  const desp = await foto();
  console.log("datos iguales:", JSON.stringify(antes) === JSON.stringify(desp), JSON.stringify(desp));
  const polDesp = await politicas();
  const clave = (p) => `${p.tablename}/${p.policyname}`;
  const mapa = new Map(polAntes.map((p) => [clave(p), p]));
  const cambiadas = polDesp.filter((p) => mapa.has(clave(p)) && JSON.stringify(mapa.get(clave(p))) !== JSON.stringify(p));
  const nuevas = polDesp.filter((p) => !mapa.has(clave(p)));
  const perdidas = polAntes.filter((p) => !polDesp.some((q) => clave(q) === clave(p)));
  console.log(`políticas: antes ${polAntes.length}, después ${polDesp.length}; nuevas: ${nuevas.map((x) => x.tablename).join(",")}; cambiadas: ${cambiadas.map(clave).join(",") || "ninguna"}; perdidas: ${perdidas.map(clave).join(",") || "ninguna"}`);
  for (const p of cambiadas) console.log("   CAMBIÓ", clave(p), "\n     antes:", mapa.get(clave(p)).qual, "\n     ahora:", p.qual);
  console.log("\n— segunda pasada (idempotencia) —");
  for (const a of ORDEN) await correrArchivo(a);
  await correrArchivo("N2_hub_posterior.sql");
  console.log("datos iguales tras la 2.ª:", JSON.stringify(desp) === JSON.stringify(await foto()));
  console.log("\n— check-rls-live —");
  try {
    const salida = execFileSync(process.execPath, ["prisma/rls/check-rls-live.mjs"], { env: { ...process.env, RLS_AUDIT_DATABASE_URL: URL_BRANCH }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    console.log("  salió 0 ·", salida.split(/\r?\n/).filter(Boolean).slice(-6).join(" | ").slice(0, 500));
  } catch (e) {
    console.log("  salió", e.status, (e.stdout || "").slice(-800), (e.stderr || "").slice(-300));
  }
  console.log("\n— pruebas de comportamiento (sólo branch) —");
  const [sm] = await uno(`SELECT id FROM "Tenant" WHERE slug='supermercado'`);
  const [mg] = await uno(`SELECT id FROM "Tenant" WHERE slug='magra'`);
  const k = `ensayo-${randomUUID()}`;
  await c.query(`INSERT INTO "OutboxEvent"(id,"tenantId",type,payload,clave) SELECT $1,$2,'ensayo.s2','{}'::jsonb,$3`, [`ens-${k}`, sm.id, k]).catch(async (e) => {
    console.log("  outbox insert:", e.message);
    console.log("  columnas:", (await uno(`SELECT column_name||':'||is_nullable||':'||COALESCE(column_default,'') c FROM information_schema.columns WHERE table_name='OutboxEvent'`)).map((x) => x.c).join(" "));
  });
  const dup = await c.query(`INSERT INTO "OutboxEvent"(id,"tenantId",type,payload,clave) SELECT $1,$2,'ensayo.s2','{}'::jsonb,$3`, [`ens2-${k}`, sm.id, k]).then(() => "ACEPTÓ el duplicado", (e) => `rechazó el duplicado (${e.code})`);
  const otro = await c.query(`INSERT INTO "OutboxEvent"(id,"tenantId",type,payload,clave) SELECT $1,$2,'ensayo.s2','{}'::jsonb,$3`, [`ens3-${k}`, mg.id, k]).then(() => "otro negocio con la misma clave: entra", (e) => `otro negocio: ${e.message}`);
  console.log("  outbox:", dup, "·", otro);
  await c.query(`DELETE FROM "OutboxEvent" WHERE type='ensayo.s2'`);
  // RLS real con el rol de la app, sólo si este rol puede tomarlo en el branch.
  const grant = await c.query(`GRANT app_rls TO CURRENT_USER WITH SET TRUE`).then(() => "ok", (e) => e.message);
  console.log("  tomar app_rls en el branch:", grant);
  if (grant === "ok") {
    const col = (await uno(`SELECT count(*)::int n FROM "IntegracionConexion" x JOIN "Tenant" t ON t.id=x."tenantId" WHERE x.conector='mercadopago' AND x.estado IN ('conectada','con_problemas','requiere_reconectar') AND COALESCE(t.modules,'{}') @> ARRAY['mercadopago']`))[0].n;
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE app_rls");
    const f = (await uno(`SELECT count(*)::int n FROM gsg_conexiones_activas('mercadopago',1000)`))[0].n;
    const sinGuc = (await uno(`SELECT count(*)::int n FROM "Product"`))[0].n;
    await c.query(`SELECT set_config('app.current_tenant_id',$1,true)`, [sm.id]);
    const conGuc = (await uno(`SELECT count(*)::int n FROM "Product"`))[0].n;
    const lote = await c.query(`SAVEPOINT a`).then(() => c.query(`INSERT INTO "ProductBatch"(id,"tenantId",code,"createdBy") VALUES ('ens-l1',$1,'L1','ensayo')`, [mg.id])).then(() => "ACEPTÓ un lote de otro negocio", (e) => `lote de otro negocio: rechazado (${e.code})`);
    await c.query(`ROLLBACK TO SAVEPOINT a`);
    const propio = await c.query(`INSERT INTO "ProductBatch"(id,"tenantId",code,"createdBy") VALUES ('ens-l2',$1,'L2','ensayo')`, [sm.id]).then(() => "lote propio: entra", (e) => `lote propio: ${e.message}`);
    await c.query("ROLLBACK");
    console.log(`  app_rls: función ${f} = dueño ${col} · productos sin negocio ${sinGuc}, con negocio ${conGuc} · ${lote} · ${propio}`);
    await c.query(`REVOKE app_rls FROM CURRENT_USER`).catch(() => {});
  }
  console.log("\n— migraciones de Prisma —");
  const dirs = fs.readdirSync("prisma/migrations").filter((d) => fs.existsSync(path.join("prisma/migrations", d, "migration.sql")));
  const ap = (await uno(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map((x) => x.migration_name);
  console.log(`  en el repo ${dirs.length} · aplicadas ${ap.length} · pendientes: ${dirs.filter((d) => !ap.includes(d)).join(",") || "ninguna"}`);
} else if (modo === "reversa") {
  const antes = await foto();
  console.log("— reversa, en orden inverso (sin enums, que no tienen) —");
  for (const a of ["N2_integraciones_ruteo.sql", "N2_club_indice.sql", "N2_retail.sql", "N2_pagos.sql", "N2_hub.sql", "CarniceriaRubro.sql"]) {
    const t0 = Date.now();
    for (const s of sentenciasSql(reversaDe(a))) await c.query(s);
    console.log(`  ✓ reversa ${a.padEnd(30)} ${Date.now() - t0} ms`);
  }
  console.log("después:", JSON.stringify(await estructura()));
  console.log("datos iguales:", JSON.stringify(antes) === JSON.stringify(await foto()));
  console.log("— reaplico para seguir el ensayo —");
  for (const a of ORDEN) await correrArchivo(a);
  await correrArchivo("N2_hub_posterior.sql");
  console.log("reaplicado:", JSON.stringify(await estructura()));
} else if (modo === "cerobis") {
  const filas = await correrArchivo("N2_modulo_mercadopago.sql");
  console.log("0 bis cambió:", filas.map((f) => `${f.slug}(${f.status})`).join(", "));
  console.log("sin el módulo:", (await uno(`SELECT count(*)::int n FROM "Tenant" WHERE NOT COALESCE(modules,'{}') @> ARRAY['mercadopago']`))[0].n);
} else if (modo === "usuario-prueba") {
  // SÓLO en el branch: usuario descartable en Supermercado para recorrer la pantalla. El branch se borra solo.
  const hash = process.argv[3];
  const [sm] = await uno(`SELECT id FROM "Tenant" WHERE slug='supermercado'`);
  await c.query(`INSERT INTO "User"(id,"tenantId",email,name,role,"passwordHash","updatedAt") VALUES('u_ensayo_s2',$1,'ensayo-s2@local','Ensayo','OWNER',$2,now()) ON CONFLICT (id) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash"`, [sm.id, hash]);
  console.log("usuario de ensayo listo en el branch");
} else {
  console.log("uso: aplicar | reversa | cerobis | usuario-prueba <hash>");
}
await c.end();
