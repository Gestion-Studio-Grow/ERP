# Runbook · Gate 2 del nivel 2 — aplicar el paquete de migraciones (día D)

> **Quién lo corre:** el dueño (o quien él designe, con él presente). **Decisión D-01:** aplicar en
> producción es sólo del dueño. Este runbook NO se corre contra Neon sin su orden escrita.
> Paquete: `prisma/pending-gate2/` (índice en su `README.md`). Tanda que lo armó: S2.
> Verificado en Postgres local (16): paquete dos veces, reversa, y de nuevo —
> `src/lib/schema-probe/paquete-gate2.test.ts` (también corre sobre PGlite sin instalar nada:
> `node scripts/qa/gate2-pglite.mjs`; ver el README del paquete para lo que PGlite no prueba).

## 0. Antes del día D (la víspera)

- [ ] Ramas que usan el paquete integradas en `main` y desplegadas **con la base vieja** (todas
      toleran la ausencia: muestran «En preparación» vía `src/lib/schema-probe`).
- [ ] Ensayo en un **branch de Neon** creado desde producción (no en prod): pasos 2 a 6 de abajo
      contra el branch. Si algo falla ahí, no hay día D.
- [ ] Ventana elegida con poco movimiento (MAGRA cerrada, sin turnos del club en curso).
- [ ] Avisos enviados (ver §7, «quién avisa a quién»).

## 1. Respaldo (obligatorio, sin esto no se sigue)

Una de las dos, anotando el nombre/hora en el registro del día:

- **Branch de Neon** desde `main` de prod en el instante de empezar (consola de Neon → Branches →
  *Create branch* → «from now»). Es el punto de vuelta atrás instantáneo (restore del branch).
- o `pg_dump` con el rol directo: `pg_dump "$MIGRATE_DATABASE_URL" -Fc -f gate2-n2-$(date +%F-%H%M).dump`
  (guardarlo fuera de Git: Drive del dueño).

Usar SIEMPRE la conexión **directa** (`MIGRATE_DATABASE_URL`), nunca el pooler. No se imprime: se
exporta en la terminal del dueño.

## 2. Aplicar, en este orden (§4.5 del plan) — cada archivo en su transacción

```bash
cd prisma/pending-gate2
P="psql -X -v ON_ERROR_STOP=1 -d $MIGRATE_DATABASE_URL"
$P -f CarniceriaRubro.sql     # 1 · Product.category/cost, lotes, despiece (M3a, M3b)
$P -f N2_enums.sql            # 2 · DEBITO, CREDITO (D-C01), REPARTIDOR, ENCARGADO — SIN --single-transaction:
                              #     cada ADD VALUE es su propio paso (no usable en la misma tx)
                              #     🔴 IRREVERSIBLE: Postgres no tiene DROP VALUE (ver §5)
$P -f N2_hub.sql              # 3 · ApiKey, WebhookSuscripcion, EntregaWebhook, PlantillaWhatsapp, OutboxEvent.version/clave
$P -f N2_pagos.sql            # 4 · PagoExterno (decisión: Payment no se extiende; ver el archivo)
$P -f N2_retail.sql           # 5 · Client.limiteCredito, Order.cobroVerificadoEn/Por
$P -f N2_club_indice.sql      # 6 · ClubReservaIndice
$P -f N2_integraciones_ruteo.sql  # 6 bis · gsg_conexion_por_cuenta / gsg_conexiones_activas (pase N2; si sale un WARNING de FORCE RLS, anotarlo: no frena)
$P -f ../rls/0001_enable_rls.sql   # 7 · re-ejecución: policy tenant_isolation en TODA tabla con tenantId
```

- El paso **0 bis** (`N2_modulo_mercadopago.sql`) NO va en este bloque: se corre **antes del push a main**
  (ver `Factory-GSG/00-ESTADO/reingenieria-2026-10/PASE-N2.md`, runbook del día D).
- Los 1, 3–6 y 6 bis tienen `BEGIN … COMMIT` adentro: si uno falla, ese archivo no deja nada a medias.
- Todos son idempotentes: si se corta la luz a mitad, se vuelve a correr **desde el archivo que
  falló** (o desde el 1; no rompe nada).
- `ON_ERROR_STOP=1`: ante el primer error, psql frena. **No seguir con el siguiente archivo**: ir a §5.

### 2.3b · Re-backfill de `OutboxEvent.clave` (P2) — dos minutos después del paso 3

Un proceso vivo que preguntó por las columnas ANTES del paso 3 guarda «no están» 60 s
(`TTL_NEGATIVO_MS`, `src/lib/schema-probe/probe.ts`) y en ese rato escribe eventos con `clave` NULL y
la clave en `payload._clave`. Pasados **2 minutos** desde el paso 3 (con la app corriendo), volver a
correr el backfill del pie de `N2_hub.sql` («PASO POSTERIOR»):

```bash
$P -c "UPDATE \"OutboxEvent\" AS o SET \"clave\" = o.\"payload\"->>'_clave' WHERE o.\"clave\" IS NULL AND o.\"payload\" ? '_clave' AND NOT EXISTS (SELECT 1 FROM \"OutboxEvent\" AS d WHERE d.\"tenantId\" = o.\"tenantId\" AND d.\"clave\" = o.\"payload\"->>'_clave');"
```

Esperado: `UPDATE 0` o pocas filas. Si falla por el UNIQUE, o queda una fila con `clave` NULL por el
`NOT EXISTS`, es un duplicado de un mismo hecho: **avisar, no borrar**. Es idempotente; se puede
repetir.

## 3. Verificar RLS en vivo

```bash
RLS_AUDIT_DATABASE_URL="$MIGRATE_DATABASE_URL" node prisma/rls/check-rls-live.mjs
```

Tiene que salir con código 0 y listar `tenant_isolation` en: `ProductBatch`, `ProcessingRun`,
`ProcessingOutput`, `ApiKey`, `WebhookSuscripcion`, `EntregaWebhook`, `PlantillaWhatsapp`,
`PagoExterno`, `ClubReservaIndice` (además de las de siempre). Si sale 1: re-correr el paso 7 y
repetir; si sigue en 1, §5.

Funciones de ruteo (6 bis), con la conexión de la APP (`DATABASE_URL` de Vercel, rol `app_rls`; no
el rol directo, que no necesariamente puede `SET ROLE app_rls`). Tiene que devolver filas si hay
conexiones de MP activas:
`psql "$APP_DATABASE_URL" -c "SELECT count(*) FROM gsg_conexiones_activas('mercadopago', 20)"`
Si da 0 y `SELECT count(*) FROM "IntegracionConexion" WHERE conector='mercadopago' AND estado='conectada'` (como dueño) da más:
FORCE RLS sin BYPASSRLS — no rompe nada hoy (ningún código las llama), anotarlo para P5/P6.

Chequeo rápido de enums (opcional):
`SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname IN ('PaymentMethod','UserRole');`

## 4. Humo (clic por clic, en producción, con un usuario real de cada negocio)

Los procesos vivos ven lo nuevo en ≤ 60 s (caché del probe); para que sea inmediato, *Redeploy*
del último deploy en Vercel (sin push).

1. **Login**: entrar a `/admin` de MAGRA y de Break Point con OWNER. Carga el inicio sin error.
2. **Vender (MAGRA)**: mostrador → un corte por peso → cobrar en Efectivo → aparece en la caja del
   día. Si M1 ya está integrada, ver que aparezcan **Débito** y **Crédito** como medios separados
   y que el cierre de caja los sume en la columna **Tarjeta** (D-C01).
3. **Agenda del club (Break Point)**: abrir la agenda del día, crear una reserva de prueba en una
   cancha libre, verla en la grilla, cancelarla. Con B1 integrada, la disponibilidad pública del
   turnero muestra el hueco de nuevo.
4. Revisar el monitor / logs de Vercel 10 minutos: sin errores de Prisma (`column … does not exist`,
   `invalid input value for enum`).

Todo verde → §6. Algo rojo → §5.

## 5. Reversa (por archivo, en orden INVERSO, sólo lo que se llegó a aplicar)

Primera opción si el día D salió mal y nadie cargó datos nuevos: **restaurar el branch de Neon** del
§1 (vuelve todo, incluido el enum). Si no, la reversa de cada archivo está **al pie del archivo**,
copiada tal cual a psql (probadas en local):

| Paso | Archivo | Reversa | Pierde datos |
|---|---|---|---|
| 7 | `0001_enable_rls.sql` | no se revierte (sólo pone policies; `prisma/rls/0001_rollback.sql` existe pero apaga TODA la RLS — no usar) | no |
| 6 bis | `N2_integraciones_ruteo.sql` | `DROP FUNCTION` de las dos (pie del archivo) | no (no guardan datos) |
| 6 | `N2_club_indice.sql` | `DROP TABLE "ClubReservaIndice"` | no (es proyección de la foto) |
| 5 | `N2_retail.sql` | `DROP COLUMN` de las 3 columnas | límites de fiado y verificaciones cargadas |
| 4 | `N2_pagos.sql` | `DROP TABLE "PagoExterno"` | conciliación: exportar antes si hay filas |
| 3 | `N2_hub.sql` | 4 `DROP TABLE` + 2 `DROP COLUMN` + 3 `DROP INDEX` en OutboxEvent (incluye el parcial de P2) | claves, suscripciones y plantillas cargadas |
| 2 | `N2_enums.sql` | 🔴 **irreversible: no hay `DROP VALUE`**. Se dejan (inocuos si nadie los usa); recrear el tipo es el procedimiento manual al pie (otro Gate 2) | no |
| 0 bis | `N2_modulo_mercadopago.sql` | `array_remove` SÓLO para los slugs que listó su primer SELECT (pie del archivo) | no |
| 1 | `CarniceriaRubro.sql` | bloque `ROLLBACK` al pie (tablas, enums y 2 columnas de Product) | lotes y despieces cargados |

Después de una reversa: *Redeploy* en Vercel (los procesos vivos cachean el «sí está» del probe
para siempre; un proceso nuevo vuelve a preguntar) y repetir el humo §4.

## 6. Cierre

- Anotar en `docs/ESTADO-ACTUAL.md` y en el README del paquete: aplicado el `<fecha>` contra Neon
  prod, branch/backup `<nombre>`, check-rls-live OK, humo OK.
- **Encender los modelos en `schema.prisma`** (tanda propia, después del día D, nunca antes):
  quitar el prefijo `// N2: ` de todas las líneas que lo llevan
  (`sed -E 's#^([[:space:]]*)// N2: ?#\1#'`), `npx prisma generate`, `tsc` + tests, y recién ahí
  el código puede pasar de SQL crudo a Prisma. Verificado en local: así `tsc` queda limpio.
  Los 4 valores de enum llevan otra marca (`// N2-enum: `): ampliar `PaymentMethod`/`UserRole`
  rompe 4 tipos cerrados del dominio (`SessionUser.role` en `src/lib/session.ts`, `Usuario` en
  `usuarios/page.tsx`, `KpiAppointment` en `src/lib/actions.ts`), así que los encienden M1
  (`DEBITO`, `CREDITO`) y M6 (`REPARTIDOR`, `ENCARGADO`) junto con ese código.
- 🔴 **Regla de los valores de enum (M1, M6): encender `// N2-enum:` y DESPLEGAR antes de escribir
  el primer valor nuevo.** Un cliente de Prisma generado sin el valor falla al LEER cualquier fila
  que lo tenga (`Value 'DEBITO' not found in enum 'PaymentMethod'`), en cualquier pantalla. Orden:
  (1) día D aplicado; (2) la tanda quita la marca de sus valores, `prisma generate`, tsc, y el build
  queda desplegado; (3) recién ahí se escribe el primer valor. Chequeos automáticos: el código
  escribe sólo si `sePuedeEscribirValorEnum(tipo, valor)` (`src/lib/schema-probe`: la base lo tiene
  **y** el cliente de este build lo conoce), y `src/lib/schema-probe/paquete-gate2-estatico.test.ts`
  (en `npm test`) falla si `N2_enums.sql` y las marcas de `schema.prisma` no nombran los mismos
  valores. Nunca escribir esos valores por SQL a mano antes del paso (2).
- **Cómo se mide «sin diferencias» (C7).** No es un diff vacío: es que el paquete **no agrega**
  diferencias. `paquete-gate2.test.ts` toma una línea de base = `prisma migrate diff` entre la base
  con sólo el paso 1 (`CarniceriaRubro.sql`, que vive fuera de `schema.prisma` por diseño, más el
  drift previo ajeno a S2) y el `schema.prisma` de hoy; después aplica 2–7 y exige que el diff
  contra el schema con `// N2:` **y** `// N2-enum:` descomentados sea **igual** a esa línea de base.
  El descomentado se hace sobre una copia temporal, nunca sobre el archivo del repo: con
  `// N2-enum:` encendido, tsc se rompe a propósito (los 4 tipos cerrados de arriba) hasta que M1/M6
  encienden su código.
- Mover los `.sql` aplicados a `prisma/migrations/<timestamp>_n2_*/migration.sql` + `prisma migrate
  resolve --applied` (también es tanda propia; ver el README del paquete).

## 7. Quién avisa a quién

| Cuándo | Quién | A quién | Por dónde | Qué |
|---|---|---|---|---|
| Víspera | Dueño GSG | Encargado de MAGRA y de Break Point | WhatsApp | «Mañana de HH a HH el sistema puede estar lento o cortarse 15 min; anotá en papel lo que vendas/reserves en ese rato.» |
| Inicio | Quien aplica | Dueño GSG | WhatsApp | «Backup hecho: <branch>. Empiezo.» |
| Falla en §2/§3 | Quien aplica | Dueño GSG | llamada | archivo que falló + error (sin secretos); el dueño decide reintentar o revertir |
| Fin OK | Dueño GSG | Encargados de MAGRA y Break Point | WhatsApp | «Listo, ya pueden usar el sistema normal.» + qué hay de nuevo si aplica |
| Reversa | Dueño GSG | Encargados | WhatsApp | «Volvimos a la versión anterior.» Si se restauró el branch del §1, lo cargado durante la ventana se perdió: recargarlo desde el papel |

Contactos: provisional a confirmar (los carga el dueño; no van en el repo).

— Elaborado por GSG
