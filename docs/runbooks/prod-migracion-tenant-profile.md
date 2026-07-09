# 🔒 Runbook — Migración de prod `add_tenant_profile` (persistencia perfil GROW-AR)

**Objetivo:** dejar la migración de `Tenant.profile` **preparada, probada y documentada** para que
**S5 la coordine en el publish**. Esta sesión **NO la corrió contra prod** (Neon) — solo contra un
Postgres local efímero, por norma dura del proyecto (`CLAUDE.md`: *"Gate 2 — `prisma migrate deploy`:
cambiar la estructura de la DB de producción se pausa y se reporta; no se corre solo"*).

- **Autor:** Sesión de plataforma (candados + persistencia perfil) · **Fecha:** 2026-07-08
- **Rama:** `claude/sprint-startup-generic-rf6x0m`
- **Migración:** `prisma/migrations/20260708213237_add_tenant_profile/migration.sql`
- **Contexto:** ola "publicar Empresa cuanto antes" — el dueño autorizó adelantar esta pieza para no
  retrabajar (ver handoff del sprint). Complementa `docs/runbooks/rollback-pr2-candados-flags.md`
  (los flags de nav/candado de PR-2 — esta migración es la persistencia real de M1/D1 de ADR-059).

---

## 1. La migración (aditiva, cero pérdida de dato)

```sql
-- CreateEnum
CREATE TYPE "TenantProfile" AS ENUM ('lite', 'enterprise');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "profile" "TenantProfile" NOT NULL DEFAULT 'lite';
```

- **100% aditiva:** crea un tipo nuevo + una columna nueva con `DEFAULT`. No toca ninguna fila, columna
  ni tabla existente. Postgres backfillea el default para todas las filas existentes de forma atómica
  en el mismo `ALTER TABLE` — **sin backfill manual, sin ventana de downtime, sin script aparte**.
- **`NOT NULL DEFAULT 'lite'`:** ningún tenant existente queda en un estado inválido/nulo. Todos los
  tenants de hoy (CH Estética, Magra, Shine, A Dos Manos) quedan en **"Comercio"** (lite) — correcto,
  ninguno es pyme enterprise hoy.
- **Nombres de motor** (`lite`/`enterprise`) son de **ingeniería** (ADR-058/059 D7); el cliente ve
  "Comercio"/"Empresa" — la columna nunca se expone con esos nombres en ninguna UI.

## 2. Cómo se probó (base de DESARROLLO, no prod)

Se armó un **Postgres local efímero** (`embedded-postgres`, fuera del repo, en el scratchpad — no
requiere Neon ni Docker ni credenciales) para poder probar de punta a punta **sin tocar Neon**:

1. Se replayó el **historial completo de 28 migraciones** existentes sobre una DB vacía → **aplican
   limpio** (valida que la cadena de migraciones sigue siendo consistente).
2. Se insertó un **tenant preexistente** (`name`/`slug` reales, sin `profile`) simulando un tenant de
   antes de esta migración.
3. Se corrió `prisma migrate deploy` (el mismo comando que corre en prod) con la migración nueva.
4. Se releyó el tenant preexistente: **conservó `name`/`slug` intactos y quedó en `profile: "lite"`
   automáticamente** — prueba concreta de "aditiva, sin pérdida de dato", no solo lectura del SQL.
5. Se probó la escritura (`setTenantProfile`, `src/lib/profile-gating.ts`): update a `"enterprise"`
   aplicado y releído correctamente — el enum acepta ambos valores end-to-end.

**Resultado:** 🟢 migración validada aditiva/default-`lite`/sin pérdida de dato, en un entorno real
Postgres (no un mock), **cero contacto con Neon**.

## 3. Wiring de código (ya en `main` de esta rama, reversible)

- **Lectura** — `getActiveProfile()` (`src/lib/profile-gating.ts`): con `PROFILES_ENABLED` OFF (default)
  sigue sin leer nada (retorno temprano `null`, idéntico a hoy). Con el flag ON, lee `Tenant.profile`
  como fuente autoritativa, con **fallback seguro a `"lite"`** si la columna aún no existe en esa DB
  (error `P2022`) o ante cualquier fallo de lectura — publicar el código **antes** de correr esta
  migración en un ambiente **nunca rompe** el panel; el peor caso es "todos Comercio" (el default).
- **Escritura** — `setTenantProfile(tenantId, profile)` (mismo archivo): primitivo listo para que el
  flujo real de upgrade (M4, ADR-059 §Ejecución — UI + auditoría + valla de "sin perder un dato") lo
  invoque. Hoy no tiene caller de producto todavía.
- **Seed de demo** — `prisma/seed-demo-empresa.ts`: tenant de ejemplo `profile=enterprise` para
  mostrar/vender la edición Empresa. Con baranda que **aborta si `DATABASE_URL` parece prod**; se corre
  manual, solo en dev, nunca como parte de este runbook de publish.

## 4. Qué falta para el publish de prod (S5 coordina, NO se corre acá)

1. **Aplicar la migración a Neon prod:** `DATABASE_URL=<prod> npx prisma migrate deploy`. Con el
   historial ya probado (arriba) y siendo 100% aditiva, es de bajo riesgo — igual la corre **S5**, no
   esta sesión (Gate 2, norma dura del proyecto).
2. **Prender `PROFILES_ENABLED`** cuando el resto de PR-2 (nav agrupada + primitivos, otras sesiones)
   esté integrado y su propio Gate pase — recién ahí el perfil empieza a gatear de verdad. Antes de eso,
   aplicar la migración es inofensivo (el flag OFF ignora la columna igual).
3. **NO correr `seed-demo-empresa.ts` contra prod** — es solo para armar la demo de venta en un
   ambiente de dev/staging.

## 5. Rollback

**Si algo sale mal DESPUÉS de aplicar en prod** (poco probable, es aditiva, pero por las dudas):

```sql
-- Revierte exactamente lo que agregó la migración. Nada más se toca.
ALTER TABLE "Tenant" DROP COLUMN "profile";
DROP TYPE "TenantProfile";
```

- **Cero pérdida de dato en el rollback tampoco:** se dropea solo la columna nueva; el resto del tenant
  (`name`, `slug`, `modules`, etc.) queda intacto.
- **Si el rollback es de CÓDIGO únicamente (sin tocar la DB):** apagar `PROFILES_ENABLED` alcanza — el
  código deja de leer la columna (vuelve a `null`/legado) aunque la columna siga existiendo en la DB;
  la columna sobrante no rompe nada (nadie más la referencia). Es la opción de rollback más barata y
  la que **no requiere volver a tocar Neon**.
- **Si hace falta revertir el commit de código:** revertir `8198e73`/los commits de esta pieza no
  requiere ningún paso de DB adicional siempre que la migración de prod NO se haya corrido todavía.

## 6. Estado de vallas al momento de escribir esto

`tsc` limpio + suite de tests en verde (se corrió el pase completo del repo después de esta pieza,
ver commit de esta sesión). Cero cambios a Neon prod.

— Elaborado por GSG (sesión de plataforma — candados + persistencia perfil, PR-2/M2 · S3)
