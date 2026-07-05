# RLS de Postgres por tenant — ADR-018

Backstop de aislamiento multi-tenant a **nivel de base**. Segunda línea de
defensa detrás del filtro app-level de `src/lib/tenant.ts`: aunque una query
olvide el `where tenantId`, la DB no devuelve ni deja escribir filas de otro
tenant.

**Estado: ESCRITO, NO APLICADO a producción.** Aplicar es **Gate 2** (OK
explícito de Maxi) y va junto con provisionar el 2º tenant (ADR-018 §3, gate
duro T2). Estos archivos existen para que ese día sea *revisar y aplicar*, no
diseñar bajo presión.

## Archivos

| Archivo | Qué hace | Cuándo |
|---|---|---|
| `0001_enable_rls.sql` | ENABLE ROW LEVEL SECURITY + `CREATE POLICY tenant_isolation` (USING + WITH CHECK) en **toda** tabla con `tenantId`. Data-driven (recorre `information_schema`) → a prueba de drift. | En el gate, primero. |
| `0002_app_role.sql` | Crea `app_user`: rol de login **sin `BYPASSRLS`**, no owner, solo DML. El enforcement real llega al conectar la app con este rol. Password fuera del repo. | En el gate, con `-v app_pw=…`. |
| `0003_force_rls_optional.sql` | Hardening: `FORCE ROW LEVEL SECURITY` (RLS también para el owner). Opcional, con precondiciones. | Después de validar, si se quiere. |
| `0001_rollback.sql` | Quita policies + RLS + FORCE. Para limpiar la branch de ensayo o revertir. | Según haga falta. |
| `check-coverage.mjs` | Red **estática** (sin DB): verifica que todo modelo de-tenant tenga columna `tenantId` (si falta, no es aislable). Corre en CI/sesión. | Siempre. `node prisma/rls/check-coverage.mjs` |
| `verify-rls.mjs` | Verificación **funcional** contra una branch de Neon: 2 tenants sintéticos, prueba lectura aislada + WITH CHECK + fail-closed. Anti-prod por construcción. | En el ensayo del gate. |

## Diseño (por qué así)

- **`set_config('app.current_tenant_id', <cuid>, true)`** por transacción, no
  `SET` de sesión: el 3er arg `true` = local a la transacción (== `SET LOCAL`)
  pero **parametrizable**, así es seguro sobre el pooler de Neon en modo
  transacción, que no preserva estado de sesión (ADR-018 §2.a).
- **`tenantId` es cuid (texto)** → la policy compara texto contra texto, **sin
  cast a uuid** (verificado en `schema.prisma`).
- **Fail-closed:** `current_setting(name, true)` devuelve `NULL` si el GUC no
  está seteado; `"tenantId" = NULL` es `NULL` ⇒ 0 filas y el WITH CHECK falla.
  Sin contexto de tenant no se ve ni se escribe nada (coherente con ADR-015).
- **Enforcement vía rol, no vía FORCE (por defecto):** Postgres exime de RLS al
  **dueño** de la tabla (`neondb_owner`). Se deja así a propósito para que el
  owner conserve bypass en migraciones, `seed.ts` y el provisioning del 2º
  tenant (ADR-019). El enforcement lo da conectar la **app** como `app_user`
  (sin `BYPASSRLS`). `0003` (FORCE) es defensa en profundidad opcional.
- **Excluidas:** `Tenant` (raíz, se lee pre-contexto en la resolución por
  request; RLS ahí sería deadlock de bootstrap) y `_ProfessionalServices` (join
  M2M sin `tenantId`, protegido transitivamente porque sus extremos sí tienen
  policy).

## Procedimiento de aplicación (Gate 2 — requiere OK explícito de Maxi)

> **Ensayo obligatorio en branch de Neon antes de tocar prod (ADR-018 T2).**

1. **Branch de ensayo** en Neon (copia desechable de la base viva).
2. Aplicar sobre la branch:
   ```bash
   psql "$BRANCH_URL" -f prisma/rls/0001_enable_rls.sql
   psql "$BRANCH_URL" -v app_pw="<pw-de-ensayo>" -f prisma/rls/0002_app_role.sql
   ```
3. Verificar:
   ```bash
   RLS_VERIFY_DATABASE_URL="$BRANCH_URL" node prisma/rls/verify-rls.mjs
   ```
   Deben pasar las 4 aserciones (lectura aislada, WITH CHECK, UPDATE cross-tenant,
   fail-closed).
4. Ensayar la app contra la branch con `app_user` (ver "Adopción en la app").
   Chequear especialmente los ~12 `$transaction` y `connection_limit` bajo
   (3–5) sobre el pooler (ADR-023 F6).
5. Solo con el ensayo en verde: aplicar `0001` + `0002` a **producción** (mismo
   trabajo que provisiona el tenant #2), rotar `DATABASE_URL` a `app_user`, y
   recién ahí dar de alta el 2º tenant.

## Adopción en la app (pendiente, parte del gate)

El backstop de DB (estos SQL) es independiente y verificable solo. La mitad
app-level está **escrita pero apagada** en `src/lib/tenant-context.ts` y
`src/lib/rls.ts` (no cableadas al cliente vivo → cero cambio de comportamiento
hoy). Para encenderla en el gate:

1. Cablear `runInTenantContext(tenantId, …)` en el borde del request, con el
   `tenantId` resuelto por subdominio/sesión (reemplaza el `findMany take:2` de
   `getCurrentTenantId`, conservando el assert fail-closed como red — ADR-018 §4).
2. Cambiar `export const prisma` para que el runtime use `rlsPrisma`.
3. Reemplazar los `prisma.$transaction(async tx => …)` por
   `tenantTransaction(tenantId, tx => …)` (setea el GUC como primer statement y
   evita anidar transacciones).
4. Re-ensayar todo en la branch.
