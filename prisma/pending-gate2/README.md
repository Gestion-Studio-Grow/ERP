# Migraciones preparadas — Gate 2 (NO aplicadas)

Carpeta **fuera** de `prisma/migrations/` a propósito: `prisma migrate deploy` no la mira. Contiene
cambios de schema **preparados pero no aplicados**, que tocan la DB de producción (Neon) y por tanto son
**Gate 2** (lo único irreversible — ver `CLAUDE.md` → *Autorización y gates* / ADR-018). Aplicarlos es
decisión del dueño.

| Archivo | Qué agrega | Origen | Estado |
|---|---|---|---|
| `ProvisioningRun.sql` | Tabla `ProvisioningRun` — persiste la saga de la fábrica de tenants (idempotencia entre procesos, reanudación, auditoría de plataforma) | ADR-074 "Próxima iteración" · consola de operador (Fase 2) | **Preparada, sin aplicar** |
| `MustChangePassword.sql` | Columna `User.mustChangePassword` (bool, default false) — marca al OWNER para cambio forzado de contraseña en el próximo ingreso a `/admin`. La usa "Resetear contraseña del OWNER" (consola de operador) + el portón de cambio forzado. Leída/escrita con SQL crudo DEFENSIVO (no en `schema.prisma`, para no repetir el schema-ahead de CH → login se cae). | Reset de contraseña con revelado único · consola de operador | **Preparada, sin aplicar** |
| `CarniceriaRubro.sql` | `Product.category` + `Product.cost` (nullable) · tabla `ProductBatch` (lotes/envasado al vacío: fecha envasado, vencimiento, peso variable, trazabilidad, FEFO) · tablas `ProcessingRun`/`ProcessingOutput` (despiece con rendimiento y merma) · enums `BatchStatus`/`ProcessingStatus` | Rubro carnicería MAGRA · `docs/preventa/magra/backoffice-carniceria-spec.md` | **Preparada, sin aplicar** · ⚠️ requiere sumar RLS de las 3 tablas de-tenant al aplicar |
| `ArcaAuthTicket.sql` | Tabla `ArcaAuthTicket` — caché PERSISTENTE y CIFRADA del Ticket de Acceso (TA) de ARCA por tenant. Sin ella, en serverless cada emisión re-loguea contra WSAA y falla con `alreadyAuthenticated`. `token`+`sign` cifrados (envelope, `FISCAL_MASTER_KEY`); `expiration` en claro. Accedida con SQL crudo DEFENSIVO (no en `schema.prisma`) — si no existe, el store degrada a no-op y la emisión igual funciona (a lo sumo re-loguea). | Cierre del círculo fiscal — emisión por la app (ADR-022 §6 · ADR-066) | **Preparada, sin aplicar** · ⚠️ tiene `tenantId` → re-ejecutar `prisma/rls/0001_enable_rls.sql` al aplicar (le pone la policy `tenant_isolation`) |

## Paquete del nivel 2 (tanda S2) — se aplica entero, en una ventana, con un solo backup

Runbook: [`docs/runbooks/gate2-nivel2.md`](../../docs/runbooks/gate2-nivel2.md). Orden §4.5 del plan
nivel 2. Cada archivo es aditivo, idempotente (`IF NOT EXISTS` + guardas `DO`), declara las tandas que
lo usan y tiene la reversa al pie. Las tablas nuevas tienen FK a `Tenant`, índice por `tenantId` y
policy `tenant_isolation` (en el archivo y otra vez en el paso 7).

| # | Archivo | Qué agrega | Lo usan | Estado |
|---|---|---|---|---|
| 1 | `CarniceriaRubro.sql` (ya estaba) | ver fila de arriba | M3a, M3b | **Preparada, sin aplicar** |
| 2 | `N2_enums.sql` | `PaymentMethod.DEBITO` y `PaymentMethod.CREDITO` (D-C01: separados; el cierre los suma en «Tarjeta»), `UserRole.REPARTIDOR`, `UserRole.ENCARGADO` — cada `ADD VALUE` en su paso, sin `--single-transaction`. 🔴 Irreversible (no hay `DROP VALUE`) | M1, M6 | **Preparada, sin aplicar** |
| 3 | `N2_hub.sql` | `ApiKey`, `WebhookSuscripcion`, `EntregaWebhook`, `PlantillaWhatsapp`, `OutboxEvent.version` (default 1) + `.clave` + `@@unique(tenantId, clave)` + índice `(tenantId, processedAt, proximoIntentoEn)` + índice parcial `(tenantId, payload->>'clave') WHERE clave IS NULL` (dedupe de P2) · **paso posterior**: re-correr el backfill de `clave` a los 2 minutos (ver el pie del archivo) | P2, P3, P4, P6 | **Preparada, sin aplicar** |
| 4 | `N2_pagos.sql` | `PagoExterno` con `@@unique(tenantId, proveedor, idExterno)`, monto `Decimal(14,2)` ≥ 0. **Decisión S2-C4: `Payment` no se extiende** (atado a turno, Float, sin proveedor) — motivo escrito en el archivo | P5, M2, B3 | **Preparada, sin aplicar** |
| 5 | `N2_retail.sql` | `Client.limiteCredito`, `Order.cobroVerificadoEn/Por` (nullables). `RegistroFrio` comentada hasta M-8 | M7, M2, M10 | **Preparada, sin aplicar** |
| 6 | `N2_club_indice.sql` | `ClubReservaIndice` (proyección de la foto del club, droppable) | B1, B2, B8 | **Preparada, sin aplicar** |
| 7 | `../rls/0001_enable_rls.sql` | re-ejecución: policy en toda tabla con `tenantId` | todas | se re-corre, no se edita |

Modelos en `prisma/schema.prisma`: líneas con prefijo `// N2: ` (comentadas, como el criterio de
`MustChangePassword`); los 4 valores de enum con `// N2-enum: ` (los encienden M1/M6 con su código:
ampliar el enum rompe 4 tipos cerrados del dominio) y **se despliegan antes de escribir el primer
valor** (regla y chequeos automáticos en `N2_enums.sql` y en el runbook §6). El código pregunta con `src/lib/schema-probe` (`hayTabla`, `hayColumna`,
`hayValorEnum`, caché por proceso) y cae al camino de hoy si falta algo.

**Verificación (Postgres local efímero, nunca Neon):**
`GATE2_PG_URL=postgresql://postgres@localhost:5433/postgres node --import tsx --test src/lib/schema-probe/paquete-gate2.test.ts`
— crea una base, `migrate deploy`, probes en false; aplica 1–7, probes en true y `prisma migrate diff`
contra el schema con `// N2:` y `// N2-enum:` descomentados = mismo diff que antes del paquete (no agrega diferencias);
FK/índice/policy de cada tabla nueva y 0001 la repone; dos negocios + doble envío (un solo
`PagoExterno`, un solo cobro aplicado, RLS); paquete otra vez (idempotente); reversa del pie de cada
archivo; y de nuevo. Sin `GATE2_PG_URL` se saltea. Incluye los casos adversariales de la
certificación S2 (FK compuestas entre negocios, RLS en las 6 tablas, 8 envíos a la vez, version=1 en
filas viejas, reversa de enums contra `pg_attribute`, `check-rls-live`, re-aplicar con datos sin
tocar filas, reseteo de go-live con entregas de webhook).

**Sin Postgres instalado:** `node scripts/qa/gate2-pglite.mjs` levanta PGlite (Postgres 17 en WASM,
en memoria, de `node_modules`) en un puerto local y corre el mismo test con `GATE2_PG_URL` apuntando
ahí; sin `psql`, el test ejecuta cada archivo sentencia por sentencia en autocommit, como `psql -v
ON_ERROR_STOP=1`. Lo que PGlite **no** prueba: concurrencia real (atiende una conexión por vez; los
"8 a la vez" se serializan, así que se prueba el resultado de la dedupe pero no la carrera),
bases separadas (`CREATE DATABASE` existe pero todas las conexiones caen en la misma), ni `psql`
en sí. Para eso, el Postgres 16 local.

`src/lib/schema-probe/paquete-gate2-estatico.test.ts` (en `npm test`, sin base): `N2_enums.sql` sin
transacción, D-C01 (DEBITO y CREDITO, ningún TARJETA) y las marcas `// N2-enum:` iguales a los
`ADD VALUE` del archivo.

Después del día D (tanda propia): descomentar `// N2:`, `prisma generate`, y pasar cada `.sql`
aplicado a `prisma/migrations/<ts>_n2_*/migration.sql` + `prisma migrate resolve --applied <nombre>`
para que el historial de Prisma lo conozca sin re-aplicarlo.

## ProvisioningRun sin aplicar

Mientras no se aplique `ProvisioningRun.sql`, la consola de operador funciona con la idempotencia de la saga **en memoria**
(`src/lib/provisioning/runtime.ts` → `sharedIdempotencyStore`): sobrevive entre requests del mismo
proceso, se pierde al reiniciar. Suficiente para evitar un doble-submit; no para reanudar entre procesos.

— Elaborado por GSG
