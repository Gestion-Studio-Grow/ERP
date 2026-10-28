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
