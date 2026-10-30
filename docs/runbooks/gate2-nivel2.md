# Runbook · Gate 2 del nivel 2 — aplicar el paquete de migraciones (día D)

> **Quién lo corre:** el dueño (o quien él designe, con él presente). **Decisión D-01:** aplicar en
> producción es sólo del dueño. Este runbook NO se corre contra Neon sin su orden escrita.
> Paquete: `prisma/pending-gate2/` (índice en su `README.md`). Tanda que lo armó: S2.
> Verificado en Postgres local (16): paquete dos veces, reversa, y de nuevo —
> `src/lib/schema-probe/paquete-gate2.test.ts` (también corre sobre PGlite sin instalar nada:
> `node scripts/qa/gate2-pglite.mjs`; ver el README del paquete para lo que PGlite no prueba).

## 0. Antes del día D (la víspera)

- [ ] 🔴 Precondición de MP del §0 bis verificada y ANOTADA por el dueño (`MP_MODO`, cuenta de
      `MP_ACCESS_TOKEN`, `MP_SIMULAR_AVISOS` apagado, `MP_MODO_LEGADO`). Sin esta casilla no hay push.
- [ ] §0 bis corrido JUSTO ANTES del push (no después: avisos de MP perdidos).
- [ ] Ramas que usan el paquete integradas en `main` y desplegadas **con la base vieja** (todas
      toleran la ausencia: muestran «En preparación» vía `src/lib/schema-probe`).
- [ ] Ensayo en un **branch de Neon** creado desde producción (no en prod): pasos 2 a 6 de abajo
      contra el branch. Si algo falla ahí, no hay día D.
- [ ] Ventana elegida con poco movimiento (MAGRA cerrada, sin turnos del club en curso).
- [ ] Avisos enviados (ver §7, «quién avisa a quién»).

## 0 bis. `mercadopago` en todos los negocios — JUSTO ANTES del push a main

Va FUERA de la ventana del paquete y ANTES de ella. Con S1/P1 desplegados, un aviso de MP de un
negocio sin `mercadopago` en `Tenant.modules` se contesta 200 y se descarta (`mercadopago-dispatch.ts`,
auditado como `negocio-sin-mercadopago`): **MP no lo reintenta**. Por eso se corre antes del push, no
después (cert. del pase, vuelta 2, O-1).

🔴 **Precondición (cert. del pase, F1):** el dueño mira en Vercel prod `MP_MODO`, `MP_ACCESS_TOKEN`
(de qué cuenta es), `MP_SIMULAR_AVISOS` y `MP_MODO_LEGADO`. Con el módulo, el código viejo arma
«Link de pago» con el token global, y el nuevo también si `MP_MODO_LEGADO=1`. Si `MP_MODO` es `test` o
`real` y hay negocios SIN conexión MP propia que no son los dueños de ese token, sus links cobrarían en
la cuenta del despliegue: **no correr, y no publicar S1/P1, hasta que el dueño decida** (conexión
propia por negocio, o apagar MP en esos negocios). Ojo: entre el 0 bis y el *Ready*, el código viejo
usa el token global **aun para negocios con conexión propia** (no conoce conexiones). Con `MP_MODO`
vacío o `stub` no hay efecto de plata; si `MP_SIMULAR_AVISOS` está prendido, apagarlo antes (si no,
aparece «Simular que pagó» en todos los negocios).

```bash
set -o pipefail
cd prisma/pending-gate2
psql -X -v ON_ERROR_STOP=1 -d "$MIGRATE_DATABASE_URL" -f N2_modulo_mercadopago.sql 2>&1 | tee ~/0bis-$(date +%F-%H%M).log
echo "psql salió con $?"   # tiene que ser 0
cd -
```

La salida (`RETURNING`) es la lista exacta de negocios que cambiaron: guardar el `.log` (lo pide la
reversa). **Si el `.log` no termina en `COMMIT` o psql no salió con 0, no vale**: no se cambió nada
(el bloque final falla si queda un negocio sin el módulo). Negocios dados de alta después del día D
nacen sin el módulo (presets): decisión del dueño pendiente (cert. F6).

Control después del deploy (a los 10 minutos y al día siguiente), con el rol directo — tiene que dar 0:

```bash
psql -X -d "$MIGRATE_DATABASE_URL" -c "SELECT count(*) FROM \"AuditLog\" WHERE entity = 'WebhookMercadoPago' AND action = 'rechazado' AND changes->>'motivo' = 'negocio-sin-mercadopago' AND \"createdAt\" > '<hora del 0 bis, ej. 2026-11-02 08:00-03>'"
```

(Con el rol directo dueño de la tabla y sin `0003_force_rls`, ve todos los negocios; si se aplicó
FORCE, correrla con un rol BYPASSRLS o da 0 falso.) Si da más de 0: esos pagos no se acreditaron solos; reenviarlos desde el panel de MP o con el botón de sincronizar de Mercado Pago en Facturación → Bancos (`MercadoPagoSync.tsx`)
del negocio.

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
$P -f N2_enums.sql            # 2 · DEBITO, CREDITO (D-C01), REPARTIDOR, ENCARGADO, CashMethod.TRANSFERENCIA (M1-C2) — SIN --single-transaction:
                              #     cada ADD VALUE es su propio paso (no usable en la misma tx)
                              #     🔴 IRREVERSIBLE: Postgres no tiene DROP VALUE (ver §5)
$P -f N2_hub.sql              # 3 · ApiKey, WebhookSuscripcion, EntregaWebhook, PlantillaWhatsapp, OutboxEvent.version/clave
$P -f N2_pagos.sql            # 4 · PagoExterno (decisión: Payment no se extiende; ver el archivo)
$P -f N2_retail.sql           # 5 · Client.limiteCredito, Order.cobroVerificadoEn/Por
$P -f N2_club_indice.sql      # 6 · ClubReservaIndice
$P -f N2_integraciones_ruteo.sql  # 6 bis · gsg_conexion_por_cuenta / gsg_conexiones_activas (pase N2; un WARNING «devolverán 0 filas» = FORCE o creador no dueño: anotarlo, no frena)
$P -f ../rls/0001_enable_rls.sql   # 7 · re-ejecución: policy tenant_isolation en TODA tabla con tenantId
```

- El paso **0 bis** (`N2_modulo_mercadopago.sql`) NO va en este bloque: ver §0 bis.
- Los 1, 3–6 y 6 bis tienen `BEGIN … COMMIT` adentro: si uno falla, ese archivo no deja nada a medias.
- Todos son idempotentes: si se corta la luz a mitad, se vuelve a correr **desde el archivo que
  falló** (o desde el 1; no rompe nada).
- `ON_ERROR_STOP=1`: ante el primer error, psql frena. **No seguir con el siguiente archivo**: ir a §5.

### 2.3b · Re-backfill de `OutboxEvent.clave` (P2) — dos minutos después del paso 3

Un proceso vivo que preguntó por las columnas ANTES del paso 3 guarda «no están» 60 s
(`TTL_NEGATIVO_MS`, `src/lib/schema-probe/probe.ts`) y en ese rato escribe eventos con `clave` NULL y
la clave en `payload._clave`. Pasados **2 minutos** desde el paso 3 (con la app corriendo), volver a
correr el backfill del pie de `N2_hub.sql` («PASO POSTERIOR»), que está en su propio archivo:

```bash
cd prisma/pending-gate2   # si no seguís en la misma terminal del §2
P="psql -X -v ON_ERROR_STOP=1 -d $MIGRATE_DATABASE_URL"
$P -f N2_hub_posterior.sql
cd -
```

Esperado: `UPDATE 0` o pocas filas, y el `SELECT` final vacío. Cada fila que liste es un duplicado de
un mismo hecho (de dos tardías completa una sola): **avisar, no borrar**. Idempotente; se puede
repetir.

## 3. Verificar RLS en vivo

Desde la RAÍZ del repo (después del `cd -`):

```bash
RLS_AUDIT_DATABASE_URL="$MIGRATE_DATABASE_URL" node prisma/rls/check-rls-live.mjs
```

Tiene que salir con código 0 y listar `tenant_isolation` en: `ProductBatch`, `ProcessingRun`,
`ProcessingOutput`, `ApiKey`, `WebhookSuscripcion`, `EntregaWebhook`, `PlantillaWhatsapp`,
`PagoExterno`, `ClubReservaIndice` (además de las de siempre). Si sale 1: re-correr el paso 7 y
repetir; si sigue en 1, §5.

Funciones de ruteo (6 bis). `APP_DATABASE_URL` = la `DATABASE_URL` de Vercel prod (rol `app_rls`),
exportada en la terminal del dueño sin imprimirla. Las dos cuentas tienen que dar lo mismo:

```bash
export APP_DATABASE_URL='<DATABASE_URL de Vercel prod>'   # no se imprime
psql -X -d "$APP_DATABASE_URL" -c "SELECT count(*) AS por_funcion FROM gsg_conexiones_activas('mercadopago', 1000)"
psql -X -d "$MIGRATE_DATABASE_URL" -c "SELECT count(*) AS como_dueno FROM \"IntegracionConexion\" c JOIN \"Tenant\" t ON t.id = c.\"tenantId\" WHERE c.conector = 'mercadopago' AND c.estado IN ('conectada','con_problemas','requiere_reconectar') AND COALESCE(t.\"modules\", '{}') @> ARRAY['mercadopago']"
```

Si `por_funcion` da 0 y `como_dueno` más: el creador no es dueño de la tabla o hay FORCE RLS (el 6 bis
lo avisó con un WARNING). No rompe nada hoy (ningún código las llama): anotarlo para P5/P6.

Chequeo rápido de enums (opcional):
`SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname IN ('PaymentMethod','UserRole');`

## 4. Humo (clic por clic, en producción, con un usuario real de cada negocio)

Los procesos vivos ven lo nuevo en ≤ 60 s (caché del probe); para que sea inmediato, *Redeploy*
del último deploy en Vercel (sin push).

1. **Login**: entrar a `/admin` de MAGRA y de Break Point con OWNER. Carga el inicio sin error.
2. **Vender (MAGRA)**: mostrador → un corte por peso → cobrar en Efectivo → aparece en la caja del
   día. Si M1 ya está integrada, ver que aparezcan **Débito** y **Crédito** como medios separados
   y que el cierre de caja los sume en la columna **Tarjeta** (D-C01). Con el paso 2.e, vender por
   **Transferencia** y ver en el cierre la columna Transferencia **sin saldo al abrir** y con lo
   vendido hoy como esperado (F2: se cuenta lo que entró en el período, no el saldo del banco).
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
| 0 bis | `N2_modulo_mercadopago.sql` | 🔴 sólo si main vuelve a un código ANTERIOR a S1/P1 (con S1/P1 desplegados, sacar el módulo corta los avisos de MP). `array_remove` sólo para los slugs del `.log` del §0 bis | no, pero corta cobros si se hace con el código nuevo |
| 1 | `CarniceriaRubro.sql` | bloque `ROLLBACK` al pie (tablas, enums y 2 columnas de Product) | lotes y despieces cargados |

Después de una reversa: *Redeploy* en Vercel (los procesos vivos cachean el «sí está» del probe
para siempre; un proceso nuevo vuelve a preguntar) y repetir el humo §4. Si se recreó un tipo del
paso 2 (procedimiento manual al pie de `N2_enums.sql`), hacerlo **en ventana, sin ventas, y con el
redeploy antes de reabrir**: un proceso vivo que ya vio `CashMethod.TRANSFERENCIA` sigue
escribiéndolo y cada venta por transferencia falla hasta que se reinicia (cert. M1 v6 F3).

### 5 bis. Vuelta atrás del código de M1 (pase del 30/10/2026)

M1 salió antes que el resto del paquete: sus tres valores (`PaymentMethod.DEBITO`,
`PaymentMethod.CREDITO`, `CashMethod.TRANSFERENCIA`) se aplicaron con la migración
`20261030120000_m1_enums_caja` (`prisma migrate deploy`). No se pueden borrar. El código de antes
(`e2976802`) no los conoce: su cliente de Prisma falla al LEER cualquier fila que los use, y eso
rompe caja, ventas y KPIs.

**Regla (decisión del dueño, 30/10):** antes de revertir, correr esta consulta (sólo lectura):

```sql
SELECT
  (SELECT count(*) FROM "Order"         WHERE "paymentMethod"::text IN ('DEBITO','CREDITO')) AS pedidos,
  (SELECT count(*) FROM "Collection"    WHERE method::text          IN ('DEBITO','CREDITO')) AS cobros,
  (SELECT count(*) FROM "CashMovement"  WHERE method::text          = 'TRANSFERENCIA')       AS libro;
```

- **Las tres en 0:** se puede revertir el código a `e2976802` (los valores quedan en el tipo, sin
  filas que los usen, y el código viejo los tolera). Redeploy y humo §4.
- **Alguna mayor que 0:** NO se revierte. Se arregla hacia adelante sobre M1 (rama
  `n2/m1-caja-medios-dc01`, certificada v10).

Otras tablas con `PaymentMethod` (pagos, deudas, turnos) entran en la misma regla si la consulta
se amplía; las de arriba son las que escribe M1.

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
| Fin OK, con el paso 2.e | Dueño GSG | Contadora de cada negocio | WhatsApp / mail | «Desde hoy el libro de caja separa Transferencia de Mercado Pago: el CSV del libro suma una columna Transferencia en los meses que la tengan. En el cierre del día, Transferencia es lo que entró ese día, no el saldo del banco.» |
| Reversa | Dueño GSG | Encargados | WhatsApp | «Volvimos a la versión anterior.» Si se restauró el branch del §1, lo cargado durante la ventana se perdió: recargarlo desde el papel |

Contactos: provisional a confirmar (los carga el dueño; no van en el repo).

— Elaborado por GSG
