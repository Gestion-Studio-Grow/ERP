# Gate de Excelencia — frente «facturación automática» · Plataforma, publicación y mantenimiento

**Rama:** `claude/facturacion-automatica-plataforma` (desde `origin/claude/facturacion-automatica`).
**Alcance:** pipeline (`.github/workflows/release.yml` + heap en `gates.yml`), tren de releases
(`scripts/release/**`, scripts en `package.json`), flags por negocio (`src/lib/flags/**`), monitoreo
(`src/app/api/health`, `src/app/api/ready`), runbooks (`docs/runbooks/facturacion/**`), checklist
(`docs/release/**`), `CHANGELOG.md`. **Sin** migraciones, **sin** dependencias nuevas, **sin** tocar Neon,
Vercel ni variables de entorno. Nada a `main`.

## Calibración (ADR-052) — principios que guiaron las decisiones · zona ESTÁNDAR (ADR-046)

- **Push a `main` = deploy.** El tren **prepara**; publicar, migrar (Gate 2), cargar secretos y crear/pushear
  tags son del dueño. Ningún script de este frente pushea, publica ni toca una base.
- **Neon free es un presupuesto.** `/api/health` sigue sin tocar la base; el semáforo ARCA vive en
  `/api/ready`, mide sólo con la facturación encendida, uno por negocio y cacheado 2 min.
- **RLS no se evade ni para medir.** El motor se mide parado en cada negocio (`tenantTransaction`), igual que
  el cron; la respuesta es agregada, sin ids, slugs, CUIT ni textos de ARCA.
- **Default OFF y reversible sin datos.** Flags apagados por defecto, doble llave con la global, sin comodín
  (lección de `APPS_INICIO`), sin migración.
- **Sin dependencias, lógica pura testeada.** Núcleos puros (`lib.mjs`, `facturacion.ts`, `motor-arca.ts`)
  con tests; los CLI sólo leen git/disco/HTTP.

## 1. 🔎 Auditoría SAP Fiori (7 ángulos) + ángulo argentino

- [x] **Rol-based** — cada pieza tiene su lector: soporte de primer nivel (`soporte.md`), guardia
      (`incidentes.md`, `rollback.md`), dueño (`CHECKLIST-RELEASE.md`, `monitoreo.md`).
- [x] **Coherente** — reusa `logger`, `withRequestId`, `tenantTransaction`, `idsDeLosNegocios`, el patrón
      truthy/PURO de `src/modules/flags.ts` y el trinquete de los tests del repo.
- [x] **Simple** — un comando (`release:preparar`) deja el reporte; el dueño dice «deployá».
- [x] **Adaptable** — N/A UI: no hay pantallas nuevas. El smoke admite `--modo preview`.
- [x] **Delightful / enterprise** — reporte con semáforo por paso y veredicto; mensajes de error con «cómo se arregla».
- [x] **Accesibilidad** — N/A: no hay UI nueva (sólo endpoints JSON, CLI y docs).
- [x] **Consistencia** — no duplica: `gates.yml` sigue siendo la valla de código; `release.yml` suma sólo lo del tren.
- [x] **🇦🇷 Argentino** — soporte en criollo y sin jerga; fiscal ARCA (CAE, FECompConsultar, nota de crédito,
      RG 5616, punto de venta WS); canal WhatsApp-first en soporte.

## 2. 🏷️ Sello de marca GSG

- [x] Docs firmados «— Elaborado por GSG (Plataforma, publicación y mantenimiento)».
- [x] Commits con trailer del equipo (`Co-Authored-By: Claude Opus 5.5`).
- [x] App: el chequeo `gate:sello` **verifica** `metadata.generator` en el backoffice de la suite (19
      pantallas). Encontró **2 sin sello** (`admin/(dashboard)/facturacion/page.tsx` y `…/comprobante/[id]/page.tsx`):
      quedan como deuda conocida en el trinquete (no son archivos de este frente); cualquier pantalla nueva sin
      sello frena el CI.

## 3. Excelencia Arquitectura

- [x] **Capas** — núcleo puro / adaptador de servidor / ruta, separados (`motor-arca.ts` vs `.server.ts` vs `route.ts`).
- [x] **Testabilidad** — 11 tests de flags, 12 del motor ARCA (con seams de deps, sin base), 14 del tren.
- [x] **Multi-tenant** — medición por negocio con `tenantTransaction` (predicado `tenantId` en cada SELECT además del GUC).
- [x] **Seguridad / RLS** — nada evade RLS; `/api/ready` ya no devuelve el mensaje crudo del error de base
      (podía traer host/rol): va al log. `/api/health` expone `cronProtegido` (booleano), nunca el secreto.
      `release.yml`: permisos `contents: read`, ningún `secrets.`, URLs del evento por `env:` (sin inyección).
- [x] **Deuda anotada** — ver «Pendientes».

## 4. Confiabilidad de Producción

- [x] **tsc** `--noEmit` verde (6 GB de heap).
- [x] **tests** — suite completa: 5817 tests, 5809 pass, 8 fail, 0 skipped. Los 8 son **ajenos y previos**:
      ninguno importa archivos de este frente: los `*-postgres` y el de KPIs con pool necesitan Postgres
      (`ERP_TEST_PG_URL`, no disponible en esta sesión), 2 son de pantalla en navegador, 1 es el trinquete de
      redondeos (archivos del club) y 1 busca una clase en `admin/(dashboard)/layout.tsx`. Un noveno rojo aparente (`guardia-bundle-cliente`)
      era contaminación de la caché de `tsx` con otro worktree: con `TSX_DISABLE_CACHE=1` pasa.
      `test:release` 14/14.
- [x] **build** — `next build` verde (6 GB de heap); `/api/health` y `/api/ready` dinámicas.
- [x] **Smoke local** contra `next start` sin base: health 200 con el bloque `arca` (marcó «sin CRON_SECRET» y
      1 error de flags por el `*`, como debe), ready 503 `db-unreachable` sin filtrar el error, `/facturita` 200,
      `/contador` 307 → login. Sin base, `/admin/login` da 500: esperado en local.
- [x] **Aislamiento** — sin lecturas cross-tenant; respuesta agregada.
- [x] **Manejo de errores** — la medición ARCA nunca tumba `/api/ready` (techo 5 s, negocios que fallan se cuentan).
- [x] **No rompe prod** — sin schema, sin migraciones, sin env nuevas obligatorias, `vercel-build.mjs` intacto.
      `/api/ready` sigue 200/503 como antes (el semáforo ARCA rojo **no** saca la instancia de servicio).
- [x] **YAML** de los 3 workflows parseado OK.

## Pendientes (decisiones y pedidos a otras células)

1. **Interruptores (célula dueña de `src/cambios/`):** sumar `facturacion.automatica`,
   `facturacion.lote-mensual`, `facturita.pwa`, `arca.produccion` al catálogo de interruptores de la consola
   y leerlos como fuente de `decidirFlag`; retirar `FACTURACION_FLAGS`. Hasta entonces la fuente es la variable.
2. **Consumidores de los flags (células de facturación/Facturita/ARCA):** cablear `flagActivo(...)` en los
   caminos de emisión automática, lote mensual, manifiesto PWA y selección de modo ARCA por negocio. Sin eso
   prender un flag no cambia nada (MP-13).
3. **Plantilla de PR (`.github/PULL_REQUEST_TEMPLATE.md`, fuera de este frente):** hoy tiene 3 bloques; el
   job `gate-pr` exige los 4 (falta «Sello de marca GSG»). Reemplazarla por la de `CHECKLIST-RELEASE.md §2`.
4. **Sellar** las 2 pantallas de `admin/(dashboard)/facturacion` y sacarlas de `DEUDA_CONOCIDA`.
5. **Dueño:** branch protection en `main` exigiendo `gates` + `release/tren` + `release/gate-pr`; alertas de
   `monitoreo.md`; decidir cuándo crear el primer tag `v0.x`.

— Elaborado por GSG (Plataforma, publicación y mantenimiento)
