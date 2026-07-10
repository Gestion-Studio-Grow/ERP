# 🔒 GO-LIVE RUNBOOK — Activar RLS (el candado de aislamiento) — ADR-018

**Qué logra esto:** que la base de datos, por sí sola, impida que un negocio vea
datos de otro. Hoy la protección es solo a nivel de la app; esto agrega el candado
a nivel de base.

**Estructura:** **PARTE 1** activa RLS para **Carolina** (obligatoria, ~10 min).
**PARTE 2** provisiona **magra** como 2º negocio (opcional, cuando quieras sumarla) —
ya es posible porque se construyó la resolución de tenant por request (cada negocio
por su subdominio). Cero downtime si se sigue el orden.

---

## ⚠️ LAS 2 REGLAS DE ORO (leer antes de empezar)

1. **Publicar el código nuevo (deploy) ANTES de tocar el secreto `DATABASE_URL`.**
   Si se rota el secreto antes del deploy, el candado se cierra sobre un código que
   todavía no sabe abrirlo → la app de Carolina se queda sin ver nada. El orden de
   abajo respeta esto.

2. **magra se suma en la PARTE 2, con su subdominio.** Desde que existe un 2º
   negocio, cada uno se accede por SU subdominio (`carolina.<dominio>`,
   `magra.<dominio>`) — no por el dominio pelado. Si sumás magra sin configurar los
   subdominios primero, la app no sabe de quién es cada visita. La Parte 2 lo ordena.

---

## Quién hace qué

- 🔑 **Maxi (dueño):** los clics en Neon y Netlify (crear el rol, pegar el secreto,
  disparar los deploys). Son las acciones que tocan credenciales/infra.
- 🤖 **PMO (Claude):** te guío clic por clic, te confirmo cada verificación, y tengo
  a mano el rollback. El SQL ya está escrito en el repo (`prisma/rls/`).

---

# 🔒 PARTE 1 — Activar RLS para Carolina (obligatoria, ~10 min)

## PASO 0 — Prep (🤖 ya hecho)

- Código de cableado RLS **en GitHub**, detrás del flag `RLS_ENFORCEMENT` (apagado
  por defecto → hoy no cambia nada). Verificado en local: aislamiento OK, Carolina
  no se rompe, flag apagado = idéntico a hoy.
- SQL listo en el repo: `prisma/rls/0001_enable_rls.sql` (policies),
  `prisma/rls/0001_rollback.sql` (reversa).

---

## PASO 1 — Neon: crear el rol de app y aplicar las policies

> ⚠️ **SUPERSEDED (2026-07-05) — usá el rol `app_rls`, NO `app_user`.** El auditado de prod encontró
> un `app_user` PREEXISTENTE con `BYPASSRLS` **inarreglable** por `neondb_owner` (rotar `DATABASE_URL`
> a él daría CERO aislamiento). La secuencia CORREGIDA y probada en verde (branch de Neon, 8/8) crea un
> rol **NUEVO `app_rls`** (`prisma/rls/0002_app_role.sql`) y cierra el drift de 9 tablas re-corriendo
> `0001`. **Seguí el guion canónico `docs/runbooks/alta-magra.md` (Pasos 1-2)**; abajo quedan los pasos
> por-UI como referencia, pero **leé `app_rls` donde diga `app_user`** y confirmá con
> `prisma/rls/check-rls-live.mjs` (hoy **38/38** — no 33; el conteo creció con las tablas de ADR-060 — + `app_rls` sin bypass; ADR-062).

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

# 🏪 PARTE 2 — Sumar magra como 2º negocio (opcional, cuando quieras)

Ya es posible: se construyó la **resolución de tenant por request** — cada negocio
se sirve por su **subdominio** y RLS lo aísla del otro. Verificado en local con 2
negocios sintéticos (cada uno resuelve y ve solo lo suyo; si no resuelve, se cierra).

> **Hacer la Parte 1 (RLS para Carolina) ANTES que esto.** Y `app_user` ya tiene
> permiso sobre las tablas futuras, así que las tablas que cree magra quedan cubiertas.

**Cómo va a quedar:** `carolina.<dominio>` = negocio de Carolina · `magra.<dominio>` =
negocio de magra. El dominio pelado conviene redirigirlo a `carolina.<dominio>` para no
romper el link actual de Carolina.

### PASO 5 — Preparar los subdominios (🔑 Maxi)

**5a. Dominio base (Netlify → Environment variables):** agregá `APP_BASE_DOMAIN` con tu
dominio raíz (ej. `midominio.com`). Sin esto, con 2 negocios la app no sabe resolver.

**5b. DNS + Netlify Domains:** que `carolina.<dominio>` y `magra.<dominio>` apunten al
sitio. Lo más simple: un DNS **wildcard** `*.<dominio>` → el sitio, y agregar ambos
dominios en Netlify → **Domain management**. (Si querés, redirigí el dominio pelado a
`carolina.<dominio>` con una regla de redirect de Netlify.)

**5c. Subdominio de Carolina:** entrá a la **consola de operador** (`/operador`) →
editá el tenant **Carolina** → campo **subdomain** = `carolina` → guardar.
(Así su subdominio resuelve; hacelo ANTES de crear magra.)

**5d. Deploy** para que tome `APP_BASE_DOMAIN`. Verificá que `carolina.<dominio>` abre
el negocio de Carolina normal.

### PASO 6 — Provisionar magra (🔑 Maxi por la consola, 🤖 coordino — es Gate 2)

- Consola de operador → **`/operador` → Alta de tenant** (`/operador/alta`).
- Completá: **nombre** = Magra · **slug** = `magra` · **subdomain** = `magra` ·
  **email del dueño** de magra · **rubro** = carnicería (elige el blueprint). Crear.
- Esto crea el negocio de magra **con sus datos iniciales**, usando la conexión de
  operador (que por el `OPERATOR_DATABASE_URL` del Paso 3a tiene acceso pleno —
  necesario para sembrar el negocio nuevo).

### PASO 7 — (si magra usa la API de pedidos externos) su api-key (🔑 Maxi)

- Netlify → Environment variables → `EXTERNAL_ORDERS_API_KEYS` (JSON):
  `{"carolina":"<key-caro>","magra":"<key-magra>"}` → deploy.
  (La API resuelve el negocio por el `X-Tenant-Slug` que declara el front, y valida con
  su clave.)

### PASO 8 — Verificación de aislamiento (🤖 te guío)

- Abrí **`carolina.<dominio>`**: ves SOLO datos de Carolina (agenda, catálogo, clientes).
- Abrí **`magra.<dominio>`**: ves SOLO datos de magra (su catálogo/pedidos).
- Confirmá que desde la de una no aparece nada de la otra. Ese es el candado funcionando.

---

## Resumen de lo que te toca (🔑 Maxi), en orden

**PARTE 1 — Activar RLS (Carolina):**
1. **Neon → Roles:** crear rol `app_user`, copiar su contraseña.
2. **Neon → SQL Editor:** correr `prisma/rls/0001_enable_rls.sql` + el bloque de GRANTs (Paso 1c).
3. **Netlify:** deploy del código nuevo (flag apagado) → verificar Carolina.
4. **Netlify env vars:** `OPERATOR_DATABASE_URL` = DATABASE_URL actual · `RLS_ENFORCEMENT` = `on`
   · `DATABASE_URL` → cambiar `neondb_owner:...` por `app_user:<tu-password>` → deploy → verificar Carolina.

**PARTE 2 — Sumar magra (cuando quieras):**
5. **Netlify:** `APP_BASE_DOMAIN` = tu dominio · DNS `*.<dominio>` + dominios en Netlify · en `/operador` poné subdomain `carolina` a Carolina → deploy.
6. **`/operador/alta`:** crear magra (slug `magra`, subdomain `magra`, rubro carnicería).
7. (si usa API) `EXTERNAL_ORDERS_API_KEYS` con la clave de magra.
8. Verificar aislamiento en `carolina.<dominio>` y `magra.<dominio>`.

Yo (🤖) te acompaño clic por clic cuando vuelvas y confirmo cada verificación.
