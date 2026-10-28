Veredicto final: **CON OBSERVACIONES** — sin fallas alta/media; 1 falla baja abierta.

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
