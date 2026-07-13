# Gate 2 — Aplicación de `User.mustChangePassword` en producción (Neon)

**Fecha:** 2026-07-13 · **Autorizado por:** el dueño ("ok aplica", nombrando la base de **producción**).
**Base:** Neon `neondb` @ `sa-east-1` (producción, sirve las 8 superficies + Shine).
**Origen de la migración:** `prisma/pending-gate2/MustChangePassword.sql` (rama `operador/reset-password`).

## Qué se aplicó

```sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
```

Aditiva, idempotente (`IF NOT EXISTS`), sin backfill destructivo. Agrega el campo que fuerza el
cambio de contraseña en el próximo ingreso a `/admin` tras un reset del OWNER (consola de operador).

## Pre-chequeo (solo lectura, previo a aplicar)

- `prisma migrate status` → 37 migraciones, **"Database schema is up to date"** (sin drift ni
  pendientes formales; la migración vive fuera de `prisma/migrations/` a propósito → Prisma no la ve).
- Columna `User.mustChangePassword` **no existía** antes de aplicar (sin colisión).
- `User`: 8 filas (los 8 owners).
- RLS baseline: **43 tablas con `tenantId`, 43 con policy, 0 sin policy, 0 con RLS off**.

## Resultado de la aplicación

- Columna creada: `boolean`, `NOT NULL`, `default false`. ✅
- Las **8 filas** de `User` quedaron en `false` (nadie queda trabado). ✅
- RLS re-corrido (`prisma/rls/0001_enable_rls.sql`, idempotente) → **43/43, 0 sin policy, 0 RLS off**.
  La columna viaja en la fila de `User` (tabla de-tenant con policy previa) → **no agrega superficie RLS**.
- Schema en sync: `prisma migrate status` sigue "up to date" (la columna es out-of-band a propósito,
  fuera de `schema.prisma`, para no repetir el schema-ahead de CH → caída de login).

## Verificación del forzado

- **A nivel datos (prod):** la columna existe y lee `false` para los 8 users — exactamente el SELECT
  que hace `mustChangePasswordFor()` dentro de `tenantTransaction`. El probe `userFlagColumnExists()`
  (a `information_schema`, sin transacción) ahora da `true` → el forzado se activa.
- **A nivel lógico (rama `operador/reset-password`):** 18/18 tests en verde
  (`must-change-password.test.ts` + `owner-password-reset.test.ts`), incluyendo "lee true → fuerza",
  "reset marca el flag forzado y audita", y el camino defensivo Gate-2.
- **Portón:** `src/app/admin/(dashboard)/layout.tsx` → si `mustChangePasswordFor(user)` es `true`,
  `redirect("/admin/cambiar-password")` (página fuera de `(dashboard)` → sin loop).

### ⚠️ Límite (no es un fallo, es orden de despliegue)

El código del reset (`must-change-password.ts`, portón, consola de operador) **todavía NO está en
`main` ni deployado** — vive en la rama `operador/reset-password`. Por eso el forzado **no** se puede
ejercer contra la app de prod en vivo hasta que ese código llegue a `main` + deploy (**Gate 1**).
Aplicar la migración ANTES del deploy es el orden seguro que la propia migración recomienda (evita el
schema-ahead). Hasta entonces, en prod la columna existe pero ningún código la lee → efecto nulo,
seguro.

## Salud post-aplicación (GET real)

| Superficie | HTTP |
|---|---|
| chestetica-erp.vercel.app | 200 |
| erp-ch.vercel.app | 200 |
| magra-erp.vercel.app | 200 |
| adosmanos-erp.vercel.app | 200 |
| shinevelas-erp.vercel.app (Shine) | 200 |
| gsg-erp-estetica.vercel.app | 200 |
| gsg-erp-magra.vercel.app | 200 |
| gsg-erp-velas.vercel.app | 200 |
| gsg-erp-padel.vercel.app | 200 |

(`breakpoint-erp.vercel.app` → 404: es demo/PoC, no una superficie deployada.)

## ROLLBACK exacto (aditiva → trivial)

```sql
ALTER TABLE "User" DROP COLUMN IF EXISTS "mustChangePassword";
```

Idempotente. Como el código en prod aún no lee la columna, revertir no tiene efecto colateral. Tras el
rollback, la columna deja de existir y `userFlagColumnExists()` vuelve a dar `false` (fail-safe: el
reset seguiría funcionando, solo que sin forzar). No requiere backfill ni migración inversa de datos.

— Elaborado por GSG
