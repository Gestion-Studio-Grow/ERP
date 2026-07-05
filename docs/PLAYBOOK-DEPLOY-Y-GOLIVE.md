# 📕 Playbook — Deploy y Go-Live (procedimiento repetible)

**Para qué:** que publicar a producción o sumar un negocio (go-live) sea un
**procedimiento + un check automático**, ejecutable por cualquiera del equipo (o por
una sesión de Claude), sin depender de una sola persona. Si seguís los pasos, no
hay forma de romper al cliente en vivo por una base desactualizada.

**Dos flujos:** **A) Deploy normal** · **B) Go-live / alta de negocio.** Los dos
empiezan por el mismo chequeo de seguridad.

---

## 🧭 El principio de oro: la BASE antes que el CÓDIGO

El código nuevo suele esperar cosas nuevas en la base (una columna, una tabla). Si se
**publica el código antes de que la base las tenga**, la app consulta algo que no
existe y **se rompe para el cliente en vivo** — sin aviso. Esto casi pasa una vez.

Por eso, **antes de todo deploy** se corre el **chequeo pre-deploy**, que compara lo
que el código espera contra lo que la base realmente tiene, y **frena si hay diferencia**.

```
npm run predeploy-check
```

- **✅ verde** ("Base al día") → se puede deployar.
- **❌ rojo** ("DRIFT detectado") → **NO deployar.** Te dice exactamente qué falta
  (migración sin aplicar, o tabla/columna faltante). Resolvés eso primero (abajo).
- Es **solo lectura** del catálogo de la base (no toca ni lee datos de negocio), así
  que es seguro apuntarlo a producción.

Cómo apuntarlo a la base destino:
- Por defecto usa `DATABASE_URL` del `.env`.
- O explícito: `PREDEPLOY_DATABASE_URL="postgres://...prod..." npm run predeploy-check`
  (útil para chequear prod desde una máquina que apunta a otra base por default).

---

## A) 🚀 Deploy normal a producción

### Precondiciones (todas ✅ antes de empezar)
- [ ] El cambio está en `main` (PR mergeado / revisado).
- [ ] `npm run build` en verde (local o CI).  ·  `npx tsc --noEmit` sin errores.
- [ ] Sabés qué cambió (¿toca la base? ¿toca algún secreto/env?).

### PASO 1 — Chequeo de seguridad pre-deploy (OBLIGATORIO)
```
npm run predeploy-check
```
- **Verde** → seguí al Paso 2.
- **Rojo por migración sin aplicar** → aplicar la migración a prod con
  `prisma migrate deploy` — es **Gate 2** (irreversible), requiere **OK explícito del
  dueño** y usar la URL del **rol dueño** (`neondb_owner`), no `app_user`. Después
  volvé a correr el check hasta que dé verde.
- **Rojo por tabla/columna faltante sin migración** → falta escribir/aplicar la
  migración que crea eso. No deployar hasta resolverlo.
- **Regla dura:** nunca se deploya con el check en rojo.

### PASO 2 — Publicar (deploy)
- Netlify → **Deploys → Trigger deploy → Deploy site**. Esperá el verde.
- **Si el cambio incluye rotar un secreto** (ej. `DATABASE_URL`): **primero el deploy
  del código, después rotar el secreto** (nunca al revés — ver GO-LIVE-RUNBOOK).

### PASO 3 — Verificación post-deploy (smoke test)
- [ ] La app abre y el login funciona.
- [ ] Una pantalla clave carga con datos reales (agenda / catálogo / pedidos).
- [ ] Una acción de escritura anda (crear algo de prueba y borrarlo).
- [ ] No hay errores nuevos en los logs de Netlify.

### 🔴 Rollback (si el Paso 3 falla)
- Netlify → **Deploys** → elegí el deploy anterior (el que andaba) → **Publish deploy**
  (revierte al instante). O revertí el commit en `main` y deployá.
- Si rotaste un secreto en este deploy, **volvelo a su valor anterior** y redeployá.

---

## B) 🏪 Go-live / alta de un negocio (tenant)

El detalle clic-por-clic está en **[docs/GO-LIVE-RUNBOOK.md](GO-LIVE-RUNBOOK.md)**.
Resumen del procedimiento:

### B.1 — Activar RLS (una sola vez, la primera)
- Seguí **GO-LIVE-RUNBOOK.md → PARTE 1**: crear rol `app_user` (Neon), aplicar
  policies (`prisma/rls/0001_enable_rls.sql`) + grants, deploy del código (flag
  apagado), y recién ahí encender `RLS_ENFORCEMENT=on` + rotar `DATABASE_URL` a
  `app_user`. **Orden: deploy antes de rotar el secreto.**
- Antes del deploy de este flujo, corré igual el **pre-deploy check** (Paso 1 de A).

### B.2 — Sumar un negocio nuevo
- Seguí **GO-LIVE-RUNBOOK.md → PARTE 2**: `APP_BASE_DOMAIN` + DNS wildcard
  `*.<dominio>` + dominios en Netlify, poner el `subdomain` de cada negocio en la
  consola de operador, y dar de alta el negocio en **`/operador/alta`**.
- Verificar aislamiento: `negocioA.<dominio>` ve solo lo suyo; `negocioB.<dominio>`,
  lo suyo. Ese es el candado (RLS) funcionando.

---

## 🔖 Referencia rápida

| Necesito… | Comando / doc |
|---|---|
| Chequear que prod esté al día antes de deployar | `npm run predeploy-check` |
| Deploy normal | Sección A |
| Activar RLS / sumar un negocio | `docs/GO-LIVE-RUNBOOK.md` (Sección B) |
| Aplicar una migración a prod (Gate 2, con OK) | `prisma migrate deploy` (rol dueño) |
| Rollback de deploy | Netlify → Deploys → Publish deploy anterior |

**Regla que nunca se saltea:** `npm run predeploy-check` en verde **antes** de cada
deploy. Es la red que impide publicar código contra una base que no está lista.
