// ============================================================================
// ENSAYO DE LA MIGRACIÓN M7b (MIA-50 T09: etapas II, obligaciones, cancelado) — sólo en el Postgres LOCAL de esta máquina, nunca Neon.
// ============================================================================
//
//   node --import tsx scripts/proyectos/ensayo-m7b.ts
//
// Molde `migracion-datos.md`: copia con datos → conteo por tabla y por negocio antes → `prisma migrate
// deploy` (nunca `dev`) → conteo después → segunda corrida (repetible) → rollback escrito y probado →
// vuelta a aplicar. Imprime la evidencia en Markdown para el cuerpo del PR.
//
// La base es una efímera del arnés de tests (`erp_test_*`, dos negocios sembrados) más la productora de
// demo entera (`prisma/seed-mia-producciones.ts`): se crea con todas las migraciones, se le cargan
// fechas de etapa, obligaciones y una cancelación, y se la lleva al estado «antes de M7b» con el propio rollback.
// Al final se borra.
// Usa `ERP_TEST_PG_URL` o el Postgres local por defecto.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { crearBaseEfimera, urlDelServidor, urlDeRol } from "../../src/test/base-efimera";

const MIGRACION = "20261120140000_mia_m7b_etapas";
const DIR = path.resolve(__dirname, "..", "..", "prisma", "migrations", MIGRACION);
const PRISMA_CLI = path.resolve(__dirname, "..", "..", "node_modules", "prisma", "build", "index.js");
const NUEVAS = ["ProyectoEtapaFecha", "ProyectoObligacion", "ProyectoCancelacion"];

const sentencias = (sql: string) => sql.replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean);

function deploy(url: string): Promise<{ codigo: number; salida: string }> {
  return new Promise((ok) => {
    execFile(process.execPath, [PRISMA_CLI, "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url, MIGRATE_DATABASE_URL: url }, maxBuffer: 16 << 20 }, (err, out, errOut) =>
      ok({ codigo: err ? ((err as { code?: number }).code ?? 1) : 0, salida: `${out}${errOut}` }),
    );
  });
}

/** Filas por tabla y por negocio, de toda tabla con `tenantId` (como superusuario: sin RLS). */
async function conteo(db: pg.Client): Promise<Map<string, number>> {
  const { rows: tablas } = await db.query<{ t: string }>(`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId' ORDER BY 1`);
  const m = new Map<string, number>();
  for (const { t } of tablas) {
    const { rows } = await db.query<{ tenant: string; n: string }>(`SELECT "tenantId" AS tenant, count(*) AS n FROM "${t}" GROUP BY 1`);
    for (const r of rows) m.set(`${t} · ${r.tenant}`, Number(r.n));
  }
  return m;
}

const existe = async (db: pg.Client, t: string) => (await db.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [`public."${t}"`])).rows[0].e as boolean;
/** De a una: el cliente de `pg` no acepta consultas superpuestas. */
async function existen(db: pg.Client): Promise<boolean[]> {
  const r: boolean[] = [];
  for (const t of NUEVAS) r.push(await existe(db, t));
  return r;
}

async function main() {
  const base = await crearBaseEfimera();
  const admin = new pg.Client({ connectionString: urlDeRol(urlDelServidor(), null, base.nombre) });
  await admin.connect();
  const log: string[] = [];
  const paso = (afirmacion: string, salida: string) => log.push(`| ${afirmacion} | ${salida.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim()} |`);
  const neg = { [base.a.id]: "A", [base.b.id]: "B" } as Record<string, string>;
  try {
    // La copia con datos: además de los dos negocios del arnés, la productora de demo entera (proyectos, cuotas,
    // gastos, caja), sembrada como superusuario en esta base efímera.
    const siembra = await new Promise<{ codigo: number; salida: string }>((ok) =>
      execFile(process.execPath, ["--import", "tsx", path.resolve(__dirname, "..", "..", "prisma", "seed-mia-producciones.ts")], { env: { ...process.env, DATABASE_URL: urlDeRol(urlDelServidor(), null, base.nombre), SEED_DB_MAX: "1" }, maxBuffer: 16 << 20 }, (err, out, errOut) =>
        ok({ codigo: err ? 1 : 0, salida: `${out}${errOut}` }),
      ),
    );
    if (siembra.codigo !== 0) throw new Error(`falló la siembra:\n${siembra.salida.slice(-600)}`);
    // Datos en las tablas de M7b, para que el rollback y la vuelta tengan algo que mover: en la productora de demo
    // (que tiene proyectos) una fecha de etapa y una cancelación; en A y B, una obligación suelta cada uno.
    const { rows: [demo] } = await admin.query<{ id: string; t: string }>(`SELECT id, "tenantId" AS t FROM "Proyecto" WHERE "tenantId" <> ALL($1) ORDER BY numero LIMIT 1`, [[base.a.id, base.b.id]]);
    if (!demo) throw new Error("la siembra no dejó proyectos");
    await admin.query(`INSERT INTO "ProyectoEtapaFecha" (id, "tenantId", "proyectoId", "etapaId", prevista, "previstaPor", "updatedAt") VALUES ('ef-1', $1, $2, 'PRODUCCION', now(), 'Dirección', now())`, [demo.t, demo.id]);
    await admin.query(`INSERT INTO "ProyectoCancelacion" (id, "tenantId", "proyectoId", motivo, criterio, "cuotasAnuladas", pendientes, "autorId", "autorNombre") VALUES ('c-1', $1, $2, 'Ensayo', 'SOLO_DIRECCION_SIN_LIQUIDACION', 0, '[]', 'u', 'Dirección')`, [demo.t, demo.id]);
    for (const [t, letra] of [[base.a.id, "A"], [base.b.id, "B"]]) {
      await admin.query(`INSERT INTO "ProyectoObligacion" (id, "tenantId", tipo, titulo, "responsableNombre", "venceEl", "diasAviso", envio, "creadaPor") VALUES ($1, $2, 'Otra', 'Ensayo', 'Dirección', now(), 3, $1, 'u')`, [`o-${letra}`, t]);
    }
    const rollback = await readFile(path.join(DIR, "rollback.sql"), "utf8");
    const migracion = await readFile(path.join(DIR, "migration.sql"), "utf8");

    // 1. Estado «antes de M7b»: el rollback y la marca de Prisma fuera.
    for (const s of sentencias(rollback)) await admin.query(s);
    await admin.query(`DELETE FROM _prisma_migrations WHERE migration_name = $1`, [MIGRACION]);
    const antes = await conteo(admin);
    paso("Antes: las 3 tablas de M7b no existen", (await existen(admin)).map((e, i) => `${NUEVAS[i]}=${e}`).join(", "));
    paso("Antes: tablas con tenantId y filas", `${new Set([...antes.keys()].map((k) => k.split(" · ")[0])).size} tablas con datos, ${[...antes.values()].reduce((x, y) => x + y, 0)} filas`);

    // 2. `prisma migrate deploy` (nunca `dev`).
    const d1 = await deploy(base.urlDuenio);
    paso("`prisma migrate deploy` aplica M7b", `código ${d1.codigo}; ${(d1.salida.match(/\d+ migrations? found[^\n]*/) ?? [""])[0]}; aplicada: ${d1.salida.includes(MIGRACION) ? MIGRACION : "NO FIGURA"}`);
    if (d1.codigo !== 0) throw new Error(d1.salida);
    const despues = await conteo(admin);
    const distintas = [...new Set([...antes.keys(), ...despues.keys()])].filter((k) => antes.get(k) !== despues.get(k));
    paso("Después: mismo conteo por tabla y por negocio en todo lo previo", distintas.length ? `DISTINTAS: ${distintas.join(", ")}` : `0 diferencias en ${antes.size} pares tabla·negocio`);
    const { rows: rls } = await admin.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS pol FROM pg_class c WHERE c.relname = ANY($1) ORDER BY 1`, [NUEVAS]);
    paso("Después: las 3 tablas con RLS forzada y política por negocio", rls.map((r) => `${r.relname} rls=${r.relrowsecurity} force=${r.relforcerowsecurity} política=${r.pol}`).join("; "));
    const nuevas: string[] = [];
    for (const t of NUEVAS) nuevas.push(`${t}=${(await admin.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n}`);
    paso("Después: las tablas nuevas nacen vacías (el código sigue como antes hasta que alguien carga)", nuevas.join(", "));

    // 3. Repetible: el SQL otra vez y el deploy otra vez.
    for (const s of sentencias(migracion.replace(/DO \$\$[\s\S]*?\$\$;/g, (m) => m.replace(/;/g, "\u0000")))) await admin.query(s.replace(/\u0000/g, ";"));
    paso("Segunda corrida del migration.sql a mano", `sin error; conteo igual: ${[...(await conteo(admin)).entries()].every(([k, v]) => despues.get(k) === v)}`);
    const d2 = await deploy(base.urlDuenio);
    paso("Segundo `prisma migrate deploy`", `código ${d2.codigo}; ${(d2.salida.match(/No pending migrations[^\n]*/) ?? [d2.salida.slice(-160)])[0]}`);

    // 4. Datos de los dos negocios y aislamiento con app_rls.
    for (const [t, letra] of [[base.a.id, "A"], [base.b.id, "B"]]) await admin.query(`INSERT INTO "ProyectoObligacion" (id, "tenantId", tipo, titulo, "responsableNombre", "venceEl", "diasAviso", envio, "creadaPor") VALUES ($1, $2, 'Otra', 'Ensayo', 'Dirección', now(), 3, $1, 'u')`, [`o2-${letra}`, t]);
    const app = new pg.Client({ connectionString: base.urlApp });
    await app.connect();
    const vista = async (tenant: string | null) => {
      await app.query("BEGIN");
      if (tenant) await app.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenant]);
      const { rows } = await app.query<{ t: string }>(`SELECT "tenantId" AS t FROM "ProyectoObligacion"`);
      await app.query("COMMIT");
      return rows.map((r) => neg[r.t] ?? "?").join("") || "ninguna";
    };
    paso("app_rls: cada negocio ve sólo sus filas; sin negocio, ninguna", `A ve ${await vista(base.a.id)}; B ve ${await vista(base.b.id)}; sin negocio ${await vista(null)}`);
    await app.end();

    // 5. Rollback probado, y vuelta a aplicar.
    for (const s of sentencias(rollback)) await admin.query(s);
    const tras = await conteo(admin);
    const tocadas = [...antes.keys()].filter((k) => antes.get(k) !== tras.get(k));
    paso("rollback.sql: se van sólo las 3 tablas de M7b", `existen: ${(await existen(admin)).join("/")}; previas con otro conteo: ${tocadas.length}`);
    await admin.query(`DELETE FROM _prisma_migrations WHERE migration_name = $1`, [MIGRACION]);
    const d3 = await deploy(base.urlDuenio);
    paso("Tras el rollback, `prisma migrate deploy` la vuelve a aplicar", `código ${d3.codigo}; tablas: ${(await existen(admin)).join("/")}`);
  } finally {
    await admin.end();
    await base.borrar();
  }
  console.log(["| Afirmación | Salida |", "|---|---|", ...log].join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
