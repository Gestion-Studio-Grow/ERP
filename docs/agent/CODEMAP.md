# CODEMAP: stack real y mapa del código

Línea base: commit `3a96b52`, medido el 2026-09-24 sobre una copia limpia de ese commit
(worktree detached, sin cambios locales) y corregido después de la refutación del mismo día.
Cada dato dice de qué archivo sale. Si el código cambia y esto no, gana el código. Lo que sale
de la documentación y no del código lo dice ("según la documentación, no medida").

Documentos hermanos: `HEALTH.md` (números), `DECISIONS.md` (presupuestos y decisiones),
`BACKLOG.md` (slices de ingeniería).

---

## 1. Stack real

| Pieza | Valor | Fuente |
|---|---|---|
| Runtime | Node 22.22.2 en local; el CI corre Node 20. `package.json` no fija `engines` y no hay `.nvmrc` | `node -v`; `.github/workflows/gates.yml` (`node-version: 20`) |
| Framework | Next.js 16.3.4 (App Router + Server Actions), React 19.2.4 | `package.json`; `node_modules/next/package.json` |
| Middleware | `src/proxy.ts` (convención `proxy` de Next 16): resuelve el negocio por host y bloquea previews | `src/proxy.ts` |
| Bundler | Turbopack (el default de `next dev` y `next build` en Next 16), sin configuración propia | `next.config.ts` (sólo `env` e `images.remotePatterns`) |
| Base | PostgreSQL (`prisma/schema.prisma:35-37`: `datasource db { provider = "postgresql" }`; no dice proveedor ni región). Producción en Neon, región `sa-east-1` **según la documentación, no medida** (`docs/runbooks/deploy-vercel.md:175`; el host de `docs/seguridad/RUNBOOK-ROTACION-SECRETOS.md:48`); ENG-204 la mide. Local en `/tmp/pgrun`, puerto 5433 | ver columna Valor |
| Hosting | Vercel, región `gru1` (São Paulo). Build con `node scripts/vercel-build.mjs`, que aplica migraciones con `MIGRATE_DATABASE_URL`. 2 crons diarios | `vercel.json:3-17` |
| ORM | Prisma 7.8.0. Generador `prisma-client` hacia `src/generated/prisma` (no se versiona); driver `@prisma/adapter-pg` + `pg` | `prisma/schema.prisma:30-33`, `prisma.config.ts`, `src/lib/prisma-base.ts` |
| Aislamiento entre negocios | RLS con policy `tenant_isolation` en 44 tablas y rol `app_rls` NOBYPASSRLS, más el candado de aplicación que agrega `tenantId` al `where` (`scopeArgs`). `src/lib/db.ts:29-31` elige un cliente según `RLS_ENFORCEMENT`: encendido, `rlsPrisma` (el candado va adentro, con `scopeTxClient`); apagado, `withTenantScope(basePrisma)`. No se aplican los dos envoltorios a la vez | `prisma/rls/0001_enable_rls.sql`, `prisma/rls/0002_app_role.sql`, `src/lib/db.ts:29-31`, `src/lib/tenant-scope.ts:83` (`scopeArgs`), `:109` (`scopeTxClient`), `:147` (`withTenantScope`), `src/lib/rls.ts:84-88` |
| Tests | `node:test` + `tsx`: `node --import tsx --test "src/**/*.test.ts"` | `package.json` (script `test`) |
| Navegador | Playwright 1.61, usado por scripts de render y contraste y por 5 archivos de test de componentes, que se saltean si no hay Chromium (en CI, siempre: ver §6); no hay suite de flujos | `scripts/qa/*.mjs`, `scripts/visual-gate.mjs` |
| Lint | ESLint 9.39.4 (flat config): `eslint-config-next` core-web-vitals + typescript, sin reglas que usen tipos | `eslint.config.mjs` |
| Formatter | Ninguno: 0 archivos de prettier, biome o editorconfig | `ls -a`; `package.json` |
| Tipado | TypeScript 5.9.3, `strict: true`, sin `noUncheckedIndexedAccess` | `tsconfig.json:7` |
| Dependencias de runtime fuera de lo común | `node-forge` (certificados de ARCA) y `xlsx` (SheetJS, instalado desde un tarball de `cdn.sheetjs.com`, fuera del registro de npm). Ninguna de las dos tiene ADR | `package.json`; `grep -rliE 'node-forge\|xlsx\|sheetjs' docs/adr` = 0 |
| Residuo | `netlify.toml`, sin uso | raíz del repo |

## 2. Estructura de carpetas

```
src/
  proxy.ts            entrada de cada request (negocio por host, previews bloqueados)
  app/                87 page.tsx y 16 route.ts
    (site)/           vidriera de CH Estética (reserva de turnos)
    (campania)/       landing de campaña
    tienda/           tienda online por negocio (MagraFront, ShineFront, Storefront)
    admin/            backoffice del negocio: admin/(dashboard)/<pantalla>
    operador/         consola de GSG (alta de negocio, negocios, cockpit)
    contador/         panel del estudio contable (cartera)
    api/              cron (reminders, arca-outbox), health, ready, public/v1/orders, webhooks/mercadopago
    acceso/ demo/ probar/ premium/ facturita/
  lib/                133 archivos de producción sueltos (215 con los 82 tests) + 25 subcarpetas:
                      reglas, casos de uso y acceso a datos mezclados
  plugins/            arca (domain/, afip/), bancos (domain/, parser/), mercadopago, pagos
  modules/            catálogo de módulos, gating por perfil, navegación
  apps/               "ERP por apps" (ADR-098): registro, rutas, kpis, catálogo
  blueprints/         configuración por rubro (agenda, retail, gastronomía, oficios, servicios, genérico)
  cambios/            interruptores por negocio (se guardan en AuditLog con entity "Interruptor")
  tenants/ preset/ components/
prisma/
  schema.prisma       45 modelos, 28 enums, 1.801 líneas
  migrations/         45 migraciones; 7 traen rollback.sql
  rls/                SQL de RLS (se corre a mano), gate estático, suites de aislamiento
  pending-gate2/      4 SQL escritos y sin aplicar (ArcaAuthTicket, CarniceriaRubro, MustChangePassword, ProvisioningRun)
scripts/              30 entradas: provisioning, vercel-build, predeploy-check, verify-gates, qa/
docs/adr/             86 entradas (índice en docs/adr/INDEX.md)
celula-negocios-digitales/  productos satélite; otro código, pero `npm run lint` lo incluye
```

Tamaño: 757 archivos de producción en `src/` (sin tests ni `generated`), 129.007 líneas;
293 archivos de test, 49.321 líneas. 11 archivos de producción pasan las 800 líneas. El más
grande es `src/lib/actions.ts`: 2.108 líneas, 27 Server Actions y 16 modelos distintos.

## 3. Dónde vive cada contexto de negocio

No hay un módulo por contexto. Casi todo está en `src/lib/` plano, con subcarpetas parciales.
Sólo `src/plugins/arca/domain` y `src/plugins/bancos/domain` (10 archivos) separan una capa
de dominio sin framework.

| Contexto | Código | Pantallas y entradas |
|---|---|---|
| Ventas y mostrador | `lib/order-core.ts`, `order-actions.ts`, `order-anulacion.ts`, `venta-reglas.ts`, `external-orders.ts`, `coupon-actions.ts` | `admin/(dashboard)/vender`, `pedidos`, `ventas`, `promociones`; `tienda/`; `api/public/v1/orders` |
| Turnos y agenda | `lib/actions.ts`, `booking-core.ts`, `turnos/`, `waitlist-actions.ts`, `client-actions.ts` (lo público) | `admin/(dashboard)/turnos`, `espera`; `(site)/` |
| Caja y tesorería | `lib/caja/`, `caja-actions.ts`, `libro-caja-actions.ts`, `cierre-diario-actions.ts`, `cierre-mes/`, `cobros-actions.ts` | `admin/(dashboard)/caja`, `caja/libro`, `caja/cierre`, `cierre-mes` |
| Cuentas a cobrar y a pagar | `lib/debts/`, `settlement/`, `cartera-core.ts` | `cuentas-a-cobrar`, `cuentas-a-pagar` |
| Stock e inventario | `lib/stock/` (el ledger es `stock/ledger.ts`), `inventario/`, `inventory/`, `carniceria/`, `multilocal/` | `inventario`, `despiece`, `lotes`, `ajustes/recuento`, `locales` |
| Compras y proveedores | `lib/stock/purchase-core.ts`, `suppliers/`, `devoluciones/`, `stock/supplier-return.ts` | `compras`, `proveedores`, `devoluciones-proveedor` |
| Fiscal (ARCA) | `plugins/arca/` (domain, afip/soap.ts), `lib/fiscal.ts`, `fiscal/`, `invoice-core.ts`, `invoice-from-order.ts`, `invoice-from-appointment.ts`, `invoice-from-mp.ts`, `arca-dispatch.ts` (outbox: `processArcaOutbox` sólo el cron, `procesarEnviosDelNegocio` el panel), `arca-reserva.ts` (toma con reserva, acceso del operador), `facturita-actions.ts`, `libros/` | `facturacion`, `libros`, `retenciones`; cron `api/cron/arca-outbox` |
| Plata (redondeo) | `lib/dinero/redondeo.ts`: la única regla de redondeo (medio centavo hacia arriba, 15 cifras; ENG-109). `lib/round.ts` (`round2`) delega; la usan `fiscal.ts`, el plugin ARCA (`soap.ts`, `validacion.ts`, `comprobante.ts`; DEC-011), `libros/csv-ar.ts`, `caja/libro-csv.ts`, `invoice-core.ts` y el cupón (`venta-reglas.ts` `montoDeCupon`, `cupones/cupon-de-reserva.ts`). `fiscal/decidir-comprobante.ts` (núcleo de otro frente) NO la usa: redondea por su cuenta con `toFixed(2)`; la decisión y el envío cuentan los mismos centavos SÓLO porque `validacion.ts` rechaza importes con más de 2 decimales y exige neto y total exactos (DEC-012): aflojar esa validación rompe la garantía |  |
| Bancos | `plugins/bancos/`, `lib/bancos-actions.ts`, `bancos-glue.ts` | `facturacion/bancos` |
| Mercado Pago y pagos | `plugins/mercadopago/`, `plugins/pagos/`, `lib/mercadopago-*.ts`, `pagos-dispatch.ts` | `api/webhooks/mercadopago` |
| Negocios, sesión y permisos | `proxy.ts`, `lib/tenant.ts`, `tenant-scope.ts`, `tenant-context.ts`, `rls.ts`, `db.ts`, `prisma-base.ts`, `operator-db.ts`, `auth.ts`, `auth-actions.ts`, `session.ts`, `authz.ts`, `capabilities.ts`, `operator-auth.ts`, `rate-limit.ts`, `provisioning/` | `admin/login`, `operador/login` |
| Configuración por rubro | `blueprints/`, `modules/`, `apps/`, `cambios/`, `tenants/` | `operador/(console)/tenants/[id]` |
| Clientes (CRM) | `lib/crm/`, `clientes/` | `clientes`, `campania` |
| Reportes | `lib/reports/`, `report-*.ts`, `apps/kpis/` | `reportes`, `resultado`, `inicio` |
| Contador | `lib/cartera-actions.ts` | `contador/` |
| Auditoría | `lib/audit-core.ts` (modelo `AuditLog`), `audit-retention.ts` | `auditoria` |
| Logs | `lib/logger.ts` (JSON a stdout), `request-context.ts` | — |

## 4. Entradas

- HTTP: `src/proxy.ts` → App Router (87 `page.tsx`) y route handlers (16 `route.ts`).
- Server Actions: 47 archivos `"use server"` con 205 exports (203 son `export async function`;
  comando: `grep -rhE "^export (const|async function|function)" $(grep -rlE "^['\"]use server['\"]" src) | wc -l`).
- Cron (Vercel): `/api/cron/reminders` a las `0 12 * * *` y `/api/cron/arca-outbox` a las `0 6 * * *` (`vercel.json:8-17`).
- Webhook: `/api/webhooks/mercadopago`.
- API pública: `/api/public/v1/orders` y `/api/public/v1/orders/[code]`.
- Scripts: `scripts/provision-tenant.ts`, `scripts/vercel-build.mjs`, `prisma/seed.ts` (`npm run seed`), `prisma/seed-qa-tenants.ts`.

## 5. Cómo se aísla un negocio de otro (el camino de una consulta)

1. `src/proxy.ts` resuelve el negocio por host (`src/lib/tenant.ts`). En producción con más de
   un negocio está prohibido fijarlo con `FORCE_TENANT_SLUG` (`tenant.ts:199-216`).
2. Las acciones usan `prisma` de `src/lib/db.ts`, que es uno de dos clientes según
   `RLS_ENFORCEMENT` (`db.ts:29-31`). Encendido: `rlsPrisma` envuelve cada operación suelta en
   una transacción que setea el GUC del negocio y le aplica el candado adentro
   (`scopeTxClient`, `rls.ts:84-88`). Apagado: `withTenantScope(basePrisma)`
   (`tenant-scope.ts:147`), que agrega `tenantId` al `where` con `scopeArgs` (`tenant-scope.ts:83`).
   En las dos ramas corre el candado de aplicación; RLS sólo en la primera.
3. `tenantTransaction` (`rls.ts:117-159`) agrupa varias escrituras en una transacción con el GUC.
4. Hay dos caminos que saltan el candado: `basePrisma` (15 archivos lo importan, casi todos sobre
   `Tenant`) y `operatorPrisma` (16 archivos lo importan; otros 11 sólo lo nombran en comentarios).
   `operatorPrisma` salta RLS **sólo si `OPERATOR_DATABASE_URL` apunta al rol dueño** o a uno con
   BYPASSRLS; si la variable falta, usa `DATABASE_URL` (`operator-db.ts:21`), que en producción es
   `app_rls`, y entonces no ve nada de ningún negocio. Qué tiene Vercel: sin medir (ENG-204). El
   drenaje del outbox de ARCA usa `operatorPrisma` y se llama también desde acciones del negocio:
   con el rol dueño procesa envíos de otros negocios (ENG-012); sin la variable no ve ningún
   pendiente (ENG-027).
5. RLS no viaja en las migraciones: `prisma/rls/0001_enable_rls.sql` y `0002_app_role.sql`
   se corren a mano después de `migrate deploy`. Una base nueva creada sólo con migraciones
   queda con 1 de 44 tablas protegidas (ver BACKLOG ENG-102).

## 6. Cómo se corre verify hoy

**Requisito:** `prisma generate` (lo corre `postinstall`). Sin `src/generated/prisma`, `tsc` da
723 errores y `npm test` 68 fallas (medido en la copia sin generar).

**Local:** `npm run gates` corre `scripts/verify-gates.mjs`, que ejecuta en orden:

| Valla | Comando | ¿Bloquea? |
|---|---|---|
| tipos | `npx tsc --noEmit` | sí |
| lint | `npm run lint` (`eslint`) | **no** (`verify-gates.mjs:48`, `blocking: false`) |
| tests | `npm test` | sí |
| RLS estático | `node prisma/rls/check-coverage.mjs` (todo modelo con `tenantId` figura en el SQL de RLS) | sí |
| build | `npm run build` | sí |
| render | `npm run gate:visual` (5 rutas a 1280 y 390 px) | sí |
| contraste/toque/desborde | `npm run gate:visual:aa` | sí |

**CI:** `.github/workflows/gates.yml`, un job por valla en cada push y PR, Node 20 salvo `tests`.
`lint` con `continue-on-error: true` (`gates.yml:42`). Desde ENG-000 el job `tests` corre con
Node 22 (con Node 20 `node --test "src/**/*.test.ts"` no expande el patrón y sale "Could not find"
sin correr nada: `.qa/ENG-000/npmtest-node20-como-ci-antes.txt`), levanta un servicio Postgres 16,
instala Chromium y falla si la salida no dice `# skipped 0` o si queda alguna base `erp_test_`.
Resultado en GitHub Actions: sin medir hasta el primer push.

**Tests que usan base:** 8 archivos, 14 tests, cada uno con su base efímera
(`src/test/base-efimera.ts`, ENG-000): `src/test/base-efimera.test.ts`,
`src/test/accion-de-servidor.test.ts`, `src/cambios/interruptores-escritura.test.ts`,
`src/lib/reintento-de-venta-postgres.test.ts`, `src/lib/pg-begin-con-negocio-postgres.test.ts`,
`src/lib/tenant.test.ts`, `src/lib/seed/seed-postgres.test.ts`, `src/lib/vercel-build.test.ts`. El
servidor es `ERP_TEST_PG_URL` (por defecto el local de `/tmp/pgrun`). Sin servidor se saltean fuera
de CI y fallan en CI. Server Actions reales con sesión: `src/test/accion-de-servidor.ts`.

**Tests que usan navegador:** 5 archivos de componentes en Chromium
(`src/app/admin/(dashboard)/caja/caja-teclado.test.ts`, `pie-pegado-zona-segura.test.ts`,
`vender/vender-pantalla.test.ts`, `ajustes/recuento/recuento-pantalla.test.ts`,
`src/lib/stock/alta-producto.test.ts`). Buscan el navegador en `PLAYWRIGHT_BROWSERS_PATH` o
`/opt/pw-browsers` y, si no está, se saltean (`caja-teclado.test.ts:77-93`): 67 de sus 77 tests.

**Fuera de verify:** `prisma/rls/check-rls-live.mjs`, `prisma/rls/aislamiento-suite.mjs` y
`npx tsx prisma/rls/aislamiento-capa-app.ts` (aislamiento funcional);
`scripts/qa/arca-emision-e2e.mjs` (emisión simulada sobre PGlite con RLS apagado);
`npm run medir:neon` (estado de Neon, sólo con autorización del dueño).

## 7. Qué le falta a verify para cumplir el estándar

| Falta | Sección | Slice |
|---|---|---|
| ~~Postgres efímero para los tests de integración, en local y en CI, con RLS y `app_rls` aplicados; Chromium instalado en el job `tests`~~ hecho; falta leer el primer run de CI | §3 | ENG-000 |
| Plantilla de aislamiento A/B que ejecute cada acción real, dentro de `npm test` | §3 | ENG-016 |
| Tests de concurrencia contra la base (último ítem, numeración fiscal, correlativos) | §2 | ENG-106 |
| `npm audit --omit=dev --audit-level=high` bloqueante | §4 | ENG-120 |
| Escaneo de secretos en pre-commit y en CI | §4 | ENG-120 |
| Lint bloqueante con 0 warnings y formatter en modo check | §6 | ENG-301 |
| Umbral de cobertura de dominio (funciones ≥ 90 %) sobre una lista versionada de módulos de dominio | §3 | ENG-130 |
| Suite E2E de flujos críticos con Playwright a 1440 y 390 px, fallando por errores de consola | §3 | ENG-131 |
| Prueba de reversa de migraciones (subir, bajar, subir) contra una base efímera con seed | §2 | ENG-101 |
| Chequeo de presupuestos de performance (p95, bundle, LCP) sobre `next start` con seed realista | §5 | ENG-201, ENG-202 |
| Misma versión de Node en local y en CI (`engines` + `.nvmrc`) | §6 | ENG-301 |
| Los scripts que producen los números de `HEALTH.md` viven en el repo | §8 | ENG-203 |
