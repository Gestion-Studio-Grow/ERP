// ============================================================================
// MANT_roles_soporte · el rol legacy `app_user` (BYPASSRLS) no hereda nada de lo nuevo. Postgres efímero.
// ============================================================================
//
// En producción existe `app_user`, un rol viejo con BYPASSRLS que `neondb_owner` no puede corregir
// (prisma/rls/0002_app_role.sql, docs/runbooks/fase1-ops-seguridad.md §b). El ensayo de la tanda 3 en
// una copia mostró que heredaría permisos sobre las tablas nuevas (`NegocioProtegido`,
// `SoporteConsentimiento`) por los privilegios por defecto del dueño: con BYPASSRLS, eso es leer y
// firmar permisos de cualquier negocio. Este archivo reproduce ese estado (app_user con BYPASSRLS +
// privilegios por defecto sobre tablas, funciones y secuencias), aplica el SQL y comprueba:
//   · app_user no tiene ningún privilegio en las dos tablas ni EXECUTE en las funciones del candado;
//   · conectado como app_user: leer, firmar o llamar a una función → 42501;
//   · el control del §8 aborta si app_user tiene un privilegio directo, y también si lo HEREDA por
//     pertenecer a otro rol (el REVOKE directo no alcanza: la migración no se aplica a medias);
//   · sin app_user en la base (bases de prueba, ramas nuevas) el SQL aplica igual.
// Los roles son del servidor: se crean con el mismo candado que base-efimera.ts. Los privilegios por
// defecto y los GRANT a tablas son de ESTA base (no tocan las de otros tests).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { baseEfimeraParaElTest, urlDeRol, urlDelServidor } from "@/test/base-efimera";

const SQL = readFileSync(path.join(process.cwd(), "prisma/pending-gate2/MANT_roles_soporte.sql"), "utf8");
const CANDADO_DE_ROLES = 7_300_000_001; // el mismo de base-efimera.ts
const ROL_HEREDADO = "gsg_test_app_user_heredado";

const TABLAS = ['"NegocioProtegido"', '"SoporteConsentimiento"'] as const;
const FUNCIONES = [
  "gsg_negocio_protegido(text)",
  "gsg_consentimiento_lo_firma_el_titular()",
  "gsg_permiso_n1_cliente_de_cartera()",
  "gsg_permiso_n1_vigente()",
  "gsg_permiso_n2_vigente()",
  "gsg_permiso_n2_cliente_de_cartera()",
  "gsg_slug_del_negocio()",
  "gsg_slug_del_cliente()",
] as const;

/** El bloque de verificación del §8, solo (sin el resto del archivo). */
function verificacion(): string {
  const desde = SQL.indexOf("-- ── 8. Verificación");
  const hasta = SQL.indexOf("END $$;", desde);
  assert.ok(desde > 0 && hasta > desde, "el SQL tiene el bloque de verificación del §8");
  return SQL.slice(desde, hasta + "END $$;".length);
}

async function conectar(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

const denegado = (e: unknown) => (e as { code?: string }).code === "42501";

async function comoAdmin(nombreBase: string, sql: string): Promise<void> {
  const admin = await conectar(urlDeRol(urlDelServidor(), null, nombreBase));
  try {
    await admin.query("SELECT pg_advisory_lock($1)", [CANDADO_DE_ROLES]);
    await admin.query(sql);
  } finally {
    await admin.query("SELECT pg_advisory_unlock($1)", [CANDADO_DE_ROLES]).catch(() => {});
    await admin.end();
  }
}

async function privilegiosDeAppUser(c: pg.Client): Promise<string[]> {
  const abiertos: string[] = [];
  for (const t of TABLAS) {
    const r = await c.query<{ p: boolean; col: boolean }>(
      `SELECT has_table_privilege('app_user', $1, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS p,
              has_any_column_privilege('app_user', $1, 'SELECT,INSERT,UPDATE,REFERENCES') AS col`,
      [t],
    );
    if (r.rows[0]!.p || r.rows[0]!.col) abiertos.push(t);
  }
  for (const f of FUNCIONES) {
    const r = await c.query<{ p: boolean }>(`SELECT has_function_privilege('app_user', $1, 'EXECUTE') AS p`, [`public.${f}`]);
    if (r.rows[0]!.p) abiertos.push(f);
  }
  return abiertos;
}

const ROLES_DE_SOPORTE = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gsg_operador') THEN CREATE ROLE gsg_operador LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gsg_agente') THEN CREATE ROLE gsg_agente LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
END $$`;

test("MANT_roles_soporte: app_user (BYPASSRLS, privilegios por defecto) no hereda nada de soporte", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  // Como en producción: app_user existe, con LOGIN y BYPASSRLS.
  await comoAdmin(
    base.nombre,
    `${ROLES_DE_SOPORTE};
     DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user LOGIN BYPASSRLS; END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_HEREDADO}') THEN CREATE ROLE ${ROL_HEREDADO} NOLOGIN; END IF;
     END $$;
     REVOKE ${ROL_HEREDADO} FROM app_user`, // por si una corrida interrumpida dejó la pertenencia (los roles son del servidor)
  );
  const duenio = await conectar(base.urlDuenio);
  base.alBorrar(() => duenio.end().catch(() => {}));
  // Los privilegios por defecto viejos del dueño hacia app_user (los que hacen que «herede» lo nuevo).
  await duenio.query(`
    GRANT USAGE ON SCHEMA public TO app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT ALL ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_user;`);
  t.after(() =>
    duenio
      .query(`
        ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE ALL ON TABLES FROM app_user;
        ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM app_user;
        ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM app_user;`)
      .catch(() => {}),
  );

  // Línea de base: el escenario reproduce el hallazgo (una tabla nueva del dueño le queda abierta a app_user).
  await duenio.query(`CREATE TABLE "ProbarHerencia" (x int)`);
  const herencia = await duenio.query<{ p: boolean }>(`SELECT has_table_privilege('app_user', '"ProbarHerencia"', 'SELECT') AS p`);
  assert.equal(herencia.rows[0]!.p, true, "el escenario no reproduce los privilegios por defecto");
  await duenio.query(`DROP TABLE "ProbarHerencia"`);

  await t.test("aplicado (dos veces): app_user sin privilegios en las tablas ni EXECUTE en las funciones", async () => {
    await duenio.query(SQL);
    await duenio.query(SQL);
    assert.deepEqual(await privilegiosDeAppUser(duenio), []);
  });

  await t.test("conectado como app_user: no lee, no firma, no llama al candado", async () => {
    const appUser = await conectar(urlDeRol(urlDelServidor(), "app_user", base.nombre));
    try {
      await assert.rejects(appUser.query(`SELECT 1 FROM "NegocioProtegido"`), denegado, "leer NegocioProtegido");
      await assert.rejects(appUser.query(`DELETE FROM "NegocioProtegido"`), denegado, "borrar el candado de CH");
      await assert.rejects(appUser.query(`SELECT 1 FROM "SoporteConsentimiento"`), denegado, "leer permisos");
      await assert.rejects(
        appUser.query(`INSERT INTO "SoporteConsentimiento" (id, "tenantId", nivel, aceptado, "versionTexto", "userId") VALUES ('au', $1, 'n1', true, 'v', $2)`, [
          base.a.id,
          base.a.duenia.id,
        ]),
        denegado,
        "firmar un permiso",
      );
      await assert.rejects(appUser.query(`SELECT gsg_permiso_n1_vigente()`), denegado, "función del candado");
      await assert.rejects(appUser.query(`SELECT gsg_negocio_protegido('x')`), denegado, "función de CH");
    } finally {
      await appUser.end();
    }
  });

  await t.test("negativo: un privilegio directo de app_user hace abortar el control del §8", async () => {
    await duenio.query(`GRANT SELECT ON "SoporteConsentimiento" TO app_user`);
    try {
      await assert.rejects(duenio.query(verificacion()), /app_user/);
    } finally {
      await duenio.query(`REVOKE ALL ON "SoporteConsentimiento" FROM app_user`);
    }
    await duenio.query(`GRANT EXECUTE ON FUNCTION gsg_permiso_n1_vigente() TO app_user`);
    try {
      await assert.rejects(duenio.query(verificacion()), /app_user/);
    } finally {
      await duenio.query(`REVOKE EXECUTE ON FUNCTION gsg_permiso_n1_vigente() FROM app_user`);
    }
    await duenio.query(verificacion()); // limpio, pasa
  });

  await t.test("negativo: un privilegio HEREDADO por otro rol hace abortar el SQL entero, sin dejar nada", async () => {
    await duenio.query(`GRANT SELECT ON "NegocioProtegido" TO ${ROL_HEREDADO}`);
    await comoAdmin(base.nombre, `GRANT ${ROL_HEREDADO} TO app_user`);
    try {
      await duenio.query(`DROP POLICY IF EXISTS mant_agente_abierto ON "SupportTicket"`); // marca: el SQL la recrea
      await assert.rejects(duenio.query(SQL), /app_user/);
      await duenio.query("ROLLBACK").catch(() => {});
      const marca = await duenio.query(`SELECT 1 FROM pg_policies WHERE tablename = 'SupportTicket' AND policyname = 'mant_agente_abierto'`);
      assert.equal(marca.rowCount, 0, "abortó entero: no recreó la política");
    } finally {
      await comoAdmin(base.nombre, `REVOKE ${ROL_HEREDADO} FROM app_user`);
      await duenio.query(`REVOKE ALL ON "NegocioProtegido" FROM ${ROL_HEREDADO}`);
    }
    await duenio.query(SQL); // sin la herencia, aplica
    assert.deepEqual(await privilegiosDeAppUser(duenio), []);
  });

  // Certificación: una pertenencia con INHERIT FALSE no pasa por has_*_privilege('app_user', …) pero deja hacer
  // SET ROLE a un rol con permisos. El §8 mira cada rol al que app_user pertenece.
  await t.test("negativo: una pertenencia con INHERIT FALSE (sólo SET ROLE) también hace abortar el SQL", async () => {
    await duenio.query(`GRANT SELECT ON "SoporteConsentimiento" TO ${ROL_HEREDADO}`);
    await comoAdmin(base.nombre, `GRANT ${ROL_HEREDADO} TO app_user WITH INHERIT FALSE, SET TRUE`);
    try {
      const sinHerencia = await duenio.query(`SELECT has_table_privilege('app_user', '"SoporteConsentimiento"', 'SELECT') AS ve`);
      assert.equal(sinHerencia.rows[0].ve, false, "has_table_privilege no lo ve (por eso el control mira las pertenencias)");
      await assert.rejects(duenio.query(SQL), /app_user/);
      await duenio.query("ROLLBACK").catch(() => {});
    } finally {
      await comoAdmin(base.nombre, `REVOKE ${ROL_HEREDADO} FROM app_user`);
      await duenio.query(`REVOKE ALL ON "SoporteConsentimiento" FROM ${ROL_HEREDADO}`);
    }
    await duenio.query(SQL);
    assert.deepEqual(await privilegiosDeAppUser(duenio), []);
  });
});

test("MANT_roles_soporte: sin app_user en el servidor el SQL aplica igual", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  await comoAdmin(base.nombre, ROLES_DE_SOPORTE);
  const duenio = await conectar(base.urlDuenio);
  base.alBorrar(() => duenio.end().catch(() => {}));
  // El rol es del servidor y otro test lo crea: se simula su ausencia con un SQL que lo busca con otro nombre.
  const sinAppUser = SQL.replaceAll("'app_user'", "'app_user_no_existe'");
  assert.notEqual(sinAppUser, SQL, "el SQL nombra a app_user");
  await duenio.query(sinAppUser);
  const r = await duenio.query(`SELECT to_regclass('"SoporteConsentimiento"') IS NOT NULL AS ok`);
  assert.equal(r.rows[0].ok, true);
});
