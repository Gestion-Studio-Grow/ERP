# Runbook — Migrar Neon para el libro de caja y el cierre diario

**Estado: ENSAYADA, sin aplicar a producción.** Falta la `DATABASE_URL` de Neon con rol
directo. Todo lo demás está verificado.

> **Antes de planificar nada, MEDIR.** Este repo afirmó durante meses cosas sobre el estado
> de Neon que nadie había verificado, y la misma afirmación estaba copiada en cuatro
> archivos. Hay un script de SOLO LECTURA que contesta las tres preguntas de una:
>
> ```bash
> export NEON_URL='postgresql://...'   # rol DIRECTO, sin -pooler
> npm run medir:neon
> ```
>
> Devuelve cuántas migraciones faltan (acá abajo se esperan **cinco**), si hay tablas con
> `tenantId` sin policy de RLS, y el estado de `CarteraCliente` y del rol `app_rls`. No
> escribe nada y su salida no incluye la connection string: se puede pegar tal cual.

---

## Qué se aplica

**Cinco** migraciones. No son tres ni cuatro: la última que la documentación da por aplicada
en Neon es `20260712120000` (`docs/producto/HANDOFF-consolidacion-a-core-0712.md:44-45`), y
después se acumularon cinco — `lead_campania` es de agosto y arrastra desde antes de este
frente, y `profesional_cobra_en_mostrador` entró el 11/09 con la decisión del dueño sobre
quién cobra qué.

| Migración | Qué agrega |
|---|---|
| `20260815120000_lead_campania` | Campañas de leads |
| `20260906120000_add_cash_method_libro_caja` | `CashMovement.method` + `occurredAt`, `sessionId` pasa a nullable |
| `20260907120000_add_cash_movement_payment_id` | `CashMovement.paymentId` + unique |
| `20260907180000_add_appointment_partial_collections` | `Collection.idempotencyKey`, `CashMovement.collectionId` |
| `20260911120000_profesional_cobra_en_mostrador` | `Professional.cobraEnMostrador` (DEFAULT true) |

Las cinco son **aditivas**: agregan columnas e índices, no borran ni reinterpretan filas.

`20260911` es la única que **sí se degrada en vez de romper**: el código la tolera (P2022) en
los tres caminos del mostrador, y mientras no esté aplicada rige el default —el mostrador
cobra a todas—. O sea: se puede deployar antes o después. Las otras cuatro no.

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

- Las cuatro migraciones de caja aplicaron en **1,5 segundos** (el ensayo es previo a la quinta, que es un `ADD COLUMN` con default: mismo orden de magnitud).
- **Cero filas perdidas**: 900 y 300 antes y después.
- `sessionId` pasó a nullable; los tres índices únicos nuevos se crearon sin colisión
  (las columnas nacen NULL y en Postgres los NULL no colisionan).
- `npm run predeploy-check` contra esa base: *"Base al día: 45 tablas del schema y 44
  migraciones verificadas."*

## Dos caminos para correrlo

### A · Desde el deploy de Vercel (no hace falta terminal)

Es el camino para cuando nadie va a abrir una terminal con la cadena de producción. El build
lleva el runbook adentro (`scripts/vercel-build.mjs`) y corre los pasos 2, 3, 4 y 6 solo, en
este orden, frenando en cada uno:

1. **Hacé el respaldo.** Neon → tu proyecto → Branches → *Create branch*. Un clic. **Esto no
   lo hace el script y no lo va a hacer nunca**: ningún automatismo puede decidir por el
   dueño que un respaldo no hace falta.
2. Neon → *Connection string* → **destildá "Connection pooling"** y copiá la cadena.
3. Vercel → el proyecto → Settings → Environment Variables → nueva variable
   `MIGRATE_DATABASE_URL`, pegás esa cadena, marcada **sólo para Production**.
4. Vercel → Deployments → *Redeploy* sobre el último commit de la rama.

El build va a: mostrar el estado de la base, aplicar las pendientes, **verificar que los
índices únicos de idempotencia existan** y, si falta alguno, **fallar sin publicar**; después
auditar el aislamiento (avisa, no frena) y recién ahí compilar.

**Si algo falla, Vercel no publica y el código viejo sigue sirviendo.** Las migraciones de
este lote son aditivas, así que una base migrada con el código anterior funciona igual.

Qué NO migra, a propósito: los previews (`VERCEL_ENV` distinto de `production`) y cualquier
build sin `MIGRATE_DATABASE_URL`. Las dos condiciones se exigen juntas.

Cuando termine, **sacá `MIGRATE_DATABASE_URL` de Vercel**. Deja de hacer falta, y una cadena
con rol directo guardada en las variables de un proyecto es superficie que no necesitás.

### B · A mano, desde una terminal

Es el de siempre, y sigue siendo el de referencia. Los pasos, abajo.

## Los pasos

1. **Backup.** Un branch de Neon o un `pg_dump`. Es lo único que deshace un error.
2. **Confirmar el estado real**, porque la documentación es de julio:
   ```
   DATABASE_URL=<rol directo> npx prisma migrate status
   ```
   Si lista más o menos de cinco pendientes, **frenar y revisar**: significa que alguien
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
5. **Re-correr `prisma/rls/0001_enable_rls.sql`.** Es data-driven: le pone policy a TODA
   tabla que tenga `tenantId`. Ninguna de las 21 migraciones históricas prende RLS en la
   tabla que crea, así que este paso es lo que cierra esa ventana. (La de `lead_campania`
   ahora emite su policy inline, pero re-correrlo igual es idempotente y barato.)
6. **Verificar que los índices existan — ANTES de deployar el código.** Ver abajo; es el
   paso que faltaba y el único que puede frenar el deploy.
7. **Recién ahora, deployar** el código.
8. **Verificar el resto** (§ abajo).

## Antes de deployar: que los árbitros del dinero estén en la base

**`prisma migrate deploy` se detiene en la primera migración que falla.** Una que aplique su
`ADD COLUMN` y muera antes del `CREATE UNIQUE INDEX` deja la base en el peor estado posible:
la columna existe, el chequeo de columnas da verde, y el código cree que tiene árbitro.

Y esos índices no son cosméticos. El cobro tiene dos capas: un pre-chequeo dentro de la
transacción, y el `@@unique` que hace chocar el `create` cuando dos submits pasan el
pre-chequeo a la vez (`src/lib/caja/cobro-turno.ts`). **Sin el índice, la capa 1 sola es un
check-then-write: dos pestañas o un reintento de red cobran dos veces.** Tres de esos
árbitros llegan en este lote.

```bash
npm run predeploy-check      # con PREDEPLOY_DATABASE_URL apuntando a Neon
```

Desde ahora compara los `@@unique`/`@@index` del schema contra `pg_index` de la base
destino, por COLUMNAS y no por nombre. Si reporta un índice único faltante: **NO deployar**,
volver a correr la migración que lo crea. A mano, si se prefiere:

```sql
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN (
  'CashMovement_tenantId_paymentId_type_key',
  'CashMovement_tenantId_collectionId_type_key',
  'Collection_tenantId_idempotencyKey_key');
-- tienen que volver las tres.
```

Hay un estado intermedio que merece nombre propio: si `20260906` aplica y `20260907180000`
no, el cobro de turno cae al camino degradado (`withSchema = false`) y en ese camino **no
corre el pre-chequeo, no escribe la clave de idempotencia, y no asienta el movimiento en el
libro**. Es el único estado donde se rompen a la vez el "se escribe una sola vez" y el
"nunca queda fuera del libro". Por eso este paso va antes del deploy y no después.

## Después de migrar, verificar tres cosas más

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
