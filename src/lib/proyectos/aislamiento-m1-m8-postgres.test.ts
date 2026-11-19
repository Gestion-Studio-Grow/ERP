// ============================================================================
// MIA-50 · T11 · criterio C-O43: las tablas NUEVAS de Proyectos (M1 a M8) quedan aisladas por negocio.
// Contra Postgres real (arnés `src/test/base-efimera.ts`): base efímera con todas las migraciones, negocios A y B,
// la app conectada como `app_rls` (sin BYPASSRLS). Datos ficticios marcados «C-O43 T11».
//
// Qué se mide:
//   1. La lista: las tablas que CREAN las migraciones de M7a, M1, M2, M3, M4, M6, M8 y M7b, leídas del SQL
//      (`CREATE TABLE "X"`), no escritas a mano. M5 NO existe en esta rama (D13: la mide la integradora de la ola 4).
//   2. Catálogo: cada tabla con RLS activado y forzado (`pg_class`) y con política de tenant (`pg_policies`).
//   3. «B no ve lo de A»: una fila mínima por tabla en B (sólo columnas obligatorias; padres creados en B). Con el
//      contexto de A (`tenantTransaction`, `set_config('app.current_tenant_id', …, true)`): count = 0 y UPDATE/DELETE
//      sobre la fila de B = 0 filas. Contraprueba con el contexto de B: count ≥ 1 (si no, la prueba no prueba nada).
//   4. El instrumento detecta el rojo: en una transacción que se deshace, el dueño apaga RLS en una tabla y borra la
//      política de otra; la auditoría (2) las señala y el conteo (3) ve la fila de B desde A.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";

const MIGRACIONES = [
  "20261117120000_mia_m7a",
  "20261119100000_mia_m1",
  "20261119110000_mia_m2",
  "20261120100000_mia_m3",
  "20261120110000_mia_m4",
  "20261120120000_mia_m6",
  "20261120130000_mia_m8",
  "20261120140000_mia_m7b",
];
const DIR_MIGRACIONES = path.resolve(__dirname, "..", "..", "..", "prisma", "migrations");
const MARCA = "C-O43 T11";
const GUC = "app.current_tenant_id";

/** Las tablas que crea cada migración, leídas del SQL (sin comentarios). */
function tablasPorMigracion(): Map<string, string[]> {
  const dirs = fs.readdirSync(DIR_MIGRACIONES);
  const res = new Map<string, string[]>();
  for (const prefijo of MIGRACIONES) {
    const hallados = dirs.filter((d) => d.startsWith(prefijo));
    assert.equal(hallados.length, 1, `migración ${prefijo}*: ${hallados.length} carpetas`);
    const sql = fs.readFileSync(path.join(DIR_MIGRACIONES, hallados[0], "migration.sql"), "utf8").replace(/--[^\n]*/g, "");
    res.set(hallados[0], [...sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:"public"\.)?"([^"]+)"/gi)].map((m) => m[1]));
  }
  return res;
}
const TABLAS = [...new Set([...tablasPorMigracion().values()].flat())];

// ── Acceso: una forma común para pg crudo y para la transacción de la app ─────

interface Consulta {
  filas(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  afectadas(sql: string, params?: unknown[]): Promise<number>;
}
const deClientePg = (c: pg.Client): Consulta => ({
  filas: async (sql, params = []) => (await c.query(sql, params)).rows,
  afectadas: async (sql, params = []) => (await c.query(sql, params)).rowCount ?? 0,
});
const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

// ── 2 · Auditoría del catálogo ───────────────────────────────────────────────

async function auditarCatalogo(c: Consulta, tablas: string[]): Promise<string[]> {
  const filas = await c.filas(
    `SELECT t.nombre, cl.relrowsecurity AS rls, cl.relforcerowsecurity AS forzado,
            (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.nombre) AS politicas,
            (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.nombre AND p.cmd = 'ALL'
                AND p.qual LIKE '%"tenantId"%' AND p.qual LIKE '%${GUC}%'
                AND coalesce(p.with_check, p.qual) LIKE '%"tenantId"%' AND coalesce(p.with_check, p.qual) LIKE '%${GUC}%') AS de_tenant
       FROM unnest($1::text[]) WITH ORDINALITY AS t(nombre, orden)
       LEFT JOIN pg_class cl ON cl.relname = t.nombre AND cl.relnamespace = 'public'::regnamespace AND cl.relkind = 'r'
      ORDER BY t.orden`,
    [tablas],
  );
  const problemas: string[] = [];
  for (const f of filas) {
    const n = f.nombre as string;
    if (f.rls === null) problemas.push(`${n}: no existe`);
    else {
      if (!f.rls) problemas.push(`${n}: sin RLS`);
      if (!f.forzado) problemas.push(`${n}: RLS sin FORCE`);
      if (f.politicas === 0) problemas.push(`${n}: sin política`);
      else if (f.de_tenant === 0) problemas.push(`${n}: ninguna política filtra por tenantId`);
    }
  }
  return problemas;
}

// ── 3 · Siembra genérica de una fila mínima por tabla en B ───────────────────

type Fila = Record<string, unknown>;
interface Columna { nombre: string; tipo: string; categoria: string; enumPrimero: string | null; obligatoria: boolean }
interface ClaveForanea { columnas: string[]; padre: string; refs: string[] }

/** Valores que el genérico no puede adivinar (CHECK entre columnas). */
const A_MANO: Record<string, Fila> = {
  ProyectoComprobante: { netoCentavos: 100, ivaCentavos: 21, totalCentavos: 121, destino: "ADMINISTRACION" },
  ProyectoComprobanteLinea: { destino: "ADMINISTRACION" },
  ProyectoCambioDia: { moneda: "USD", dia: "2026-11-19" },
};

class Sembrador {
  private hechas = new Map<string, Fila>();
  constructor(private c: pg.Client, private b: BaseEfimera["b"]) {}

  private async columnas(tabla: string): Promise<Columna[]> {
    const filas = await this.c.query(
      `SELECT a.attname AS nombre, format_type(a.atttypid, a.atttypmod) AS tipo, ty.typcategory AS categoria,
              (SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid = a.atttypid ORDER BY e.enumsortorder LIMIT 1) AS "enumPrimero",
              (a.attnotnull AND NOT a.atthasdef AND a.attidentity = '' AND a.attgenerated = '') AS obligatoria
         FROM pg_attribute a JOIN pg_type ty ON ty.oid = a.atttypid
        WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
      [q(tabla)],
    );
    return filas.rows as Columna[];
  }

  private async foraneas(tabla: string): Promise<ClaveForanea[]> {
    const filas = await this.c.query(
      `SELECT (SELECT relname FROM pg_class WHERE oid = c.confrelid) AS padre,
              array(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.o) AS columnas,
              array(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.o) AS refs
         FROM pg_constraint c WHERE c.contype = 'f' AND c.conrelid = to_regclass($1)`,
      [q(tabla)],
    );
    return filas.rows as ClaveForanea[];
  }

  private async checks(tabla: string): Promise<string> {
    const filas = await this.c.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE contype = 'c' AND conrelid = to_regclass($1)`, [q(tabla)]);
    return filas.rows.map((r) => r.d as string).join("\n");
  }

  /** Una fila existente de B para las tablas base que el arnés ya sembró. */
  private async existente(tabla: string): Promise<Fila | null> {
    const id = { Tenant: this.b.id, Client: this.b.clientes[0], User: this.b.duenia.id }[tabla];
    if (!id) return null;
    return (await this.c.query(`SELECT * FROM ${q(tabla)} WHERE id = $1`, [id])).rows[0] ?? null;
  }

  private valor(col: Columna, checks: string): unknown {
    if (col.nombre === "tenantId") return this.b.id;
    const nombre = `(?:"${col.nombre}"|\\b${col.nombre}\\b)`;
    const literal = checks.match(new RegExp(`${nombre}\\s*=\\s*ANY\\s*\\(\\(?ARRAY\\['([^']*)'`)) ?? checks.match(new RegExp(`${nombre}\\s*=\\s*'([^']*)'`));
    if (col.categoria === "S") return literal?.[1] ?? `${MARCA} ${randomUUID().slice(0, 8)}`;
    if (col.categoria === "E") return col.enumPrimero;
    if (col.categoria === "N") return 1;
    if (col.categoria === "B") return false;
    if (col.categoria === "D") return new Date("2026-11-19T15:00:00Z");
    if (col.categoria === "A") return "{}";
    if (col.tipo === "uuid") return randomUUID();
    if (col.tipo === "bytea") return Buffer.from(MARCA);
    if (col.tipo.startsWith("json")) return JSON.stringify({ marca: MARCA });
    throw new Error(`sin valor para ${col.nombre} (${col.tipo})`);
  }

  async fila(tabla: string, pila: string[] = []): Promise<Fila> {
    const hecha = this.hechas.get(tabla) ?? (await this.existente(tabla));
    if (hecha) return hecha;
    assert.ok(!pila.includes(tabla), `ciclo de claves foráneas obligatorias: ${[...pila, tabla].join(" → ")}`);
    const [columnas, foraneas, checks] = await Promise.all([this.columnas(tabla), this.foraneas(tabla), this.checks(tabla)]);
    const obligatorias = new Set(columnas.filter((c) => c.obligatoria).map((c) => c.nombre));
    const valores: Fila = {};
    for (const fk of foraneas) {
      // `tenantId` sale del negocio; una clave (tenantId, xId) con xId opcional no obliga a crear el padre.
      if (fk.padre === tabla || !fk.columnas.some((c) => c !== "tenantId" && obligatorias.has(c))) continue;
      const padre = await this.fila(fk.padre, [...pila, tabla]);
      fk.columnas.forEach((c, i) => (valores[c] ??= padre[fk.refs[i]]));
    }
    for (const col of columnas) if (col.obligatoria && !(col.nombre in valores)) valores[col.nombre] = this.valor(col, checks);
    for (const [col, v] of Object.entries(A_MANO[tabla] ?? {})) if (columnas.some((c) => c.nombre === col)) valores[col] = v;
    const cols = Object.keys(valores);
    const sql = `INSERT INTO ${q(tabla)} (${cols.map(q).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`;
    try {
      const fila = (await this.c.query(sql, cols.map((c) => valores[c]))).rows[0] as Fila;
      this.hechas.set(tabla, fila);
      return fila;
    } catch (err) {
      throw new Error(`sembrar ${tabla} (${cols.join(", ")}): ${(err as Error).message}`);
    }
  }
}

// ── 3 · El conteo y las escrituras desde un negocio ──────────────────────────

interface Sembrado { base: BaseEfimera; claves: Map<string, { cols: string[]; vals: unknown[] }> }

async function clavePrimaria(c: pg.Client, tabla: string): Promise<string[]> {
  const r = await c.query(
    `SELECT a.attname::text AS col FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = to_regclass($1) AND i.indisprimary ORDER BY array_position(i.indkey, a.attnum)`,
    [q(tabla)],
  );
  return r.rows.map((f) => f.col as string);
}

const donde = (k: { cols: string[] }) => k.cols.map((c, i) => `${q(c)} = $${i + 1}`).join(" AND ");

/** Con el tenant ya fijado en `c`: cuántas filas ve de cada tabla y cuántas de la fila sembrada en B. */
async function medir(c: Consulta, s: Sembrado, tablas: string[]) {
  const visibles: Record<string, number> = {};
  const deB: Record<string, number> = {};
  for (const t of tablas) {
    const k = s.claves.get(t)!;
    visibles[t] = Number((await c.filas(`SELECT count(*)::int AS n FROM ${q(t)}`))[0].n);
    deB[t] = Number((await c.filas(`SELECT count(*)::int AS n FROM ${q(t)} WHERE ${donde(k)}`, k.vals))[0].n);
  }
  return { visibles, deB };
}

const laBase = baseEfimeraDelArchivo();
let sembrado: Promise<Sembrado> | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  const base = await laBase(t);
  if (!base) return null;
  sembrado ??= (async () => {
    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    try {
      await c.query("BEGIN");
      // Las tablas nuevas llevan FORCE: también el dueño necesita el contexto de B para escribir en ellas.
      await c.query(`SELECT set_config('${GUC}', $1, true)`, [base.b.id]);
      const s = new Sembrador(c, base.b);
      const claves: Sembrado["claves"] = new Map();
      for (const t of TABLAS) {
        const fila = await s.fila(t);
        const cols = await clavePrimaria(c, t);
        assert.ok(cols.length > 0, `${t} sin clave primaria`);
        claves.set(t, { cols, vals: cols.map((x) => fila[x]) });
      }
      await c.query("COMMIT");
      return { base, claves };
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      await c.end();
    }
  })();
  return sembrado;
}

async function comoApp<R>(base: BaseEfimera, tenantId: string, fn: (c: pg.Client) => Promise<R>): Promise<R> {
  const c = new pg.Client({ connectionString: base.urlApp });
  await c.connect();
  try {
    await c.query("BEGIN");
    if (tenantId) await c.query(`SELECT set_config('${GUC}', $1, true)`, [tenantId]);
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("C-O43 · 1 · la lista sale del SQL de las 8 migraciones (M5 no está en esta rama)", () => {
  const porMigracion = tablasPorMigracion();
  assert.equal(porMigracion.size, MIGRACIONES.length);
  for (const [m, tablas] of porMigracion) assert.ok(tablas.length > 0, `${m} no crea tablas`);
  assert.equal(TABLAS.length, [...porMigracion.values()].flat().length, "una tabla creada en dos migraciones");
  assert.ok(TABLAS.every((t) => t.startsWith("Proyecto")), TABLAS.join(", "));
});

test("C-O43 · 2 · ninguna tabla nueva sin RLS (activado y forzado) ni sin política de tenant", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    assert.deepEqual(await auditarCatalogo(deClientePg(c), TABLAS), []);
  } finally {
    await c.end();
  }
});

test("C-O43 · 3 · B no ve lo de A: con el contexto de A, 0 filas y 0 escrituras sobre la fila de B", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { base } = s;
  apuntarLaAppA(base);
  const { tenantTransaction } = await import("@/lib/rls");

  // Con el contexto de A por el camino real de la app (`tenantTransaction` → set_config(GUC, A, true)).
  const desdeA = await tenantTransaction(
    async (tx) => {
      const c: Consulta = {
        filas: (sql, params = []) => tx.$queryRawUnsafe(sql, ...params),
        afectadas: (sql, params = []) => tx.$executeRawUnsafe(sql, ...params),
      };
      const vista = await medir(c, s, TABLAS);
      const escrituras: Record<string, string> = {};
      for (const tabla of TABLAS) {
        const k = s.claves.get(tabla)!;
        const upd = await c.afectadas(`UPDATE ${q(tabla)} SET "tenantId" = "tenantId" WHERE ${donde(k)}`, k.vals);
        const del = await c.afectadas(`DELETE FROM ${q(tabla)} WHERE ${donde(k)}`, k.vals);
        if (upd !== 0 || del !== 0) escrituras[tabla] = `update ${upd} · delete ${del}`;
      }
      return { ...vista, escrituras };
    },
    { tenantId: base.a.id },
  );
  const noCero = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).filter(([, n]) => n !== 0));
  assert.deepEqual(noCero(desdeA.visibles), {}, "A ve filas de las tablas nuevas");
  assert.deepEqual(noCero(desdeA.deB), {}, "A ve la fila de B");
  assert.deepEqual(desdeA.escrituras, {}, "A escribe sobre la fila de B");

  // Sin contexto: nada.
  const sinContexto = await comoApp(base, "", (c) => medir(deClientePg(c), s, TABLAS));
  assert.deepEqual(noCero(sinContexto.visibles), {}, "sin tenant fijado se ven filas");

  // Contraprueba: con el contexto de B, la fila está y es la sembrada (si no, la prueba no prueba nada).
  const desdeB = await comoApp(base, base.b.id, (c) => medir(deClientePg(c), s, TABLAS));
  const faltan = TABLAS.filter((x) => desdeB.deB[x] !== 1 || desdeB.visibles[x] < 1);
  assert.deepEqual(faltan, [], "B no ve su propia fila");
});

test("C-O43 · 4 · el instrumento detecta una tabla sin RLS y una sin política (rojo, se deshace)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const [sinRls, sinPolitica] = TABLAS;
  const c = new pg.Client({ connectionString: s.base.urlDuenio });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(`ALTER TABLE ${q(sinRls)} DISABLE ROW LEVEL SECURITY`);
    await c.query(`DROP POLICY tenant_isolation ON ${q(sinPolitica)}`);
    const problemas = await auditarCatalogo(deClientePg(c), TABLAS);
    assert.deepEqual(problemas, [`${sinRls}: sin RLS`, `${sinPolitica}: sin política`]);
    // El dueño también cae bajo FORCE: con RLS, desde A ve 0; con la tabla sin RLS, ve la fila de B.
    await c.query(`SELECT set_config('${GUC}', $1, true)`, [s.base.a.id]);
    const { deB } = await medir(deClientePg(c), s, TABLAS);
    assert.deepEqual(Object.fromEntries(Object.entries(deB).filter(([, n]) => n !== 0)), { [sinRls]: 1 });
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
});
