# HEALTH: salud técnica

**Cierre:** línea base de la auditoría del estándar · commit `3a96b52` · 2026-09-24, corregida
después de la refutación del mismo día.
**Tendencia:** línea base en todos los rubros (es el primer cierre; no hay uno anterior con qué comparar).

Cada número lleva el comando que lo produce. "Sin medir" dice qué falta y qué slice de
`BACKLOG.md` lo habilita.

**Dónde se midió.** Sobre una copia limpia del commit con `prisma generate` y bases temporales
propias (`erp_aud_*`), con dos excepciones: la corrida de `npm test` sin `prisma generate` no
redirigió las variables de base y escribió dos veces en `erp_qa_apps` (`$AUD/npmtest-base-asis.txt:2765`
y `:10432`, ver ENG-000); y la referencia de performance de §4.1 y §4.3 se midió con `next dev`
sobre `erp_lab` (`$AUD/../perf/levantar-perf.sh:9-10`). Ninguna salida de la auditoría muestra una
conexión a Neon o a Vercel (`grep -rlE "neon\.tech"` sobre los `.txt`, `.out`, `.log` y `.json` de
`$AUD` y `$AUD/../perf` = 0 archivos).

`$AUD` = `/tmp/claude-0/-home-user-Factory-GSG/12bc8dd5-60d3-5e22-95c1-3816d17ad0a9/scratchpad/auditoria-ingenieria`:
scripts y salidas de la auditoría. Es una carpeta temporal: si se limpia, ningún número de este
archivo se puede volver a verificar. Por eso ENG-203 (llevar los scripts al repo) va inmediatamente
después de ENG-000 (DECISIONS.md DEC-010). Los comandos de la corrección están en
`$AUD/correccion/comandos.txt`.

---

## 0. Cierres después de la línea base

| Slice | Cierre | Evidencia | Tendencia |
|---|---|---|---|
| ENG-000 · arnés de integración (base efímera y Server Action real con sesión) | construido 2026-09-25; criterio 1 (log de CI) sin medir | `.qa/ENG-000/`: `npm test` 3.527 tests, 0 saltados (antes, con base y Chromium local: 3 saltados), las mismas 14 fallas previas; igual con `CI=true` por TCP; 0 bases `erp_test_` al terminar; 8 archivos y 14 tests contra su propia base; 1 Server Action real con sesión | Tests saltados en local: mejor (3 → 0); en CI: sin medir |
| ENG-001 · el seed no borra datos de negocios reales | 2026-09-24 | `.qa/ENG-001/`: 10 tests nuevos en verde (9 dentro de la suite completa `npm test` (3.493 tests, 14 fallas previas y ajenas: Caja en el navegador ×8, pies pegados ×2, xlsx ×4); y 1 agregado después en `tests-seed.txt`); mutación con el seed viejo: el otro negocio pasa de 1 box y 2 clientes a 0 | Deuda ALTA: mejor (27 → 26) |
| ENG-012 · cada negocio procesa sólo sus envíos a ARCA | 2026-09-25 (integración D1-D4) | `.qa/ENG-019-012-027/`; hoy `.qa/D1-D4/tests-de-los-cerrados.txt`: `arca-envios-por-negocio-postgres` 2 de 2 (Server Action real, Postgres con RLS); criterio 1: `processArcaOutbox` sólo lo llama `api/cron/arca-outbox/route.ts:39` (`.qa/D1-D4/eng012-criterio1-grep.txt`) | Deuda ALTA: mejor (26 → 25) |
| ENG-027 · sin conexión del operador, el procesador de ARCA avisa | 2026-09-25 (integración D1-D4) | `.qa/ENG-019-012-027/`; hoy `arca-procesador-sin-operador-postgres` 3 de 3 | Deuda ALTA: mejor (25 → 24) |
| ENG-022 · comprobante autorizado inmutable en la base | 2026-09-25 en el código; **la migración no está aplicada en Neon** (la aplica el dueño) | `.qa/ENG-022/` y `vuelta2/`: rojo sin la migración 4 de 5, mutaciones M1-M7 en rojo (M8 sobrevive, documentada), reversa probada en base efímera; hoy `comprobante-autorizado-inmutable-postgres` 6 de 6 | Deuda ALTA: mejor en el código (24 → 23); en producción igual hasta aplicarla |
| ENG-023 · anular una venta facturada no deja la factura viva (criterio 1; el 2 viaja con R4-F2) | 2026-09-25 (integración D1-D4) | `.qa/COMPROBANTE/eng023-*`: con la regla apagada 2 de 2 en rojo; hoy `anular-venta-facturada-postgres` 2 de 2, `facturar-venta-anulada-postgres` 3 de 3, `facturar-turno-con-cobro-anulado-postgres` 3 de 3, `factura-viva` 8 de 8 | Deuda ALTA: mejor (23 → 22) |
| ENG-316 · la letra del comprobante coincide con la condición de IVA del receptor | 2026-09-25 (integración D1-D4) | `.qa/COMPROBANTE/rojo-antes.txt`, `verde-1.txt`; hoy `tipo-segun-la-rg` 28 de 28 | Deuda BAJA: mejor (1 menos) |
| Suite completa al integrar D1-D4 | 2026-09-25 | `.qa/D1-D4/npm-test-resumen.txt`: 3.982 tests, 3.977 pasan, 0 saltados, 5 fallas: xlsx ×4 (previas) y 1 nueva, la guarda de redondeos a mano (`redondeos-locales.test.ts`) que marca dos pantallas del rediseño sin commit (`caja/CajaRenglon.tsx:51`, `locales/LocalesRenglon.tsx:52`); 0 bases `erp_test_` al terminar; `tsc` 0 errores; eslint 0 sobre 115 archivos de D1-D4; `paridad-menu` 4 de 4 | Fallas: mejor (14 → 5; Caja en el navegador ×8 y pies pegados ×2 ya pasan), pero con 1 falla nueva que es del rediseño |
| Integración vender-1 (R0-F1, R1-F5, R2-F4, R2-F5, R3-F1, R3-F3) | 2026-09-25, sin commit ni deploy; las migraciones siguen sin aplicar en Neon | `.qa/vender-1/integracion/`: `npm test` 4.251 tests, 4.247 pasan, 0 saltados, 4 fallas previas (xlsx con el stub local); tsc 0 errores; eslint 0 sobre los 11 archivos tocados; paridad-menu 4 de 4; tope del plan en Bancos: regla vieja 1 rojo, nueva 2 de 2; facturarOrden: código viejo 4 de 6 en rojo, nuevo 6 de 6; trinquete guardia-negocio 4 de 6 → 6 de 6 | Tests: mejor (3.982 → 4.251; fallas 5 → 4) |
| **No cierran** (quedan abiertos con evidencia parcial) | — | ENG-000 (falta el log del job `tests` en CI), ENG-011 (plan D1 con 6 objeciones abiertas y método de migración sin OK del dueño), ENG-019 (criterio 3: cron cada 15 min pide plan de Vercel), ENG-020 y ENG-021 (falta el test de `invoice-core.ts:219-227`: la mutación sobrevive), ENG-024 (criterio 1 en Facturita, bancos y API externa pide la migración de ENG-326), ENG-109 (unidad del cupón y 53 redondeos a mano) | igual |

## 1. Deuda abierta

**Lo más grave:** ENG-002 · cerrar el turno de caja dos veces seguidas asienta el ajuste de arqueo
dos veces (15 a 19 de 20 corridas, `src/lib/caja-actions.ts:216-268`): un faltante de $100 queda en
el libro como $200. Detalle y criterios en `BACKLOG.md`.

*Cerrado (ENG-001):* `npm run seed` borraba pagos, turnos, clientes, productos y servicios de todos
los negocios con el rol dueño. Ahora se niega con cualquier base que no sea un Postgres local, borra
sólo el negocio de muestra y lo hace en una transacción (`prisma/seed.ts`, `src/lib/seed/`).

| Severidad | Slices abiertos | Hallazgos antes de deduplicar | Tendencia |
|---|---|---|---|
| ALTA | 22 (ENG-002 a ENG-027 menos ENG-012, 022, 023 y 027) + 1 habilitante (ENG-000) | 33 | mejor (26 → 22 el 2026-09-25; ENG-022 falta aplicarlo en Neon) |
| MEDIA | 35 (ENG-101 a ENG-135) | 87 | línea base |
| BAJA | 10 (ENG-301 a ENG-310) | 29 | línea base |
| Habilitan mediciones | 5 (ENG-201 a ENG-205) | — | línea base |

ALTA por grupo: pérdida o alteración de datos 11 (ENG-001 a 011), seguridad 7 (ENG-012 a 018),
fiscal 8 (ENG-019 a 025 y ENG-027), plata en reportes 1 (ENG-026). ENG-027 salió de la refutación:
si falta `OPERATOR_DATABASE_URL`, el procesador de envíos a ARCA no ve ningún pendiente. Ya
planificados en el backlog de lanzamiento y referenciados: ENG-017 (R5-F4), ENG-019 (R7-F1),
ENG-023 (R4-F2), ENG-024 (R0-F4, R1-F5, R2-F2).

## 2. Tests

### 2.1 Resultado de la suite

| Corrida | Tests | Pasan | Fallan | Saltean | Duración | Salida |
|---|---|---|---|---|---|---|
| `npm test` con base temporal y Chromium local | 2.980 | 2.973 | 4 | 3 | 88 s | `$AUD/npmtest-gen-condb.txt` |
| `npm test` sin base, con Chromium local (`/opt/pw-browsers`) | 2.980 | 2.967 | 4 | 9 | 69 s | `$AUD/npmtest-gen-sindb.txt` |
| `npm test` como el job `tests` de CI: sin base y sin Chromium | 2.980 | 2.900 | 4 | **76** | 49 s | `$AUD/correccion/npmtest-como-ci.txt` |
| `npm test` sin `prisma generate` | 2.304 | 2.231 | 68 | 5 | 125 s | `$AUD/npmtest-base-asis.txt` |

- Las 4 fallas son `src/plugins/bancos/parser/xlsx.test.ts` y un extracto XLSX: en este entorno
  `node_modules/xlsx` es un reemplazo local porque el CDN de SheetJS está bloqueado. Resultado real
  de esos 4: **sin medir** (hace falta el tarball real; R0-F1 lo pasa a `vendor/`).
- Con base se saltean 3, todos de `vercel-build.test.ts` (faltan `PREVIEW_TEST_PROD_URL` y
  `PREVIEW_TEST_QA_URL`). Sin base se saltean 9: esos 3, 2 de `PREDEPLOY_TEST_DATABASE_URL` y 4 que
  buscan Postgres local (interruptores, reintento de venta y 2 de `tenant.test.ts`).
- **En CI se saltean 76**: los 9 de la base más 67 de los 5 archivos de componentes que corren en
  Chromium. El job `tests` (`.github/workflows/gates.yml:65-75`) corre `npm ci` y `npm test` sin
  `npx playwright install`; sólo lo instalan `visual` (`:126`) y `visual-aa` (`:151`), y `npm ci` no
  baja navegadores (`node_modules/playwright/package.json` 1.61.1 no tiene `scripts`). Sólo esos 5
  archivos: `PLAYWRIGHT_BROWSERS_PATH=/nonexistent-pw node --import tsx --test <los 5>` → 77 tests,
  67 saltados (`$AUD/correccion/chromium-ausente.txt`). La corrida "como CI" usa Node 22; CI usa
  Node 20. El log real de GitHub Actions: sin medir (ENG-000).
- **Medido después (ENG-000):** con Node 20, `npm test` no corre ningún test: `node --test` recién
  expande `"src/**/*.test.ts"` desde Node 21 y sale "Could not find '/home/user/erp/src/**/*.test.ts'"
  con código 1 (`/opt/node20/bin/node` 20.20.2, `.qa/ENG-000/npmtest-node20-como-ci-antes.txt`). El
  job `tests` pasó a Node 22, con Postgres y Chromium.
- Tests desactivados (`test.skip`, `.only`, `.todo`): 0 (`grep`).

### 2.2 Por tipo

Comando: `python3 $AUD/clasificar-tests.py` desde la raíz del repo (salida `$AUD/clasificar-tests.out`;
cada archivo cuenta en la primera categoría que coincide).

| Tipo | Archivos | Declaraciones `test()` |
|---|---|---|
| Unitarios de funciones puras | 208 | 1.890 |
| Con dobles de la base (base falsa en memoria) | 41 | 524 |
| "De forma": leen el código fuente como texto | 35 | 421 |
| Componentes en Chromium con acciones falsas (sin app ni base); en CI se saltean | 5 | 75 |
| Integración contra Postgres real | 4 | 51 (6 tests tocan la base) |
| E2E contra la app corriendo | 0 | 0 |
| **Total** | **293** | **2.961** |

- Tests que ejecutan una Server Action real: **0 de 205** (ningún `*.test.ts` importa y ejecuta un
  módulo `"use server"`; `$AUD/tenancy-auth/actions-guards.tsv`). Después de ENG-000: **1 de 205**
  (`getClients`, `src/test/accion-de-servidor.test.ts`); la plantilla para el resto es ENG-016.
- Tests con escrituras simultáneas contra Postgres: **0** (ninguno de los 4 de integración usa
  `Promise.all`).
- Tests que cuentan consultas (detección de N+1): **13 archivos, todos contra un doble de la base**
  (por ejemplo `src/lib/stock/costo.test.ts:79`, `src/lib/multilocal/kpis-locales.test.ts:86`,
  `src/lib/clientes/ficha-por-telefono.test.ts:69`, `src/apps/kpis/loaders.test.ts:123`); contra
  Postgres real, **0**. Comando:
  `grep -rnE "assert[.a-zA-Z]*\((consultas|llamadas)\.length|assert[.a-zA-Z]*\([^)]*(consultas|llamadas)\.length *(<=|<|===|==)|consultasDeCosto, [0-9]" src --include=*.test.ts | cut -d: -f1 | sort -u | wc -l`
  (líneas en `$AUD/correccion/tests-cuentan-consultas.txt`). `src/lib/caja/cierre-diario.test.ts`
  no cuenta consultas: su "N+1" es el día siguiente (`:416`).

### 2.3 Cobertura de dominio

Cobertura de toda la suite (en la copia con `prisma generate`):
`node --enable-source-maps --import tsx --test --experimental-test-coverage --test-coverage-include='src/**/*.ts' --test-coverage-exclude='**/*.test.ts' --test-reporter=lcov --test-reporter-destination=cov.lcov "src/**/*.test.ts"`
(salida `$AUD/cov.lcov`). Lista de dominio, desde la raíz del repo:
`node $AUD/correccion/lista-dominio.mjs > dominio.txt` (304 archivos; el criterio está en el
encabezado del script y en `DECISIONS.md` §3). Resumen: `node $AUD/lcov-resumen.mjs $AUD/cov.lcov dominio.txt`.

| Métrica | Valor | Umbral §3 |
|---|---|---|
| **Funciones del dominio** (272 de 304 módulos cargados) | **81,9 %** (3.182 / 3.884) | ≥ 90 % · no cumple |
| Ramas del dominio | 90,2 % (8.430 / 9.349) | — |
| Líneas del dominio (Node cuenta comentarios: inflado) | 97,4 % (39.817 / 40.900); contando los no cargados en 0 %: 92,6 % | — |
| Módulos de dominio que ningún test carga | 32 de 304 | 0 |
| Todo `src` cargado (364 archivos) | funciones 79,4 % (4.428 / 5.577), ramas 89,8 % (11.661 / 12.984) | — |

La primera versión daba 81,7 % sobre una lista heurística de 303 archivos (`$AUD/puros-candidatos.txt`)
que no tenía comando que la generara; se reemplazó por la lista reproducible (DEC-009).

Por contexto, funciones / ramas del dominio. Comando:
`node $AUD/correccion/cobertura-por-contexto.mjs $AUD/cov.lcov dominio.txt` (las regex por ruta
están en el script; un archivo puede contar en dos contextos; salida `$AUD/correccion/cobertura-por-contexto.out`):
fiscal 77,1 % / 87,5 % (29 módulos); bancos 69,2 % / 90,7 % (13); compras y proveedores 92,2 % /
91,8 % (5); negocios y sesión 80,5 % / 89,8 % (23); stock 90,7 % / 91,0 % (16); caja 88,8 % /
93,1 % (21); ventas 89,6 % / 92,1 % (14); `plugins/*/domain` 90,7 % / 92,0 % (10).

Peores módulos del dominio por líneas (20 líneas o más;
`TOP=12 node $AUD/correccion/lcov-por-archivo.mjs $AUD/cov.lcov dominio.txt`): `src/blueprints/servicios.ts`
23,8 % (15 / 63, funciones 1 / 3); `src/plugins/mercadopago/ingest.ts` 39,7 % (58 / 146, funciones
1 / 9); `src/plugins/arca/handler.ts` 52,1 % (38 / 73, funciones 1 / 6). `src/lib/booking-core.ts`
no está en la lista de dominio (importa `prisma` en `booking-core.ts:6`): 62,6 % de líneas (97 / 155),
funciones 6 / 10; la regla anti-sobreturno `assertSlotAvailable` se ejecuta 4 veces (FNDA:4, desde
`src/lib/rechazo-de-dominio.test.ts:122` y `:130`) y `getWorkingWindow`, 0.

Capa de aplicación (las Server Actions): `authz.ts`, `require-app.ts`, `auth-actions.ts`,
`change-password-actions.ts`, `order-actions.ts`, `coupon-actions.ts` y `external-orders.ts` no
aparecen en `$AUD/cov.lcov` (`grep -c "^SF:src/lib/<archivo>$"` = 0 en los 7); en tesorería, 14 de
21 archivos de aplicación tampoco.

### 2.4 E2E

| Métrica | Valor |
|---|---|
| **Flujos críticos cubiertos / total** | **0 / 10** (lista provisional en `DECISIONS.md` §3) |
| Lo que existe | `scripts/qa/visual-smoke.mjs:57-99`: 5 rutas renderizadas a 1280 y 390 px, sin revisar la consola (`grep "on('console'\|pageerror"` = 0); `scripts/qa/arca-emision-e2e.mjs`: emisión simulada sobre PGlite, sin navegador y con RLS apagado |

Habilita la métrica: ENG-131.

### 2.5 Concurrencia medida por la auditoría (fuera del repo)

Contra Postgres con `app_rls` y RLS encendido. Ninguno de estos casos tiene test en el repo (ENG-106).

| Caso | Resultado | Comando |
|---|---|---|
| 10 ventas simultáneas del último ítem | 1 pasa, 9 rechazadas, stock 0 | `$AUD/copia/scripts/aud/concurrencia-ventas.mts` |
| Cupón de 1 uso, 10 a la vez | 1 pasa, `usedCount` 1 | ídem |
| 10 y 20 altas simultáneas de pedidos | 28 % y 45 % fallan por choque de número | `N=10 RONDAS=5 node --import tsx scripts/aud/correlativo.mts` |
| Dos cierres de caja a la vez, series de 20 corridas | **de 15 a 19 de 20** asientan el ajuste dos veces (5 series: 15; 19 en la refutación; 18, 19 y 19 en la corrección). El resultado cambia entre series. El script copia el cuerpo de `closeCashSession` (`caja-actions.ts:216-268`), no ejecuta la acción real, que necesita la sesión de Next | `BARRERA=0 CORRIDAS=20 node --import tsx auditoria/carrera-cierre-turno.mts` en `$AUD/copia-tesoreria` (`$AUD/correccion/carrera-cierre-turno-3x20.out`) |
| Mismo envío a ARCA procesado dos veces, 50 corridas | **15 de 50** con 2 CAE para 1 factura | `AUD_N=50 npx tsx $AUD/aud-arca-concurrencia.ts` |
| Envíos a ARCA con reserva (ENG-019, 2026-09-25): 4 procesos de Node a la vez sobre 12 pendientes de dos negocios, 3 series; y 50 iteraciones de 2+1 ventas con 3 despachos a la vez | **12 CAE por serie, 0 de más, 0 fallidos, números de ARCA = base** en las 3 series (3 vueltas del archivo); **50 de 50** iteraciones sin CAE de más. Mejor que la línea de arriba (15 de 50), contra el simulador | `node --import tsx --test src/lib/arca-envios-concurrencia-postgres.test.ts` (`.qa/ENG-019-012-027/tests-vuelta*.txt`, `series-procesos.json`) |
| Acción de un negocio sobre envíos de otro (ENG-012) y procesador sin conexión del operador (ENG-027), 2026-09-25 | A no toca ni cuenta los de B (Server Action real, operador = rol dueño); sin `OPERATOR_DATABASE_URL`: error de configuración, cron 500, `/api/ready` 503 | `src/lib/arca-envios-por-negocio-postgres.test.ts`, `src/lib/arca-procesador-sin-operador-postgres.test.ts` |
| Reserva del mismo horario (2, 20, 50 a la vez) | 1 turno en los tres casos | `$AUD/clientes-agenda-admin/medir-caa/doble-reserva.ts` |

## 3. Seguridad

### 3.1 Aislamiento entre negocios

| Métrica | Valor | Comando o fuente |
|---|---|---|
| **Server Actions con test de aislamiento / total** | **0 / 205** | `$AUD/tenancy-auth/guards.cjs` → `actions-guards.tsv`; imports de módulos `"use server"` en `*.test.ts` |
| **Route handlers con test de aislamiento / total** | **0 / 16** | ídem |
| Acciones mencionadas en algún script de aislamiento fuera de `npm test` (cota por mención) | ≤ 54 / 205 (las 54 están entre los 205 nombres) | `$AUD/actions-con-test-aislamiento.txt` |
| Acciones con guardia de autorización en el cuerpo | 180 / 205: el script da 178 y 2 se reclasificaron a mano porque su guardia es `exigirCasa`, que llama a `requireCapability` (`src/lib/multilocal/casa.server.ts:62`): `redDeLaCasaAction` (`multilocal-actions.ts:329`) y `ventasDeLaRedAction` (`:405`). Sin guardia: 19 públicas por diseño, 5 de entrada y salida, 1 función pura publicada | `awk -F'\t' '{print $3}' $AUD/tenancy-auth/actions-guards.tsv \| sort \| uniq -c` → 178 GUARD, 27 NO-GUARD |
| Modelos con `tenantId` cubiertos por el SQL de RLS | 44 / 44 | `npm run gate:rls` (`$AUD/gate-rls.txt`) |
| Tablas con RLS en una base creada sólo con `migrate deploy` | **1 / 44** | `psql`: `relrowsecurity` en `pg_class` |
| Tablas con RLS después de `0001` + `0002` a mano | 44 / 44, 44 policies, `app_rls` sin bypass | `node prisma/rls/check-rls-live.mjs` (`$AUD/rls-live.txt`) |
| Capa de aplicación (`npx tsx prisma/rls/aislamiento-capa-app.ts`) | rol dueño: 31 OK, 0 fugas, 6 salteados; `app_rls` + RLS encendido: 29 OK, 0 fugas | `$AUD/capa-app-owner.txt`, `capa-app-rls.txt` |
| FKs entre tablas de negocio / compuestas con el negocio | 43 / 0 | consulta a `pg_constraint` |
| Caminos que cruzan negocios reproducidos | 2: referencias por FK con oráculo de existencia (`$AUD/tenancy-auth/fk-cross-tenant.out`) y procesamiento de envíos a ARCA de otros negocios (`drain-cross-tenant.out`, medido con `OPERATOR_DATABASE_URL` apuntando al rol dueño de la base local) | — |
| Archivos que importan clientes que saltan el candado | `basePrisma` 15; `operatorPrisma` 16. Otros 11 archivos sólo nombran `operatorPrisma` en comentarios (28 lo mencionan) | `grep -rlE "import[^;]*\b<cliente>\b[^;]*from" src \| grep -v '\.test\.ts$' \| wc -l`; lista en `$AUD/correccion/operatorprisma-uso.txt` |
| Cuándo `operatorPrisma` saltea RLS | sólo si `OPERATOR_DATABASE_URL` apunta al rol dueño o a uno con BYPASSRLS; si falta, usa `DATABASE_URL` (`src/lib/operator-db.ts:21`), que en producción es `app_rls` | código |
| Envíos pendientes que ve el procesador de ARCA (`processArcaOutbox`) | sin `OPERATOR_DATABASE_URL` (cae a `app_rls`): **0 de 2**; con el rol dueño: 2 de 2, de dos negocios | `$AUD/correccion/drain-sin-operator-url.mts` → `drain-sin-operator-url.out` |
| SQL crudo | 66 usos (`$queryRaw`/`$executeRaw`), 2 `Unsafe` (`src/lib/cockpit/datos.ts:78`, `:81`) | `grep` |
| Estado de RLS en Neon (producción), `OPERATOR_DATABASE_URL` en Vercel y rol de `DATABASE_URL` | **sin medir** · ENG-204 (pide autorización del dueño) | — |

### 3.2 Vulnerabilidades de dependencias

| Alcance | Críticas | Altas | Moderadas | Comando |
|---|---|---|---|---|
| Producción | 0 | **5** | 5 | `npm audit --omit=dev --json` (`$AUD/audit-prod.json`) |
| Todo | 0 | 8 | 5 | `npm audit --json` (`$AUD/audit-full.json`) |

Altas en producción: `prisma` (directa), `@prisma/config`, `deepmerge-ts`, `mysql2` (las cuatro
en la cadena de la herramienta de Prisma; el arreglo que propone npm es bajar a `prisma@6.19.3`,
cambio mayor) y `fast-uri` (tiene arreglo sin cambio mayor). Ningún archivo de `src` importa esos
cinco paquetes (`grep -rnE "from ['\"](prisma|@prisma/config|deepmerge-ts|mysql2|fast-uri)(/[^'\"]*)?['\"]" src` = 0);
la herramienta de Prisma corre en el build (`scripts/vercel-build.mjs`). `xlsx` viene de un tarball
del CDN de SheetJS y `npm audit` no lo cubre. Auditoría en verify o CI: 0 pasos.

### 3.3 Otros controles del §4

| Control | Valor | Fuente |
|---|---|---|
| Límite de intentos | 5 / 205 acciones; emisión fiscal 0 / 5; escrituras públicas 1 / 7; rutas 2 / 16; estado en memoria por proceso | `$AUD/tenancy-auth/actions-rl.tsv`; `src/lib/rate-limit.ts:8-11` |
| Validación con esquema en el borde | 0 librerías; 329 lecturas de `formData.get` a mano en 31 de los 47 archivos `"use server"`; en todo `src` sin tests, 345 en 34 archivos, más 24 `fd.get` en 5 | `package.json`; `F=$(grep -rlE "^['\"]use server['\"]" src)`, `grep -ohE 'formData\.get\(' $F \| wc -l` y `grep -lE 'formData\.get\(' $F \| wc -l` |
| Secretos en el árbol | 0 credenciales reales (19 coincidencias: ejemplos, tests, 1 host de Neon de producción en `docs/seguridad/RUNBOOK-ROTACION-SECRETOS.md:48`) | `node $AUD/scan-secretos.mjs tree` → `secretos-arbol.tsv` |
| Secretos en la historia | 0 nuevos en 139 commits (el clon es parcial, desde 2026-07-13) | `git log -p -n 300 \| node $AUD/scan-secretos.mjs history` |
| Escaneo de secretos en pre-commit / CI | 0 / 0 | `.git/hooks` sólo `*.sample`; `gates.yml` |
| Logs | 77 llamadas al logger: 39 sin ninguna clave de negocio; request id en 5 / 16 rutas y 0 / 205 acciones; datos personales en `notifications.ts:77` (teléfono y mensaje) y CUIT en `arca-pruebas-actions.ts:105` | `$AUD/tenancy-auth/logs.cjs` |
| Sesión del panel | token sin vencimiento en el servidor ni revocación (`src/lib/auth.ts:61-63`) | ENG-013 |
| Segundo factor | 0 | `grep -rliE '\b(mfa\|totp\|2fa)\b' src` |
| Backups y prueba de restauración | **sin medir** · ENG-205 | — |

## 4. Performance

### 4.1 p95 de las 5 pantallas más usadas

**Oficial (modo producción, seed de 50.000): sin medir** · ENG-201. Qué pantallas son las más
usadas: sin medir (no hay analítica de uso); se toman Inicio, Vender, Turnos, Pedidos y Caja.

Referencia: `next dev` sobre `erp_lab` (60 días de datos), tiempo total del servidor por pantalla,
todos los negocios. Comando: `node $AUD/perf-resumen.mjs $AUD/../perf/res-caliente.json $AUD/../perf/res-rtt30.json`
(detalle por pantalla con `DET=1`). Dos límites de estas cifras: con n de 3 o menos, el p95 es el
máximo; y `$AUD/../perf/INFORME.md:33` dice que se midió con el QA corriendo en paralelo, así que
hay ruido.

| Pantalla | n | 0 ms por viaje: mediana / p95 | 30 ms por viaje: n, mediana / p95 | Presupuesto |
|---|---|---|---|---|
| `/admin` (Inicio) | 18 | 1.379 / 2.837 ms | 12 · 2.286 / 4.461 ms | P4 < 1 s |
| `/admin/vender` | 15 | 180 / 229 ms | 10 · 403 / 450 ms | P1 < 300 ms |
| `/admin/turnos` | 3 | 257 / 271 ms (máximo) | 2 · 836 / 883 ms (máximo) | P1 |
| `/admin/pedidos` | 18 | 264 / 391 ms | 12 · 778 / 1.465 ms | P1 |
| `/admin/caja` | 18 | 264 / 349 ms | 12 · 959 / 1.037 ms | P1 |

Todas las pantallas (49): a 0 ms, mediana 295 ms, p95 1.386 ms, máximo 2.837 ms, 21 de 49 por
encima de 300 ms. A 30 ms: mediana 878,5 ms, p95 2.324 ms, 49 de 49 por encima de 300 ms, 13 de
49 por encima de 1 s. En frío: mediana 352 ms, p95 1.651 ms. Sentencias por pantalla: mediana 45
(9 transacciones), máximo 269 (58 transacciones, Inicio de MAGRA).

### 4.2 Consultas medidas con volumen (Postgres local, sin red)

| Caso | Resultado | Fuente |
|---|---|---|
| Ventas del día con 50.000 pedidos por negocio | 14,2 ms leyendo las 50.000 filas; con índice por fecha, 0,165 ms | `$AUD/explain-ventas.out`, `explain-ventas-con-indice.out` |
| Cierre diario de un negocio que nunca cerró, 50.000 movimientos | p50 412,8 ms, p95 581,5 ms | `N=50000 node --import tsx auditoria/medir-cierre-sin-frontera.mts` |
| Valuación de stock (último costo de cada producto) | 24.626 filas leídas (15.063 movimientos + 9.563 líneas de compra) para 1.974 productos: la consulta no lleva LIMIT y Prisma recorta el `take: 1` en memoria. 181 a 541 ms (`lecturas.out`, 1.973 productos) y 500 ms en la corrección | `psql …/erp_aud_stock -f $AUD/correccion/filas-ultimo-costo.sql` (`filas-ultimo-costo.out`); SQL completo en `$AUD/correccion/lecturas-sql-completo.out` |
| Lista de clientes con 10.000 fichas | p50 97 ms y 2.447.789 bytes al navegador | `$AUD/clientes-agenda-admin/medir/` |
| Clientes con actividad (10.000 fichas) | p50 417 ms | ídem |
| Listado de facturas con 100.000 | 29,0 ms, recorrido completo | `$AUD/explain-out.txt` |
| Sentencias por operación | venta 26 / 42 / 62 (1 / 5 / 10 líneas); compra 24 / 51 / 171 (1 / 10 / 50); recuento 8 / 35 / 155 | `$AUD/consultas-por-venta.out`, `$AUD/stock-compras/aud-stock.out` |
| `findMany` | 254; con límite 34; sin límite, cota superior 220: 211 con el objeto literal sin `take` y 9 con los argumentos armados en otra función (por ejemplo `consultaFilasDeVentas`), donde el script no ve si traen `take` | `node $AUD/correccion/findmany-args.mjs 1` (`findmany-args.out`) |
| Tablas virtualizadas | 0 | `grep -rE 'virtualiz\|react-window\|react-virtual'` |

### 4.3 LCP de la pantalla principal

**Sin medir** (hace falta `next build` + `next start` y Playwright con red y CPU limitadas) · ENG-202.
Referencia: primer pintado (FCP) en `next dev` sobre `erp_lab`, Chromium sin limitar, a 412 y 1440 px:
`/admin` mediana 904 ms y p95 2.452 ms (n = 20); `/admin/vender` mediana 320 ms y p95 436 ms
(n = 15) (`$AUD/../perf/nav-nav0.json`).

### 4.4 Bundle

**Bundle inicial real: sin medir** (hace falta `next build`) · ENG-202.
Estimación con esbuild por componente de cliente: 125 componentes, el mayor `VenderForm.tsx` con
19,3 KB gzip, suma 443 KB gzip, 2 con código de `node_modules` (`$AUD/../perf/bundle.json`).

## 5. Datos, dinero y fechas

| Métrica | Valor | Comando |
|---|---|---|
| Campos de importe: Float / Decimal / entero | **24** / 9 / 0 (de 33) | `node $AUD/schema-parse.mjs prisma/schema.prisma numeric` |
| Campos de moneda | 0 | `grep -niE 'currency\|moneda' prisma/schema.prisma` |
| `round2` redondea mal un x,xx5 | en [0; 100.000): 587.189 de 10.000.000 (5,87 %); en [0; 1.000.000), el rango del criterio de ENG-109: 4.697.605 de 100.000.000 (4,70 %) | desde `$AUD/base-gen`: `npx tsx $AUD/aud-round.ts`; `HASTA_CENTAVOS=100000000 npx tsx $AUD/correccion/aud-round-rango.ts` (`round-1e6.out`) |
| Fechas: `DateTime` / con zona horaria | 101 / 0 | `grep` en `schema.prisma` y migraciones |
| Modelos con `tenantId` | 44 / 45 (falta sólo `Tenant`) | `schema-parse.mjs … tenant` |
| Modelos con borrado lógico | 5 / 45, todos maestros; 0 contables | `grep -nE '^\s+deletedAt' prisma/schema.prisma` |
| Borrados físicos de filas contables en el código | 5 (`libro-caja-actions.ts:513`, `order-anulacion.ts:882`, `bancos-actions.ts:211`, `coupon-actions.ts:101`, `audit-retention.ts:88`) | `grep -rnE '\.(modelo)\.(delete\|deleteMany)\('` |
| Migraciones con reversa / total | 7 / 45 (15,6 %) | `find prisma/migrations -name rollback.sql` |
| Reversas probadas en el repo | 0 | `grep -r rollback.sql src scripts` |
| Reversas probadas por la auditoría | 7 / 7 corren; 5 / 7 permiten volver a subir | `$AUD/rollback-prueba.txt` |
| Triggers en la base | 0 en Neon (una factura autorizada se puede editar y borrar como `app_rls`) · **1 en el árbol, sin aplicar en Neon** (2026-09-25, ENG-022: con CAE, UPDATE fiscal, desligar de la venta a mano y DELETE fallan, como `app_rls` y como dueño; mejor) | `grep -r "CREATE TRIGGER" prisma`; `$AUD/inmutabilidad-out.txt`; `.qa/ENG-022/verde-1.txt`; `.qa/ENG-022/vuelta2/verde.txt` |
| Modelos con auditoría / total | 28 / 45 | `$AUD/aud-ent.txt` contra `modelos.txt` |
| Auditoría fuera / dentro de la transacción | 101 / 23 | `grep` |

## 6. Calidad de código

| Métrica | Valor | Comando |
|---|---|---|
| Errores de tipos | 0 (31 s, `exit=0` en `$AUD/tsc-gen.txt`); sin `prisma generate`: 723 | `npx tsc --noEmit -p . --incremental false` (sin generar: `$AUD/correccion/tsc-sin-generate.txt`, `grep -c "error TS"` = 723) |
| Lint | 11 errores (todos en `celula-negocios-digitales/`) y 31 warnings; en `src/`: 0 errores y 20 warnings; no bloquea | `npx eslint . -f json` (`$AUD/eslint.json`) |
| Formatter | ninguno | `package.json` |
| `eslint-disable` / `as unknown as` / `as any` / `@ts-ignore` en producción | 19 / 19 / 1 / 0 | `grep` |
| `catch` que tragan el error | 8 `.catch(() => null\|undefined)` en código (una novena coincidencia está en un comentario, `facturacion-actions.ts:72`); en clientes y agenda, 15 del servidor sin log | `grep -rnE "\.catch\(\(\) => (null\|undefined)\)" src --include=*.ts --include=*.tsx \| grep -v "\.test\.ts:"` (`$AUD/correccion/catch-null.txt`); `$AUD/clientes-agenda-admin/catches.txt` |
| TODO sin ticket | 1 (`src/lib/business-config.ts:3`) | `grep -rnE '(TODO\|FIXME)(\(\|:)'` |
| Archivos de producción de más de 800 líneas | 11 (el mayor, `src/lib/actions.ts`, 2.108) | `wc -l` |
| Documentos del estándar en `docs/agent/` | 4 / 4 (creados en este cierre) | `ls docs/agent` |

## 7. Sin medir

| Qué | Qué hace falta | Slice |
|---|---|---|
| p95 de los 5 endpoints más usados en modo producción | `next build` + `next start`, seed de 50.000, carga | ENG-201 |
| LCP de la pantalla principal y bundle inicial | `next build` + Playwright | ENG-202 |
| Tendencia comparable entre cierres | scripts de medición en el repo | ENG-203 |
| Resultado del job `tests` en GitHub Actions | un push y leer el log (el job ya levanta Postgres, instala Chromium y exige `# skipped 0`) | ENG-000 |
| RLS, migraciones y variables en producción (entre ellas `OPERATOR_DATABASE_URL` y el rol de `DATABASE_URL`); latencia Vercel-Neon; datos personales ya escritos en los logs de Vercel | lectura de Neon y Vercel con autorización | ENG-204 |
| Qué rol tiene el `DATABASE_URL` del `.env` de quien corre `npm run seed` | preguntar a cada persona con acceso o leer esos `.env` | ENG-001 |
| Región de Neon | la dicen `docs/runbooks/deploy-vercel.md:175` y `RUNBOOK-ROTACION-SECRETOS.md:48` (`sa-east-1`); el código no la fija | ENG-204 |
| Backups y prueba de restauración | restaurar una rama de Neon y comparar | ENG-205 |
| Resultado real de los 4 tests de XLSX | el tarball real de SheetJS | R0-F1 |
| Cobertura de los 32 módulos de dominio que ningún test carga | instrumentador que cargue todo `src` | ENG-130 |
| Historia completa de git para secretos | `git fetch --unshallow` y volver a escanear | ENG-120 |
| Cuántas acciones validan su entrada | test de entrada inválida por acción | ENG-116 |
| Carrera entre reprocesar un extracto y emitir sus facturas | test de integración con las dos acciones | ENG-124 |

## 8. Refutación: lo que no se cambió y por qué

La refutación del 2026-09-24 marcó 14 correcciones y 15 menores. Se verificaron todas y se
corrigieron en `HEALTH.md`, `CODEMAP.md`, `DECISIONS.md` y `BACKLOG.md`. Ninguna resultó falsa.
En cuatro casos la cifra que se publica difiere de la que proponía la refutación; la evidencia:

1. **Archivos con `operatorPrisma`.** La refutación dice 18 con uso en código (17 sin
   `operator-db.ts`) y 10 que sólo lo nombran en comentarios. Medido: 17 con uso en código (16
   importadores más `operator-db.ts`, que lo define) y 11 sólo en comentarios. Dos comandos dan lo
   mismo: `grep -rlE "import[^;]*\boperatorPrisma\b[^;]*from" src | grep -v '\.test\.ts$' | wc -l` = 16,
   y las líneas que lo nombran fuera de un comentario dan 17 archivos
   (`$AUD/correccion/operatorprisma-uso.txt`). Se publica 16 importadores, el mismo criterio que da
   `basePrisma` = 15.
2. **Tests que cuentan consultas.** La refutación cita 3 archivos como ejemplo; con el `grep` de
   §2.2 son 13, todos con dobles de la base. Se publica 13.
3. **Llamadas a Prisma desde `src/app`.** La refutación dice 45, y 49 "con `$queryRaw`". Medido:
   45 llamadas a métodos de modelo (29 `prisma`, 15 `operatorPrisma`, 1 `basePrisma`), 2 `$queryRaw`
   de esos clientes, y 9 sentencias más dentro de transacciones abiertas en
   `src/app/operador/(console)/tenants/[id]/negocio.server.ts` (5 `tx.<modelo>` y 4 `tx.$executeRaw`).
   El 49 no se puede reproducir sin saber qué contó; ENG-114 publica el desglose.
4. **Cobertura de dominio.** La refutación reprodujo el 81,7 % con la lista de 303 archivos. Como
   la lista no tenía comando, se generó una reproducible (304 archivos) y la cifra pasa a 81,9 %
   (DEC-009); la diferencia es la lista, no la medición.
