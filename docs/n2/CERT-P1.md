Veredicto final: **CERTIFICA** (vuelta 3, al pie) — sin fallas abiertas; queda la verificación con Postgres real. La vuelta 2 fue CON OBSERVACIONES (1 falla baja, corregida en `57a7176`).

# Certificación · Tanda P1 — Conexiones y secretos por negocio

- **Rama:** `n2/p1-conexiones` · **base del diff:** `06b3a0f` (= `origin/main` 90297d9 + merge de `origin/n2/s1-webhooks-por-conexion`).
- **Commits:** `ad7cc9e` núcleo E3 · `430eae8` cobros y webhooks S1 por conexión · `1b2545d` correcciones de certificación.
- **Riesgos certificados:** seguridad, plata. Workflow `tanda-gsg` (Opus), 1 vuelta de corrección, **escaladoAFable: no**.
- **Migraciones:** ninguna. Las tablas E3 (`IntegracionConexion`, `IntegracionCredencial`, `EventoIntegracion`) ya están en
  `20260925120000_lanzamiento_base`.

## Criterios
| ID | Resultado |
|---|---|
| P1-C1 `crearConexion` cifra con `cerrarSecreto`; sin `INTEGRACIONES_MASTER_KEY` → error y nada escrito | cumple |
| P1-C2 `POST /api/integraciones/c/{token}`: fail-closed, `normalizar`, dedupe, `runInTenantContext`, 404 sin pista | cumple |
| P1-C3 MP, WhatsApp y ARCA en `CONECTORES` con simulador y en `src/modules/catalog.ts` | cumple |
| P1-C4 `pagos-dispatch` usa el token de la conexión; env global sólo con `MP_MODO_LEGADO=1`, auditado | cumple |
| P1-C5 webhooks de S1 delegan resolviendo la conexión por firma (tope 20, tiempo constante) | cumple |
| P1-C6 dos negocios, dos conexiones MP, cero cruce; `cuentaExterna` repetida entre negocios rechazada | cumple |
| P1-C7 `rotarCredencial` cambia DEK y `ultimos4`; la vieja deja de verificar | cumple |

## Verificación
- `tsc --noEmit`: limpio. Suites de la zona (integraciones, webhooks, pagos/cobros-dispatch, plugins MP/WA/ARCA, Postgres
  efímero con dos negocios y doble envío): 310/311.
- Suite completa: 6865/6871. Las 6 fallas **ya fallan en la base `06b3a0f`** (verificado corriéndolas ahí) y están fuera
  del diff: `redondeos-locales`, `pie-pegado-zona-segura`, `reminder-sweep-postgres` (sin canal de envío en el arnés) y 3
  subtests de `club/cuenta-y-buffet-pantalla` (selector ambiguo en Playwright).
- Adversariales del certificador, vuelta 2: 8/9. El que falla es la falla baja de abajo.

## Vuelta 1 → corregido en `1b2545d`
1. `/c/{token}` sin handler de MP en producción → ahora acredita con el token de su conexión; sin doble asiento.
2. Links de cobro con token global → token de cada negocio; sin conexión ni flag, `CobrosSinConexionError`.
3. Eventos «recibido» trabados → lease de 5 min, un solo reclamo con reenvíos en paralelo.
4. Tope de 20 mal contado → cuenta conexiones, no negocios; con más de 20, rechazo sin leer pagos.
5. Reconexión sin `cuentaExterna` dejaba dos activas → una sola activa; el token viejo da 404.

## Falla abierta
- **BAJA** · Reconectar la MISMA cuenta de MP (misma `cuentaExterna`) en el mismo negocio da `cuenta_en_uso`
  (`src/integraciones/conexiones.server.ts:255`). Falla cerrada, sin riesgo de plata; `rotarCredencial` sirve de
  alternativa. La va a necesitar el alta por OAuth (P5/P7). Arreglo: reactivar y rotar la conexión del mismo negocio, o
  liberar `cuentaExterna` al desconectar.

## Observaciones (deuda anotada)
- Resolver por firma o cuenta abre una transacción por negocio con el módulo activo. Escala mal y amplifica un DoS
  (lo mitiga el rate limit). Para ir más allá del tope de 20 hace falta una función `SECURITY DEFINER` por `rutaHash` o
  cuenta: es una migración, va al paquete S2 (Gate 2).
- `estadoIntegracionMP` (`mercadopago-auto.ts:357`) mira sólo el token global.
- La propiedad de la `cuentaExterna` de WhatsApp (`phone_number_id`) no se verifica al crear la conexión. Todavía no
  hay pantalla de alta (P7).
- El lease de 5 min puede coincidir con un `maxDuration` de ~300 s. El handler es idempotente por `payment_id`, así que no
  hay doble asiento.

## Lo que carga el dueño (nada de esto lo hizo la tanda)
- `INTEGRACIONES_MASTER_KEY` (y `INTEGRACIONES_MASTER_KEY_ID`) en Vercel.
- `MP_MODO_LEGADO=1` en Vercel **antes** de desplegar P1: sin conexión creada, cobros, links y «Sincronizar MP» fallan
  cerrados. Se saca cuando cada negocio tenga su conexión MP.
- QA por CLI del arnés con `magra` y `breakpoint` (crear conexión, disparar simulador, dos filas de `EventoIntegracion`,
  reenvío → dedupe): queda pendiente para el entorno con base.

## Respuesta del ingeniero — vuelta 3
Commits: `57a7176` reconexión · `573fa1d` estado de MP · `e1cc40a` maxDuration/lease · `82fae3a` arnés PGlite.

| Punto | Destino | Dónde |
|---|---|---|
| **Falla BAJA** — misma `cuentaExterna` en el mismo negocio → `cuenta_en_uso` | **corregido** (`57a7176`) | `crearConexion` (`src/integraciones/conexiones.server.ts`): con el candado por (negocio, conector) busca la misma cuenta en el negocio y reusa la fila: reactiva, token y credenciales nuevos (borra las viejas), `tokenVersion`+1, `reconectada: true`. En otro negocio sigue el rechazo de la base → `cuenta_en_uso`. Test `ADV-reconexion-misma-cuenta` en `certificacion-p1-postgres.test.ts` (dos reconexiones a la vez, token viejo → null, una sola activa, B rechazado). |
| Obs. 1 — resolver por firma abre una transacción por negocio; más allá del tope hace falta `SECURITY DEFINER` | **traspasado a S2** | Es una función nueva en la base = migración; P1 se definió «Migraciones: ninguna». Va al paquete Gate 2. P5-C2 (`notification_url` por conexión) además le quita tráfico al camino por firma. |
| Obs. 2 — `estadoIntegracionMP` mira sólo el token global | **corregido** (`573fa1d`) | `estadoCobrosMP` (`src/lib/pagos-dispatch.ts`) con la misma regla que el dispatch: conexión del negocio; global sólo con `MP_MODO_LEGADO=1`; no abre el secreto. `estadoIntegracionMP(tenantId)` y `estadoMercadoPagoAction` lo usan. Test en `pagos-dispatch.test.ts`. |
| Obs. 3 — no se verifica la propiedad del `phone_number_id` de WhatsApp al conectar | **traspasado a P7** (con P6) | P7-C2: «Conectar WhatsApp … valida con una llamada de prueba». Pide una llamada real a Meta (prohibida en esta tanda) y la pantalla de alta, que no existe todavía. |
| Obs. 4 — el lease de 5 min puede coincidir con un `maxDuration` de ~300 s | **corregido** (`e1cc40a`) | `export const maxDuration = 120` en `api/integraciones/c/[token]`, `api/integraciones/[conector]` y `api/webhooks/mercadopago`. Test en `entrada.test.ts` que exige maxDuration + 1 min ≤ `LEASE_RECIBIDO_MS` en las tres. |
| QA reenvío → dedupe con base | **verificado en parte (PGlite)** | `node scripts/qa/p1-pglite.mjs` corre los tres tests de base de P1 sobre PGlite. Ver abajo qué no se pudo. |

**Verificación**
- `npx tsc --noEmit`: 403 errores, en 42 archivos; **ninguno** es un archivo del diff de P1 (`git diff --name-only 06b3a0f`). Todos vienen de paquetes que faltan en `node_modules` (playwright, three, qrcode, pdf-lib) y sus `any` implícitos.
- Suites de la zona sin base (integraciones, webhooks, pagos-dispatch, mercadopago*, plugins MP/WA/ARCA): 242/244, 22 salteados (los de Postgres). Las 2 fallas (`contrato.test.ts` y `redaccion.test.ts`, guardias estáticas) son de Windows: arman la ruta `C:\C:\n2p1\src`. No son del diff.
- PGlite, con el código final: certificación 5/6 (el nuevo `ADV-reconexion-misma-cuenta` pasa), conexiones 3/5, webhooks 3/5. En la base `eddd362` con PGlite fallan **los mismos** casos (comparado con `git stash`), así que no los trae esta vuelta.

**Lo que NO se verificó (PGlite no lo reproduce)**
- **RLS**: PGlite corre todo como superusuario, que se saltea las políticas.
- **El camino completo del reenvío** (insert → `P2002` → reclamo en otra transacción): después de un error dentro de una transacción, las respuestas de PGlite por socket se desfasan. El reclamo da `count` 1 dos veces y `findFirst` null. Por eso fallan acá `ADV-dedupe`, la dedupe de `conexiones-postgres` y P1-C5 en `webhooks-por-conexion`. Lo que sí se comprobó por separado en PGlite: el duplicado dispara `P2002`, y el reclamo por lease marca una sola vez (`count` 1 y después 0, `intentos` 2). `ADV-C2` pasa en 3 de 4 corridas por la misma inestabilidad.
- Por eso los 9 adversariales y las suites de base tienen que volver a correr contra el Postgres del arnés (CI). En particular, las aserciones de `ADV-reconexion-misma-cuenta` posteriores al rechazo de B quedaron detrás de un error en PGlite.

## Certificador — vuelta 3

Veredicto final: CERTIFICA

Se miró sólo lo corregido: `57a7176` · `573fa1d` · `e1cc40a` · `82fae3a` (y el texto de `b165306`). Sin `.env`, sin
Neon, sin Mercado Pago ni Meta: base PGlite en memoria con el script del ingeniero.

### Fallas reales
Ninguna.

### Cómo se intentó refutar cada cierre

**Reconexión (`57a7176`)** — leído `crearConexion` (`src/integraciones/conexiones.server.ts:216-296`) y atacado con 5
tests propios. Están en el scratchpad del certificador, no en el repo: `cert3-sin-errores.test.ts` y
`cert3-robo.test.ts`. Corridos con `node scripts/qa/p1-pglite.mjs <archivo>`, salieron **5/5**.
- **Robar una cuenta de otro negocio (CERT3-robo).** B pide a la vez la cuenta *desconectada* de A (X) y la *activa*
  (Y). Resultado: `cuenta_en_uso` las dos veces. Las filas y los sobres de A quedan idénticos a la foto previa
  (`rutaHash`, `estado`, `tokenVersion`, `sealed`). La conexión MP de B sigue `conectada`: el `updateMany` que
  desconecta a las demás se revierte con el alta fallida. B no gana filas ni credenciales. El token vigente de A sigue
  resolviendo. Por código: la búsqueda filtra por `tenantId` explícito (además del proxy y de RLS), así que no puede
  devolver la fila de otro negocio aunque RLS no esté.
- **Dos activas de la misma cuenta (CERT3-swap, CERT3-mezcla, CERT3-cred).**
  - MP X → Y → X: siempre queda una sola activa, la reconectada. Mueren el token de Y y el viejo de X.
    `conexionDelNegocio` devuelve X. `tokenVersion` pasa a 1.
  - Reconectar X y dar de alta Z a la vez: una sola activa, sin errores.
  - En WhatsApp (`url-de-app`), reconectar dos veces a la vez deja **una** fila por cuenta, y la otra WA de A sigue
    activa. Además, `@@unique([conector, cuentaExterna])` hace imposible una segunda fila.
- **Pisar credenciales de otra conexión (CERT3-cred, CERT3-conector, CERT3-swap).**
  - Siguen byte a byte iguales las credenciales de la otra WA de A, las de la MP de B y las de la WA de A con la
    *misma* `cuentaExterna` que la MP.
  - Y, ya desconectada, conserva sus credenciales.
  - La reconectada queda sólo con las suyas: 1 o 2 filas, sin restos.
- **Dos reconexiones a la vez.**
  - El candado `pg_advisory_xact_lock` ahora se toma para todo conector, antes de la búsqueda.
  - `tenantTransaction` corre en READ COMMITTED (`src/lib/rls.ts:166-167`). La segunda reconexión lee la fila ya
    confirmada por la primera: actualiza, no inserta.
  - En PGlite la concurrencia está serializada, así que se probó el resultado, no la carrera.

**`estadoIntegracionMP` (`573fa1d`).**
- Único llamador: `estadoMercadoPagoAction`, que pasa el negocio actual.
- `estadoCobrosMP` aplica la misma regla que `configCobrosDesde`: primero la conexión, y el global sólo con
  `MP_MODO_LEGADO=1`.
- El test de `pagos-dispatch.test.ts` pasa. Cerrado.

**Lease y `maxDuration` (`e1cc40a`).**
- Las únicas rutas que pasan por el reclamo de `EventoIntegracion` son esas tres: se buscó todo importador de
  `entrada.server` y de `mercadopago-dispatch`.
- `api/webhooks/whatsapp` no usa el lease: deduplica por `wamid`.
- 120 s + 60 s ≤ 300 s, y lo vigila `entrada.test.ts`.
- `vercel.json` no pisa `maxDuration`. Cerrado.

**Arnés PGlite (`82fae3a`).**
- Borra todo `*DATABASE_URL` del entorno hijo y apunta a 127.0.0.1. Correcto.
- Resultado con el código final: certificación 5/6, conexiones 3/5, webhooks 3/5. Son los mismos números que
  declaró el ingeniero.
- **Contraprueba:** se exportó `origin/n2/p1-conexiones` (`eddd362`) a una carpeta temporal y se corrió el mismo
  script. Fallan **exactamente los mismos casos**:
  - ADV-dedupe;
  - P1-C1/C2/C6;
  - «handler que falla → reenvío»;
  - los dos P1-C5 de webhooks.
- La traza confirma el desfase de PGlite: Prisma recibe la fila de `set_config` en lugar de la de `findFirst`. Esta
  vuelta no los trae.

**tsc y suites sin base.**
- `tsc --noEmit`: 403 errores en archivos ajenos a P1 (faltan playwright, three, pdf-lib en el `node_modules`
  compartido). Hay **0** en la zona tocada (`src/app/api`, `src/integraciones`, `src/lib/pagos*`,
  `src/lib/mercadopago*`, `src/lib/webhooks`, `src/plugins/{mercadopago,whatsapp,arca}`).
- Suites de la zona: 242/244.
- Las 2 fallas son guardias estáticas (`redaccion.test.ts`, `contrato.test.ts`) que en Windows arman la ruta
  `C:\C:\…`. No corrieron sobre este diff. Se suplió a mano: el diff no agrega `console.*`, ni `verificarFirma`, ni
  `normalizar`, ni `responder` fuera de `contrato.ts`.

### Traspasos
- **Firma por negocio → S2: el traspaso hoy no tiene dónde caer.** `origin/n2/s2-paquete-gate2` (`1485e30`, cerrada)
  no tiene nada de esto: ni función `SECURITY DEFINER` ni ningún archivo de ruteo de integraciones. Ya se revisaron
  `prisma/pending-gate2/` y su README.
  - **No hace falta columna ni tabla.** Las columnas necesarias ya existen: `IntegracionConexion.conector`,
    `cuentaExterna`, `estado`, `updatedAt` y `Tenant.modules`. Ya existe también el índice único
    `(conector, cuentaExterna)`.
  - **Falta una función.** Si se quiere en la misma ventana del día D, hay que sumar
    `prisma/pending-gate2/N2_integraciones_ruteo.sql` como paso 6 bis, antes de la re-ejecución de `0001`:
    - `gsg_conexion_por_cuenta(p_conector text, p_cuenta text) RETURNS TABLE("tenantId" text, id text)`;
    - `gsg_conexiones_activas(p_conector text, p_tope int)` con `ORDER BY "updatedAt" DESC, id DESC LIMIT p_tope + 1`.
  - **Cómo se escriben las dos:**
    - `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public`.
    - El filtro es `estado IN ('conectada','con_problemas','requiere_reconectar')` y
      `p_conector = ANY(t."modules")`.
    - Se crean con dueño `neondb_owner`. Sirve porque `0001` no usa `FORCE ROW LEVEL SECURITY`.
    - Llevan `REVOKE ALL … FROM PUBLIC` y `GRANT EXECUTE … TO app_rls`.
    - No devuelven credenciales: el secreto de firma se sigue abriendo en la transacción de cada negocio candidato.
    - La reversa al pie es `DROP FUNCTION IF EXISTS` de las dos.
  - **Cambios en el paquete:**
    - una fila nueva en el README;
    - un caso nuevo en `paquete-gate2.test.ts` (existe, y `app_rls` ve sólo id y negocio);
    - `hayFuncion` en `schema-probe`, para que el código caiga al recorrido por negocio sin la función.
  - **Alternativa:** si no se reabre S2, el traspaso tiene que tener otro dueño, P5 o P6, que son las tandas que
    consumen el ruteo, y su propio Gate. «S2» solo, como está escrito, no lo cierra nadie.
  - **No bloquea el día D:** con el tope de 20 conexiones por conector el código actual alcanza para los negocios
    de hoy.
- **Propiedad del `phone_number_id` → P7-C2: existe y es el lugar correcto.**
  - El texto del plan dice: «Conectar WhatsApp pide `phone_number_id`, token y app secret y valida con una llamada
    de prueba».
  - Hay que precisar el criterio en el plan. La llamada tiene que ser `GET /{phone_number_id}` con el token cargado,
    y la conexión se crea sólo si responde 200 con ese mismo id.
  - Esa validación tiene que vivir en el servicio, en `crearConexion` o en un paso obligatorio previo, y no sólo en
    la pantalla. Si no, la CLI, la consola y el alta por OAuth la saltean.

### Observaciones (no bloquean)
1. **Las conexiones reusadas no son las más recientes.** Al reusar la fila, `createdAt` deja de significar «la más
   reciente». Lo usan `conexionDelNegocio` y `conexionesDelConector` (`conexiones.server.ts:410,454`). Hoy no tiene
   efecto: MP tiene una sola activa por negocio, y WA rutea por cuenta. Conviene ordenar por `updatedAt` cuando P6
   pase WA a `url-por-conexion`.
2. **Con dos reconexiones a la vez, el primer token ya nace muerto.** Igual que en la vuelta 2 para las altas, sólo
   resuelve el token de la última. Además, la reconexión rota el token de la URL. Las preferencias en vuelo creadas
   con el `notification_url` anterior pierden su aviso. No se pierde plata: el `conexionId` se conserva, así que
   `external_reference` sigue valiendo, y «Sincronizar MP» concilia. P5-C2 tiene que decidir si en la reconexión de
   la misma cuenta se conserva el token.
3. **El estado puede decir «conectado» aunque el cobro falle.** `estadoCobrosMP` dice «conectado» con la conexión
   presente aunque le falte el `access_token` o la KEK, y en ese caso el dispatch falla cerrado. Es sólo un texto de
   pantalla, para P7-C1.
4. **La reconexión reactiva una conexión `pausada`.** Hoy nadie la pausa. Que P7 decida si la pausa del operador
   tiene que resistir la reconexión.
5. **P6-C1 deja una sola WA por negocio.** Al pasar WA a `url-por-conexion`, el `unaPorNegocio` de `crearConexion`
   desconectaría la otra WA del mismo negocio. P6 tiene que decidir si un negocio puede tener dos números.

### Verificación pendiente con Postgres real (arnés con `ERP_TEST_PG_URL`, rol `app_rls`; nunca Neon)
- `node --import tsx --test --test-concurrency=1 src/integraciones/certificacion-p1-postgres.test.ts`: 6/6. En
  especial:
  - **ADV-dedupe**;
  - **ADV-C2**, que en PGlite falla 1 de cada 4 corridas;
  - y las aserciones de **ADV-reconexion-misma-cuenta** posteriores al rechazo de B.
- `node --import tsx --test --test-concurrency=1 src/integraciones/conexiones-postgres.test.ts`: 5/5. Ahí están el
  reenvío → dedupe y el «handler que falla → reenvío lo reclama una vez».
- `node --import tsx --test --test-concurrency=1 src/lib/webhooks/webhooks-por-conexion-postgres.test.ts`: 5/5. Son
  los dos P1-C5 con doble envío.
- **RLS:**
  - repetir CERT3-robo como `app_rls`: B no ve ni toca la fila de A, y el alta da `cuenta_en_uso` por el índice
    único, no por la búsqueda;
  - `node prisma/rls/check-rls-live.mjs` sobre la base del arnés: las 3 tablas E3 con policy.
- **Concurrencia real:** CERT3-cred y CERT3-mezcla contra Postgres de verdad (dos conexiones de pool). Tiene que
  quedar una sola fila por cuenta y una sola activa en MP, sin `40P01`.
- **Llevar al repo:** CERT3-robo y CERT3-cred como regresión en `certificacion-p1-postgres.test.ts`.
