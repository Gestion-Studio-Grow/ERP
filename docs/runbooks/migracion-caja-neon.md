# Runbook — Migrar Neon para el libro de caja y el cierre diario

**Estado: ENSAYADA, sin aplicar a producción.** Falta la `DATABASE_URL` de Neon con rol
directo. Todo lo demás está verificado.

---

## Qué se aplica

Cuatro migraciones. **No son tres**: la última que la documentación da por aplicada en Neon
es `20260712120000` (`docs/producto/HANDOFF-consolidacion-a-core-0712.md:44-45`), y después
quedaron cuatro, no las tres de la caja — `lead_campania` es de agosto y arrastra desde
antes de este frente.

| Migración | Qué agrega |
|---|---|
| `20260815120000_lead_campania` | Campañas de leads |
| `20260906120000_add_cash_method_libro_caja` | `CashMovement.method` + `occurredAt`, `sessionId` pasa a nullable |
| `20260907120000_add_cash_movement_payment_id` | `CashMovement.paymentId` + unique |
| `20260907180000_add_appointment_partial_collections` | `Collection.idempotencyKey`, `CashMovement.collectionId` |

Las cuatro son **aditivas**: agregan columnas e índices, no borran ni reinterpretan filas.

## Por qué el orden es migrar → deployar, y no al revés

`20260906` **no se degrada: rompe.** Sin ella, cada venta del mostrador, el libro, el cierre
diario y el cobro de turno fallan con error de columna inexistente. La tolerancia
schema-ahead de `settleAppointmentPaymentGuarded` (`src/lib/caja/cobro-turno.ts:170-171`)
cubre `CashMovement.paymentId`, `CashMovement.collectionId` y `Collection.idempotencyKey`
— **no cubre `CashMovement.method`**, y `recordCobroTurnoInTx` la escribe siempre.

Publicar el código antes de migrar deja el mostrador sin poder cobrar.

## El ensayo (2026-09-08)

Sobre una base local llevada al estado documentado de producción (40 migraciones, hasta
`20260712120000`) y cargada con 900 `CashMovement` y 300 `Collection`:

- Las cuatro migraciones aplicaron en **1,5 segundos**.
- **Cero filas perdidas**: 900 y 300 antes y después.
- `sessionId` pasó a nullable; los tres índices únicos nuevos se crearon sin colisión
  (las columnas nacen NULL y en Postgres los NULL no colisionan).
- `npm run predeploy-check` contra esa base: *"Base al día: 45 tablas del schema y 44
  migraciones verificadas."*

## Los pasos

1. **Backup.** Un branch de Neon o un `pg_dump`. Es lo único que deshace un error.
2. **Confirmar el estado real**, porque la documentación es de julio:
   ```
   DATABASE_URL=<rol directo> npx prisma migrate status
   ```
   Si lista más o menos de cuatro pendientes, **frenar y revisar**: significa que alguien
   aplicó o revirtió algo fuera de este circuito.
3. **Chequeo previo** (sólo lee `information_schema` y `_prisma_migrations`):
   ```
   PREDEPLOY_DATABASE_URL=<rol directo> npm run predeploy-check
   ```
4. **Migrar**, en una sola corrida:
   ```
   DATABASE_URL=<rol directo> npx prisma migrate deploy
   ```
   ⚠️ `migrate deploy`, **nunca `migrate dev`** (falla contra el pooler).
   ⚠️ Rol **directo**, no el pooler: el pooler rechaza las migraciones.
5. **Recién ahora, deployar** el código.
6. **Verificar** (§ abajo).

## Después de migrar, verificar tres cosas

- **El commit publicado**: `GET /api/health` devuelve el sha del deploy.
- **El aislamiento sigue encendido**: `node prisma/rls/check-rls-live.mjs` contra la base, y
  en Vercel que `RLS_ENFORCEMENT=on` y que `DATABASE_URL` apunte al rol `app_rls`
  (NOBYPASSRLS). Si apunta al rol dueño de las tablas, RLS está apagado de hecho.
- **Los movimientos históricos.** Las filas de `CashMovement` anteriores a la migración
  quedan con `method = EFECTIVO`, que es el default y la lectura correcta (antes no existía
  el concepto de medio: el arqueo contaba efectivo). Pero si producción ya tiene ventas de
  mostrador cobradas por MP, en el libro van a leerse como efectivo. Contarlas antes:
  `SELECT count(*) FROM "CashMovement";` — si son pocas o cero, no hay nada que hacer.

## Y el corte inicial, que no es opcional

El libro tiene que arrancar de **plata contada**, no de un saldo heredado. Es la causa raíz
de todo lo que falló en la planilla. Después de migrar y deployar:

```
DATABASE_URL=... npx tsx scripts/corte-inicial.ts --tenant beauty-spa \
  --dia YYYY-MM-DD --efectivo <contado> --mp <contado> --tarjeta 0 \
  --nota "cajón contado 20:10; MP app 20:15"
# agregar --write recién cuando el resumen cierre
```
