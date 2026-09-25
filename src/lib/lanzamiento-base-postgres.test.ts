// R0-F1 · La migración única de lanzamiento (prisma/migrations/20260925120000_lanzamiento_base),
// contra Postgres real, en bases efímeras (src/test/base-efimera.ts) armadas con
// `prisma migrate deploy` + RLS, como producción:
//   · el aislamiento de las 13 tablas nuevas se mide en una base armada COMO EL DEPLOY
//     (scripts/vercel-build.mjs: migraciones + permisos de la app, SIN prisma/rls/0001, que borra y
//     vuelve a crear las políticas y taparía lo que trae la migración): RLS prendido, una sola
//     política, la del negocio de la transacción; como `app_rls`, con otro negocio o sin negocio,
//     0 filas, y ninguna fila pasa a nombre de otro (WITH CHECK). La prueba se prueba a sí misma:
//     con el bloque de la migración aflojado (USING o WITH CHECK en true), falla;
//   · una cuenta externa (el número de WhatsApp, la tienda) no se vincula a dos negocios, aunque
//     el segundo no pueda ver la fila del primero ni la escriba de otra forma (mayúsculas,
//     espacios, caracteres invisibles);
//   · las llaves foráneas con el negocio adentro no dejan apuntar a filas de otro negocio (tampoco
//     el uso, el outbox, el outbox del evento ni el mensaje del extracto), ni anotar contactos,
//     extractos o delegaciones de un negocio que no está en la cartera; con un id ajeno el error
//     es el mismo exista o no la fila del otro, y el otro sigue contando su uso;
//   · los CHECK y los únicos de producto y compra frenan lo que tienen que frenar;
//   · la reversa frena si perdería datos que no se pueden reconstruir, y si no, deja la base IGUAL
//     a una armada sin esta migración (mismo catálogo, mismos datos) y `migrate deploy` la repone.
// Sin Postgres local se saltea y lo dice; en CI, falla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  ROL_APP,
  ROL_DUENIO,
  baseEfimeraDelArchivo,
  baseEfimeraParaElTest,
  urlDeRol,
  urlDelServidor,
  type BaseEfimera,
} from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const MIGRACION = "20260925120000_lanzamiento_base";
const MIGRACIONES = path.join(process.cwd(), "prisma", "migrations");
const REVERSA = path.join(MIGRACIONES, MIGRACION, "rollback.sql");

const TABLAS_NUEVAS = [
  "IntegracionConexion", "IntegracionCredencial", "EventoIntegracion", "IntegracionUso",
  "IntegracionEstadoOAuth", "ContactoCartera", "ConversacionWhatsapp", "MensajeWhatsapp",
  "ExtractoRecibido", "DelegacionFiscal", "ReceptorFiscal", "EnvioComprobante", "ArcaAuthTicket",
] as const;

// SQLSTATE
const UNICO = "23505";
const LLAVE_FORANEA = "23503";
const CHECK = "23514";
const RLS = "42501";

type Fila = Record<string, unknown>;
/** Las dos conexiones a una base: como dueño de las tablas y como `app_rls`. */
type Urls = Pick<BaseEfimera, "urlDuenio" | "urlApp">;

async function conCliente<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Como el dueño de las tablas (sin RLS: la consola del operador, las migraciones). */
function comoDuenio(base: Urls, sql: string, params: unknown[] = []): Promise<pg.QueryResult<Fila>> {
  return conCliente(base.urlDuenio, (c) => c.query<Fila>(sql, params));
}

/** Como `app_rls`, en una transacción con el negocio puesto (como `tenantTransaction`); null = sin negocio. */
function comoApp(base: Urls, tenantId: string | null, sql: string, params: unknown[] = []): Promise<pg.QueryResult<Fila>> {
  return conCliente(base.urlApp, async (c) => {
    await c.query("BEGIN");
    try {
      if (tenantId !== null) await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const r = await c.query<Fila>(sql, params);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    }
  });
}

async function falla(p: Promise<unknown>, sqlstate: string, que: string): Promise<void> {
  await assert.rejects(p, (e: { code?: string; message?: string }) => {
    assert.equal(e.code, sqlstate, `${que}: esperaba ${sqlstate}, vino ${e.code} (${e.message})`);
    // 42501 es también "permiso denegado": tiene que ser la política, no un GRANT que falta.
    if (sqlstate === RLS) assert.match(String(e.message), /row-level security/, `${que}: ${e.message}`);
    return true;
  });
}

const sufijo = () => randomBytes(4).toString("hex");

/** Un negocio más, fuera de toda cartera. */
async function otroNegocio(base: Urls): Promise<string> {
  const id = `neg_c_${sufijo()}`;
  await comoDuenio(base, `INSERT INTO "Tenant" (id, name, slug, "updatedAt") VALUES ($1, 'Negocio C', $1, now())`, [id]);
  return id;
}

/** Una fila en cada tabla nueva para el negocio `x` (el otro es `y`), como el dueño. Devuelve los ids. */
async function sembrar(base: Urls, x: string, y: string, s: string) {
  const ids = {
    cartera: `cc_${s}`, conexion: `cx_${s}`, conversacion: `cv_${s}`, factura: `in_${s}`, factura2: `in2_${s}`,
  };
  const tel = `54911${String(randomBytes(4).readUInt32BE(0)).padStart(10, "0").slice(-8)}`;
  const sql = [
    [`INSERT INTO "CarteraCliente" (id, "tenantId", "clienteTenantId", alias, "updatedAt") VALUES ($1, $2, $3, 'cliente', now()) ON CONFLICT ("tenantId", "clienteTenantId") DO NOTHING`, [ids.cartera, x, y]],
    [`INSERT INTO "IntegracionConexion" (id, "tenantId", conector, "cuentaExterna", "updatedAt") VALUES ($1, $2, 'whatsapp', $3, now())`, [ids.conexion, x, `pn_${s}`]],
    [`INSERT INTO "IntegracionCredencial" (id, "tenantId", "conexionId", campo, "kekId", "wrappedDek", sealed, "cargadaPor", "updatedAt") VALUES ($1, $2, $3, 'access_token', 'k', 'w', 's', 'user:1', now())`, [`cr_${s}`, x, ids.conexion]],
    [`INSERT INTO "EventoIntegracion" (id, "tenantId", "conexionId", direccion, tipo, "idExterno") VALUES ($1, $2, $3, 'entrada', 'archivo.recibido', $4)`, [`ev_${s}`, x, ids.conexion, `wamid_${s}`]],
    [`INSERT INTO "IntegracionUso" (id, "tenantId", "conexionId", mes) VALUES ($1, $2, $3, '2026-09')`, [`us_${s}`, x, ids.conexion]],
    [`INSERT INTO "IntegracionEstadoOAuth" (nonce, "tenantId", conector, expira) VALUES ($1, $2, 'mercadopago', now() + interval '1 hour')`, [`n_${s}`, x]],
    [`INSERT INTO "ContactoCartera" (id, "tenantId", "clienteTenantId", telefono, "updatedAt") VALUES ($1, $2, $3, $4, now())`, [`co_${s}`, x, y, tel]],
    [`INSERT INTO "ConversacionWhatsapp" (id, "tenantId", telefono, estado, "clienteTenantId", "updatedAt") VALUES ($1, $2, $3, 'inicio', $4, now())`, [ids.conversacion, x, tel, y]],
    [`INSERT INTO "MensajeWhatsapp" (id, "tenantId", "conversacionId", wamid, direccion, tipo, telefono) VALUES ($1, $2, $3, $4, 'entrada', 'document', $5)`, [`me_${s}`, x, ids.conversacion, `wamid_${s}`, tel]],
    [`INSERT INTO "ExtractoRecibido" (id, "tenantId", "clienteTenantId", mime, sha256, tamano, "updatedAt") VALUES ($1, $2, $3, 'application/pdf', $4, 10, now())`, [`ex_${s}`, x, y, `sha_${s}`]],
    [`INSERT INTO "ReceptorFiscal" (id, "tenantId", cuit, "updatedAt") VALUES ($1, $2, $3, now())`, [`rf_${s}`, x, `30${tel.slice(-9)}`]],
    [`INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", concepto, "docTipo", "docNro", fecha, neto, iva, total, "updatedAt") VALUES ($1, $2, 1, 1, 99, '0', '20260925', 100, 21, 121, now()), ($3, $2, 1, 1, 99, '0', '20260925', 10, 2.1, 12.1, now())`, [ids.factura, x, ids.factura2]],
    [`INSERT INTO "EnvioComprobante" (id, "tenantId", "invoiceId", canal, destino, "updatedAt") VALUES ($1, $2, $3, 'email', 'dueno@negocio.test', now())`, [`en_${s}`, x, ids.factura]],
    [`INSERT INTO "ArcaAuthTicket" (id, "certHuella", "tenantId", "kekId", "wrappedDek", sealed, expiration) VALUES ($1, $2, $3, 'k', 'w', 's', '2026-09-26T00:00:00-03:00')`, [`at_${s}`, `huella_${s}`, x]],
  ] as const;
  for (const [q, p] of sql) await comoDuenio(base, q, [...p]);
  return ids;
}

/** La delegación va del lado del cliente: `cliente` delegó en `estudio`, que lo tiene en su cartera. */
async function delegar(base: Urls, cliente: string, estudio: string, s: string): Promise<void> {
  await comoDuenio(
    base,
    `INSERT INTO "DelegacionFiscal" (id, "tenantId", "estudioTenantId", "cuitRepresentado", "cuitRepresentante", "updatedAt") VALUES ($1, $2, $3, '20111111112', '30222222223', now())`,
    [`de_${s}`, cliente, estudio],
  );
}

// ── El aislamiento que trae la migración, medido SIN prisma/rls/0001 ──────────────────────────

type BaseConNegocios = Urls & { a: string; b: string; c: string };

/**
 * Una base como la deja el deploy (scripts/vercel-build.mjs migra y no corre 0001): todas las
 * migraciones, aplicadas por el dueño, y los permisos de `app_rls` (los GRANT de
 * prisma/rls/0002_app_role.sql, que en Neon llegan por ALTER DEFAULT PRIVILEGES). Lo que aísla las
 * 13 tablas nuevas es sólo lo que trae esta migración. `aflojar` cambia el SQL de esta migración
 * antes de aplicarlo, para ver que la prueba nota una política floja. Siembra A, B y C.
 */
async function baseComoElDeploy(
  t: { after: (fn: () => Promise<void>) => void },
  aflojar: (sql: string) => string = (sql) => sql,
): Promise<BaseConNegocios> {
  const servidor = urlDelServidor();
  const nombre = `erp_test_${process.pid}_${randomBytes(6).toString("hex")}`;
  await conCliente(servidor, (c) => c.query(`CREATE DATABASE "${nombre}" OWNER "${ROL_DUENIO}"`));
  t.after(() => conCliente(servidor, (c) => c.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`)).then(() => undefined));
  const base: Urls = { urlDuenio: urlDeRol(servidor, ROL_DUENIO, nombre), urlApp: urlDeRol(servidor, ROL_APP, nombre) };
  await conCliente(base.urlDuenio, async (c) => {
    for (const dir of readdirSync(MIGRACIONES).sort()) {
      if (dir.startsWith("migration_lock")) continue;
      const sql = readFileSync(path.join(MIGRACIONES, dir, "migration.sql"), "utf8");
      await c.query(dir === MIGRACION ? aflojar(sql) : sql);
    }
    await c.query(
      `GRANT USAGE ON SCHEMA public TO ${ROL_APP};
       GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL_APP};
       GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROL_APP};`,
    );
  });
  const a = await otroNegocio(base);
  const b = await otroNegocio(base);
  const c = await otroNegocio(base);
  await sembrar(base, a, b, `a${sufijo()}`);
  await sembrar(base, b, a, `b${sufijo()}`);
  await delegar(base, a, b, `a${sufijo()}`); // A delegó en B (B tiene a A en su cartera)
  await delegar(base, b, a, `b${sufijo()}`);
  return { ...base, a, b, c };
}

const POLITICA = `("tenantId" = current_setting('app.current_tenant_id'::text, true))`;

/**
 * Lo que falla del aislamiento de las 13 tablas nuevas; vacío = aisladas. El catálogo: RLS
 * prendido y UNA política (otra permisiva la abriría), la del negocio de la transacción en USING y
 * en WITH CHECK. La conducta, como `app_rls`: A ve todas las suyas y ninguna ajena; otro negocio
 * (C) y sin negocio, 0 filas; A no puede dar de alta una fila a nombre de B.
 */
async function fallasDeAislamiento(base: BaseConNegocios): Promise<string[]> {
  const { a, b, c } = base;
  const fallas: string[] = [];
  const cat = await comoDuenio(
    base,
    `SELECT c.relname AS tabla, c.relrowsecurity AS rls,
            coalesce(array_agg(p.policyname::text ORDER BY p.policyname) FILTER (WHERE p.policyname IS NOT NULL), '{}') AS politicas,
            max(p.qual) AS qual, max(p.with_check) AS with_check
       FROM pg_class c
       LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
      WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1)
      GROUP BY 1, 2 ORDER BY 1`,
    [TABLAS_NUEVAS],
  );
  if (cat.rows.length !== TABLAS_NUEVAS.length) fallas.push(`existen ${cat.rows.length} de ${TABLAS_NUEVAS.length} tablas`);
  for (const f of cat.rows) {
    if (f.rls !== true) fallas.push(`${f.tabla}: RLS apagado`);
    if (JSON.stringify(f.politicas) !== JSON.stringify(["tenant_isolation"])) fallas.push(`${f.tabla}: políticas ${JSON.stringify(f.politicas)}`);
    if (f.qual !== POLITICA) fallas.push(`${f.tabla}: USING ${String(f.qual)}`);
    if (f.with_check !== POLITICA) fallas.push(`${f.tabla}: WITH CHECK ${String(f.with_check)}`);
  }
  for (const tabla of TABLAS_NUEVAS) {
    try {
      const deA = Number((await comoDuenio(base, `SELECT count(*) AS n FROM "${tabla}" WHERE "tenantId" = $1`, [a])).rows[0].n);
      const vistaA = (await comoApp(base, a, `SELECT "tenantId" FROM "${tabla}"`)).rows;
      if (deA < 1) fallas.push(`${tabla}: sin filas de A para probar`);
      if (vistaA.length !== deA || vistaA.some((f) => f.tenantId !== a)) fallas.push(`${tabla}: con el negocio A se ven ${vistaA.length} filas y ${deA} son suyas`);
      const deOtro = (await comoApp(base, c, `SELECT 1 FROM "${tabla}"`)).rowCount;
      if (deOtro !== 0) fallas.push(`${tabla}: otro negocio ve ${deOtro} filas`);
      const sinNegocio = (await comoApp(base, null, `SELECT 1 FROM "${tabla}"`)).rowCount;
      if (sinNegocio !== 0) fallas.push(`${tabla}: sin negocio se ven ${sinNegocio} filas`);
    } catch (e) {
      fallas.push(`${tabla}: leer como app_rls falló (${(e as Error).message})`);
    }
    // WITH CHECK con un INSERT (un UPDATE con WHERE también exige que la fila nueva se pueda LEER, y
    // eso lo frena el USING aunque el WITH CHECK esté flojo): A copia una fila suya a nombre de B.
    try {
      const r = await comoApp(
        base,
        a,
        `INSERT INTO "${tabla}"
         SELECT (jsonb_populate_record(NULL::"${tabla}", to_jsonb(x) || jsonb_build_object(
                   'tenantId', $1::text, 'id', (to_jsonb(x)->>'id') || '_copia', 'nonce', (to_jsonb(x)->>'nonce') || '_copia'))).*
           FROM "${tabla}" x WHERE x."tenantId" = $2 LIMIT 1`,
        [b, a],
      );
      fallas.push(`${tabla}: A dio de alta ${r.rowCount} fila(s) a nombre de B`);
    } catch (e) {
      const { code, message } = e as { code?: string; message?: string };
      if (code !== RLS || !/row-level security/.test(String(message))) fallas.push(`${tabla}: al escribir a nombre de B frenó otra cosa (${code}: ${message})`);
    }
  }
  return fallas;
}

/** El SQL de la migración con una de las dos cláusulas de su política en `true`. */
function aflojar(clausula: "USING" | "WITH CHECK"): (sql: string) => string {
  const estricta = `'${clausula} ("tenantId" = current_setting(''app.current_tenant_id'', true))`;
  return (sql) => {
    assert.equal(sql.split(estricta).length - 1, 1, `la migración trae la cláusula ${clausula} estricta una sola vez`);
    return sql.replace(estricta, `'${clausula} (true)`);
  };
}

test("como la deja el deploy (sin prisma/rls/0001), la migración sola aísla las 13 tablas nuevas", async (t) => {
  if (!(await laBase(t))) return; // sin Postgres se saltea (en CI falla); y deja creados los roles
  const base = await baseComoElDeploy(t);
  assert.deepEqual(await fallasDeAislamiento(base), []);
  // Tampoco se da de alta una fila a nombre de otro: la política la rechaza (WITH CHECK).
  await falla(
    comoApp(base, base.a, `INSERT INTO "ReceptorFiscal" (id, "tenantId", cuit, "updatedAt") VALUES ($1, $2, '20333333334', now())`, [`rf_x${sufijo()}`, base.b]),
    RLS,
    "A escribe un receptor a nombre de B",
  );
  await falla(
    comoApp(base, base.a, `INSERT INTO "IntegracionConexion" (id, "tenantId", conector, "updatedAt") VALUES ($1, $2, 'tiendanube', now())`, [`cx_x${sufijo()}`, base.b]),
    RLS,
    "A crea una conexión a nombre de B",
  );
  // Y lo de B no se toca desde A: el UPDATE no lo encuentra.
  assert.equal((await comoApp(base, base.a, `UPDATE "IntegracionConexion" SET etiqueta = 'mía' WHERE "tenantId" = $1`, [base.b])).rowCount, 0);
});

test("la prueba del aislamiento no se deja engañar: con USING o WITH CHECK en true en la migración, falla en las 13 tablas", async (t) => {
  if (!(await laBase(t))) return;
  for (const clausula of ["USING", "WITH CHECK"] as const) {
    const fallas = await fallasDeAislamiento(await baseComoElDeploy(t, aflojar(clausula)));
    for (const tabla of TABLAS_NUEVAS) {
      assert.ok(fallas.includes(`${tabla}: ${clausula} true`), `${clausula} (true) en ${tabla}: lo nota el catálogo`);
      const conducta =
        clausula === "USING"
          ? fallas.some((f) => f.startsWith(`${tabla}: sin negocio se ven`)) && fallas.some((f) => f.startsWith(`${tabla}: otro negocio ve`))
          : fallas.some((f) => f.startsWith(`${tabla}: A dio de alta`) || f.startsWith(`${tabla}: al escribir a nombre de B frenó otra cosa`));
      assert.ok(conducta, `${clausula} (true) en ${tabla}: lo nota la conducta como app_rls`);
    }
  }
});

test("una cuenta externa no se vincula a dos negocios aunque el segundo no pueda ver la fila del primero", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a, b } = base;
  const cuenta = `pn_unico_${sufijo()}`;
  const alta = (negocio: string) =>
    comoApp(base, negocio, `INSERT INTO "IntegracionConexion" (id, "tenantId", conector, "cuentaExterna", "updatedAt") VALUES ($1, $2, 'whatsapp', $3, now())`, [
      `cx_${sufijo()}`, negocio, cuenta,
    ]);
  await alta(a.id);
  assert.equal((await comoApp(base, b.id, `SELECT 1 FROM "IntegracionConexion" WHERE "cuentaExterna" = $1`, [cuenta])).rowCount, 0, "B no la ve");
  await falla(alta(b.id), UNICO, "B vincula la misma cuenta");
  await falla(alta(a.id), UNICO, "A la vincula dos veces");
  // El mismo id de cuenta en OTRO conector no choca, y las conexiones pendientes (sin cuenta) tampoco.
  await comoApp(base, b.id, `INSERT INTO "IntegracionConexion" (id, "tenantId", conector, "cuentaExterna", "updatedAt") VALUES ($1, $2, 'tiendanube', $3, now())`, [`cx_${sufijo()}`, b.id, cuenta]);
  for (let i = 0; i < 2; i++) {
    await comoApp(base, a.id, `INSERT INTO "IntegracionConexion" (id, "tenantId", conector, "updatedAt") VALUES ($1, $2, 'whatsapp', now())`, [`cx_${sufijo()}`, a.id]);
  }
});

test("las llaves foráneas con el negocio adentro: nada apunta a filas de otro negocio ni a clientes fuera de la cartera", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a, b } = base;
  const deA = await sembrar(base, a.id, b.id, `a${sufijo()}`);
  const deB = await sembrar(base, b.id, a.id, `b${sufijo()}`);
  const fuera = await otroNegocio(base); // no está en ninguna cartera
  const s = sufijo();

  await falla(
    comoApp(base, a.id, `INSERT INTO "IntegracionCredencial" (id, "tenantId", "conexionId", campo, "kekId", "wrappedDek", sealed, "cargadaPor", "updatedAt") VALUES ($1, $2, $3, 'ck', 'k', 'w', 's', 'user:1', now())`, [`cr_x${s}`, a.id, deB.conexion]),
    LLAVE_FORANEA,
    "credencial de A colgada de una conexión de B",
  );
  await falla(
    comoApp(base, a.id, `INSERT INTO "EventoIntegracion" (id, "tenantId", "conexionId", direccion, tipo, "idExterno") VALUES ($1, $2, $3, 'entrada', 'pedido.creado', 'x')`, [`ev_x${s}`, a.id, deB.conexion]),
    LLAVE_FORANEA,
    "evento de A en una conexión de B",
  );
  await falla(
    comoApp(base, a.id, `INSERT INTO "EnvioComprobante" (id, "tenantId", "invoiceId", canal, destino, "updatedAt") VALUES ($1, $2, $3, 'whatsapp', '5491100000000', now())`, [`en_x${s}`, a.id, deB.factura]),
    LLAVE_FORANEA,
    "envío de A de un comprobante de B",
  );
  await falla(
    comoApp(base, a.id, `UPDATE "Invoice" SET "comprobanteAsociadoId" = $1 WHERE id = $2`, [deB.factura, deA.factura2]),
    LLAVE_FORANEA,
    "nota de A asociada a un comprobante de B",
  );
  assert.equal((await comoApp(base, a.id, `UPDATE "Invoice" SET "comprobanteAsociadoId" = $1 WHERE id = $2`, [deA.factura, deA.factura2])).rowCount, 1, "a uno propio, sí");
  await falla(
    comoApp(base, a.id, `INSERT INTO "MensajeWhatsapp" (id, "tenantId", "conversacionId", wamid, direccion, tipo, telefono) VALUES ($1, $2, $3, $4, 'salida', 'text', '1')`, [`me_x${s}`, a.id, deB.conversacion, `w_x${s}`]),
    LLAVE_FORANEA,
    "mensaje de A en una conversación de B",
  );
  await falla(
    comoApp(base, a.id, `INSERT INTO "ContactoCartera" (id, "tenantId", "clienteTenantId", telefono, "updatedAt") VALUES ($1, $2, $3, '5491100000001', now())`, [`co_x${s}`, a.id, fuera]),
    LLAVE_FORANEA,
    "contacto de un negocio que no está en la cartera de A",
  );
  await falla(
    comoApp(base, a.id, `INSERT INTO "ExtractoRecibido" (id, "tenantId", "clienteTenantId", mime, sha256, tamano, "updatedAt") VALUES ($1, $2, $3, 'text/csv', 'h', 1, now())`, [`ex_x${s}`, a.id, fuera]),
    LLAVE_FORANEA,
    "extracto para un negocio fuera de la cartera",
  );
  await falla(
    comoApp(base, a.id, `INSERT INTO "ConversacionWhatsapp" (id, "tenantId", telefono, estado, "clienteTenantId", "updatedAt") VALUES ($1, $2, '5491100000002', 'eligiendo_cliente', $3, now())`, [`cv_x${s}`, a.id, fuera]),
    LLAVE_FORANEA,
    "conversación con un cliente fuera de la cartera",
  );
  // Sin cliente elegido (un número desconocido), la conversación sí se guarda.
  await comoApp(base, a.id, `INSERT INTO "ConversacionWhatsapp" (id, "tenantId", telefono, estado, "updatedAt") VALUES ($1, $2, '5491100000003', 'desconocido', now())`, [`cv_y${s}`, a.id]);
  // Plano de control (el dueño de las tablas, sin RLS): una delegación exige la cartera del estudio.
  await falla(delegar(base, fuera, a.id, `x${s}`), LLAVE_FORANEA, "delegación en un estudio que no tiene al cliente");
  const nuevo = await otroNegocio(base);
  await comoDuenio(base, `INSERT INTO "CarteraCliente" (id, "tenantId", "clienteTenantId", alias, "updatedAt") VALUES ($1, $2, $3, 'nuevo', now())`, [`cc_y${s}`, a.id, nuevo]);
  await delegar(base, nuevo, a.id, `y${s}`); // ahora A lo tiene en su cartera
  await falla(delegar(base, nuevo, a.id, `z${s}`), UNICO, "una sola delegación por cliente y servicio");
});

test("con la sesión de A y los ids de B, la base no deja apuntar a lo de B, no le traba el contador y no delata qué tiene", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a, b } = base;
  const deA = await sembrar(base, a.id, b.id, `a${sufijo()}`);
  const deB = await sembrar(base, b.id, a.id, `b${sufijo()}`);
  const s = sufijo();
  const noExiste = `cx_no_existe_${s}`;
  // Lo de B (y lo propio de A) que se va a nombrar: uso de 2026-10, evento, outbox, mensajes.
  await comoDuenio(base, `INSERT INTO "IntegracionUso" (id, "tenantId", "conexionId", mes, eventos) VALUES ($1, $2, $3, '2026-10', 1)`, [`us_b${s}`, b.id, deB.conexion]);
  await comoDuenio(base, `INSERT INTO "EventoIntegracion" (id, "tenantId", "conexionId", direccion, tipo, "idExterno") VALUES ($1, $2, $3, 'entrada', 'archivo.recibido', $4)`, [`ev_b${s}`, b.id, deB.conexion, `wamid_b${s}`]);
  await comoDuenio(base, `INSERT INTO "OutboxEvent" (id, "tenantId", type, payload, "conexionId") VALUES ($1, $2, 'integracion.enviar', '{}', $3), ($4, $5, 'integracion.enviar', '{}', $6)`, [`ob_b${s}`, b.id, deB.conexion, `ob_a${s}`, a.id, deA.conexion]);
  await comoDuenio(base, `INSERT INTO "MensajeWhatsapp" (id, "tenantId", "conversacionId", wamid, direccion, tipo, telefono) VALUES ($1, $2, $3, $4, 'entrada', 'document', '1'), ($5, $6, $7, $8, 'entrada', 'document', '1')`, [
    `me_b${s}`, b.id, deB.conversacion, `wm_b${s}`, `me_a${s}`, a.id, deA.conversacion, `wm_a${s}`,
  ]);

  // El contador: el alta-o-suma de A con la conexión de B da el MISMO error que con una que no
  // existe (nada que inferir), y B sigue sumando su propio uso de ese mes.
  const contar = (negocio: string, conexion: string) =>
    comoApp(
      base,
      negocio,
      `INSERT INTO "IntegracionUso" (id, "tenantId", "conexionId", mes, eventos) VALUES ($1, $2, $3, '2026-10', 1)
       ON CONFLICT ("tenantId", "conexionId", mes) DO UPDATE SET eventos = "IntegracionUso".eventos + 1 RETURNING eventos`,
      [`us_x${sufijo()}`, negocio, conexion],
    );
  await falla(contar(a.id, deB.conexion), LLAVE_FORANEA, "uso de A con la conexión de B, que ya contó ese mes");
  await falla(contar(a.id, noExiste), LLAVE_FORANEA, "uso de A con una conexión que no existe");
  assert.equal((await contar(b.id, deB.conexion)).rows[0].eventos, 2, "B suma su uso");
  assert.equal((await contar(a.id, deA.conexion)).rows[0].eventos, 1, "A cuenta el suyo");

  // Credencial y evento con la conexión de B, repitiendo lo que B ya tiene: llave foránea, no único.
  const credencial = (conexion: string) =>
    comoApp(base, a.id, `INSERT INTO "IntegracionCredencial" (id, "tenantId", "conexionId", campo, "kekId", "wrappedDek", sealed, "cargadaPor", "updatedAt") VALUES ($1, $2, $3, 'access_token', 'k', 'w', 's', 'user:1', now())`, [`cr_x${sufijo()}`, a.id, conexion]);
  await falla(credencial(deB.conexion), LLAVE_FORANEA, "credencial de A igual a la de B, en la conexión de B");
  await falla(credencial(noExiste), LLAVE_FORANEA, "credencial de A en una conexión que no existe");
  const evento = (conexion: string) =>
    comoApp(base, a.id, `INSERT INTO "EventoIntegracion" (id, "tenantId", "conexionId", direccion, tipo, "idExterno") VALUES ($1, $2, $3, 'entrada', 'archivo.recibido', $4)`, [`ev_x${sufijo()}`, a.id, conexion, `wamid_b${s}`]);
  await falla(evento(deB.conexion), LLAVE_FORANEA, "evento de A igual al de B, en la conexión de B");
  await falla(evento(noExiste), LLAVE_FORANEA, "evento de A en una conexión que no existe");

  // El outbox: sin conexión (los eventos de ARCA) o con una propia, sí; con la de B, no.
  const outbox = (conexion: string | null) =>
    comoApp(base, a.id, `INSERT INTO "OutboxEvent" (id, "tenantId", type, payload, "conexionId") VALUES ($1, $2, 'integracion.enviar', '{}', $3)`, [`ob_x${sufijo()}`, a.id, conexion]);
  await falla(outbox(deB.conexion), LLAVE_FORANEA, "evento del outbox de A por el canal de B");
  await outbox(null);
  await outbox(deA.conexion);

  // El evento que apunta a un evento del outbox, y el extracto que apunta al mensaje que lo trajo.
  const eventoConOutbox = (outboxId: string) =>
    comoApp(base, a.id, `INSERT INTO "EventoIntegracion" (id, "tenantId", "conexionId", direccion, tipo, "idExterno", "outboxId") VALUES ($1, $2, $3, 'salida', 'mensaje.enviado', $4, $5)`, [`ev_y${sufijo()}`, a.id, deA.conexion, `sal_${sufijo()}`, outboxId]);
  await falla(eventoConOutbox(`ob_b${s}`), LLAVE_FORANEA, "evento de A colgado del outbox de B");
  await eventoConOutbox(`ob_a${s}`);
  const extracto = (mensajeId: string) =>
    comoApp(base, a.id, `INSERT INTO "ExtractoRecibido" (id, "tenantId", "clienteTenantId", "mensajeId", mime, sha256, tamano, "updatedAt") VALUES ($1, $2, $3, $4, 'application/pdf', $5, 1, now())`, [`ex_y${sufijo()}`, a.id, b.id, mensajeId, `sha_${sufijo()}`]);
  await falla(extracto(`me_b${s}`), LLAVE_FORANEA, "extracto de A con un mensaje de B");
  await extracto(`me_a${s}`);
});

test("una cuenta externa, un negocio: la base no acepta la misma cuenta escrita de otra forma", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a, b } = base;
  const cuenta = `pn_${sufijo()}`;
  const alta = (negocio: string, conector: string, cuentaExterna: string | null) =>
    comoApp(base, negocio, `INSERT INTO "IntegracionConexion" (id, "tenantId", conector, "cuentaExterna", "updatedAt") VALUES ($1, $2, $3, $4, now())`, [
      `cx_${sufijo()}`, negocio, conector, cuentaExterna,
    ]);
  await alta(a.id, "whatsapp", cuenta);
  const disfraces: Array<[string, string]> = [
    ["WhatsApp", cuenta], ["whatsapp ", cuenta], [" whatsapp", cuenta], ["whats app", cuenta], ["", cuenta],
    ["whatsapp", ` ${cuenta}`], ["whatsapp", `${cuenta} `], ["whatsapp", `${cuenta}​`], ["whatsapp", `${cuenta}\n`],
    ["whatsapp", `ｐ${cuenta.slice(1)}`], ["whatsapp", ""],
  ];
  for (const [conector, cuentaExterna] of disfraces) {
    await falla(alta(b.id, conector, cuentaExterna), CHECK, `B vincula ${JSON.stringify([conector, cuentaExterna])}`);
  }
  await falla(alta(b.id, "whatsapp", cuenta), UNICO, "B vincula la misma cuenta, bien escrita");
  await alta(b.id, "mercado-libre", `ML_${sufijo()}`); // conector con guion y cuenta con mayúsculas: entra
  await falla(
    comoApp(base, a.id, `INSERT INTO "IntegracionEstadoOAuth" (nonce, "tenantId", conector, expira) VALUES ($1, $2, 'MercadoPago', now() + interval '1 hour')`, [`n_${sufijo()}`, a.id]),
    CHECK,
    "estado de OAuth con el conector mal escrito",
  );
});

test("producto y compra: alícuota por código, código único por negocio, la misma factura de proveedor una sola vez", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a, b } = base;
  const producto = (negocio: string, extra: Record<string, unknown>) => {
    const cols = Object.keys(extra).map((k) => `"${k}"`).join(", ");
    const vals = Object.keys(extra).map((_, i) => `$${i + 3}`).join(", ");
    return comoApp(base, negocio, `INSERT INTO "Product" (id, "tenantId", name, "updatedAt"${cols ? `, ${cols}` : ""}) VALUES ($1, $2, 'Vela', now()${vals ? `, ${vals}` : ""})`, [
      `pr_${sufijo()}`, negocio, ...Object.values(extra),
    ]);
  };
  await falla(producto(a.id, { alicuotaIva: 21 }), CHECK, "el porcentaje en vez del código");
  for (const codigo of [5, 4, 6, 3, 8, 9, 1, 2]) await producto(a.id, { alicuotaIva: codigo });
  await falla(producto(a.id, { codigo: "" }), CHECK, "código vacío");
  await falla(producto(a.id, { codigo: " 7790001" }), CHECK, "código con espacio");
  const codigo = `779${sufijo()}`;
  await producto(a.id, { codigo });
  await falla(producto(a.id, { codigo }), UNICO, "el mismo código dos veces en A");
  await producto(b.id, { codigo }); // en otro negocio, sí
  await producto(a.id, {});
  await producto(a.id, {}); // sin código no choca

  const compra = (negocio: string, code: number, factura: Record<string, unknown>) => {
    const cols = Object.keys(factura).map((k) => `, "${k}"`).join("");
    const vals = Object.keys(factura).map((_, i) => `, $${i + 4}`).join("");
    return comoApp(base, negocio, `INSERT INTO "StockPurchase" (id, "tenantId", code, "createdBy"${cols}) VALUES ($1, $2, $3, 'user:1'${vals})`, [
      `sp_${sufijo()}`, negocio, code, ...Object.values(factura),
    ]);
  };
  const factura = { facturaCuit: "30712345678", facturaTipo: 1, facturaPuntoVenta: 3, facturaNumero: 1234, facturaNeto: "1000.00", facturaIva: "210.00", facturaTotal: "1210.00" };
  await compra(a.id, 900001, factura);
  await falla(compra(a.id, 900002, factura), UNICO, "la misma factura del proveedor dos veces");
  await compra(a.id, 900003, { ...factura, facturaNumero: 1235 });
  await compra(b.id, 900001, factura); // otro negocio le compra al mismo proveedor
  await compra(a.id, 900004, {});
  await compra(a.id, 900005, {}); // compras sin factura no chocan
  const guardada = (await comoApp(base, a.id, `SELECT "facturaTotal"::text AS t FROM "StockPurchase" WHERE code = 900001`)).rows[0];
  assert.equal(guardada.t, "1210.00", "el importe queda en decimal exacto");

  await falla(
    comoApp(base, a.id, `UPDATE "Tenant" SET "arcaConceptoDefault" = 4 WHERE id = $1`, [a.id]),
    CHECK,
    "concepto fuera de 1, 2, 3",
  );
});

test("Client.phone acepta NULL en la base y las llaves por negocio nacen nulas (heredan la variable de entorno)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { a } = base;
  const id = `cl_${sufijo()}`;
  await comoApp(base, a.id, `INSERT INTO "Client" (id, "tenantId", name, "updatedAt", "docTipo", "docNro", "razonSocial", "condicionIva") VALUES ($1, $2, 'Distribuidora Norte SA', now(), 80, '30712345678', 'Distribuidora Norte SA', 'RESPONSABLE_INSCRIPTO')`, [id, a.id]);
  const f = (await comoApp(base, a.id, `SELECT phone FROM "Client" WHERE id = $1`, [id])).rows[0];
  assert.equal(f.phone, null);
  const llaves = (await comoDuenio(base, `SELECT "cuentasCorrientes", perfiles, "fceMiPyme", "arcaCondicionIva" FROM "Tenant" WHERE id = ANY($1)`, [[base.a.id, base.b.id]])).rows;
  assert.deepEqual(llaves, [
    { cuentasCorrientes: null, perfiles: null, fceMiPyme: false, arcaCondicionIva: null },
    { cuentasCorrientes: null, perfiles: null, fceMiPyme: false, arcaCondicionIva: null },
  ]);
  await comoDuenio(base, `DELETE FROM "Client" WHERE id = $1`, [id]);
});

// ── La reversa ───────────────────────────────────────────────────────────────────────────────

/** El catálogo de la base, sin `_prisma_migrations` (una base armada a mano no la tiene). */
async function catalogo(url: string): Promise<Fila> {
  return conCliente(url, async (c) => {
    const q = async (sql: string) => (await c.query<Fila>(sql)).rows;
    const fuera = `NOT IN ('_prisma_migrations')`;
    return {
      columnas: await q(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, numeric_precision, numeric_scale
                           FROM information_schema.columns WHERE table_schema = 'public' AND table_name ${fuera} ORDER BY 1, 2`),
      indices: await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename ${fuera} ORDER BY 2`),
      restricciones: await q(`SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
                               WHERE connamespace = 'public'::regnamespace AND conrelid::regclass::text <> '_prisma_migrations' ORDER BY 2`),
      tipos: await q(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS valores FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                       WHERE t.typnamespace = 'public'::regnamespace GROUP BY 1 ORDER BY 1`),
      rls: await q(`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname ${fuera} ORDER BY 1`),
      politicas: await q(`SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`),
      triggers: await q(`SELECT tgrelid::regclass::text AS tabla, tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY 2`),
      funciones: await q(`SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY 1`),
    };
  });
}

/** Cuántas filas y qué contienen, por tabla, mirando sólo las columnas que existían antes. */
async function huellaDeDatos(url: string, columnasDeAntes: Map<string, string[]>): Promise<Record<string, string>> {
  return conCliente(url, async (c) => {
    const out: Record<string, string> = {};
    for (const [tabla, cols] of columnasDeAntes) {
      const lista = cols.map((k) => `"${k}"`).join(", ");
      const r = await c.query<{ h: string }>(
        `SELECT count(*) || ':' || coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') AS h FROM (SELECT row(${lista}) AS x FROM "${tabla}") s`,
      );
      out[tabla] = r.rows[0].h;
    }
    return out;
  });
}

/** Una base armada con todas las migraciones MENOS ésta, + 0001: cómo tiene que quedar la reversa. */
async function baseSinEstaMigracion(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const servidor = urlDelServidor();
  const nombre = `erp_test_${process.pid}_${randomBytes(6).toString("hex")}`;
  await conCliente(servidor, (c) => c.query(`CREATE DATABASE "${nombre}" OWNER "${ROL_DUENIO}"`));
  t.after(() => conCliente(servidor, (c) => c.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`)).then(() => undefined));
  const url = urlDeRol(servidor, ROL_DUENIO, nombre);
  await conCliente(url, async (c) => {
    for (const dir of readdirSync(MIGRACIONES).sort()) {
      if (dir === MIGRACION || dir.startsWith("migration_lock")) continue;
      await c.query(readFileSync(path.join(MIGRACIONES, dir, "migration.sql"), "utf8"));
    }
  });
  await conCliente(urlDeRol(servidor, null, nombre), (c) =>
    c.query(readFileSync(path.join(process.cwd(), "prisma", "rls", "0001_enable_rls.sql"), "utf8")),
  );
  return url;
}

async function reversa(base: Urls, conPerdida = false): Promise<void> {
  const sql = readFileSync(REVERSA, "utf8");
  await conCliente(base.urlDuenio, async (c) => {
    if (conPerdida) await c.query(`SET lanzamiento.reversa_con_perdida = 'si'`);
    await c.query(sql);
  });
}

test("la reversa frena si perdería lo que no se reconstruye; si no, deja la base igual a una sin la migración y migrate deploy la repone", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const referencia = await baseSinEstaMigracion(t);
  const { a, b } = base;

  // Lo que existía antes: columnas de la base de referencia; datos de hoy de la base migrada.
  const refCatalogo = await catalogo(referencia);
  const columnasDeAntes = new Map<string, string[]>();
  for (const f of refCatalogo.columnas as Fila[]) {
    const lista = columnasDeAntes.get(String(f.table_name)) ?? [];
    lista.push(String(f.column_name));
    columnasDeAntes.set(String(f.table_name), lista);
  }
  // Datos en lo nuevo (se pierden con la reversa, a sabiendas) y en columnas nuevas de tablas viejas.
  const deA = await sembrar(base, a.id, b.id, `a${sufijo()}`);
  await comoDuenio(base, `UPDATE "Tenant" SET "arcaCondicionIva" = 'MONOTRIBUTO', "cuentasCorrientes" = true WHERE id = $1`, [a.id]);
  await comoDuenio(base, `UPDATE "Client" SET "docTipo" = 96, "docNro" = '30111222' WHERE "tenantId" = $1`, [a.id]);
  const antes = await huellaDeDatos(base.urlDuenio, columnasDeAntes);
  const registrada = async () =>
    (await comoDuenio(base, `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`, [MIGRACION])).rows[0].n;
  const existe = async (tabla: string) => (await comoDuenio(base, `SELECT to_regclass($1) IS NOT NULL AS e`, [`public."${tabla}"`])).rows[0].e;
  assert.equal(await registrada(), 1);

  // Freno 1: un cliente sin teléfono. Sin atajo; no cambia nada.
  const sinTelefono = `cl_${sufijo()}`;
  await comoDuenio(base, `INSERT INTO "Client" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Empresa sin teléfono', now())`, [sinTelefono, a.id]);
  await assert.rejects(reversa(base, true), /sin teléfono/);
  assert.equal(await existe("IntegracionConexion"), true, "no cambió nada");
  assert.equal(await registrada(), 1);
  await comoDuenio(base, `DELETE FROM "Client" WHERE id = $1`, [sinTelefono]);

  // Freno 2: una nota de crédito asociada a su comprobante. Sólo con la autorización explícita.
  await comoDuenio(base, `UPDATE "Invoice" SET "comprobanteAsociadoId" = $1 WHERE id = $2`, [deA.factura, deA.factura2]);
  await assert.rejects(reversa(base), /dato\(s\) fiscal\(es\)/);
  assert.equal(await existe("IntegracionConexion"), true, "no cambió nada");
  assert.equal(await registrada(), 1);

  await reversa(base, true);
  assert.equal(await registrada(), 0, "la base ya no dice que la migración está aplicada");
  for (const tabla of TABLAS_NUEVAS) assert.equal(await existe(tabla), false, `${tabla} ya no está`);
  assert.deepEqual(await catalogo(base.urlDuenio), refCatalogo, "el catálogo es el de una base sin esta migración");
  assert.deepEqual(await huellaDeDatos(base.urlDuenio, columnasDeAntes), antes, "ninguna fila de antes cambió");

  // Volver a aplicarla con el mismo comando que el deploy.
  const salida = await new Promise<{ codigo: number; texto: string }>((ok) =>
    execFile(
      process.execPath,
      [path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: base.urlDuenio, MIGRATE_DATABASE_URL: base.urlDuenio }, timeout: 180_000 },
      (err, stdout, stderr) => ok({ codigo: err ? 1 : 0, texto: `${stdout}\n${stderr}` }),
    ),
  );
  assert.equal(salida.codigo, 0, salida.texto);
  assert.match(salida.texto, new RegExp(MIGRACION));
  assert.equal(await registrada(), 1);
  assert.deepEqual(await huellaDeDatos(base.urlDuenio, columnasDeAntes), antes, "y los datos de antes siguen iguales");

  // Re-aplicada por migrate deploy y SIN 0001 (como el deploy): la aísla lo que trae la migración.
  const c = await otroNegocio(base);
  await sembrar(base, a.id, b.id, `a${sufijo()}`);
  await sembrar(base, b.id, a.id, `b${sufijo()}`);
  await delegar(base, a.id, b.id, `a${sufijo()}`);
  await delegar(base, b.id, a.id, `b${sufijo()}`);
  assert.deepEqual(await fallasDeAislamiento({ urlDuenio: base.urlDuenio, urlApp: base.urlApp, a: a.id, b: b.id, c }), [], "re-aplicada, aislada");
});
