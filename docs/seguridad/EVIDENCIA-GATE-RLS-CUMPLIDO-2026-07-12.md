# Evidencia — Gate de RLS cumplido: ¿el dueño ya puede dar de alta clientes nuevos?

- **Fecha de verificación:** 2026-07-12
- **Alcance:** solo lectura contra Neon prod (catálogos `pg_class`/`pg_policies`/`pg_roles`) + ensayo
  end-to-end en base efímera (PGlite, en memoria). **No se dio de alta ningún tenant real en prod.**
- **Rama:** `seguridad/gate-rls-cumplido` (worktree aislado).
- **Para:** firma del gate de Seguridad (Facundo).

---

## ✅ VEREDICTO: SÍ — el dueño ya puede dar de alta un cliente nuevo

El gate que abortaba el alta de un 2º tenant **mide bien y su condición YA está satisfecha en producción.**
No hace falta arreglar ni debilitar nada: el gate abre solo cuando el aislamiento de DB es real, y hoy lo es.

---

## 1. Qué evalúa el gate exactamente (archivo:línea)

El único gate de RLS del alta vive en el core transaccional `provisionTenant`, y **toda alta pasa por él**
(la consola de operador de ADR-074 lo envuelve, no lo reimplementa — `src/lib/provisioning/adapters.ts:77`).

- **Gate:** [`scripts/provision-tenant.ts:198-214`](../../scripts/provision-tenant.ts) — si el slug es nuevo
  (`isNewTenant`) **y** ya hay ≥1 tenant (`tenantCount >= 1`), exige `isRlsActive(tx) === true`; si no, lanza
  `GATE ADR-018 — ALTA ABORTADA` y **no crea nada**.
- **Condición medida:** [`isRlsActive` — `scripts/provision-tenant.ts:154-163`](../../scripts/provision-tenant.ts):
  consulta `pg_class.relrowsecurity` para las tablas **centinela** y exige que **TODAS** tengan RLS habilitado.
- **Centinelas:** [`RLS_SENTINEL_TABLES = ["Appointment", "Client"]` — `scripts/provision-tenant.ts:68`](../../scripts/provision-tenant.ts).
  `Tenant` se excluye a propósito (es la raíz sin `tenantId`; si fuera centinela, `isRlsActive` daría `false`
  para siempre y el gate no abriría nunca).

**El gate mide lo correcto:** que la infraestructura de aislamiento por RLS esté efectivamente aplicada sobre
las tablas de-tenant antes de permitir un 2º tenant. No es un chequeo débil ni erróneo.

## 2. Evaluación de esa condición contra el estado REAL de prod (2026-07-12, solo lectura)

Consulta puntual sobre los centinelas del gate + `Tenant`:

```
Centinelas del gate (isRlsActive) + Tenant en PROD:
  Appointment  relrowsecurity=true   force=false
  Client       relrowsecurity=true   force=false
  Tenant       relrowsecurity=false  force=false
>> isRlsActive() emulado contra prod = true → GATE ABRE (permite alta)
>> Tenants en prod: 8 (count>=1 → el gate SÍ se evalúa en un alta nueva)
```

**Resultado: la condición del gate PASA.** `Appointment` y `Client` tienen RLS habilitado; `Tenant` está
excluida como el diseño espera. Con 8 tenants en prod el gate efectivamente se evalúa en cada alta nueva, y abre.

> Nota sobre `force=false` (`relforcerowsecurity`): no es un hueco. La app corre como **`app_rls` (NOBYPASSRLS
> y no es owner de las tablas)** → las policies se le aplican con o sin FORCE. FORCE solo afecta al *owner* de la
> tabla; el provisioning corre como owner a propósito (por eso puede insertar). El gate no depende de FORCE.

## 3. Evidencia de RLS en prod para la firma del gate de Seguridad (`check-rls-live`, 2026-07-12)

```
Tablas de-tenant (con columna tenantId): 43
  con RLS habilitado:            43/43
  con policy tenant_isolation:   43/43

✅ app_rls existe y NO evade RLS (bypassrls=false, super=false).

ℹ️  app_user legacy existe con BYPASSRLS (inarreglable, esperado). Inofensivo si
   nadie conecta con él. NO rotar DATABASE_URL a app_user — usar app_rls.

RESULTADO: SIN DRIFT — cobertura RLS completa ✅
```

Complementa la verificación previa (memoria `rls-prod-real-a3-latente`, 2026-07-12) que confirmó, vía
`pg_stat_activity`, que la única conexión de app en runtime es `app_rls`, y que `RLS_ENFORCEMENT=on` en Vercel.
Las tres patas del aislamiento están: **flag on + policy 43/43 + runtime=app_rls (NOBYPASSRLS)**.

## 4. Ensayo del camino completo del alta end-to-end (PGlite en memoria — NO prod)

`npx tsx prisma/rls/verify-provision-gate.mts` sobre el árbol consistente (misma rama que prod, 41 tablas
de-tenant cubiertas en la base del ensayo):

```
✅ alta tenant #1 (beauty-spa) sin gate
✅ gate SIN RLS BLOQUEA el 2º tenant (throw esperado)
✅ tras el bloqueo, sigue habiendo 1 solo tenant
✅ cobertura RLS completa: 41/41 tablas de-tenant con RLS + policy
✅ Tenant excluida de RLS a propósito (raíz sin tenantId)
✅ app_rls (rol nuevo del 0002) nace NOBYPASSRLS → enforcement real, sin footgun
✅ alta tenant #2 (magra) CON RLS activo → GATE ABIERTO
✅ ahora hay 2 tenants en la base del ensayo
✅ ctx=CH ve SOLO usuarios de CH
✅ ctx=Magra ve SOLO usuarios de Magra
✅ SIN contexto (fail-closed) → 0 filas visibles
RESULTADO: TODO EN VERDE
```

Prueba que, con RLS activo (el estado real de prod), **el gate abre y el alta completa funciona de punta a
punta**, con aislamiento efectivo por tenant y fail-closed sin contexto.

## 5. Qué hacer para dar de alta (con RLS ya cumplido)

El alta ya está desbloqueada. Camino operativo:

- **CLI:** `npm run provision -- --name "Negocio SA" --slug negocio-sa --owner-email owner@negocio.com [--blueprint …]`
  — corre como owner (bypass) contra `DATABASE_URL`; el gate `isRlsActive` verá RLS activo y abrirá.
- **Consola de operador** (`/operador`, ADR-074/RFC-003): wizard → dry-run → commit; el committer real envuelve
  `provisionTenant` (mismo gate).

## 6. Pendientes que NO bloquean el alta (hardening, backlog)

Ninguno de estos impide dar de alta hoy; son endurecimiento defensivo ya conocido (ADR-062):

- **`app_user` legacy con BYPASSRLS todavía en circulación.** Inofensivo mientras nadie rote `DATABASE_URL`
  a él (el runtime usa `app_rls`). Revocarlo requiere superuser (que Neon no da). **Regla dura:** nunca apuntar
  `DATABASE_URL` a `app_user`. Riesgo: solo si se lo usara por error.
- **Loaders de `/admin` sin filtro `tenantId` explícito** (memoria `rls-prod-real-a3-latente`): **latentes**, no
  fuga viva — RLS los aísla. Se vuelven vivos solo si el flag se apaga o `DATABASE_URL` apunta a un rol BYPASSRLS.
- **Footgun de `.env` local:** el `.env` del dev tiene `DATABASE_URL=neondb_owner` (BYPASSRLS) apuntando a PROD.
  Correr la app local con ese `.env` evade RLS sobre datos reales. No afecta prod; es disciplina de dev.
- **Rotación de secretos + PITR** (§C·I4 del ESTADO): pendiente de OK del dueño, independiente del gate.

---

## Firma del gate de Seguridad

- [ ] **Seguridad (Facundo):** aislamiento multi-tenant por RLS verificado en prod (43/43 + policy + `app_rls`
      NOBYPASSRLS, 2026-07-12). Gate del 2º tenant desbloqueado. Hardening residual anotado, no bloqueante.

— Elaborado por GSG (Seguridad)
