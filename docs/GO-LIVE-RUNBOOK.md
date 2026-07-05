# 🔒 GO-LIVE RUNBOOK — Activar RLS (el candado de aislamiento) — ADR-018

**Qué logra esto:** que la base de datos, por sí sola, impida que un negocio vea
datos de otro. Hoy la protección es solo a nivel de la app; esto agrega el candado
a nivel de base.

**Estado al terminar:** RLS activo y enforced para **Carolina** (el único negocio
en producción hoy). Cero downtime si se sigue el orden.

**Tiempo estimado:** ~10 minutos de clics.

---

## ⚠️ LAS 2 REGLAS DE ORO (leer antes de empezar)

1. **Publicar el código nuevo (deploy) ANTES de tocar el secreto `DATABASE_URL`.**
   Si se rota el secreto antes del deploy, el candado se cierra sobre un código que
   todavía no sabe abrirlo → la app de Carolina se queda sin ver nada. El orden de
   abajo respeta esto.

2. **NO provisionar magra todavía.** El código de hoy sabe manejar **un solo
   negocio por base**. Meter magra como 2º negocio en la misma base rompería la app
   (para Carolina también). Ver la sección **"Sobre magra"** al final. Este runbook
   activa RLS **solo para Carolina**.

---

## Quién hace qué

- 🔑 **Maxi (dueño):** los clics en Neon y Netlify (crear el rol, pegar el secreto,
  disparar los deploys). Son las acciones que tocan credenciales/infra.
- 🤖 **PMO (Claude):** te guío clic por clic, te confirmo cada verificación, y tengo
  a mano el rollback. El SQL ya está escrito en el repo (`prisma/rls/`).

---

## PASO 0 — Prep (🤖 ya hecho)

- Código de cableado RLS **en GitHub**, detrás del flag `RLS_ENFORCEMENT` (apagado
  por defecto → hoy no cambia nada). Verificado en local: aislamiento OK, Carolina
  no se rompe, flag apagado = idéntico a hoy.
- SQL listo en el repo: `prisma/rls/0001_enable_rls.sql` (policies),
  `prisma/rls/0001_rollback.sql` (reversa).

---

## PASO 1 — Neon: crear el rol `app_user` y aplicar las policies

> Seguro: nada de esto cambia el comportamiento de la app todavía (la app sigue
> conectando con el rol de siempre hasta el Paso 3).

**1a. Crear el rol (🔑 Maxi) — por la UI, NO por SQL.**
- Neon → tu proyecto → menú lateral **"Roles"** → **"New Role"**.
- Nombre: **`app_user`** → crear.
- Neon te muestra una **contraseña generada**. **Copiala y guardala** — la pegás en
  Netlify en el Paso 3b. (Crearlo por la UI es lo que lo hace funcionar con el pooler.)

**1b. Aplicar las policies (🔑 Maxi, 🤖 te paso el texto).**
- Neon → **"SQL Editor"**.
- Pegá y ejecutá TODO el contenido del archivo **`prisma/rls/0001_enable_rls.sql`**.
- Debe correr sin error (activa el candado en las ~28 tablas con `tenantId`).

**1c. Darle permisos al rol (🔑 Maxi) — pegá este bloque en el mismo SQL Editor:**

```sql
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO app_user;
```

---

## PASO 2 — Netlify: publicar el código nuevo (deploy) — CON EL FLAG APAGADO

> Este deploy NO cambia nada visible: el flag está apagado, la app sigue conectando
> como siempre. Es solo para que el código nuevo esté vivo antes de armar el candado.
> **Este paso va SÍ o SÍ antes del Paso 3.**

**2a. (🔑 Maxi)** Netlify → tu sitio → **Deploys** → **Trigger deploy → Deploy site**
(o como publiques normalmente). Esperá a que termine en verde.

**2b. (🤖 verificamos juntos)** Entrá al panel de Carolina y a la web pública: deben
cargar normal, igual que siempre.

---

## PASO 3 — Netlify: armar el candado (encender el flag + rotar el secreto)

> Netlify → tu sitio → **Site configuration** → **Environment variables**
> (o **Site settings → Environment variables**).

**3a. (🔑 Maxi) Proteger la consola de operador** — agregá una variable NUEVA:
- Nombre: **`OPERATOR_DATABASE_URL`**
- Valor: **el valor ACTUAL de `DATABASE_URL`** (el que empieza con
  `postgresql://neondb_owner:...`), copiado tal cual, SIN cambiar nada.
- (Esto deja la consola de operador con acceso pleno mientras la app queda scopeada.)

**3b. (🔑 Maxi) Encender el flag** — agregá otra variable NUEVA:
- Nombre: **`RLS_ENFORCEMENT`**
- Valor: **`on`**

**3c. (🔑 Maxi) Rotar el secreto** — editá la variable existente **`DATABASE_URL`**:
- Tomá su valor actual y cambiá **SOLO el usuario y la contraseña**:
  - de:  `postgresql://neondb_owner:<contraseña-vieja>@ep-...`
  - a:   `postgresql://app_user:<CONTRASEÑA-DEL-PASO-1a>@ep-...`
- **Dejá TODO lo demás EXACTAMENTE igual** (el `@ep-...-pooler...neon.tech/neondb?sslmode=require...`).
- Placeholder del valor final (pegás tu contraseña donde dice `<PASSWORD>`):

  ```
  postgresql://app_user:<PASSWORD>@<todo-lo-que-sigue-igual-que-el-DATABASE_URL-de-hoy>
  ```

  > ⚠️ La `<PASSWORD>` es la que Neon te dio en el Paso 1a. Es tu secreto — no va en
  > este documento ni me la pases a mí.

**3d. (🔑 Maxi) Publicar** — Netlify → **Deploys** → **Trigger deploy → Deploy site**.
Al terminar este deploy, el candado queda **armado**.

---

## PASO 4 — Verificación final (🤖 te guío)

Con el deploy del Paso 3 en verde, revisamos que Carolina anda normal (si anda, RLS
está enforced y correcto — la app solo ve datos vía el candado):

- [ ] **Panel admin** de Carolina: carga, se ve el dashboard con sus números.
- [ ] **Agenda / turnos:** se ven los turnos; crear un turno de prueba funciona; borralo.
- [ ] **Catálogo / clientes:** listan normal.
- [ ] **Web pública** (reserva): carga y deja iniciar una reserva.

**Si algo aparece VACÍO o da error** (ej. la agenda sin turnos que sabés que existen):
el candado se cerró mal → **ROLLBACK** (abajo). No es grave, es reversible al toque.

---

## 🔴 ROLLBACK (red de seguridad — sin backup, por decisión tuya)

Si algo sale mal en el Paso 4, **revertir es inmediato**:

1. **(🔑 Maxi)** Netlify → Environment variables → **`DATABASE_URL`**: volvela a su
   valor original (usuario **`neondb_owner`** + contraseña vieja). → **Trigger deploy**.
   - La app vuelve a conectar como el rol dueño, que **ignora el candado** → Carolina
     funciona igual que antes, al instante. (El flag `RLS_ENFORCEMENT=on` puede quedar;
     con el rol dueño es inofensivo. Si querés, ponelo en `off` también.)
2. **(opcional)** Para sacar las policies de la base: Neon → SQL Editor → pegá y corré
   **`prisma/rls/0001_rollback.sql`**.

---

## Sobre magra (⚠️ importante — NO provisionar todavía)

El pedido incluía "que Carolina **y magra** anden". Estado real del código hoy:

- La app resuelve "de qué negocio es este request" con un método que sirve para **un
  solo negocio por base de datos**. Meter magra como 2º negocio en la **misma base**
  haría que la app no sepa distinguir los requests y se caiga — **para Carolina también**.
- Falta construir la pieza **"resolución de tenant por request"** (que la app sepa por
  el dominio/sesión si el request es de Carolina o de magra). No está hecha (ADR-018 §4).

**Por eso este runbook activa RLS solo para Carolina.** Opciones para magra, a decidir:

- **(A)** Magra como 2º negocio en la MISMA base (shared multi-tenant, el modelo de
  ADR-001): necesita que yo construya primero la resolución por request. Te lo armo
  en la próxima sesión; recién ahí se provisiona magra y se verifica el aislamiento
  entre los dos.
- **(B)** Magra como deploy + base SEPARADA (un negocio por base): anda con este mismo
  cableado tal cual (1 tenant por base). Si es este el plan, decímelo y ajusto.

Hasta resolver esto: **no corras el script de provisioning de magra contra la base de
Carolina.** (El propio script tiene un guard que lo rechaza sin RLS, pero el bloqueo
real es la resolución por request, no el candado.)

---

## Resumen de lo que te toca (🔑 Maxi), en orden

1. **Neon:** crear rol `app_user` (UI → Roles) y copiar su contraseña.
2. **Neon SQL Editor:** correr `0001_enable_rls.sql` + el bloque de GRANTs (Paso 1c).
3. **Netlify:** deploy del código nuevo (flag apagado) → verificar Carolina.
4. **Netlify env vars:** `OPERATOR_DATABASE_URL` = DATABASE_URL actual · `RLS_ENFORCEMENT` = `on`
   · `DATABASE_URL` → cambiar `neondb_owner:...` por `app_user:<tu-password>`.
5. **Netlify:** deploy → verificar Carolina (Paso 4).

Yo (🤖) te acompaño clic por clic cuando vuelvas y confirmo cada verificación.
