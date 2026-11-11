# Verificar RLS en vivo (SOLO LECTURA)

> Plan para que lo ejecute **Operaciones** más adelante. No se corrió todavía: todo resultado acá es **NO MEDIDO**.
> No cambia nada en la base: sólo `SELECT`, dentro de transacciones de sólo lectura que terminan en `ROLLBACK`.

## 1. Qué se quiere probar

| # | Afirmación | Por qué importa |
|---|---|---|
| R1 | Toda tabla de `public` con columna `tenantId` tiene RLS habilitado y al menos una política | Es lo que promete `prisma/rls/0001_enable_rls.sql` (líneas 21-28 y 60-80, recorrido data-driven). Ya pasó que tablas nuevas quedaran sin proteger (`prisma/rls/check-rls-live.mjs` líneas 8-10) |
| R2 | El rol de la app (`app_rls`) **no** tiene `BYPASSRLS`, no es superusuario y **no** es dueño de ninguna tabla | RLS no se aplica al dueño de la tabla salvo `FORCE` (`prisma/rls/0001_enable_rls.sql` líneas 30-39). `app_rls` nace `NOBYPASSRLS` (`prisma/rls/0002_app_role.sql` líneas 31-40) |
| R3 | Con el rol de la app y un negocio puesto, se ven sólo las filas de ese negocio | Aislamiento entre negocios |
| R4 | Con el rol de la app y **sin** negocio puesto, no se ve nada | Fail-closed: `current_setting(..., true)` da NULL y `"tenantId" = NULL` no pasa (`prisma/rls/0001_enable_rls.sql` líneas 16-19) |

Ya existe un auditor automático que cubre R1 y parte de R2: `prisma/rls/check-rls-live.mjs` (solo lectura, se corre
con `RLS_AUDIT_DATABASE_URL`). Este plan lo complementa con consultas que se pueden pegar a mano y con la prueba de
aislamiento R3/R4, que el auditor no hace.

## 2. Antes de empezar

- **Conexiones** (las provee el dueño; nunca se pegan en el chat ni en este archivo):
  - `$URL_LECTURA_CATALOGO`: cualquier rol que pueda leer el catálogo (para §3). Idealmente de sólo lectura.
  - `$URL_APP_RLS`: conexión **como `app_rls`**, directa (sin `-pooler`), para §4. Si el dueño prefiere no usar la
    credencial real de la app, alcanza con un rol nuevo con los mismos atributos que `app_rls` (sin `BYPASSRLS`,
    no dueño, sólo `SELECT`); anotarlo en el informe.
- **Dos negocios de referencia**, A y B: sus `id` (cuid, texto) se sacan de la tabla `"Tenant"`, que **no** tiene RLS
  (excluida a propósito: `prisma/rls/0001_enable_rls.sql` líneas 41-45):
  ```sql
  SELECT id, subdomain FROM "Tenant" ORDER BY "createdAt" LIMIT 5;
  ```
  Se eligen dos con datos. En el informe se nombran como «A» y «B», no por su nombre comercial.
- **Estado del interruptor de la app** (`RLS_ENFORCEMENT`): este plan prueba la **base**, no el interruptor. Que la
  app lo tenga en `on` en producción **no se puede saber desde el código**: `.env.vercel.template` línea 77 trae
  `RLS_ENFORCEMENT=on`, pero el valor real vive en Vercel (`src/lib/rls.ts` líneas 10-14). Verlo en Vercel es un
  chequeo aparte (R5, §5).

Todas las sesiones se abren así:

```bash
psql "$URL" -v ON_ERROR_STOP=1 -X -A -F ' | '
```

y cada bloque va dentro de:

```sql
BEGIN;
SET TRANSACTION READ ONLY;
-- … consultas …
ROLLBACK;
```

## 3. Consultas de catálogo (todas SELECT)

### C1. Tablas con `tenantId` cruzadas contra RLS y políticas (R1)

```sql
WITH con_tenant AS (
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'
)
SELECT ct.table_name,
       cl.relrowsecurity      AS rls_habilitado,
       cl.relforcerowsecurity AS rls_forzado,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = ct.table_name) AS politicas
FROM con_tenant ct
JOIN pg_class cl ON cl.relname = ct.table_name
JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
ORDER BY (cl.relrowsecurity AND EXISTS (SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = ct.table_name)), ct.table_name;
```

- **APROBADO:** todas las filas con `rls_habilitado = t` y `politicas >= 1`.
- **FALLA:** cualquier fila con `rls_habilitado = f` o `politicas = 0` (quedan arriba por el `ORDER BY`).
- `rls_forzado` es informativo: `FORCE` es opcional (`prisma/rls/0003_force_rls_optional.sql`). Anotar cuántas
  tablas lo tienen.

### C2. Que las políticas sean las esperadas

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

- **APROBADO:** cada tabla de C1 tiene `tenant_isolation` con `qual` y `with_check` iguales a
  `("tenantId" = current_setting('app.current_tenant_id'::text, true))` (forma de `prisma/rls/0001_enable_rls.sql`
  líneas 73-77).
- **FALLA:** una política con otro filtro (por ejemplo `true`), o una política extra permisiva (las políticas
  permisivas se suman con OR: una sola `USING (true)` anula el aislamiento de esa tabla).

### C3. Atributos del rol de la app (R2)

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb
FROM pg_roles
WHERE rolname IN ('app_rls', 'app_user', 'neondb_owner')
ORDER BY rolname;
```

- **APROBADO:** `app_rls` con `rolsuper = f` y `rolbypassrls = f`.
- **FALLA:** `app_rls` no existe, o tiene `rolsuper` o `rolbypassrls` en `t`.
- `app_user` es un rol viejo de producción **con** `BYPASSRLS` que el dueño de las tablas no puede corregir
  (`prisma/rls/0002_app_role.sql` líneas 10-17). Es informativo: **FALLA** sólo si se comprueba que la app se conecta
  con él (eso se ve en Vercel, no acá).

### C4. Que `app_rls` no herede un rol con bypass ni sea dueño de nada (R2)

```sql
-- roles de los que app_rls es miembro, con sus atributos: tiene que dar 0 filas con bypass o super
SELECT r.rolname, r.rolsuper, r.rolbypassrls
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.roleid
JOIN pg_roles u ON u.oid = m.member
WHERE u.rolname = 'app_rls' AND (r.rolsuper OR r.rolbypassrls);

-- tablas de public cuyo dueño es app_rls: tiene que dar 0
SELECT count(*) AS tablas_de_app_rls
FROM pg_class cl
JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
WHERE cl.relkind = 'r' AND pg_get_userbyid(cl.relowner) = 'app_rls';
```

- **APROBADO:** primera consulta 0 filas; segunda `0`.
- **FALLA:** cualquier otra cosa.

## 4. Prueba de aislamiento con el rol de la app (R3 y R4)

### Cómo fija el negocio la app

La app no usa `SET` a secas: dentro de una transacción ejecuta

```sql
SELECT set_config('app.current_tenant_id', <id del negocio>, true)
```

con el tercer argumento `true` (vale sólo hasta el fin de la transacción, como `SET LOCAL`). Está en
`src/lib/rls.ts` línea 140 (envoltorio por operación) y línea 219 (`tenantTransaction`). La prueba usa **exactamente**
eso.

### El bloque a correr (conectado como `app_rls`, con `$URL_APP_RLS`)

Reemplazar `'<ID_A>'` y `'<ID_B>'` por los `id` elegidos en §2. Usa tablas confirmadas en `prisma/schema.prisma`
(`CashMovement` línea 1652, `Collection` línea 1972); se pueden sumar otras tablas de C1 con el mismo patrón.

```sql
-- P0: quién soy (tiene que decir app_rls)
SELECT current_user;

-- P1: SIN negocio puesto → todo en 0 (R4)
BEGIN;
SET TRANSACTION READ ONLY;
SELECT 'sin negocio' AS caso,
       current_setting('app.current_tenant_id', true) AS negocio_puesto,
       (SELECT count(*) FROM "CashMovement") AS caja,
       (SELECT count(*) FROM "Collection")   AS cobranzas;
ROLLBACK;

-- P2: negocio A
BEGIN;
SET TRANSACTION READ ONLY;
SELECT set_config('app.current_tenant_id', '<ID_A>', true);
SELECT 'A' AS caso,
       (SELECT count(*) FROM "CashMovement")                              AS caja_visible,
       (SELECT count(*) FROM "CashMovement" WHERE "tenantId" <> '<ID_A>') AS caja_ajena,
       (SELECT count(*) FROM "Collection")                                AS cobranzas_visibles,
       (SELECT count(*) FROM "Collection"   WHERE "tenantId" <> '<ID_A>') AS cobranzas_ajenas;
ROLLBACK;

-- P3: negocio B (igual que P2 con <ID_B>)
BEGIN;
SET TRANSACTION READ ONLY;
SELECT set_config('app.current_tenant_id', '<ID_B>', true);
SELECT 'B' AS caso,
       (SELECT count(*) FROM "CashMovement")                              AS caja_visible,
       (SELECT count(*) FROM "CashMovement" WHERE "tenantId" <> '<ID_B>') AS caja_ajena,
       (SELECT count(*) FROM "Collection")                                AS cobranzas_visibles,
       (SELECT count(*) FROM "Collection"   WHERE "tenantId" <> '<ID_B>') AS cobranzas_ajenas;
ROLLBACK;

-- P4: después del ROLLBACK el negocio ya no está puesto (el GUC no se filtra a la próxima transacción)
SELECT current_setting('app.current_tenant_id', true) AS negocio_despues;
```

### Referencia «desde afuera» (conectado con un rol exento de RLS, p. ej. el dueño, en solo lectura)

```sql
BEGIN;
SET TRANSACTION READ ONLY;
SELECT "tenantId" IN ('<ID_A>') AS es_a, count(*) FROM "CashMovement"
WHERE "tenantId" IN ('<ID_A>', '<ID_B>') GROUP BY 1;
SELECT "tenantId" IN ('<ID_A>') AS es_a, count(*) FROM "Collection"
WHERE "tenantId" IN ('<ID_A>', '<ID_B>') GROUP BY 1;
ROLLBACK;
```

### Criterio por chequeo

| Chequeo | APROBADO | FALLA |
|---|---|---|
| P0 | `current_user = app_rls` | Otro rol: la prueba no vale, repetir con la conexión correcta |
| P1 (R4) | `negocio_puesto` vacío/NULL y **todos** los conteos en `0` | Cualquier conteo mayor que 0 |
| P2 (R3) | `caja_ajena = 0`, `cobranzas_ajenas = 0`, y los visibles **iguales** a la referencia de A | Algún «ajeno» > 0, o visibles distintos de la referencia |
| P3 (R3) | Igual que P2, para B | Igual que P2 |
| A vs B | Los visibles de A y de B difieren entre sí cuando la referencia dice que difieren | Ambos iguales al total de la tabla |
| P4 | `negocio_despues` vacío/NULL | Queda el `id` de A o B |

Nota: si `$URL_APP_RLS` pasa por el pooler de Neon, igual funciona porque `set_config(..., true)` es por transacción
(`prisma/rls/0001_enable_rls.sql` líneas 8-11), pero la consigna es usar la conexión **directa**.

## 5. Chequeo aparte: el interruptor de la app (R5)

En Vercel → proyecto de producción → variables de entorno, confirmar `RLS_ENFORCEMENT=on` y que `DATABASE_URL` use
`app_rls` (sin mostrar la URL: alcanza con ver el usuario). Sin el interruptor en `on`, la app no pone el negocio y,
conectada como `app_rls`, no vería nada (`prisma/rls/aislamiento-capa-app.ts` líneas 251-252). Resultado actual:
**NO MEDIDO**.

## 6. Si algo falla

1. **No arreglar en caliente.** Nada de `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, `CREATE POLICY` ni `ALTER ROLE` en
   producción desde esta verificación: cambiar RLS en producción es Gate 2 y lo decide el dueño.
2. Guardar la salida (son sólo conteos y nombres de tablas) y avisar **al dueño** el mismo día. Si la falla es de
   aislamiento (P1, P2 o P3, o C3/C4 con bypass), es **incidente de seguridad**: avisar de inmediato.
3. La corrección se arma aparte: para R1 el remedio documentado es volver a aplicar `prisma/rls/0001_enable_rls.sql`
   (idempotente, líneas 47 y 71-72), **ensayado primero en una rama de Neon**, con el OK del dueño.
4. Registrar el hallazgo en `docs/lecciones-aprendidas/registro.md`.

## 7. Cada cuánto

- **Después de cada migración aplicada a producción** que cree una tabla con `tenantId` (es justo el caso que dejó
  tablas sin proteger en julio, según `prisma/rls/check-rls-live.mjs` líneas 8-10).
- **Después de cualquier cambio de roles o de `DATABASE_URL`** en Vercel.
- **Una vez por mes** como rutina, aunque no haya cambios.
- Ojo con el plan gratis de Neon: son pocas consultas y livianas, pero conviene agruparlas en una sola corrida.

## 8. Riesgos y por qué es seguro

- **Solo lectura:** todo es `SELECT` sobre catálogo (`pg_class`, `pg_policies`, `pg_roles`, `pg_auth_members`,
  `information_schema`) o conteos. Cada bloque va en `SET TRANSACTION READ ONLY` y termina en `ROLLBACK`: si por error
  se colara una escritura, Postgres la rechaza.
- **`set_config(..., true)` no deja rastro:** muere con la transacción (P4 lo comprueba).
- **Sin datos personales en la salida:** sólo conteos, nombres de tablas, nombres de roles y `id` técnicos de dos
  negocios (que en el informe se reemplazan por «A» y «B»). Nunca `SELECT *` sobre tablas de negocio.
- **Carga mínima:** `count(*)` sobre dos tablas por negocio; las consultas de catálogo son instantáneas.
- **Riesgo residual:** las credenciales. `$URL_APP_RLS` es la llave de la app; se usa en una terminal, se hace
  `unset` al terminar y nunca se pega en un chat, issue ni archivo.

— Elaborado por GSG
