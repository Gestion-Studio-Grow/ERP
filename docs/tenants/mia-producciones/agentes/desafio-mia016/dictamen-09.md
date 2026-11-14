# Dictamen · certificación en contra de `09-tecnica-ejecucion.md` (commit 46f5b52) · 14/11/2026

Objeto: `git show 46f5b52:docs/tenants/mia-producciones/agentes/09-tecnica-ejecucion.md` («09 :n» = línea del objeto).
Esquema de 1A: `73386729` = `origin/agentes/tanda-1` 490d2048 (la migración `20261115120000_agentes_base` es idéntica byte a byte).
No se reabre el permiso más chico (decisión del dueño). Neon no se tocó.

## Evidencia ejecutada
Postgres 16 local (puerto 5433), base descartable `cert09`, ya borrada; cluster devuelto a «down».
Scripts en `scratchpad/cert09/`: `enmienda-unificada.sql` (esquema unificado + D1–D4, traducción literal), `ataques09.sql`,
`carreras.mjs` (dos conexiones como `app_rls`), `candado2-09.mts` (Prisma 7.8, cliente generado del esquema de 1A).

| Prueba | Resultado |
|---|---|
| D1a · `REVOKE UPDATE ("userId","clave","pedidoEl")` con permiso de tabla (0002:58) | **Sin efecto**: `app_rls` cambia `userId` a `u-direccion` y reescribe `recorte`; `has_column_privilege(...,'userId','UPDATE') = true` |
| D1b · forma del 09: `REVOKE UPDATE ON` la tabla + `GRANT UPDATE (estado, tomadoHasta, intentos, respondidoEl, respuesta, filas, motivo, conModelo, respondidoPor)` | `userId` y `recorte`: *permission denied*; `estado`/`intentos`: OK. **El D1 del 09 es correcto** |
| D1c · volver a correr `GRANT … ON ALL TABLES` (0002:58) | Deshace D1b: `userId` vuelve a ser editable. Hay que repetirlo en 0002 |
| A1 · v1 (topes 999.999.999) reemplazada por v2; revocar v2; `UPDATE v1 SET "reemplazadaEl"=NULL` como `app_rls` | **Aceptado: v1 vuelve a estar viva con los topes amplios.** El GRANT por columna incluye `reemplazadaEl` y el disparador sólo mira `revocadaEl` |
| A2 · alta con `metodo='OPS'`, `firmanteUserId` NULL, topes amplios, como `app_rls` | **Aceptada**: `AgenteAutorizacion_firmante_check` se esquiva cambiando `metodo` |
| A3 · candado de llaves paso 2 (`SET "revocadaEl"=NULL` sobre nulo) como `app_rls` | Pasa (permiso de columna + disparador OK) |
| L1 · motor con el candado de A3 abierto; otra conexión revoca | La revocación **espera** (lock timeout): H1 corregido para la autorización |
| Prisma `updateMany(..., data:{ pausadoPor:null })` | Emite `UPDATE … SET "pausadoPor", "updatedAt"`; la pausa espera. H1 corregido para la pausa |
| F1 · propuesta `origen='PEDIDO'`, `pedidoId='p1'`, `solicitadoPor` NULL | **Aceptada**: la FK compuesta es MATCH SIMPLE y no se mira si una columna es nula |
| F2 · `solicitadoPor` distinto del dueño del pedido | Rechazada por la FK (H6 OK cuando no es nulo) |
| F3 · pedido derivado (K5) con `userId` de Dirección | Aceptado: nada ata el derivado al original |
| I1 · propuesta RECHAZADA por una persona; la rutina inserta la misma `clave` con `ON CONFLICT DO NOTHING` | **Se crea otra PENDIENTE** (`f1=RECHAZADA, i1=PENDIENTE`) |
| I2 · REVERTIDA + misma clave | No inserta (H8 OK) |
| D3 · `fuenteId=''` con `modo='REGLA'` y monto | Aceptada |
| D4 · `modo='regla'` (minúscula), con monto y sin autorización ni fuente | **Aceptada**: sin CHECK de dominio, D3 y D4 no se aplican |
| D4b · `autorizacionVersion=99` sobre la autorización v3 | Aceptada |
| P1 · `decididaPor = solicitadoPor` | Aceptada (sólo lo frena el código) |
| C1 · conciliar literal (`acciones-empresa.ts:238-239`) desde dos conexiones, mov. m1 y m2 → cuota q1 | **u1=1, u2=1: dos movimientos atados a q1** |
| R1 · `REVOKE` corrido por un rol que no es el dueño y tiene DML sin GRANT OPTION | Sólo un `WARNING: no privileges could be revoked`; `app_rls` conserva UPDATE. `migrate deploy` no falla por un WARNING |

## Hallazgos

| id | sev | 09 :línea | problema | corrección concreta |
|---|---|---|---|---|
| X1 | BLOQUEANTE | :31, :35, :361 | Revive la autorización reemplazada (A1, probado). «Revocar la última no revive la anterior» es falso con el GRANT de `reemplazadaEl` | Disparador `AgenteAutorizacion_irreversible`: `RAISE` si `OLD."revocadaEl" IS NOT NULL` **o** si `OLD."reemplazadaEl" IS NOT NULL AND NEW."reemplazadaEl" IS DISTINCT FROM OLD."reemplazadaEl"`. Test en §14 «retirar un reemplazo: rechazado» |
| X2 | BLOQUEANTE | :137-141, :152-155, :170 | Se puede falsificar quién pide con un nulo (F1): propuesta PEDIDO sin `solicitadoPor` pasa la FK. Saltea «quien pidió no aprueba» y el permiso de la persona | `AgentePropuesta_procedencia_check CHECK ((origen='PEDIDO') = ("pedidoId" IS NOT NULL) AND ("pedidoId" IS NULL) = ("solicitadoPor" IS NULL))` |
| X3 | BLOQUEANTE | :239, :330, :416 | Ítem 7: el 09 no pone a GSG-MIA-018 como condición. `conciliarEnTx` «con candado» no dice cuál; extraída tal cual, mantiene la carrera (C1, probado). La clave `B2:cuota` sólo frena agente contra agente, no agente contra persona | B2 y C4 sin liberar (§17.1) hasta que GSG-MIA-018 esté integrado, con su test de carrera en verde. `conciliarEnTx`: `SELECT … FROM "ProyectoCuota" WHERE id=$1 FOR UPDATE` (crudo, en `proyectos`) antes de mirar `cuotaId`. Índice `ProyectoMovBanco_tenantId_cuotaId_key ON ("tenantId","cuotaId") WHERE "cuotaId" IS NOT NULL` (es de MIA-018, no de agentes_base) |
| X4 | ALTO | :202-226, :240, :250 | El cobro suelto (`registrarCobro`, `acciones.ts:212`) comparte el pendiente con C4: «Marcar cobrado» cobra sólo lo que falta, porque el cobro suelto ya se descontó de las cuotas más viejas (`acciones-ficha.ts:766-772`). Si la persona carga el cobro suelto del mismo depósito y el agente corre C4 sobre otra cuota, el depósito se cuenta dos veces, hasta `porCobrar` | C4 exige `pendiente == cuota.monto` (ningún cobro suelto asignado) y ningún `ProyectoPago` sin cuota del proyecto con el mismo importe en la ventana de 10 días: si no, una persona |
| X5 | ALTO | :63-77, :14 | Autofirma, ítem 2. (a) «Titular» = `OWNER` y puede haber varios (`reset-owner-por-slug.ts:10`); un OWNER da de alta otro (`user-actions.ts:87`, rol del formulario). (b) Un operador de GSG resetea la clave del OWNER (`resetOwnerPorSlug`), entra y firma. (c) El ERP no tiene un «volver a pedir la contraseña»: hay que construirlo. (d) El interruptor `equipo-agentes-ejecuta` es por negocio y se prende **una vez**: después, ampliar topes hasta el techo es **una sola mano**. Contradice :14. (e) A2: cualquier código con `app_rls` inserta con `metodo≠APP_CON_SESION`. Evidencia que queda: la fila (UPDATE de contenido y DELETE revocados) y `AgenteAccion` AUTORIZACION (sólo INSERT); el rastro del reset va en `AuditLog` y se purga a los 18 meses | `AgenteAutorizacion_metodo_check CHECK (metodo = 'APP_CON_SESION' AND "firmanteUserId" IS NOT NULL)`. Ampliar (v(n) con operaciones o topes mayores que v(n-1)) entra con `vigenteDesde >= firmadoEl + 24 h` (el código lo exige) y con aviso a **todos** los OWNER y a GSG; revocar sigue siendo inmediato. La acción de reset del OWNER revoca la autorización viva. H4: **cumple en parte** |
| X6 | ALTO | :32-36, :129 | Lo que una persona rechazó, la rutina lo rehace (I1, probado): RECHAZADA libera la clave. Es el mismo defecto que H8 | `AgentePropuesta_tenantId_clave_viva_key … WHERE estado IN ('PENDIENTE','EJECUTADA','REVERTIDA','RECHAZADA')`; volver a proponer usa `<clave>:rehecha:<n>` |
| X7 | ALTO | :51-52 | D3 y D4 no se aplican con `modo` libre (D4, probado). Además `fuenteId=''` pasa, y `autorizacionVersion` no está atada | `modo TEXT NOT NULL DEFAULT 'PERSONA'` + `AgentePropuesta_modo_check CHECK (modo IN ('REGLA','PERSONA'))`. En D3: `… OR ("fuenteTipo" IS NOT NULL AND char_length("fuenteId") > 0)`. Único `AgenteAutorizacion_tenantId_id_version_key` y FK `AgentePropuesta_tenantId_autorizacion_version_fkey ("tenantId","autorizacionId","autorizacionVersion")`, más `CHECK (("autorizacionId" IS NULL) = ("autorizacionVersion" IS NULL))` |
| X8 | ALTO | :49, coordinadora | D1 correcto (probado), pero (i) 0002 lo deshace (D1c) y (ii) un REVOKE corrido por quien no es dueño es un no-op silencioso (R1). Con qué rol migra producción: no verificado | Enmienda y 0002 con la forma D1b. Al final de la migración, `DO` que haga `RAISE EXCEPTION` si `has_table_privilege('app_rls','"AgenteAccion"','UPDATE')`, `has_column_privilege('app_rls','"AgentePedido"','userId','UPDATE')` o `has_table_privilege('app_rls','"AgenteAutorizacion"','UPDATE')` siguen en verdadero |
| X9 | MEDIO | :147-149 | TOCTOU entre el tope y la ejecución: monto, moneda y respaldo se calculan fuera de la transacción (paso 1), y el tipo de cambio también (`acciones-ficha.ts:765`, `aPesos`). La huella se calcula en la misma transacción que crea la propuesta: no compara nada contra el paso 1 | En el paso 3, recalcular con `tx` `montoCentavos`, `moneda`, el pendiente y la unicidad del respaldo. Si alguno difiere del paso 1, se aborta (va a una persona) |
| X10 | MEDIO | :185-187, :250 | H12: el esquema unificado dejó afuera `moneda='ARS'`, y el 09 admite otras monedas con tope. Pero `cobrarCuota` asienta en pesos con el tipo de cambio (`ProyectoPago.monto`, `cashMovement.amount`), mientras el cupo cuenta en la moneda de la cuota | Hasta un diseño en USD: `AgentePropuesta_monto_check` con `("moneda" IS NULL OR "moneda"='ARS')` |
| X11 | MEDIO | :239, :250-257 | H14 aplicado sólo a C4: B2, que elige el par, no exige unicidad en las dos direcciones ni fecha | Mismo «respaldo exacto» en B2 (`conciliarEnTx`) |
| X12 | MEDIO | :461-466 (D6) | `LiberacionOperacion` no está en `PURGE_EXEMPT_ENTITIES` (`audit-retention.ts:31-48`): a los 18 meses se borra. Falla cerrado (la operación deja de ejecutar), pero se pierde la prueba de la liberación. Es forjable por `app_rls` igual que un interruptor. Sólo la frena el código | Sumar la entidad a `PURGE_EXEMPT_ENTITIES` y al rechazo de `audit()`. En `changes`: `sha256` del expediente y el commit. Si se exige garantía en la base: tabla `AgenteLiberacion` con `REVOKE INSERT, UPDATE, DELETE` a `app_rls`, escrita por un script de operaciones (Gate) |
| X13 | MEDIO | :140, :284 | Pedido derivado (K5) y rescate: la base no ata el derivado al original (F3). Con `permisoVivo` el daño queda acotado al permiso del agente | `AgentePedido.origenPedidoId TEXT` + FK `AgentePedido_tenantId_origenPedidoId_userId_fkey ("tenantId","origenPedidoId","userId") → AgentePedido("tenantId","id","userId")` |
| X14 | BAJO | :154 | «Quien pidió no aprueba» sólo en código (P1) | `AgentePropuesta_no_aprueba_lo_propio_check CHECK ("solicitadoPor" IS NULL OR "decididaPor" IS DISTINCT FROM "solicitadoPor")` |
| X15 | BAJO | :325, :402 | `lastClosedDayTx` (`frontera-cierre.ts:73-82`) lee sin trabar: un cierre del día simultáneo pasa | Tomar el mismo candado que el cierre diario, o ejecutar sólo antes de la hora de cierre |
| X16 | BAJO | :308-309 | La invariante «sin `<datos>` con herramientas que escriben» se prueba sólo con el guion | Aserción en tiempo de ejecución en el envoltorio de la llamada (lanza error) |

**Ítems del brief.** 3 (§3): **corrige H1** para la pausa y la autorización (L1 y Prisma, probados); el interruptor queda con el margen declarado.
5 (§5): `permisoVivo` se recalcula en la transacción (correcto); se puede falsificar quién pide sólo con el nulo de X2.
4: con REVERTIDA, la idempotencia queda bien (I2); el agujero es RECHAZADA (X6). H10 OK, con X3. H13 OK para C4: `anularCobro` + `reabrirCuotaTx` revierten el cobro, la caja y el saldo, y las cuotas de empresa quedan afuera. H14 cumple en parte (X11). H12 cumple en parte (X10).
6: §10 sólido (X16 menor). §16 responde los 40 puntos, pero 6, 20, 30, 35 y 40 (interruptor) se dan por cubiertos sin mecanismo propio, y 26 queda para decisión.
7: el agente no usa `registrarCobro` (bien). Sí corre sobre el mismo pendiente (X4) y sobre conciliar sin arreglar (X3). **Hoy lo deja.**

## Dato de 1A (coordinadora): scripts que vuelven a dar UPDATE/DELETE
`git grep` en `origin/agentes/tanda-1` 490d2048: `prisma/rls/aislamiento-ataque-db.mjs:59`, `verify-wiring.mts:55`,
`verify-provision-gate.mts:137` y además **`verify-tenant-resolution.mts:48`** (cuarto). Corren sobre `erp_val` local o PGlite.
- **No invalidan pruebas.** Los privilegios son por tabla y por base. El test de 1A (`agentes-aislamiento-postgres.test.ts:184-200`) usa una base efímera propia (`src/test/base-efimera.ts:7,12`). Nuestras `pruebas-certificacion/` usaron `cert0708` y `cert09`, que nunca corrieron esos scripts. Además, volver a otorgar sólo puede hacer que un ataque *pase*: no oculta ninguno. Los «rechazado» previos (único de la contra, RLS entre negocios) no dependen de los GRANT.
- **Sí falsean** cualquier prueba de privilegios que se corra en `erp_val` después de ellos.
- **Cambiar:** que esos 4 scripts no tengan el GRANT en línea y corran `prisma/rls/0002_app_role.sql`, que ya repite los REVOKE. Después, un test que corra cada script y afirme con `has_table_privilege` y `has_column_privilege` (AgenteAccion UPDATE/DELETE = false, AgenteAutorizacion UPDATE de tabla = false, AgentePedido `userId`/`recorte` UPDATE = false).
- **Producción:** el REVOKE lo tiene que correr el dueño (`neondb_owner`). Si no, es un WARNING silencioso (R1): de ahí la aserción de X8.
- `scripts/publicar/lib/sql.mjs:380,393` frena toda migración con REVOKE o GRANT: la enmienda es Gate 2 explícito.

## Esquema final · UNA enmienda a `20261115120000_agentes_base` (antes de aplicar)
1. Todo `esquema-unificado.md` (48dd0028), con estos cambios.
2. **AgentePedido:** `REVOKE UPDATE ON "AgentePedido" FROM app_rls; GRANT UPDATE ("estado","tomadoHasta","intentos","respondidoEl","respuesta","filas","motivo","conModelo","respondidoPor")` (reemplaza el REVOKE por columna). Columna `origenPedidoId TEXT` + FK `AgentePedido_tenantId_origenPedidoId_userId_fkey`.
3. **AgenteAutorizacion:** disparador `AgenteAutorizacion_irreversible` (X1); `AgenteAutorizacion_metodo_check CHECK (metodo='APP_CON_SESION' AND "firmanteUserId" IS NOT NULL)` (reemplaza `_firmante_check`); únicos `AgenteAutorizacion_tenantId_id_key` y `AgenteAutorizacion_tenantId_id_version_key`.
4. **AgentePropuesta:** `modo TEXT NOT NULL DEFAULT 'PERSONA'` + `AgentePropuesta_modo_check`; `fuenteTipo`, `fuenteId` + `AgentePropuesta_fuente_check` (con `char_length("fuenteId")>0`); `AgentePropuesta_regla_check` (D4); `AgentePropuesta_procedencia_check` (X2); `AgentePropuesta_no_aprueba_lo_propio_check`; FK `AgentePropuesta_tenantId_autorizacion_version_fkey` + `CHECK (("autorizacionId" IS NULL)=("autorizacionVersion" IS NULL))`; `AgentePropuesta_monto_check` con `moneda='ARS'`; `AgentePropuesta_tenantId_clave_viva_key … WHERE estado IN ('PENDIENTE','EJECUTADA','REVERTIDA','RECHAZADA')`.
5. **Repetir 2–3 en `prisma/rls/0002_app_role.sql`** (como ya hace con AgenteAccion).
6. **Cierre:** un `DO` que aserte los privilegios (X8) y haga `RAISE EXCEPTION` si alguno quedó otorgado.
Fuera de agentes_base: `ProyectoMovBanco_tenantId_cuotaId_key` (GSG-MIA-018).

## Veredicto del 09: NO CUMPLE
Tres bloqueantes: X1 revive topes revocados; X2 falsifica quién pide; X3 deja a B2/C4 sobre conciliar sin arreglar.
Son correcciones de esquema y una condición de liberación. Corregidas, la próxima vuelta mira sólo X1 a X8.
