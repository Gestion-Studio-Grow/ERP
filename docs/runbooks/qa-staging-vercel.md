# 🌐 QA staging por Vercel — WEB-ONLY (sin PowerShell, sin local)

> **Qué es:** el runbook para tener el ambiente QA (Magra) publicado por **Vercel** contra la Neon branch
> **`qa-empresa`**, operable desde el navegador, **sin correr NADA en local**. Reproducible para otro cliente.
> **Regla dura:** NUNCA prod. `qa-empresa` es una branch aparte, persistente. **Autor:** GSG.

---

## 0. Estado actual de `qa-empresa` (Neon, persistente)
- **35 migraciones aplicadas** + **RLS** (policies) + **seed de Magra** ya corrido.
- Tenant **`magra-demo`** — id **`cmrdlqzl100008kh7822umdsb`**, perfil **Comercio** (`lite`).
- Datos: 8 productos (2 en stock bajo), 2 proveedores, 2 compras, 2 ventas, 2 cuentas a pagar (1 con cheque
  diferido, 1 vencida), 2 fiados. Ver `qa-preview-empresa-2026-07-08.md` §A.1-bis.
- ⚠️ **Le falta el usuario de login** (corrió el seed viejo, sin User). → **Paso 2** lo crea por SQL (web).

---

## 1. Variables de entorno en Vercel (proyecto `erp`, la que deploya la rama del sprint)
Ya están seteadas: `PROFILES_ENABLED=on`, `NAV_GROUPING_ENABLED=on`, `FORCE_TENANT_SLUG=magra-demo`,
`AUTH_SECRET`, `ADMIN_PASSWORD`. **Falta UNA:**

| Variable | Valor | Nota |
|---|---|---|
| **`DATABASE_URL`** ← **agregar** | la connection string **pooled del rol `neondb_owner`** de `qa-empresa` (`postgresql://neondb_owner:...@ep-...-pooler.../neondb?sslmode=require`) | **NUNCA** la de prod |
| `FORCE_TENANT_SLUG` | `magra-demo` | ✅ ya está — fija el tenant, no hace falta host/subdominio |
| `PROFILES_ENABLED` / `NAV_GROUPING_ENABLED` | `on` | ✅ ya están — perfil + nav de 5 grupos |
| `AUTH_SECRET` | (cualquiera, estable) | ✅ ya está — firma la cookie de sesión |

**Sobre roles y RLS (importante):**
- **NO setear `RLS_ENFORCEMENT`** (queda en `off`). Con `off`, la app usa la conexión de `DATABASE_URL`
  directamente; por eso `DATABASE_URL` debe ser el rol **`neondb_owner`** (que **bypassa RLS**) → los datos se
  ven sin necesidad del rol `app_rls` ni del GUC. (RLS igual quedó aplicado en la branch; en un staging de un
  solo tenant no hace falta enforcarlo.)
- **`ADMIN_PASSWORD` NO lo usa el login del panel** — verificado en el código (`auth-actions.ts` valida
  contra el `User` de la DB, no contra esa env). Es inocuo dejarlo; el acceso real es el del Paso 2.

---

## 2. Crear el login — WEB-ONLY (SQL en el SQL Editor de Neon)
**No hay bootstrap por env para el panel del tenant** (el "bootstrap" del código es solo del flujo del
*operador* al **crear** un tenant nuevo; magra-demo ya existe). La vía web limpia es **insertar el usuario
OWNER por SQL**. En **Neon → branch `qa-empresa` → SQL Editor**, pegá y ejecutá:

```sql
-- Usuario OWNER para entrar al backoffice de magra-demo (credenciales DEMO, solo QA).
-- Password: magra1234  (hash scrypt REAL del proyecto, formato scrypt$salt$hash).
-- Idempotente: re-ejecutable (ON CONFLICT actualiza el hash y reactiva).
INSERT INTO "User"
  ("id","tenantId","name","email","passwordHash","role","active","createdAt","updatedAt")
VALUES (
  'usr_magrademo_owner',
  'cmrdlqzl100008kh7822umdsb',
  'Dueña — Magra DEMO',
  'dueno@magra-demo.test',
  'scrypt$afcaa16a4f8cb7bce9ce1fe7f76d0dcd$e86780a8210d6bf65fd104f833fcf2c3f1d90799156785c93b57ecccdfc18dc2f9b414d4e15d15d14f8e4026e97d3cef9f5efed987f889807e7356fb4984a4a2',
  'OWNER'::"UserRole",
  true,
  now(),
  now()
)
ON CONFLICT ("tenantId","email") DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "active"       = true,
  "deletedAt"    = NULL,
  "updatedAt"    = now();
```

> El hash corresponde EXACTO a la contraseña `magra1234` con el hasher del proyecto
> (`src/lib/auth-password.ts`, scrypt, `KEY_LENGTH=64`, salt 16 bytes) — verificado con roundtrip
> (`verifyPassword("magra1234", hash) === true`). El `neondb_owner` bypassa RLS, así que el INSERT entra sin
> problema.

**Credenciales resultantes:** email **`dueno@magra-demo.test`** · contraseña **`magra1234`** (rol OWNER).

---

## 3. Redeploy (para que tome `DATABASE_URL`)
- Vercel → proyecto `erp` → **Deployments** → el último de la rama del sprint → **⋯ → Redeploy**
  (o hacé un push a la rama, que dispara un deploy nuevo). El redeploy es necesario para que las env vars
  nuevas entren en efecto.

---

## 4. Abrir en el navegador
- **Backoffice:** `https://<deployment>.vercel.app/admin/login` → **`dueno@magra-demo.test`** / **`magra1234`**
  → entrás al panel de **magra-demo**.
- **Vidriera pública (sin login):** `https://<deployment>.vercel.app/`
- (`<deployment>` = la URL que muestra Vercel para ese deploy.)

---

## 5. Flipear Comercio ⇄ Empresa — WEB-ONLY (SQL, sin script)
Para ver los módulos avanzados (cuentas a pagar/cobrar, libros, inventario, devoluciones) hay que estar en
**Empresa**. Sin PowerShell, se cambia por SQL en el SQL Editor de Neon (misma branch):

```sql
-- A Empresa:
UPDATE "Tenant" SET profile = 'enterprise'::"TenantProfile" WHERE slug = 'magra-demo';
-- Volver a Comercio:
UPDATE "Tenant" SET profile = 'lite'::"TenantProfile" WHERE slug = 'magra-demo';
```
`getActiveProfile()` lee `Tenant.profile` **en vivo por request** → basta **recargar** `/admin` tras el
UPDATE (no hace falta redeploy). En Empresa: badge **"Empresa"** + home analítico + los 5 módulos avanzados.

---

## 6. Repetir para OTRO cliente (reproducible, web-only)
1. **Neon** → crear branch persistente (ej. `qa-<cliente>`) desde `main`; copiar la connection string
   `neondb_owner` (pooled).
2. **Migraciones + RLS + datos:** aplicar migraciones y sembrar. *(Hoy el seed corre por CLI; para 100%
   web se puede portar el seed a SQL o correrlo una vez desde una máquina de confianza. La branch queda
   persistente, así que se hace una sola vez.)*
3. **Vercel** → setear las env del §1 (sobre todo `DATABASE_URL` = la branch nueva, `FORCE_TENANT_SLUG` = el
   slug del tenant).
4. **Login** → correr el SQL del §2 cambiando `tenantId`, `email` y (si querés otra contraseña) el hash.
   > Para generar un hash nuevo con otra contraseña, hay que correr `hashPassword("<pass>")` una vez
   > (script del repo) y pegar el resultado — es el único paso que no es puramente SQL.
5. **Redeploy** (§3) → abrir la URL (§4). Flip por SQL (§5).

---

## 7. Notas de seguridad / limpieza
- **Prod intacto:** todo apunta a `qa-empresa` (branch aparte). `DATABASE_URL` de prod NUNCA se toca.
- **Credenciales DEMO:** `dueno@magra-demo.test` / `magra1234` son de QA — no reusar en prod.
- **`ARCA_INVOICING_ENABLED` off / sin MP real:** facturar/cobrar de verdad no está habilitado en staging;
  el resto de las pantallas se navega read-only sin esos secretos.
- **Persistente:** `qa-empresa` ya no se auto-borra; se puede volver a entrar cuando haga falta (repetir solo
  el redeploy si cambian env).

— Elaborado por GSG · web-only, reproducible · anclado en `auth-actions.ts` (login) + `tenant.ts` (FORCE_TENANT_SLUG) + `prisma-base.ts` (RLS off default).
