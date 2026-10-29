# Dictamen de certificación — Tanda S2 (paquete Gate 2 nivel 2)

Diff: `a48c3f0..n2/s2-paquete-gate2` (tip 433b718) · Riesgo: datos · Vuelta 1 · Fecha 2026-10-28.
Todo se corrió en el Postgres 16 local (localhost:5433), en bases efímeras propias. Nada contra Neon.

## Veredicto: CON OBSERVACIONES (sin fallas alta/media)

## Verificación ejecutada
- Suite del repo `src/lib/schema-probe/*.test.ts` con GATE2_PG_URL local: **14/14**.
- Test adversarial `adversarial-s2.test.mjs` (esta carpeta): **9/9**:
  - FK compuestas: la suscripción, la plantilla, el PagoExterno y la entrega NO pueden apuntar a la conexión, al evento o a la suscripción de OTRO negocio; monto negativo rechazado.
  - RLS con un rol sin bypass: sin negocio no se ve ninguna de las 6 tablas nuevas; con A no inserta en B.
  - Plata: 8 INSERT concurrentes del mismo payment_id dan 1 fila; 8 UPDATE `aplicadoEn IS NULL` concurrentes dan 1 cobro aplicado; el mismo payment_id en otro negocio no choca.
  - `OutboxEvent.version`=1 en las filas existentes; la `clave` deduplica por negocio.
  - La reversa de enums nombra TODAS las columnas que usan `PaymentMethod`/`UserRole` (consultado en pg_attribute).
  - `check-rls-live.mjs` sale con 0 después del paquete (paso 3 del runbook).
  - El paquete aplicado de nuevo con datos cargados no toca ninguna fila.
- `tsc --noEmit` (copia en el scratchpad, `prisma generate` en cada estado): **0 errores** con `// N2:` comentado y **0** con `// N2:` descomentado.
- C1–C6, revisados en los archivos: aditivos, IF NOT EXISTS y guardas DO, reversa al pie, tandas declaradas; ADD VALUE en pasos separados y sin BEGIN; decisión PagoExterno escrita en N2_pagos.sql:9-31; runbook con branch/pg_dump, orden 1-7, check-rls-live, humo (login, Vender, Agenda), reversa por archivo y quién avisa a quién.

## Fallas
1. **Baja**: `EntregaWebhook_tenantId_outboxEventId_fkey ON DELETE RESTRICT` (N2_hub.sql:128). Cuando el hub registre entregas, el reseteo de go-live (`src/lib/reset-golive-db.ts:167`, `outboxEvent.deleteMany`) y cualquier purga del outbox fallan por FK. Falla cerrada (la tx vuelve atrás), sin daño a los datos. Test: `adversarial-s2.test.mjs` › «vecino (reset-golive / purga de outbox)». Arreglo: anotarlo como deuda de P3. Opciones: sumar EntregaWebhook (y PagoExterno/ClubReservaIndice) al plan de `reset-golive`, o usar `ON DELETE SET NULL` en esa FK.

## Observaciones (sin test, no bloquean)
- `probe.ts` `olvidar()` con una consulta en vuelo: el `finally` viejo puede borrar del mapa `enVuelo` la promesa nueva, y el `cache.set` viejo repone el valor anterior a `olvidar`. Sólo afecta a tests y a un endpoint de operador.
- Enums: cuando M1 o M6 escriban TARJETA/REPARTIDOR/ENCARGADO, un cliente Prisma generado sin esos valores falla al LEER esas filas. M1 y M6 tienen que encender `// N2-enum:` y desplegar ANTES de escribir el primer valor.
- C7: el «sin diferencias» se mide como un diff igual a la línea de base (CarniceriaRubro queda fuera de schema.prisma). Además exige descomentar `// N2-enum:`, que rompe tsc a propósito (está documentado).
- ApiKey con RLS: buscar por prefijo antes de conocer el negocio no encuentra nada con el rol de la app. Está anotado como deuda de P4 (N2_hub.sql:38-40).

---

## Vuelta 2 — respuesta del ingeniero (28/10/2026, para re-certificar)

Commits `e4d3945..c8ad6a8` sobre `ab84360`. El veredicto de la vuelta 2 lo emite el certificador.

### Falla baja → CORREGIDA: `ON DELETE CASCADE`
- `prisma/pending-gate2/N2_hub.sql` §3 y el modelo `// N2:` de `schema.prisma` (`onDelete: Cascade`).
- Por qué CASCADE: la entrega es el registro de intentos de UN evento; sin el evento no significa nada
  (igual que su FK a la suscripción, que ya era CASCADE). Cierra la falla para todo camino que borre
  eventos (reseteo, purga por antigüedad, operador) sin que cada uno conozca una tabla que el cliente
  de Prisma todavía no tiene. El CASCADE sigue el par `(tenantId, id)`: sólo borra del mismo negocio.
- Por qué no SET NULL: la FK es compuesta; el SET NULL simple pone `tenantId` en NULL (NOT NULL →
  error) y la forma con lista de columnas no se expresa en `schema.prisma` (diff permanente). Además
  NULL ya significa «probar envío».
- Por qué no «borrar antes»: cada purga presente y futura tendría que acordarse; la que no, falla.
- Guarda convergente: si la FK existe con RESTRICT (ensayo previo), se reemplaza; probado r → c → c.
- Test: `paquete-gate2.test.ts` › «vecino»: corre el reseteo REAL (`leerFoto` → `planificarReseteo`
  → `aplicarPlan` → `verificarVacio`) con entregas colgando. Con el SQL anterior falla en
  `reset-golive-db.ts:167`; con CASCADE pasa. También la purga directa de un evento de B.
- **Traspasado a P3:** al encender el modelo, sumar `EntregaWebhook` a `ORDEN_DE_BORRADO`
  (`src/lib/reset-golive.ts`) antes de `OutboxEvent`, para que la auditoría del reseteo las cuente
  (hoy se van por cascada sin contarse; no falla ni deja huérfanos).
- `PagoExterno` y `ClubReservaIndice` no tienen FK hacia nada que el reseteo borre: no lo frenan.
  Si el reseteo debe vaciarlos es decisión de P5/B1 (traspasado, no es del paquete).

### Observaciones
- **`probe.ts` `olvidar()` → CORREGIDA.** Número de generación: la consulta vieja no repone su valor
  ni borra la promesa nueva; la limpieza de `enVuelo` va después del `set` (si `consultar` tiraba en
  el acto, el `finally` leía `promesa` sin asignar: lo marcó tsc). Tests en `probe.test.ts` (las dos
  carreras fallan con el código anterior).
- **Enums y Prisma viejo → CORREGIDA.** Regla «encender `// N2-enum:` y DESPLEGAR antes del primer
  valor» en `N2_enums.sql`, `schema.prisma` y runbook §6. Chequeos automáticos:
  `sePuedeEscribirValorEnum(tipo, valor)` (`src/lib/schema-probe`: la base tiene el valor Y el
  cliente de Prisma de este build lo conoce) y `paquete-gate2-estatico.test.ts` (en `npm test`:
  las marcas `// N2-enum:` = los `ADD VALUE` del archivo).
- **C7 → ACLARADA** en runbook §6 («Cómo se mide "sin diferencias"»). Diseño sin cambios.
- **ApiKey con RLS → TRASPASADA A P4** (`N2_hub.sql` §1): la RLS fail-closed es intencional; el
  camino de resolución previo al contexto es de P4, que autentica con la clave. Relajar la policy
  en el paquete abriría las claves de todos los negocios.

### Decisión del dueño D-C01 (28/10/2026)
- `N2_enums.sql`: `TARJETA` reemplazado por `DEBITO` (2.a) y `CREDITO` (2.b); cada `ADD VALUE IF
  NOT EXISTS` en su paso, sin BEGIN, marcado IRREVERSIBLE, reversa completa comentada.
  `PaymentMethod` no traía ningún valor de tarjeta. Actualizados `schema.prisma`, runbook (paso 2,
  humo, §5, §6), README y tests.
- **M1 (`n2/m1-caja-medios`, otra sesión) tiene que alinearse:** usar `PaymentMethod.DEBITO` y
  `.CREDITO` (no `TARJETA`), encender esas dos marcas `// N2-enum:` y escribir sólo con
  `sePuedeEscribirValorEnum`; el cierre muestra «Tarjeta» = DEBITO + CREDITO. Ojo: `CashMethod`
  (`schema.prisma:173-177`, el libro de caja) ya tiene `TARJETA` y este paquete no lo toca; si M1
  decide separarlo también, ese `ADD VALUE` tiene que entrar al paquete ANTES del día D.

### Verificación de la vuelta 2 (sin Postgres instalado)
- `node scripts/qa/gate2-pglite.mjs` (PGlite = PostgreSQL 17.5 en WASM, en memoria):
  `paquete-gate2.test.ts` **14/14**, con los casos del adversarial reproducidos (el archivo
  `adversarial-s2.test.mjs` no estaba en la rama).
- `probe.test.ts` **11/11**, `paquete-gate2-estatico.test.ts` **3/3**, `reset-golive.test.ts` en
  verde (el de Postgres se saltea sin servidor).
- `tsc --noEmit`: **0 errores** en los archivos de S2. El worktree da 399 errores en 18 archivos
  ajenos, todos por módulos que faltan en el `node_modules` compartido (playwright, three, qrcode,
  pdf-lib).
- **PGlite NO prueba:** concurrencia real (atiende de a un mensaje: los «8 a la vez» dan el resultado
  correcto pero no prueban la carrera ni los bloqueos de fila); bases separadas; `psql` (se emula
  sentencia por sentencia en autocommit); Postgres 16; y que sólo somos superusuario (los permisos
  de `neondb_owner` en Neon no se reproducen). Para eso: el Postgres 16 local con
  `GATE2_PG_URL` (el mismo test corre ahí con `psql`).

---

## Vuelta 2 — dictamen del certificador (28/10/2026)

Diff: `ab84360..f71a43b` (7 commits, `e4d3945`…`f71a43b`) · Riesgo: datos · Sin Postgres instalado: todo
sobre PGlite 17.5 en memoria (`scripts/qa/gate2-pglite.mjs`). Ninguna base remota; sin `.env`.

Veredicto final: CON OBSERVACIONES

Sin fallas alta ni media. Los cinco cierres de la vuelta 1 se sostienen contra tests adversariales
propios. Queda una falla baja nueva (en el test estático que agregó esta vuelta) y una decisión que
hay que tomar ANTES del día D (`CashMethod.TRANSFERENCIA`), que no es defecto de S2.

### Verificación ejecutada
- `node scripts/qa/gate2-pglite.mjs` → `paquete-gate2.test.ts` **14/14**.
- `probe.test.ts` + `paquete-gate2-estatico.test.ts` **14/14** · `reset-golive.test.ts` +
  `reset-golive-postgres.test.ts` **11 pass, 1 skip** (el de Postgres, sin servidor).
- `tsc --noEmit`: **399 errores en 18 archivos, ninguno de S2.** Son TS2307 (playwright 96, three 3,
  qrcode 2, pdf-lib 2) y sus TS7006/TS7031 derivados. Ninguno sale de `schema-probe/`, `scripts/qa/`,
  `reset-golive*` ni `prisma/`.
- Adversariales propios. Están en el scratchpad de la sesión y no se commitean, como pide el rol:
  - `adv-s2/adv-probe.test.ts` (sin base) **5/5**:
    - R1: tres generaciones de `olvidar()` intercaladas, que terminan en orden inverso (una tira, una
      vieja dice true). La caché queda con el valor de la generación vigente y la llamada nueva
      comparte la consulta vigente.
    - R2: después de un error, la llamada siguiente vuelve a consultar.
    - R3: quien ya esperaba la promesa vieja recibe su respuesta, pero esa respuesta no queda en la caché.
    - R4: `sePuedeEscribirValorEnum` corta sin consultar la base si el cliente no conoce el valor; si
      la base falla, da false. `__proto__`, `constructor` y `toString` dan false.
    - R5: el `@/generated/prisma/enums` real no conoce `DEBITO`, `CREDITO`, `TARJETA`, `REPARTIDOR`
      ni `ENCARGADO`, y sí conoce `CashMethod.TARJETA`.
  - Contraprueba: R1, R3 y las tres carreras de `probe.test.ts` **fallan contra el `probe.ts`
    anterior** (`origin/n2/s2-paquete-gate2`). Los tests distinguen el arreglo de verdad.
  - `adv-s2/adv-db.test.ts` (PGlite) **6/6**:
    - D1: `UPDATE "OutboxEvent" SET "tenantId"='tb'` sobre un evento de A que tiene entregas se
      rechaza, como superusuario y como rol de la app. El `ON UPDATE CASCADE` no mueve entregas a otro
      negocio, porque la FK compuesta a la suscripción lo frena.
    - D2: con el rol sin bypass en el negocio A, borrar el evento de B afecta 0 filas. Borrar uno de A
      se lleva sólo su entrega. Las de «probar envío» (sin evento) y las de B quedan.
    - D3: si la FK estaba en RESTRICT y hay datos, correr `N2_hub.sql` dos veces la deja en CASCADE
      (`confdeltype=c`, `confupdtype=c`, validada) y no se pierde ninguna fila.
    - D4: la reversa ESCRITA de `N2_enums.sql` (pasos 1 y 2, descomentados tal cual) corre; los tipos
      vuelven a los valores de hoy, sin `_old`; `check-rls-live` da 0, y `N2_enums.sql` vuelve a aplicar.
    - D5: sobre una base que ya tiene la migración de CH T3 (`20261024120000_ch_medios_tarjeta`, en
      `c4a4b09c`), `N2_enums.sql` no falla ni duplica: quedan 5 valores. D-C01 unifica sin choque.

### Cierres de la vuelta 1, uno por uno
| Cierre | Dictamen | Evidencia |
|---|---|---|
| Falla baja `EntregaWebhook → OutboxEvent` RESTRICT | **CERRADA** | `N2_hub.sql:153-161` + D1, D2, D3 y el subtest «vecino» del repo (reseteo real). CASCADE sigue el par `(tenantId, id)`; las FK actúan sin RLS, pero sólo alcanzan filas del mismo negocio. |
| Carrera de `olvidar()` | **CERRADA** | `probe.ts:95,104,109,118,133` + R1 a R3, y la contraprueba contra el código anterior. |
| Regla de enums | **CERRADA, con una falla baja en el test** (ver abajo) | `sePuedeEscribirValorEnum` (R4, R5) + `paquete-gate2-estatico.test.ts`. |
| C7 en el runbook §6 | **ACLARADA** | Runbook §6, «Cómo se mide "sin diferencias"»; coincide con lo que hace el test. |
| ApiKey con RLS → P4 | **TRASPASADA, aceptado** | `N2_hub.sql` §1. Relajar la policy en el paquete sería peor. |
| D-C01 (`DEBITO` y `CREDITO`) | **CORRECTO** | Un `ADD VALUE IF NOT EXISTS` por paso y sin BEGIN (lo garantiza el test estático); runbook §2 sin `--single-transaction`; reversa completa y probada (D4); idempotente (D5). En `prisma/`, `docs/runbooks/`, `docs/n2/` (fuera de las citas de la vuelta 1), `src/lib/schema-probe/` y `scripts/qa/` no queda `TARJETA` como valor de `PaymentMethod`. |

### Fallas
1. **Baja: el test estático no ve una marca `// N2-enum:` huérfana en un enum que `N2_enums.sql` no toca.**
   - Dónde: `paquete-gate2-estatico.test.ts:56`. `tipos` se arma sólo con los enums del SQL, así que
     el control «viceversa» (`:70`) nunca mira, por ejemplo, `CashMethod`.
   - Reproducción: en una copia, agregar `// N2-enum: TRANSFERENCIA` dentro de `enum CashMethod` y
     correr el test con esa copia como directorio de trabajo: **3/3 en verde**. La mutación inversa
     (un `ADD VALUE` de `CashMethod` sin marca) sí falla.
   - Impacto: si alguien la enciende, el cliente de Prisma conoce un valor que la base no tiene, y el
     INSERT falla en la base. `sePuedeEscribirValorEnum` lo frena si se usa, porque `hayValorEnum`
     da false. Por eso es baja.
   - Arreglo sugerido: recorrer TODAS las líneas `// N2-enum:` de `schema.prisma`, no sólo las de los
     tipos que aparecen en el SQL.

### Pregunta del brief: ¿`CashMethod` necesita `DEBITO` y `CREDITO`? **No.**
- `CashMethod` es el libro de caja: `CashMovement.method`, columnas EFECTIVO · MP · TARJETA
  (`schema.prisma:176-180`, `revisar-cierre.ts:25`).
- La única traducción entre los dos enums es `cashMethodFromPaymentMethod` (`cierre-diario.ts:112-121`).
- El plan que unificó D-C01 lo dice explícito: «`cashMethodFromPaymentMethod` manda ambos a
  `CashMethod.TARJETA`» (`Factory-GSG/.../PLAN-CH-N2.md:266`). CH T3 ya lo implementó así (`c4a4b09c`).
- La columna «Tarjeta» del cierre ES `CashMethod.TARJETA`. La separación vive en
  `Order.paymentMethod`, `Payment.method` y `Collection.method`. Es coherente.
- Matiz para el texto de D-C01: «separados en todo el ERP» no se cumple en los asientos MANUALES del
  libro (`caja/libro/LibroForms.tsx:183`, compras, comisiones, reportes). Esos registran «Tarjeta» sin
  distinguir débito de crédito. Si el dueño quiere esa separación también en el libro, el
  `ADD VALUE` de `CashMethod` tiene que entrar en este paquete antes del día D. Hoy nada lo pide.

### Observaciones (no bloquean S2)
- 🔴 **Hay que decidirlo ANTES del día D (es irreversible): `CashMethod.TRANSFERENCIA`.**
  - M1-C2 pide columnas «EFECTIVO · MP · TRANSFERENCIA · TARJETA» con el «esperado por columna» sacado
    del libro (`PLAN-REINGENIERIA-N2.md:588`). CH C9-C2 pide distinguir MERCADOPAGO de TRANSFERENCIA
    «en el libro» (`PLAN-CH-N2.md:564`).
  - `CashMethod` no tiene TRANSFERENCIA. `cierre-diario.ts:117` manda TRANSFERENCIA a MP. M1 declara
    «Migraciones: ninguna nueva».
  - Hay dos caminos: (a) M1 deriva la columna por el rastro del asiento (`orderId`, `paymentId`,
    `collectionId`), y los asientos manuales en MP quedan ambiguos; o (b) se agrega
    `ALTER TYPE "CashMethod" ADD VALUE IF NOT EXISTS 'TRANSFERENCIA'` a este paquete.
  - Si no se decide antes del día D, (b) exige otra ventana de Gate 2. No es defecto de S2, que cumple
    su fila del plan (§4.5, fila 2). Es un hueco del plan, y es una decisión del dueño o la PMO.
- **El plan sigue diciendo TARJETA** en `origin/main` de Factory-GSG (`da9b8f8`):
  `PLAN-REINGENIERIA-N2.md:343` (§4.5, fila 2), `:404` (S2-C5), `:587` (M1-C1) y D-11.
  - Si M1 sigue el plan y escribe `hayValorEnum("PaymentMethod","TARJETA")`, eso da false para
    siempre y la Tarjeta queda oculta sin error. Falla cerrada, pero el producto no funciona.
  - El test estático sí frena una marca `// N2-enum: TARJETA`. No frena la consulta en el código de M1.
  - Hay que corregir el plan antes de que arranque M1.
- **La regla «encender y desplegar» no cubre volver atrás el código.** Una vez escrito el primer
  `DEBITO` o `ENCARGADO`, un *Instant Rollback* de Vercel a un build anterior a M1/M6 (o un preview
  contra la misma base) vuelve a tener un cliente que no puede LEER esas filas. El runbook §6 no lo
  advierte.
- **CASCADE y retención:** hoy no hay ninguna purga del outbox además del reseteo
  (`reset-golive-db.ts:167`). Cuando P3 sume una purga por antigüedad, se lleva el historial de
  entregas de esos eventos. P3 tiene que fijar la retención de las entregas. Sigue traspasado a P3 que
  las entregas se cuenten en `ORDEN_DE_BORRADO`.

### Lo que no se pudo verificar sin Postgres real
- **Concurrencia:** PGlite atiende de a un mensaje. Los «8 envíos a la vez» (`PagoExterno`, cobro
  aplicado, dedupe del outbox por `clave`) prueban el resultado, no la carrera ni los bloqueos de
  fila. Lo mismo vale para una purga del outbox concurrente con una entrega en curso (CASCADE contra
  un INSERT de `EntregaWebhook` sobre el mismo evento).
- `psql` real: `-f` en autocommit y `ON_ERROR_STOP`. Acá se emuló sentencia por sentencia.
- Postgres 16, que es el de Neon. PGlite es 17.5.
- Bases separadas y estado de sesión por conexión (`SET ROLE`), que PGlite comparte.
- Permisos de `neondb_owner` en Neon para `ALTER TYPE … RENAME`, `CREATE TYPE` y `DROP CONSTRAINT` de
  la guarda convergente. Acá todo corrió como superusuario.
- Para cerrarlo: `paquete-gate2.test.ts` y `adv-db.test.ts` con `GATE2_PG_URL` apuntando a un
  Postgres 16 local con `psql`.

## Vuelta 3 — cierre de la falla baja de la vuelta 2 (orquestador, 28/10/2026)

- **Falla baja → CORREGIDA.** `paquete-gate2-estatico.test.ts` suma «ninguna marca suelta en un enum que
  N2_enums.sql no toca»: recorre TODOS los `enum` de `schema.prisma` y exige que cada `// N2-enum: X` esté en
  el SQL. Reproducción del certificador (marca `// N2-enum: SUELTO` en `CashMethod`): ahora falla con
  `CashMethod.SUELTO: marcado … pero N2_enums.sql no lo agrega`; sin la marca, 4/4 en verde.
- **`CashMethod.TRANSFERENCIA` (M1-C2)** y el texto `TARJETA` de M1-C1 en el plan: no son fallas de S2;
  traspasados a M1 como decisión de la PMO/dueño antes del día D (🔴 un valor de enum agregado no se quita).
- Sin verificar acá (sin Postgres real): concurrencia real, `psql`, Postgres 16 y permisos del rol de Neon.

Veredicto final: CERTIFICA — 0 fallas abiertas; lo que queda son traspasos con dueño (P3, P4, M1).
