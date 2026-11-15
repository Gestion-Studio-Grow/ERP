# Ensayo en Neon de la tanda 3 (SEG021 + MANT_roles_soporte) — para aprobar

Rama de Neon: `ensayo-tanda3-20261114` (desde producción). **Nunca sobre `main` de Neon.** Lo corre quien tenga la
cadena del dueño (`neondb_owner`) de ESA rama; ningún secreto en salidas ni en este archivo. Preparado por GSG-OPS-008
el 14/11/2026, sin tocar Neon.

## Ya hecho (local, base efímera, nunca Neon)

- 74 migraciones + `0002` + `0001`; `neondb_owner` con CREATEROLE (como en Neon); un negocio con slug `beauty-spa`.
- SEG021 y MANT: OK · segunda corrida OK (sólo cambia el orden de la ACL) · conteos: sólo `NegocioProtegido` 1 fila
  (CH) y `SoporteConsentimiento` 0 · `check-rls-live`: sin drift antes y después.
- Reversa del pie de cada uno: OK; catálogo idéntico al previo (funciones, ACL, políticas, roles) y mismos conteos.
  Aplicar → revertir → aplicar: igual a la primera vez.
- `roles-soporte-postgres.test.ts` + `contabilidad-funciones-permisos-postgres.test.ts`: 9/9.
- Revisión adversarial aparte (otro cluster): ver «Cambios propuestos».

## Cambios propuestos antes de aplicar (no hechos: son cambios de base, los aprueba la orquestadora)

1. `MANT_roles_soporte.sql:42`: después de `BEGIN;`, `SET LOCAL lock_timeout = '5s';` (con una transacción abierta
   sobre `AuditLog` el archivo espera y frena las lecturas de la app). Si corta, se reintenta: no deja nada.
2. Reversa de MANT (`:441-442`): falla entera si los roles `gsg_*` existían de antes y los creó otro rol. Correrla
   sólo si R3 da 0 filas, o cambiar el `DROP ROLE` por un `DO` que lo saltee con aviso.
3. `:410`: hoy no avisa si CH falta. Agregar un `RAISE NOTICE` si no hay `Tenant` con slug `beauty-spa`.
4. Cómo se aplica: SEG021 puede ir por el build (camino A, ver el informe); MANT, **no**: `CREATE ROLE` rompe la base
   de test en local y en CI (`src/test/base-efimera.ts:263`, el dueño de test no tiene CREATEROLE) y choca entre
   bases en paralelo. MANT va a mano como `neondb_owner` (camino B), con respaldo, antes del merge.

## Paso 1 — sólo lectura (en la rama)

```sql
-- R1 quién corre: tiene que dar neondb_owner, createrole t, super f
SELECT current_user, rolcreaterole, rolsuper FROM pg_roles WHERE rolname = current_user;
-- R2 migraciones aplicadas (se espera 74, la última 20261110170000_tenant_cuit_verificado)
SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT migration_name FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 3;
-- R3 roles: gsg_* no tienen que existir (si existen, ver el cambio 2); app_rls sin bypass
SELECT rolname, rolbypassrls, rolsuper, rolcreaterole FROM pg_roles
 WHERE rolname IN ('gsg_operador','gsg_agente','app_rls','neondb_owner');
-- R4 nombres libres: tienen que dar NULL / 0 filas
SELECT to_regclass('"NegocioProtegido"'), to_regclass('"SoporteConsentimiento"');
SELECT proname FROM pg_proc WHERE proname LIKE 'gsg\_%';
-- R5 precondiciones de MANT: dos tablas presentes y CH presente (t)
SELECT to_regclass('"SupportTicket"'), to_regclass('"SupportTicketEvento"'),
       EXISTS (SELECT 1 FROM "Tenant" WHERE slug = 'beauty-spa') AS hay_ch;
-- R6 funciones de contabilidad = las de la ola 1. md5 esperados:
--   asiento_en_ejercicio 62ab728398bfd6362ef34228b0fee21e · asiento_inmutable 92b19c8a9031d9304ee7694137ee7050
--   controlar_cuadre 8865ef9ba6a6f31a3ff4352b9376c2b7 · controlar_ejercicio 87952286ed458636f3a47da3fe22cdfc
SELECT proname, pg_get_userbyid(proowner) AS duenio, md5(prosrc), proacl FROM pg_proc
 WHERE proname LIKE 'contabilidad\_%' ORDER BY 1;
-- R7 privilegios por defecto (se espera sólo app_rls)
SELECT pg_get_userbyid(defaclrole), defaclobjtype::text, defaclacl FROM pg_default_acl;
-- R8 conteos de referencia
SELECT (SELECT count(*) FROM "Asiento") asientos, (SELECT count(*) FROM "AsientoLinea") lineas,
       (SELECT count(*) FROM "Ejercicio") ejercicios, (SELECT count(*) FROM "SupportTicket") tickets,
       (SELECT count(*) FROM "AuditLog") auditoria, (SELECT count(*) FROM "Tenant") negocios;
-- R9 app_user (legacy, BYPASSRLS): de qué roles es miembro (lo que hereda) y sus privilegios por defecto.
--   Si es miembro de un rol con permisos sobre las tablas nuevas, el control del §8 de MANT aborta: se frena
--   y se informa (sacarle la pertenencia es una decisión aparte).
SELECT r.rolname AS app_user_es_miembro_de FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
 WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'app_user');
SELECT defaclobjtype::text, defaclacl FROM pg_default_acl WHERE defaclacl::text LIKE '%app_user%';
```

Más: `node prisma/rls/check-rls-live.mjs` con `RLS_AUDIT_DATABASE_URL` = la cadena de la rama → «SIN DRIFT».

Si algo no da lo esperado, se frena y se informa. No se sigue.

## Paso 2 — escritura (sólo en la rama, con los cambios 1–3 ya aprobados)

1. SEG021 (desde el 14/11 es la migración del lote): pegar `docs/runbooks/ensayo-neon/1-lote-en-branch.sql`
   (la aplica y la registra en `_prisma_migrations`) o
   `psql "<cadena de la rama>" -X -v ON_ERROR_STOP=1 -f prisma/migrations/20261114120000_seg021_contabilidad_funciones/migration.sql`
2. Igual con `prisma/pending-gate2/MANT_roles_soporte.sql`.
3. R1–R8 otra vez: R3 con `gsg_operador`/`gsg_agente` sin bypass; R4 con las dos tablas y 8 funciones `gsg_*`;
   R6 con otros md5, mismo dueño y sin `=X/` (PUBLIC) en `proacl`; R8 igual que antes; `NegocioProtegido` con 1 fila;
   `check-rls-live` sin drift. Y `app_user` sin nada en lo nuevo (todo `f`; lo prueba
   `src/lib/soporte/roles-soporte-app-user-postgres.test.ts` en local):
   `SELECT has_table_privilege('app_user','"NegocioProtegido"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
   has_table_privilege('app_user','"SoporteConsentimiento"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
   has_function_privilege('app_user','gsg_permiso_n1_vigente()','EXECUTE');`
4. Los dos archivos otra vez (idempotencia): OK y R8 igual.
5. Prueba de la app en la rama (sólo si hay deploy de preview apuntado a la rama): un OWNER entra a
   Configuración → «Soporte GSG», ve las dos casillas habilitadas; un asiento confirmado nuevo cuadra.
6. Reversa del pie de cada archivo (MANT primero), R1–R8 = paso 1. Después se borra la rama de ensayo.

Resultado esperado y real se anotan acá; con todo verde, la orquestadora pide al dueño la ventana en producción.

— Gestión Studio Grow
