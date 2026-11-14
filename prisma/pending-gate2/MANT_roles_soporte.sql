-- ============================================================================
-- MANT · roles de soporte (D9, 14/11/2026) + permiso del cliente (D4) + candado de CH (D5).
-- PREPARADA, SIN APLICAR: Gate 2 del dueño. Diseño: docs/producto/soporte/DISENO-MANT-001.md §7.2–7.6.
-- ============================================================================
--
-- ADITIVA e IDEMPOTENTE: no toca datos ni columnas existentes; se puede correr dos veces. Se corre como
-- `neondb_owner` DESPUÉS de `20261106120000_support_ticket` (aplicada el 07/11) y de `prisma/rls/0002`.
-- Prueba: src/lib/soporte/roles-soporte-postgres.test.ts (Postgres efímero, nunca Neon).
--
-- Qué agrega:
--   1. Roles `gsg_operador` (la consola, OPERATOR_DATABASE_URL) y `gsg_agente` (los agentes,
--      AGENTE_DATABASE_URL): LOGIN, sin contraseña (inertes hasta que el dueño les ponga una en Neon),
--      sin BYPASSRLS (se verifica al final: si alguno lo tuviera, la migración aborta).
--   2. `NegocioProtegido("negocioId")`: lista de negocios que ningún agente ve. Sin RLS, la escribe sólo
--      el dueño de las tablas. Se siembra con CH (slug `beauty-spa`). La columna NO se llama "tenantId"
--      a propósito: `prisma/rls/0001` le pondría `tenant_isolation` a toda tabla con esa columna.
--   3. `SoporteConsentimiento`: las casillas del titular (D4). Sólo se agregan filas (append-only):
--      nadie la edita ni la borra salvo el dueño de las tablas. RLS `tenant_isolation`.
--   4. `gsg_agente`, permisos por tabla y por columna (nada que no esté acá):
--        Tenant: SELECT (id, slug, name, status) · SupportTicket: SELECT + UPDATE (estado, "borradorIa",
--        "updatedAt") · SupportTicketEvento: SELECT, INSERT · AuditLog: INSERT · SoporteConsentimiento y
--        NegocioProtegido: SELECT. Nada en User, plata, ARCA, caja ni credenciales.
--      Más dos políticas RESTRICTIVAS sólo para `gsg_agente` (se suman a `tenant_isolation`, no la
--      reemplazan): (a) nunca un negocio protegido (CH), ni por "tenantId" ni por "clienteTenantId";
--      (b) sólo negocios con el permiso n1 VIGENTE (la última casilla n1 tildada; a igual hora gana la
--      revocación); en un ticket de cartera, el del estudio Y el del cliente (función SECURITY DEFINER
--      `gsg_permiso_n1_cliente_de_cartera`, §4 bis). Un evento se ve sólo si su ticket se ve.
--   5. `gsg_operador`: por ahora, lo mismo que `app_rls` (la consola hoy usa `app_rls` por la caída de
--      operator-db.ts; 58 archivos, inventario en el diseño §7.3), MENOS: AuditLog sin UPDATE/DELETE,
--      SoporteConsentimiento sin UPDATE/DELETE, NegocioProtegido sólo lectura. Estrecharlo tabla por
--      tabla es deuda anotada (§7.3), con la consola probada en una rama de Neon antes de cargar la
--      variable. El candado de CH NO va a `gsg_operador`: el dueño aprueba el borrador de CH en la consola.
--   6. `app_rls`: NO se le saca nada de lo que ya tiene (lo usa la app de los negocios). En las dos
--      tablas nuevas se corrige lo que le dan los privilegios por defecto (0002:62-65).
--
-- Reversa: al pie.

BEGIN;

-- ── 1. Roles (sin contraseña, sin BYPASSRLS) ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gsg_operador') THEN
    CREATE ROLE gsg_operador LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gsg_agente') THEN
    CREATE ROLE gsg_agente LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO gsg_operador, gsg_agente;

-- ── 2. NegocioProtegido (sin RLS; la escribe sólo el dueño de las tablas) ────
CREATE TABLE IF NOT EXISTS "NegocioProtegido" (
  "negocioId" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NegocioProtegido_pkey" PRIMARY KEY ("negocioId"),
  CONSTRAINT "NegocioProtegido_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);
INSERT INTO "NegocioProtegido" ("negocioId", "motivo")
  SELECT id, 'CH: ningún agente lo ve ni lo toca (D5, 14/11/2026)' FROM "Tenant" WHERE slug = 'beauty-spa'
  ON CONFLICT ("negocioId") DO NOTHING;

-- ── 3. SoporteConsentimiento (append-only, RLS) ──────────────────────────────
CREATE TABLE IF NOT EXISTS "SoporteConsentimiento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nivel" TEXT NOT NULL,
  "aceptado" BOOLEAN NOT NULL,
  "versionTexto" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SoporteConsentimiento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SoporteConsentimiento_nivel_check" CHECK ("nivel" IN ('n1', 'n2')),
  CONSTRAINT "SoporteConsentimiento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SoporteConsentimiento_tenantId_nivel_createdAt_idx"
  ON "SoporteConsentimiento" ("tenantId", "nivel", "createdAt");
ALTER TABLE "SoporteConsentimiento" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SoporteConsentimiento";
CREATE POLICY tenant_isolation ON "SoporteConsentimiento"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── 4. Funciones del candado (SECURITY INVOKER: corren con los permisos y el RLS de quien consulta) ──
-- Tablas con esquema (public."…") y pg_temp AL FINAL del search_path: una tabla temporal con el mismo
-- nombre, creada por quien consulta, NO tapa a la real (refutación del 14/11, hallazgo crítico).
CREATE OR REPLACE FUNCTION gsg_negocio_protegido(negocio TEXT) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $f$
  SELECT EXISTS (SELECT 1 FROM public."NegocioProtegido" p WHERE p."negocioId" = negocio)
$f$;
-- La última casilla n1 del negocio está tildada. A igual hora, primero la revocación (false < true).
-- Lee bajo el RLS de quien consulta: sin set_config del mismo negocio, no ve filas → false.
CREATE OR REPLACE FUNCTION gsg_permiso_n1_vigente(negocio TEXT) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $f$
  SELECT COALESCE((
    SELECT c."aceptado" FROM public."SoporteConsentimiento" c
    WHERE c."tenantId" = negocio AND c."nivel" = 'n1'
    ORDER BY c."createdAt" DESC, c."aceptado" ASC
    LIMIT 1
  ), false)
$f$;
-- Sólo firma el titular (OWNER) de ESE negocio. INVOKER: con app_rls lee User bajo RLS del negocio parado;
-- si no lo ve (otro negocio, inexistente, no titular), rechaza.
CREATE OR REPLACE FUNCTION gsg_consentimiento_lo_firma_el_titular() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."User" u
                 WHERE u."id" = NEW."userId" AND u."tenantId" = NEW."tenantId" AND u."role"::text = 'OWNER') THEN
    RAISE EXCEPTION 'SoporteConsentimiento: sólo lo firma el titular (OWNER) del negocio' USING ERRCODE = '42501';
  END IF;
  -- La hora la pone la base: un permiso fechado en el futuro no puede ganarle a una revocación posterior.
  NEW."createdAt" := clock_timestamp();
  RETURN NEW;
END
$f$;
DROP TRIGGER IF EXISTS soporte_consentimiento_titular ON "SoporteConsentimiento";
CREATE TRIGGER soporte_consentimiento_titular BEFORE INSERT ON "SoporteConsentimiento"
  FOR EACH ROW EXECUTE FUNCTION gsg_consentimiento_lo_firma_el_titular();
REVOKE ALL ON FUNCTION gsg_consentimiento_lo_firma_el_titular() FROM PUBLIC;

-- ── 4 bis. Permiso del CLIENTE de un ticket de cartera (SECURITY DEFINER, MANT-003) ──
-- El ticket de cartera vive en el estudio ("tenantId") con el cliente en "clienteTenantId". Bajo el RLS
-- del estudio, el permiso del cliente no se ve: por eso esta función corre como su dueño (neondb_owner,
-- exento de RLS mientras no se aplique el FORCE opcional de prisma/rls/0003; con FORCE no ve el permiso
-- del cliente y devuelve false: falla cerrado).
-- SIN PARÁMETROS: los dos negocios salen del contexto de la transacción que fija agente-db.ts
-- (`app.current_tenant_id` = el estudio, `app.cliente_tenant_id` = el cliente del ticket del despacho),
-- nunca de un argumento. La política exige además que el "clienteTenantId" de la fila sea ESE cliente:
-- una transacción del agente ve, como mucho, la cartera de un solo cliente.
-- Devuelve true SÓLO si, todo a la vez y en cada llamada:
--   · los dos negocios están fijados y ninguno está protegido (CH nunca, aunque tenga permiso cargado);
--   · el estudio tiene al menos un ticket de cartera con ese cliente;
--   · el permiso n1 vigente del estudio Y el del cliente: la última casilla n1 de cada uno tildada
--     (a igual hora gana la revocación; la hora la pone la base, trigger del §4).
-- Devuelve sólo un boolean (nunca filas, fechas ni ids). Esquema explícito y pg_temp al final del
-- search_path (una tabla temporal de quien llama no tapa a la real). EXECUTE sólo para gsg_agente.
-- Residual (diseño §7.3): parado en un estudio CON permiso y fijando un cliente de SU cartera, el agente
-- puede saber si ese cliente dio el permiso n1: es lo mismo que ya revela ver o no su ticket. Sin ticket
-- de cartera con ese cliente, o sin permiso del estudio, la respuesta es siempre false.
CREATE OR REPLACE FUNCTION gsg_permiso_n1_cliente_de_cartera() RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $f$
  SELECT COALESCE((
    SELECT s.estudio IS NOT NULL AND s.estudio <> '' AND s.cliente IS NOT NULL AND s.cliente <> ''
      AND NOT EXISTS (SELECT 1 FROM public."NegocioProtegido" p WHERE p."negocioId" = s.estudio OR p."negocioId" = s.cliente)
      AND EXISTS (SELECT 1 FROM public."SupportTicket" t WHERE t."tenantId" = s.estudio AND t."clienteTenantId" = s.cliente)
      AND COALESCE((SELECT c."aceptado" FROM public."SoporteConsentimiento" c
                    WHERE c."tenantId" = s.estudio AND c."nivel" = 'n1'
                    ORDER BY c."createdAt" DESC, c."aceptado" ASC LIMIT 1), false)
      AND COALESCE((SELECT c."aceptado" FROM public."SoporteConsentimiento" c
                    WHERE c."tenantId" = s.cliente AND c."nivel" = 'n1'
                    ORDER BY c."createdAt" DESC, c."aceptado" ASC LIMIT 1), false)
    FROM (SELECT current_setting('app.current_tenant_id', true) AS estudio,
                 current_setting('app.cliente_tenant_id', true) AS cliente) s
  ), false)
$f$;
ALTER FUNCTION gsg_permiso_n1_cliente_de_cartera() OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION gsg_permiso_n1_cliente_de_cartera() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gsg_permiso_n1_cliente_de_cartera() TO gsg_agente;

REVOKE ALL ON FUNCTION gsg_negocio_protegido(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION gsg_permiso_n1_vigente(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gsg_negocio_protegido(TEXT) TO gsg_agente;
GRANT EXECUTE ON FUNCTION gsg_permiso_n1_vigente(TEXT) TO gsg_agente;

-- ── 5. gsg_agente: permisos por tabla y por columna ─────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM gsg_agente;
GRANT SELECT ("id", "slug", "name", "status") ON "Tenant" TO gsg_agente;
GRANT SELECT ON "SupportTicket" TO gsg_agente;
GRANT UPDATE ("estado", "borradorIa", "updatedAt") ON "SupportTicket" TO gsg_agente;
GRANT SELECT, INSERT ON "SupportTicketEvento" TO gsg_agente;
GRANT INSERT ON "AuditLog" TO gsg_agente;
GRANT SELECT ON "SoporteConsentimiento" TO gsg_agente;
GRANT SELECT ON "NegocioProtegido" TO gsg_agente;

-- Políticas RESTRICTIVAS sólo para gsg_agente (se combinan con AND con tenant_isolation).
-- Ticket de cartera (vive en el estudio, cliente en clienteTenantId): exige además el permiso del CLIENTE,
-- leído con la función SECURITY DEFINER del §4 bis (bajo el RLS del estudio no se vería), y sólo del
-- cliente fijado en la transacción (`app.cliente_tenant_id`, lo pone agente-db.ts). Sin permiso del
-- estudio o del cliente → no se ve; CH en cualquiera de los dos → nunca. La revocación vale desde la
-- siguiente sentencia (cada sentencia toma su foto en READ COMMITTED).
DROP POLICY IF EXISTS mant_agente_candado ON "SupportTicket";
CREATE POLICY mant_agente_candado ON "SupportTicket" AS RESTRICTIVE FOR ALL TO gsg_agente
  USING (NOT gsg_negocio_protegido("tenantId")
         AND ("clienteTenantId" IS NULL OR NOT gsg_negocio_protegido("clienteTenantId"))
         AND gsg_permiso_n1_vigente("tenantId")
         AND ("clienteTenantId" IS NULL OR ("clienteTenantId" = current_setting('app.cliente_tenant_id', true)
                                             AND gsg_permiso_n1_cliente_de_cartera())))
  WITH CHECK (NOT gsg_negocio_protegido("tenantId")
         AND ("clienteTenantId" IS NULL OR NOT gsg_negocio_protegido("clienteTenantId"))
         AND gsg_permiso_n1_vigente("tenantId")
         AND ("clienteTenantId" IS NULL OR ("clienteTenantId" = current_setting('app.cliente_tenant_id', true)
                                             AND gsg_permiso_n1_cliente_de_cartera())));

-- Un evento existe para el agente sólo si su ticket existe para el agente (hereda el candado).
DROP POLICY IF EXISTS mant_agente_candado ON "SupportTicketEvento";
CREATE POLICY mant_agente_candado ON "SupportTicketEvento" AS RESTRICTIVE FOR ALL TO gsg_agente
  USING (EXISTS (SELECT 1 FROM "SupportTicket" t WHERE t."tenantId" = "SupportTicketEvento"."tenantId" AND t."id" = "SupportTicketEvento"."ticketId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "SupportTicket" t WHERE t."tenantId" = "SupportTicketEvento"."tenantId" AND t."id" = "SupportTicketEvento"."ticketId")
              AND "actor" LIKE 'agente:%');

DROP POLICY IF EXISTS mant_agente_candado ON "AuditLog";
CREATE POLICY mant_agente_candado ON "AuditLog" AS RESTRICTIVE FOR ALL TO gsg_agente
  USING (NOT gsg_negocio_protegido("tenantId") AND gsg_permiso_n1_vigente("tenantId"))
  WITH CHECK (NOT gsg_negocio_protegido("tenantId") AND gsg_permiso_n1_vigente("tenantId")
              AND "actor" LIKE 'agente:%');

DROP POLICY IF EXISTS mant_agente_candado ON "SoporteConsentimiento";
CREATE POLICY mant_agente_candado ON "SoporteConsentimiento" AS RESTRICTIVE FOR ALL TO gsg_agente
  USING (NOT gsg_negocio_protegido("tenantId"))
  WITH CHECK (NOT gsg_negocio_protegido("tenantId"));

-- ── 6. gsg_operador: como app_rls, con las excepciones del encabezado ────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gsg_operador;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gsg_operador;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gsg_operador;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gsg_operador;
REVOKE UPDATE, DELETE ON "AuditLog" FROM gsg_operador;

-- ── 7. Las dos tablas nuevas: nadie salvo el dueño las edita ─────────────────
-- (los privilegios por defecto de 0002 le dan DML a app_rls, y el paso 6 a gsg_operador).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "NegocioProtegido" FROM app_rls, gsg_operador;
GRANT SELECT ON "NegocioProtegido" TO app_rls, gsg_operador;
REVOKE UPDATE, DELETE, TRUNCATE ON "SoporteConsentimiento" FROM app_rls;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "SoporteConsentimiento" FROM gsg_operador;
GRANT SELECT, INSERT ON "SoporteConsentimiento" TO app_rls;
GRANT SELECT ON "SoporteConsentimiento" TO gsg_operador;

-- ── 8. Verificación: si algo quedó mal, aborta y no queda nada ───────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('gsg_operador', 'gsg_agente', 'app_rls') AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'MANT_roles_soporte: un rol de app/soporte tiene BYPASSRLS o SUPERUSER';
  END IF;
  IF has_table_privilege('gsg_agente', '"User"', 'SELECT') THEN
    RAISE EXCEPTION 'MANT_roles_soporte: gsg_agente no debe leer User';
  END IF;
  IF has_table_privilege('app_rls', '"NegocioProtegido"', 'INSERT') OR has_table_privilege('gsg_operador', '"NegocioProtegido"', 'DELETE') THEN
    RAISE EXCEPTION 'MANT_roles_soporte: NegocioProtegido quedó escribible';
  END IF;
  IF has_table_privilege('gsg_operador', '"SoporteConsentimiento"', 'INSERT') OR has_table_privilege('gsg_agente', '"SoporteConsentimiento"', 'INSERT') THEN
    RAISE EXCEPTION 'MANT_roles_soporte: el permiso del cliente sólo lo escribe su panel (app_rls)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('gsg_negocio_protegido', 'gsg_permiso_n1_vigente', 'gsg_consentimiento_lo_firma_el_titular', 'gsg_permiso_n1_cliente_de_cartera')
             AND NOT COALESCE(proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'], false)) THEN
    RAISE EXCEPTION 'MANT_roles_soporte: una función del candado no fija search_path con pg_temp al final';
  END IF;
  -- Sólo la del permiso del cliente de cartera es SECURITY DEFINER; las demás corren como quien consulta.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('gsg_negocio_protegido', 'gsg_permiso_n1_vigente', 'gsg_consentimiento_lo_firma_el_titular') AND prosecdef)
     OR (SELECT count(*) FROM pg_proc WHERE proname = 'gsg_permiso_n1_cliente_de_cartera') <> 1 THEN
    RAISE EXCEPTION 'MANT_roles_soporte: SECURITY DEFINER fuera de lugar en el candado';
  END IF;
  -- La SECURITY DEFINER: del dueño de las tablas, sin parámetros (los negocios salen del contexto), devuelve
  -- sólo boolean, EXECUTE sólo para gsg_agente (ni PUBLIC, ni app_rls, ni gsg_operador).
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'gsg_permiso_n1_cliente_de_cartera'
             AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner) <> 'neondb_owner' OR p.prorettype <> 'boolean'::regtype
                  OR p.proretset OR p.pronargs <> 0 OR p.proacl IS NULL
                  OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')))
     OR NOT has_function_privilege('gsg_agente', 'gsg_permiso_n1_cliente_de_cartera()', 'EXECUTE')
     OR has_function_privilege('app_rls', 'gsg_permiso_n1_cliente_de_cartera()', 'EXECUTE')
     OR has_function_privilege('gsg_operador', 'gsg_permiso_n1_cliente_de_cartera()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MANT_roles_soporte: la función del permiso del cliente de cartera quedó abierta o con otro dueño';
  END IF;
  IF EXISTS (SELECT 1 FROM "Tenant" WHERE slug = 'beauty-spa')
     AND NOT EXISTS (SELECT 1 FROM "NegocioProtegido" p JOIN "Tenant" t ON t.id = p."negocioId" WHERE t.slug = 'beauty-spa') THEN
    RAISE EXCEPTION 'MANT_roles_soporte: CH no quedó protegido';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- REVERSA (a mano, como neondb_owner; borra los permisos registrados — respaldo antes):
-- BEGIN;
--   DROP POLICY IF EXISTS mant_agente_candado ON "SupportTicket";
--   DROP POLICY IF EXISTS mant_agente_candado ON "SupportTicketEvento";
--   DROP POLICY IF EXISTS mant_agente_candado ON "AuditLog";
--   DROP POLICY IF EXISTS mant_agente_candado ON "SoporteConsentimiento";
--   DROP TABLE IF EXISTS "SoporteConsentimiento";
--   DROP TABLE IF EXISTS "NegocioProtegido";
--   DROP FUNCTION IF EXISTS gsg_consentimiento_lo_firma_el_titular() CASCADE;
--   DROP FUNCTION IF EXISTS gsg_permiso_n1_cliente_de_cartera();
--   DROP FUNCTION IF EXISTS gsg_permiso_n1_vigente(TEXT);
--   DROP FUNCTION IF EXISTS gsg_negocio_protegido(TEXT);
--   ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE ALL ON TABLES FROM gsg_operador;
--   ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM gsg_operador;
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM gsg_operador, gsg_agente;
--   REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM gsg_operador, gsg_agente;
--   REVOKE USAGE ON SCHEMA public FROM gsg_operador, gsg_agente;
--   DROP ROLE IF EXISTS gsg_agente;
--   DROP ROLE IF EXISTS gsg_operador;
-- COMMIT;
-- ============================================================================
